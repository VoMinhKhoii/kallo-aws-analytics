import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, timestamp, jsonb, check, index, smallint, boolean } from 'drizzle-orm/pg-core';
export const premiumGrantAudit = pgTable(
  'premium_grant_audit',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    adminUserId: uuid('admin_user_id').notNull(),
    adminEmail: text('admin_email').notNull(),
    // grant | end | offer | undo
    action: text('action').notNull().default('grant'),
    // users | group | everyone | offer
    scope: text('scope').notNull(),
    // grant only: extend (on top of free time left) | restart (from now)
    mode: text('mode'),
    // grant only; NULL for end / offer / undo.
    days: integer('days'),
    // Accounts changed by this action (resolved server-side at the time).
    userCount: integer('user_count').notNull(),
    // The targeted account ids for scope 'users'; NULL otherwise.
    targetUserIds: uuid('target_user_ids').array(),
    // grant only: the latest end date any account received.
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    reason: text('reason'),
    // Action-specific facts: the group filter, the offer before/after, the
    // undone action's id.
    details: jsonb('details'),
    undoneAt: timestamp('undone_at', { withTimezone: true }),
    undoneByEmail: text('undone_by_email'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'premium_grant_audit_action_check',
      sql`${table.action} IN ('grant', 'end', 'offer', 'undo')`
    ),
    check(
      'premium_grant_audit_scope_check',
      sql`${table.scope} IN ('users', 'group', 'everyone', 'offer')`
    ),
    check(
      'premium_grant_audit_mode_check',
      sql`${table.mode} IS NULL OR ${table.mode} IN ('extend', 'restart')`
    ),
    check(
      'premium_grant_audit_days_check',
      sql`${table.days} IS NULL OR ${table.days} BETWEEN 1 AND 365`
    ),
    index('premium_grant_audit_created_at_idx').on(table.createdAt),
  ]
);

// The welcome offer new signups get, edited from /admin/premium. One row
// (id = 1, seeded by the creating migration); the signup trigger reads it, so
// switching the offer off or changing its length needs no deploy. Changing it
// never touches grants that already exist.
export const premiumSettings = pgTable(
  'premium_settings',
  {
    id: smallint('id').primaryKey(),
    welcomeEnabled: boolean('welcome_enabled').notNull().default(true),
    welcomeDays: integer('welcome_days').notNull().default(14),
    // Optional: the offer stops on its own from this moment.
    welcomeAutoOffAt: timestamp('welcome_auto_off_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedByEmail: text('updated_by_email'),
  },
  (table) => [
    check('premium_settings_singleton_check', sql`${table.id} = 1`),
    check(
      'premium_settings_welcome_days_check',
      sql`${table.welcomeDays} BETWEEN 1 AND 365`
    ),
  ]
);
