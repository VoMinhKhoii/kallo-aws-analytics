import type { Locale } from './brand';
import type { CampaignContent } from './render';
import { EmailError, type Audience, type Draft, type ProviderId } from './input';

// The kallo-admin-email D1 database (migrations/). Only the slice of the D1
// binding used here is typed, as in lib/traces/d1.ts.
export interface Stmt {
  bind(...values: unknown[]): Stmt;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface EmailDb { prepare(query: string): Stmt; batch(statements: Stmt[]): Promise<{ results?: unknown[]; meta?: { changes: number } }[]> }

export async function emailStore(): Promise<EmailDb | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    return (getCloudflareContext().env as { EMAIL_DB?: EmailDb }).EMAIL_DB ?? null;
  } catch { return null; }
}

export type CampaignStatus = 'draft' | 'sending' | 'sent' | 'canceled';
export type SendStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';
export type Counts = Record<SendStatus, number>;
export interface CampaignRow { id: string; name: string; status: CampaignStatus; audience: Audience; provider: ProviderId | null; sender: string | null; total: number; createdAt: string; updatedAt: string; startedAt: string | null; finishedAt: string | null; counts: Counts }
export interface Campaign extends CampaignRow { content: CampaignContent }
export interface QueuedRecipient { email: string; userId: string | null; name: string | null; locale: Locale }
export interface Suppression { email: string; reason: 'unsubscribed' | 'bounced' | 'manual'; campaignId: string | null; createdAt: string }

/** A sending row left unanswered this long is not retried: it may have gone out. */
export const STALE_CLAIM_MS = 10 * 60_000;

interface Raw { id: string; name: string; status: CampaignStatus; content?: string; audience: string; provider: ProviderId | null; sender: string | null; total: number; created_at: string; updated_at: string; started_at: string | null; finished_at: string | null; queued: number | null; sending: number | null; sent: number | null; failed: number | null; skipped: number | null }
const counted = `SELECT campaign_id, sum(status='queued') AS queued, sum(status='sending') AS sending, sum(status='sent') AS sent, sum(status='failed') AS failed, sum(status='skipped') AS skipped FROM email_sends`;
const row = (r: Raw): CampaignRow => ({ id: r.id, name: r.name, status: r.status, audience: JSON.parse(r.audience), provider: r.provider, sender: r.sender, total: r.total, createdAt: r.created_at, updatedAt: r.updated_at, startedAt: r.started_at, finishedAt: r.finished_at, counts: { queued: r.queued ?? 0, sending: r.sending ?? 0, sent: r.sent ?? 0, failed: r.failed ?? 0, skipped: r.skipped ?? 0 } });

export async function listCampaigns(db: EmailDb): Promise<CampaignRow[]> {
  const { results } = await db.prepare(`SELECT c.id, c.name, c.status, c.audience, c.provider, c.sender, c.total, c.created_at, c.updated_at, c.started_at, c.finished_at, s.queued, s.sending, s.sent, s.failed, s.skipped
    FROM email_campaigns c LEFT JOIN (${counted} GROUP BY campaign_id) s ON s.campaign_id = c.id ORDER BY c.updated_at DESC LIMIT 200`).all<Raw>();
  return results.map(row);
}

export async function getCampaign(db: EmailDb, id: string): Promise<Campaign | null> {
  const r = await db.prepare(`SELECT c.*, s.queued, s.sending, s.sent, s.failed, s.skipped FROM email_campaigns c LEFT JOIN (${counted} WHERE campaign_id = ?1 GROUP BY campaign_id) s ON s.campaign_id = c.id WHERE c.id = ?1`).bind(id).first<Raw>();
  return r ? { ...row(r), content: JSON.parse(r.content!) } : null;
}

export async function createCampaign(db: EmailDb, draft: Draft, now = new Date()): Promise<string> {
  const id = crypto.randomUUID(); const at = now.toISOString();
  await db.prepare(`INSERT INTO email_campaigns (id, name, content, audience, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(id, draft.name, JSON.stringify(draft.content), JSON.stringify(draft.audience), at, at).run();
  return id;
}

const NOT_DRAFT = 'That campaign has already been sent. Duplicate it to make changes.';
export async function saveDraft(db: EmailDb, id: string, draft: Draft, now = new Date()): Promise<void> {
  const { meta } = await db.prepare(`UPDATE email_campaigns SET name = ?, content = ?, audience = ?, updated_at = ? WHERE id = ? AND status = 'draft'`).bind(draft.name, JSON.stringify(draft.content), JSON.stringify(draft.audience), now.toISOString(), id).run();
  if (!meta.changes) throw new EmailError(NOT_DRAFT);
}

export async function deleteDraft(db: EmailDb, id: string): Promise<void> {
  const { meta } = await db.prepare(`DELETE FROM email_campaigns WHERE id = ? AND status = 'draft'`).bind(id).run();
  if (!meta.changes) throw new EmailError(NOT_DRAFT);
}

/**
 * Freeze the draft and queue its recipients, in one transaction. Recipients
 * already on the suppression list are logged as skipped. Returns false when the
 * campaign was no longer a draft (a second click, another tab).
 */
export async function startCampaign(db: EmailDb, id: string, draft: Draft, recipients: QueuedRecipient[], provider: ProviderId, sender: string, now = new Date()): Promise<boolean> {
  const at = now.toISOString();
  const isDraft = `(SELECT status FROM email_campaigns WHERE id = ?1) = 'draft'`;
  const inserts: Stmt[] = [];
  for (let i = 0; i < recipients.length; i += 500) {
    const chunk = recipients.slice(i, i + 500).map(r => ({ e: r.email.toLowerCase(), u: r.userId, n: r.name, l: r.locale }));
    inserts.push(db.prepare(`INSERT OR IGNORE INTO email_sends (campaign_id, email, user_id, name, locale, status, error)
      SELECT ?1, j.value ->> '$.e', j.value ->> '$.u', j.value ->> '$.n', j.value ->> '$.l',
        CASE WHEN x.email IS NULL THEN 'queued' ELSE 'skipped' END, CASE WHEN x.email IS NULL THEN NULL ELSE 'On the suppression list (' || x.reason || ')' END
      FROM json_each(?2) j LEFT JOIN email_suppressions x ON x.email = j.value ->> '$.e' WHERE ${isDraft}`).bind(id, JSON.stringify(chunk)));
  }
  const results = await db.batch([
    ...inserts,
    db.prepare(`UPDATE email_campaigns SET status = 'sending', name = ?2, content = ?3, audience = ?4, provider = ?5, sender = ?6, total = (SELECT count(*) FROM email_sends WHERE campaign_id = ?1), started_at = ?7, updated_at = ?7 WHERE id = ?1 AND status = 'draft'`)
      .bind(id, draft.name, JSON.stringify(draft.content), JSON.stringify(draft.audience), provider, sender, at),
  ]);
  return (results.at(-1)?.meta?.changes ?? 0) > 0;
}

/**
 * Take up to `limit` queued recipients for this caller. Rows unsubscribed
 * since queueing are skipped first, and rows another call claimed and never
 * answered for are failed, never re-sent.
 */
export async function claimBatch(db: EmailDb, id: string, limit: number, now = new Date()): Promise<QueuedRecipient[]> {
  const at = now.toISOString(); const stale = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
  const [, , claimed] = await db.batch([
    db.prepare(`UPDATE email_sends SET status = 'skipped', error = 'Unsubscribed before their turn' WHERE campaign_id = ? AND status = 'queued' AND email IN (SELECT email FROM email_suppressions)`).bind(id),
    db.prepare(`UPDATE email_sends SET status = 'failed', error = 'The send was interrupted; it may or may not have been delivered' WHERE campaign_id = ? AND status = 'sending' AND claimed_at < ?`).bind(id, stale),
    db.prepare(`UPDATE email_sends SET status = 'sending', claimed_at = ?3 WHERE rowid IN (SELECT rowid FROM email_sends WHERE campaign_id = ?1 AND status = 'queued' ORDER BY rowid LIMIT ?2) AND (SELECT status FROM email_campaigns WHERE id = ?1) = 'sending' RETURNING email, user_id, name, locale`).bind(id, limit, at),
  ]);
  return ((claimed.results ?? []) as { email: string; user_id: string | null; name: string | null; locale: Locale }[]).map(r => ({ email: r.email, userId: r.user_id, name: r.name, locale: r.locale }));
}

export type Outcome = { email: string } & ({ status: 'sent'; messageId: string | null } | { status: 'failed'; error: string; bounced?: boolean } | { status: 'retry' });

export async function recordOutcomes(db: EmailDb, id: string, outcomes: Outcome[], now = new Date()): Promise<void> {
  if (!outcomes.length) return;
  const at = now.toISOString();
  await db.batch(outcomes.flatMap(o => {
    if (o.status === 'retry') return [db.prepare(`UPDATE email_sends SET status = 'queued', claimed_at = NULL WHERE campaign_id = ? AND email = ? AND status = 'sending'`).bind(id, o.email)];
    if (o.status === 'sent') return [db.prepare(`UPDATE email_sends SET status = 'sent', message_id = ?, sent_at = ? WHERE campaign_id = ? AND email = ?`).bind(o.messageId, at, id, o.email)];
    const fail = db.prepare(`UPDATE email_sends SET status = 'failed', error = ? WHERE campaign_id = ? AND email = ?`).bind(o.error.slice(0, 500), id, o.email);
    return o.bounced ? [fail, db.prepare(`INSERT OR IGNORE INTO email_suppressions (email, reason, campaign_id, created_at) VALUES (?, 'bounced', ?, ?)`).bind(o.email, id, at)] : [fail];
  }));
}

/** Mark the campaign sent once nothing is left queued or in flight. */
export async function finishIfDone(db: EmailDb, id: string, now = new Date()): Promise<void> {
  await db.prepare(`UPDATE email_campaigns SET status = 'sent', finished_at = ?2, updated_at = ?2 WHERE id = ?1 AND status = 'sending' AND NOT EXISTS (SELECT 1 FROM email_sends WHERE campaign_id = ?1 AND status IN ('queued', 'sending'))`).bind(id, now.toISOString()).run();
}

/** Stop a send: recipients still queued are skipped. Emails already out stay out. */
export async function cancelCampaign(db: EmailDb, id: string, now = new Date()): Promise<void> {
  const at = now.toISOString();
  await db.batch([
    db.prepare(`UPDATE email_sends SET status = 'skipped', error = 'Campaign canceled' WHERE campaign_id = ? AND status = 'queued'`).bind(id),
    db.prepare(`UPDATE email_campaigns SET status = 'canceled', finished_at = ?2, updated_at = ?2 WHERE id = ?1 AND status = 'sending'`).bind(id, at),
  ]);
}

export async function listSends(db: EmailDb, id: string, status: SendStatus | null, limit = 200): Promise<{ email: string; locale: Locale; status: SendStatus; error: string | null; sentAt: string | null }[]> {
  const { results } = await (status
    ? db.prepare(`SELECT email, locale, status, error, sent_at FROM email_sends WHERE campaign_id = ? AND status = ? ORDER BY rowid LIMIT ?`).bind(id, status, limit)
    : db.prepare(`SELECT email, locale, status, error, sent_at FROM email_sends WHERE campaign_id = ? ORDER BY rowid LIMIT ?`).bind(id, limit)
  ).all<{ email: string; locale: Locale; status: SendStatus; error: string | null; sent_at: string | null }>();
  return results.map(r => ({ email: r.email, locale: r.locale, status: r.status, error: r.error, sentAt: r.sent_at }));
}

export async function suppressedSet(db: EmailDb): Promise<Set<string>> {
  const { results } = await db.prepare(`SELECT email FROM email_suppressions`).all<{ email: string }>();
  return new Set(results.map(r => r.email));
}

export async function listSuppressions(db: EmailDb, limit = 500): Promise<{ rows: Suppression[]; total: number }> {
  const [list, total] = await db.batch([
    db.prepare(`SELECT email, reason, campaign_id, created_at FROM email_suppressions ORDER BY created_at DESC LIMIT ?`).bind(limit),
    db.prepare(`SELECT count(*) AS n FROM email_suppressions`),
  ]);
  const rows = (list.results ?? []) as { email: string; reason: Suppression['reason']; campaign_id: string | null; created_at: string }[];
  return { rows: rows.map(r => ({ email: r.email, reason: r.reason, campaignId: r.campaign_id, createdAt: r.created_at })), total: Number((total.results?.[0] as { n: number } | undefined)?.n ?? 0) };
}

export async function suppress(db: EmailDb, email: string, reason: Suppression['reason'], campaignId: string | null, now = new Date()): Promise<void> {
  await db.prepare(`INSERT OR IGNORE INTO email_suppressions (email, reason, campaign_id, created_at) VALUES (?, ?, ?, ?)`).bind(email.trim().toLowerCase(), reason, campaignId, now.toISOString()).run();
}

export async function unsuppress(db: EmailDb, email: string): Promise<void> {
  await db.prepare(`DELETE FROM email_suppressions WHERE email = ?`).bind(email.trim().toLowerCase()).run();
}
