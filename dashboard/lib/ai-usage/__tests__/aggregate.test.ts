import test from 'node:test';
import assert from 'node:assert/strict';
import type { AiModelUsageRow, AiUsageDailyRow } from '@/app/lib/types';
import { dayRange, modelsOf, summarize, trendRows, type UsageInput, volumeRows } from '../aggregate';
import { delta } from '../format';
import { describeModels, modelKey } from '../models';

function usage(model: string, over: Partial<AiModelUsageRow> = {}): AiModelUsageRow {
  return {
    model, shadow: false, calls: 100, errors: 1, unpriced_calls: 0, spend_usd: 0.1,
    input_tokens: 1000, cached_tokens: 400, output_tokens: 100, thought_tokens: 0,
    timed_calls: 100, p95_ms: 5000, p99_ms: 8000, fallbacks: 0, shadow_spend_usd: null, ...over,
  };
}
const day = (date: string, model: string, over: Partial<AiModelUsageRow> = {}): AiUsageDailyRow => ({ date, ...usage(model, over) });

function input(over: Partial<UsageInput> = {}): UsageInput {
  return {
    daily: [
      day('2026-10-14', 'gemini-3.1-flash-lite'),
      day('2026-10-15', 'gemini-3.1-flash-lite'),
      day('2026-10-12', 'gemini-3.1-flash-lite', { spend_usd: 0.4 }),
      day('2026-10-13', 'gemini-3.1-flash-lite', { spend_usd: 0 }),
      day('2026-10-11', 'gemini-3.1-flash-lite', { spend_usd: 0 }),
    ],
    mealsDaily: [{ date: '2026-10-15', meals: 40, calls: 80, priced_meals: 40, spend_usd: 0.1, p95_meal_usd: 0.004 }],
    window: [usage('gemini-3.1-flash-lite', { calls: 200, spend_usd: 0.2 }), usage('claude-haiku-5-5', { calls: 50, spend_usd: 0.05, unpriced_calls: 10, fallbacks: 2 })],
    mealWindow: { meals: 80, calls: 160, priced_meals: 80, spend_usd: 0.2, p95_meal_usd: 0.004 },
    to: '2026-10-15',
    // Short windows keep the fixtures small; the page only offers 24h/7d/30d.
    win: 2 as never,
    ...over,
  };
}

test('dayRange ends on `to` and counts back whole UTC days', () => {
  assert.deepEqual(dayRange('2026-10-01', 3), ['2026-09-29', '2026-09-30', '2026-10-01']);
});

test('summarize compares complete days with the ones before them', () => {
  const inp = input();
  const s = summarize(inp, modelsOf(inp));
  // Window = Oct 14–15. Badge: complete days Oct 13–14 (0 + 0.1) against Oct 11–12 (0 + 0.4).
  assert.equal(s.spend.value, 0.25); // window rows: 0.2 + 0.05
  assert.equal(s.spend.cur, 0.1);
  assert.equal(s.spend.prev, 0.4);
  assert.deepEqual(s.spend.spark, [0.1, 0.1]);
  assert.equal(s.today.meals, 40);
  // Primary meal calls per meal, not every attempt over meals.
  assert.equal(s.callsPerMeal, 2);
  // $/1k calls uses priced calls only: 0.05 over 40 priced calls.
  const haiku = s.models.find((m) => m.meta.id === 'claude-haiku-5-5')!;
  assert.ok(Math.abs(haiku.perKCalls! - 1.25) < 1e-9);
  assert.equal(haiku.fallbacks, 2);
  assert.equal(s.unpricedCalls, 10);
  assert.equal(s.perKMeals.value, 2.5);
});

test('summarize has no prior value when the earlier window has no rows', () => {
  const inp = input({ daily: [day('2026-10-15', 'gemini-3.1-flash-lite')] });
  assert.equal(summarize(inp, modelsOf(inp)).spend.prev, null);
});

test('summarize skips a prior window the data covers less than 80%', () => {
  // 10-day window; the prior complete days (Sep 25 – Oct 4) have rows on 4 of 10.
  const prior = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map((d) => day(d, 'gemini-3.1-flash-lite'));
  const inp = input({ win: 30 as never, daily: [...prior, day('2026-10-15', 'gemini-3.1-flash-lite')] });
  const tenDay = { ...inp, win: 10 as never };
  assert.equal(summarize(tenDay, modelsOf(tenDay)).spend.prev, null);
});

test('summarize keeps spend unknown when no call was priced, and sums shadow spend per call', () => {
  const unpriced = input({ window: [usage('mystery-model', { spend_usd: null, unpriced_calls: 100 })] });
  assert.equal(summarize(unpriced, modelsOf(unpriced)).spend.value, null);
  const unpricedToday = input({ daily: [day('2026-10-15', 'mystery-model', { spend_usd: null })] });
  assert.equal(summarize(unpricedToday, modelsOf(unpricedToday)).today.spend, null);
  // Complete days with only unpriced calls: no badge, not a 100% drop.
  const unpricedRecent = input({ daily: input().daily.map((r) => (r.date >= '2026-10-13' ? { ...r, spend_usd: null } : r)) });
  assert.equal(summarize(unpricedRecent, modelsOf(unpricedRecent)).spend.cur, null);
  const quietToday = input({ daily: [day('2026-10-14', 'gemini-3.1-flash-lite')] });
  assert.equal(summarize(quietToday, modelsOf(quietToday)).today.spend, 0);

  const mixed = input({ window: [usage('claude-haiku-5-5', { spend_usd: 0.3, shadow_spend_usd: 0.1 }), usage('gemini-3.5-flash-lite', { shadow: true, spend_usd: 0.2, shadow_spend_usd: 0.2 })] });
  assert.ok(Math.abs(summarize(mixed, modelsOf(mixed)).shadowSpend - 0.3) < 1e-9);
});

test('volumeRows fills every day of the window and marks today partial', () => {
  const rows = volumeRows(input({ daily: [day('2026-10-15', 'gemini-3.1-flash-lite')] }), 'calls');
  assert.deepEqual(rows.map((r) => [r.date, r.partial, r.total]), [['2026-10-14', false, 0], ['2026-10-15', true, 100]]);
  assert.equal(rows[1][modelKey('gemini-3.1-flash-lite')], 100);
  // A day with rows is active even when the metric totals 0 ($0 failed calls).
  const zero = volumeRows(input({ daily: [day('2026-10-14', 'gemini-3.1-flash-lite', { spend_usd: 0 })] }), 'spend');
  assert.deepEqual(zero.map((r) => [r.date, r.active, r.total]), [['2026-10-14', true, 0], ['2026-10-15', false, 0]]);
});

test('trendRows start on the first day with data', () => {
  const inp = input({
    win: 3 as never,
    daily: [day('2026-10-13', 'gemini-3.1-flash-lite', { timed_calls: 0 }), day('2026-10-14', 'gemini-3.1-flash-lite'), day('2026-10-15', 'gemini-3.1-flash-lite')],
  });
  assert.deepEqual(trendRows(inp, 'p95').map((r) => r.date), ['2026-10-14', '2026-10-15']);
});

test('rate badges show percentage points; latency note only when timing began in range', () => {
  assert.equal(delta(0.44, 0.4, true)!.text, '+4.0 pt');
  assert.equal(delta(0.44, 0.4)!.text, '+10.0%');
  const late = input({ daily: [day('2026-10-14', 'gemini-3.1-flash-lite', { timed_calls: 0 }), day('2026-10-15', 'gemini-3.1-flash-lite')] });
  assert.equal(summarize(late, modelsOf(late)).timedSince, '2026-10-15');
  const always = summarize(input(), modelsOf(input()));
  assert.equal(always.timedSince, null);
  assert.equal(always.hasTiming, true);
});

test('model keys are one-to-one and never collide with row fields', () => {
  const keys = ['a-b', 'a.b', 'a_b', 'date', 'total'].map(modelKey);
  assert.equal(new Set(keys).size, 5);
  assert.ok(!keys.includes('date') && !keys.includes('total'));
  assert.ok(keys.every((k) => /^[a-zA-Z0-9_]+$/.test(k)));
});

test('known models keep their palette slot; unknown ones take a free slot', () => {
  const metas = describeModels(['some-new-model', 'claude-haiku-5-5'], new Set(['some-new-model']));
  assert.deepEqual(metas.map((m) => [m.id, m.color, m.role]), [
    ['some-new-model', 'var(--model-1)', 'Shadow test'],
    ['claude-haiku-5-5', 'var(--model-2)', 'Live'],
  ]);
  assert.equal(describeModels(['claude-haiku-5-5'], new Set())[0].color, 'var(--model-2)');
});

test('sparklines preserve unknown days and zero denominators as gaps', () => {
  const inp = input({
    daily: [day('2026-10-15', 'gemini-3.1-flash-lite', { input_tokens: 0, spend_usd: null })],
    mealsDaily: [],
  });
  const summary = summarize(inp, modelsOf(inp));
  assert.deepEqual(summary.cacheRate.spark, [null, null]);
  assert.deepEqual(summary.perKMeals.spark, [null, null]);
  assert.deepEqual(summary.spend.spark, [null, null]);
  assert.deepEqual(summary.calls.spark, [null, 100]);
});

test('rolling 24h charts have 24 hourly buckets and badges compare the preceding 24h',()=>{
  const to='2026-10-16T12:17:00.000Z';
  const daily=Array.from({length:48},(_,i)=>day(new Date(Date.parse(to)-(48-i)*3600000).toISOString(),'gemini-3.1-flash-lite',{calls:i<24?2:3,spend_usd:i<24?1:2}));
  const inp=input({to,win:1,daily,window:[usage('gemini-3.1-flash-lite',{calls:72,spend_usd:48})]});
  const summary=summarize(inp,modelsOf(inp));
  assert.equal(summary.calls.value,72);assert.equal(summary.calls.cur,72);assert.equal(summary.calls.prev,48);
  assert.equal(summary.spend.cur,48);assert.equal(summary.spend.prev,24);
  assert.equal(summary.calls.spark.length,24);assert.equal(volumeRows(inp,'calls').length,24);
  assert.equal(trendRows(inp,'p95').length,24);
  assert.equal(volumeRows(inp,'calls')[0].date,'2026-10-15T12:17:00.000Z');
  const sparse={...inp,daily:daily.slice(-1)};assert.equal(trendRows(sparse,'p95').length,24);
});
