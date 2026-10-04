import { getCloudMonitoring } from "@/app/lib/api";
import { getDirectMonitoring } from '@/lib/admin/cloud-monitoring';
import { authorizeRequest } from '@/lib/auth';

export const dynamic = "force-dynamic";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const access = authorizeRequest(request);
  if ('response' in access) return access.response;
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const validDate = (value: string) => ISO_DATE.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  if (!validDate(from) || !validDate(to) || from > to || Date.parse(to) - Date.parse(from) > 90 * 86400000) {
    return Response.json({ error: "from and to must be an ordered ISO date range" }, { status: 400 });
  }
  try {
    const refresh = url.searchParams.get("refresh") === "1";
    const result = process.env.METRICS_SOURCE === 'postgres'
      ? await getDirectMonitoring(from, to, refresh)
      : await getCloudMonitoring(from, to, refresh);
    return Response.json(result, { headers: { "Cache-Control": refresh ? "private, no-store" : "private, max-age=30" } });
  } catch (reason) {
    return Response.json({ error: reason instanceof Error ? reason.message : "Cloud Monitoring request failed" }, { status: 502 });
  }
}
