import { validMetricRange } from '@/lib/windows';
import { getSelectedMetrics } from "@/app/lib/api";
import { METRIC_NAMES, type MetricName } from "@/app/lib/types";
import { getLiveMetrics } from '@/lib/admin/live-metrics';
import { aggregateCache } from "@/lib/admin/cache";
import { authorizeRequest } from '@/lib/auth';

export const dynamic = "force-dynamic";

const knownMetrics = new Set<string>(METRIC_NAMES);

/**
 * Page-scoped AWS metric proxy. The browser asks for an explicit allowlisted
 * subset, keeping a page from serially loading unrelated aggregates.
 */
export async function GET(request: Request) {
  const access = authorizeRequest(request);
  if ('response' in access) return access.response;
  const url = new URL(request.url);
  const requested = [...new Set((url.searchParams.get("metrics") ?? "").split(",").filter(Boolean))];
  if (requested.length === 0 || requested.length > METRIC_NAMES.length) {
    return Response.json({ error: "metrics must contain one or more supported names" }, { status: 400 });
  }
  if (requested.some((metric) => !knownMetrics.has(metric))) {
    return Response.json({ error: "metrics contains an unsupported name" }, { status: 400 });
  }

  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!validMetricRange(from, to)) {
    return Response.json({ error: "from and to must be an ordered ISO date range (up to 61 days) or timestamp interval (up to 48 hours)" }, { status: 400 });
  }

  const refresh = url.searchParams.get("refresh") === "1";
  if (url.searchParams.has('w') && !['24h','7d','30d'].includes(url.searchParams.get('w')!)) return Response.json({error:'Invalid date window.'},{status:400});
  const source = from.includes('T') || process.env.METRICS_SOURCE === 'postgres' ? 'postgres' : 'aws';
  const loadMetric = async (metric: MetricName) => {
    try {
      return { metric, ...await aggregateCache.get(`metrics:v2:${source}:${access.session.role}:${metric}:${from}:${to}`, 60000, async () => {
        const result = source === 'postgres' ? await getLiveMetrics([metric], from, to) : await getSelectedMetrics([metric], from, to);
        if (result.errors[metric]) throw new Error(result.errors[metric]);
        return result.data[metric];
      }, refresh) };
    } catch { return { metric, error: 'The metric could not be loaded.' }; }
  };
  const parts = [];
  for (let i = 0; i < requested.length; i += 4) {
    parts.push(...await Promise.all((requested as MetricName[]).slice(i, i + 4).map(loadMetric)));
  }
  const bundle = {
    from, to,
    data: Object.fromEntries(parts.filter(p => !('error' in p)).map(p => [p.metric, 'value' in p ? p.value : undefined])),
    errors: Object.fromEntries(parts.filter(p => 'error' in p).map(p => [p.metric, 'error' in p ? p.error : undefined])),
    collectedAt: parts.flatMap(p => 'collectedAt' in p ? [p.collectedAt] : []).sort()[0] ?? new Date().toISOString(),
    collectedAtByMetric: Object.fromEntries(parts.flatMap(p => 'collectedAt' in p ? [[p.metric, p.collectedAt]] : [])),
  };
  return Response.json(bundle, {
    headers: { "Cache-Control": refresh ? "private, no-store" : "private, max-age=30, stale-while-revalidate=300" },
  });
}
