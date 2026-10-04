import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { AppDb } from '../../db/client';
import { givePremium } from '../grants/give';
import { endFreePremium } from '../grants/end';
import { undoAction } from '../activity/undo';
import { getWelcomeOffer, saveWelcomeOffer } from '../offer/offer';
import { giveInputSchema, endInputSchema } from '../grants/grant-input';
import { offerInputSchema } from '../offer/offer-input';
import { countWho } from '../targets/count-who';

const ids = { admin: '00000000-0000-4000-8000-000000000001', free: '00000000-0000-4000-8000-000000000002', promo: '00000000-0000-4000-8000-000000000003', paid: '00000000-0000-4000-8000-000000000004', store: '00000000-0000-4000-8000-000000000005' };
const admin = { id: ids.admin, email: 'operator@example.test' };
const day = 86400000;

// The production code expects postgres-js execute() to return a row array.
// Adapt only that driver shape; all SQL and transactions run in real Postgres
// (PGlite), including constraints, RETURNING, dates, and rollback.
function postgresJsShape(db: ReturnType<typeof drizzle>): AppDb {
  return new Proxy(db, {
    get(target, key) {
      if (key === 'execute') return async (...args: unknown[]) => (await (target.execute as Function).apply(target, args)).rows;
      if (key === 'transaction') return (fn: (tx: AppDb) => Promise<unknown>) => target.transaction(tx => fn(postgresJsShape(tx as unknown as ReturnType<typeof drizzle>)));
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as unknown as AppDb;
}
async function fixture() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.entitlement_grants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id),
      entitlement_key text, source text, environment text, product_id text,
      starts_at timestamptz, expires_at timestamptz, status text, will_renew boolean,
      external_ref text, canceled_by_action uuid, updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.premium_grant_audit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_user_id uuid NOT NULL REFERENCES auth.users(id),
      admin_email text NOT NULL, action text NOT NULL DEFAULT 'grant' CHECK (action IN ('grant','end','offer','undo')),
      scope text NOT NULL CHECK (scope IN ('users','group','everyone','offer')), mode text,
      days integer CHECK (days BETWEEN 1 AND 365), user_count integer NOT NULL,
      target_user_ids uuid[], expires_at timestamptz, reason text, details jsonb,
      undone_at timestamptz, undone_by_email text, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.premium_settings (
      id smallint PRIMARY KEY CHECK (id = 1), welcome_enabled boolean NOT NULL DEFAULT true,
      welcome_days integer NOT NULL DEFAULT 14 CHECK (welcome_days BETWEEN 1 AND 365),
      welcome_auto_off_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), updated_by_email text
    );
    INSERT INTO auth.users (id) VALUES ${Object.values(ids).map(id => `('${id}')`).join(',')};
    INSERT INTO premium_settings (id) VALUES (1);
  `);
  const now = new Date();
  async function grant(userId: string, source: string, environment = 'production', entitlement = 'premium', status = 'active') {
    await pg.query(`INSERT INTO entitlement_grants (user_id, entitlement_key, source, environment, starts_at, expires_at, status, external_ref)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'fixture')`, [userId, entitlement, source, environment, new Date(now.getTime() - day).toISOString(), new Date(now.getTime() + 10 * day).toISOString(), status]);
  }
  await grant(ids.promo, 'promo'); await grant(ids.promo, 'promo', 'sandbox');
  await grant(ids.paid, 'stripe'); await grant(ids.paid, 'promo');
  await grant(ids.store, 'apple', 'sandbox', 'billing_subscription');
  const db = postgresJsShape(drizzle(pg));
  const rows = async (query: string, params: unknown[] = []) => (await pg.query<Record<string, unknown>>(query, params)).rows;
  return { pg, db, now, rows };
}
const input = (userIds: string[], mode: 'extend' | 'restart' = 'extend') => giveInputSchema.parse({ who: { kind: 'users', userIds }, length: { unit: 'days', days: 3 }, mode, reason: 'Isolated integration verification' });

test('give extends real promo expiry, writes both environments, excludes paying accounts, and undo cancels only its grants', async () => {
  const f = await fixture();
  try {
    const result = await givePremium(admin, input([ids.free, ids.promo, ids.paid, ids.store]), { db: f.db, now: () => f.now });
    assert.equal(result.userCount, 2);
    const created = await f.rows('SELECT user_id, environment, expires_at FROM entitlement_grants WHERE external_ref LIKE $1 ORDER BY user_id, environment', [`admin:${result.auditId}:%`]);
    assert.equal(created.length, 4);
    for (const row of created) {
      assert.ok(['production', 'sandbox'].includes(String(row.environment)));
      const expected = f.now.getTime() + (row.user_id === ids.promo ? 13 : 3) * day;
      assert.equal((row.expires_at instanceof Date ? row.expires_at : new Date(String(row.expires_at))).getTime(), expected);
    }
    const [audit] = await f.rows('SELECT * FROM premium_grant_audit WHERE id=$1', [result.auditId]);
    assert.equal(audit.user_count, 2); assert.equal(audit.admin_email, admin.email); assert.equal(audit.action, 'grant');
    assert.equal((await undoAction(admin, result.auditId, 'Undo isolated grant', { db: f.db })).userCount, 2);
    assert.equal((await f.rows("SELECT * FROM entitlement_grants WHERE external_ref LIKE $1 AND status='active'", [`admin:${result.auditId}:%`])).length, 0);
    assert.equal((await f.rows("SELECT * FROM entitlement_grants WHERE external_ref='fixture' AND status='active'")).length, 5);
    await assert.rejects(undoAction(admin, result.auditId, 'Second undo attempt', { db: f.db }), /already undone|cannot be undone/);
    assert.equal((await f.rows("SELECT * FROM premium_grant_audit WHERE action='undo'")).length, 1);
  } finally { await f.pg.close(); }
});

test('restart uses now and until uses the UTC end of the selected day', async () => {
  const f = await fixture();
  try {
    const restarted = await givePremium(admin, input([ids.promo], 'restart'), { db: f.db, now: () => f.now });
    assert.equal(restarted.expiresAt?.getTime(), f.now.getTime() + 3 * day);
    const until = new Date(f.now.getTime() + 20 * day).toISOString().slice(0, 10);
    const dated = await givePremium(admin, giveInputSchema.parse({ ...input([ids.free]), length: { unit: 'until', until } }), { db: f.db, now: () => f.now });
    assert.equal(dated.expiresAt?.toISOString(), `${until}T23:59:59.999Z`);
  } finally { await f.pg.close(); }
});

test('end and undo preserve paying accounts and restore only grants canceled by that action', async () => {
  const f = await fixture();
  try {
    await f.pg.query("INSERT INTO entitlement_grants(user_id,source,status,external_ref) VALUES ($1,'promo','canceled','old-canceled')", [ids.promo]);
    const result = await endFreePremium(admin, endInputSchema.parse({ who: { kind: 'everyone' }, confirm: 'END', reason: 'Isolated end verification' }), { db: f.db });
    assert.equal(result.userCount, 1);
    assert.equal((await f.rows("SELECT * FROM entitlement_grants WHERE canceled_by_action=$1", [result.auditId])).length, 2);
    assert.equal((await f.rows("SELECT * FROM entitlement_grants WHERE user_id IN ($1,$2) AND status='active'", [ids.paid, ids.store])).length, 3);
    assert.equal((await undoAction(admin, result.auditId, 'Undo isolated end', { db: f.db })).userCount, 1);
    assert.equal((await f.rows("SELECT * FROM entitlement_grants WHERE user_id=$1 AND status='active'", [ids.promo])).length, 2);
    assert.equal((await f.rows("SELECT status FROM entitlement_grants WHERE external_ref='old-canceled'"))[0].status, 'canceled');
  } finally { await f.pg.close(); }
});

test('welcome offer saves an audit snapshot and undo restores original settings without changing grants', async () => {
  const f = await fixture();
  try {
    const before = await f.rows('SELECT * FROM entitlement_grants ORDER BY id');
    const autoOffOn = new Date(f.now.getTime() + 30 * day).toISOString().slice(0, 10);
    await saveWelcomeOffer(admin, offerInputSchema.parse({ enabled: false, days: 21, autoOffOn, reason: 'Isolated offer verification' }), { db: f.db });
    const offer = await getWelcomeOffer(f.db);
    assert.equal(offer.enabled, false); assert.equal(offer.days, 21); assert.equal(offer.autoOffAt?.toISOString(), `${autoOffOn}T00:00:00.000Z`);
    const [audit] = await f.rows("SELECT id,details FROM premium_grant_audit WHERE action='offer'");
    assert.deepEqual((audit.details as { before: unknown }).before, { enabled: true, days: 14, autoOffAt: null });
    await undoAction(admin, String(audit.id), 'Restore isolated offer', { db: f.db });
    const restored = await getWelcomeOffer(f.db);
    assert.equal(restored.enabled, true); assert.equal(restored.days, 14); assert.equal(restored.autoOffAt, null);
    assert.deepEqual(await f.rows('SELECT * FROM entitlement_grants ORDER BY id'), before);
  } finally { await f.pg.close(); }
});

test('audit failure rolls back grant, end, offer, and undo changes atomically', async () => {
  const f = await fixture();
  try {
    const invalidAdmin = { ...admin, id: '00000000-0000-4000-8000-000000000099' };
    const baseline = await f.rows('SELECT * FROM entitlement_grants ORDER BY id');
    await assert.rejects(givePremium(invalidAdmin, input([ids.free]), { db: f.db }));
    await assert.rejects(endFreePremium(invalidAdmin, endInputSchema.parse({ who: { kind: 'users', userIds: [ids.promo] }, reason: 'Fail isolated end' }), { db: f.db }));
    await assert.rejects(saveWelcomeOffer(invalidAdmin, offerInputSchema.parse({ enabled: false, days: 28, autoOffOn: null, reason: 'Fail isolated offer' }), { db: f.db }));
    assert.deepEqual(await f.rows('SELECT * FROM entitlement_grants ORDER BY id'), baseline);
    assert.equal((await getWelcomeOffer(f.db)).days, 14);
    assert.equal((await f.rows('SELECT * FROM premium_grant_audit')).length, 0);
    const valid = await givePremium(admin, input([ids.free]), { db: f.db });
    await assert.rejects(undoAction(invalidAdmin, valid.auditId, 'Fail isolated undo', { db: f.db }));
    assert.equal((await f.rows('SELECT undone_at FROM premium_grant_audit WHERE id=$1', [valid.auditId]))[0].undone_at, null);
    assert.equal((await f.rows("SELECT * FROM entitlement_grants WHERE external_ref LIKE $1 AND status='active'", [`admin:${valid.auditId}:%`])).length, 2);
    assert.equal((await undoAction(admin, valid.auditId, 'Valid retry after rollback', { db: f.db })).userCount, 1);
  } finally { await f.pg.close(); }
});


test('preview and group targeting agree on plans and inclusive UTC signup dates', async () => {
  const f = await fixture();
  try {
    const today = f.now.toISOString().slice(0, 10);
    await f.pg.query("UPDATE auth.users SET created_at=$1::date - interval '1 day' WHERE id=$2", [today, ids.admin]);
    await f.pg.query("UPDATE auth.users SET created_at=$1::date + interval '23 hours 59 minutes' WHERE id<>$2", [today, ids.admin]);
    assert.deepEqual(await countWho(f.db, { kind: 'users', userIds: [ids.free, ids.promo, ids.paid, ids.store] }), { accounts: 2, payingSkipped: 2 });
    for (const [plan, expected] of [['free', 1], ['complimentary', 1], ['not_paying', 2]] as const) {
      assert.deepEqual(await countWho(f.db, { kind: 'group', plan, joinedFrom: today, joinedTo: today }), { accounts: expected, payingSkipped: 0 });
    }
    const result = await givePremium(admin, giveInputSchema.parse({ who: { kind: 'group', plan: 'free', joinedFrom: today, joinedTo: today }, length: { unit: 'days', days: 7 }, mode: 'extend', reason: 'Isolated group verification' }), { db: f.db });
    assert.equal(result.userCount, 1);
    const changed = await f.rows('SELECT DISTINCT user_id FROM entitlement_grants WHERE external_ref LIKE $1', [`admin:${result.auditId}:%`]);
    assert.deepEqual(changed.map(row => row.user_id), [ids.free]);
  } finally { await f.pg.close(); }
});
