import test from 'node:test';
import assert from 'node:assert/strict';
import type { AiModelUsageRow, AiUsageDailyRow } from '@/app/lib/types';
import { dayRange, modelsOf, summarize, trendRows, type UsageInput, volumeRows } from '../aggregate';
import { describeModels, modelKey } from '../models';

function usage(model: string, over: Partial<AiModelUsageRow> = {}): AiModelUsageRow {
  return {
    model, shadow: false, calls: 100, errors: 1, unpriced_calls: 0, spend_usd: 0.1,
    input_tokens: 1000, cached_tokens: 400, output_tokens: 100, thought_tokens: 0,
    timed_calls: 100, p95_ms: 5000, p99_ms: 8000, fallbacks: 0, ...over,
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
    ],
    mealsDaily: [{ date: '2026-10-15', meals: 40, priced_meals: 40, spend_usd: 0.1, p95_meal_usd: 0.004 }],
    window: [usage('gemini-3.1-flash-lite', { calls: 200, spend_usd: 0.2 }), usage('claude-haiku-5-5', { calls: 50, spend_usd: 0.05, unpriced_calls: 10, fallbacks: 2 })],
    mealWindow: { meals: 80, priced_meals: 80, spend_usd: 0.2, p95_meal_usd: 0.004 },
    to: '2026-10-15',
    // Short windows keep the fixtures small; the page only offers 7/30/90.
    win: 2 as never,
    ...over,
  };
}

test('dayRange ends on `to` and counts back whole UTC days', () => {
  assert.deepEqual(dayRange('2026-10-01', 3), ['2026-09-29', '2026-09-30', '2026-10-01']);
});

test('summarize compares the window with the one before it', () => {
  const inp = input();
  const s = summarize(inp, modelsOf(inp));
  // Window = Oct 14–15 (0.1 + 0.1); prior window = Oct 12–13 (0.4).
  assert.equal(s.spend.value, 0.25); // window rows: 0.2 + 0.05
  assert.equal(s.spend.prev, 0.4);
  assert.deepEqual(s.spend.spark, [0.1, 0.1]);
  assert.equal(s.today.meals, 40);
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
  // 10-day window; the prior window (Sep 26 – Oct 5) has rows on 5 of 10 days.
  const prior = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map((d) => day(d, 'gemini-3.1-flash-lite'));
  const inp = input({ win: 30 as never, daily: [...prior, day('2026-10-15', 'gemini-3.1-flash-lite')] });
  const tenDay = { ...inp, win: 10 as never };
  assert.equal(summarize(tenDay, modelsOf(tenDay)).spend.prev, null);
});

test('volumeRows fills every day of the window and marks today partial', () => {
  const rows = volumeRows(input({ daily: [day('2026-10-15', 'gemini-3.1-flash-lite')] }), 'calls');
  assert.deepEqual(rows.map((r) => [r.date, r.partial, r.total]), [['2026-10-14', false, 0], ['2026-10-15', true, 100]]);
  assert.equal(rows[1][modelKey('gemini-3.1-flash-lite')], 100);
});

test('trendRows start on the first day with data', () => {
  const inp = input({
    win: 3 as never,
    daily: [day('2026-10-13', 'gemini-3.1-flash-lite', { timed_calls: 0 }), day('2026-10-14', 'gemini-3.1-flash-lite'), day('2026-10-15', 'gemini-3.1-flash-lite')],
  });
  assert.deepEqual(trendRows(inp, 'p95').map((r) => r.date), ['2026-10-14', '2026-10-15']);
});

test('known models keep their palette slot; unknown ones take a free slot', () => {
  const metas = describeModels(['some-new-model', 'claude-haiku-5-5'], new Set(['some-new-model']));
  assert.deepEqual(metas.map((m) => [m.id, m.color, m.role]), [
    ['some-new-model', 'var(--model-1)', 'Shadow test'],
    ['claude-haiku-5-5', 'var(--model-2)', 'Live'],
  ]);
  assert.equal(describeModels(['claude-haiku-5-5'], new Set())[0].color, 'var(--model-2)');
});
