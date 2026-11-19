/**
 * Shared shell for every crawlable page on lut.openanthropic.com.
 *
 * The app itself lives at `/` and is a canvas: search engines and answer
 * engines have nothing to read there. These pages are the readable surface —
 * plain static HTML, no client JS required, one shared head so titles,
 * canonicals, hreflang, Open Graph and JSON-LD cannot drift between pages.
 *
 * Copy is bilingual: Chinese canonical at `/path`, English at `/en/path`.
 * Each page module supplies both languages; this module only knows how to
 * render them and how to point them at each other.
 */

export const SITE = {
  origin: 'https://lut.openanthropic.com',
  name: 'LUT ARCHIVE',
  repo: 'https://github.com/shisongsong/lut-studio',
  tagline: {
    zh: '浏览器里的 RAW 暗房',
    en: 'A RAW darkroom that runs in your browser',
  },
};

export const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** JSON-LD must not be able to close its own <script> element. */
export function jsonLdScript(content) {
  const body = JSON.stringify(content, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script type="application/ld+json">\n${body}\n</script>`;
}

/** zh paths live at the root, English mirrors under /en. `slug` is bare. */
export function pagePath(lang, slug) {
  const clean = slug.replace(/^\/+|\/+$/g, '');
  const isHub = clean === 'guides' || clean === 'alternatives';
  const suffix = isHub ? '/' : '';
  return lang === 'zh' ? `/${clean}${suffix}` : `/en/${clean}${suffix}`;
}

export const absolute = (path) => `${SITE.origin}${path}`;

const NAV = {
  zh: [
    ['/guides/', '指南'],
    ['/looks', '64 款 LUT'],
    ['/alternatives/lightroom-web', '对比 Lightroom'],
    ['/faq', '常见问题'],
  ],
  en: [
    ['/en/guides/', 'Guides'],
    ['/en/looks', '64 looks'],
    ['/en/alternatives/lightroom-web', 'vs Lightroom'],
    ['/en/faq', 'FAQ'],
  ],
};

const FOOT = {
  zh: [
    ['/about', '关于与隐私'],
    ['/privacy', '隐私政策'],
    ['/guides/', '全部指南'],
    ['/get-luts', 'LUT 下载来源'],
    ['/llms.txt', 'llms.txt'],
  ],
  en: [
    ['/en/about', 'About & privacy'],
    ['/en/privacy', 'Privacy'],
    ['/en/guides/', 'All guides'],
    ['/en/get-luts', 'LUT sources'],
    ['/llms.txt', 'llms.txt'],
  ],
};

const CSS = `
:root{
  --bg:#0a0a0b; --ink:#f2f1ec; --muted:rgba(242,241,236,.58); --faint:rgba(242,241,236,.34);
  --line:rgba(242,241,236,.14); --accent:#d9c7a3;
  --sans:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC",system-ui,sans-serif;
  --mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,monospace;
}
*{box-sizing:border-box}
html{background:var(--bg);color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased;line-height:1.7}
img{max-width:100%;height:auto;display:block;border:1px solid var(--line)}
a{color:var(--ink);text-decoration:none;border-bottom:1px solid rgba(242,241,236,.28)}
a:hover{border-color:var(--accent);color:var(--accent)}
.wrap{max-width:860px;margin:0 auto;padding:0 24px}
.wide{max-width:1180px}
header.site{position:sticky;top:0;z-index:10;background:rgba(10,10,11,.86);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
header.site .bar{max-width:1180px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 24px}
.brand{display:flex;align-items:center;gap:9px;font-family:var(--mono);font-size:10px;letter-spacing:.18em;border:0;color:var(--ink)}
.brand .dot{width:6px;height:6px;border-radius:50%;background:var(--accent)}
.brand:hover{color:var(--ink)}
nav.site{display:flex;align-items:center;gap:18px;font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
nav.site a{border:0;color:var(--muted)}
nav.site a:hover{color:var(--ink)}
.lang{font-family:var(--mono);font-size:9px;letter-spacing:.1em;border:1px solid var(--line);padding:5px 9px;color:var(--ink)}
.lang:hover{border-color:var(--accent);color:var(--accent)}
main{display:block;padding:64px 0 40px}
.crumbs{font-family:var(--mono);font-size:8.5px;letter-spacing:.12em;color:var(--faint);text-transform:uppercase;margin:0 0 34px}
.crumbs a{border:0;color:var(--faint)}
.crumbs a:hover{color:var(--ink)}
.crumbs span{margin:0 7px}
.kicker{font-family:var(--mono);font-size:9px;letter-spacing:.18em;color:var(--accent);text-transform:uppercase;margin:0 0 14px}
h1{font-size:clamp(30px,4.4vw,48px);font-weight:300;letter-spacing:-.02em;line-height:1.07;margin:0 0 20px;max-width:22ch}
h2{font-size:clamp(20px,2.4vw,26px);font-weight:400;letter-spacing:-.01em;line-height:1.25;margin:52px 0 14px}
h3{font-size:16px;font-weight:500;margin:28px 0 8px}
p{margin:0 0 16px;color:rgba(242,241,236,.82);font-size:16px}
.lede{font-size:18px;line-height:1.65;color:var(--muted);max-width:64ch;margin:0 0 26px}
ul,ol{margin:0 0 18px;padding-left:22px}
li{margin:0 0 8px;color:rgba(242,241,236,.82)}
li strong,p strong{color:var(--ink);font-weight:500}
code{font-family:var(--mono);font-size:.86em;background:rgba(242,241,236,.07);border:1px solid var(--line);padding:1px 5px}
pre{background:rgba(242,241,236,.05);border:1px solid var(--line);padding:16px;overflow-x:auto}
pre code{background:0;border:0;padding:0;font-size:12px;line-height:1.6}
blockquote{margin:26px 0;padding:2px 0 2px 20px;border-left:2px solid var(--accent);color:var(--muted)}
hr{border:0;border-top:1px solid var(--line);margin:44px 0}
table{width:100%;border-collapse:collapse;margin:22px 0;font-size:14px}
th,td{text-align:left;padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-family:var(--mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:400}
td{color:rgba(242,241,236,.82)}
.figure{margin:30px 0}
.figure figcaption{font-family:var(--mono);font-size:9px;letter-spacing:.08em;color:var(--faint);padding-top:9px}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin:26px 0}
.facts div{background:var(--bg);padding:16px}
.facts dt{font-family:var(--mono);font-size:8.5px;letter-spacing:.14em;color:var(--faint);text-transform:uppercase;margin:0 0 6px}
.facts dd{margin:0;font-size:15px;color:var(--ink)}
.cta{margin:56px 0 0;padding:30px;border:1px solid var(--line);background:
  radial-gradient(120% 160% at 0% 0%,rgba(217,199,163,.10),transparent 60%)}
.cta h2{margin:0 0 8px;font-size:20px}
.cta p{color:var(--muted);font-size:14px;margin:0 0 18px}
.btn{display:inline-block;font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;background:var(--accent);color:#141414;border:1px solid var(--accent);padding:11px 18px;transition:.15s}
.btn:hover{background:#e7d7b6;border-color:#e7d7b6;color:#141414}
.btn.ghost{background:0;color:var(--ink);border-color:rgba(242,241,236,.4)}
.btn.ghost:hover{border-color:var(--accent);color:var(--accent);background:0}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin:26px 0 0;padding:0;list-style:none}
.card{border:1px solid var(--line);padding:20px;transition:border-color .15s,background .15s;display:block;border-bottom:1px solid var(--line)}
a.card:hover{border-color:rgba(217,199,163,.55);background:rgba(242,241,236,.03)}
.card h3{margin:0 0 8px;font-size:17px;color:var(--ink)}
.card p{margin:0;font-size:13px;color:var(--muted);line-height:1.6}
.card .tag{display:block;font-family:var(--mono);font-size:8px;letter-spacing:.16em;color:var(--accent);text-transform:uppercase;margin:0 0 10px}
footer.site{border-top:1px solid var(--line);margin-top:72px;padding:30px 0 60px}
footer.site .bar{max-width:1180px;margin:0 auto;padding:0 24px;display:flex;flex-wrap:wrap;gap:14px 22px;align-items:center;justify-content:space-between;font-family:var(--mono);font-size:9px;letter-spacing:.08em;color:var(--faint)}
footer.site a{border:0;color:var(--faint)}
footer.site a:hover{color:var(--ink)}
footer.site .links{display:flex;flex-wrap:wrap;gap:16px}
.lookgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin:30px 0;padding:0;list-style:none}
.look{border:1px solid var(--line);padding:14px 16px}
.look b{display:block;font-weight:400;font-size:14px;color:var(--ink)}
.look span{display:block;font-family:var(--mono);font-size:8.5px;letter-spacing:.1em;color:var(--faint);margin-top:5px;text-transform:uppercase}
.toc{border:1px solid var(--line);padding:18px 22px;margin:28px 0}
.toc p{margin:0 0 10px;font-family:var(--mono);font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.toc ol{margin:0;padding-left:18px}
.toc li{margin:0 0 6px;font-size:14px}
.faq{margin:26px 0 0}
.faq details{border-bottom:1px solid var(--line);padding:18px 0}
.faq summary{cursor:pointer;font-size:16px;color:var(--ink);list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq summary::before{content:"+";font-family:var(--mono);color:var(--accent);margin-right:10px}
.faq details[open] summary::before{content:"−"}
.faq .a{padding:12px 0 2px 22px;font-size:15px;color:rgba(242,241,236,.78)}
.faq .a p{margin:0 0 10px}
@media(max-width:720px){
  nav.site{display:none}
  main{padding:40px 0 24px}
  .wrap,.wide{padding:0 18px}
  .facts{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}
}
`;

function navHtml(lang, altHref) {
  const links = NAV[lang].map(([href, label]) => `<a href="${href}">${label}</a>`).join('');
  const langLabel = lang === 'zh' ? 'EN' : '中文';
  return `<header class="site"><div class="bar">
  <a class="brand" href="/"><span class="dot"></span>${SITE.name}</a>
  <nav class="site" aria-label="Primary">${links}<a href="${SITE.repo}" rel="noopener">GitHub</a></nav>
  <a class="lang" href="${altHref}" hreflang="${lang === 'zh' ? 'en' : 'zh-CN'}">${langLabel}</a>
</div></header>`;
}

function footerHtml(lang) {
  const links = FOOT[lang]
    .map(([href, label]) => `<a href="${href}">${label}</a>`)
    .join('');
  return `<footer class="site"><div class="bar">
  <span>© ${new Date().getFullYear()} ${SITE.name} · MIT</span>
  <div class="links">${links}<a href="${SITE.repo}" rel="noopener">GitHub</a></div>
</div></footer>`;
}

export function breadcrumbLd(lang, trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absolute(item.path),
    })),
  };
}

export const orgLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE.name,
  url: SITE.origin,
  logo: absolute('/favicon.svg'),
  sameAs: [SITE.repo],
});

export const webAppLd = (lang) => ({
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: SITE.name,
  url: absolute(lang === 'zh' ? '/' : '/?lang=en'),
  applicationCategory: 'PhotoApplication',
  applicationSubCategory: lang === 'zh' ? 'RAW 显影与 LUT 调色' : 'RAW development and LUT grading',
  operatingSystem: 'Any (WebGL2 browser: Chrome, Edge, Safari, Firefox)',
  browserRequirements: 'Requires WebGL2',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  license: 'https://opensource.org/license/mit',
  inLanguage: ['zh-CN', 'en'],
  description:
    lang === 'zh'
      ? '在浏览器里打开 RAW、按暗房方式显影、套用 64 款 LUT 并导出全分辨率 JPEG。照片不上传，不需要账号。'
      : 'Open RAW files in the browser, develop them with a darkroom panel, stack 64 LUT looks and export full-resolution JPEGs. Photos never leave the device; no account needed.',
  screenshot: absolute('/photos/home-desktop.jpg'),
  featureList:
    lang === 'zh'
      ? ['浏览器内 RAW 解码（NEF/CR2/CR3/ARW/DNG/RAF 等）', '16 位场景线性管线', 'darktable sigmoid 显示变换', '64 款 LUT 与双 LUT 叠加', '.cube 导入与导出', '全分辨率 JPEG 导出', '本地处理，不上传']
      : ['In-browser RAW decoding (NEF/CR2/CR3/ARW/DNG/RAF and more)', '16-bit scene-linear pipeline', 'darktable sigmoid display transform', '64 bundled LUT looks and dual-LUT stacking', '.cube import and export', 'Full-resolution JPEG export', 'Local processing, no upload'],
});

/** FAQPage from a [[question, answerHtml], ...] list. */
export const faqLd = (faq) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map(([q, a]) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: stripTags(a) },
  })),
});

export const articleLd = ({ lang, title, description, path, image, updated, hub }) => ({
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: title,
  description,
  inLanguage: lang === 'zh' ? 'zh-CN' : 'en',
  mainEntityOfPage: absolute(path),
  url: absolute(path),
  image: image ? absolute(image) : undefined,
  datePublished: updated,
  dateModified: updated,
  author: { '@type': 'Organization', name: SITE.name, url: SITE.origin },
  publisher: { '@type': 'Organization', name: SITE.name, url: SITE.origin },
  articleSection: hub,
});

export const howToLd = ({ lang, name, description, steps, image, totalTime }) => ({
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name,
  description,
  image: image ? absolute(image) : undefined,
  totalTime,
  inLanguage: lang === 'zh' ? 'zh-CN' : 'en',
  step: steps.map(([title, text], index) => ({
    '@type': 'HowToStep',
    position: index + 1,
    name: title,
    text,
  })),
});

export const stripTags = (html) =>
  String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Render one page. `page` is the module for a page family: it carries the
 * per-language copy, JSON-LD extras and the relation to its hub. The shell
 * adds head metadata, breadcrumbs, the article header, the CTA and the footer.
 */
export function renderPage(page, lang, { trail, children, prevNext } = {}) {
  const copy = page[lang];
  const path = pagePath(lang, page.slug);
  const isHub = page.kind === 'hub';
  const title = copy.title;
  const description = copy.description;
  const canonical = absolute(path);
  const altPath = pagePath(lang === 'zh' ? 'en' : 'zh', page.slug);
  const altUrl = absolute(altPath);

  const ld = [];
  ld.push(breadcrumbLd(lang, trail));
  if (page.jsonLd) ld.push(...page.jsonLd(lang, path));
  if (copy.faq?.length) ld.push(faqLd(copy.faq));

  const headJsonLd = ld.map(jsonLdScript).join('\n');
  const hreflang = [
    `<link rel="alternate" hreflang="zh-CN" href="${absolute(pagePath('zh', page.slug))}">`,
    `<link rel="alternate" hreflang="en" href="${absolute(pagePath('en', page.slug))}">`,
    `<link rel="alternate" hreflang="x-default" href="${absolute(pagePath('en', page.slug))}">`,
  ].join('\n');

  const metaLine = [
    page.updated ? `<span>${lang === 'zh' ? '更新' : 'Updated'} ${page.updated}</span>` : '',
    page.readMinutes ? `<span>${page.readMinutes} ${lang === 'zh' ? '分钟' : 'min read'}</span>` : '',
  ]
    .filter(Boolean)
    .join('');

  const breadcrumbs = trail
    .slice(0, -1)
    .map((item) => `<a href="${item.path}">${item.name}</a><span>/</span>`)
    .join('') + trail[trail.length - 1].name;

  const header = `<div class="wrap">
  <p class="crumbs">${breadcrumbs}</p>${
    copy.kicker ? `<p class="kicker">${copy.kicker}</p>` : ''
  }
  <h1>${copy.h1 || copy.title}</h1>
  ${copy.lede ? `<p class="lede">${copy.lede}</p>` : ''}
  ${metaLine ? `<p class="crumbs">${metaLine}</p>` : ''}
</div>`;

  const article = `<article class="wrap">
${header}
${copy.body}
${prevNext || ''}
<div class="cta">
  <h2>${lang === 'zh' ? '在浏览器里试一次' : 'Try it in the browser'}</h2>
  <p>${
    lang === 'zh'
      ? '打开 RAW、调色、套 LUT、导出 JPEG —— 全程在本机完成，不上传，也不需要账号。'
      : 'Open a RAW, grade it, stack a look, export a JPEG — all on your machine, with no upload and no account.'
  }</p>
  <a class="btn" href="/">${lang === 'zh' ? '打开编辑器' : 'Open the editor'}</a>
</div>
</article>`;

  const hubChildren = isHub && children?.length
    ? `<ul class="cards">${children
        .map(
          (child) => `<li><a class="card" href="${pagePath(lang, child.slug)}">
  <span class="tag">${child[lang].kicker || (lang === 'zh' ? '指南' : 'Guide')}</span>
  <h3>${child[lang].h1 || child[lang].title}</h3>
  <p>${child[lang].lede || child[lang].description}</p>
</a></li>`
        )
        .join('')}</ul>`
    : '';

  const mainContent = isHub ? `${header}<div class="wrap">${copy.body}${hubChildren}</div>` : article;

  return `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0a0a0b">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${hreflang}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/favicon.svg">
${page.robots ? `<meta name="robots" content="${page.robots}">` : ''}
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${absolute(page.image || '/og.png')}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${lang === 'zh' ? 'zh_CN' : 'en_US'}">
<meta property="og:locale:alternate" content="${lang === 'zh' ? 'en_US' : 'zh_CN'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${absolute(page.image || '/og.png')}">
${headJsonLd}
<style>${CSS}</style>
</head>
<body>
${navHtml(lang, altUrl)}
${mainContent}
${footerHtml(lang)}
</body>
</html>
`;
}
