// Validate what crawlers and answer engines parse: every JSON-LD block and
// every hreflang pair on every URL in the live sitemap.
//
// Presence checks are not enough — a schema block that fails to parse, or an
// hreflang pointing at a 404, is worse than having none at all.
//
// Usage: BASE=https://lut.openanthropic.com node scripts/seo-validate.mjs

const BASE = (process.env.BASE || 'https://lut.openanthropic.com').replace(/\/$/, '');
const CONCURRENCY = 3;

async function get(url, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LutArchiveSeoMonitor/1.0)' },
      });
      clearTimeout(timer);
      return { response, html: await response.text() };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  throw lastError;
}

const REQUIRED_BY_TYPE = {
  WebApplication: ['name', 'url'],
  TechArticle: ['headline', 'datePublished'],
  Article: ['headline', 'datePublished'],
  HowTo: ['name', 'step'],
  FAQPage: ['mainEntity'],
  ItemList: ['itemListElement'],
  BreadcrumbList: ['itemListElement'],
  Organization: ['name', 'url'],
  WebSite: ['name', 'url'],
  Question: ['name', 'acceptedAnswer'],
  Answer: ['text'],
  HowToStep: ['name', 'text'],
};

function parseJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const parsed = [];
  const errors = [];
  for (const [, raw] of blocks) {
    try {
      parsed.push(JSON.parse(raw));
    } catch (error) {
      errors.push(`invalid JSON-LD: ${error.message.slice(0, 80)}`);
    }
  }
  return { parsed, errors, count: blocks.length };
}

const hreflangs = (html) =>
  [...html.matchAll(/<link[^>]+rel=["']alternate["'][^>]*>/gi)]
    .map(([tag]) => ({
      hreflang: /hreflang=["']([^"']+)["']/i.exec(tag)?.[1],
      href: /href=["']([^"']+)["']/i.exec(tag)?.[1],
    }))
    .filter((entry) => entry.hreflang && entry.href);

const canonicalOf = (html) =>
  /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1] || '';

// Single-URL pages have no language twin to pair with: the app at `/` serves
// both languages from one URL, and /get-luts is Chinese-only by design.
const SINGLE_URL_PAGES = new Set(['/', '/get-luts']);

const sitemap = await get(`${BASE}/sitemap.xml`);
const urls = [...sitemap.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim().replace(/^https?:\/\/[^/]+/, BASE));

console.log(`\n=== Structured data & hreflang validation — ${urls.length} URLs ===\n`);

const results = [];
for (let i = 0; i < urls.length; i += CONCURRENCY) {
  const batch = urls.slice(i, i + CONCURRENCY);
  const settled = await Promise.all(
    batch.map(async (url) => {
      try {
        const { response, html } = await get(url);
        return { url, status: response.status, html };
      } catch (error) {
        return { url, status: 0, html: '', error: error.message };
      }
    })
  );
  results.push(...settled);
}

const issues = [];
for (const row of results) {
  const path = row.url.replace(BASE, '') || '/';
  if (!row.status) {
    issues.push({ path, issue: `fetch failed: ${row.error}` });
    continue;
  }
  if (row.status !== 200) issues.push({ path, issue: `status ${row.status}` });

  const { parsed, errors, count } = parseJsonLd(row.html);
  for (const error of errors) issues.push({ path, issue: error });
  if (count === 0) issues.push({ path, issue: 'no JSON-LD' });

  const nodes = [];
  for (const block of parsed) {
    const top = Array.isArray(block) ? block : [block];
    if (!top.some((entry) => entry['@context'])) issues.push({ path, issue: 'JSON-LD missing @context' });
    nodes.push(...top.flatMap((entry) => (Array.isArray(entry['@graph']) ? entry['@graph'] : [entry])));
  }
  for (const node of nodes) {
    const type = Array.isArray(node['@type']) ? node['@type'][0] : node['@type'];
    if (!type) issues.push({ path, issue: 'JSON-LD missing @type' });
    for (const field of REQUIRED_BY_TYPE[type] || []) {
      if (!node[field]) issues.push({ path, issue: `${type} missing ${field}` });
    }
    if ((type === 'TechArticle' || type === 'Article') && node.datePublished && !/^\d{4}-\d{2}-\d{2}/.test(node.datePublished)) {
      issues.push({ path, issue: `${type} datePublished not ISO` });
    }
  }

  const alternates = hreflangs(row.html);
  if (!SINGLE_URL_PAGES.has(path)) {
    if (!alternates.length) issues.push({ path, issue: 'no hreflang alternates' });
    if (!alternates.some((alt) => alt.hreflang === 'x-default')) issues.push({ path, issue: 'no x-default alternate' });
  }
}

// Reciprocal hreflang: every alternate must resolve to a 200 page whose own
// canonical is that URL, and that page must link back.
//
// The sitemap and the pages carry absolute production URLs; when BASE points at
// a local dev server the origin is swapped but the paths still have to match.
const toLocal = (url) => url.replace(/^https?:\/\/[^/]+/, BASE);
const barePath = (url) => url.replace(/^https?:\/\/[^/]+/, '').replace(/#.*$/, '');
const cache = new Map(
  results.filter((row) => row.status === 200).map((row) => [row.url, { status: 200, canonical: canonicalOf(row.html), alternates: hreflangs(row.html) }])
);

async function loadPage(url) {
  if (cache.has(url)) return cache.get(url);
  try {
    const { response, html } = await get(url);
    const entry = { status: response.status, canonical: canonicalOf(html), alternates: hreflangs(html) };
    cache.set(url, entry);
    return entry;
  } catch (error) {
    const entry = { status: 0, error: error.message };
    cache.set(url, entry);
    return entry;
  }
}

for (const row of results) {
  if (row.status !== 200) continue;
  const path = row.url.replace(BASE, '') || '/';
  for (const alt of hreflangs(row.html)) {
    const target = toLocal(alt.href.split('#')[0]);
    const page = await loadPage(target);
    const targetPath = target.replace(BASE, '');
    if (!page.status) issues.push({ path, issue: `${alt.hreflang} alternate unreachable: ${targetPath}` });
    else if (page.status !== 200) issues.push({ path, issue: `${alt.hreflang} alternate ${page.status}: ${targetPath}` });
    else if (page.canonical && barePath(page.canonical) !== barePath(alt.href)) {
      issues.push({ path, issue: `${alt.hreflang} alternate canonical mismatch: ${targetPath}` });
    } else if (!page.alternates.some((back) => barePath(back.href) === barePath(row.url))) {
      issues.push({ path, issue: `${alt.hreflang} alternate does not link back: ${targetPath}` });
    }
  }
}

console.log(`Pages checked: ${results.length}`);
console.log(`Issues: ${issues.length}\n`);
const grouped = new Map();
for (const { issue } of issues) {
  const key = issue.replace(/[0-9a-f]{6,}/gi, 'N').replace(/\d+/g, 'N');
  grouped.set(key, (grouped.get(key) || 0) + 1);
}
for (const [issue, count] of [...grouped.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)} × ${issue}`);
}
if (issues.length) {
  console.log('\nDetail:');
  for (const { path, issue } of issues.slice(0, 40)) console.log(`  ${path} → ${issue}`);
  process.exitCode = 1;
}
console.log('');
