import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Colo-wide cache for read-only aggregate responses, shared by every isolate.
 * The isolate-local AggregateCache rarely hits in production because requests
 * spread across isolates; this one does. A response is served as is while
 * fresh, served and refreshed in the background while stale, and loaded
 * synchronously after that. `refresh=1` always loads and replaces the entry.
 *
 * Call it only after the request is authorized: `scope` (the session role)
 * is part of the key, so roles never share an entry. The named cache is not
 * the zone's CDN cache, so entries are never served to a request directly.
 */
export type EdgeTtl = { fresh: number; stale: number };
// Stale copies are served for up to a day because the page asks again for the
// fresh one a moment later (revalidateIfStale in lib/api-fetch.ts): the first
// visit after a quiet spell no longer waits on Postgres in Singapore.
export const AGGREGATE_TTL: EdgeTtl = { fresh: 60_000, stale: 86_400_000 };

/** Set by a handler on a 200 that must not be kept, e.g. a bundle with a failed part. */
export const NO_STORE = 'x-edge-no-store';
const STORED_AT = 'x-edge-stored-at';
const BROWSER_CACHE = 'x-edge-browser-cache-control';
const revalidating = new Set<string>();

function workerContext() {
  if (typeof navigator === 'undefined' || navigator.userAgent !== 'Cloudflare-Workers' || typeof caches === 'undefined') return null;
  try { return getCloudflareContext().ctx; } catch { return null; }
}

export async function edgeCached(request: Request, scope: string, ttl: EdgeTtl, load: () => Promise<Response>): Promise<Response> {
  const ctx = workerContext();
  if (!ctx) return load();
  const url = new URL(request.url);
  const refresh = url.searchParams.get('refresh') === '1';
  url.searchParams.delete('refresh');
  url.searchParams.sort();
  const key = `${url.origin}/__edge-cache/${encodeURIComponent(scope)}${url.pathname}?${url.searchParams}`;
  const cache = await caches.open('kallo-admin-api');

  const loadAndStore = async () => {
    const response = await load();
    if (response.status !== 200 || response.headers.has(NO_STORE)) return response;
    const stored = new Response(response.clone().body, response);
    stored.headers.set(BROWSER_CACHE, response.headers.get('Cache-Control') ?? 'no-store');
    stored.headers.set('Cache-Control', `public, max-age=${Math.ceil(ttl.stale / 1000)}`);
    stored.headers.set(STORED_AT, String(Date.now()));
    stored.headers.delete('Set-Cookie');
    ctx.waitUntil(cache.put(key, stored).catch(() => {}));
    return response;
  };
  const mark = (response: Response, state: string) => {
    const out = new Response(response.body, response);
    out.headers.set('X-Edge-Cache', state);
    return out;
  };

  if (!refresh) {
    const hit = await cache.match(key).catch(() => undefined);
    const age = hit ? Date.now() - Number(hit.headers.get(STORED_AT)) : Infinity;
    if (hit && age < ttl.stale) {
      if (age >= ttl.fresh && !revalidating.has(key)) {
        revalidating.add(key);
        ctx.waitUntil(loadAndStore().catch(() => {}).finally(() => revalidating.delete(key)));
      }
      const out = mark(hit, age < ttl.fresh ? 'HIT' : 'STALE');
      out.headers.set('Cache-Control', hit.headers.get(BROWSER_CACHE) ?? 'no-store');
      out.headers.set('Age', String(Math.floor(age / 1000)));
      out.headers.delete(STORED_AT);
      out.headers.delete(BROWSER_CACHE);
      return out;
    }
  }
  return mark(await loadAndStore(), refresh ? 'BYPASS' : 'MISS');
}
