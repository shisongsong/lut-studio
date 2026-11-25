// Measure the app's load and time-to-first-look in a real browser.
//
// The audits and the daily run kept writing throwaway Playwright scripts in
// /tmp for this; the numbers that decide "is this change better?" should be
// reproducible instead. This is a dev tool: it serves `public/` with a
// throwaway static server, throttles the network like a slow phone, and reports
// FCP / DCL / first-look / HTML transfer.
//
//   node scripts/bench-app-load.mjs                 # 3 runs, 1.6 Mbps / 200 ms
//   RUNS=5 node scripts/bench-app-load.mjs
//   BASE=http://127.0.0.1:8787 node scripts/bench-app-load.mjs   # existing server
//
// The bundled server is `wrangler dev --local`, not `python3 -m http.server`:
// the Worker compresses HTML and resolves clean URLs, and measuring raw,
// uncompressed HTML from a bare static server gives numbers that are ~1.5 s
// worse and not comparable with production. Point BASE at an already-running
// `wrangler dev` to reuse it.
//
// Requires playwright-core + a Chromium (same wiring as build-look-previews.mjs):
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs
//   PLAYWRIGHT_CHROMIUM=/path/to/chrome
//
// "first look" = the moment the filmstrip stops showing skeletons, i.e. the
// first look the visitor could actually apply. It is the number this product
// lives or dies by; FCP and transfer size are secondary.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.BENCH_PORT || 8907);
const OWN_SERVER = !process.env.BASE;
const BASE = process.env.BASE || `http://127.0.0.1:${PORT}`;
const RUNS = Number(process.env.RUNS || 3);
const RTT_MS = Number(process.env.RTT_MS || 200);
const MBPS = Number(process.env.MBPS || 1.6);
const TIMEOUT_MS = Number(process.env.FIRST_LOOK_TIMEOUT || 120000);
const CHROMIUM =
  process.env.PLAYWRIGHT_CHROMIUM ||
  join(process.env.HOME || '', 'Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

async function loadPlaywright() {
  for (const candidate of [process.env.PLAYWRIGHT_CORE, 'playwright-core', join(ROOT, 'node_modules', 'playwright-core', 'index.mjs')].filter(Boolean)) {
    if (candidate.includes('/') && !existsSync(candidate)) continue;
    try { return await import(candidate); } catch { /* next */ }
  }
  throw new Error('playwright-core not found — set PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs');
}

const median = (values) => {
  const list = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  return list.length ? list[Math.floor(list.length / 2)] : null;
};

let server = null;
if (OWN_SERVER) {
  server = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--local'], { cwd: ROOT, stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 400 && !up; i++) {
    try { up = (await fetch(`${BASE}/`)).ok; } catch { /* still starting */ }
    if (!up) await new Promise((r) => setTimeout(r, 250));
  }
  if (!up) throw new Error('wrangler dev did not start — run it yourself and pass BASE');
}

try {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ['--no-proxy-server'] });
  const runs = [];
  for (let run = 0; run < RUNS; run++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: RTT_MS,
      downloadThroughput: (MBPS * 1024 * 1024) / 8,
      uploadThroughput: (0.75 * 1024 * 1024) / 8,
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const sample = await page.evaluate(
      ({ timeout }) =>
        new Promise((resolve) => {
          const started = performance.now();
          const timer = setInterval(() => {
            const chips = [...document.querySelectorAll('#film .chip')];
            const painted = chips.filter((c) => !c.classList.contains('loading')).length;
            if (painted > 1 && chips.length > 1) {
              clearInterval(timer);
              const nav = performance.getEntriesByType('navigation')[0];
              const paint = performance.getEntriesByType('paint').reduce((acc, entry) => ({ ...acc, [entry.name]: Math.round(entry.startTime) }), {});
              resolve({
                firstLookMs: Math.round(performance.now()),
                fcp: paint['first-contentful-paint'] ?? null,
                dcl: Math.round(nav.domContentLoadedEventEnd),
                transfer: nav.transferSize,
              });
            }
          }, 25);
          setTimeout(() => { clearInterval(timer); resolve({ firstLookMs: null, timedOut: true }); }, timeout);
        }),
      { timeout: TIMEOUT_MS }
    );
    runs.push({ ...sample, errors: errors.slice(0, 3) });
    await context.close();
  }
  await browser.close();

  const failed = runs.filter((r) => r.firstLookMs == null).length;
  console.log(JSON.stringify({
    base: BASE,
    profile: { rttMs: RTT_MS, mbps: MBPS, runs: RUNS },
    p50: {
      firstLookMs: median(runs.map((r) => r.firstLookMs)),
      fcp: median(runs.map((r) => r.fcp)),
      dcl: median(runs.map((r) => r.dcl)),
      htmlTransfer: median(runs.map((r) => r.transfer)),
    },
    timedOutRuns: failed,
    errors: runs.flatMap((r) => r.errors).slice(0, 5),
  }, null, 2));
} finally {
  if (server) server.kill();
}
