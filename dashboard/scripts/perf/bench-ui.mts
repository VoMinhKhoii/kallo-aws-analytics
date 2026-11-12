/**
 * Page render benchmark. Loads each dashboard page in a fresh browser context
 * (cold HTTP cache) and records when the page is usable, not just painted.
 *
 * PERF_BASE_URL=https://admin.kallo.fit PERF_COOKIE_FILE=/path/cookie.txt \
 * PLAYWRIGHT_MODULE=/abs/node_modules/playwright PERF_RUNS=8 PERF_OUT=ui.json \
 * node --import tsx scripts/perf/bench-ui.mts
 *
 * PERF_COOKIE_FILE holds one `name=value` session cookie; it is never printed.
 * PERF_HEADERS (optional JSON) adds request headers, e.g. a Workers version override.
 * PERF_WARMUP (default 1) uncounted loads per page first, so every version is measured warm.
 * PERF_IDLE_MS waits this long before each measured load: the first visit after a
 * quiet spell, when every server-side cache entry is past its fresh window.
 * PERF_NAV=1 measures in-app navigation instead: load another page, let it go idle,
 * click the top-bar link, and time from the click to ready.
 *
 * Per page it reports p50/p95/p99 of:
 *   ttfb   first byte of the HTML
 *   fcp    first contentful paint
 *   ready  every loading skeleton gone and no /api request in flight
 *   tbt    total blocking time (sum of long-task time over 50 ms) until ready
 *   api    number of /api requests made before ready, and the slowest one
 *   js     compressed JS bytes downloaded
 */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';

const base = new URL(process.env.PERF_BASE_URL ?? 'http://127.0.0.1:3000');
const runs = Number(process.env.PERF_RUNS ?? 8);
const pages = (process.env.PERF_PAGES ?? '/,/ai,/ingredients,/system,/traces,/premium,/feedback,/prompts').split(',');
const cookieLine = (await readFile(process.env.PERF_COOKIE_FILE!, 'utf8')).trim();
const extraHeaders: Record<string, string> = process.env.PERF_HEADERS ? JSON.parse(process.env.PERF_HEADERS) : {};
const warmup = Number(process.env.PERF_WARMUP ?? 1);
const nav = process.env.PERF_NAV === '1';
const idleMs = Number(process.env.PERF_IDLE_MS ?? 0);
const pwModule = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(isAbsolute(pwModule) ? pathToFileURL(pwModule + '/index.mjs').href : pwModule);

const cookies = cookieLine.split(';').map(part => {
  const at = part.indexOf('=');
  return { name: part.slice(0, at).trim(), value: part.slice(at + 1).trim(), domain: base.hostname, path: '/', secure: base.protocol === 'https:', httpOnly: true, sameSite: 'Lax' as const };
});

// Runs before any page script: counts in-flight /api fetches and long tasks.
const probe = () => {
  const w = window as unknown as { __api: number; __apiDone: number[]; __long: { start: number; duration: number }[] };
  w.__api = 0; w.__apiDone = []; w.__long = [];
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/api/')) return original(input, init);
    w.__api++;
    return original(input, init).finally(() => { w.__api--; w.__apiDone.push(performance.now()); });
  };
  new PerformanceObserver(list => { for (const e of list.getEntries()) w.__long.push({ start: e.startTime, duration: e.duration }); })
    .observe({ type: 'longtask', buffered: true });
};

type Sample = { ttfb: number; fcp: number; ready: number; tbt: number; apiCount: number; apiSlowest: number; jsBytes: number; apis: { path: string; start: number; ms: number }[] };
const results: Record<string, Sample[]> = {};
const browser = await chromium.launch();
try {
  for (const path of pages) {
    results[path] = [];
    for (let i = -warmup; i < runs; i++) {
      if (i >= 0 && idleMs) await new Promise(resolve => setTimeout(resolve, idleMs));
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: extraHeaders });
      await context.addCookies(cookies);
      await context.addInitScript(probe);
      const page = await context.newPage();
      try {
        const start = nav ? (path === '/' ? '/prompts' : '/') : path;
        await page.goto(new URL(start, base).href, { waitUntil: 'commit', timeout: 60_000 });
        if (new URL(page.url()).pathname === '/login') throw new Error('session cookie rejected');
        if (nav) {
          await page.waitForFunction(() => (window as unknown as { __api: number }).__api === 0 && !document.querySelector('.animate-pulse'), undefined, { polling: 50, timeout: 60_000 });
          await page.waitForTimeout(5000); // the top bar prefetches routes once the page is idle
          await page.evaluate((target: string) => {
            const w = window as unknown as { __navStart: number; __apiDone: number[]; __long: unknown[] };
            w.__apiDone = []; w.__long = [];
            performance.clearResourceTimings();
            w.__navStart = performance.now();
            (document.querySelector(`header a[href="${target}"]`) as HTMLElement).click();
          }, path);
        }
        // Ready = no skeleton and no /api request in flight, stable for two frames.
        const ready = await page.waitForFunction((target: string) => {
          const w = window as unknown as { __api: number; __stable?: number };
          const idle = location.pathname === target && document.readyState !== 'loading' && w.__api === 0 && !document.querySelector('.animate-pulse,[aria-busy="true"]') && document.querySelector('main');
          if (!idle) { w.__stable = undefined; return false; }
          w.__stable ??= performance.now();
          return performance.now() - w.__stable > 250 ? w.__stable : false;
        }, path, { polling: 16, timeout: 60_000 }).then(h => h.jsonValue() as Promise<number>);
        const sample = await page.evaluate((readyAt: number) => {
          const w = window as unknown as { __long: { start: number; duration: number }[]; __navStart?: number };
          const from = w.__navStart ?? 0;
          const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? NaN;
          const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(r => r.startTime >= from);
          const apis = resources.filter(r => r.name.includes('/api/') && r.startTime < readyAt)
            .map(r => ({ path: new URL(r.name).pathname + new URL(r.name).search, start: r.startTime - from, ms: r.duration }));
          return {
            ttfb: from ? 0 : navEntry.responseStart,
            fcp: from ? 0 : fcp,
            ready: readyAt - from,
            tbt: w.__long.filter(t => t.start >= from && t.start < readyAt).reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0),
            apiCount: apis.length,
            apiSlowest: Math.max(0, ...apis.map(a => a.ms)),
            jsBytes: resources.filter(r => r.initiatorType === 'script' || r.name.endsWith('.js')).reduce((s, r) => s + r.transferSize, 0),
            apis,
          };
        }, ready);
        if (i < 0) continue; // warm-up
        results[path].push(sample);
        console.log(`${path} #${i + 1} ready=${sample.ready.toFixed(0)}ms fcp=${sample.fcp.toFixed(0)} tbt=${sample.tbt.toFixed(0)} api=${sample.apiCount} slowest=${sample.apiSlowest.toFixed(0)} js=${(sample.jsBytes / 1024).toFixed(0)}KB`);
      } catch (error) {
        console.log(`${path} #${i + 1} FAILED ${error instanceof Error ? error.message.split('\n')[0] : error}`);
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); }

const pct = (values: number[], p: number) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const summary = Object.fromEntries(Object.entries(results).map(([path, samples]) => {
  const stat = (key: keyof Sample) => ({ p50: pct(samples.map(s => s[key] as number), 50), p95: pct(samples.map(s => s[key] as number), 95), p99: pct(samples.map(s => s[key] as number), 99) });
  return [path, { n: samples.length, ttfb: stat('ttfb'), fcp: stat('fcp'), ready: stat('ready'), tbt: stat('tbt'), apiCount: stat('apiCount'), apiSlowest: stat('apiSlowest'), jsBytes: stat('jsBytes') }];
}));
console.log('\npage           n   fcp p50/p95     ready p50/p95/p99        tbt p95  api  js KB');
for (const [path, s] of Object.entries(summary)) {
  console.log(`${path.padEnd(14)} ${String(s.n).padStart(2)}  ${s.fcp.p50.toFixed(0).padStart(5)}/${s.fcp.p95.toFixed(0).padEnd(6)}  ${s.ready.p50.toFixed(0).padStart(6)}/${s.ready.p95.toFixed(0)}/${s.ready.p99.toFixed(0).padEnd(8)}  ${s.tbt.p95.toFixed(0).padStart(6)}  ${String(s.apiCount.p50).padStart(3)}  ${(s.jsBytes.p50 / 1024).toFixed(0)}`);
}
if (process.env.PERF_OUT) await writeFile(process.env.PERF_OUT, JSON.stringify({ base: base.origin, runs, at: new Date().toISOString(), summary, samples: results }, null, 2));
