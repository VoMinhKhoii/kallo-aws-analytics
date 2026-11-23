import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { AppDb } from '../../admin/db/client';
import { resolveAudience, summarize } from '../audience';
import { audienceSchema, type AudienceInput } from '../input';

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

async function fixture() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, deleted_at timestamptz, is_anonymous boolean DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.user_profiles (user_id uuid PRIMARY KEY, preferred_locale text DEFAULT 'en');
    CREATE TABLE public.public_profiles (user_id uuid PRIMARY KEY, display_name text);
    CREATE TABLE public.meals (id serial PRIMARY KEY, user_id uuid, logged_at timestamptz NOT NULL);
    CREATE TABLE public.entitlement_grants (user_id uuid, entitlement_key text, source text, environment text, starts_at timestamptz, expires_at timestamptz, status text);
    INSERT INTO auth.users (id, email, email_confirmed_at, deleted_at, is_anonymous, created_at) VALUES
      ('${id(1)}', 'Paying@Example.test', now(), NULL, false, '2026-01-10'),
      ('${id(2)}', 'promo@example.test', now(), NULL, false, '2026-02-10'),
      ('${id(3)}', 'free.vi@example.test', now(), NULL, false, '2026-03-10'),
      ('${id(4)}', 'unconfirmed@example.test', NULL, NULL, false, '2026-03-11'),
      ('${id(5)}', 'deleted@example.test', now(), now(), false, '2026-03-12'),
      ('${id(6)}', NULL, NULL, NULL, true, '2026-03-13');
    INSERT INTO public.user_profiles VALUES ('${id(1)}', 'en'), ('${id(3)}', 'vi');
    INSERT INTO public.public_profiles VALUES ('${id(3)}', 'Mai');
    INSERT INTO public.meals (user_id, logged_at) VALUES ('${id(3)}', now() - interval '2 days'), ('${id(2)}', now() - interval '20 days');
    INSERT INTO public.entitlement_grants VALUES
      ('${id(1)}', 'premium', 'stripe', 'production', now() - interval '1 day', now() + interval '20 days', 'active'),
      ('${id(2)}', 'premium', 'promo', 'production', now() - interval '1 day', now() + interval '5 days', 'active');
  `);
  const db = new Proxy(drizzle(pg), { get(t, k) { if (k === 'execute') return async (...a: unknown[]) => (await (t.execute as Function).apply(t, a)).rows; const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v; } }) as unknown as AppDb;
  return db;
}
const group = (g: Partial<Extract<AudienceInput, { kind: 'group' }>>): AudienceInput => ({ kind: 'group', plan: 'any', activity: 'any', language: 'any', ...g });
const emails = async (db: AppDb, a: AudienceInput) => (await resolveAudience(db, audienceSchema.parse(a))).map(r => r.email);

test('audiences reach only confirmed, live accounts and filter by plan, activity, language and signup date', async () => {
  const db = await fixture();
  assert.deepEqual(await emails(db, { kind: 'everyone' }), ['paying@example.test', 'promo@example.test', 'free.vi@example.test']);
  assert.deepEqual(await emails(db, group({ plan: 'paying' })), ['paying@example.test']);
  assert.deepEqual(await emails(db, group({ plan: 'complimentary' })), ['promo@example.test']);
  assert.deepEqual(await emails(db, group({ plan: 'free' })), ['free.vi@example.test']);
  assert.deepEqual(await emails(db, group({ activity: 'active7' })), ['free.vi@example.test']);
  assert.deepEqual(await emails(db, group({ activity: 'active30' })), ['promo@example.test', 'free.vi@example.test']);
  assert.deepEqual(await emails(db, group({ activity: 'inactive30' })), ['paying@example.test']);
  assert.deepEqual(await emails(db, group({ language: 'vi' })), ['free.vi@example.test']);
  assert.deepEqual(await emails(db, group({ language: 'en' })), ['paying@example.test', 'promo@example.test']);
  assert.deepEqual(await emails(db, group({ joinedFrom: '2026-02-01', joinedTo: '2026-02-10' })), ['promo@example.test']);
  assert.deepEqual(await emails(db, { kind: 'users', userIds: [id(3), id(4)] }), ['free.vi@example.test']);

  const all = await resolveAudience(db, { kind: 'everyone' });
  assert.deepEqual(all.find(r => r.locale === 'vi'), { email: 'free.vi@example.test', userId: id(3), name: 'Mai', locale: 'vi' });
  const count = summarize(all, new Set(['promo@example.test']));
  assert.deepEqual({ ...count, sample: count.sample.length }, { total: 3, reachable: 2, suppressed: 1, byLocale: { en: 1, vi: 1 }, sample: 2 });
});
