import test from 'node:test';
import assert from 'node:assert/strict';
import { PgDialect } from 'drizzle-orm/pg-core';
import { giveInputSchema, endInputSchema } from '../grants/grant-input';
import { offerInputSchema } from '../offer/offer-input';
import { whoCondition } from '../targets/resolve-who';
import { whoSchema } from '../targets/who-input';
import { offerIsLive } from '../offer/offer';
import { authorizeRequest, createSessionToken } from '../../../auth';

const reason = 'Support adjustment';
test('bulk grants and ends require distinct typed confirmations', () => {
  const input = { who: { kind: 'everyone' }, length: { unit: 'days', days: 14 }, mode: 'extend', reason };
  assert.equal(giveInputSchema.safeParse(input).success, false);
  assert.equal(giveInputSchema.safeParse({ ...input, confirm: 'EVERYONE' }).success, true);
  assert.equal(endInputSchema.safeParse({ who: input.who, reason, confirm: 'EVERYONE' }).success, false);
  assert.equal(endInputSchema.safeParse({ who: input.who, reason, confirm: 'END' }).success, true);
});
test('offer and grants reject out-of-bounds lengths and invalid calendar dates', () => {
  for (const days of [0, 366, 1.5]) assert.equal(offerInputSchema.safeParse({ enabled: true, days, autoOffOn: null, reason }).success, false);
  assert.equal(offerInputSchema.safeParse({ enabled: true, days: 14, autoOffOn: '2026-02-30', reason }).success, false);
});
test('every targeting scope excludes active paying subscribers in SQL', () => {
  const dialect = new PgDialect();
  for (const who of [{ kind: 'everyone' } as const, { kind: 'users', userIds: ['00000000-0000-4000-8000-000000000001'] } as const, { kind: 'group', plan: 'free' } as const]) {
    const query = dialect.sqlToQuery(whoCondition(whoSchema.parse(who)));
    assert.match(query.sql, /NOT EXISTS/);
    assert.match(query.sql, /source <> 'promo'/);
    assert.match(query.sql, /billing_subscription/);
    assert.match(query.sql, /expires_at > now\(\)/);
  }
});
test('welcome offer stops at the configured moment', () => {
  const offer = { enabled: true, days: 14, autoOffAt: new Date('2026-10-06T00:00:00Z'), updatedAt: null, updatedByEmail: null };
  assert.equal(offerIsLive(offer, new Date('2026-10-05T23:59:59Z')), true);
  assert.equal(offerIsLive(offer, new Date('2026-10-06T00:00:00Z')), false);
});
test('admin writes reject anonymous, reviewer, and cross-origin callers', () => {
  Object.assign(process.env, { DASHBOARD_FOUNDER_USERNAME: 'founder', DASHBOARD_FOUNDER_PASSWORD: 'founder-password-12', DASHBOARD_REVIEWER_USERNAME: 'reviewer', DASHBOARD_REVIEWER_PASSWORD: 'reviewer-password-12', DASHBOARD_SESSION_SECRET: 'test-secret-at-least-thirty-two-characters' });
  const req = (role?: 'founder' | 'reviewer', origin = 'https://admin.kallo.fit') => new Request('https://admin.kallo.fit/api/admin/premium', { method: 'POST', headers: { Origin: origin, ...(role ? { Cookie: 'kallo_session=' + createSessionToken(role) } : {}) } });
  for (const [request, status] of [[req(), 401], [req('reviewer'), 403], [req('founder', 'https://attacker.example'), 403]] as const) {
    const result = authorizeRequest(request, { role: 'founder', sameOrigin: true });
    assert.ok('response' in result); assert.equal(result.response.status, status);
  }
  assert.ok('session' in authorizeRequest(req('founder'), { role: 'founder', sameOrigin: true }));
});
