import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { cancelCampaign, claimBatch, createCampaign, getCampaign, recordOutcomes, saveDraft, startCampaign, suppress, sweepStale, STALE_CLAIM_MS, type EmailDb, type QueuedRecipient } from '../store';
import { deliverBatch } from '../deliver';
import { verifyLinkToken } from '../link-token';
import type { Draft } from '../input';

// The real migration in real SQLite, behind the slice of the D1 API the store
// uses (batch = one transaction, as in D1).
function d1(): EmailDb {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../../migrations/0001_email_campaigns.sql', import.meta.url), 'utf8'));
  const returns = (q: string) => /^\s*SELECT|\bRETURNING\b/i.test(q);
  const make = (q: string, values: unknown[] = []) => {
    // node:sqlite cannot bind ?1-style numbered parameters positionally; D1 can.
    const numbered = /\?\d/.test(q);
    const args = (numbered ? [Object.fromEntries(values.map((v, i) => [`p${i + 1}`, v]))] : values) as never[];
    const exec = () => {
      const s = db.prepare(numbered ? q.replace(/\?(\d+)/g, '$p$1') : q);
      if (returns(q)) { const results = s.all(...args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(s.run(...args).changes) } };
    };
    return {
      bind: (...v: unknown[]) => make(q, v),
      all: async <T,>() => ({ results: exec().results as T[] }),
      first: async <T,>() => (exec().results[0] ?? null) as T | null,
      run: async () => ({ meta: exec().meta }),
      exec,
    };
  };
  return {
    prepare: (q: string) => make(q),
    batch: async (statements: unknown[]) => {
      db.exec('BEGIN');
      try { const out = (statements as ReturnType<typeof make>[]).map(s => s.exec()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  } as unknown as EmailDb;
}

const draft: Draft = {
  name: 'Launch',
  content: { en: { subject: 'Hi {{name}}', preheader: '', html: '<p>Hello {{name}}</p>' }, vi: { subject: 'Chào {{name}}', preheader: '', html: '<p>Xin chào {{name}}</p>' } },
  audience: { kind: 'everyone' },
};
const people = (n: number, locale: 'en' | 'vi' = 'en'): QueuedRecipient[] => Array.from({ length: n }, (_, i) => ({ email: `p${i}@example.test`, userId: null, name: `P${i}`, locale }));
const origin = 'https://admin.example';

interface Call { url: string; body: unknown }
function fakeResend(reply: (call: Call) => Response = call => Response.json({ data: (call.body as unknown[]).map((_, i) => ({ id: 'm' + i })) })) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init: RequestInit) => { const call = { url, body: JSON.parse(String(init.body)) }; calls.push(call); return reply(call); }) as unknown as typeof fetch;
  return { calls, fetcher };
}

function env() {
  process.env.EMAIL_LINK_SECRET = 'z'.repeat(40);
  process.env.RESEND_API_KEY = 're_test';
  process.env.CLOUDFLARE_EMAIL_API_TOKEN = 'cf_test';
}

test('a campaign queues once, skips suppressed addresses, sends in batches with personal unsubscribe links, and finishes', async () => {
  env();
  const db = d1();
  const id = await createCampaign(db, draft);
  await suppress(db, 'P3@example.test', 'unsubscribed', null);
  const list = [...people(60), { email: 'vi@example.test', userId: null, name: null, locale: 'vi' as const }];
  assert.equal(await startCampaign(db, id, draft, list, 'resend', 'Kallo <hello@news.kallo.fit>'), true);
  assert.equal(await startCampaign(db, id, draft, list, 'resend', 'x'), false, 'a second start is refused');
  await assert.rejects(saveDraft(db, id, draft), /already been sent/);

  let campaign = (await getCampaign(db, id))!;
  assert.equal(campaign.total, 61);
  assert.deepEqual(campaign.counts, { queued: 60, sending: 0, sent: 0, failed: 0, skipped: 1 });

  const { calls, fetcher } = fakeResend();
  const first = await deliverBatch(db, campaign, origin, { fetcher });
  assert.equal(first.claimed, 50);
  const sent = calls[0].body as { to: string[]; subject: string; html: string; text: string; headers: Record<string, string> }[];
  assert.equal(sent.length, 50);
  assert.equal(sent[0].subject, 'Hi P0');
  const link = sent[0].headers['List-Unsubscribe'].slice(1, -1);
  assert.equal(sent[0].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.ok(sent[0].html.includes(link.replace(/&/g, '&amp;')) && sent[0].text.includes(link));
  assert.deepEqual(verifyLinkToken(new URL(link).searchParams.get('t')), { email: 'p0@example.test', locale: 'en', campaignId: id });

  campaign = (await getCampaign(db, id))!;
  await deliverBatch(db, campaign, origin, { fetcher });
  const viMail = (calls[1].body as { to: string[]; subject: string }[]).find(m => m.to[0] === 'vi@example.test')!;
  assert.equal(viMail.subject, 'Chào bạn');
  campaign = (await getCampaign(db, id))!;
  assert.equal(campaign.status, 'sent');
  assert.deepEqual(campaign.counts, { queued: 0, sending: 0, sent: 60, failed: 0, skipped: 1 });
  assert.equal((await deliverBatch(db, campaign, origin, { fetcher })).claimed, 0, 'nothing is sent twice');
  assert.equal(calls.length, 2);
});

test('throttling puts a batch back, other failures are logged once, and bounces join the suppression list', async () => {
  env();
  const db = d1();
  const id = await createCampaign(db, draft);
  await startCampaign(db, id, draft, people(3), 'cloudflare', 'Kallo <notifications@mail.kallo.fit>');
  let mode = 'throttle';
  const fetcher = (async (_url: string, init: RequestInit) => {
    const to = JSON.parse(String(init.body)).to[0];
    if (mode === 'throttle') return Response.json({ success: false, errors: [{ code: 10004, message: 'throttled' }] }, { status: 429 });
    if (to === 'p1@example.test') return Response.json({ success: true, result: { message_id: null, permanent_bounces: [to] } });
    if (to === 'p2@example.test') return Response.json({ success: false, errors: [{ code: 1, message: 'boom' }] }, { status: 500 });
    return Response.json({ success: true, result: { message_id: 'ok' } });
  }) as unknown as typeof fetch;

  let result = await deliverBatch(db, (await getCampaign(db, id))!, origin, { fetcher });
  assert.equal(result.throttled, 'Cloudflare 429: 10004 throttled', 'the provider message comes back so the page can show it');
  assert.equal((await getCampaign(db, id))!.counts.queued, 3);

  mode = 'normal';
  result = await deliverBatch(db, (await getCampaign(db, id))!, origin, { fetcher });
  const campaign = (await getCampaign(db, id))!;
  assert.deepEqual(campaign.counts, { queued: 0, sending: 0, sent: 1, failed: 2, skipped: 0 });
  assert.equal(campaign.status, 'sent');
  const later = await createCampaign(db, draft);
  await startCampaign(db, later, draft, people(3), 'resend', 'x');
  assert.equal((await getCampaign(db, later))!.counts.skipped, 1, 'the bounced address is skipped next time');
});

test('an unanswered claim is failed, not re-sent; unsubscribing mid-send and canceling skip the rest', async () => {
  env();
  const db = d1();
  const id = await createCampaign(db, draft);
  await startCampaign(db, id, draft, people(5), 'resend', 'x');
  const t0 = new Date('2026-11-22T00:00:00Z');
  assert.equal((await claimBatch(db, id, 1, t0)).length, 1);
  await suppress(db, 'p1@example.test', 'unsubscribed', id);
  const t1 = new Date(t0.getTime() + STALE_CLAIM_MS + 1);
  assert.deepEqual((await claimBatch(db, id, 1, t1)).map(r => r.email), ['p2@example.test']);
  let counts = (await getCampaign(db, id))!.counts;
  assert.deepEqual(counts, { queued: 2, sending: 1, sent: 0, failed: 1, skipped: 1 });
  await cancelCampaign(db, id);
  const campaign = (await getCampaign(db, id))!;
  counts = campaign.counts;
  assert.equal(campaign.status, 'canceled');
  assert.equal(counts.queued, 0);
  assert.equal(counts.skipped, 3);
  assert.equal((await claimBatch(db, id, 10)).length, 0, 'a canceled campaign hands out nothing');
});

test('a dropped connection fails the batch instead of resending it, and an unset sender is refused before anything is claimed', async () => {
  env();
  const db = d1();
  const id = await createCampaign(db, draft);
  await startCampaign(db, id, draft, people(3), 'resend', 'Kallo <hello@news.kallo.fit>');
  let campaign = (await getCampaign(db, id))!;

  // Resend may have accepted the batch before the connection dropped.
  let calls = 0;
  const dropped = (async () => { calls++; throw new TypeError('network connection lost'); }) as unknown as typeof fetch;
  const result = await deliverBatch(db, campaign, origin, { fetcher: dropped });
  assert.deepEqual(result, { claimed: 3, throttled: null, stalled: false });
  campaign = (await getCampaign(db, id))!;
  assert.deepEqual(campaign.counts, { queued: 0, sending: 0, sent: 0, failed: 3, skipped: 0 });
  assert.equal((await deliverBatch(db, campaign, origin, { fetcher: dropped })).claimed, 0);
  assert.equal(calls, 1, 'the batch is never sent a second time');

  const id2 = await createCampaign(db, draft);
  await startCampaign(db, id2, draft, people(2), 'resend', 'x');
  delete process.env.RESEND_API_KEY;
  await assert.rejects(deliverBatch(db, (await getCampaign(db, id2))!, origin, { fetcher: dropped }), /Resend is not set up/);
  assert.deepEqual((await getCampaign(db, id2))!.counts, { queued: 2, sending: 0, sent: 0, failed: 0, skipped: 0 }, 'nothing was claimed');
  env();
});

test('a refused key pauses the send with nothing lost, and Stop during a throttled batch skips those rows instead of re-queueing them', async () => {
  env();
  const db = d1();
  const id = await createCampaign(db, draft);
  await startCampaign(db, id, draft, people(4), 'resend', 'x');
  const refused = fakeResend(() => Response.json({ message: 'API key is invalid' }, { status: 401 }));
  await assert.rejects(deliverBatch(db, (await getCampaign(db, id))!, origin, { fetcher: refused.fetcher }), /API key is invalid.*were not sent/);
  assert.deepEqual((await getCampaign(db, id))!.counts, { queued: 4, sending: 0, sent: 0, failed: 0, skipped: 0 }, 'the batch went back, untouched');

  // Stop lands while a batch is out; the provider then throttles it.
  const claimed = await claimBatch(db, id, 4);
  await cancelCampaign(db, id);
  await recordOutcomes(db, id, claimed.map(r => ({ email: r.email, status: 'retry' as const })));
  assert.deepEqual((await getCampaign(db, id))!.counts, { queued: 0, sending: 0, sent: 0, failed: 0, skipped: 4 });
});

test('opening a stopped campaign settles claims from a tab that closed mid-batch', async () => {
  env();
  const db = d1();
  const id = await createCampaign(db, draft);
  await startCampaign(db, id, draft, people(2), 'resend', 'x');
  const t0 = new Date('2026-11-23T00:00:00Z');
  await claimBatch(db, id, 2, t0);
  await cancelCampaign(db, id, t0);
  await sweepStale(db, id, new Date(t0.getTime() + STALE_CLAIM_MS + 1));
  assert.deepEqual((await getCampaign(db, id))!.counts, { queued: 0, sending: 0, sent: 0, failed: 2, skipped: 0 });
});

test('a missing link secret refuses before claiming, and a Cloudflare suppression fails the send without a permanent local bounce', async () => {
  env();
  const db = d1();
  const id = await createCampaign(db, draft);
  await startCampaign(db, id, draft, people(2), 'cloudflare', 'x');
  delete process.env.EMAIL_LINK_SECRET;
  await assert.rejects(deliverBatch(db, (await getCampaign(db, id))!, origin), /EMAIL_LINK_SECRET/);
  assert.deepEqual((await getCampaign(db, id))!.counts, { queued: 2, sending: 0, sent: 0, failed: 0, skipped: 0 }, 'nothing was claimed');
  env();

  const fetcher = (async (_url: string, init: RequestInit) => {
    const to = (JSON.parse(String(init.body)) as { to: string[] }).to[0];
    return Response.json({ success: true, result: { message_id: null, suppressed_recipients: to === 'p0@example.test' ? [to] : [] } });
  }) as unknown as typeof fetch;
  await deliverBatch(db, (await getCampaign(db, id))!, origin, { fetcher });
  assert.deepEqual((await getCampaign(db, id))!.counts, { queued: 0, sending: 0, sent: 1, failed: 1, skipped: 0 });
  const later = await createCampaign(db, draft);
  await startCampaign(db, later, draft, people(1), 'cloudflare', 'x');
  assert.equal((await getCampaign(db, later))!.counts.queued, 1, 'a temporary Cloudflare suppression does not block later campaigns');
});

test('a batch Resend rejects for one bad address is split until that address stands alone, so only it fails', async () => {
  env();
  const db = d1();
  const id = await createCampaign(db, draft);
  await startCampaign(db, id, draft, people(5), 'resend', 'x');
  const batches: number[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    assert.ok(url.endsWith('/emails/batch'), 'never one call per email');
    const body = JSON.parse(String(init.body)) as { to: string[] }[];
    batches.push(body.length);
    return body.some(m => m.to[0] === 'p3@example.test') ? Response.json({ message: 'Invalid `to` field' }, { status: 422 }) : Response.json({ data: body.map((_, k) => ({ id: 'm' + k })) });
  }) as unknown as typeof fetch;
  const result = await deliverBatch(db, (await getCampaign(db, id))!, origin, { fetcher });
  assert.deepEqual(result, { claimed: 5, throttled: null, stalled: false });
  assert.ok(batches.length <= 1 + Math.ceil(Math.log2(5)) * 2, `few calls (${batches.join(',')})`);
  assert.deepEqual((await getCampaign(db, id))!.counts, { queued: 0, sending: 0, sent: 4, failed: 1, skipped: 0 });
});

test('a batch counts as stalled only when nothing in it went out', async () => {
  env();
  const db = d1();
  const id = await createCampaign(db, draft);
  await startCampaign(db, id, draft, people(2), 'cloudflare', 'x');
  const fetcher = (async (_url: string, init: RequestInit) => {
    const to = (JSON.parse(String(init.body)) as { to: string[] }).to[0];
    return to === 'p0@example.test' ? Response.json({ success: false, errors: [{ code: 10004, message: 'throttled' }] }, { status: 429 }) : Response.json({ success: true, result: { message_id: 'x' } });
  }) as unknown as typeof fetch;
  const partly = await deliverBatch(db, (await getCampaign(db, id))!, origin, { fetcher });
  assert.equal(partly.stalled, false, 'one email went out, so this is progress');
  assert.ok(partly.throttled);
  const all = await deliverBatch(db, (await getCampaign(db, id))!, origin, { fetcher });
  assert.equal(all.stalled, true, 'only the throttled address was left, and it was throttled again');
});

test('a refusal that lands after Stop says the emails were not sent and leaves them skipped', async () => {
  env();
  const db = d1();
  const id = await createCampaign(db, draft);
  await startCampaign(db, id, draft, people(2), 'resend', 'x');
  const fetcher = (async () => { await cancelCampaign(db, id); return Response.json({ message: 'API key is invalid' }, { status: 401 }); }) as unknown as typeof fetch;
  await assert.rejects(deliverBatch(db, (await getCampaign(db, id))!, origin, { fetcher }), /were not sent/);
  assert.deepEqual((await getCampaign(db, id))!.counts, { queued: 0, sending: 0, sent: 0, failed: 0, skipped: 2 });
});
