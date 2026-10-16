import { validMetricRange } from '@/lib/windows';
import { getCloudMonitoring } from "@/app/lib/api";
import { getDirectMonitoring } from '@/lib/admin/cloud-monitoring';
import { authorizeRequest } from '@/lib/auth';

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = authorizeRequest(request);
  if ('response' in access) return access.response;
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  if (!validMetricRange(from, to, 30) || url.searchParams.has('w') && !['24h','7d','30d'].includes(url.searchParams.get('w')!)) {
    return Response.json({ error: "from and to must be an ordered ISO date range" }, { status: 400 });
  }
  try {
    const refresh = url.searchParams.get("refresh") === "1";
    const result = from.includes('T') || process.env.METRICS_SOURCE === 'postgres'
      ? await getDirectMonitoring(from, to, refresh, access.session.role)
      : await getCloudMonitoring(from, to, refresh);
    return Response.json(result, { headers: { "Cache-Control": refresh ? "private, no-store" : "private, max-age=30" } });
  } catch (reason) {
    return Response.json({ error: reason instanceof Error ? reason.message : "Cloud Monitoring request failed" }, { status: 502 });
  }
}
