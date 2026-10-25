import test from 'node:test';
import assert from 'node:assert/strict';
import { lineDiff, MAX_DIFF_LINES } from '../line-diff';

test('marks added, removed and unchanged lines in order', () => {
  assert.deepEqual(lineDiff('a\nb\nc', 'a\nc\nd'), [
    { kind: 'same', text: 'a' }, { kind: 'removed', text: 'b' }, { kind: 'same', text: 'c' }, { kind: 'added', text: 'd' },
  ]);
});

test('identical and empty inputs', () => {
  assert.deepEqual(lineDiff('x', 'x'), [{ kind: 'same', text: 'x' }]);
  assert.deepEqual(lineDiff('', 'new'), [{ kind: 'removed', text: '' }, { kind: 'added', text: 'new' }]);
});

test('every input line appears exactly once on its side', () => {
  const before = Array.from({ length: 300 }, (_, i) => `rule ${i % 37}`).join('\n');
  const after = Array.from({ length: 280 }, (_, i) => `rule ${(i * 7) % 41}`).join('\n');
  const diff = lineDiff(before, after)!;
  assert.deepEqual(diff.filter(l => l.kind !== 'added').map(l => l.text), before.split('\n'));
  assert.deepEqual(diff.filter(l => l.kind !== 'removed').map(l => l.text), after.split('\n'));
});

test('refuses inputs past the line cap', () => {
  assert.equal(lineDiff('x\n'.repeat(MAX_DIFF_LINES), 'y'), null);
});
