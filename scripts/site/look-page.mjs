/**
 * Factory for the per-look pages.
 *
 * 64 named looks ship with the editor but only the catalogue lists them, so the
 * individual film-stock names have no URL. Each page built here is the same
 * shape — before/after figure rendered from the real pipeline, what the look is,
 * what it suits, how it differs from its two nearest neighbours, and a one-click
 * .cube download — so the page is unique by its content, not by its template.
 *
 * The preview images are produced by `scripts/build-look-previews.mjs` (headless
 * Chromium against a local static server) and live in `public/photos/looks/`.
 * A page whose preview is missing still renders; the figure is simply empty, so
 * run that script before shipping a new batch.
 */
import { articleLd } from '../site.mjs';
import { LOOKS } from '../../public/js/looks.js';

/** Looks that have a page. Batches are added here as they are written. */
export const LAUNCHED_LOOK_IDS = [
  'kodak-portra-400',
  'kodak-ektar-100',
  'kodachrome-64',
  'kodak-trix-400',
  'fuji-classic-chrome',
  'fuji-velvia-50',
  'fuji-acros-100',
  'leica-classic',
  'hasselblad-natural',
  'ricoh-positive',
  'cinema-teal',
  'film-bleach',
];

const CAT_EN = {
  cinema: 'Cinema',
  film: 'Film',
  bw: 'Black & white',
  warm: 'Warm & cool',
  punch: 'Style',
  vintage: 'Vintage',
  airy: 'Airy',
  leica: 'Leica',
  hasselblad: 'Hasselblad',
  kodak: 'Kodak',
  fuji: 'Fujifilm',
  ricoh: 'Ricoh',
  pana: 'Panasonic',
};

const BTN = {
  zh: '在编辑器里套上它',
  en: 'Open it in the editor',
};

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function siblingsHtml(lang, self) {
  const others = LAUNCHED_LOOK_IDS.filter((id) => id !== self).map((id) => LOOKS.find((l) => l.id === id)).filter(Boolean);
  const links = others.map((look) => {
    const name = lang === 'zh' ? look.name : look.en;
    return `<a href="${lang === 'zh' ? '' : '/en'}/looks/${look.id}">${esc(name)}</a>`;
  });
  return `<nav aria-label="${lang === 'zh' ? '其他 look' : 'Other looks'}" style="display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:28px">${links.join('')}</nav>`;
}

function figure(lang, src, alt, caption) {
  return `<figure class="figure"><img src="/photos/looks/${src}" width="1200" height="801" alt="${esc(alt)}" loading="lazy"><figcaption>${esc(caption)}</figcaption></figure>`;
}

function bodyZh(look, copy) {
  const goodFor = (copy.goodFor || []).map((item) => `<li>${item}</li>`).join('');
  return `${figure('zh', 'before.jpg', '示例照片的原始显影：没有套 LUT 的中性渲染', '原片：没有套 LUT 的中性显影（同一张示例照片）。')}
${figure('zh', `${look.id}.jpg`, `${look.name} 套用在示例照片上的效果`, `${look.name}：强度 100% 时的显影结果。`)}
<h2 id="what">${esc(look.name)} 是什么</h2>
<p>${copy.what}</p>
<h2 id="use">适合什么照片</h2>
<ul>${goodFor}</ul>
<h2 id="near">和相邻的两款差在哪</h2>
<p>${copy.differs}</p>
<h2 id="get">怎么用</h2>
<p><a class="btn" href="/?look=${look.id}">${BTN.zh}</a></p>
<ol>
<li>上面的按钮会打开编辑器、直接套上这一支（照片在本机处理，不会上传）。</li>
<li>想要文件：下载单独一支 <a href="/download/cubes/${look.id}.cube" download><code>${look.id}.cube</code></a>（标准 33³、约 0.8 MB），或者<a href="/download">全部 64 款打包</a>。</li>
<li>放进别的软件：Resolve 在 Project Settings → Color Management → Lookup Tables；Premiere 在 Lumetri → Creative → Look；Photoshop 用「颜色查找」调整图层。Lightroom Classic 不能直接读 .cube，但可以在 Photoshop 的 Camera Raw 里用「创建配置文件」把 LUT 包成 .xmp 配置（Presets ⋯ → Create Profile，勾 Color Lookup Table），再在 Lightroom 的配置文件浏览器里使用。</li>
</ol>
<h2 id="limits">边界</h2>
<p>这是为本站写的原创配方，风格上参考 <b>${esc(look.name)}</b> 的外观，<b>不是</b>胶片扫描数据，也不是厂商发布的 LUT。每张照片单独处理，没有批量。强度从 100% 开始判断，想更淡就往下调；<a href="/guides/merge-lut">两支也能合并成一支新的 .cube</a>。</p>
<p>相关：<a href="/looks">全部 64 款 look</a> · <a href="/download">64 款打包下载</a> · <a href="/guides/what-is-lut">LUT 是什么</a> · <a href="/guides/lut-size">LUT 精度实测</a> · <a href="/faq">常见问题</a></p>
${siblingsHtml('zh', look.id)}`;
}

function bodyEn(look, copy) {
  const goodFor = (copy.goodFor || []).map((item) => `<li>${item}</li>`).join('');
  return `${figure('en', 'before.jpg', 'The sample photo, developed neutrally with no LUT applied', 'Before: the same sample photo developed neutrally, no LUT.')}
${figure('en', `${look.id}.jpg`, `${look.en} applied to the sample photo`, `${look.en} at 100 % strength.`)}
<h2 id="what">What ${esc(look.en)} is</h2>
<p>${copy.what}</p>
<h2 id="use">What it suits</h2>
<ul>${goodFor}</ul>
<h2 id="near">How it differs from its two nearest looks</h2>
<p>${copy.differs}</p>
<h2 id="get">How to use it</h2>
<p><a class="btn" href="/?look=${look.id}">${BTN.en}</a></p>
<ol>
<li>The button opens the editor with this look already applied (the photo is processed on your device, never uploaded).</li>
<li>Want the file: download <a href="/download/cubes/${look.id}.cube"><code>${look.id}.cube</code></a> (standard 33³, about 0.8 MB), or <a href="/en/download">take all 64 as one pack</a>.</li>
<li>Elsewhere: Resolve → Project Settings → Color Management → Lookup Tables; Premiere → Lumetri → Creative → Look; Photoshop → Color Lookup adjustment layer. Lightroom Classic cannot open a .cube directly, but you can package it as a profile in Adobe Camera Raw (Presets ⋯ → Create Profile → tick Color Lookup Table) and use it from Lightroom’s Profile Browser.</li>
</ol>
<h2 id="limits">The limits</h2>
<p>An original recipe written for this site. It is inspired by the look of <b>${esc(look.en)}</b>; it is <b>not</b> film-scan data and <b>not</b> a vendor-published LUT. One photo at a time, no batch. Judge it at 100 % strength and lower it to taste; <a href="/en/guides/merge-lut">two looks can also be merged into a new .cube</a>.</p>
<p>Related: <a href="/en/looks">all 64 looks</a> · <a href="/en/download">the 64-look pack</a> · <a href="/en/guides/what-is-lut">what a LUT is</a> · <a href="/en/guides/lut-size">measured LUT precision</a> · <a href="/en/faq">FAQ</a></p>
${siblingsHtml('en', look.id)}`;
}

/**
 * @param {string} id look id from public/js/looks.js
 * @param {{zh: object, en: object}} copy per-language { what, goodFor: string[3], differs, title?, description?, faq? }
 */
export function lookPage(id, copy) {
  const look = LOOKS.find((l) => l.id === id);
  if (!look) throw new Error(`lookPage: unknown look ${id}`);
  if (!LAUNCHED_LOOK_IDS.includes(id)) throw new Error(`lookPage: ${id} is not in LAUNCHED_LOOK_IDS`);

  const catEn = CAT_EN[look.cat] || look.cat;
  const path = (lang) => (lang === 'zh' ? `/looks/${id}` : `/en/looks/${id}`);
  const name = (lang) => (lang === 'zh' ? look.name : look.en);
  const kicker = (lang) => (lang === 'zh' ? `${look.catLabel} · LOOK` : `${catEn.toUpperCase()} · LOOK`);
  const title = (lang) =>
    copy[lang].title || (lang === 'zh' ? `${look.name} LUT：免费下载与在线预览` : `${look.en} LUT: free .cube and preview`);
  const description = (lang) =>
    copy[lang].description ||
    (lang === 'zh'
      ? `按${look.name}风格自制的原创 33³ LUT：可直接套在 RAW 或 JPEG 上预览，也能下载 .cube 给 Resolve 与 PS 用。`
      : `An original 33³ LUT inspired by ${look.en}: preview it on your own RAW or JPEG in the browser, then download the .cube for Resolve or Photoshop.`);
  const image = `/photos/looks/${id}.jpg`;

  return {
    slug: `looks/${id}`,
    hub: null,
    kind: 'guide',
    priority: 0.7,
    changefreq: 'monthly',
    updated: '2026-11-25',
    readMinutes: 3,
    image,
    jsonLd: (lang) => [
      articleLd({
        lang,
        title: title(lang),
        description: description(lang),
        path: path(lang),
        image,
        updated: '2026-11-25',
        hub: lang === 'zh' ? 'LUT 目录' : 'Look catalogue',
      }),
    ],
    zh: {
      title: title('zh'),
      description: description('zh'),
      kicker: kicker('zh'),
      h1: `${look.name}：在浏览器里预览，下载 .cube`,
      lede: `${look.tag}。这一页给出它在同一张示例照片上的实际效果、适合的拍摄题材，以及和相邻两款的差别；可以直接在编辑器里套用，也可以下载这一支 .cube。`,
      body: bodyZh(look, copy.zh),
      faq: copy.zh.faq || [
        ['这是柯达/富士/厂商的官方数据吗？', '不是。这是为本站写的原创配方，风格上参考该型号的外观；不含胶片扫描数据，也不含厂商 LUT 数据。'],
        ['能用在 Premiere 或 Resolve 吗？', '可以。下载的 .cube 是标准 33³ LUT，按页面里的路径导入即可。Lightroom Classic 不能直接读 .cube，但可以在 Photoshop 的 Camera Raw 里包成 .xmp 配置再在配置文件浏览器里使用。'],
      ],
    },
    en: {
      title: title('en'),
      description: description('en'),
      kicker: kicker('en'),
      h1: `${look.en}: preview it in the browser, download the .cube`,
      lede: `${look.tag}. This page shows the actual result on one sample photo, what subjects it suits and how it differs from its two nearest looks — apply it in the editor or download this single .cube.`,
      body: bodyEn(look, copy.en),
      faq: copy.en.faq || [
        ['Is this official Kodak/Fujifilm/vendor data?', 'No. It is an original recipe written for this site, inspired by that model’s look; it contains no film-scan and no vendor-published LUT data.'],
        ['Does it work in Premiere or Resolve?', 'Yes. The downloaded .cube is a standard 33³ LUT; import it using the paths on this page. Lightroom Classic cannot open a .cube directly — package it as a profile in Adobe Camera Raw first.'],
      ],
    },
  };
}
