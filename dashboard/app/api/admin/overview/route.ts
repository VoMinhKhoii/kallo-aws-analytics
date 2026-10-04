import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/auth';
import { connectAdminDb } from '@/lib/admin/db/client';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const access = authorizeRequest(request);
  if ('response' in access) return access.response;
  const days = z.enum(['7', '30', '90']).safeParse(new URL(request.url).searchParams.get('days') || '30');
  if (!days.success) return Response.json({ error: 'Invalid date window.' }, { status: 400 });
  const connection = connectAdminDb();
  try {
    const db = connection.db;
    const today = new Date().toISOString().slice(0, 10);
    const start = sql`((${today}::date - (${Number(days.data)} - 1))::timestamp AT TIME ZONE 'UTC')`;
    const end = sql`((${today}::date + 1)::timestamp AT TIME ZONE 'UTC')`;
    const [summary] = await db.execute(sql`SELECT
      (SELECT count(*)::int FROM auth.users) AS accounts,
      (SELECT count(*)::int FROM auth.users WHERE created_at >= ${start} AND created_at < ${end}) AS signups,
      (SELECT count(*)::int FROM public.user_feedback WHERE status = 'open') AS open_feedback,
      count(*)::int AS requests,
      count(*) FILTER (WHERE status = 'error')::int AS errors,
      percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms
      FROM public.pipeline_requests WHERE created_at >= ${start} AND created_at < ${end} AND replay_of_request_id IS NULL`);
    const trend = await db.execute(sql`WITH dates AS (SELECT generate_series((${today}::date - (${Number(days.data)} - 1))::timestamp, ${today}::date::timestamp, interval '1 day') AS day)
      SELECT to_char(d.day, 'YYYY-MM-DD') AS date, count(r.id)::int AS requests,
      count(r.id) FILTER (WHERE r.status = 'error')::int AS errors
      FROM dates d LEFT JOIN public.pipeline_requests r ON r.created_at >= d.day AT TIME ZONE 'UTC' AND r.created_at < (d.day + interval '1 day') AT TIME ZONE 'UTC' AND r.replay_of_request_id IS NULL
      GROUP BY d.day ORDER BY d.day`);
    return Response.json({ summary, trend }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'Production overview could not be loaded.' }, { status: 502 }); }
  finally { await connection.close(); }
}
