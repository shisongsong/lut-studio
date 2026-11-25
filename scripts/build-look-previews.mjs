// Render the before/after previews for the per-look pages.
//
// Each look page shows the same sample photo twice: developed neutrally (before)
// and through the look at 100 % (after). Those images must come from the real
// pipeline, not a re-implementation, so this script drives the actual app in
// headless Chromium: it opens `/?look=<id>`, waits until the look is applied,
// and reads the two canvases the renderer already painted (`#base` holds the
// neutral render, the visible `.layer` canvas holds the graded one).
//
// The app is served by a throwaway static server over `public/`, so this script
// only needs Python 3 and a Playwright Chromium. It is a content-generation tool,
// not part of `npm run deploy`: run it when a look page is added or the recipes
// change, then commit the JPEGs.
//
//   node scripts/build-look-previews.mjs                 # all LAUNCHED looks
//   node scripts/build-look-previews.mjs kodak-trix-400  # one look
//
// Playwright resolution: PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs, or
// a `playwright-core` installed next to the repo. Chromium: PLAYWRIGHT_CHROMIUM
// or the default ms-playwright cache path.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOOKS } from '../public/js/looks.js';
import { LAUNCHED_LOOK_IDS } from './site/look-page.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'photos', 'looks');
const PORT = Number(process.env.PREVIEW_PORT || 8901);
const BASE = `http://127.0.0.1:${PORT}`;
const CHROMIUM =
  process.env.PLAYWRIGHT_CHROMIUM ||
  join(process.env.HOME || '', 'Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

async function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE,
    'playwright-core',
    join(ROOT, 'node_modules', 'playwright-core', 'index.mjs'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes('/') && !existsSync(candidate)) continue;
    try {
      return await import(candidate);
    } catch { /* try the next candidate */ }
  }
  throw new Error('playwright-core not found — set PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs');
}

function startServer() {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '-d', 'public'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  return server;
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('static server did not start');
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ids = wanted.length ? wanted : LAUNCHED_LOOK_IDS;

const { chromium } = await loadPlaywright();
const server = startServer();
try {
  await waitForServer();
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 801 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const capture = async (url) => {
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Ready = the filmstrip has real chips and the base canvas has been painted.
    await page.waitForFunction(() => document.querySelectorAll('#film .chip:not(.loading)').length > 1, null, { timeout: 60000 });
    await page.waitForFunction(
      () => {
        const name = document.getElementById('lookName');
        const layer = document.querySelector('#field canvas.layer:not(.off)');
        const base = document.getElementById('base');
        return name && name.textContent.trim() && layer && layer.width > 0 && base && base.width > 0;
      },
      null,
      { timeout: 120000 }
    );
    // Two frames so the crossfade and the histogram have settled.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(400);
    // The canvas is sized from the viewport; normalise to the 1200x801 the page
    // markup declares (same aspect as the sample photo) so the <img> width/height
    // attributes stay honest and there is no layout shift.
    return page.evaluate(() => {
      const W = 1200, H = 801;
      const exportCanvas = (canvas) => {
        const out = document.createElement('canvas');
        out.width = W; out.height = H;
        const ctx = out.getContext('2d', { alpha: false });
        ctx.drawImage(canvas, 0, 0, W, H);
        return out.toDataURL('image/jpeg', 0.85);
      };
      // Second, smaller export for the catalogue grid: 480x320 keeps the /looks
      // page light (a full 1200px set would be ~2 MB of images).
      const exportThumb = (canvas) => {
        const out = document.createElement('canvas');
        out.width = 480; out.height = 320;
        out.getContext('2d', { alpha: false }).drawImage(canvas, 0, 0, 480, 320);
        return out.toDataURL('image/jpeg', 0.82);
      };
      return {
        lookName: document.getElementById('lookName').textContent.trim(),
        width: W,
        height: H,
        before: exportCanvas(document.getElementById('base')),
        after: exportCanvas(document.querySelector('#field canvas.layer:not(.off)')),
        beforeThumb: exportThumb(document.getElementById('base')),
        afterThumb: exportThumb(document.querySelector('#field canvas.layer:not(.off)')),
      };
    });
  };

  // The neutral frame is the same for every look: capture it once.
  const first = await capture('/');
  const decode = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  writeFileSync(join(OUT, 'before.jpg'), decode(first.before));
  writeFileSync(join(OUT, 'before-thumb.jpg'), decode(first.beforeThumb));
  console.log(`before.jpg ${first.width}x${first.height} ${(decode(first.before).length / 1024).toFixed(0)} KB (+ thumb)`);

  for (const id of ids) {
    const look = LOOKS.find((l) => l.id === id);
    if (!look) throw new Error(`unknown look ${id}`);
    const shot = await capture(`/?look=${id}`);
    if (shot.lookName !== look.name) {
      console.warn(`  ! ${id}: editor shows "${shot.lookName}", expected "${look.name}"`);
    }
    const jpeg = decode(shot.after);
    if (jpeg.length < 20000) throw new Error(`${id}: preview looks empty (${jpeg.length} bytes)`);
    writeFileSync(join(OUT, `${id}.jpg`), jpeg);
    writeFileSync(join(OUT, `${id}-thumb.jpg`), decode(shot.afterThumb));
    console.log(`${id}.jpg ${shot.width}x${shot.height} ${(jpeg.length / 1024).toFixed(0)} KB (+ thumb ${(decode(shot.afterThumb).length / 1024).toFixed(0)} KB)`);
  }

  await browser.close();
  if (errors.length) console.warn('page errors:', errors.slice(0, 5));
  console.log(`\nwrote ${ids.length + 1} images to public/photos/looks/`);
} finally {
  server.kill();
}
