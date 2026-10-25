import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../admin/db/client';
import { aggregateCache } from '../admin/cache';
import type { TraceList, TraceSummary } from './types';
const date = z.iso.date();
export const traceFilters = z.object({
  from: date.optional(), to: date.optional(), w: z.enum(['24h','7d','30d']).optional(),
  model: z.string().max(160).default(''), flags: z.string().max(100).default('').refine(v => v.split(',').filter(Boolean).every(f => ['chunked','rescue','fallback','retried','unmatched'].includes(f))), status: z.enum(['all', 'pending', 'success', 'error']).default('all'),
  q: z.string().max(160).default(''), user: z.union([z.string().uuid(), z.literal('')]).default(''), limit: z.coerce.number().int().min(1).max(50).default(25), cursor: z.string().max(2048).optional(),
}).transform(v => {
  const to = v.to || new Date().toISOString().slice(0,10);
  const from = v.from || new Date(Date.parse(to) - ((v.w === '30d' ? 30 : v.w === '7d' ? 7 : 1)-1)*86400000).toISOString().slice(0,10);
  return {...v, from, to};
}).refine(v => v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000);
export type TraceFilters = z.infer<typeof traceFilters>;
const position = z.object({ at: z.string().datetime({ offset: true }), id: z.string().uuid(), filters: z.string(), windowAt: z.string().datetime({offset:true}).optional() });
function filterKey(f: TraceFilters) { return JSON.stringify([f.w ? null : f.from, f.w ? null : f.to, f.status, f.q, f.model, f.flags, f.w, f.user]); }
export function encodeCursor(at: string, id: string, f: TraceFilters, secret: string, windowAt = new Date().toISOString()): string {
  const payload = Buffer.from(JSON.stringify({ at, id, filters: filterKey(f), windowAt })).toString('base64url');
  return payload + '.' + createHmac('sha256', secret).update('traces:v1:' + payload).digest('base64url');
}
export function decodeCursor(cursor: string, f: TraceFilters, secret: string) {
  const [payload, signature, extra] = cursor.split('.');
  if (!payload || !signature || extra) throw new Error('Invalid cursor');
  const expected = createHmac('sha256', secret).update('traces:v1:' + payload).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('Invalid cursor');
  const value = position.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
  if (value.filters !== filterKey(f)) throw new Error('Invalid cursor');
  return value;
}
export async function requestColumns(db: AppDb): Promise<Set<string>> {
  return (await aggregateCache.get('trace-columns:v1:' + (process.env.DATABASE_URL || 'local'), 900000, async () => {
    const rows = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='pipeline_requests'`);
    return new Set(rows.map(r => String(r.column_name)));
  })).value;
}
export function listQuery(f: TraceFilters, columns: Set<string>, after?: { at: string; id: string }, windowAt = new Date().toISOString(), ids?: string[]) {
  const col = (name: string) => columns.has(name) ? sql`r.${sql.identifier(name)}` : sql`NULL::${sql.raw(name === 'models' ? 'text[]' : name === 'item_count' ? 'integer' : ['calories_kcal','protein_g','carbohydrate_g','fat_g'].includes(name) ? 'numeric' : 'text')}`;
  const escaped = '%' + f.q.replace(/[\\%_]/g, '\\$&') + '%';
  const optionalNames = ['meal_name','model_profile','models','calories_kcal','protein_g','carbohydrate_g','fat_g','item_count','error_code'];
  return sql`WITH enriched AS (
    SELECT r.*, to_jsonb(pr) AS run, coalesce(b.calls,0) AS attempts, b.cost_usd, b.attempt_models,s.derived_items,
      coalesce(b.fallbacks,0) AS fallbacks, coalesce(b.retries,0) AS retries,
      coalesce(s.chunk_count,b.chunks,0) AS chunk_count,
      coalesce(s.rescue_count,b.rescues,0) AS rescue_count,
      coalesce((to_jsonb(pr)->>'ingredient_count')::int,s.ingredients,0) AS ingredients,
      coalesce((to_jsonb(pr)->>'unmatched_count')::int,s.unmatched,0) AS unmatched
    FROM public.pipeline_requests r
    LEFT JOIN LATERAL (SELECT p.* FROM public.pipeline_runs p WHERE p.request_id=r.id::text ORDER BY p.created_at DESC LIMIT 1) pr ON true
    LEFT JOIN LATERAL (SELECT count(*)::int AS calls,
      CASE WHEN count(cost_usd)=count(*) THEN sum(cost_usd) END AS cost_usd,
      array_agg(DISTINCT model) FILTER (WHERE model IS NOT NULL) AS attempt_models,
      count(*) FILTER (WHERE fallback_from IS NOT NULL)::int AS fallbacks,
      nullif(count(*) FILTER (WHERE to_jsonb(e)->>'call_role'='call2_chunk'),0)::int AS chunks,
      nullif(count(*) FILTER (WHERE to_jsonb(e)->>'call_role'='rescue_call1'),0)::int AS rescues,
      count(*) FILTER (WHERE error_category IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.analysis_model_budget_events later WHERE later.request_id=e.request_id
          AND later.request_count=0 AND (later.model=e.model OR later.fallback_from=e.model)
          AND (to_jsonb(e)->>'call_role' IS NULL OR to_jsonb(e)->>'call_role'=to_jsonb(later)->>'call_role') AND (later.created_at,later.id)>(e.created_at,e.id)))::int AS retries
      FROM public.analysis_model_budget_events e WHERE e.request_id=r.id::text AND e.request_count=0) b ON true
    LEFT JOIN LATERAL (SELECT max((output_json->>'chunkCount')::int) FILTER (WHERE stage='nutrition') AS chunk_count,
      max(coalesce((output_json->>'rescueCount')::int,(output_json->>'rescuedCount')::int)) AS rescue_count,
      coalesce(max((input_json->>'ingredientCount')::int),max(CASE
        WHEN stage='decomposition' AND jsonb_typeof(output_json->'mealItems')='array'
        THEN (SELECT sum(CASE WHEN jsonb_typeof(item->'ingredients')='array' THEN jsonb_array_length(item->'ingredients') ELSE 0 END)::int
          FROM jsonb_array_elements(output_json->'mealItems') item) END)) AS ingredients,
      max(CASE WHEN stage='decomposition' AND jsonb_typeof(output_json->'mealItems')='array'
        THEN jsonb_array_length(output_json->'mealItems') END) AS derived_items,
      max((input_json->>'unmatchedCount')::int) AS unmatched
      FROM public.pipeline_stage_logs WHERE request_id=r.id) s ON true
    WHERE ${ids ? sql`r.id IN (${sql.join(ids.map(id=>sql`${id}::uuid`),sql`, `)}) AND` : sql``} ${f.user ? sql`r.user_id = ${f.user}::uuid AND` : sql``} ${columns.has('replay_of_request_id') ? sql`r.replay_of_request_id IS NULL` : sql`true`}
      AND r.created_at >= ${f.w ? sql`${windowAt}::timestamptz - ${f.w === '24h' ? '24 hours' : f.w === '7d' ? '7 days' : '30 days'}::interval` : sql`${f.from}::date::timestamp AT TIME ZONE 'UTC'`}
      AND r.created_at < ${f.w ? sql`${windowAt}::timestamptz` : sql`(${f.to}::date + 1)::timestamp AT TIME ZONE 'UTC'`}
  ), page AS MATERIALIZED (
    SELECT r.id,r.created_at,r.status,r.duration_ms,r.raw_input,r.error AS request_error,r.run,r.derived_items,r.attempts,r.cost_usd,r.attempt_models,r.fallbacks,r.retries,r.chunk_count,r.rescue_count,r.ingredients,r.unmatched,
      ${sql.join(optionalNames.map(name => sql`${col(name)} AS ${sql.identifier(name)}`), sql`, `)}
    FROM enriched r
    WHERE (${f.model}='' OR r.run->>'model_call2'=${f.model})
      ${sql.join(f.flags.split(',').filter(Boolean).map(flag => sql`AND ${sql.raw(({chunked:'r.chunk_count > 1',rescue:'r.rescue_count > 0',fallback:'r.fallbacks > 0',retried:'r.retries > 0',unmatched:'r.unmatched > 0'} as Record<string,string>)[flag])}`), sql` `)}
      AND (${f.status}='all' OR r.status=${f.status})
      AND (${f.q}='' OR r.raw_input ILIKE ${escaped} OR ${col('meal_name')} ILIKE ${escaped})
      ${after ? sql`AND (r.created_at,r.id) < (${after.at}::timestamptz,${after.id}::uuid)` : sql``}
    ORDER BY r.created_at DESC,r.id DESC LIMIT ${f.limit + 1}
  )
  SELECT r.id::text,to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
    r.status,r.duration_ms,left(r.raw_input,384) AS raw_input,
    coalesce(r.meal_name,left(r.raw_input,160)) AS meal_name,r.model_profile,
    coalesce(r.models,r.attempt_models,ARRAY[]::text[]) AS models,
    coalesce(r.calories_kcal,(a.result #>> '{boundedNutrition,caloriesKcal,mid}')::numeric,(a.result #>> '{boundedNutrition,kcal,mid}')::numeric,(a.result #>> '{displayedNutrition,caloriesKcal}')::numeric) AS calories_kcal,
    coalesce(r.protein_g,(a.result #>> '{displayedNutrition,proteinG}')::numeric) AS protein_g,
    coalesce(r.carbohydrate_g,(a.result #>> '{displayedNutrition,carbohydrateG}')::numeric) AS carbohydrate_g,
    coalesce(r.fat_g,(a.result #>> '{displayedNutrition,fatG}')::numeric) AS fat_g,
    coalesce(r.item_count,jsonb_array_length(a.result->'mealItems'),r.derived_items) AS item_count,
    coalesce(r.error_code,r.request_error) AS error_code,r.attempts AS calls,r.cost_usd,r.run->>'model_call1' AS model_call1,r.run->>'model_call2' AS model_call2,
    r.ingredients,r.unmatched,r.chunk_count,r.rescue_count,r.fallbacks,r.retries
  FROM page r
    LEFT JOIN LATERAL (SELECT s.output_json->'result' AS result FROM public.pipeline_stage_logs s
      WHERE s.request_id=r.id AND s.stage='assembly'
        AND (r.calories_kcal IS NULL OR r.protein_g IS NULL OR r.carbohydrate_g IS NULL OR r.fat_g IS NULL OR r.item_count IS NULL)
      ORDER BY s.created_at DESC LIMIT 1) a ON true
  ORDER BY r.created_at DESC,r.id DESC`;

}
export function numberOrNull(v: unknown): number | null { return v == null || !Number.isFinite(Number(v)) ? null : Number(v); }
export async function listTraces(db: AppDb, f: TraceFilters, secret: string, ids?: string[]): Promise<TraceList> {
  const after = f.cursor ? decodeCursor(f.cursor, f, secret) : undefined;
  const windowAt = after?.windowAt || new Date().toISOString();
  const rows = await db.execute(listQuery(f, await requestColumns(db), after, windowAt, ids));
  const items: TraceSummary[] = rows.slice(0, f.limit).map(r => ({
    id: String(r.id), createdAt: new Date(String(r.created_at)).toISOString(), status: String(r.status),
    durationMs: numberOrNull(r.duration_ms), rawInput: String(r.raw_input), mealName: String(r.meal_name),
    profile: r.model_profile == null ? null : String(r.model_profile), models: r.models as string[],
    kcal: numberOrNull(r.calories_kcal), protein: numberOrNull(r.protein_g), carbs: numberOrNull(r.carbohydrate_g),
    fat: numberOrNull(r.fat_g), itemCount: numberOrNull(r.item_count), errorCode: r.error_code == null ? null : String(r.error_code),
    modelCall1: r.model_call1 == null ? null : String(r.model_call1), modelCall2: r.model_call2 == null ? null : String(r.model_call2),
    ingredients: Number(r.ingredients), unmatched: Number(r.unmatched), attempts: Number(r.calls), chunkCount: Number(r.chunk_count), rescueCount: Number(r.rescue_count), fallbacks: Number(r.fallbacks), retries: Number(r.retries), kcalMid: numberOrNull(r.calories_kcal), items: numberOrNull(r.item_count), error: r.error_code == null ? null : String(r.error_code),
    calls: Number(r.calls || 0), costUsd: numberOrNull(r.cost_usd),
  }));
  // Keep Postgres's full microsecond timestamp in the cursor, not JS's millisecond conversion.
  const last = rows[Math.min(rows.length, f.limit) - 1];
  const nextCursor = rows.length > f.limit && last ? encodeCursor(String(last.created_at).replace(' ', 'T'), String(last.id), f, secret, windowAt) : null;
  return { items, rows: items, nextCursor, next: nextCursor, retentionDays: 7 };
}
