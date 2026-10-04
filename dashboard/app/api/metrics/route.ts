import { getCachedSelectedMetrics, getSelectedMetrics } from "@/app/lib/api";
import { METRIC_NAMES, type MetricName } from "@/app/lib/types";
import { getLiveMetrics } from '@/lib/admin/live-metrics';
import { authorizeRequest } from '@/lib/auth';

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const knownMetrics = new Set<string>(METRIC_NAMES);

function validDate(value: string | null): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

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

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!validDate(from) || !validDate(to) || from > to) {
    return Response.json({ error: "from and to must be an ordered ISO date range" }, { status: 400 });
  }

  const refresh = url.searchParams.get("refresh") === "1";
  if (Date.parse(to) - Date.parse(from) > 365 * 86400000) {
    return Response.json({ error: 'Date windows are limited to one year.' }, { status: 400 });
  }
  const bundle = process.env.METRICS_SOURCE === 'postgres'
    ? await getLiveMetrics(requested as MetricName[], from, to)
    : refresh
    ? await getSelectedMetrics(requested as MetricName[], from, to)
    : await getCachedSelectedMetrics(requested as MetricName[], from, to);
  return Response.json(bundle, {
    headers: { "Cache-Control": refresh ? "private, no-store" : "private, max-age=30" },
  });
}
