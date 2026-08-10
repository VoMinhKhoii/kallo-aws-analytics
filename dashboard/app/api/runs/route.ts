import { startRun } from "@/app/lib/api";

export async function POST() {
  try {
    return Response.json(await startRun(), { status: 202 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Pipeline run could not be started" },
      { status: 502 },
    );
  }
}
