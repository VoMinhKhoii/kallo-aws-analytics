/**
 * API latency benchmark: p50/p95/p99 per dashboard endpoint, measured from the client.
 *
 * PERF_BASE_URL=https://admin.kallo.fit PERF_COOKIE_FILE=/path/cookie.txt PERF_RUNS=40 \
 * PERF_MODE=default|refresh PERF_OUT=api.json node --import tsx scripts/perf/bench-api.mts
 *
 * default  the request exactly as the page sends it (server caches may answer)
 * refresh  adds refresh=1 so every request goes to the database (worst case)
 * PERF_HEADERS (optional JSON) adds request headers, e.g. a Workers version override.
 * Requests run one at a time, so the numbers are latency, not throughput.
 */
import { readFile, writeFile } from 'node:fs/promises';

const base = new URL(process.env.PERF_BASE_URL ?? 'http://127.0.0.1:3000');
const runs = Number(process.env.PERF_RUNS ?? 40);
const mode = process.env.PERF_MODE ?? 'default';
const cookie = (await readFile(process.env.PERF_COOKIE_FILE!, 'utf8')).trim();
const extra: Record<string, string> = process.env.PERF_HEADERS ? JSON.parse(process.env.PERF_HEADERS) : {};

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const today = day(0);
// The requests each page makes on first load with its default 30-day window.
const endpoints: [string, string][] = [
  ['health (floor)', '/api/health'],
  ['session', '/api/auth/session'],
  ['admin/status', '/api/admin/status'],
  ['overview 30d', '/api/admin/overview?w=30d'],
  ['overview 24h', '/api/admin/overview?w=24h'],
  ['traces 7d x5', '/api/traces?w=7d&limit=5'],
  ['traces 24h x25', '/api/traces?w=24h&q=&status=all&model=&flags=&limit=25'],
  ['ai daily', `/api/metrics?metrics=ai_usage_daily%2Cai_meals_daily&from=${day(-60)}&to=${today}`],
  ['ai window', `/api/metrics?metrics=ai_model_window%2Cai_meal_window&from=${day(-29)}&to=${today}`],
  ['ingredients', `/api/metrics?metrics=ingredient_demand%2Cingredient_mappings%2Ccorpus_reverse_lookup%2Cingredient_gaps%2Cingredient_rank_distribution%2Cmatch_rate%2Cmacro_distributions%2Cimplausible_foods&from=${day(-29)}&to=${today}`],
  ['cloud-monitoring', `/api/cloud-monitoring?from=${day(-6)}&to=${today}`],
  ['admin/health', '/api/admin/health'],
  ['premium', '/api/admin/premium'],
  ['feedback', '/api/admin/records?kind=feedback&page=1&status=all&type=all'],
  ['prompts', '/api/admin/prompts'],
];
const only = process.env.PERF_ONLY?.split(',');

const pct = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const out: Record<string, { n: number; errors: number; p50: number; p95: number; p99: number; max: number }> = {};
console.log(`mode=${mode} runs=${runs} base=${base.origin}`);
console.log('endpoint            n  err     p50     p95     p99     max');
for (const [name, path] of endpoints) {
  if (only && !only.includes(name)) continue;
  const times: number[] = [];
  let errors = 0;
  for (let i = 0; i < runs; i++) {
    const url = new URL(path, base);
    if (mode === 'refresh' && !path.startsWith('/api/health') && !path.startsWith('/api/auth')) url.searchParams.set('refresh', '1');
    const started = performance.now();
    try {
      const response = await fetch(url, { headers: { cookie, ...extra } });
      await response.arrayBuffer();
      if (!response.ok) errors++;
    } catch { errors++; }
    times.push(performance.now() - started);
  }
  const row = { n: times.length, errors, p50: pct(times, 50), p95: pct(times, 95), p99: pct(times, 99), max: Math.max(...times) };
  out[name] = row;
  console.log(`${name.padEnd(18)} ${String(row.n).padStart(3)} ${String(errors).padStart(4)} ${row.p50.toFixed(0).padStart(7)} ${row.p95.toFixed(0).padStart(7)} ${row.p99.toFixed(0).padStart(7)} ${row.max.toFixed(0).padStart(7)}`);
}
if (process.env.PERF_OUT) await writeFile(process.env.PERF_OUT, JSON.stringify({ base: base.origin, mode, runs, at: new Date().toISOString(), endpoints: out }, null, 2));
