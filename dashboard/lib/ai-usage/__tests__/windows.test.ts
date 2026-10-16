import test from 'node:test';
import assert from 'node:assert/strict';
import {rangeWindow, hourRange, validChoice, validMetricRange, WINDOWS} from '../../windows';
test('24h is rolling across midnight with 24 complete UTC hours plus the current partial hour',()=>{
  const now=new Date('2026-10-16T12:17:23.123Z'), w=rangeWindow('24h',now);
  assert.equal(w.from,'2026-10-15T12:17:23.123Z');assert.equal(w.to,now.toISOString());
  const hours=hourRange(w.to);assert.equal(hours.length,25);assert.equal(hours[0],'2026-10-15T12:00:00.000Z');
  assert.equal(hours.at(-1),'2026-10-16T12:00:00.000Z');
  assert.ok(hours.every((h,i)=>h.endsWith(':00:00.000Z') && (!i || Date.parse(h)-Date.parse(hours[i-1])===3600000)));
  assert.deepEqual(hourRange('2026-10-16T12:59:59.999Z'),hours);
  assert.deepEqual(hourRange('2026-10-16T12:00:00.000Z'),hours);
  assert.equal(hourRange('2026-01-01T00:01:00.000Z')[0],'2025-12-31T00:00:00.000Z');
  assert.deepEqual(hourRange('2026-10-16T19:17:23.123+07:00'),hours);
  assert.equal(rangeWindow('7d',now).from,'2026-10-10');assert.equal(rangeWindow('30d',now).from,'2026-09-17');
});
test('90d URL state falls back to the page default and APIs reject 90-day ranges',()=>{
  for(const fallback of ['30d','7d'] as const) assert.equal(validChoice('90d',fallback,WINDOWS),fallback);
  assert.equal(validChoice('24h','30d',WINDOWS),'24h');
  assert.equal(validMetricRange('2026-07-19','2026-10-16'),false);
  assert.equal(validMetricRange('2026-10-15T12:17:23.123Z','2026-10-16T12:17:23.123Z'),true);
  assert.equal(validMetricRange('2026-10-14T12:17:23.123Z','2026-10-16T12:17:23.123Z'),true);
  assert.equal(validMetricRange('2026-02-30','2026-03-01'),false);
});
