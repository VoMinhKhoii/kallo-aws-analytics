import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../admin/db/client';
import { aggregateCache } from '../admin/cache';
import type { TraceList, TraceSummary } from './types';
const date = z.iso.date();
export const traceFilters = z.object({
  from: date, to: date, status: z.enum(['all', 'pending', 'success', 'error']).default('all'),
  q: z.string().max(160).default(''), limit: z.coerce.number().int().min(1).max(50).default(25), cursor: z.string().max(2048).optional(),
}).refine(v => v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000);
export type TraceFilters = z.infer<typeof traceFilters>;
const position = z.object({ at: z.string().datetime({ offset: true }), id: z.string().uuid(), filters: z.string() });
function filterKey(f: TraceFilters) { return JSON.stringify([f.from, f.to, f.status, f.q]); }
export function encodeCursor(at: string, id: string, f: TraceFilters, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ at, id, filters: filterKey(f) })).toString('base64url');
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
export function listQuery(f: TraceFilters, columns: Set<string>, after?: { at: string; id: string }) {
  const col = (name: string) => columns.has(name) ? sql`r.${sql.identifier(name)}` : sql`NULL::${sql.raw(name === 'models' ? 'text[]' : name === 'item_count' ? 'integer' : ['calories_kcal','protein_g','carbohydrate_g','fat_g'].includes(name) ? 'numeric' : 'text')}`;
  const escaped = '%' + f.q.replace(/[\\%_]/g, '\\$&') + '%';
  const optionalNames = ['meal_name','model_profile','models','calories_kcal','protein_g','carbohydrate_g','fat_g','item_count','error_code'];
  return sql`WITH page AS MATERIALIZED (
    SELECT r.id,r.created_at,r.status,r.duration_ms,r.raw_input,
      ${sql.join(optionalNames.map(name => sql`${col(name)} AS ${sql.identifier(name)}`), sql`, `)}
    FROM public.pipeline_requests r
    WHERE r.created_at >= ${f.from}::date::timestamp AT TIME ZONE 'UTC'
      AND r.created_at < (${f.to}::date + 1)::timestamp AT TIME ZONE 'UTC'
      AND (${f.status}='all' OR r.status=${f.status})
      AND (${f.q}='' OR r.raw_input ILIKE ${escaped} OR ${col('meal_name')} ILIKE ${escaped})
      ${after ? sql`AND (r.created_at,r.id) < (${after.at}::timestamptz,${after.id}::uuid)` : sql``}
    ORDER BY r.created_at DESC,r.id DESC LIMIT ${f.limit + 1}
  ), billed AS MATERIALIZED (
    SELECT e.request_id,count(*)::int AS calls,sum(e.cost_usd) AS cost_usd,
      array_agg(DISTINCT e.model) FILTER (WHERE e.model IS NOT NULL) AS models
    FROM public.analysis_model_budget_events e JOIN page p ON e.request_id=p.id::text
    WHERE e.request_count=0 GROUP BY e.request_id
  )
  SELECT r.id::text,to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
    r.status,r.duration_ms,left(r.raw_input,384) AS raw_input,
    coalesce(r.meal_name,left(r.raw_input,160)) AS meal_name,r.model_profile,
    coalesce(r.models,b.models,ARRAY[]::text[]) AS models,
    coalesce(r.calories_kcal,(a.result #>> '{displayedNutrition,caloriesKcal}')::numeric) AS calories_kcal,
    coalesce(r.protein_g,(a.result #>> '{displayedNutrition,proteinG}')::numeric) AS protein_g,
    coalesce(r.carbohydrate_g,(a.result #>> '{displayedNutrition,carbohydrateG}')::numeric) AS carbohydrate_g,
    coalesce(r.fat_g,(a.result #>> '{displayedNutrition,fatG}')::numeric) AS fat_g,
    coalesce(r.item_count,jsonb_array_length(a.result->'mealItems')) AS item_count,
    r.error_code,coalesce(b.calls,0) AS calls,b.cost_usd
  FROM page r LEFT JOIN billed b ON b.request_id=r.id::text
    LEFT JOIN LATERAL (SELECT s.output_json->'result' AS result FROM public.pipeline_stage_logs s
      WHERE s.request_id=r.id AND s.stage='assembly'
        AND (r.calories_kcal IS NULL OR r.protein_g IS NULL OR r.carbohydrate_g IS NULL OR r.fat_g IS NULL OR r.item_count IS NULL)
      ORDER BY s.created_at DESC LIMIT 1) a ON true
  ORDER BY r.created_at DESC,r.id DESC`;

}
export function numberOrNull(v: unknown): number | null { return v == null || !Number.isFinite(Number(v)) ? null : Number(v); }
export async function listTraces(db: AppDb, f: TraceFilters, secret: string): Promise<TraceList> {
  const after = f.cursor ? decodeCursor(f.cursor, f, secret) : undefined;
  const rows = await db.execute(listQuery(f, await requestColumns(db), after));
  const items: TraceSummary[] = rows.slice(0, f.limit).map(r => ({
    id: String(r.id), createdAt: new Date(String(r.created_at)).toISOString(), status: String(r.status),
    durationMs: numberOrNull(r.duration_ms), rawInput: String(r.raw_input), mealName: String(r.meal_name),
    profile: r.model_profile == null ? null : String(r.model_profile), models: r.models as string[],
    kcal: numberOrNull(r.calories_kcal), protein: numberOrNull(r.protein_g), carbs: numberOrNull(r.carbohydrate_g),
    fat: numberOrNull(r.fat_g), itemCount: numberOrNull(r.item_count), errorCode: r.error_code == null ? null : String(r.error_code),
    calls: Number(r.calls || 0), costUsd: numberOrNull(r.cost_usd),
  }));
  // Keep Postgres's full microsecond timestamp in the cursor, not JS's millisecond conversion.
  const last = rows[Math.min(rows.length, f.limit) - 1];
  return { items, nextCursor: rows.length > f.limit && last ? encodeCursor(String(last.created_at).replace(' ', 'T'), String(last.id), f, secret) : null, retentionDays: 7 };
}
