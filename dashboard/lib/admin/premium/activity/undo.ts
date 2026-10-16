import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { AdminUser } from '@/lib/admin/operator';
import { recordAudit } from '@/lib/admin/premium/activity/audit';
import { writeWelcomeOffer } from '@/lib/admin/premium/offer/offer';
import { Errors } from '@/lib/admin/errors';
import type { AppDb } from '@/lib/admin/db/client';
import { lockPremiumWrites } from '@/lib/admin/premium/grants/write-lock';
import { premiumGrantAudit } from '@/lib/admin/db/schema';

interface OfferSnapshot {
  enabled: boolean;
  days: number;
  autoOffAt: string | null;
}

// Undo goes newest-first per account: an action cannot be undone while a later
// grant or End that is still in force changed any of the same accounts. Then
// re-activating exactly what the action canceled is always the prior state.
const laterActionOnSameAccounts = (actionId: string, createdAt: Date) => sql`
  SELECT 1 FROM public.premium_grant_audit AS later
  WHERE later.id <> ${actionId}::uuid AND later.undone_at IS NULL
    AND later.action IN ('grant', 'end') AND later.created_at > ${createdAt.toISOString()}::timestamptz
    AND EXISTS (
      SELECT 1 FROM public.entitlement_grants AS mine
      JOIN public.entitlement_grants AS theirs ON theirs.user_id = mine.user_id
      WHERE (mine.external_ref LIKE ${`admin:${actionId}:%`} OR mine.canceled_by_action = ${actionId}::uuid)
        AND (theirs.external_ref LIKE 'admin:' || later.id::text || ':%' OR theirs.canceled_by_action = later.id))
  LIMIT 1`;

/**
 * Reverses exactly what one action did, and logs the undo:
 *  - grant: cancels the grants it created that are still active;
 *  - end:   restores the grants it canceled (any past their end date simply
 *           stay expired by the clock);
 *  - offer: puts the welcome offer back to its settings before the change.
 * An action can be undone once; an undo itself cannot be undone.
 */
export async function undoAction(
  admin: AdminUser,
  actionId: string,
  reason: string,
  deps: { db: AppDb; now?: () => Date }
): Promise<{ userCount: number }> {
  const now = deps.now?.() ?? new Date();
  const undoId = crypto.randomUUID();
  const nowIso = now.toISOString();

  return deps.db.transaction(async (tx) => {
    const db = tx as unknown as AppDb;
    await lockPremiumWrites(db);
    // Claim the action first: a concurrent second undo finds nothing left.
    const [action] = await db
      .update(premiumGrantAudit)
      .set({ undoneAt: now, undoneByEmail: admin.email })
      .where(
        and(
          eq(premiumGrantAudit.id, actionId),
          isNull(premiumGrantAudit.undoneAt),
          sql`${premiumGrantAudit.action} <> 'undo'`
        )
      )
      .returning();
    if (!action) {
      throw Errors.validationFailed(
        'That action was already undone or cannot be undone.'
      );
    }
    if (action.action === 'grant' || action.action === 'end') {
      const later = (await db.execute(laterActionOnSameAccounts(actionId, action.createdAt))) as unknown as unknown[];
      if (later.length) {
        throw Errors.validationFailed(
          'A later action changed some of these accounts. Undo that one first.'
        );
      }
    }

    let userCount = 0;
    if (action.action === 'grant') {
      // Cancel what this action granted and bring back what a Restart replaced.
      const rows = (await db.execute(sql`
        WITH undone AS (
          UPDATE public.entitlement_grants
          SET status = 'canceled', canceled_by_action = ${undoId}::uuid,
              updated_at = ${nowIso}::timestamptz
          WHERE source = 'promo' AND status = 'active'
            AND external_ref LIKE ${`admin:${actionId}:%`}
          RETURNING user_id
        ), restored AS (
          UPDATE public.entitlement_grants SET status = 'active', canceled_by_action = NULL,
            updated_at = ${nowIso}::timestamptz
          WHERE status = 'canceled' AND canceled_by_action = ${actionId}::uuid
          RETURNING user_id
        )
        SELECT user_id::text AS user_id FROM undone UNION ALL SELECT user_id::text FROM restored
      `)) as unknown as { user_id: string }[];
      userCount = new Set(rows.map((row) => row.user_id)).size;
    } else if (action.action === 'end') {
      const rows = (await db.execute(sql`
        UPDATE public.entitlement_grants
        SET status = 'active', canceled_by_action = NULL,
            updated_at = ${nowIso}::timestamptz
        WHERE status = 'canceled' AND canceled_by_action = ${actionId}::uuid
        RETURNING user_id::text AS user_id
      `)) as unknown as { user_id: string }[];
      userCount = new Set(rows.map((row) => row.user_id)).size;
    } else if (action.action === 'offer') {
      const before = (action.details as { before?: OfferSnapshot } | null)
        ?.before;
      if (!before) throw Errors.validationFailed('Nothing to restore.');
      await writeWelcomeOffer(
        db,
        {
          enabled: before.enabled,
          days: before.days,
          autoOffAt: before.autoOffAt ? new Date(before.autoOffAt) : null,
        },
        admin.email,
        now
      );
    }

    await recordAudit(
      db,
      admin,
      {
        id: undoId,
        action: 'undo',
        scope: action.scope as 'users' | 'group' | 'everyone' | 'offer',
        userCount,
        reason,
        details: { undid: actionId, undidAction: action.action },
      },
      now
    );
    return { userCount };
  });
}
