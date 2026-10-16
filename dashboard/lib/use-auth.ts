"use client";
import { useEffect, useSyncExternalStore } from 'react';
import type { DashboardRole } from './auth-config';
export type AuthState = { role: DashboardRole | null; expiresAt: string | null; loading: boolean; error: string | null };
const initial: AuthState = {role: null, expiresAt: null, loading: true, error: null};
const disabled: AuthState = {...initial, loading: false};
let state = initial;
let pending: Promise<void> | null = null;
let checked = 0;
const listeners = new Set<() => void>();
function readSession() {
  if (pending) return pending;
  pending = fetch('/api/auth/session', {cache: 'no-store', credentials: 'same-origin'})
    .then(async response => {
      const body = await response.json();
      if (!response.ok || !['founder', 'reviewer'].includes(body?.role)) throw new Error('Authentication required');
      state = {role: body.role, expiresAt: body.expires_at ?? null, loading: false, error: null};
    }).catch(e => { state = {...disabled, error: e.message}; })
    .finally(() => { checked = Date.now(); pending = null; listeners.forEach(fn => fn()); });
  return pending;
}
function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function useSessionRole(enabled = true): AuthState {
  const current = useSyncExternalStore(subscribe, () => state, () => initial);
  useEffect(() => {
    if (!enabled) return;
    if (!checked) void readSession();
    const focus = () => { if (Date.now() - checked > 300_000) void readSession(); };
    window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus);
  }, [enabled]);
  return enabled ? current : disabled;
}
