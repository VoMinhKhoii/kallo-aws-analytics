import { NextResponse } from "next/server";
import {
  AnalyticsError, authMode, cacheStats, configProblem, isLive, isRange, isRpcName, paging, query, type RpcName,
} from "@/lib/analytics-source";

export const dynamic = "force-dynamic";

/** Extra scalar params each RPC accepts, beyond range and paging. */
const EXTRA: Partial<Record<RpcName, { key: string; param: string; kind: "text" | "int" }[]>> = {
  overturnPool: [
    { key: "q", param: "p_query", kind: "text" },
    { key: "rank", param: "p_rank", kind: "int" },
  ],
  corpusQueries: [{ key: "fcid", param: "p_fcid", kind: "text" }],
  poolNames: [{ key: "pool", param: "p_pool", kind: "int" }],
  traceDetail: [{ key: "id", param: "p_request_id", kind: "text" }],
};

/** RPCs that do not take a range at all. */
const NO_RANGE = new Set<RpcName>(["weeks", "traceDetail"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("fn") ?? "";

  if (!isRpcName(name)) {
    return NextResponse.json({ error: "unknown fn" }, { status: 400 });
  }
  if (!isLive) {
    return NextResponse.json(
      { error: configProblem ?? "analytics source is not configured", code: "NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const args: Record<string, unknown> = {};

  if (!NO_RANGE.has(name)) {
    const range = url.searchParams.get("range") ?? "all";
    if (!isRange(range)) return NextResponse.json({ error: "bad range" }, { status: 400 });
    args.p_range = range;
  }

  for (const e of EXTRA[name] ?? []) {
    const raw = url.searchParams.get(e.key);
    if (raw === null) return NextResponse.json({ error: `missing ${e.key}` }, { status: 400 });
    if (e.kind === "int") {
      const n = Number(raw);
      if (!Number.isFinite(n)) return NextResponse.json({ error: `bad ${e.key}` }, { status: 400 });
      args[e.param] = Math.trunc(n);
    } else {
      if (raw.length > 200) return NextResponse.json({ error: `${e.key} too long` }, { status: 400 });
      args[e.param] = raw;
    }
  }

  Object.assign(args, paging(name, url.searchParams.get("limit"), url.searchParams.get("offset")));

  try {
    const data = await query(name, args);
    return NextResponse.json(
      { data },
      // Let the browser reuse a response briefly; the server cache does the
      // heavy lifting, this just stops duplicate hits from one session.
      { headers: { "Cache-Control": "private, max-age=30" } }
    );
  } catch (err) {
    if (!(err instanceof AnalyticsError)) console.error("[analytics] unexpected", err);
    const status = err instanceof AnalyticsError ? err.status : 500;
    const message = err instanceof AnalyticsError ? err.message : "The dashboard could not complete the query.";
    const code = err instanceof AnalyticsError ? err.code : "INTERNAL";
    return NextResponse.json({ error: message, code }, { status });
  }
}

/** Liveness the UI can trust: it actually runs the cheapest real query. */
export async function POST() {
  if (!isLive) {
    return NextResponse.json({ ok: false, reason: configProblem, authMode }, { status: 503 });
  }
  try {
    await query("summary", { p_range: "7d" });
    return NextResponse.json({ ok: true, authMode, cache: cacheStats() });
  } catch (err) {
    const message = err instanceof AnalyticsError ? err.message : "health check failed";
    const code = err instanceof AnalyticsError ? err.code : "INTERNAL";
    return NextResponse.json({ ok: false, reason: message, code, authMode }, { status: 200 });
  }
}
