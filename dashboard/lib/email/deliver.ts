import 'server-only';
import type { Locale } from './brand';
import { renderEmail, type CampaignContent } from './render';
import { providerInfo, sendAll } from './providers';
import { linkSecretConfigured, unsubscribeUrl } from './link-token';
import { claimBatch, finishIfDone, recordOutcomes, type Campaign, type EmailDb, type Outcome } from './store';
import { EmailError, type ProviderId } from './input';

// The page drains a started campaign one batch per request, so a send needs
// no queue service and survives a closed tab: reopen the page to resume.
export const BATCH_SIZE: Record<ProviderId, number> = { resend: 50, cloudflare: 20 };

/**
 * `throttled` carries the provider's message, so the page can say why it is
 * waiting; `stalled` means nothing in the batch went out or failed, which is what
 * the page counts toward pausing.
 */
export interface BatchResult { claimed: number; throttled: string | null; stalled: boolean }

export async function deliverBatch(db: EmailDb, campaign: Campaign, origin: string, deps: { fetcher?: typeof fetch; now?: () => Date } = {}): Promise<BatchResult> {
  const provider = campaign.provider;
  if (campaign.status !== 'sending' || !provider) return { claimed: 0, throttled: null, stalled: false };
  const now = deps.now ?? (() => new Date());
  // Checked before claiming: once rows are claimed, nothing puts them back.
  const sender = providerInfo(provider);
  if (!sender.configured) throw new EmailError(`${sender.label} is not set up. ${sender.setup}`);
  if (!linkSecretConfigured()) throw new EmailError('EMAIL_LINK_SECRET is not set, so unsubscribe links cannot be made. Set it, then resume.');
  const claimed = await claimBatch(db, campaign.id, BATCH_SIZE[provider], now());
  if (!claimed.length) { await finishIfDone(db, campaign.id, now()); return { claimed: 0, throttled: null, stalled: false }; }
  const messages = claimed.map(r => {
    const url = unsubscribeUrl(origin, { email: r.email, locale: r.locale, campaignId: campaign.id });
    return { to: r.email, unsubscribeUrl: url, ...renderEmail(campaign.content, r, url, origin) };
  });
  let outcomes: Outcome[];
  let blocked: string | null = null;
  try {
    outcomes = (await sendAll(provider, messages, deps.fetcher)).map((r, i): Outcome => {
      if (r.status !== 'blocked') return { email: claimed[i].email, ...r };
      blocked = r.error;
      return { email: claimed[i].email, status: 'retry', error: r.error };
    });
  } catch (e) {
    // Unexpected, and some of the batch may have gone out: fail it, never resend.
    const error = `Send stopped: ${e instanceof Error ? e.message : String(e)}`;
    outcomes = claimed.map(r => ({ email: r.email, status: 'failed', error }));
  }
  await recordOutcomes(db, campaign.id, outcomes, now());
  // The provider refused the key or domain: stop here rather than walk the rest
  // of the audience into the same refusal. With Cloudflare, other emails in the
  // batch may have gone out before the refusal; those stay recorded as sent.
  if (blocked) throw new EmailError(`${blocked}. The refused emails are back in the queue; fix the sender, then resume.`);
  await finishIfDone(db, campaign.id, now());
  const retry = outcomes.find(o => o.status === 'retry');
  return { claimed: claimed.length, throttled: retry ? (retry.error ?? 'Throttled') : null, stalled: outcomes.every(o => o.status === 'retry') };
}

/** Test sends: marked [Test], to any address, never logged or counted. */
export async function sendTest(provider: ProviderId, content: CampaignContent, to: string[], locales: Locale[], name: string | null, origin: string, fetcher?: typeof fetch): Promise<{ to: string; locale: Locale; ok: boolean; error?: string }[]> {
  const url = `${origin}/api/email/unsubscribe?test=1`;
  const jobs = to.flatMap(email => locales.map(locale => ({ email, locale })));
  const messages = jobs.map(j => { const m = renderEmail(content, { email: j.email, name, locale: j.locale }, url, origin); return { ...m, to: j.email, subject: `[Test${locales.length > 1 ? ` ${j.locale.toUpperCase()}` : ''}] ${m.subject}`, unsubscribeUrl: url }; });
  const results = await sendAll(provider, messages, fetcher);
  return results.map((r, i) => ({ to: jobs[i].email, locale: jobs[i].locale, ok: r.status === 'sent', ...(r.status === 'sent' ? {} : { error: r.error }) }));
}
