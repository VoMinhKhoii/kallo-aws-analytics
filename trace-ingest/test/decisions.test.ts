import assert from 'node:assert/strict';
import { test } from 'node:test';
import { candidate, deriveDecisions, rejectBucket } from '../src/decisions';
import { assembly, line, matching, REQUEST_ID, splitLines, stored } from './fixtures';

const request = { line: line('r1', 1, 'request', { rawInput: 'x', profile: 'stable' }), type: 'request', at: '2026-10-25T09:59:58.000Z' };

test('joins verdicts to the candidate pool in mealItemIdx, ingredientIdx order', () => {
  const rows = deriveDecisions(REQUEST_ID, stored([
    request,
    { line: line('s1', 2, 'stage', matching), type: 'stage' },
    { line: line('s3', 4, 'stage', assembly), type: 'stage', at: '2026-10-25T10:00:03.000Z' },
  ]));
  assert.deepEqual(rows.map((r) => [r.gidx, r.verdict, r.ingredient_query, r.pool_size, r.selected_rank, r.reject_bucket]), [
    [0, 'accepted', 'cơm trắng', 2, 1, null],
    [1, 'rejected', 'trứng', 1, null, 'low_confidence'],
    [2, 'unmatched', 'nước mắm', 0, null, 'unmatched'],
  ]);
  assert.equal(rows[0].occurred_at, '2026-10-25T09:59:58.000Z');
  assert.equal(rows[0].occurred_on, '2026-10-25');
  assert.deepEqual(rows[0].chosen, { food_id: 'rice_cooked', name: 'Cơm trắng', source: 'fao_vn_2007', similarity: 0.91 });
  assert.deepEqual(rows[0].candidates[1], { food_id: 'rice_raw', name: 'Gạo', source: 'fao_vn_2007', similarity: 0.7 });
  // An out-of-range pick chooses nothing, like the view's bounds check.
  assert.deepEqual(rows[1].chosen, { food_id: null, name: null, source: null, similarity: null });
});

test('waits until both matching and assembly are stored', () => {
  assert.deepEqual(deriveDecisions(REQUEST_ID, stored([request, { line: line('s3', 4, 'stage', assembly), type: 'stage' }])), []);
  assert.deepEqual(deriveDecisions(REQUEST_ID, stored([{ line: line('s1', 2, 'stage', matching), type: 'stage' }])), []);
});

test('reassembles a split stage and skips one with a missing part', () => {
  const parts = splitLines('s3', 4, 'stage', assembly, 100).map((l) => ({ line: l, type: 'stage' }));
  assert.ok(parts.length > 2);
  const base = [{ line: line('s1', 2, 'stage', matching), type: 'stage' }];
  assert.equal(deriveDecisions(REQUEST_ID, stored([...base, ...parts])).length, 3);
  assert.equal(deriveDecisions(REQUEST_ID, stored([...base, ...parts.slice(1)])).length, 0);
});

test('candidate labels keep the view bounds', () => {
  assert.deepEqual(candidate({ foodCompositionId: 'bad id!', matchedName: ' ', source: '-x', similarity: 1.5 }),
    { food_id: null, name: null, source: null, similarity: null });
  assert.equal(candidate({ similarity: '0.1234567' }).similarity, 0.123457);
  assert.equal(candidate({ similarity: '1.00' }).similarity, 1);
  assert.equal(candidate({ similarity: '2' }).similarity, null);
  assert.equal(candidate({ matchedName: 'x'.repeat(201) }).name, null);
  assert.equal(candidate({ foodCompositionId: 42 }).food_id, '42');
});

test('reject buckets follow the view', () => {
  assert.equal(rejectBucket('accepted', 'anything'), null);
  assert.equal(rejectBucket('missing', null), 'missing');
  assert.equal(rejectBucket('rejected', 'No\nviable candidate'), 'no_candidates');
  assert.equal(rejectBucket('rejected', 'Parse error'), 'invalid_input');
  assert.equal(rejectBucket('rejected', 'Model refused'), 'model_rejected');
  assert.equal(rejectBucket('rejected', null), 'other');
});
