export type ChartRow = { date: string } & Record<string, unknown>;

/** Keep missing observations null, trim only the unknown prefix, never interior gaps. */
export function observedRows(rows: ChartRow[], keys: string[], trimStart = true): ChartRow[] {
  const normalized = rows.map(row => ({ ...row, ...Object.fromEntries(keys.map(key => [
    key, typeof row[key] === 'number' && Number.isFinite(row[key]) ? row[key] : null,
  ])) }));
  if (!trimStart) return normalized;
  const first = normalized.findIndex(row => keys.some(key => row[key] != null));
  return first < 0 ? [] : normalized.slice(first);
}

/** Choose one timestamp per label, including when a range crosses midnight. */
export function timeTicks(rows: ChartRow[], hourly: boolean): string[] {
  const seen = new Set<string>();
  return rows.flatMap(row => {
    const label = hourly ? row.date.slice(11, 16) : row.date.slice(0, 10);
    if (seen.has(label)) return [];
    seen.add(label);
    return [row.date];
  });
}
