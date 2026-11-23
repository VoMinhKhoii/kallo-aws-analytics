import 'server-only';
import { EmailError, type ProviderId } from './input';

// Two ways out, picked per send on the /email page:
//  - resend:     for campaigns. Resend allows bulk mail. Sends from its own
//                subdomain so a campaign can never hurt sign-up mail.
//  - cloudflare: Kallo's existing sender (mail.kallo.fit), ready with no new
//                setup. Cloudflare Email Service is for transactional mail
//                only, so the page warns before using it for a campaign.

export interface Outgoing { to: string; subject: string; html: string; text: string; unsubscribeUrl: string }
// retry: only for throttling (429), where nothing was sent. Any other failure
// may have gone out, so it is logged as failed and never sent twice.
export type Result = { ok: true; id: string | null } | { ok: false; error: string; bounced?: boolean; retry?: boolean };
export interface ProviderInfo { id: ProviderId; label: string; from: string; configured: boolean; bulkAllowed: boolean; setup: string }

const CLOUDFLARE_ACCOUNT = '26f3d8cb79c027fa0cd34d6c9f152ab3';
const replyTo = () => process.env.EMAIL_REPLY_TO?.trim() || 'support@kallo.fit';
const fromFor = (id: ProviderId) => id === 'resend'
  ? process.env.RESEND_FROM?.trim() || 'Kallo <hello@news.kallo.fit>'
  : process.env.CLOUDFLARE_EMAIL_FROM?.trim() || 'Kallo <notifications@mail.kallo.fit>';

export function providers(): ProviderInfo[] {
  return [
    { id: 'resend', label: 'Resend', from: fromFor('resend'), configured: Boolean(process.env.RESEND_API_KEY?.trim()), bulkAllowed: true, setup: 'Set the RESEND_API_KEY secret, and verify the sending domain in Resend.' },
    { id: 'cloudflare', label: 'Cloudflare Email', from: fromFor('cloudflare'), configured: Boolean(process.env.CLOUDFLARE_EMAIL_API_TOKEN?.trim()), bulkAllowed: false, setup: 'Set the CLOUDFLARE_EMAIL_API_TOKEN secret (Email Sending: Edit).' },
  ];
}

export function providerInfo(id: ProviderId): ProviderInfo {
  return providers().find(p => p.id === id)!;
}

/** Gmail and Yahoo require one-click unsubscribe headers for bulk senders (RFC 8058). */
const listHeaders = (url: string) => ({ 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });

/** Send each message on its own (they are personalized). Results keep input order. */
export async function sendAll(id: ProviderId, messages: Outgoing[], fetcher: typeof fetch = fetch): Promise<Result[]> {
  if (!messages.length) return [];
  return id === 'resend' ? resendBatch(messages, fetcher) : cloudflareEach(messages, fetcher);
}

async function resendBatch(messages: Outgoing[], fetcher: typeof fetch): Promise<Result[]> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new EmailError('Resend is not set up.');
  const from = fromFor('resend');
  // One call carries up to 100 different emails.
  const response = await fetcher('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(messages.map(m => ({ from, to: [m.to], reply_to: replyTo(), subject: m.subject, html: m.html, text: m.text, headers: listHeaders(m.unsubscribeUrl) }))),
  });
  const body = await response.json().catch(() => null) as { data?: { id?: string }[]; message?: string } | null;
  if (!response.ok) {
    const error = `Resend ${response.status}: ${body?.message ?? 'no error body'}`;
    return messages.map(() => ({ ok: false, error, retry: response.status === 429 }));
  }
  return messages.map((_, i) => ({ ok: true, id: body?.data?.[i]?.id ?? null }));
}

async function cloudflareEach(messages: Outgoing[], fetcher: typeof fetch): Promise<Result[]> {
  const token = process.env.CLOUDFLARE_EMAIL_API_TOKEN?.trim();
  if (!token) throw new EmailError('Cloudflare Email is not set up.');
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || CLOUDFLARE_ACCOUNT;
  const from = fromFor('cloudflare');
  const one = async (m: Outgoing): Promise<Result> => {
    try {
      const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/email/sending/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [m.to], reply_to: replyTo(), subject: m.subject, html: m.html, text: m.text, headers: listHeaders(m.unsubscribeUrl) }),
      });
      const body = await response.json().catch(() => null) as { success?: boolean; errors?: { code: number; message: string }[]; result?: { message_id?: string | null; permanent_bounces?: string[] | null; suppressed_recipients?: string[] | null } } | null;
      if (!response.ok || !body?.success) return { ok: false, error: `Cloudflare ${response.status}: ${body?.errors?.map(e => `${e.code} ${e.message}`).join('; ') || 'no error body'}`, retry: response.status === 429 };
      // Bounces and suppressed recipients come back as HTTP 200.
      if (body.result?.permanent_bounces?.length || body.result?.suppressed_recipients?.length) return { ok: false, error: 'The receiving server refused it, or the address is on Cloudflare’s suppression list', bounced: true };
      return { ok: true, id: body.result?.message_id ?? null };
    } catch (e) {
      return { ok: false, error: `Could not reach Cloudflare: ${e instanceof Error ? e.message : String(e)}` };
    }
  };
  // Cloudflare answers only after trying the recipient's server (1-3 s), so a few at a time.
  const results: Result[] = new Array(messages.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(5, messages.length) }, async () => {
    while (next < messages.length) { const i = next++; results[i] = await one(messages[i]); }
  }));
  return results;
}
