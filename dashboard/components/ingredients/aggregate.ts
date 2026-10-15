import type { CorpusReverseLookupRow, IngredientDemandRow, IngredientGapRow, IngredientRankDistributionRow, MacroRow, MatchRateRow } from '@/app/lib/types';
export function aggregateDemand(rows: IngredientDemandRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.ingredient_query, (counts.get(row.ingredient_query) ?? 0) + row.count);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([ingredient_query, count], index) => ({ rank: index + 1, ingredient_query, count }));
}

export function aggregateGaps(rows: IngredientGapRow[]) {
  const groups = new Map<string, IngredientGapRow>();
  for (const row of rows) {
    const key = `${row.ingredient_query}\u0000${row.verdict}\u0000${row.reject_bucket}`;
    const current = groups.get(key);
    groups.set(key, { ...row, count: (current?.count ?? 0) + row.count });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.ingredient_query.localeCompare(b.ingredient_query)).map((row, index) => ({ ...row, rank: index + 1 }));
}

export function aggregateRanks(rows: IngredientRankDistributionRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.pool_size}:${row.selected_rank}`;
    counts.set(key, (counts.get(key) ?? 0) + row.count);
  }
  const totals = new Map<number, number>();
  for (const [key, count] of counts) {
    const pool = Number(key.split(":")[0]);
    totals.set(pool, (totals.get(pool) ?? 0) + count);
  }
  return [...counts].map(([key, count]) => {
    const [pool_size, selected_rank] = key.split(":").map(Number);
    return { pool_size, selected_rank, count, share: count / (totals.get(pool_size) ?? count) };
  }).sort((a, b) => a.pool_size - b.pool_size || a.selected_rank - b.selected_rank);
}

export function aggregateReverse(rows: CorpusReverseLookupRow[]) {
  const groups = new Map<string, CorpusReverseLookupRow>();
  for (const row of rows) {
    const key = row.food_id ?? `${row.food_name}:${row.source}`;
    const current = groups.get(key);
    groups.set(key, {
      ...row,
      decision_count: (current?.decision_count ?? 0) + row.decision_count,
      query_count: (current?.query_count ?? 0) + row.query_count,
      query_examples: [...new Set([...(current?.query_examples ?? []), ...row.query_examples])].slice(0, 5),
    });
  }
  return [...groups.values()].sort((a, b) => b.decision_count - a.decision_count).map((row, index) => ({ ...row, rank: index + 1 }));
}

export function aggregateMacros(rows: MacroRow[]) {
  const groups = new Map<string, MacroRow>();
  for (const row of rows) {
    const key = `${row.nutrient}:${row.bucket_min}:${row.bucket_max ?? "max"}`;
    const current = groups.get(key);
    groups.set(key, { ...row, count: (current?.count ?? 0) + row.count });
  }
  return [...groups.values()];
}


/** The API can return 100% for 0/0; absence is unknown, including omitted days. */
export function matchRateRows(rows: MatchRateRow[], dates: string[]) {
  const byDate = new Map(rows.map(row => [row.date, row]));
  return dates.map(date => {
    const row = byDate.get(date);
    return { date, matched_count: row?.matched_count ?? 0, unmatched_count: row?.unmatched_count ?? 0, match_rate: row && row.ingredient_count > 0 ? row.matched_count / row.ingredient_count : null };
  });
}
