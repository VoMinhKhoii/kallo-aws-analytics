import { apiFetch } from '@/lib/api-fetch';
import type { CampaignRow, Campaign } from '@/lib/email/store';
import type { AudienceCount } from '@/lib/email/audience';
import type { ProviderId } from '@/lib/email/input';

export type { CampaignRow, Campaign, AudienceCount };
export interface ProviderView { id: ProviderId; label: string; from: string; configured: boolean; bulkAllowed: boolean; setup: string }
export interface EmailHome { campaigns: CampaignRow[]; providers: ProviderView[]; setup: { store: boolean; linkSecret: boolean }; testAddress: string }
export interface FailedSend { email: string; locale: string; status: string; error: string | null; sentAt: string | null }

export async function emailApi<T>(query = '', body?: unknown): Promise<T> {
  const response = await apiFetch('/api/admin/email' + query, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data as T;
}

export const when = (value: string | null) => value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const STATUS_LABEL: Record<string, string> = { draft: 'Draft', sending: 'Sending', sent: 'Sent', canceled: 'Canceled' };
export const STATUS_MARK: Record<string, string> = { draft: '', sending: 'mark-warn', sent: 'mark-good', canceled: 'mark-bad' };
