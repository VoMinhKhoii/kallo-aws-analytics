import 'server-only';
import { sql } from 'drizzle-orm';
import type { AppDb } from './db/client';

// The meal pipeline's health, as Kallo's in-app /admin/health showed it, with
// the dashboard's own rules: replays are left out, and rejected non-meal input
// is not a failure (Overview's error rate). pipeline_requests is reaped after
// 7 days, so no window here reaches further back than that.
export interface PipelineHealth {
  success: { window: '24h' | '7d'; succeeded: number; failed: number; rate: number | null }[];
  latency24h: { p50: number | null; p95: number | null; p99: number | null; runs: number };
  topErrors: { code: string; count: number; lastSeen: string; sample: string | null }[];
  retentionDays: 7;
}

const notReplay = sql`to_jsonb(r)->>'replay_of_request_id' IS NULL`;
const notNonFood = sql`to_jsonb(r)->>'error_code' IS DISTINCT FROM 'non_food_input'`;

export async function loadPipelineHealth(db: AppDb): Promise<PipelineHealth> {
  const [success, latency, errors] = await Promise.all([
    db.execute(sql`SELECT w.label,
        count(r.*) FILTER (WHERE r.status = 'success')::int AS succeeded,
        count(r.*) FILTER (WHERE r.status = 'error' AND ${notNonFood})::int AS failed
      FROM (VALUES ('24h', now() - interval '24 hours'), ('7d', now() - interval '7 days')) AS w(label, since)
      LEFT JOIN public.pipeline_requests r ON r.created_at >= w.since AND ${notReplay}
      GROUP BY w.label ORDER BY min(w.since) DESC`),
    // pipeline_runs.total_ms is Overview's p95 source too.
    db.execute(sql`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms) AS p50, percentile_cont(0.95) WITHIN GROUP (ORDER BY total_ms) AS p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY total_ms) AS p99, count(*)::int AS runs
      FROM public.pipeline_runs run WHERE created_at >= now() - interval '24 hours' AND total_ms IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.pipeline_requests r WHERE r.id::text = to_jsonb(run)->>'request_id' AND NOT (${notReplay}))`),
    db.execute(sql`SELECT coalesce(to_jsonb(r)->>'error_code', 'uncoded') AS code, count(*)::int AS n,
        to_char(max(r.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_seen,
        (array_agg(left(r.error, 300) ORDER BY r.created_at DESC) FILTER (WHERE r.error IS NOT NULL))[1] AS sample
      FROM public.pipeline_requests r WHERE r.status = 'error' AND r.created_at >= now() - interval '7 days' AND ${notReplay}
      GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 10`),
  ]);
  const num = (v: unknown) => v == null ? null : Number(v);
  const [l] = latency;
  return {
    success: success.map(r => { const ok = Number(r.succeeded), bad = Number(r.failed); return { window: String(r.label) as '24h' | '7d', succeeded: ok, failed: bad, rate: ok + bad ? ok / (ok + bad) : null }; }),
    latency24h: { p50: num(l?.p50), p95: num(l?.p95), p99: num(l?.p99), runs: Number(l?.runs ?? 0) },
    topErrors: errors.map(r => ({ code: String(r.code), count: Number(r.n), lastSeen: String(r.last_seen), sample: r.sample == null ? null : String(r.sample) })),
    retentionDays: 7,
  };
}
