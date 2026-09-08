import { startRun } from "@/app/lib/api";
import { authorizeRequest } from "@/lib/auth";

export async function POST(request: Request) {
  const access = authorizeRequest(request, { role: "founder", sameOrigin: true });
  if ("response" in access) return access.response;

  try {
    return Response.json(await startRun(), { status: 202 });
  } catch (error) {
    const upstream = error as Error & {
      status?: number;
      code?: string;
      retryAfter?: string;
      nextAllowedAt?: string;
    };
    const status = typeof upstream.status === "number" && upstream.status >= 400 && upstream.status <= 599
      ? upstream.status
      : 502;
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (upstream.retryAfter) headers.set("Retry-After", upstream.retryAfter);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Pipeline run could not be started",
        ...(upstream.code ? { code: upstream.code } : {}),
        ...(upstream.retryAfter ? { retry_after: Number(upstream.retryAfter) || upstream.retryAfter } : {}),
        ...(upstream.nextAllowedAt ? { next_allowed_at: upstream.nextAllowedAt } : {}),
      },
      { status, headers },
    );
  }
}
