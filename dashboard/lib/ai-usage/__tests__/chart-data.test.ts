import test from 'node:test';
import assert from 'node:assert/strict';
import { observedRows, timeTicks, currencyAxis, durationTicks } from '../chart-data';
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

test('percent domains clamp zero, sparse and out-of-range rates; count ticks are integers',async()=>{
  const {numericAxis}=await import('../chart-data');
  for(const max of [0,.031,.37,1,4]) {
    const axis=numericAxis([{date:'a',v:null},{date:'b',v:max}],['v'],true);
    assert.deepEqual(axis.domain,[0,Math.min(1,Math.max(max,.05))]);
    assert.ok(axis.ticks.every(t=>t>=0&&t<=1));
    assert.ok(axis.ticks.length>=3);
  }
  assert.deepEqual(numericAxis([],['v'],true).domain,[0,.05]);
  assert.deepEqual(numericAxis([{date:'a',v:2.8}],['v'],false,true).ticks,[0,1,2,3]);
});

test('last observations distinguish stale values from real zero, absent and current data',async()=>{
  const {lastObservation}=await import('../chart-data');
  const rows=[{date:'2026-10-11T12:30:00Z',v:8600},{date:'2026-10-12',v:null}];
  assert.deepEqual(lastObservation(rows,'v'),{value:8600,date:rows[0].date,stale:true});
  assert.deepEqual(lastObservation([...rows,{date:'2026-10-13',v:0}],'v'),{value:0,date:'2026-10-13',stale:false});
  assert.deepEqual(lastObservation(rows,'missing'),{value:null,date:undefined,stale:false});
});

test('system headline percentiles weight every observed interval by request volume',async()=>{
  const {weightedPercentile}=await import('../chart-data');
  const points=[{request_count:99,p95:4000,p99:12000},{request_count:1,p95:458,p99:700},{request_count:0,p95:90000,p99:90000}];
  assert.equal(weightedPercentile(points,'p95',.95),4000);
  assert.equal(weightedPercentile(points,'p99',.99),12000);
  assert.equal(weightedPercentile([{request_count:2,p95:null}],'p95',.95),null);
});

test('gap aggregation retains latest evidence even when input is unsorted',async()=>{
  const {aggregateGaps}=await import('../../../components/ingredients/aggregate');
  const base={rank:1,ingredient_query:'rice',verdict:'unmatched',reject_bucket:'no_candidates',count:1};
  const rows=aggregateGaps([{...base,date:'2026-10-15',last_seen:'2026-10-15T12:00Z'},{...base,date:'2026-10-10'}]);
  assert.equal(rows[0].count,2);assert.equal(rows[0].last_seen,'2026-10-15T12:00Z');
});


test('currency axes use nice equal intervals and consistent decimal precision', () => {
  const axis = currencyAxis([.018, NaN, Infinity]);
  assert.deepEqual(axis.ticks, [0, .005, .01, .015, .02]);
  assert.deepEqual(axis.ticks.map(axis.format), ['$0', '$0.005', '$0.010', '$0.015', '$0.020']);
  const quarter = currencyAxis([.009]);
  assert.deepEqual(quarter.ticks.map(quarter.format), ['$0', '$0.0025', '$0.0050', '$0.0075', '$0.0100']);
  for (const max of [0, .000018, .018, .19, 1.8, 18, 180, 18000]) {
    const scale = currencyAxis([max]);
    assert.ok(scale.domain[1] >= max);
    assert.equal(scale.domain[1], scale.ticks.at(-1));
    const step = scale.ticks[1];
    const unit = step / 10 ** Math.floor(Math.log10(step));
    assert.ok([1, 2, 2.5, 5, 10].some(n => Math.abs(n - unit) < 1e-9));
    scale.ticks.forEach((v, i) => assert.ok(Math.abs(v - i * step) < step * 1e-9));
    assert.equal(new Set(scale.ticks.map(scale.format)).size, scale.ticks.length);
    assert.equal(new Set(scale.ticks.slice(1).map(v => scale.format(v).split('.')[1]?.length ?? 0)).size, 1);
  }
  assert.deepEqual(currencyAxis([]).ticks, currencyAxis([0]).ticks);
});


test('duration axes use the top tick unit for zero and every tick', () => {
  assert.deepEqual([0, 200, 400, 800].map(v => msAxis(v, 800)), ['0 ms', '200 ms', '400 ms', '800 ms']);
  assert.deepEqual([0, 2000, 4000].map(v => msAxis(v, 4000)), ['0 s', '2 s', '4 s']);
  assert.equal(msAxis(500, 2000), '0.5 s');
  for (const max of [0, 950, 1000, 4800, 6500, 65000, 1000000, NaN, Infinity]) {
    const ticks = durationTicks([max]);
    const top = ticks.at(-1)!;
    assert.equal(ticks[0], 0);
    assert.ok(top >= (Number.isFinite(max) ? max : 0));
    assert.ok(ticks.every((t, i) => t === i * ticks[1] && t % 1000 === 0));
    assert.ok(ticks.map(v => msAxis(v, top)).every(label => label.endsWith(' s')));
    assert.equal(new Set(ticks.map(v => msAxis(v, top))).size, ticks.length);
  }
  assert.deepEqual(durationTicks([6500]), [0, 2000, 4000, 6000, 8000]);
});
