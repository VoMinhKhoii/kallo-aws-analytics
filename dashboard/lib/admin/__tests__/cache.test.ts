import test from 'node:test';
import assert from 'node:assert/strict';
import { AggregateCache, windowTtl } from '../cache';
test('cache single-flight, TTL, refresh bypass, scope separation and eviction', async () => {
  let now = 0, loads = 0;
  const cache = new AggregateCache(2, () => now);
  const load = async () => ++loads;
  const [a,b] = await Promise.all([cache.get('founder',60000,load),cache.get('founder',60000,load)]);
  assert.deepEqual(a,b); assert.equal(loads,1);
  await cache.get('founder',60000,load,true); assert.equal(loads,2);
  now = 10000;
  assert.equal((await cache.get('founder',60000,load,true)).value,3);
  now = 10001; await cache.get('founder',60000,load,true); assert.equal(loads,4);
  await cache.get('reviewer',60000,load); assert.equal(loads,5);
  now = 80002; await cache.get('founder',60000,load); assert.equal(loads,6);
  await cache.get('third',60000,load); await cache.get('reviewer',60000,load); assert.equal(loads,8);
  assert.equal(windowTtl('2026-10-01','2026-10-16',Date.parse('2026-10-16')),60000);
  assert.equal(windowTtl('2026-10-01','2026-10-15',Date.parse('2026-10-16')),900000);
});
test('failed loads do not poison the cache', async () => {
  const cache = new AggregateCache();
  await assert.rejects(cache.get('x',60000,async () => { throw Error(); }));
  assert.equal((await cache.get('x',60000,async () => 3)).value,3);
});
