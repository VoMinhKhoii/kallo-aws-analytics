import test from 'node:test';
import assert from 'node:assert/strict';
import {rangeWindow, hourRange, validChoice, validMetricRange, WINDOWS} from '../../windows';
test('24h is rolling across midnight with 24 distinct hour buckets',()=>{
  const now=new Date('2026-10-16T12:17:23.123Z'), w=rangeWindow('24h',now);
  assert.equal(w.from,'2026-10-15T12:17:23.123Z');assert.equal(w.to,now.toISOString());
  const hours=hourRange(w.to);assert.equal(hours.length,24);assert.equal(hours[0],w.from);
  assert.equal(hours.at(-1),'2026-10-16T11:17:23.123Z');
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
