import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateMappings } from '../../ingredient-mappings';
import type { IngredientMappingRow } from '@/app/lib/types';

test('multi-day mappings keep latest chosen and candidates together, even when unmatched', () => {
  const old: IngredientMappingRow = {date:'2026-10-03',rank:1,ingredient_query:'rice',decision_count:4,accepted_count:4,
    chosen:{food_id:'old'},candidates:[{rank:1,food_id:'old'}]};
  const latest: IngredientMappingRow = {...old,date:'2026-10-04',decision_count:1,accepted_count:0,
    chosen:null,candidates:[{rank:1,food_id:'new'}]};
  for (const rows of [[old,latest],[latest,old]]) {
    const result = aggregateMappings(rows)[0];
    assert.equal(result.decision_count,5); assert.equal(result.accepted_count,4);
    assert.equal(result.chosen,null); assert.deepEqual(result.candidates,latest.candidates);
    assert.equal(result.date,'2026-10-04');
  }
});
