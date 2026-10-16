/** Only a confirmed 401 redirects; transport failures remain recoverable. */
export async function apiFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response> {
  const response=await globalThis.fetch(input,init);
  if(response.status===401&&typeof window!=='undefined'&&window.location.pathname!=='/login') {
    const {pathname,search,hash}=window.location;
    window.location.assign(`/login?next=${encodeURIComponent(pathname+search+hash)}`);
  }
  return response;
}
