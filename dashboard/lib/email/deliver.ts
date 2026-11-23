import 'server-only';
import type { Locale } from './brand';
import { renderEmail, type CampaignContent } from './render';
import { sendAll } from './providers';
import { unsubscribeUrl } from './link-token';
import { claimBatch, finishIfDone, recordOutcomes, type Campaign, type EmailDb, type Outcome } from './store';
import type { ProviderId } from './input';

// The page drains a started campaign one batch per request, so a send needs
// no queue service and survives a closed tab: reopen the page to resume.
export const BATCH_SIZE: Record<ProviderId, number> = { resend: 50, cloudflare: 20 };

export interface BatchResult { claimed: number; throttled: boolean }

export async function deliverBatch(db: EmailDb, campaign: Campaign, origin: string, deps: { fetcher?: typeof fetch; now?: () => Date } = {}): Promise<BatchResult> {
  const provider = campaign.provider;
  if (campaign.status !== 'sending' || !provider) return { claimed: 0, throttled: false };
  const now = deps.now ?? (() => new Date());
  const claimed = await claimBatch(db, campaign.id, BATCH_SIZE[provider], now());
  if (!claimed.length) { await finishIfDone(db, campaign.id, now()); return { claimed: 0, throttled: false }; }
  const messages = claimed.map(r => {
    const url = unsubscribeUrl(origin, { email: r.email, locale: r.locale, campaignId: campaign.id });
    return { to: r.email, unsubscribeUrl: url, ...renderEmail(campaign.content, r, url, origin) };
  });
  let outcomes: Outcome[];
  try {
    const results = await sendAll(provider, messages, deps.fetcher);
    outcomes = results.map((r, i) => r.ok ? { email: claimed[i].email, status: 'sent', messageId: r.id } : r.retry ? { email: claimed[i].email, status: 'retry' } : { email: claimed[i].email, status: 'failed', error: r.error, bounced: r.bounced });
  } catch (e) {
    // Nothing went out (the provider is not set up): put the batch back.
    await recordOutcomes(db, campaign.id, claimed.map(r => ({ email: r.email, status: 'retry' })), now());
    throw e;
  }
  await recordOutcomes(db, campaign.id, outcomes, now());
  await finishIfDone(db, campaign.id, now());
  return { claimed: claimed.length, throttled: outcomes.some(o => o.status === 'retry') };
}

/** Test sends: marked [Test], to any address, never logged or counted. */
export async function sendTest(provider: ProviderId, content: CampaignContent, to: string[], locales: Locale[], name: string | null, origin: string, fetcher?: typeof fetch): Promise<{ to: string; locale: Locale; ok: boolean; error?: string }[]> {
  const url = `${origin}/api/email/unsubscribe?test=1`;
  const jobs = to.flatMap(email => locales.map(locale => ({ email, locale })));
  const messages = jobs.map(j => { const m = renderEmail(content, { email: j.email, name, locale: j.locale }, url, origin); return { ...m, to: j.email, subject: `[Test${locales.length > 1 ? ` ${j.locale.toUpperCase()}` : ''}] ${m.subject}`, unsubscribeUrl: url }; });
  const results = await sendAll(provider, messages, fetcher);
  return results.map((r, i) => ({ to: jobs[i].email, locale: jobs[i].locale, ok: r.ok, ...(r.ok ? {} : { error: r.error }) }));
}
