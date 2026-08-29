import { getMetric } from "@/app/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const to = new Date().toISOString().slice(0, 10);
  try {
    await getMetric("dau_wau", "2000-01-01", to);
    return Response.json({ ok: true, authMode: "aws" });
  } catch (error) {
    return Response.json(
      { ok: false, reason: error instanceof Error ? error.message : "AWS analytics API check failed" },
      { status: 200 },
    );
  }
}
