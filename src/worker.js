/**
 * LUT ARCHIVE — Cloudflare Worker.
 *
 * Static assets are served from env.ASSETS. The worker adds, on top of that:
 *
 *  1. clean URLs. The crawlable pages are generated as `foo.html` files but are
 *     canonical without the extension (`/guides/raw-in-browser`), so `.html` is
 *     redirected to the clean path and a missing extensionless asset is retried
 *     with `.html` / `/index.html`. Without this every page would have two URLs
 *     and Google would pick one for us.
 *  2. a real 404 page instead of the assets binding's bare "Not Found".
 *  3. /api/geo, the country hint the client uses for its initial language.
 *  4. /api/beacon, first-party, cookieless analytics (see public/js/beacon.js):
 *     pageviews, the product funnel and field Core Web Vitals go to D1. Crawler
 *     hits are counted separately so the daily report can tell "nobody visits"
 *     apart from "crawlers visit but the pages lose the ranking".
 *  5. cache headers that tell the truth: fonts, vendor binaries and marketing
 *     photos change only on a redesign, so they may sit in the browser cache;
 *     HTML and app JS stay on a short TTL because they change together.
 *
 * `run_worker_first` is on in wrangler.jsonc so these redirects are ours and
 * not the assets layer's temporary 307s: a permanent redirect is what tells a
 * crawler the two URLs are one page.
 *
 * Note: do NOT set `content-encoding` on responses here. Cloudflare compresses
 * Worker responses on its own, so an origin-compressed body ends up compressed
 * twice and the browser only undoes one layer. The LUT pack is instead shipped
 * as a plain `luts.bin.gz` asset that the page inflates itself.
 *
 * Analytics privacy: no IP address is stored (it is never read), the user agent
 * is reduced to a short label, the referrer to a bare hostname, and the visitor
 * id is random and browser-generated. Nothing here links a visit to a photo —
 * photos never leave the device at all.
 */
import { notFoundHtml } from './not-found.js';

// Built per request: workerd rejects constructing responses at module scope.
const notFound = () =>
  new Response(notFoundHtml, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const REDIRECT = (location, status = 301) =>
  new Response(null, { status, headers: { location, 'cache-control': 'public, max-age=3600' } });

const noContent = () =>
  new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

function withHeaders(response, headers) {
  const next = new Response(response.body, response);
  for (const [name, value] of Object.entries(headers)) next.headers.set(name, value);
  return next;
}

async function asset(env, request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return env.ASSETS.fetch(new Request(url, request));
}

// ---- crawler classification ------------------------------------------------
// Order matters: the named crawlers are also matched by the generic pattern, so
// test the specific ones first. AI crawlers are tracked by name on purpose: the
// pages are written for answer engines too, and this is the only way to know
// whether they actually arrive.
const NAMED_BOTS = [
  [/googlebot|google-inspectiontool|googleother/i, 'googlebot'],
  [/bingbot|bingpreview|adidxbot/i, 'bingbot'],
  [/baiduspider/i, 'baiduspider'],
  [/yandex(bot|images)/i, 'yandexbot'],
  [/applebot/i, 'applebot'],
  [/duckduckbot/i, 'duckduckbot'],
  [/gptbot|openai/i, 'gptbot'],
  [/claudebot|claude-web|anthropic/i, 'claudebot'],
  [/perplexitybot|perplexity/i, 'perplexitybot'],
  [/ccbot|commoncrawl/i, 'ccbot'],
  [/bytespider/i, 'bytespider'],
  [/petalbot|huaweicloud/i, 'petalbot'],
  [/semrushbot|ahrefsbot|mj12bot|dotbot|dataforseo|screaming frog/i, 'seo-tools'],
  [/amazonbot/i, 'amazonbot'],
  [/facebookexternalhit|twitterbot|linkedinbot|telegrambot|whatsapp|slackbot/i, 'social-preview'],
  [/curl\/|wget\/|python-requests|python-urllib|go-http-client|okhttp|axios\/|node-fetch|undici|postman/i, 'script'],
  [/headlesschrome|puppeteer|playwright|lighthouse|chrome-lighthouse/i, 'headless-browser'],
  [/bot\b|crawler|spider|slurp|crawl/i, 'other-bot'],
];

function classifyBot(ua) {
  if (!ua) return 'no-ua';
  for (const [re, name] of NAMED_BOTS) if (re.test(ua)) return name;
  return '';
}

// A URL a crawler would consider a page (not an asset request).
function looksLikePage(path) {
  return !path.includes('.');
}

// ---- analytics -------------------------------------------------------------
const DAY_OFFSET_SECONDS = 8 * 60 * 60; // reports are in the owner's UTC+8 day

function dayOf(ts) {
  return new Date((ts + DAY_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);
}

function clip(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

function intIn(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function cleanPath(value) {
  let path = clip(value, 120);
  if (!path.startsWith('/')) path = '/' + path;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path || '/';
}

function validVid(value) {
  const vid = typeof value === 'string' ? value : '';
  return /^[a-z0-9]{6,24}$/.test(vid) ? vid : '';
}

const DEVICES = new Set(['desktop', 'tablet', 'mobile']);

async function handleBeacon(request, env, ctx) {
  if (request.method !== 'POST') return noContent();

  // Same-origin only. sendBeacon from the site sends `Origin`; a curl drive-by
  // usually does not, so a missing origin is accepted but a foreign one is not.
  const origin = request.headers.get('origin');
  if (origin) {
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      return noContent();
    }
    if (originHost && originHost !== new URL(request.url).host) return noContent();
  }

  let body;
  try {
    const text = await request.text();
    if (text.length > 4096) return noContent();
    body = JSON.parse(text);
  } catch {
    return noContent();
  }
  if (!body || typeof body !== 'object') return noContent();
  if (!env.DB) return noContent();

  const ua = request.headers.get('user-agent') || '';
  if (classifyBot(ua)) return noContent(); // do not let crawlers pollute human data

  const now = Math.floor(Date.now() / 1000);
  const day = dayOf(now);
  const country = clip((request.cf && request.cf.country) || '', 4);
  const base = body.b && typeof body.b === 'object' ? body.b : {};
  const vid = validVid(base.vid);
  if (!vid) return noContent();

  const path = cleanPath(base.p);
  const device = DEVICES.has(base.d) ? base.d : '';
  const kind = body.t;

  const write = (async () => {
    try {
      if (kind === 'p') {
        await env.DB.prepare(
          `INSERT INTO visits (day, ts, vid, path, ref, country, lang, device, client, new_visitor, vw, ua)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            day,
            now,
            vid,
            path,
            clip(base.r, 60),
            country,
            clip(base.l, 12),
            device,
            'browser',
            base.n ? 1 : 0,
            intIn(base.w, 0, 8000),
            uaFamily(ua) // coarse family label, never the raw UA string
          )
          .run();
      } else if (kind === 'v') {
        const v = body.v && typeof body.v === 'object' ? body.v : {};
        await env.DB.prepare(
          `INSERT INTO vitals (day, ts, vid, path, device, country, lcp, inp, cls, ttfb, fcp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            day,
            now,
            vid,
            path,
            device,
            country,
            intIn(v.lcp, 0, 120000),
            intIn(v.inp, 0, 120000),
            intIn(v.cls, 0, 100000),
            intIn(v.ttfb, 0, 120000),
            intIn(v.fcp, 0, 120000)
          )
          .run();
      } else if (kind === 'e') {
        const name = clip(body.n, 40);
        if (!name) return;
        await env.DB.prepare(
          `INSERT INTO events (day, ts, vid, name, path, meta, country, device)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(day, now, vid, name, path, clip(body.m, 160), country, device)
          .run();
      }
    } catch {
      // Analytics must never take the site down; a failed insert is dropped.
    }
  })();

  ctx.waitUntil(write);
  return noContent();
}

// The stored label is a coarse browser family, not the raw UA string.
function uaFamily(ua) {
  if (!ua) return '';
  if (/edg\//i.test(ua)) return 'edge';
  if (/opr\/|opera/i.test(ua)) return 'opera';
  if (/firefox\//i.test(ua)) return 'firefox';
  if (/chrome\/|crios\//i.test(ua)) return 'chrome';
  if (/safari\//i.test(ua)) return 'safari';
  if (/micromessenger|wechat/i.test(ua)) return 'wechat';
  return 'other';
}

async function logBotHit(env, request, path, status) {
  if (!env.DB || !looksLikePage(path)) return;
  const bot = classifyBot(request.headers.get('user-agent') || '');
  if (!bot) return;
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare('INSERT INTO bot_hits (day, ts, bot, path, status) VALUES (?, ?, ?, ?, ?)')
      .bind(dayOf(now), now, bot, cleanPath(path), Number(status) || 0)
      .run();
  } catch {
    /* dropped, see above */
  }
}

// ---- asset versioning ------------------------------------------------------
// scripts/build-versions.mjs hashes the assets that are fetched by fixed path.
// Every HTML response gets `?v=<hash>` appended to those URLs, and a request
// whose `?v=` still matches the manifest may be cached for a year. A deploy
// changes the hash, the HTML points at a new URL, and nothing has to be purged.
// If the manifest is absent (self-hosted mirror, old deploy) HTML is served
// unchanged and everything falls back to the short-TTL policy.
let versionsPromise = null;

function loadVersions(env, request) {
  if (!versionsPromise) {
    versionsPromise = (async () => {
      try {
        const url = new URL('/js/versions.json', request.url);
        const res = await env.ASSETS.fetch(new Request(url.toString()));
        return res.ok ? await res.json() : {};
      } catch {
        return {};
      }
    })();
  }
  return versionsPromise;
}

// Only URLs that appear as a quoted literal in our own HTML: script imports,
// `new Worker(...)`, fetch('...'), <link href> and <img src>. Absolute URLs and
// prose are left alone.
const ASSET_URL_RE = /(["'])(\/(?:js\/[A-Za-z0-9_.-]+\.js|luts\.bin(?:\.gz)?|photos\/[A-Za-z0-9_./-]+\.(?:webp|jpg|jpeg|png)))\1/g;

function stampAssetUrls(html, versions) {
  return html.replace(ASSET_URL_RE, (match, quote, path) => {
    const version = versions[path];
    return version ? `${quote}${path}?v=${version}${quote}` : match;
  });
}

// ---- cache policy ----------------------------------------------------------
// Fonts, the decoder binaries and the marketing photos are effectively app
// version-independent: a stale copy is invisible. If the RAW decoder is ever
// upgraded, move it to a new /vendor/flashraw-<version>/ directory instead of
// reusing this path, otherwise browsers keep the old binary for a week.
const LONG_LIVED = /^\/(fonts|vendor|photos)\//;

function cacheControlFor(path, search, versions) {
  // A content-addressed URL can never go stale.
  if (versions) {
    const version = new URLSearchParams(search).get('v');
    if (version && versions[path] === version) return 'public, max-age=31536000, immutable';
  }
  if (LONG_LIVED.test(path) || path === '/og.png' || path === '/favicon.svg') {
    return 'public, max-age=604800, stale-while-revalidate=86400';
  }
  // The downloadable LUT pack changes only when the looks change, and it is
  // 15 MB: a five-minute TTL would make repeat downloaders re-fetch it. One day
  // plus a week of stale-while-revalidate keeps it cheap without pinning an old
  // pack for long.
  if (path.startsWith('/download/')) {
    return 'public, max-age=86400, stale-while-revalidate=604800';
  }
  // HTML is handled separately; app JS, the LUT pack and looks.json change
  // together on deploy, so they stay on a short TTL with revalidation.
  return 'public, max-age=300, must-revalidate';
}

async function route(request, env, ctx, url, path, versions) {
    if (path === '/api/geo') {
      const country = (request.cf && request.cf.country) || 'US';
      return new Response(JSON.stringify({ country }), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    // One canonical form per page: /index.html and /foo.html both redirect to
    // the clean URL a crawler should index. Google Search Console verification
    // files are the exception: the verifier fetches the exact `.html` URL and a
    // 301 there can fail ownership. Serve them byte-for-byte instead.
    if (/^\/google[0-9a-f]{16}\.html$/.test(path)) {
      return withHeaders(await env.ASSETS.fetch(request), { 'cache-control': 'no-store' });
    }
    if (path === '/index.html') return REDIRECT(`/${url.search}`);
    if (path.endsWith('.html')) {
      const clean = path.slice(0, -5) || '/';
      return REDIRECT(`${clean}${url.search}`);
    }

    let response = path === '/' ? await asset(env, request, '/index.html') : await env.ASSETS.fetch(request);

    // html_handling is "none": the mapping from a clean URL to the file on disk
    // is explicit here, both for a trailing-slash directory index and for a bare
    // page path.
    if (response.status === 404 && path.endsWith('/')) {
      response = await asset(env, request, `${path}index.html`);
    }
    if (response.status === 404 && !path.includes('.') && !path.endsWith('/')) {
      const html = await asset(env, request, `${path}.html`);
      if (html.status === 200) response = html;
    }
    if (response.status === 404 && !path.endsWith('/')) {
      const index = await asset(env, request, `${path}/index.html`);
      if (index.status === 200) return REDIRECT(`${path}/${url.search}`);
    }

    // The assets layer redirects a directory to its trailing-slash form with a
    // temporary 307; make that permanent so the two URLs do not compete.
    if ((response.status === 307 || response.status === 308) && !path.includes('.')) {
      const location = response.headers.get('location');
      if (location) return REDIRECT(location);
    }

    if (response.status === 404 && !path.includes('.')) return notFound();

    // Generated HTML is rebuilt on every deploy; a short edge TTL keeps a deploy
    // from being invisible for hours without forcing a revalidation per request.
    if ((response.headers.get('content-type') || '').includes('text/html')) {
      const body = await response.text();
      const stamped = versions && Object.keys(versions).length ? stampAssetUrls(body, versions) : body;
      return new Response(stamped, {
        status: response.status,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=300, must-revalidate',
        },
      });
    }
    if (response.status === 200) {
      const headers = { 'cache-control': cacheControlFor(path, url.search, versions) };
      // .cube files are plain text: served as octet-stream Cloudflare will not
      // compress them (862 KB raw on a throttled link). Declaring text/plain lets
      // the edge gzip it, and the disposition keeps the browser downloading the
      // file instead of rendering the table in a tab.
      if (/^\/download\/cubes\/[a-z0-9-]+\.cube$/.test(path)) {
        headers['content-type'] = 'text/plain; charset=utf-8';
        headers['content-disposition'] = `attachment; filename="${path.split('/').pop()}"`;
      }
      return withHeaders(response, headers);
    }
    return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/beacon') return handleBeacon(request, env, ctx);

    // Page-like requests need the manifest to stamp asset URLs; versioned asset
    // requests need it to decide whether their cache entry is immutable.
    const pageLike = path === '/' || path.endsWith('/') || path.endsWith('.html') || !path.includes('.');
    const versions = pageLike || url.searchParams.has('v') ? await loadVersions(env, request) : null;

    let response;
    try {
      response = await route(request, env, ctx, url, path, versions);
    } catch (err) {
      // A thrown handler must not take the page down, and the crawler log should
      // still record that this path failed.
      console.error('route failed', err && err.message);
      response = notFound();
    }

    // Crawler hits are logged with the status actually returned: a crawler
    // walking into a 404 is exactly the signal the daily report needs.
    if (request.method === 'GET') ctx.waitUntil(logBotHit(env, request, path, response.status));
    return response;
  },
};
