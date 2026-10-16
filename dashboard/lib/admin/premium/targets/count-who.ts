import 'server-only';
import { sql } from 'drizzle-orm';
import { payingSql, endablePromoSql } from '@/lib/admin/premium/targets/plan-sql';
import { whoCondition } from '@/lib/admin/premium/targets/resolve-who';
import type { Who } from '@/lib/admin/premium/targets/who-input';
import type { AppDb } from '@/lib/admin/db/client';

export interface WhoCount {
  /** Accounts the action would change. */
  accounts: number;
  /** Picked or matched accounts left alone because they pay. */
  payingSkipped: number;
}

/** The preview shown before confirming: how many accounts a Who reaches. */
export async function countWho(db: AppDb, who: Who, action: 'give' | 'end' = 'give'): Promise<WhoCount> {
  const [row] = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE ${whoCondition(who)} AND ${action === 'end' ? sql`EXISTS (SELECT 1 FROM public.entitlement_grants g WHERE g.user_id=u.id AND ${endablePromoSql('g')})` : sql`true`})::int AS accounts,
      ${
        who.kind === 'users'
          ? sql`count(*) FILTER (WHERE u.id IN (${sql.join(
              who.userIds.map((id) => sql`${id}::uuid`),
              sql`, `
            )}) AND ${payingSql(sql`u.id`)})::int`
          : sql`0`
      } AS paying_skipped
    FROM auth.users AS u
  `)) as unknown as { accounts: number; paying_skipped: number }[];
  return {
    accounts: row?.accounts ?? 0,
    payingSkipped: row?.paying_skipped ?? 0,
  };
}
