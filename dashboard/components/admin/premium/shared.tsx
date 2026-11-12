import { apiFetch } from '@/lib/api-fetch';
export const field = 'h-9 min-w-0 w-full rounded-[5px] border border-input bg-transparent px-3 text-sm outline-none focus:border-[var(--console-accent)]';
export const button = 'inline-flex h-9 items-center justify-center gap-2 rounded-[5px] bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--console-blue)]';
export const secondary = 'inline-flex h-8 items-center justify-center gap-2 rounded-[5px] border border-input px-3 text-xs text-foreground transition-colors hover:bg-secondary disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[var(--console-blue)]';
export const date = (value: string | null) => value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'No end date';
export async function api<T>(path = '', body?: unknown): Promise<T> {
  const response = await apiFetch('/api/admin/premium' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data as T;
}
export interface Account { id: string; email: string; name: string | null; plan: string; freeUntil: string | null; joinedAt: string; grants?: { id: string; kind: string; status: string; startsAt?: string | null; expiresAt: string | null }[] }
export interface Activity { id: string; action: string; scope: string; reason: string | null; userCount: number; createdAt: string; undoneAt: string | null; adminEmail: string }
export interface PremiumData {
  overview: { onFreePremium: number; endingSoon: number; paying: number; upgradedDuringFree: number };
  offer: { enabled: boolean; days: number; autoOffAt: string | null };
  activity: Activity[];
  ending: { id: string; email: string; freeUntil: string }[];
  trend: { date: string; freeStarted: number; paidStarted: number; upgraded: number }[];
  endingByDay: { date: string; ending: number }[];
}
