"use client";
import { validChoice } from './windows';
import { useSyncExternalStore } from 'react';
const subscribe = (fn: () => void) => {
  window.addEventListener('popstate', fn); window.addEventListener('dashboard-url', fn);
  return () => { window.removeEventListener('popstate', fn); window.removeEventListener('dashboard-url', fn); };
};
export function useUrlState<T extends string>(key: string, fallback: T, choices?: readonly T[]) {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => null);
  const raw = new URLSearchParams(search ?? '').get(key) as T | null;
  const value = validChoice(raw, fallback, choices);
  const set = (next: string) => {
    if (choices && !choices.includes(next as T)) return;
    const url = new URL(window.location.href); url.searchParams.set(key, next);
    window.history.pushState(null, '', url); window.dispatchEvent(new Event('dashboard-url'));
  };
  return [value, set, search !== null] as const;
}
