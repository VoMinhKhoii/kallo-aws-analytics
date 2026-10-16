import test from 'node:test';
import assert from 'node:assert/strict';
import { observedRows, timeTicks } from '../chart-data';
import { matchRateRows } from '../../../components/ingredients/aggregate';
import { compact, decimal, msAxis } from '../format';

test('trends trim unknown prefixes, preserve gaps and real zero observations', () => {
  const rows = observedRows([
    {date: '2026-10-10', value: null},
    {date: '2026-10-11', value: 0},
    {date: '2026-10-12'},
    {date: '2026-10-13', value: NaN},
    {date: '2026-10-14', value: 1},
  ], ['value']);
  assert.deepEqual(rows.map(r => r.value), [0, null, null, 1]);
  assert.deepEqual(observedRows([{date: '2026-10-10', value: null}], ['value']), []);
});

test('match rate uses its denominator and leaves zero-traffic and omitted days as gaps', () => {
  const base = {matched_count: 0, unmatched_count: 0, ingredient_count: 0, unaccounted_count: 0, match_rate: 1};
  const rows = matchRateRows([
    {...base, date: '2026-10-10'},
    {...base, date: '2026-10-11', ingredient_count: 4, matched_count: 3},
    {...base, date: '2026-10-13', ingredient_count: 2, unmatched_count: 2},
  ], ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
  assert.deepEqual(observedRows(rows, ['match_rate']).map(r => r.match_rate), [0.75, null, 0]);
});

test('subday time axes never repeat a displayed date or clock label', () => {
  const rows = ['2026-10-10T00:00:00Z', '2026-10-10T12:00:00Z', '2026-10-11T00:00:00Z'].map(date => ({date}));
  assert.deepEqual(timeTicks(rows, false), [rows[0].date, rows[2].date]);
  assert.deepEqual(timeTicks(rows, true), [rows[0].date, rows[1].date]);
});

test('compact counts, axis durations and decimals hide floating point noise', () => {
  assert.equal(compact(21579), '21.6K');
  assert.equal(msAxis(14000), '14 s');
  assert.equal(msAxis(950), '950 ms');
  assert.equal(decimal(0.9900000001, 3), '0.990');
});


test('hourly charts keep unknown leading buckets to display the entire rolling interval',()=>{
  const rows=[{date:'2026-10-15T12:17:00.000Z'},{date:'2026-10-15T13:17:00.000Z',calls:2}];
  assert.equal(observedRows(rows,['calls'],false).length,2);
  assert.equal(observedRows(rows,['calls'],false)[0].calls,null);
});
