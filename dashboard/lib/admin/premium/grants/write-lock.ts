import 'server-only';
import { sql } from 'drizzle-orm';
import type { AppDb } from '@/lib/admin/db/client';

/**
 * Serializes Premium writes (give, end, undo) for the rest of the transaction, so an
 * undo's replacement-chain walk always sees another operator's committed undo.
 */
export async function lockPremiumWrites(db: AppDb): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('kallo-admin:premium-writes'))`);
}
