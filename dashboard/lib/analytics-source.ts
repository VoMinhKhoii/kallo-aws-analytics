import "server-only";

/**
 * Server-side data access for the analytics plane.
 *
 * Everything is aggregated inside Postgres and returned as one small JSON
 * payload per call, so raw JSONB never crosses the wire. Every list call is
 * paginated and hard-capped in SQL as well as here. Results are cached, so a
 * page reload, a range flip back to one already seen, or two people opening the
 * dashboard at once do not each become a database round trip.
 *
 * The same contract is what the AWS API Gateway route will serve later: swap
 * the transport in `callRpc` and the pages do not change.
 */

const URL_ = process.env.SUPABASE_URL ?? "";

/**
 * Supabase wants two DIFFERENT credentials and they are not interchangeable:
 *
 *   apikey        identifies the project to the API gateway. Always the
 *                 publishable (anon) key, even when the bearer is privileged.
 *   Authorization the role the query runs as.
 *
 * Sending a restricted analytics_reader JWT as `apikey` is rejected with
 * "Invalid API key", because that JWT is not a project key. The service-role
 * key is the one case where a single value works in both slots, which is why
 * conflating them appears to work right up until a restricted token is used.
 */
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const READER_JWT = process.env.SUPABASE_ANALYTICS_JWT ?? "";
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

/** apikey slot: publishable when we have it, else the service key. */
const API_KEY = PUBLISHABLE || SERVICE_KEY;
/** Authorization slot: prefer the restricted reader, fall back to service role. */
const BEARER = READER_JWT || SERVICE_KEY;

export const authMode = READER_JWT
  ? (PUBLISHABLE ? "analytics_reader" : "analytics_reader (missing publishable key)")
  : SERVICE_KEY ? "service_role" : "none";

export const isLive = Boolean(URL_ && API_KEY && BEARER);

/** A restricted JWT without a publishable key will always fail; say so early. */
export const configProblem: string | null =
  !URL_ ? "SUPABASE_URL is not set"
  : !BEARER ? "no key set — need SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANALYTICS_JWT"
  : READER_JWT && !PUBLISHABLE
    ? "SUPABASE_ANALYTICS_JWT is set but SUPABASE_PUBLISHABLE_KEY is missing — the restricted JWT cannot be used as the apikey"
  : null;

export const RANGES = ["24h", "7d", "30d", "90d", "all"] as const;
export type RangeKey = (typeof RANGES)[number];
export const isRange = (v: string): v is RangeKey => (RANGES as readonly string[]).includes(v);

/** Only these functions are reachable, whatever the caller sends. */
export const RPC = {
  overturnGroups: { fn: "analytics_overturn_groups", paged: true, defLimit: 10, maxLimit: 50 },
  overturnPool: { fn: "analytics_overturn_pool", paged: false },
  reverseRows: { fn: "analytics_reverse_rows", paged: true, defLimit: 14, maxLimit: 50 },
  corpusRows: { fn: "analytics_corpus_rows", paged: true, defLimit: 12, maxLimit: 50 },
  corpusQueries: { fn: "analytics_corpus_queries", paged: true, defLimit: 10, maxLimit: 50 },
  poolNames: { fn: "analytics_pool_names", paged: true, defLimit: 40, maxLimit: 120 },
  unresolved: { fn: "analytics_unresolved", paged: true, defLimit: 10, maxLimit: 50 },
  requestsPage: { fn: "analytics_requests_page", paged: true, defLimit: 12, maxLimit: 50 },
  traceDetail: { fn: "analytics_trace_detail", paged: false },
} as const;

export type RpcName = keyof typeof RPC;
export const isRpcName = (v: string): v is RpcName => Object.hasOwn(RPC, v);

/** Cache lifetime. Aggregates move at pipeline speed, not request speed. */
const TTL_MS = Number(process.env.ANALYTICS_CACHE_TTL_MS ?? 5 * 60 * 1000);
const MAX_ENTRIES = 200;

type Entry = { at: number; value: unknown };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function cacheGet(key: string) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  // refresh recency
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function cacheSet(key: string, value: unknown) {
  cache.set(key, { at: Date.now(), value });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export class AnalyticsError extends Error {
  constructor(message: string, readonly status: number, readonly code = "ANALYTICS") {
    super(message);
  }
}

/** Short, actionable text. The raw Postgres payload is logged, never returned. */
function upstreamMessage(status: number, body: string): string {
  if (status === 401) return "The database rejected the credentials. Check the apikey and bearer token.";
  if (status === 403 || body.includes("permission denied"))
    return "The database refused the query: this role cannot execute the analytics functions.";
  if (status === 404) return "The analytics functions are not present on this database.";
  if (status === 429) return "The database is rate limiting the dashboard.";
  return `The database returned an unexpected error (${status}).`;
}

async function callRpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: API_KEY,
      Authorization: `Bearer ${BEARER}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    // Next must not cache this itself; the in-process cache above owns TTL.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Upstream Postgres detail is for the operator, not the browser.
    console.error(`[analytics] ${fn} -> ${res.status}`, body.slice(0, 500));
    throw new AnalyticsError(upstreamMessage(res.status, body), res.status === 404 ? 500 : 502, `PGRST_${res.status}`);
  }
  return res.json();
}

function browserSafeResult(name: RpcName, value: unknown): unknown {
  if (name !== "traceDetail" || !value || typeof value !== "object" || Array.isArray(value)) return value;

  // Older database versions returned a `raw` stage-output map. Never let that
  // field cross the route boundary, even during a staggered deployment. The
  // current RPC exposes an explicit, bounded meal-analysis contract instead.
  const safe = { ...(value as Record<string, unknown>) };
  delete safe.raw;
  return safe;
}

/**
 * Cached, de-duplicated RPC call. Concurrent callers for the same key share a
 * single in-flight request rather than each opening their own.
 */
export async function query(name: RpcName, args: Record<string, unknown>, refresh = false): Promise<unknown> {
  if (!isLive) throw new AnalyticsError(configProblem ?? "analytics source is not configured", 503, "NOT_CONFIGURED");
  const spec = RPC[name];
  const key = `${name}:${JSON.stringify(args)}`;

  const cached = refresh ? undefined : cacheGet(key);
  if (cached !== undefined) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const p = callRpc(spec.fn, args)
    .then((value) => browserSafeResult(name, value))
    .then((value) => {
      cacheSet(key, value);
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

/** Clamp paging the same way SQL does, so both ends agree. */
export function paging(name: RpcName, limitRaw: string | null, offsetRaw: string | null) {
  const spec = RPC[name] as { paged: boolean; defLimit?: number; maxLimit?: number };
  if (!spec.paged) return {};
  const limit = Math.min(Math.max(Number(limitRaw) || spec.defLimit || 20, 1), spec.maxLimit || 50);
  const offset = Math.max(Number(offsetRaw) || 0, 0);
  return { p_limit: limit, p_offset: offset };
}

export function cacheStats() {
  return { entries: cache.size, ttlMs: TTL_MS, inflight: inflight.size };
}
