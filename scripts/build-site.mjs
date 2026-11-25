/**
 * Build the crawlable part of the site.
 *
 * The app at `/` is a canvas with almost no text, so everything a search engine
 * or an answer engine can read is generated here from `scripts/site/pages/*.mjs`:
 * static HTML in both languages, `sitemap.xml`, `robots.txt`, `llms.txt`,
 * `llms-full.txt`, the 404 page and a machine-readable look catalogue.
 *
 * Run `node scripts/build-site.mjs` to write, or `--check` to validate the page
 * modules without touching `public/` (what the content work runs while it is
 * still being written).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage, pagePath, absolute, esc, SITE, stripTags } from './site.mjs';
import { LOOKS, FILTERS } from '../public/js/looks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const PAGES_DIR = path.join(ROOT, 'scripts', 'site', 'pages');
const CHECK = process.argv.includes('--check');
const today = new Date().toISOString().slice(0, 10);

async function loadPages() {
  const files = (await fs.readdir(PAGES_DIR)).filter((f) => f.endsWith('.mjs')).sort();
  const pages = [];
  for (const file of files) {
    const mod = await import(path.join(PAGES_DIR, file));
    const page = mod.default;
    if (!page) throw new Error(`${file}: no default export`);
    pages.push({ ...page, source: file });
  }
  return pages;
}

const HUBS = {
  guides: { zh: '指南', en: 'Guides' },
  alternatives: { zh: '工具对比', en: 'Comparisons' },
  raw: { zh: '格式', en: 'Formats' },
};

const TRAIL = {
  zh: { home: '首页', hub: (key) => HUBS[key]?.zh || '指南' },
  en: { home: 'Home', hub: (key) => HUBS[key]?.en || 'Guides' },
};

function trailFor(page, lang) {
  const t = TRAIL[lang];
  const crumbs = [{ name: t.home, path: '/' }];
  if (page.hub) crumbs.push({ name: t.hub(page.hub), path: pagePath(lang, page.hub) });
  const copy = page[lang];
  // Breadcrumb last entry has no link in the visible markup; the JSON-LD item
  // still points at the page itself.
  crumbs.push({ name: copy.h1 || copy.title, path: pagePath(lang, page.slug) });
  return crumbs;
}

function prevNextFor(page, siblings, lang) {
  if (!page.hub) return '';
  const list = siblings.filter((s) => s.hub === page.hub);
  const index = list.findIndex((s) => s.slug === page.slug);
  const prev = list[index - 1];
  const next = list[index + 1];
  if (!prev && !next) return '';
  const link = (target, label) =>
    `<a class="btn ghost" href="${pagePath(lang, target.slug)}">${label}</a>`;
  const prevLabel = lang === 'zh' ? '← 上一篇' : '← Previous';
  const nextLabel = lang === 'zh' ? '下一篇 →' : 'Next →';
  return `<nav class="crumbs" style="display:flex;gap:12px;margin-top:44px" aria-label="${
    lang === 'zh' ? '上下篇' : 'Previous and next'
  }">${prev ? link(prev, prevLabel) : ''}${next ? link(next, nextLabel) : ''}</nav>`;
}

async function renderAll(pages) {
  const out = new Map();
  const hubs = pages.filter((p) => p.kind === 'hub');
  for (const page of pages) {
    const children = page.kind === 'hub' ? pages.filter((p) => p.hub === page.slug) : null;
    for (const lang of ['zh', 'en']) {
      const copy = page[lang];
      if (!copy) throw new Error(`${page.source}: missing ${lang} copy`);
      const html = renderPage(page, lang, {
        trail: trailFor(page, lang),
        children,
        prevNext: prevNextFor(page, pages, lang),
      });
      out.set(pagePath(lang, page.slug), html);
    }
  }
  return { out, hubs };
}

async function writeFile(rel, content) {
  const target = path.join(PUBLIC, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

function sitemapXml(pages) {
  const staticPages = [
    { path: '/', priority: '1.0', changefreq: 'weekly' },
  ];
  const entries = [];
  for (const page of pages) {
    for (const lang of ['zh', 'en']) {
      const loc = absolute(pagePath(lang, page.slug));
      const alternates = ['zh', 'en']
        .map((l) => `    <xhtml:link rel="alternate" hreflang="${l === 'zh' ? 'zh-CN' : 'en'}" href="${absolute(pagePath(l, page.slug))}" />`)
        .join('\n');
      entries.push(`  <url>
    <loc>${loc}</loc>
    <lastmod>${page.updated || today}</lastmod>
    <changefreq>${page.changefreq || 'monthly'}</changefreq>
    <priority>${page.priority ?? 0.6}</priority>
${alternates}
    <xhtml:link rel="alternate" hreflang="x-default" href="${absolute(pagePath('en', page.slug))}" />
  </url>`);
    }
  }
  for (const item of staticPages) {
    entries.push(`  <url>
    <loc>${absolute(item.path)}</loc>${item.lastmod ? `\n    <lastmod>${item.lastmod}</lastmod>` : ''}
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;
}

const AI_CRAWLERS = [
  'OAI-SearchBot', 'ChatGPT-User', 'GPTBot',
  'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'anthropic-ai',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot', 'Applebot-Extended',
  'Bingbot', 'DuckAssistBot', 'MistralAI-User', 'meta-externalagent',
  'CCBot', 'Amazonbot',
];

function robotsTxt() {
  return `# LUT ARCHIVE — ${SITE.origin}
# The editor runs entirely in the browser; there is no private content to hide.
# Everything here is public: the app, the look catalogue and the guides.

User-agent: *
Allow: /
Disallow: /api/geo

# Answer engines and AI crawlers: the guides exist so they can be cited.
${AI_CRAWLERS.map((bot) => `User-agent: ${bot}\nAllow: /`).join('\n\n')}

# Machine-readable summary for agents
# ${SITE.origin}/llms.txt
# ${SITE.origin}/llms-full.txt

Sitemap: ${SITE.origin}/sitemap.xml
`;
}

function llmsTxt(pages) {
  const guides = pages.filter((p) => p.hub === 'guides');
  const formats = pages.filter((p) => p.hub === 'raw');
  const lines = [];
  lines.push(`# ${SITE.name}`);
  lines.push('');
  lines.push(
    '> A darkroom-style RAW editor that runs entirely in the browser. Open a RAW or JPEG, develop it with a Lightroom-style panel (white balance, exposure, tone, presence, histogram, auto tone), stack one of 64 generated LUT looks, import .cube files, merge two looks into one, and export a full-resolution JPEG. Photos are decoded and rendered on the user\'s device; nothing is uploaded and there is no account.'
  );
  lines.push('');
  lines.push('## The app');
  lines.push('');
  lines.push(`- [Open the editor](${SITE.origin}/): WebGL2, WebAssembly, no signup, no upload.`);
  lines.push(`- [Look catalogue](${SITE.origin}/looks): all 64 built-in looks with names, categories and intent.`);
  lines.push(`- [Machine-readable looks](${SITE.origin}/looks.json): JSON array of every look (id, zh/en name, category).`);
  lines.push(`- [Official LUT sources](${SITE.origin}/get-luts): where the camera makers publish .cube files, and how to import them.`);
  lines.push(`- [官方 LUT 下载入口](${SITE.origin}/get-luts): 松下、富士、佳能、尼康、索尼发布 .cube 的官方页面与 LOG 输入说明。`);
  lines.push('');
  lines.push('## What it can do');
  lines.push('');
  for (const fact of FACTS) lines.push(`- ${fact}`);
  lines.push('');
  lines.push('## Guides');
  lines.push('');
  for (const guide of guides) {
    const zh = guide.zh;
    const en = guide.en;
    lines.push(`- [${en.h1 || en.title}](${SITE.origin}${pagePath('en', guide.slug)}): ${en.description}`);
    lines.push(`- [${zh.h1 || zh.title}](${SITE.origin}${pagePath('zh', guide.slug)}): ${zh.description}`);
  }
  lines.push('');
  lines.push('## Formats');
  lines.push('');
  for (const format of formats) {
    lines.push(`- [${format.en.h1 || format.en.title}](${SITE.origin}${pagePath('en', format.slug)}): ${format.en.description}`);
    lines.push(`- [${format.zh.h1 || format.zh.title}](${SITE.origin}${pagePath('zh', format.slug)}): ${format.zh.description}`);
  }
  lines.push('');
  lines.push('## Comparisons');
  lines.push('');
  for (const page of pages.filter((p) => p.hub === 'alternatives')) {
    lines.push(`- [${page.en.h1 || page.en.title}](${SITE.origin}${pagePath('en', page.slug)}): ${page.en.description}`);
  }
  lines.push('');
  lines.push('## About');
  lines.push('');
  lines.push(`- [About and privacy](${SITE.origin}/en/about): architecture, supported formats, what is stored, and the limits.`);
  lines.push(`- [FAQ](${SITE.origin}/en/faq): formats, LUT sizes, log input, export, privacy.`);
  lines.push(`- Source (MIT): ${SITE.repo}`);
  lines.push(`- Full text: ${SITE.origin}/llms-full.txt`);
  lines.push('');
  return lines.join('\n');
}

const FACTS = [
  'RAW decoding runs in a Web Worker through flashraw (vendored WebAssembly): NEF/HE/HE*, CR2, CR3, ARW, DNG, RAF, ORF, RW2, PEF, SRW, 3FR, KDC, MOS, IIQ, X3F. If a RAW cannot be unpacked, the camera JPEG embedded in it is used instead.',
  'The decoded frame is 16-bit with four stops of scene headroom kept above sensor white, re-encoded as scene-linear half floats for the GPU. Tone mapping is darktable\'s sigmoid (jandren PR #12642) with per-channel hue handling, checked by an isolated darktable 5.6.2 CLI render of a synthetic 128×512 linear EV ramp; the observed maximum linear-light error is 0.0014772 (test limit 0.0016).',
  'RAW opens with a camera look by default: the app reads the camera JPEG embedded in the file, matches its luminance percentiles against the neutral render, and applies one monotone display curve, so the default view is close to the camera/phone-gallery rendition. A toggle in the Develop header returns to the neutral scene-referred development.',
  'On linear RAW, Highlights and Shadows take their visible response from a blurred luminance guide, with a worker-side fast Local Laplacian remap of a downscaled scene-EV map added as a weighted (45 %) local refinement before sigmoid. The LLF term alone under-shifts small bright regions, so it is a refinement rather than the whole response. The slider mapping is an engineering design, not an Adobe/Lightroom parameter claim.',
  '64 LUT looks ship in a single delta-coded 33×33×33 pack (1.34 MB gzipped, decoded lazily per look). The same looks are exported as standard .cube files in the repository.',
  'Two looks can be stacked with independent strength, then baked into a single 33³ LUT and downloaded as .cube.',
  'Any .cube can be imported: 3D LUTs (LUT_3D_SIZE 2–128) and 1D LUTs. Files are parsed locally and kept in IndexedDB under "My LUTs".',
  'Input profiles sRGB / F-Log / F-Log2 / V-Log re-encode the image before a log LUT runs, so vendor LUTs land close to what they were built for.',
  'Export is JPEG at 50/75/100 % of the source long edge, rendered from the 16-bit linear frame in tiles so full resolution works past the GPU texture limit.',
  'No account, no upload, no server-side rendering, no tracking cookies. The only network requests are the app assets and the optional /api/geo country lookup used to pick a UI language.',
  'Preview is capped at 4096 px on the long edge; the full-resolution frame stays in memory for export. A 26 MP NEF decodes to a 5568×3712 linear frame in about 1.2 s on a recent laptop.',
];

function llmsFull(pages) {
  const guides = pages.filter((p) => p.hub === 'guides');
  const alternatives = pages.filter((p) => p.hub === 'alternatives');
  const formats = pages.filter((p) => p.hub === 'raw');
  const section = (title, body) => `${title}\n\n${body}\n`;
  const parts = [];
  parts.push(`# ${SITE.name} — full text`);
  parts.push(
    `${SITE.name} (${SITE.origin}) is a photo editor that runs entirely in the browser. It reads RAW files and JPEG/PNG/WebP/TIFF on the user's device, develops them with a Lightroom-style panel, applies generated LUT looks, and exports full-resolution JPEGs. There is no account system, no upload step and no server-side rendering. It is MIT-licensed and the source is at ${SITE.repo}.`
  );
  parts.push(section('What it does', FACTS.map((f) => `- ${f}`).join('\n')));
  parts.push(
    section(
      'How RAW processing works',
      `The RAW file is decoded in a Web Worker by flashraw (WebAssembly), including AHD demosaicing, camera white balance and the camera colour matrix. The result is decoded at 16 bit with an extended white point — four stops of scene headroom above sensor white are preserved — and re-encoded as scene-linear half floats for the GPU. The display transform is darktable's sigmoid, a generalized log-logistic curve defined on 0…∞ that is monotone everywhere and converges asymptotically on the white target instead of clipping. It is anchored so that scene-linear 0.1845 maps to display-linear 0.1845 and uses per-channel curves with hue preservation. Auto exposure works in the scene domain: the 95th percentile is placed near sensor white and the midtones are kept below about 0.39 of white.`
    )
  );
  parts.push(
    section(
      'LUTs and looks',
      `64 looks are generated from original recipes in scripts/looks.mjs (cinema, film, black and white, warm/cool, vintage, airy, plus Leica, Hasselblad, Kodak, Fujifilm, Ricoh and Panasonic-inspired grades). They ship as one delta-coded 33³ binary and as standard .cube files. Two looks can be stacked and merged into one 33³ LUT, exported as .cube. Imported .cube files (1D or 3D, size 2–128) are parsed locally and stored in IndexedDB. The look catalogue with names and categories is listed at ${SITE.origin}/looks and as JSON at ${SITE.origin}/looks.json.`
    )
  );
  parts.push(section('Limits', `- Preview is capped at 4096 px on the long edge; export uses the full-resolution frame in tiles.
- WebGL2 is required.
- Imported LUTs and preferences live in the browser's IndexedDB/localStorage; there is no cloud sync.
- Vendored LUTs are original recipes, not vendor files; they approximate the named film stocks and camera profiles rather than reproducing their official LUT data.`));
  parts.push(section('Guides', guides.map((g) => `- ${g.en.h1 || g.en.title}: ${SITE.origin}${pagePath('en', g.slug)}`).join('\n')));
  parts.push(section('RAW formats', formats.map((f) => `- ${f.en.h1 || f.en.title}: ${SITE.origin}${pagePath('en', f.slug)}`).join('\n')));
  parts.push(section('Comparisons', alternatives.map((g) => `- ${g.en.h1 || g.en.title}: ${SITE.origin}${pagePath('en', g.slug)}`).join('\n')));
  parts.push(`## Contact\n\n${SITE.repo}`);
  return parts.join('\n\n');
}

function looksJson() {
  return JSON.stringify(
    {
      site: SITE.origin,
      app: SITE.origin + '/',
      count: LOOKS.length,
      categories: FILTERS.map(([id, zh]) => ({
        id,
        zh,
        en: LOOKS.find((look) => look.cat === id)?.catLabelEn || id,
      })),
      looks: LOOKS.map((look) => ({
        id: look.id,
        name: look.name,
        nameEn: look.en,
        category: look.cat,
        categoryZh: look.catLabel,
        tag: look.tag,
        featured: !!look.featured,
        cube: `${SITE.repo}/blob/main/luts-src/${look.file}`,
      })),
    },
    null,
    2
  );
}

function validate(pages) {
  const problems = [];
  const seen = new Set();
  const zh = /[\u4e00-\u9fff]/;
  const check = (page, lang) => {
    const copy = page[lang];
    const where = `${page.source}:${lang}`;
    if (!copy) return problems.push(`${where} missing`);
    if (!copy.title) problems.push(`${where} missing title`);
    else if (copy.title.length > (lang === 'zh' ? 40 : 62)) problems.push(`${where} title too long (${copy.title.length})`);
    if (!copy.h1) problems.push(`${where} missing h1`);
    if (page.kind === 'hub') return;
    if (!copy.description) problems.push(`${where} missing description`);
    else {
      const len = copy.description.length;
      const min = lang === 'zh' ? 50 : 110;
      const max = lang === 'zh' ? 85 : 165;
      if (len < min || len > max) problems.push(`${where} description ${len} chars (want ${min}-${max})`);
    }
    if (!copy.body || stripTags(copy.body).length < (lang === 'zh' ? 350 : 700)) problems.push(`${where} body too thin (${stripTags(copy.body || '').length} chars of text)`);
    if (lang === 'zh' && !zh.test(copy.body || '')) problems.push(`${where} body is not Chinese`);
    if (lang === 'en' && zh.test(stripTags(copy.body || ''))) problems.push(`${where} body contains Chinese characters`);
    if (copy.faq) {
      for (const item of copy.faq) {
        if (!item[0] || !item[1]) problems.push(`${where} faq entry incomplete`);
      }
    }
    // Internal links must point at a page that will exist in that language.
    // Two things are not pages and must not be validated as such: static files
    // with an extension (a zip download, an image) and deep links into the app
    // that carry a query string (§/?look=..., §/?mode=merge) — the path part of
    // a query-string link is still checked, just without the query. This was a
    // false positive that blocked /download from shipping.
    for (const m of (copy.body || '').matchAll(/href="(\/[^"#]*)/g)) {
      const href = m[1];
      if (href.startsWith('/photos/') || href.startsWith('/luts-src/') || href.endsWith('.xml') || href.endsWith('.txt') || href.endsWith('.json')) continue;
      const pathname = href.split('?')[0] || '/';
      if (/\.[a-z0-9]{2,5}$/i.test(pathname)) continue; // static asset, not a page
      const bare = pathname.replace(/\/$/, '') || '/';
      if (bare === '/') continue;
      const isEn = bare === '/en' || bare.startsWith('/en/');
      const target = isEn ? bare.slice(3) || '/' : bare;
      const key = `${isEn ? 'en' : 'zh'}:${target}`;
      if (!seen.has(key)) problems.push(`${where} links to unknown internal page ${href}`);
    }
  };
  for (const page of pages) {
    if (!page.slug) problems.push(`${page.source}: missing slug`);
    if (seen.has(`zh:/${page.slug}`)) problems.push(`${page.source}: duplicate slug ${page.slug}`);
    seen.add(`zh:/${page.slug}`);
    seen.add(`en:/${page.slug}`);
    if (!page.updated || !/^\d{4}-\d{2}-\d{2}$/.test(page.updated)) problems.push(`${page.source}: bad updated date`);
  }
  // Internal-link validation needs the complete slug set first: pages are free
  // to reference each other in any order.
  for (const page of pages) {
    check(page, 'zh');
    check(page, 'en');
  }
  return problems;
}

const pages = await loadPages();
const problems = validate(pages);

if (CHECK) {
  if (problems.length) {
    console.log(`✗ ${problems.length} issue(s)\n`);
    for (const problem of problems) console.log(' -', problem);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${pages.length} page modules valid`);
  }
} else {
  if (problems.length) {
    console.log(`✗ refusing to write, ${problems.length} issue(s):\n`);
    for (const problem of problems) console.log(' -', problem);
    process.exit(1);
  }
  const { out } = await renderAll(pages);
  for (const [urlPath, html] of out) {
    const rel = urlPath.endsWith('/') ? `${urlPath.slice(1)}index.html` : `${urlPath.slice(1)}.html`;
    await writeFile(rel, html);
  }
  await writeFile('sitemap.xml', sitemapXml(pages));
  await writeFile('robots.txt', robotsTxt());
  await writeFile('llms.txt', llmsTxt(pages));
  await writeFile('llms-full.txt', llmsFull(pages));
  await writeFile('looks.json', looksJson() + '\n');
  const written = out.size + 5;
  console.log(`✓ wrote ${written} files (${out.size} pages, ${pages.length} modules)`);
}
