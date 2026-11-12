"use client";
import { useSyncExternalStore, type ComponentType, type ReactNode } from 'react';

/**
 * A client-only component whose code starts downloading when this module loads,
 * alongside the page's data, rather than when it first renders.
 *
 * Unlike next/dynamic it does not suspend: React holds a Suspense fallback for
 * up to 300 ms before revealing content, which kept charts on their skeleton
 * long after both the data and the chart code had arrived. Until the code is
 * loaded, and during hydration (matching the server's HTML), it shows `fallback`.
 */
export function preloaded<P extends object>(load: () => Promise<ComponentType<P>>, fallback: () => ReactNode): ComponentType<P> {
  let state: { Component: ComponentType<P> | null; error?: unknown } = { Component: null };
  const listeners = new Set<() => void>();
  const settle = (next: typeof state) => { state = next; listeners.forEach(fn => fn()); };
  if (typeof window !== 'undefined') void load().then(Component => settle({ Component }), error => settle({ Component: null, error }));
  const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
  const server = { Component: null };
  function Preloaded(props: P) {
    const { Component, error } = useSyncExternalStore(subscribe, () => state, () => server);
    if (error) throw error; // a failed chunk reaches the error boundary, as with next/dynamic
    return Component ? <Component {...props} /> : fallback();
  }
  return Preloaded;
}
