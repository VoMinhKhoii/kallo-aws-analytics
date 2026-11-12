import 'server-only';
import { sql } from 'drizzle-orm';
import { activePromoSql, payingSql, promoEndsSql } from '@/lib/admin/premium/targets/plan-sql';
import type { AppDb } from '@/lib/admin/db/client';

/** One UTC day of Premium starts: free grants given, first paid grants, and those paid while on free. */
export interface PremiumDay { date: string; freeStarted: number; paidStarted: number; upgraded: number }
/** How many free-Premium accounts lose access on a coming UTC day. */
export interface EndingDay { date: string; ending: number }

const lo = sql.raw(`(d::timestamp AT TIME ZONE 'UTC')`);
const hi = sql.raw(`((d + 1)::timestamp AT TIME ZONE 'UTC')`);

/** The last 30 UTC days, today included. A paid start is an account's first non-promo grant. */
export async function getPremiumTrend(db: AppDb): Promise<PremiumDay[]> {
  const rows = (await db.execute(sql`
    WITH days AS (SELECT generate_series(current_date - 29, current_date, interval '1 day')::date AS d),
    paid AS (
      SELECT user_id, min(starts_at) AS first FROM public.entitlement_grants
      WHERE source <> 'promo' AND entitlement_key IN ('premium', 'billing_subscription')
      GROUP BY user_id
    )
    SELECT to_char(d, 'YYYY-MM-DD') AS date,
      (SELECT count(*)::int FROM public.entitlement_grants g
        WHERE g.source = 'promo' AND g.entitlement_key = 'premium' AND g.environment = 'production'
          AND g.starts_at >= ${lo} AND g.starts_at < ${hi}) AS free_started,
      (SELECT count(*)::int FROM paid WHERE paid.first >= ${lo} AND paid.first < ${hi}) AS paid_started,
      (SELECT count(*)::int FROM paid WHERE paid.first >= ${lo} AND paid.first < ${hi} AND EXISTS (
        SELECT 1 FROM public.entitlement_grants promo
        WHERE promo.user_id = paid.user_id AND promo.source = 'promo'
          AND paid.first >= promo.starts_at AND paid.first < COALESCE(promo.expires_at, 'infinity')
      )) AS upgraded
    FROM days ORDER BY d
  `)) as unknown as { date: string; free_started: number; paid_started: number; upgraded: number }[];
  return rows.map((r) => ({ date: r.date, freeStarted: Number(r.free_started), paidStarted: Number(r.paid_started), upgraded: Number(r.upgraded) }));
}

/** The next 14 UTC days, today first: accounts whose free Premium ends that day. */
export async function getEndingByDay(db: AppDb): Promise<EndingDay[]> {
  const rows = (await db.execute(sql`
    WITH days AS (SELECT generate_series(current_date, current_date + 13, interval '1 day')::date AS d),
    ends AS (
      SELECT ${promoEndsSql(sql`u.id`)} AS ends_at FROM auth.users AS u
      WHERE ${activePromoSql(sql`u.id`)} AND NOT ${payingSql(sql`u.id`)}
    )
    SELECT to_char(d, 'YYYY-MM-DD') AS date,
      (SELECT count(*)::int FROM ends WHERE ends_at >= ${lo} AND ends_at < ${hi}) AS ending
    FROM days ORDER BY d
  `)) as unknown as { date: string; ending: number }[];
  return rows.map((r) => ({ date: r.date, ending: Number(r.ending) }));
}
