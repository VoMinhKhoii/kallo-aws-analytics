import 'server-only';
import { type SQL, sql } from 'drizzle-orm';
import type { AppDb } from '@/lib/admin/db/client';
import { activePromoSql, payingSql } from '@/lib/admin/premium/targets/plan-sql';
import { EmailError, type Audience } from './input';
import type { QueuedRecipient } from './store';

/** A safety stop: a list this big needs a real queue, not a browser tab. */
export const MAX_RECIPIENTS = 20_000;

const meal = (days: number) => sql`EXISTS (SELECT 1 FROM public.meals m WHERE m.user_id = u.id AND m.logged_at > now() - make_interval(days => ${days}))`;

/**
 * The audience as a condition over `auth.users AS u`. Every kind only reaches
 * real, confirmed addresses: no anonymous, deleted or unconfirmed accounts.
 */
function audienceCondition(a: Audience): SQL {
  const parts: SQL[] = [sql`u.email IS NOT NULL AND u.email <> '' AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND coalesce(u.is_anonymous, false) = false`];
  if (a.kind === 'users') parts.push(sql`u.id IN (${sql.join(a.userIds.map(id => sql`${id}::uuid`), sql`, `)})`);
  if (a.kind === 'group') {
    if (a.plan === 'paying') parts.push(payingSql(sql`u.id`));
    if (a.plan === 'complimentary') parts.push(sql`NOT ${payingSql(sql`u.id`)} AND ${activePromoSql(sql`u.id`)}`);
    if (a.plan === 'free') parts.push(sql`NOT ${payingSql(sql`u.id`)} AND NOT ${activePromoSql(sql`u.id`)}`);
    if (a.activity === 'active7') parts.push(meal(7));
    if (a.activity === 'active30') parts.push(meal(30));
    if (a.activity === 'inactive30') parts.push(sql`NOT ${meal(30)}`);
    if (a.language !== 'any') parts.push(sql`coalesce(p.preferred_locale, 'en') = ${a.language}`);
    if (a.joinedFrom) parts.push(sql`u.created_at >= ${a.joinedFrom}::date`);
    if (a.joinedTo) parts.push(sql`u.created_at < (${a.joinedTo}::date + interval '1 day')`);
  }
  return sql.join(parts, sql` AND `);
}

export async function resolveAudience(db: AppDb, a: Audience): Promise<QueuedRecipient[]> {
  const rows = (await db.execute(sql`
    SELECT u.id::text AS user_id, lower(u.email) AS email, pp.display_name AS name, CASE WHEN p.preferred_locale = 'vi' THEN 'vi' ELSE 'en' END AS locale
    FROM auth.users AS u
    LEFT JOIN public.user_profiles AS p ON p.user_id = u.id
    LEFT JOIN public.public_profiles AS pp ON pp.user_id = u.id
    WHERE ${audienceCondition(a)}
    ORDER BY u.created_at
    LIMIT ${MAX_RECIPIENTS + 1}
  `)) as unknown as { user_id: string; email: string; name: string | null; locale: 'en' | 'vi' }[];
  if (rows.length > MAX_RECIPIENTS) throw new EmailError(`That audience is over ${MAX_RECIPIENTS.toLocaleString('en')} people. Narrow it down and send in parts.`);
  // Two accounts can share an address only in theory; one email each.
  const seen = new Set<string>();
  return rows.filter(r => !seen.has(r.email) && seen.add(r.email)).map(r => ({ email: r.email, userId: r.user_id, name: r.name, locale: r.locale }));
}

export interface AudienceCount { total: number; reachable: number; suppressed: number; byLocale: { en: number; vi: number }; sample: { email: string; name: string | null; locale: 'en' | 'vi' }[] }

export function summarize(recipients: QueuedRecipient[], suppressed: Set<string>): AudienceCount {
  const reachable = recipients.filter(r => !suppressed.has(r.email));
  return {
    total: recipients.length,
    reachable: reachable.length,
    suppressed: recipients.length - reachable.length,
    byLocale: { en: reachable.filter(r => r.locale === 'en').length, vi: reachable.filter(r => r.locale === 'vi').length },
    sample: reachable.slice(0, 5).map(r => ({ email: r.email, name: r.name, locale: r.locale })),
  };
}
