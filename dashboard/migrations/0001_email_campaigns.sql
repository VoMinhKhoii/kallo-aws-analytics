-- The /email page's own store (D1 database kallo-admin-email). Kallo's
-- Postgres stays read-only for this feature: recipients are read from it at
-- send time, everything else lives here.

CREATE TABLE email_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'canceled')),
  -- JSON: { en: {subject, preheader, html}, vi: {...} }. Frozen once sending starts.
  content TEXT NOT NULL,
  -- JSON: the audience filter (lib/email/input.ts).
  audience TEXT NOT NULL,
  provider TEXT CHECK (provider IS NULL OR provider IN ('resend', 'cloudflare')),
  sender TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX email_campaigns_updated ON email_campaigns (updated_at);

-- One row per recipient of a started campaign: the send log, and the queue the
-- page drains in batches. status: queued -> sending -> sent | failed, or
-- skipped (unsubscribed before their turn, or the campaign was canceled).
CREATE TABLE email_sends (
  campaign_id TEXT NOT NULL,
  email TEXT NOT NULL,
  user_id TEXT,
  name TEXT,
  locale TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
  message_id TEXT,
  error TEXT,
  claimed_at TEXT,
  sent_at TEXT,
  PRIMARY KEY (campaign_id, email)
);
CREATE INDEX email_sends_status ON email_sends (campaign_id, status);

-- Addresses that never get campaign mail again: they unsubscribed, bounced,
-- or a founder added them by hand.
CREATE TABLE email_suppressions (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribed', 'bounced', 'manual')),
  campaign_id TEXT,
  created_at TEXT NOT NULL
);
