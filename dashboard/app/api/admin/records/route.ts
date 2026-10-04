import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/auth';
import { connectAdminDb } from '@/lib/admin/db/client';
export const dynamic = 'force-dynamic';
const filters = z.object({ kind: z.enum(['requests', 'feedback']), page: z.coerce.number().int().min(1).max(10000).default(1), status: z.string().max(20).default('all'), id: z.string().uuid().optional() });
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: Request) {
  const access = authorizeRequest(request, { role: 'founder' });
  if ('response' in access) return access.response;
  const parsed = filters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return json({ error: 'Invalid filters.' }, 400);
  const { kind, page, status, id } = parsed.data;
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
    const where = kind === 'requests' ? sql`replay_of_request_id IS NULL AND (${status} = 'all' OR status = ${status})` : sql`(${status} = 'all' OR status = ${status})`;
    const table = kind === 'requests' ? sql`public.pipeline_requests` : sql`public.user_feedback`;
    const columns = kind === 'requests' ? sql`id, left(raw_input, 200) AS message, status, duration_ms, created_at` : sql`id, type, status, left(message, 4000) AS message, platform, locale, created_at`;
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
