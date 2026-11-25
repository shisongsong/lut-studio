import { articleLd } from '../../site.mjs';
import { LOOKS } from '../../../public/js/looks.js';
import { LAUNCHED_LOOK_IDS } from '../look-page.mjs';
import { statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The zip is produced by scripts/build-cube-zip.mjs (part of `npm run deploy`).
// Its real size is read at build time so the page never advertises a number the
// archive does not have.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
let packMB = '';
try {
  const bytes = statSync(join(ROOT, 'public', 'download', 'lut-archive-64-luts.zip')).size;
  packMB = (bytes / 1024 / 1024).toFixed(1);
} catch {
  packMB = '';
}

const CATS = [
  { id: 'cinema', zh: '电影', en: 'Cinema' },
  { id: 'film', zh: '胶片', en: 'Film' },
  { id: 'bw', zh: '黑白', en: 'Black & white' },
  { id: 'warm', zh: '冷暖', en: 'Warm & cool' },
  { id: 'punch', zh: '风格', en: 'Punch' },
  { id: 'vintage', zh: '复古', en: 'Vintage' },
  { id: 'airy', zh: '空气感', en: 'Airy' },
  { id: 'leica', zh: '徕卡', en: 'Leica' },
  { id: 'hasselblad', zh: '哈苏', en: 'Hasselblad' },
  { id: 'kodak', zh: '柯达', en: 'Kodak' },
  { id: 'fuji', zh: '富士', en: 'Fujifilm' },
  { id: 'ricoh', zh: '理光', en: 'Ricoh' },
  { id: 'pana', zh: '松下', en: 'Panasonic' },
];

// One table row per category, one line per look: this is the real content of
// the pack, not a marketing list, so it belongs on the page.
function lookTable(lang) {
  const rows = CATS.map((cat) => {
    const looks = LOOKS.filter((look) => look.cat === cat.id);
    const names = looks
      .map((look) => {
        const text = lang === 'zh' ? look.name : look.en;
        if (!LAUNCHED_LOOK_IDS.includes(look.id)) return text;
        const href = lang === 'zh' ? `/looks/${look.id}` : `/en/looks/${look.id}`;
        return `<a href="${href}">${text}</a>`;
      })
      .join(' · ');
    return `<tr><th scope="row">${lang === 'zh' ? cat.zh : cat.en}</th><td>${names}</td></tr>`;
  }).join('\n');
  return `<table>
<caption>${lang === 'zh' ? `全部 ${LOOKS.length} 款 look（按类别）` : `All ${LOOKS.length} looks, by category`}</caption>
<thead><tr><th scope="col">${lang === 'zh' ? '类别' : 'Category'}</th><th scope="col">${lang === 'zh' ? 'look' : 'Looks'}</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
}

// The open button carries ?look= — the deep link the app now understands — so
// a visitor can try the pack before downloading it.
const OPEN = 'https://lut.openanthropic.com';

export default {
  slug: 'download',
  hub: null,
  kind: 'guide',
  priority: 0.9,
  changefreq: 'monthly',
  updated: '2026-11-25',
  image: '/photos/home-desktop.jpg',
  jsonLd: (lang) => [
    articleLd({
      lang,
      title: lang === 'zh' ? `免费下载全部 ${LOOKS.length} 款 LUT（.cube）` : `Download all ${LOOKS.length} LUTs as .cube files`,
      description:
        lang === 'zh'
          ? `全部 ${LOOKS.length} 款内置 look 打包成标准 33³ .cube：电影、胶片、黑白与相机风格，MIT 许可，无需注册。`
          : `Every built-in look as a standard 33³ .cube in one zip: cinema, film, black & white and camera-inspired grades. MIT licensed, no signup.`,
      path: lang === 'zh' ? '/download' : '/en/download',
      image: '/photos/home-desktop.jpg',
      updated: '2026-11-25',
      hub: null,
    }),
  ],
  zh: {
    title: `免费下载全部 ${LOOKS.length} 款 LUT（.cube）`,
    description: `${LOOKS.length} 款原创 33³ LUT 打包下载：电影、胶片、黑白与相机风格，MIT 许可，可直接导入 Resolve、Premiere、Photoshop。不注册、不填邮箱。`,
    kicker: '下载',
    h1: `全部 ${LOOKS.length} 款 look，打包成 .cube`,
    lede: `站里能套的每一款 look 都在这里：${LOOKS.length} 个标准 33³ .cube，一个 zip，MIT 许可。不注册、不填邮箱、不加水印，拿去 Resolve、Premiere、Photoshop 或者任何支持 .cube 的软件直接用。`,
    body: `<p><a class="btn" href="/download/lut-archive-${LOOKS.length}-luts.zip" download data-track="download_pack">下载 .zip${packMB ? `（${packMB} MB）` : ''}</a></p>
<p class="note">包里是 <code>cubes/</code> 目录下 ${LOOKS.length} 个 <code>.cube</code> 文件，加一份 <code>README.txt</code>（导入步骤与许可）和 <code>looks.json</code>（每款 look 的 id、中英文名、类别）。解压后不需要任何安装程序。</p>

<h2 id="what">里面是什么</h2>
${lookTable('zh')}
<p>每款都是 <code>LUT_3D_SIZE 33</code>、<code>DOMAIN_MIN 0 0 0</code>、<code>DOMAIN_MAX 1 1 1</code> 的标准 3D LUT，输入按 sRGB / Rec.709 处理。33³ 共 35,937 个节点——对这个仓库里的配方而言是精确的：17³ 平均误差 0.23 级、最大 20.8 级，21³ 平均 0.18、最大 11.6，33³ 为 0。<a href="/guides/lut-size">精度实测在这里</a>。</p>
<figure class="figure"><img src="/photos/home-desktop.jpg" width="1400" height="875" alt="LUT ARCHIVE 在浏览器里的编辑界面：底部是 look 胶片条，画布上是一张套了 look 的照片" loading="lazy"><figcaption>同一个 look 也能直接在浏览器里预览：把照片拖进编辑器，套上 look，再决定要不要下载。</figcaption></figure>

<h2 id="install">怎么装到别的软件</h2>
<table>
<caption>四款常见软件的导入位置</caption>
<thead><tr><th scope="col">软件</th><th scope="col">位置</th></tr></thead>
<tbody>
<tr><th scope="row">DaVinci Resolve</th><td>Project Settings → Color Management → Lookup Tables，或 Color 页的 LUTs 面板里添加目录</td></tr>
<tr><th scope="row">Premiere Pro</th><td>Lumetri Color → Creative → Look → Browse</td></tr>
<tr><th scope="row">Photoshop</th><td>图层 → 新建调整图层 → 颜色查找（Color Lookup）→ 载入 3D LUT</td></tr>
<tr><th scope="row">Final Cut Pro</th><td>效果 → 颜色 → 自定 LUT → 选取 LUT</td></tr>
<tr><th scope="row">Lightroom Classic</th><td>不支持 .cube。想看这支 look 在照片上的效果，用 <a href="/">浏览器编辑器</a>打开同一张照片即可。</td></tr>
</tbody>
</table>
<p>强度请从 100% 开始判断：包里烘的是满强度结果。要更淡的效果，在支持强度的软件里下调，或者回到编辑器用强度滑轨预览后再决定——<a href="/guides/merge-lut">两支 look 也能合并成一支新 .cube</a>。</p>

<h2 id="licence">许可与来源</h2>
<p>这些是本站为满足「柯达 Portra 400 那种感觉」「哈苏自然」这类需求自己写的配方（<code>scripts/looks.mjs</code>），再用它们生成 LUT，代码与生成物都是 <strong>MIT 许可</strong>，商用也可以，不需要署名。它们<strong>不是</strong>胶片扫描数据，也<strong>不是</strong>厂商发布的 LUT：名字只是对风格的指代，具体给的是一套可复现的调色曲线。</p>
<p>厂商 LUT（松下、富士、佳能、尼康、索尼官方发布的 .cube）的条款只允许个人在本机使用，不能随包分发，所以没有放进这个 zip。想用它们，去 <a href="/get-luts">官方下载入口</a>拿到文件，再导入编辑器即可。</p>

<h2 id="limits">诚实的边界</h2>
<ul>
<li>编辑器一次处理一张照片：没有批量、没有目录管理、没有云同步。</li>
<li>LUT 只是色彩映射，回不来已经过曝的死白像素；RAW 的高光恢复发生在 LUT 之前。</li>
<li>33³ 是为这套配方选的：换成 65³ 只是体积翻倍，看不出差别。</li>
<li>包里不含任何照片，也不含任何需要联网才能用的东西。</li>
</ul>

<h2 id="try">先用再决定</h2>
<p>不确定哪一支适合你的照片？<a href="/">打开编辑器</a>，把 RAW 或 JPEG 拖进去，在底部的 look 条上逐个套一遍再导出对比——全部在本机完成，照片不会上传。常用的几支也可以直接深链打开：<a href="/?look=cinema-teal">电影青橙</a>、<a href="/?look=kodak-portra-400">柯达 Portra 400</a>、<a href="/?look=mono-classic">中性黑白</a>。</p>
<p>相关：<a href="/looks">完整 look 目录</a> · <a href="/guides/what-is-lut">LUT 是什么</a> · <a href="/guides/raw-in-browser">在浏览器里打开 RAW</a> · <a href="/guides/lut-size">LUT 要做多精细</a> · <a href="/faq">常见问题</a></p>`,
    faq: [
      ['这些 LUT 是官方 LUT 吗？', '不是。它们是本站自己写的配方生成的原创 33³ LUT，风格上参考了胶片与相机的外观；不含胶片扫描数据，也不含任何厂商发布的 LUT 数据。'],
      ['可以商用吗？', '可以。MIT 许可，不要求署名，也不要求付费或注册。'],
      ['怎么导入？', '解压后把 cubes/ 里的 .cube 按上表的路径导入即可；编辑器里也可以直接 drag & drop 一个 .cube，它会被保存在浏览器的「我的 LUT」里。'],
      ['会和网页上的效果一模一样吗？', '在把强度设成 100% 的前提下，LUT 本身一样；但网页在 LUT 之前还有一整套 RAW 显影（16 位线性、sigmoid 显示变换），其他软件里前面那一步不同，画面会有差异。'],
    ],
  },
  en: {
    title: `Download all ${LOOKS.length} LUTs as .cube files`,
    description: `All ${LOOKS.length} built-in 33³ looks as standard .cube files in one zip: cinema, film, black & white and camera-inspired grades. MIT licensed, no signup, no email.`,
    kicker: 'DOWNLOAD',
    h1: `Every look, as standard .cube files`,
    lede: `Every look this site can apply is in this zip: ${LOOKS.length} standard 33³ .cube files under the MIT licence. No signup, no email, no watermark — load them in Resolve, Premiere, Photoshop or anything else that reads .cube.`,
    body: `<p><a class="btn" href="/download/lut-archive-${LOOKS.length}-luts.zip" download data-track="download_pack">Download the .zip${packMB ? ` (${packMB} MB)` : ''}</a></p>
<p class="note">The archive contains ${LOOKS.length} <code>.cube</code> files under <code>cubes/</code>, a <code>README.txt</code> (install steps and licence) and <code>looks.json</code> (each look's id, name, category). No installer, nothing to run after unzipping.</p>

<h2 id="what">What is inside</h2>
${lookTable('en')}
<p>Each file is a standard 3D LUT with <code>LUT_3D_SIZE 33</code>, <code>DOMAIN_MIN 0 0 0</code> and <code>DOMAIN_MAX 1 1 1</code>, expecting sRGB / Rec.709 input. 33³ means 35,937 nodes, which is exact for the recipes in this repository: 17³ has a mean error of 0.23 levels (max 20.8), 21³ a mean of 0.18 (max 11.6), 33³ zero. <a href="/en/guides/lut-size">The measurements are here</a>.</p>
<figure class="figure"><img src="/photos/home-desktop.jpg" width="1400" height="875" alt="The LUT ARCHIVE editor in a browser with the look filmstrip along the bottom and a graded photo on the canvas" loading="lazy"><figcaption>The same looks can be previewed in the browser first: drop a photo in, try a look, then decide whether to download.</figcaption></figure>

<h2 id="install">Installing it elsewhere</h2>
<table>
<caption>Where the four common apps keep their LUT import</caption>
<thead><tr><th scope="col">App</th><th scope="col">Where</th></tr></thead>
<tbody>
<tr><th scope="row">DaVinci Resolve</th><td>Project Settings → Color Management → Lookup Tables, or add the folder in the LUTs panel on the Color page</td></tr>
<tr><th scope="row">Premiere Pro</th><td>Lumetri Color → Creative → Look → Browse</td></tr>
<tr><th scope="row">Photoshop</th><td>Layer → New Adjustment Layer → Color Lookup → Load 3D LUT</td></tr>
<tr><th scope="row">Final Cut Pro</th><td>Effects → Color → Custom LUT → Choose LUT</td></tr>
<tr><th scope="row">Lightroom Classic</th><td>Does not read .cube files. To see a look on a photo, open that photo in the <a href="/">browser editor</a> instead.</td></tr>
</tbody>
</table>
<p>Judge a look at 100 % strength first — that is what the archive contains. For a softer result, lower the strength where the app supports it, or preview it with the strength rail in the editor; <a href="/en/guides/merge-lut">two looks can also be merged into one new .cube</a>.</p>

<h2 id="licence">Licence and provenance</h2>
<p>These are recipes written for this project (<code>scripts/looks.mjs</code>) and baked into LUTs, not film scans and not vendor-published data. Code and output are <strong>MIT licensed</strong>; commercial use is fine and no attribution is required. The names point at a style — what the file actually delivers is a reproducible grading curve.</p>
<p>Vendor LUTs (Panasonic, Fujifilm, Canon, Nikon, Sony) are only licensed for personal local use and cannot be redistributed, so they are not in this zip. Get those from the <a href="/en/get-luts">official download sources</a> and import the file into the editor yourself.</p>

<h2 id="limits">Honest limits</h2>
<ul>
<li>The editor processes one photo at a time: no batch, no catalogue, no cloud sync.</li>
<li>A LUT is a colour mapping and cannot recover clipped white; RAW highlight recovery happens before the LUT.</li>
<li>33³ was chosen for this recipe set: 65³ doubles the size for no visible gain.</li>
<li>The archive contains no photos and needs no network connection to use.</li>
</ul>

<h2 id="try">Try before you download</h2>
<p>Not sure which one fits your photo? <a href="/">Open the editor</a>, drop in a RAW or JPEG, run through the look strip and export a comparison — all local, nothing uploaded. The popular ones also open directly through a deep link: <a href="/?look=cinema-teal">Cinema Teal</a>, <a href="/?look=kodak-portra-400">Kodak Portra 400</a>, <a href="/?look=mono-classic">Mono Classic</a>.</p>
<p>Related: <a href="/en/looks">the full look catalogue</a> · <a href="/en/guides/what-is-lut">what a LUT is</a> · <a href="/en/guides/raw-in-browser">opening a RAW in the browser</a> · <a href="/en/guides/lut-size">how precise a LUT must be</a> · <a href="/en/faq">FAQ</a></p>`,
    faq: [
      ['Are these official camera or film LUTs?', 'No. They are original 33³ LUTs generated from recipes written for this site, inspired by film and camera looks. They contain no film scan and no vendor-published LUT data.'],
      ['Can I use them commercially?', 'Yes. MIT licence: no attribution, no payment, no signup required.'],
      ['How do I import them?', 'Unzip and load the files from cubes/ using the paths in the table above. In the editor itself you can also drop a .cube straight in — it is kept in the browser under My LUTs.'],
      ['Will it look exactly like the website?', 'The LUT itself is identical at 100 % strength, but the website develops the RAW first (16-bit linear, sigmoid display transform). Another app that skips that stage starts from a different image, so the result will differ.'],
    ],
  },
};
