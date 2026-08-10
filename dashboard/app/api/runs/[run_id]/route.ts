import { getRun } from "@/app/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ run_id: string }> },
) {
  try {
    const { run_id } = await params;
    return Response.json(await getRun(run_id));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Pipeline status could not be loaded" },
      { status: 502 },
    );
  }
}
