'use client';
import { apiFetch } from './api-fetch';

// A request started before the component that reads it has mounted, so a
// section rendered after the main data (Latest meals under Overview) does not
// wait for it. Each prefetch is taken once, and only while it is recent.
const MAX_AGE = 10_000;
const early = new Map<string, { at: number; response: Promise<Response> }>();

export function prefetch(url: string) {
  const hit = early.get(url);
  if (hit && Date.now() - hit.at < MAX_AGE) return;
  const response = apiFetch(url, { cache: 'no-store' });
  response.catch(() => {});
  early.set(url, { at: Date.now(), response });
}

/** The prefetched response for `url` if there is a recent one, else a new request. */
export function fetchPrefetched(url: string, init?: RequestInit): Promise<Response> {
  const hit = early.get(url);
  early.delete(url);
  return hit && Date.now() - hit.at < MAX_AGE ? hit.response : apiFetch(url, init);
}
