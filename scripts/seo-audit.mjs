// Technical SEO audit for every URL in the live sitemap.
//
// Checks what a crawler actually receives: HTTP status, title and meta
// description lengths (CJK-aware — Chinese SERP truncation is different), a
// self-referencing canonical, robots directives, a single h1, structured data,
// internal links and body size. Prints only defects unless --all is passed.
//
// Usage: BASE=https://lut.openanthropic.com node scripts/seo-audit.mjs [--all]

const BASE = (process.env.BASE || 'https://lut.openanthropic.com').replace(/\/$/, '');
const SHOW_ALL = process.argv.includes('--all');
const CONCURRENCY = 4;

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
      return { response, body: await response.text() };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
  throw lastError;
}

const decode = (value) =>
  String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

function audit(url, response, html) {
  const issues = [];
  const markup = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const text = markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const description = decode(
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"]*)["']/i)?.[1] || ''
  );
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"]*)["']/i)?.[1] || '';
  const robots = html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"]*)["']/i)?.[1] || '';
  const h1Count = (markup.match(/<h1[\s>]/gi) || []).length;
  const jsonLd = (html.match(/application\/ld\+json/g) || []).length;
  const internalLinks = new Set([...markup.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1])).size;

  // The page language decides the SERP limits: Chinese is denser than Latin
  // text, so the title/description bands differ.
  const pageLang = (html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1] || '').toLowerCase();
  const cjk = pageLang.startsWith('zh');
  const titleMax = cjk ? 40 : 62;
  const descMin = cjk ? 50 : 110;
  const descMax = cjk ? 85 : 165;
  const minChars = cjk ? 350 : 700;

  if (response.status !== 200) issues.push(`status ${response.status}`);
  if (!title) issues.push('missing title');
  else if (title.length > titleMax) issues.push(`title ${title.length} chars (>${titleMax} may truncate)`);
  if (!description) issues.push('missing meta description');
  else if (description.length < descMin) issues.push(`description short (${description.length} < ${descMin})`);
  else if (description.length > descMax) issues.push(`description ${description.length} chars (>${descMax} may truncate)`);
  // Compare hosts loosely: the same script audits a local dev server by
  // rewriting the sitemap host, while canonicals always carry the real origin.
  const normalize = (value) => value.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '');
  if (!canonical) issues.push('missing canonical');
  else if (normalize(canonical) !== normalize(url)) issues.push(`canonical points elsewhere: ${canonical}`);
  if (/noindex/i.test(robots)) issues.push('noindex');
  if (h1Count === 0) issues.push('no h1');
  if (h1Count > 1) issues.push(`${h1Count} h1 tags`);
  if (jsonLd === 0) issues.push('no structured data');
  if (internalLinks < 3) issues.push(`only ${internalLinks} internal links`);
  if (text.length < minChars) issues.push(`thin content (${text.length} chars)`);

  return { url, status: response.status, title, description, text: text.length, internalLinks, jsonLd, issues };
}

const sitemap = await get(`${BASE}/sitemap.xml`);
// Rewrite the sitemap's host to BASE so the same script can audit a local
// wrangler dev server before a deploy.
const urls = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim().replace(/^https?:\/\/[^/]+/, BASE));
console.log(`\n=== Technical SEO audit — ${urls.length} URLs from ${BASE}/sitemap.xml ===\n`);

const rows = [];
for (let i = 0; i < urls.length; i += CONCURRENCY) {
  const batch = urls.slice(i, i + CONCURRENCY);
  const settled = await Promise.all(
    batch.map(async (url) => {
      try {
        const { response, body } = await get(url);
        return audit(url, response, body);
      } catch (error) {
        return { url, status: 0, issues: [`fetch failed: ${error.message}`], title: '', description: '', text: 0 };
      }
    })
  );
  rows.push(...settled);
}

for (const row of rows) {
  if (!row.issues.length && !SHOW_ALL) continue;
  const path = row.url.replace(BASE, '') || '/';
  console.log(`${row.issues.length ? '✗' : '✓'} ${path}`);
  if (row.title) console.log(`   title(${row.title.length}): ${row.title}`);
  if (row.description) console.log(`   desc(${row.description.length}): ${row.description.slice(0, 120)}`);
  if (row.text) console.log(`   chars: ${row.text}, internal links: ${row.internalLinks}, json-ld: ${row.jsonLd}`);
  for (const issue of row.issues) console.log(`   → ${issue}`);
  console.log('');
}

const broken = rows.filter((row) => row.issues.length);
console.log(`Summary: ${rows.length - broken.length} clean, ${broken.length} with issues, ${rows.length} total.\n`);
if (broken.length) process.exitCode = 1;
