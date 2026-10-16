import 'server-only';
import { sql } from 'drizzle-orm';
import type { AppDb } from '@/lib/admin/db/client';

/**
 * Serializes Premium writes (give, end, undo) for the rest of the transaction and
 * returns the database clock read while holding the lock. Actions record that time,
 * so their audit order is the order they ran in, which newest-first Undo relies on.
 */
export async function lockPremiumWrites(db: AppDb): Promise<Date> {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('kallo-admin:premium-writes'))`);
  const [row] = (await db.execute(sql`SELECT clock_timestamp() AS at`)) as unknown as { at: Date | string }[];
  return new Date(row.at);
}
