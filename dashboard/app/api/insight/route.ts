import { getWeeklyInsight } from "@/app/lib/api";

export async function POST() {
  try {
    return Response.json(await getWeeklyInsight());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Weekly summary request failed" },
      { status: 502 },
    );
  }
}
