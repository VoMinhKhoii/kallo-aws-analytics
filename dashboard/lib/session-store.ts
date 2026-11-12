import { apiFetch } from './api-fetch';
import { ROLE_HINT_COOKIE, type DashboardRole } from './auth-config';
export type AuthState = { role: DashboardRole | null; expiresAt: string | null; loading: boolean; error: string | null };
const initial: AuthState = {role: null, expiresAt: null, loading: true, error: null};
const disabled: AuthState = {...initial, loading: false};
let state = initial;
let pending: Promise<void> | null = null;
let checked = 0;
const listeners = new Set<() => void>();
/** The role the middleware recorded for this page load (see ROLE_HINT_COOKIE), if still current. */
function roleHint(): AuthState | null {
  if (typeof document === 'undefined') return null;
  const value = document.cookie.split('; ').find(c => c.startsWith(ROLE_HINT_COOKIE + '='))?.slice(ROLE_HINT_COOKIE.length + 1) ?? '';
  const [role, exp] = value.split('.');
  if ((role !== 'founder' && role !== 'reviewer') || !(Number(exp) * 1000 > Date.now())) return null;
  return {role, expiresAt: new Date(Number(exp) * 1000).toISOString(), loading: false, error: null};
}
/** Reads the role from the hint when there is one; `verify` asks the server. */
export function readSession(verify = false) {
  const hint = verify ? null : roleHint();
  if (hint) { state = hint; checked = Date.now(); listeners.forEach(fn => fn()); return Promise.resolve(); }
  if (pending) return pending;
  pending = apiFetch('/api/auth/session', {cache: 'no-store', credentials: 'same-origin'})
    .then(async response => {
      const body = await response.json();
      if(response.status===401){state=disabled;return;}
      if (!response.ok || !['founder', 'reviewer'].includes(body?.role)) throw new Error('Session could not be checked. Try Refresh.');
      state = {role: body.role, expiresAt: body.expires_at ?? null, loading: false, error: null};
    }).catch(e => { state = {...disabled, error: e.message}; })
    .finally(() => { checked = Date.now(); pending = null; listeners.forEach(fn => fn()); });
  return pending;
}
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export const sessionSnapshot = () => state;
export const retrySession = () => state.error ? readSession(true) : Promise.resolve();
export const sessionChecked = () => checked;
export {initial,disabled};
