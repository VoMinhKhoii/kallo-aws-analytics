import { z } from 'zod';
import { authorizeRequest } from '@/lib/auth';
import { connectAdminDb } from '@/lib/admin/db/client';
import { LOCALES } from '@/lib/email/brand';
import { EmailError, audienceSchema, contentSchema, draftSchema, providerSchema } from '@/lib/email/input';
import { contentProblem, type CampaignContent } from '@/lib/email/render';
import { resolveAudience, summarize } from '@/lib/email/audience';
import { providerInfo, providers } from '@/lib/email/providers';
import { linkSecretConfigured } from '@/lib/email/link-token';
import { deliverBatch, sendTest } from '@/lib/email/deliver';
import { translateContent } from '@/lib/email/translate';
import { cancelCampaign, createCampaign, deleteDraft, emailStore, finishIfDone, getCampaign, listCampaigns, listSends, listSuppressions, saveDraft, startCampaign, suppress, suppressedSet, sweepStale, unsuppress, type EmailDb } from '@/lib/email/store';

export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const id = z.string().uuid();
const email = z.string().trim().toLowerCase().pipe(z.email('Use a real email address.'));
const localeContent = contentSchema.shape.en;
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), draft: draftSchema }),
  z.object({ action: z.literal('save'), id, draft: draftSchema }),
  z.object({ action: z.literal('delete'), id }),
  z.object({ action: z.literal('count'), audience: audienceSchema }),
  z.object({ action: z.literal('test'), provider: providerSchema, content: contentSchema, to: z.array(email).min(1, 'Add an address to send the test to.').max(5, 'At most 5 test addresses.'), locales: z.array(z.enum(LOCALES)).min(1).max(2), name: z.string().trim().max(80).nullable() }),
  z.object({ action: z.literal('start'), id, draft: draftSchema, provider: providerSchema, confirm: z.literal('SEND', { message: 'Type SEND to confirm.' }) }),
  z.object({ action: z.literal('deliver'), id }),
  z.object({ action: z.literal('cancel'), id }),
  z.object({ action: z.literal('translate'), source: localeContent, from: z.enum(LOCALES), to: z.enum(LOCALES) }),
  z.object({ action: z.literal('suppress'), email }),
  z.object({ action: z.literal('unsuppress'), email }),
]);

async function store(): Promise<EmailDb> {
  const db = await emailStore();
  if (!db) throw new EmailError('The email database (EMAIL_DB) is not bound to this Worker.');
  return db;
}

function checkSendable(content: CampaignContent) {
  const problem = contentProblem(content);
  if (problem) throw new EmailError(problem);
}

function ready(provider: z.output<typeof providerSchema>) {
  const info = providerInfo(provider);
  if (!info.configured) throw new EmailError(`${info.label} is not set up. ${info.setup}`);
  return info;
}

async function audienceRecipients(audience: z.output<typeof audienceSchema>) {
  const connection = connectAdminDb({ statementTimeoutMs: 20_000 });
  try { return await resolveAudience(connection.db, audience); } finally { await connection.close(); }
}

export async function GET(request: Request) {
  const access = authorizeRequest(request, { role: 'founder' });
  if ('response' in access) return access.response;
  try {
    const url = new URL(request.url);
    const db = await emailStore();
    const campaign = url.searchParams.get('campaign');
    if (campaign) {
      const s = await store();
      const campaignId = id.parse(campaign);
      await sweepStale(s, campaignId);
      await finishIfDone(s, campaignId);
      const row = await getCampaign(s, campaignId);
      if (!row) return json({ error: 'That campaign no longer exists.' }, 404);
      const problems = row.status === 'draft' ? [] : await listSends(s, row.id, 'failed');
      return json({ campaign: row, failed: problems });
    }
    if (url.searchParams.has('suppressions')) return json(await listSuppressions(await store()));
    return json({
      campaigns: db ? await listCampaigns(db) : [],
      providers: providers(),
      setup: { store: Boolean(db), linkSecret: linkSecretConfigured() },
      testAddress: process.env.DASHBOARD_ADMIN_EMAIL?.trim() || process.env.ADMIN_EMAILS?.split(',')[0]?.trim() || '',
    });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: error.issues[0].message }, 400);
    if (error instanceof EmailError) return json({ error: error.message }, 400);
    console.error('[admin/email] Read failed', error instanceof Error ? error.message : String(error));
    return json({ error: 'Email data could not be loaded. Try refreshing.' }, 502);
  }
}

export async function POST(request: Request) {
  const access = authorizeRequest(request, { role: 'founder', sameOrigin: true });
  if ('response' in access) return access.response;
  const text = await request.text();
  if (text.length > 600_000) return json({ error: 'Request too large.' }, 413);
  let input: z.output<typeof actionSchema>;
  try { input = actionSchema.parse(JSON.parse(text)); }
  catch (error) { return json({ error: error instanceof z.ZodError ? error.issues[0].message : 'Invalid request.' }, 400); }
  const origin = new URL(request.url).origin;
  try {
    switch (input.action) {
      case 'create': return json({ id: await createCampaign(await store(), input.draft) });
      case 'save': await saveDraft(await store(), input.id, input.draft); return json({ ok: true });
      case 'delete': await deleteDraft(await store(), input.id); return json({ ok: true });
      case 'count': {
        const [recipients, suppressed] = await Promise.all([audienceRecipients(input.audience), store().then(suppressedSet)]);
        return json(summarize(recipients, suppressed));
      }
      case 'test': {
        checkSendable(input.content); ready(input.provider);
        return json({ results: await sendTest(input.provider, input.content, input.to, input.locales, input.name, origin) });
      }
      case 'start': {
        const db = await store();
        checkSendable(input.draft.content);
        const info = ready(input.provider);
        if (!linkSecretConfigured()) throw new EmailError('EMAIL_LINK_SECRET is not set, so unsubscribe links cannot be made. Set it before sending.');
        await saveDraft(db, input.id, input.draft);
        const recipients = await audienceRecipients(input.draft.audience);
        const suppressed = await suppressedSet(db);
        if (!recipients.some(r => !suppressed.has(r.email.toLowerCase()))) throw new EmailError(recipients.length ? 'Everyone in that audience has unsubscribed or bounced.' : 'Nobody matches that audience.');
        if (!await startCampaign(db, input.id, input.draft, recipients, input.provider, info.from)) throw new EmailError('That campaign has already started.');
        return json({ campaign: await getCampaign(db, input.id) });
      }
      case 'deliver': {
        const db = await store();
        const campaign = await getCampaign(db, input.id);
        if (!campaign) throw new EmailError('That campaign no longer exists.');
        const batch = await deliverBatch(db, campaign, origin);
        return json({ ...batch, campaign: await getCampaign(db, input.id) });
      }
      case 'cancel': { const db = await store(); await cancelCampaign(db, input.id); return json({ campaign: await getCampaign(db, input.id) }); }
      case 'translate': return json({ content: await translateContent(input.source, input.from, input.to) });
      case 'suppress': await suppress(await store(), input.email, 'manual', null); return json({ ok: true });
      case 'unsuppress': await unsuppress(await store(), input.email); return json({ ok: true });
    }
  } catch (error) {
    if (error instanceof EmailError) return json({ error: error.message }, 400);
    console.error(`[admin/email] ${input.action} failed`, error instanceof Error ? error.message : String(error));
    return json({ error: input.action === 'translate' ? 'Translation failed. Try again, or write this version by hand.' : 'That did not work. Refresh and try again.' }, 502);
  }
}
