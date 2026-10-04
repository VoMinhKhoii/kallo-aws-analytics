import type { IngredientMappingRow } from '@/app/lib/types';

/** Sum retained daily counts; keep each chosen/candidate pair from one observation. */
export function aggregateMappings(rows: IngredientMappingRow[]) {
  const groups = new Map<string, IngredientMappingRow>();
  for (const row of rows) {
    const current = groups.get(row.ingredient_query);
    const latest = !current || (row.date ?? '') >= (current.date ?? '') ? row : current;
    groups.set(row.ingredient_query, {
      ...latest,
      decision_count: (current?.decision_count ?? 0) + row.decision_count,
      accepted_count: (current?.accepted_count ?? 0) + row.accepted_count,
    });
  }
  return [...groups.values()]
    .sort((a,b) => b.decision_count-a.decision_count || a.ingredient_query.localeCompare(b.ingredient_query))
    .map((row,index) => ({...row,rank:index+1}));
}
