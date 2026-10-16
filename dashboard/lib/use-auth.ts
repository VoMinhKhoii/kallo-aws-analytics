"use client";
import { useEffect, useSyncExternalStore } from 'react';
import { readSession, subscribe, sessionSnapshot, sessionChecked, initial, disabled } from './session-store';
import type { AuthState } from './session-store';
export type { AuthState } from './session-store';
export function useSessionRole(enabled = true): AuthState {
  const current = useSyncExternalStore(subscribe, sessionSnapshot, () => initial);
  useEffect(() => {
    if (!enabled) return;
    if (!sessionChecked()) void readSession();
    const focus = () => { if (Date.now() - sessionChecked() > 300_000) void readSession(); };
    window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus);
  }, [enabled]);
  return enabled ? current : disabled;
}
