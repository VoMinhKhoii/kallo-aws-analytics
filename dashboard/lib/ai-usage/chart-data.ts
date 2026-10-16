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

/** Bounded rates and readable numeric axes, including all-zero series. */
export function numericAxis(rows: ChartRow[], keys: string[], percent = false, integer = false) {
  const max = Math.max(0, ...rows.flatMap(r => keys.map(k => typeof r[k] === 'number' && Number.isFinite(r[k]) ? r[k] as number : 0)));
  const target = percent ? Math.min(1, Math.max(max, .05)) : Math.max(max, 1);
  const raw = target / 4, magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(integer ? 1 : 0, ([1, 2, 2.5, 5, 10].find(n => n * magnitude >= raw) ?? 10) * magnitude);
  const top = percent ? target : Math.ceil(target / step) * step;
  const ticks = Array.from({length: Math.floor(top / step + 1e-9) + 1}, (_, i) => Number((i * step).toPrecision(12)));
  return {domain: [0, top] as [number, number], ticks};
}

export function lastObservation(rows: ChartRow[], key: string) {
  const row = rows.findLast(r => typeof r[key] === 'number' && Number.isFinite(r[key]));
  return {value: row ? row[key] as number : null, date: row?.date, stale: !!row && row !== rows.at(-1)};
}

/** Request-weighted percentile of aligned interval percentiles, not a raw-request percentile. */
export function weightedPercentile(rows: ({request_count?: number | null} & Record<string, unknown>)[], key: string, q: number) {
  const values = rows.filter(r => typeof r[key] === 'number' && Number.isFinite(r[key]) && (r.request_count ?? 0) > 0).sort((a,b) => (a[key] as number) - (b[key] as number));
  const total = values.reduce((n,r) => n + r.request_count!, 0);
  let sum = 0;
  for (const r of values) { sum += r.request_count!; if (sum >= total * q) return r[key] as number; }
  return null;
}

/** Shared currency scale: nice equal intervals and one precision for the axis. */
export function currencyAxis(values: number[]) {
  const max = values.reduce((top, v) => Number.isFinite(v) ? Math.max(top, v) : top, 0);
  const raw = (max || .02) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const factor = [1, 2, 2.5, 5, 10].find(n => n * magnitude >= raw) ?? 10;
  const step = factor * magnitude;
  const decimals = Math.min(100, Math.max(0, -Math.floor(Math.log10(step)) + (factor === 2.5 ? 1 : 0)));
  const count = Math.ceil(max / step - 1e-10) || 4;
  const ticks = Array.from({length: count + 1}, (_, i) => Number((i * step).toPrecision(12)));
  return {
    domain: [0, ticks.at(-1)!] as [number, number],
    ticks,
    format: (value: number) => value === 0 ? '$0' : `$${value.toFixed(decimals)}`,
  };
}

/** Millisecond data with whole-second, evenly spaced duration ticks. */
export function durationTicks(values: number[]) {
  const max = Math.max(1000, ...values.filter(Number.isFinite));
  const raw = max / 4000, magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1000, ([1, 2, 4, 5, 10].find(n => n * magnitude >= raw) ?? 10) * magnitude * 1000);
  const top = Math.ceil(max / step) * step;
  return Array.from({length: Math.round(top / step) + 1}, (_, i) => i * step);
}
