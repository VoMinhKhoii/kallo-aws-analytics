import { apiFetch } from './api-fetch';
import type { DashboardRole } from './auth-config';
export type AuthState = { role: DashboardRole | null; expiresAt: string | null; loading: boolean; error: string | null };
const initial: AuthState = {role: null, expiresAt: null, loading: true, error: null};
const disabled: AuthState = {...initial, loading: false};
let state = initial;
let pending: Promise<void> | null = null;
let checked = 0;
const listeners = new Set<() => void>();
export function readSession() {
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
export const retrySession = () => state.error ? readSession() : Promise.resolve();
export const sessionChecked = () => checked;
export {initial,disabled};
