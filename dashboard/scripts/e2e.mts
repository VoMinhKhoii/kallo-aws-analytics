/**
 * Read-only live-dashboard checks. This file deliberately has no static Playwright
 * dependency: PLAYWRIGHT_MODULE may be a package name or an absolute module path.
 *
 * E2E_BASE_URL=http://127.0.0.1:3230 E2E_ENV_FILE=/path/to/secrets.env \
 * E2E_OUT=/tmp/dashboard-e2e npm run e2e
 *
 * Missing data-dependent coverage is recorded explicitly as N/A, never invented.
 * No credentials, cookies, response bodies, or Playwright traces are written out.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { adjacentStep, buildGraph } from '../lib/traces-ui/graph.ts';

// Structural types keep the runner usable with an externally installed library.
type PW = any;
type Check = { name: string; pass: boolean; detail: string; duration: number; screenshot?: string };
const checks: Check[] = [];
const out = resolve(process.env.E2E_OUT || '/tmp/kallo-dashboard-e2e');
const timeout = 45_000;
let base: URL;
let username = '', password = '';
let browser: PW, context: PW, page: PW, anonymous: PW;
let chromium: PW;
let storageState: PW;
let recoveryUrl = '', crashed = false, writesProtected = false;
let viewport = { width: 1440, height: 900 };
let configureContext: () => Promise<void>;
let attachPage: () => void;
let protectWrites: () => Promise<unknown> = async () => {};
let counter = 0;
const issues: { kind: string; detail: string }[] = [];
const blocked: string[] = [];
const renderedWindows = new Map<string, string>();
const pending = new Set<PW>();
let lastNetwork = Date.now();
const pages = [
  ['Overview', '/'], ['Premium', '/premium'], ['Feedback', '/feedback'],
  ['Traces', '/traces'], ['AI', '/ai'], ['Ingredients', '/ingredients'], ['System', '/system'],
] as const;
const chartPages = new Set(['Overview', 'AI', 'Ingredients', 'System']);
const windowPages = new Set([...chartPages, 'Traces']);
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function clean(value: unknown) {
  let text = String(value);
  for (const secret of [password, username]) if (secret) text = text.split(secret).join('[redacted]');
  return text.slice(0, 2400);
}
function safeUrl(raw: string) {
  const url = new URL(raw);
  // Do not include user searches, credentials, or tokens in diagnostics.
  return url.origin + url.pathname;
}
async function eventually(test: () => Promise<unknown>, message: string, ms = timeout) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await test()) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(message);
}
async function screenshot(name: string) {
  if (!page || page.isClosed()) return undefined;
  const file = `${String(++counter).padStart(3, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
  // Login credentials are masked even in failure screenshots.
  await page.screenshot({ path: resolve(out, file), fullPage: true,
    mask: [page.getByLabel('Password', { exact: true }), page.getByLabel('Username', { exact: true })],
    timeout: 15_000 });
  return file;
}
async function check(name: string, run: () => Promise<string | void>) {
  const start = Date.now();
  const result: Check = { name, pass: true, detail: '', duration: 0 };
  try {
    if (page && (crashed || page.isClosed() || !browser.isConnected())) {
      pending.clear();
      if (crashed && !page.isClosed()) await page.close().catch(() => {});
      try {
        if (!browser.isConnected()) throw new Error('Browser disconnected');
        page = await context.newPage();
      } catch {
        if (!browser.isConnected()) browser = await chromium.launch({ headless: true });
        context = await browser.newContext({ viewport, storageState, serviceWorkers: 'block' });
        await configureContext();
        if (writesProtected) await protectWrites();
        page = await context.newPage();
      }
      crashed = false;
      attachPage();
      await page.setViewportSize(viewport);
      if (recoveryUrl) await goto(recoveryUrl);
    }
    if (page && !page.isClosed()) {
      recoveryUrl = page.url();
      viewport = page.viewportSize() || viewport;
    }
    result.detail = clean((await run()) || 'OK');
    if (page && !page.isClosed()) {
      recoveryUrl = page.url();
      viewport = page.viewportSize() || viewport;
    }
  }
  catch (error) {
    result.pass = false;
    result.detail = clean(error instanceof Error ? error.message : error);
    if (/Target page, context or browser has been closed|Page crashed/i.test(result.detail)) crashed = true;
    try { result.screenshot = await screenshot(`failure-${name}`); }
    catch { result.detail += ' (failure screenshot unavailable)'; }
  }
  result.duration = Date.now() - start;
  checks.push(result);
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${name} — ${result.detail}`);
  return result.pass;
}
function isEdge(url: string) {
  try { return new URL(url).pathname.startsWith('/cdn-cgi/'); } catch { return false; }
}
async function settle() {
  // Next prefetches can be cancelled during navigation. Track actual requests
  // rather than relying on networkidle, which pending traces may never reach.
  await eventually(async () => pending.size === 0 && Date.now() - lastNetwork > 650,
    'Page requests did not settle');
  await eventually(async () => await page.locator('.animate-pulse').count() === 0,
    'Loading skeleton did not settle');
}
async function goto(path: string) {
  await page.goto(new URL(path, base).href, { waitUntil: 'domcontentloaded' });
  await settle();
}
async function urlIs(path: string, params: Record<string, string> = {}) {
  await page.waitForURL((url: URL) => url.pathname === path &&
    Object.entries(params).every(([key, value]) => url.searchParams.get(key) === value), { timeout });
}
async function visible(locator: PW) { await locator.waitFor({ state: 'visible', timeout }); }
async function enabled(locator: PW) {
  await visible(locator);
  await eventually(() => locator.isEnabled(), 'Control did not become enabled');
}
async function apiAction(action: () => Promise<unknown>, matches: (url: URL) => boolean) {
  const responsePromise = page.waitForResponse((r: PW) =>
    r.request().method() === 'GET' && matches(new URL(r.url())), { timeout });
  // Attach rejection handling before acting, even when the action itself fails.
  const [response] = await Promise.all([responsePromise, action()]);
  assert(response.ok(), `Refetch returned HTTP ${response.status()}`);
  await settle();
  return response;
}
async function readJson(path: string) {
  const r = await context.request.get(new URL(path, base).href);
  assert(r.ok(), `Read ${path.split('?')[0]} returned HTTP ${r.status()}`);
  return r.json();
}
async function noOverflow() {
  const sizes = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert(Math.max(sizes.document, sizes.body) <= sizes.viewport + 1,
    `Horizontal overflow: ${JSON.stringify(sizes)}`);
}
async function readableSelection(id: string) {
  await eventually(async () => page.locator('.trace-canvas-main').evaluate((canvas: HTMLElement, step: string) => {
    const viewport = canvas.querySelector<HTMLElement>('.react-flow__viewport');
    const node = Array.from(canvas.querySelectorAll<HTMLElement>('.react-flow__node')).find(el => el.dataset.id === step);
    if (!viewport || !node) return false;
    const zoom = new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a;
    const box = node.getBoundingClientRect(), area = canvas.getBoundingClientRect();
    return zoom >= .85 - 1e-6 && box.x >= area.x && box.right <= area.right && box.y >= area.y && box.bottom <= area.bottom;
  }, id), 'Selected step is too small or outside the visible canvas');
}
async function kpiLabelsFit() {
  const clipped = await page.locator('section[aria-label="Summary"] span').evaluateAll((els: HTMLElement[]) =>
    els.filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map(el => el.textContent));
  assert(!clipped.length, `Clipped KPI text: ${clipped.join('; ')}`);
}
async function selectStep(id: string, name?: string) {
  // React Flow exposes stable data-id attributes; its nodes are transformed and
  // may lie outside the viewport. Fit the whole graph before a physical click.
  const close = page.getByRole('button', { name: 'Close step panel', exact: true });
  if (await close.count()) {
    await close.click();
    await eventually(async () => await close.count() === 0, 'Previous panel did not close');
  }
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('f');
  // Allow React Flow to apply the fit transform before clicking.
  await new Promise(r => setTimeout(r, 350));
  const node = page.locator('.react-flow__node').filter({ has: page.locator(`strong[title=${JSON.stringify(name || id)}]`) });
  const target = name ? node : page.locator(`.react-flow__node[data-id=${JSON.stringify(id)}]`);
  await visible(target);
  await target.click({ timeout });
  await eventually(async () => new URL(page.url()).searchParams.get('step') === id, `Step URL did not select ${id}`);
  const panel = page.getByRole('complementary', { name: /step details$/ });
  await visible(panel);
  if (name) await visible(panel.getByRole('heading', { name, exact: true }));
  await settle();
  await readableSelection(id);
  return panel;
}

async function run() {
  await mkdir(out, { recursive: true });
  await check('Setup', async () => {
    assert(process.env.E2E_BASE_URL, 'E2E_BASE_URL is required');
    assert(process.env.E2E_ENV_FILE, 'E2E_ENV_FILE is required');
    base = new URL(process.env.E2E_BASE_URL);
    assert(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password,
      'E2E_BASE_URL must be an HTTP(S) URL without credentials');
    base = new URL(base.origin);
    const env = await readFile(process.env.E2E_ENV_FILE, 'utf8');
    const values: Record<string, string> = {};
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?(DASHBOARD_FOUNDER_USERNAME|DASHBOARD_FOUNDER_PASSWORD)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      try {
        const value = m[2].startsWith('"') ? JSON.parse(m[2]) : m[2];
        assert(typeof value === 'string', 'Credential value must be a string');
        values[m[1]] = value;
      } catch { throw new Error(`Invalid dotenv value for ${m[1]}`); }
    }
    username = values.DASHBOARD_FOUNDER_USERNAME;
    password = values.DASHBOARD_FOUNDER_PASSWORD;
    assert(username && password, 'Founder credentials are missing from E2E_ENV_FILE');
    const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
    const imported = await import(isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
    const pw = imported.chromium ? imported : imported.default;
    assert(pw?.chromium && pw?.request, 'Playwright module must export chromium and request');
    chromium = pw.chromium;
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    configureContext = async () => {
      context.setDefaultTimeout(timeout);
      context.setDefaultNavigationTimeout(timeout);
      // tsx (esbuild keepNames) wraps functions passed to page.evaluate in __name().
      await context.addInitScript('globalThis.__name = globalThis.__name || ((fn) => fn);');
      // Copy assertions use the real API with an in-memory mirror. This also works
      // on HTTP staging hosts where Chromium disables the system clipboard API.
      await context.addInitScript(() => {
        const original = navigator.clipboard?.writeText?.bind(navigator.clipboard);
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
          writeText: async (text: string) => {
            (window as any).__e2eCopied = text;
            if (original) { try { await original(text); } catch { /* no system clipboard permission */ } }
          },
        } });
      });
    };
    await configureContext();
    // Fail closed for all browser writes, including accidental future UI changes.
    // Installed after the login checks (see protectWrites below): with the route
    // in place, Chromium blocked the second login POST (ERR_BLOCKED_BY_CLIENT).
    protectWrites = () => context.route('**/*', async (route: PW) => {
      const req = route.request(), url = new URL(req.url());
      const method = req.method();
      // Cloudflare's own beacon and bot check (RUM, challenge platform) are not app writes.
      if (['GET', 'HEAD', 'OPTIONS'].includes(method) || isEdge(req.url())) return route.continue();
      let allowed = url.origin === base.origin && method === 'POST' &&
        ['/api/auth/login', '/api/auth/logout'].includes(url.pathname);
      if (url.origin === base.origin && method === 'POST' && url.pathname === '/api/admin/premium') {
        try { allowed = req.postDataJSON()?.action === 'preview'; } catch { allowed = false; }
      }
      if (allowed) return route.continue();
      blocked.push(`${method} ${safeUrl(req.url())}`);
      await route.abort('blockedbyclient');
    });
    anonymous = await pw.request.newContext({ baseURL: base.origin, timeout });
    page = await context.newPage();
    attachPage = () => {
      page.on('crash', () => { crashed = true; });
      page.on('console', (msg: PW) => {
        if (msg.type() === 'error' && !isEdge(msg.location()?.url ?? '')) issues.push({ kind: 'console', detail: clean(msg.text()) });
      });
      page.on('pageerror', (error: Error) => issues.push({ kind: 'pageerror', detail: clean(error.message) }));
      page.on('request', (r: PW) => { if (!isEdge(r.url())) { pending.add(r); lastNetwork = Date.now(); } });
      const done = (r: PW) => { if (pending.delete(r)) lastNetwork = Date.now(); };
      page.on('requestfinished', done);
      page.on('requestfailed', (r: PW) => {
        done(r);
        if (isEdge(r.url())) return;
        const error = r.failure()?.errorText || 'unknown transport failure';
        const prefetch = r.headers()['next-router-prefetch'] || r.headers().purpose === 'prefetch';
        // AbortController cancellations also occur on window/filter changes.
        if (/ERR_ABORTED|NS_BINDING_ABORTED|aborted/i.test(error)) return;
        issues.push({ kind: 'requestfailed', detail: `${r.method()} ${safeUrl(r.url())}: ${error}${prefetch ? ' (prefetch)' : ''}` });
      });
      page.on('response', (r: PW) => {
        if (r.status() >= 400 && !isEdge(r.url())) issues.push({ kind: 'http', detail: `HTTP ${r.status()} ${safeUrl(r.url())}` });
      });
    };
    attachPage();
    return `Chromium headless; desktop 1440×900; output ${out}`;
  });
  if (!page) return;

  for (const path of ['/api/traces', '/api/admin/overview']) await check(`Auth anonymous ${path}`, async () => {
    const r = await anonymous.get(path);
    assert(r.status() === 401, `Expected 401, received ${r.status()}`);
  });
  await check('Auth cross-origin login', async () => {
    const r = await anonymous.post('/api/auth/login', { headers: { Origin: 'https://e2e.invalid' },
      data: { username: 'e2e-cross-origin-probe', password: randomUUID() } });
    assert(r.status() === 403, `Expected 403, received ${r.status()}`);
    assert(!r.headers()['set-cookie'], 'Rejected cross-origin login set a cookie');
  });
  await check('Auth wrong password preserves username', async () => {
    await goto('/login');
    await enabled(page.getByRole('button', { name: 'Sign in', exact: true }));
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.getByLabel('Password', { exact: true }).fill(randomUUID());
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await visible(page.getByRole('alert').filter({ hasText: 'Credentials not accepted.' }));
    assert(await page.getByLabel('Username', { exact: true }).inputValue() === username, 'Username was cleared');
    assert(new URL(page.url()).pathname === '/login', 'Bad credentials left login');
  });
  const loggedIn = await check('Auth logged-out deep link and founder login', async () => {
    await goto('/traces?w=7d');
    await urlIs('/login');
    assert(new URL(page.url()).searchParams.get('next') === '/traces?w=7d', 'Login lost deep-link return path');
    await enabled(page.getByRole('button', { name: 'Sign in', exact: true }));
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await urlIs('/traces', { w: '7d' });
    await settle();
    await visible(page.getByText('Founder', { exact: true }));
  });
  if (!loggedIn) return;
  await protectWrites();
  writesProtected = true;
  storageState = await context.storageState();
  // Expected wrong-password 401s above must not pollute page health checks.
  issues.length = 0;
  let healthCursor = 0;
  async function health() {
    await settle();
    const found = issues.slice(healthCursor); healthCursor = issues.length;
    assert(!found.length, found.map(i => `${i.kind}: ${i.detail}`).join('; '));
    // Next's route announcer lives outside main and is not a page error.
    const alerts = page.locator('main [role="alert"]:visible').filter({ hasText: /\S/ });
    assert(await alerts.count() === 0, 'Page displays an error alert');
  }
  for (const [name, path] of pages) {
    await check(`Shell ${name} navigation and highlight`, async () => {
      const link = page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name, exact: true });
      await link.click(); await urlIs(path); await settle();
      await visible(page.getByRole('heading', { level: 1, name: name === 'AI' ? 'AI usage' : name, exact: true }).first());
      // Sidebar currently expresses selection through font/background classes.
      assert((await link.getAttribute('class'))?.includes('font-medium'), 'Active sidebar link is not highlighted');
      for (const [other] of pages.filter(([n]) => n !== name)) {
        const inactive = page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: other, exact: true });
        assert(!(await inactive.getAttribute('class'))?.includes('font-medium'), `${other} also highlighted`);
      }
    });
    await check(`${name} load health and screenshot`, async () => {
      await health();
      const file = await screenshot(`page-${name}`);
      return `No console errors, failed requests, or alerts; screenshot ${file}`;
    });
    await check(`${name} window URL and rendered selection`, async () => {
      if (!windowPages.has(name)) return 'N/A — this page has no window control';
      // Read the selected window from the page: defaults differ per page.
      const windows = await page.locator('main [role="radio"], main button[aria-pressed]').evaluateAll((els: HTMLElement[]) =>
        els.map(el => ({ name: (el.textContent || '').trim(), on: el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true' || el.dataset.state === 'on' }))
          .filter(w => /^\d+[hd]$/.test(w.name)));
      const previous = windows.find(w => w.on)?.name ?? new URL(page.url()).searchParams.get('w') ?? '';
      const target = windows.find(w => !w.on && w.name !== previous)?.name;
      assert(target, `No alternative window control (found ${windows.map(w => w.name).join(', ') || 'none'})`);
      const control = page.getByRole('radio', { name: target, exact: true }).or(page.getByRole('button', { name: target, exact: true })).first();
      const before = await page.locator('main').innerText();
      renderedWindows.set(`${path}:${previous}`, before);
      const responses: PW[] = [];
      const onResponse = (response: PW) => {
        const url = new URL(response.url());
        if (response.request().method() === 'GET' && url.origin === base.origin &&
            url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/')) responses.push(response);
      };
      page.on('response', onResponse);
      try {
        // Re-click until the URL changes: a click during the page's remount can be lost.
        await eventually(async () => {
          if (new URL(page.url()).searchParams.get('w') !== target) await control.click();
          return new URL(page.url()).searchParams.get('w') === target;
        }, 'Window control did not update the URL');
        await urlIs(path, { w: target });
        await eventually(async () => (await control.getAttribute('aria-pressed')) === 'true' || (await control.getAttribute('aria-checked')) === 'true' || (await control.getAttribute('data-state')) === 'on', 'Visible window control did not update');
        await settle();
        await visible(page.getByRole('heading', { level: 1 }).first());
        await eventually(async () => {
          const after = await page.locator('main').innerText();
          return after !== before || renderedWindows.get(`${path}:${target}`) === after || responses.some(r => r.ok());
        }, 'Window changed in the URL but no updated data, cached rendering, or successful response was observed');
        assert(responses.every(r => r.ok()), 'Window data request failed');
        assert(await page.locator('main [aria-label="Loading data"]').count() === 0, 'Window still loading');
        renderedWindows.set(`${path}:${target}`, await page.locator('main').innerText());
        return `?w=${target}; visible selection plus updated/cached data or successful response`;
      } finally { page.off('response', onResponse); }
    });
    await check(`${name} Refresh`, async () => {
      const button = page.getByRole('button', { name: 'Refresh', exact: true });
      await enabled(button);
      await apiAction(() => button.click(), u => u.pathname.startsWith('/api/') && !u.pathname.startsWith('/api/auth/'));
      await enabled(button);
      return 'Refresh fetched data and settled';
    });
    await check(`${name} chart rail hover and pin`, async () => {
      if (!chartPages.has(name)) return 'N/A — this page has no chart rail';
      const rails = page.getByRole('group', { name: /^(Series|Models)$/ });
      await visible(rails.first());
      let rail: PW;
      for (const candidate of await rails.all()) if (await candidate.getByRole('button').count() >= 2) { rail = candidate; break; }
      if (!rail) return 'N/A — rendered rails contain fewer than two series';
      const buttons = rail.getByRole('button'), first = buttons.nth(0), second = buttons.nth(1);
      await first.hover();
      await eventually(async () => Number(await second.evaluate((el: HTMLElement) => getComputedStyle(el).opacity)) < 0.9, 'Rail hover did not dim another series');
      await first.click();
      assert(await first.getAttribute('aria-pressed') === 'true', 'Rail did not pin');
      await page.getByRole('heading', { level: 1 }).first().hover();
      await eventually(async () => Number(await second.evaluate((el: HTMLElement) => getComputedStyle(el).opacity)) < 0.9, 'Pin did not persist after mouse left');
      await first.click(); await page.getByRole('heading', { level: 1 }).first().click();
      assert(await first.getAttribute('aria-pressed') === 'false', 'Rail did not unpin');
      await eventually(async () => Number(await second.evaluate((el: HTMLElement) => getComputedStyle(el).opacity)) === 1, 'Series did not restore opacity');
    });
    await check(`${name} interaction health`, health);
  }
  for (const [source, target] of [['/analytics','/'], ['/requests','/traces'], ['/trace','/traces'],
    ['/coverage','/ingredients'], ['/pipeline','/ai'], ['/retrieval','/ingredients']]) {
    await check(`Redirect ${source}`, async () => { await goto(source); await urlIs(target); });
  }
  await check('Shell command palette page navigation', async () => {
    await page.keyboard.press('Meta+k');
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    await visible(dialog);
    await dialog.getByRole('textbox').fill('Ingredients');
    await dialog.getByRole('textbox').press('Enter'); await urlIs('/ingredients'); await settle();
  });
  for (const [path, tabs] of [
    ['/premium', [['overview','Overview'], ['give','Give / End'], ['accounts','Accounts'], ['activity','Activity']]],
    ['/ingredients', [['matching','Matching'], ['catalog','Catalog']]],
  ] as const) await check(`Tabs ${path} URL, back, reload`, async () => {
    await goto(`${path}?tab=${tabs[0][0]}`);
    for (const [value, label] of tabs.slice(1)) {
      const previous = new URL(page.url()).searchParams.get('tab')!;
      await page.getByRole('tab', { name: label, exact: true }).click(); await urlIs(path, { tab: value });
      await page.goBack(); await urlIs(path, { tab: previous });
      await page.getByRole('tab', { name: label, exact: true }).click();
      await urlIs(path, { tab: value }); await page.reload(); await settle();
      assert(await page.getByRole('tab', { name: label, exact: true }).getAttribute('aria-selected') === 'true', 'Reload lost selected tab');
      await urlIs(path, { tab: value });
    }
  });

  await check('Premium founder controls (no submissions)', async () => {
    await goto('/premium?tab=overview');
    await enabled(page.getByRole('button', { name: 'Save welcome offer', exact: true }));
    await page.getByRole('tab', { name: 'Give / End', exact: true }).click(); await settle();
    for (const name of ['Who', 'Action', 'Mode', 'Length'])
      await enabled(page.getByRole('combobox', { name, exact: true }));
    await enabled(page.getByRole('textbox', { name: 'Reason', exact: true }));
    await enabled(page.getByRole('button', { name: 'Preview affected accounts', exact: true }));
    const actions = await page.getByRole('combobox', { name: 'Action', exact: true }).locator('option').allTextContents();
    assert(actions.includes('Give free Premium') && actions.includes('End free Premium'), 'Give/end actions missing');
    await page.getByRole('tab', { name: 'Activity', exact: true }).click(); await settle();
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    if (await undo.count()) await enabled(undo.first());
    return `Offer, give/end, preview checked; ${await undo.count()} undo controls; nothing submitted`;
  });
  await check('Feedback status filters (no status changes)', async () => {
    await goto('/feedback');
    await apiAction(() => page.getByRole('group', { name: 'Status filter' }).getByRole('button', { name: 'Open', exact: true }).click(),
      u => u.pathname === '/api/admin/records' && u.searchParams.get('status') === 'open');
    await urlIs('/feedback', { status: 'open' });
    const controls = page.getByRole('combobox', { name: 'Update feedback status' });
    return `Open filter refetched; ${await controls.count()} inline status controls left unchanged`;
  });
  await check('System founder snapshot control (no run)', async () => {
    await goto('/system');
    const to = new Date(), from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 6);
    const direct = await readJson(`/api/cloud-monitoring?from=${from.toISOString().slice(0,10)}&to=${to.toISOString().slice(0,10)}`);
    if (direct.delivery_source === 'cloudflare-direct') return 'N/A — direct monitoring delivery omits the Snapshot section';
    await visible(page.getByText('Refresh analytics snapshot', { exact: true }));
    await visible(page.getByRole('button', { name: /^(Run snapshot|Run in progress|Server guard · \d+s)$/ }));
    return 'Refresh analytics snapshot control exists; left untouched';
  });

  await check('KPI labels at 1280px', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const path of ['/', '/ai', '/ingredients', '/system', '/premium']) {
      await goto(path); await kpiLabelsFit();
      if (path === '/') await visible(page.getByText('Last full UTC day', { exact: true }));
    }
  });

  let firstSuccess: any, firstError: any;
  await check('Traces discover first success and error rows', async () => {
    const success = await readJson('/api/traces?w=30d&status=success&limit=25');
    const errors = await readJson('/api/traces?w=30d&status=error&limit=25');
    firstSuccess = success.rows[0]; firstError = errors.rows[0];
    assert(firstSuccess, 'No success row in 30d; success detail coverage unavailable');
    return `First success found; error row ${firstError ? 'found' : 'absent (error detail N/A)'}`;
  });
  await check('Traces row id, meal, latency, kcal and count', async () => {
    await goto('/traces?w=30d&status=success');
    const rows = page.locator('[data-trace-id]'); await visible(rows.first());
    const row = rows.first(), id = await row.getAttribute('data-trace-id');
    assert(id && /^[0-9a-f-]{36}$/i.test(id), 'Row lacks full UUID');
    const text = await row.innerText();
    assert(text.includes(id.slice(0,8)) && /kcal/.test(text) && /(?:\d[\d,.]*\s*(?:ms|s|min)|—)/.test(text), 'Row lacks id, latency or kcal');
    assert(await row.locator('[title]').first().getAttribute('title'), 'Meal text missing');
    await visible(page.locator('[aria-live="polite"]').filter({ hasText: /\d+ shown/ }));
  });
  await check('Traces status, model and flag filters combine', async () => {
    await goto('/traces?w=30d');
    await apiAction(() => page.getByRole('button', { name: 'Success', exact: true }).click(),
      u => u.pathname === '/api/traces' && u.searchParams.get('status') === 'success');
    const select = page.getByRole('combobox', { name: 'Model', exact: true });
    const value = await select.locator('option').nth(1).getAttribute('value');
    assert(value, 'No model option available');
    await apiAction(() => select.selectOption(value), u => u.pathname === '/api/traces' && u.searchParams.get('model') === value);
    await apiAction(() => page.getByRole('button', { name: 'chunked', exact: true }).click(),
      u => u.pathname === '/api/traces' && u.searchParams.get('flags') === 'chunked');
    await urlIs('/traces', { status: 'success', model: value, flags: 'chunked' });
    assert(await page.getByRole('button', { name: 'chunked', exact: true }).getAttribute('aria-pressed') === 'true', 'Flag is not selected');
  });
  await check('Traces text search', async () => {
    assert(firstSuccess, 'Requires success row');
    await goto('/traces?w=30d');
    const term = (firstSuccess.rawInput || firstSuccess.mealName || '').slice(0,32).trim();
    assert(term, 'Success trace has no meal text');
    const input = page.getByRole('textbox', { name: 'Search meal text or request UUID' });
    await input.fill(term);
    await apiAction(() => input.press('Enter'), u => u.pathname === '/api/traces' && u.searchParams.get('q') === term);
    await urlIs('/traces', { q: term });
    await visible(page.locator(`[data-trace-id="${firstSuccess.id}"]`));
  });
  await check('Traces Load more appends', async () => {
    await goto('/traces?w=30d');
    const more = page.getByRole('button', { name: 'Load more', exact: true });
    if (!await more.count()) return 'N/A — no next cursor in 30d';
    const before = await page.locator('[data-trace-id]').evaluateAll((els: HTMLElement[]) => els.map(el => el.dataset.traceId));
    await apiAction(() => more.click(), u => u.pathname === '/api/traces' && u.searchParams.has('cursor'));
    const after = await page.locator('[data-trace-id]').evaluateAll((els: HTMLElement[]) => els.map(el => el.dataset.traceId));
    assert(after.length > before.length && before.every((id: string, i: number) => after[i] === id), 'Load more replaced rows or appended nothing');
    return `${before.length} → ${after.length} rows; original prefix preserved`;
  });
  await check('Traces j/k/Enter keyboard navigation', async () => {
    await goto('/traces?w=30d');
    const rows = page.locator('[data-trace-id]'); assert(await rows.count() >= 2, 'Need two rows for j/k');
    await page.getByRole('heading', { name: 'Traces', exact: true }).click();
    await page.keyboard.press('j'); await page.keyboard.press('j');
    await eventually(async () => await rows.nth(1).getAttribute('aria-current') === 'true', 'j did not move to second row');
    await page.keyboard.press('k');
    await eventually(async () => await rows.first().getAttribute('aria-current') === 'true', 'k did not move to first row');
    const id = await rows.first().getAttribute('data-trace-id');
    await page.keyboard.press('Enter'); await urlIs(`/traces/${id}`); await settle();
  });
  await check('Traces full UUID search opens detail', async () => {
    assert(firstSuccess, 'Requires success row'); await goto('/traces?w=30d');
    const input = page.getByRole('textbox', { name: 'Search meal text or request UUID' });
    await input.fill(firstSuccess.id); await input.press('Enter'); await urlIs(`/traces/${firstSuccess.id}`); await settle();
  });
  await check('Shell command palette UUID navigation and legacy detail redirect', async () => {
    assert(firstSuccess, 'Requires success row'); await goto('/');
    await page.keyboard.press('Meta+k');
    const input = page.getByRole('dialog', { name: 'Command palette' }).getByRole('textbox');
    await input.fill(firstSuccess.id); await input.press('Enter'); await urlIs(`/traces/${firstSuccess.id}`); await settle();
    await goto(`/trace/${firstSuccess.id}`); await urlIs(`/traces/${firstSuccess.id}`);
  });

  for (const kind of ['success','error'] as const) {
    const row = kind === 'success' ? firstSuccess : firstError;
    if (!row) {
      await check(`Trace ${kind} detail coverage`, async () => kind === 'error' ? 'N/A — no error trace in 30d' : Promise.reject(new Error('No success trace available')));
      continue;
    }
    await check(`Trace ${kind} summary and canvas`, async () => {
      await goto(`/traces/${row.id}?w=30d`);
      const summary = page.getByRole('region', { name: 'Meal summary' });
      await visible(summary);
      assert((await summary.innerText()).includes(kind === 'error' ? 'No result' : 'kcal'), 'Summary lacks expected nutrition/result label');
      for (const id of ['decomposition','matching','nutrition','assembly','response'])
        await visible(page.locator(`.react-flow__node[data-id="${id}"]`));
      assert(await page.locator('.react-flow__node[data-id="request"]').count() === 0, 'Removed Request node reappeared');
      const graph = buildGraph(await readJson(`/api/traces/${row.id}`));
      for (const edge of graph.edges.filter(edge => edge.label)) {
        await visible(page.getByText(edge.label!, { exact: true }));
        const path = page.locator(`.react-flow__edge[data-id=${JSON.stringify(edge.id)}] .react-flow__edge-path`);
        assert(await path.evaluate((el: SVGElement) => getComputedStyle(el).strokeDasharray !== 'none'), 'Gap edge is not dashed');
      }
      await screenshot(`trace-${kind}`);
    });
    for (const [id, name] of [['decomposition','Decomposition'],['matching','Matching'],
      ['nutrition','Nutrition'],['assembly','Assembly'],['response','Response']]) {
      await check(`Trace ${kind} node ${name}`, async () => {
        if (new URL(page.url()).pathname !== `/traces/${row.id}`) await goto(`/traces/${row.id}`);
        await selectStep(id, name);
      });
    }
    await check(`Trace ${kind} group call list`, async () => {
      await goto(`/traces/${row.id}`);
      const nodes = page.locator('.react-flow__node');
      const ids = await nodes.evaluateAll((els: HTMLElement[]) => els.map(el => el.dataset.id || ''));
      const id = ids.find((id: string) => /selector|chunk|after-response/.test(id));
      if (!id) return 'N/A — no selector, chunk or after-response node';
      const panel = await selectStep(id);
      const calls = panel.locator('details').filter({ has: page.locator('summary', { hasText: /^Calls$/ }) });
      await visible(calls);
      const call = calls.getByRole('button', { name: /^#\d+ ·/ }).first();
      await visible(call);
      assert(await call.evaluate((el: HTMLElement) => el.getBoundingClientRect().height) === 28, 'Call row is not 28 px');
      await call.click();
      await eventually(async () => await call.getAttribute('aria-expanded') === 'true', 'Call did not expand');
      await settle();
      await call.click();
      assert(await call.getAttribute('aria-expanded') === 'false', 'Call did not collapse');
    });
    await check(`Trace ${kind} Output JSON expand, collapse and copy`, async () => {
      await goto(`/traces/${row.id}`);
      // Response always provides a local JSON result, including failed traces.
      const panel = await selectStep('response', 'Response');
      const output = panel.locator('details').filter({ has: page.locator('summary', { hasText: /^Output$/ }) });
      await visible(output.getByLabel('JSON tree'));
      await output.getByRole('button', { name: 'Collapse all', exact: true }).click();
      await visible(output.getByRole('button', { name: 'Expand root', exact: true }));
      await output.getByRole('button', { name: 'Expand root', exact: true }).click();
      await visible(output.getByRole('button', { name: 'Collapse root', exact: true }));
      await output.getByRole('button', { name: 'Collapse root', exact: true }).click();
      await visible(output.getByRole('button', { name: 'Expand root', exact: true }));
      await output.getByRole('button', { name: 'Expand all', exact: true }).click();
      await visible(output.getByRole('button', { name: 'Collapse root', exact: true }));
      await visible(output.getByRole('button', { name: 'Copy status', exact: true }));
      await page.evaluate(() => { (window as any).__e2eCopied = null; });
      await output.getByRole('button', { name: 'Copy all', exact: true }).click();
      await visible(output.getByRole('button', { name: 'Copied', exact: true }));
      const copied = await page.evaluate(() => (window as any).__e2eCopied);
      assert(typeof copied === 'string' && JSON.parse(copied).status, 'Copy did not receive full JSON');
      await output.getByRole('button', { name: 'Collapse all', exact: true }).click();
      await visible(output.getByRole('button', { name: 'Expand root', exact: true }));
      return 'Tree controls and copy payload verified (clipboard mirrored in browser memory)';
    });
    await check(`Trace ${kind} keyboard, fit, Escape and step deep link`, async () => {
      await goto(`/traces/${row.id}?step=nutrition&w=7d`);
      await visible(page.getByRole('complementary', { name: 'Nutrition step details' }));
      await settle();
      // Blur controls before testing global shortcuts.
      await page.locator('body').click({ position: { x: 2, y: 2 } });
      const graph = buildGraph(await readJson(`/api/traces/${row.id}`));
      const nextId = adjacentStep(graph.nodes, 'nutrition', 1);
      assert(nextId && nextId !== 'nutrition', 'Nutrition has no following recorded step');
      await page.keyboard.press(']');
      await eventually(async () => new URL(page.url()).searchParams.get('step') === nextId, '] did not move to the next step in time order');
      await readableSelection(nextId);
      await page.keyboard.press('['); await urlIs(`/traces/${row.id}`, { step: adjacentStep(graph.nodes, nextId, -1)! });
      await readableSelection(adjacentStep(graph.nodes, nextId, -1)!);
      // Pan away first so f must make a visible viewport change.
      const viewport = page.locator('.react-flow__viewport');
      await page.getByRole('button', { name: /zoom out/i }).click();
      await new Promise(r => setTimeout(r, 400));
      const before = await viewport.getAttribute('style');
      await page.locator('body').click({ position: { x: 2, y: 2 } }); await page.keyboard.press('f');
      await eventually(async () => await viewport.getAttribute('style') !== before, 'f did not change canvas viewport');
      await page.keyboard.press('Escape');
      await eventually(async () => await page.getByRole('complementary', { name: /step details$/ }).count() === 0, 'Escape did not close panel');
      assert(!new URL(page.url()).searchParams.has('step'), 'Escape left step URL');
    });
    await check(`Trace ${kind} health`, health);
  }
  await check('Trace unknown UUID not found', async () => {
    // The expected 404 is explicitly isolated from ordinary page health checks.
    await health();
    await goto(`/traces/${randomUUID()}`);
    await visible(page.getByRole('heading', { name: 'No trace for this id', exact: true }));
    await visible(page.getByRole('link', { name: 'Search traces', exact: true }));
    const unexpected = issues.slice(healthCursor).filter(i =>
      !(i.kind === 'http' && i.detail.startsWith('HTTP 404 ')) &&
      !(i.kind === 'console' && /Failed to load resource.*404/.test(i.detail)));
    healthCursor = issues.length;
    assert(!unexpected.length, unexpected.map(i => i.detail).join('; '));
  });
  viewport = { width: 375, height: 812 };
  for (const [name, path] of pages) await check(`Mobile ${name} 375×812`, async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await goto(path); await noOverflow(); await kpiLabelsFit();
    if (name === 'Overview') await visible(page.getByText('Last full UTC day', { exact: true }));
    await screenshot(`mobile-${name}`);
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    const nav = page.getByRole('dialog', { name: 'Navigation', exact: true });
    await visible(nav);
    const [nextName, nextPath] = pages[(pages.findIndex(([n]) => n === name) + 1) % pages.length];
    await nav.getByRole('button', { name: nextName, exact: true }).click(); await urlIs(nextPath); await settle();
    assert(await nav.count() === 0, 'Mobile navigation did not close');
    await health();
  });
  if (firstSuccess) await check('Mobile trace detail and panel 375×812', async () => {
    await goto(`/traces/${firstSuccess.id}?step=nutrition`);
    await visible(page.getByRole('complementary', { name: 'Nutrition step details' }));
    await noOverflow();
    const panel = page.getByRole('complementary', { name: 'Nutrition step details' });
    const box = await panel.boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 376 && Math.abs(box.y + box.height - 812) <= 1 && box.height <= 812 * .55 + 1, 'Inspector exceeds the 55dvh bottom sheet limit');
    const summaryBox = await page.getByRole('region', { name: 'Meal summary' }).boundingBox();
    assert(box && summaryBox && summaryBox.y + summaryBox.height <= box.y + 1, 'Inspector covers the compact meal summary');
    await screenshot('mobile-trace-panel');
    await page.getByRole('button', { name: 'Close step panel', exact: true }).click();
    await noOverflow(); await screenshot('mobile-trace-detail'); await health();
  });
  await check('Auth logout returns to login', async () => {
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await urlIs('/login');
    await page.goto(new URL('/traces?w=7d', base).href, { waitUntil: 'domcontentloaded' }); await urlIs('/login');
  });
  await check('Production read-only guard', async () => {
    assert(blocked.length === 0, `Blocked unexpected write attempts: ${blocked.join('; ')}`);
    return 'No Premium saves/give/end/undo, feedback changes, or snapshot requests attempted';
  });
}

try { await run(); }
catch (error) { await check('Runner unexpected failure', async () => { throw error; }); }
finally {
  for (const [name, resource] of [['anonymous context', anonymous], ['browser context', context], ['browser', browser]] as const) {
    try { if (resource) await (resource.dispose ? resource.dispose() : resource.close()); }
    catch { await check(`Cleanup ${name}`, async () => { throw new Error('Resource cleanup failed'); }); }
  }
  const passed = checks.filter(c => c.pass).length, failed = checks.length - passed;
  const notApplicable = checks.filter(c => c.detail.startsWith('N/A')).map(c => c.name);
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'report.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), baseUrl: base!?.origin,
    readOnly: true, passed, failed, notApplicable, checks,
    limitations: ['Live checks only; unconfigured auth and reviewer role require separate server/credentials.',
      'No production writes, fault injection, Lighthouse, or build-size audit.',
      'Clipboard writes are mirrored in browser memory; system clipboard permission is not required.'],
  }, null, 2) + '\n');
  console.log(`${passed} passed, ${failed} failed, ${notApplicable.length} not applicable — ${resolve(out, 'report.json')}`);
  process.exitCode = failed ? 1 : 0;
}
