/** Only a confirmed 401 redirects; transport failures remain recoverable. */
export async function apiFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response> {
  const response=await globalThis.fetch(input,init);
  if(response.status===401&&typeof window!=='undefined'&&window.location.pathname!=='/login') {
    const {pathname,search,hash}=window.location;
    window.location.assign(`/login?next=${encodeURIComponent(pathname+search+hash)}`);
  }
  return response;
}

/**
 * The edge cache answers with a stale copy (X-Edge-Cache: STALE) while it reloads
 * that entry in the background. Ask again shortly and hand the fresh response to
 * `onFresh`, so the page shows stored numbers at once and current ones a moment later.
 */
export function revalidateIfStale(response: Response, url: string, onFresh: (fresh: Response) => void, signal?: AbortSignal) {
  if (response.headers.get('X-Edge-Cache') !== 'STALE' || typeof window === 'undefined') return;
  let timer: ReturnType<typeof setTimeout>;
  const attempt = (n: number) => {
    timer = setTimeout(() => {
      apiFetch(url, { cache: 'no-store', signal }).then(fresh => {
        if (!fresh.ok) return;
        if (fresh.headers.get('X-Edge-Cache') === 'STALE') { if (n < 3) attempt(n + 1); return; }
        onFresh(fresh);
      }).catch(() => {});
    }, 1000 * 2 ** n);
  };
  attempt(0);
  signal?.addEventListener('abort', () => clearTimeout(timer));
}
