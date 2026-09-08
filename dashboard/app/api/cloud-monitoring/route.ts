import { getCloudMonitoring } from "@/app/lib/api";

export const dynamic = "force-dynamic";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
    return Response.json({ error: "from and to must be an ordered ISO date range" }, { status: 400 });
  }
  try {
    const refresh = url.searchParams.get("refresh") === "1";
    const result = await getCloudMonitoring(from, to, refresh);
    return Response.json(result, { headers: { "Cache-Control": refresh ? "private, no-store" : "private, max-age=30" } });
  } catch (reason) {
    return Response.json({ error: reason instanceof Error ? reason.message : "Cloud Monitoring request failed" }, { status: 502 });
  }
}
