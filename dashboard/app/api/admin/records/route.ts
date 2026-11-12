import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/auth';
import { connectAdminDb } from '@/lib/admin/db/client';
export const dynamic = 'force-dynamic';
const filters = z.object({ kind: z.enum(['requests', 'feedback']), page: z.coerce.number().int().min(1).max(10000).default(1), status: z.string().max(20).default('all'), type: z.enum(['all', 'bug', 'ingredient', 'idea']).default('all'), id: z.string().uuid().optional(), summary: z.literal('1').optional() });
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: Request) {
  const access = authorizeRequest(request, { role: 'founder' });
  if ('response' in access) return access.response;
  const parsed = filters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return json({ error: 'Invalid filters.' }, 400);
  const { kind, page, status, type, id, summary } = parsed.data;
  const allowed = kind === 'requests' ? ['all', 'success', 'error', 'pending'] : ['all', 'open', 'triaged', 'resolved', 'wontfix'];
  if (!allowed.includes(status)) return json({ error: 'Invalid status.' }, 400);
  const connection = connectAdminDb();
  try {
    const db = connection.db;
    if (kind === 'requests' && id) {
      const [row] = await db.execute(sql`SELECT id, left(raw_input, 4000) AS input, status, duration_ms, created_at FROM public.pipeline_requests WHERE id = ${id}::uuid`);
      if (!row) return json({ error: 'Request not found.' }, 404);
      const stages = await db.execute(sql`SELECT stage, status, duration_ms, created_at FROM public.pipeline_stage_logs WHERE request_id = ${id}::uuid ORDER BY created_at LIMIT 50`);
      const calls = await db.execute(sql`SELECT model, latency_ms, input_tokens, output_tokens, attempt FROM public.pipeline_llm_calls WHERE request_id = ${id}::uuid ORDER BY created_at LIMIT 30`);
      return json({ row, stages, calls });
    }
    if (kind === 'feedback' && summary) return json(await feedbackSummary(db));
    if (kind === 'feedback' && id) {
      // The submitter's email saves a separate account lookup during triage.
      const [row] = await db.execute(sql`SELECT f.id, f.user_id, u.email, f.type, f.status, f.message, f.platform, f.locale, f.app_version, f.route, f.metadata,
          f.screenshot_path IS NOT NULL AS has_screenshot, f.created_at, f.updated_at
        FROM public.user_feedback f LEFT JOIN auth.users u ON u.id = f.user_id WHERE f.id = ${id}::uuid`);
      return row ? json({ row }) : json({ error: 'Feedback not found.' }, 404);
    }
    const where = kind === 'requests' ? sql`replay_of_request_id IS NULL AND (${status} = 'all' OR status = ${status})` : sql`(${status} = 'all' OR status = ${status}) AND (${type} = 'all' OR type = ${type})`;
    const table = kind === 'requests' ? sql`public.pipeline_requests` : sql`public.user_feedback`;
    const columns = kind === 'requests' ? sql`id, left(raw_input, 200) AS message, status, duration_ms, created_at` : sql`id, type, status, left(message, 4000) AS message, platform, locale, screenshot_path IS NOT NULL AS has_screenshot, created_at`;
    const rows = await db.execute(sql`SELECT ${columns} FROM ${table} WHERE ${where} ORDER BY created_at DESC LIMIT 30 OFFSET ${(page - 1) * 30}`);
    const [count] = await db.execute(sql`SELECT count(*)::int AS total FROM ${table} WHERE ${where}`);
    return json({ rows, total: count.total });
  } catch { return json({ error: 'Records could not be loaded.' }, 502); }
  finally { await connection.close(); }
}

export async function POST(request: Request) {
  const access = authorizeRequest(request, { role: 'founder', sameOrigin: true });
  if ('response' in access) return access.response;
  const text = await request.text();
  if (text.length > 2048) return json({ error: 'Request too large.' }, 413);
  let body;
  try { body = z.object({ id: z.string().uuid(), status: z.enum(['open', 'triaged', 'resolved', 'wontfix']) }).parse(JSON.parse(text)); }
  catch { return json({ error: 'Invalid feedback update.' }, 400); }
  const connection = connectAdminDb();
  try {
    const rows = await connection.db.execute(sql`UPDATE public.user_feedback SET status = ${body.status}, updated_at = now() WHERE id = ${body.id}::uuid RETURNING id`);
    return rows.length ? json({ ok: true }) : json({ error: 'Feedback not found.' }, 404);
  } catch { return json({ error: 'Feedback update failed.' }, 502); }
  finally { await connection.close(); }
}

/** Feedback headline numbers and the last 30 UTC days: reports received by type, and closed. */
async function feedbackSummary(db: ReturnType<typeof connectAdminDb>['db']) {
  const [counts] = await db.execute(sql`SELECT
      count(*) FILTER (WHERE status = 'open')::int AS open,
      count(*) FILTER (WHERE status = 'open' AND created_at < now() - interval '48 hours')::int AS open_over_48h,
      count(*) FILTER (WHERE created_at >= (current_date - 29)::timestamp AT TIME ZONE 'UTC')::int AS received,
      count(*) FILTER (WHERE status IN ('resolved', 'wontfix') AND updated_at >= (current_date - 29)::timestamp AT TIME ZONE 'UTC')::int AS closed
    FROM public.user_feedback`);
  const daily = await db.execute(sql`WITH days AS (SELECT generate_series(current_date - 29, current_date, interval '1 day')::date AS d)
    SELECT to_char(d, 'YYYY-MM-DD') AS date,
      count(f.id) FILTER (WHERE f.type = 'bug')::int AS bug,
      count(f.id) FILTER (WHERE f.type = 'ingredient')::int AS ingredient,
      count(f.id) FILTER (WHERE f.type = 'idea')::int AS idea,
      (SELECT count(*)::int FROM public.user_feedback c WHERE c.status IN ('resolved', 'wontfix') AND c.updated_at >= (d::timestamp AT TIME ZONE 'UTC') AND c.updated_at < ((d + 1)::timestamp AT TIME ZONE 'UTC')) AS closed
    FROM days LEFT JOIN public.user_feedback f ON f.created_at >= (d::timestamp AT TIME ZONE 'UTC') AND f.created_at < ((d + 1)::timestamp AT TIME ZONE 'UTC')
    GROUP BY d ORDER BY d`);
  return { counts, daily };
}
