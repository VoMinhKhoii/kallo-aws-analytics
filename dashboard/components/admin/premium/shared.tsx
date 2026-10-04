export const field = 'w-full rounded-md border border-[var(--console-rule)] bg-[var(--console-surface)] px-3 py-2 text-sm focus:outline-2 focus:outline-[var(--console-blue)]';
export const button = 'rounded-md bg-[var(--console-ink)] px-4 py-2 text-sm font-medium text-[var(--console-surface)] transition-opacity hover:opacity-85 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--console-blue)]';
export const secondary = 'rounded-md border border-[var(--console-rule)] px-3 py-2 text-sm hover:bg-[var(--console-panel)] disabled:opacity-40';
export const date = (value: string | null) => value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'No end date';
export async function api<T>(path = '', body?: unknown): Promise<T> {
  const response = await fetch('/api/admin/premium' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data as T;
}
export interface Account { id: string; email: string; name: string | null; plan: string; freeUntil: string | null; joinedAt: string; grants?: { id: string; kind: string; status: string; expiresAt: string | null }[] }
export interface Activity { id: string; action: string; scope: string; reason: string | null; userCount: number; createdAt: string; undoneAt: string | null; adminEmail: string }
export interface PremiumData {
  overview: { onFreePremium: number; endingSoon: number; paying: number; upgradedDuringFree: number };
  offer: { enabled: boolean; days: number; autoOffAt: string | null };
  activity: Activity[];
  ending: { id: string; email: string; freeUntil: string }[];
}
