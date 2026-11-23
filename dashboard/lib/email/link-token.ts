import { createHmac, timingSafeEqual } from 'node:crypto';
import { LOCALES, type Locale } from './brand';
import { EmailError } from './input';

// Unsubscribe links carry the address and its language, signed with
// EMAIL_LINK_SECRET, so the public route needs no login and no lookup. The
// links never expire: an unsubscribe link must keep working (CAN-SPAM: 30 days
// at least), and rotating the secret breaks every link already sent.

export interface LinkClaims { email: string; locale: Locale; campaignId: string | null }

function secret(): string {
  const value = process.env.EMAIL_LINK_SECRET?.trim();
  if (!value || value.length < 32) throw new EmailError('EMAIL_LINK_SECRET is not set (32+ characters). Unsubscribe links cannot be made without it.');
  return value;
}
const sign = (payload: string, key: string) => createHmac('sha256', key).update('kallo-email-unsubscribe:' + payload).digest('base64url');

export function linkSecretConfigured(): boolean {
  try { secret(); return true; } catch { return false; }
}

export function createLinkToken(claims: LinkClaims): string {
  const payload = Buffer.from(JSON.stringify({ e: claims.email.toLowerCase(), l: claims.locale, c: claims.campaignId })).toString('base64url');
  return `${payload}.${sign(payload, secret())}`;
}

export function verifyLinkToken(token: string | null | undefined): LinkClaims | null {
  if (!token || token.length > 2000) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  let key: string;
  try { key = secret(); } catch { return null; }
  const a = Buffer.from(signature, 'base64url'); const b = Buffer.from(sign(payload, key), 'base64url');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { e?: unknown; l?: unknown; c?: unknown };
    if (typeof raw.e !== 'string' || !raw.e.includes('@')) return null;
    const locale = (LOCALES as readonly unknown[]).includes(raw.l) ? raw.l as Locale : 'en';
    return { email: raw.e, locale, campaignId: typeof raw.c === 'string' ? raw.c : null };
  } catch { return null; }
}

export function unsubscribeUrl(origin: string, claims: LinkClaims): string {
  return `${origin}/api/email/unsubscribe?t=${encodeURIComponent(createLinkToken(claims))}`;
}
