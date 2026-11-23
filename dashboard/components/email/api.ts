import { apiFetch } from '@/lib/api-fetch';
import type { CampaignRow, Campaign, CampaignStatus, SendRow } from '@/lib/email/store';
import type { AudienceCount } from '@/lib/email/audience';
import type { ProviderInfo } from '@/lib/email/providers';

export type { CampaignRow, Campaign, AudienceCount };
export type ProviderView = ProviderInfo;
export interface EmailHome { campaigns: CampaignRow[]; providers: ProviderView[]; setup: { store: boolean; linkSecret: boolean }; testAddress: string }
export type FailedSend = SendRow;

export async function emailApi<T>(query = '', body?: unknown): Promise<T> {
  const response = await apiFetch('/api/admin/email' + query, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data as T;
}

export const when = (value: string | null) => value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const STATUS_LABEL: Record<CampaignStatus, string> = { draft: 'Draft', sending: 'Sending', sent: 'Sent', canceled: 'Canceled' };
export const STATUS_MARK: Record<CampaignStatus, string> = { draft: '', sending: 'mark-warn', sent: 'mark-good', canceled: 'mark-bad' };
