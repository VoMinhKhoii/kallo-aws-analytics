import { getWeeklyInsight } from "@/app/lib/api";
import { authorizeRequest } from "@/lib/auth";

export async function POST(request: Request) {
  const access = authorizeRequest(request, { role: "founder", sameOrigin: true });
  if ("response" in access) return access.response;

  try {
    return Response.json(await getWeeklyInsight());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Weekly summary request failed" },
      { status: 502 },
    );
  }
}
