import { articleLd } from '../../site.mjs';

// Vendor LUT sources, verified 2026-11-25. The vendor pages change their URLs
// every few years; when one dies, replace it here rather than deleting the row:
// the explanation of *which log curve* each pack expects is the durable part.
const SOURCES = [
  {
    brand: 'Panasonic VariCam / EVA1',
    zh: 'VariCam 35 与 AU-EVA1 的艺术 look，V-Log 输入。',
    en: 'Arty looks for VariCam 35 and AU-EVA1, authored for V-Log input.',
    page: 'https://pro-av.panasonic.net/en/cinema_camera_varicam_eva/support/lut/',
    label: 'VariCam LUT Library',
    log: 'V-Log',
  },
  {
    brand: 'Panasonic LUMIX',
    zh: 'LUMIX 相机的 V-Log / V-Log L 转换 LUT。',
    en: 'Conversion LUTs for LUMIX cameras shooting V-Log / V-Log L.',
    page: 'https://av.jpn.support.panasonic.com/support/global/cs/dsc/download/lut/index.html',
    label: 'LUMIX LUT download',
    log: 'V-Log',
  },
  {
    brand: 'Fujifilm',
    zh: 'Film Simulation 的 3D LUT，F-Log / F-Log2 输入，也包括部分机型的内置胶片模拟。',
    en: 'Film Simulation 3D LUTs for F-Log / F-Log2 input, including several built-in film simulations.',
    page: 'https://www.fujifilm-x.com/global/support/download/lut/',
    label: 'Film Simulation 3D-LUT',
    log: 'F-Log / F-Log2',
  },
  {
    brand: 'Canon',
    zh: 'Canon Log 2 / Canon Log 3 的 Look File，下载与条款在同一个页面（需要先读条款）。',
    en: 'Look Files for Canon Log 2 / Canon Log 3, with the licence terms on the same page (read them first).',
    page: 'https://color.ssw.imaging-saas.canon/color/en/pc/',
    label: 'Canon Look File',
    log: 'Canon Log 2 / 3',
  },
  {
    brand: 'Nikon',
    zh: 'N-Log LUT（第 2 版起包含 RED 风格的 creative LUT），N-Log 输入。',
    en: 'N-Log LUTs (version 2 added RED-style creative looks), authored for N-Log input.',
    page: 'https://downloadcenter.nikonimglib.com/en/download/sw/258.html',
    label: 'N-Log LUT',
    log: 'N-Log',
  },
  {
    brand: 'Sony',
    zh: 'S-Log3 / S-Gamut3.Cine 的 Look Profile 与 s709 监视 LUT，全部免费。',
    en: 'Look Profiles for S-Log3 / S-Gamut3.Cine plus the s709 monitoring look, all free.',
    page: 'https://pro.sony/ue_US/technology/professional-video-lut-look-up-table',
    label: 'Sony LUT Library',
    log: 'S-Log / S-Log2 / S-Log3',
  },
];

function vendorTable(lang) {
  const rows = SOURCES.map(
    (s) =>
      `<tr><th scope="row">${s.brand}</th><td>${lang === 'zh' ? s.zh : s.en}<br><a href="${s.page}" rel="noopener">${s.label} →</a></td><td>${s.log}</td></tr>`
  ).join('\n');
  const head =
    lang === 'zh'
      ? '<tr><th scope="col">品牌</th><th scope="col">官方页面</th><th scope="col">需要的输入</th></tr>'
      : '<tr><th scope="col">Brand</th><th scope="col">Official page</th><th scope="col">Input it expects</th></tr>';
  return `<table>
<caption>${lang === 'zh' ? '厂商官方 LUT 来源（2026-11 核对）' : 'Official vendor LUT sources (checked Nov 2026)'}</caption>
<thead>${head}</thead>
<tbody>
${rows}
</tbody>
</table>`;
}

export default {
  slug: 'get-luts',
  hub: null,
  kind: 'guide',
  priority: 0.7,
  changefreq: 'monthly',
  updated: '2026-11-25',
  readMinutes: 5,
  image: '/photos/zoom.jpg',
  jsonLd: (lang) => [
    articleLd({
      lang,
      title: lang === 'zh' ? '相机厂商官方 LUT 下载与导入方法' : 'Official camera LUT downloads and how to import them',
      description:
        lang === 'zh'
          ? '松下、富士、佳能、尼康、索尼的官方 .cube 下载入口，以及把厂商 LUT 导入浏览器暗房的步骤。'
          : 'Where Panasonic, Fujifilm, Canon, Nikon and Sony publish their .cube LUTs, and how to import them locally.',
      path: lang === 'zh' ? '/get-luts' : '/en/get-luts',
      image: '/photos/zoom.jpg',
      updated: '2026-11-25',
      hub: null,
    }),
  ],
  zh: {
    title: '相机厂商官方 LUT 下载与导入方法',
    description: '松下、富士、佳能、尼康、索尼的官方 .cube 下载入口，以及把厂商 LUT 导入浏览器暗房的步骤，附 LOG 输入说明。',
    kicker: 'LUT 来源',
    h1: '厂商 LUT 去哪里下载，怎么用',
    lede:
      '松下、富士、佳能、尼康、索尼都免费发布自己的 .cube LUT，但条款只允许你在自己的机器上使用，不能再分发——所以它们不在这个站的仓库里。这里给出官方入口、每支 LUT 期望的 LOG 输入，以及在本机导入使用的完整步骤。',
    body: `<p>本站自带的 64 款 look 是自研配方，MIT 授权，可以<a href="/download">直接打包下载</a>。厂商 LUT 是另一回事：它们是按各自相机的 LOG 曲线做的转换表，用对了会让画面非常接近厂商标配，用错了（直接套在 sRGB 照片上）就会过曝、偏色——这不是 LUT 坏了，是输入前提没满足。</p>

<h2 id="sources">官方下载入口</h2>
${vendorTable('zh')}
<p>有些页面会按地区或账号做跳转；尼康的 LUT 打包成 Windows / macOS 安装包，运行后在 <code>3DLUT</code> 文件夹里取 <code>.cube</code>。厂商偶尔改 URL——如果你发现某个入口失效，<a href="https://github.com/shisongsong/lut-studio/issues" rel="noopener">提个 issue</a>，这一页会跟着更新。</p>

<h2 id="import">三步导入</h2>
<ol>
<li><strong>下载 .cube</strong>：从上面的官方页面保存文件（有些是 zip，解压后使用）。</li>
<li><strong>打开编辑器，导入</strong>：回到<a href="/">浏览器编辑器</a>，点底部「导入 LUT」，选择文件。文件只在本机解析，存进浏览器的 IndexedDB，出现在「我的 LUT」里，刷新不丢。</li>
<li><strong>装进别的软件</strong>：导入编辑器只是本机预览；要放进 Premiere / Resolve / Photoshop / Final Cut，按<a href="/guides/install-lut">各软件的安装路径</a>操作。</li>
<li><strong>确认输入曲线</strong>：名字里带 F-Log / F-Log2 / V-Log 的 LUT 会被自动识别并切换输入曲线；名字看不出来的旧版文件，点底部原来的 sRGB 按钮，在「输入曲线」面板里手动选。</li>
</ol>

<h2 id="log">为什么必须管输入曲线</h2>
<p>LOG 把场景亮度铺平保存：暗部被抬起来，0–1 的码值里塞进远超显示的动态范围。厂商的转换 LUT 是给「已经是 LOG 编码」的输入设计的，每个码值对应一个确定的场景亮度。普通照片是 sRGB 显示编码——同一个暗部细节在 sRGB 里的码值高得多。把 sRGB 喂给 LOG LUT，等于告诉它「这块阴影比实际暗得多」，于是整体压暗、颜色跑偏。输入曲线的作用就是在 LUT 之前把照片按对应的 log 传递函数重新编码。</p>
<p>色域这里仍按 sRGB 处理，所以厂商 LUT 的结果会接近但不逐字节一致。输入曲线只决定 LUT 拿到什么，它本身不是调色：没有 LOG LUT 把它转回显示时，画面发灰是正常的。</p>

<h2 id="limits">边界</h2>
<ul>
<li>厂商 LUT 的许可只覆盖本机个人使用，不能随插件、预设包或站点再分发；下载地址请始终指向厂商官方页面。</li>
<li>这些 LUT 是为视频的 LOG 素材准备的。拿它调照片时从 100% 强度开始判断，多数情况下 30–60% 更合适。</li>
<li>LUT 只是色彩映射：已经过曝的死白像素回不来，RAW 的高光恢复发生在 LUT 之前——这也是这个编辑器先把 RAW 在 16 位线性空间显影、再做显示变换、最后才套 LUT 的原因。</li>
<li>想把手上的两支 LUT 固定成一个文件，可以在编辑器里叠加后<a href="/guides/merge-lut">合并成一个 .cube</a>再下载。</li>
</ul>

<h2 id="more">相关</h2>
<p><a href="/guides/what-is-lut">LUT 是什么（1D vs 3D、LOG 前提）</a> · <a href="/download">下载本站 64 款原创 LUT</a> · <a href="/looks">完整 look 目录</a> · <a href="/guides/raw-in-browser">在浏览器里打开 RAW</a> · <a href="/faq">常见问题</a></p>`,
    faq: [
      ['厂商 LUT 能再分发吗？', '不能。松下、富士、佳能、尼康、索尼的条款只允许个人在本机使用，这也是本站不打包厂商 LUT 的原因。你自己下载、自己导入即可，文件不会上传。'],
      ['为什么套上厂商 LUT 之后画面发灰？', '多半是输入曲线没对上：LOG LUT 需要 LOG 编码的输入。名字里带 F-Log / V-Log 的文件会自动切换，其余在「输入曲线」面板里手动选。'],
      ['可以直接套在 JPEG 照片上吗？', '可以，但结果会偏离设计意图：LUT 期望的是 LOG 输入，JPEG 是 sRGB。把强度降到 30–60% 通常更自然，或者选本站为照片设计的 look。'],
      ['站内 look 和厂商 LUT 有什么区别？', '站内 64 款是自研配方生成的 33³ LUT，为显示编码的照片设计，MIT 授权可自由使用；厂商 LUT 是按各自相机 LOG 曲线做的转换表，许可只限本机个人使用。'],
    ],
  },
  en: {
    title: 'Official camera LUT downloads and how to import them',
    description: 'Where Panasonic, Fujifilm, Canon, Nikon and Sony publish their .cube LUTs, which log curve each expects, and how to import them locally.',
    kicker: 'LUT SOURCES',
    h1: 'Where vendor LUTs come from, and how to use them',
    lede:
      'Panasonic, Fujifilm, Canon, Nikon and Sony all publish their own .cube LUTs for free — but their terms only allow personal local use and forbid redistribution, which is why they are not in this site’s repository. Here are the official entry points, the log input each pack expects, and how to import one locally.',
    body: `<p>The 64 looks that ship with the editor are original recipes under the MIT licence and can be <a href="/en/download">downloaded as a pack</a>. Vendor LUTs are a different thing: they are conversion tables built for that camera’s own log curve. Applied correctly they get very close to the manufacturer’s look; applied straight to an sRGB photo they blow out and shift colour — not because the LUT is broken, but because its input precondition is not met.</p>

<h2 id="sources">Official download pages</h2>
${vendorTable('en')}
<p>Some pages redirect by region or ask for an account; Nikon ships its LUTs as a Windows / macOS installer that unpacks <code>.cube</code> files into a <code>3DLUT</code> folder. Vendors change these URLs every few years — if one is dead, <a href="https://github.com/shisongsong/lut-studio/issues" rel="noopener">open an issue</a> and this page gets updated.</p>

<h2 id="import">Three steps to import</h2>
<ol>
<li><strong>Download the .cube</strong> from the official page above (some are zips — unzip first).</li>
<li><strong>Open the editor and import</strong>: in the <a href="/">browser editor</a>, press “Import LUT” at the bottom and choose the file. It is parsed locally, stored in the browser’s IndexedDB and appears under “My LUTs”; it survives a reload.</li>
<li><strong>Install it in your editor</strong>: importing here is only a local preview; for Premiere / Resolve / Photoshop / Final Cut follow the <a href="/en/guides/install-lut">per-app install paths</a>.</li>
<li><strong>Confirm the input curve</strong>: files whose name carries F-Log / F-Log2 / V-Log switch automatically; for older files whose name says nothing, open the “Input curve” panel (the sRGB button at the bottom) and pick it manually.</li>
</ol>

<h2 id="log">Why the input curve matters</h2>
<p>Log encoding flattens scene brightness: shadows are lifted so the 0–1 code range carries far more dynamic range than a display does. A vendor conversion LUT is authored for input that is already log-encoded — every code value corresponds to a known scene luminance. An ordinary photo is display-encoded sRGB, where the same shadow detail sits at a much higher code value. Feeding sRGB to a log LUT tells it “this shadow is far darker than it is”, so the image goes dark and the colour drifts. The input curve re-encodes the photo with the matching log transfer function before the table is sampled.</p>
<p>Gamut is still treated as sRGB, so vendor LUTs land close to, but not byte-exact, the manufacturer’s output. The input curve only decides what the LUT receives — it is not a grade by itself. With no log LUT converting back to display, a washed-out picture is expected.</p>

<h2 id="limits">The limits</h2>
<ul>
<li>Vendor terms cover personal local use only: never redistribute the files with a plugin, preset pack or site. Always point at the manufacturer’s page.</li>
<li>These LUTs are made for log video. Judging one on a photo, start at 100 % strength but expect 30–60 % to look more natural.</li>
<li>A LUT is a colour mapping: fully clipped highlights cannot come back, and RAW highlight recovery happens before the LUT — which is why this editor develops the RAW in 16-bit linear, applies the display transform, then samples the table.</li>
<li>To fix two LUTs into one file, stack and <a href="/en/guides/merge-lut">merge them into a single .cube</a> in the editor and download that.</li>
</ul>

<h2 id="more">Related</h2>
<p><a href="/en/guides/what-is-lut">What a LUT is (1D vs 3D, the log precondition)</a> · <a href="/en/download">Download this site’s 64 original LUTs</a> · <a href="/en/looks">The full look catalogue</a> · <a href="/en/guides/raw-in-browser">Opening a RAW in the browser</a> · <a href="/en/faq">FAQ</a></p>`,
    faq: [
      ['Can I redistribute vendor LUTs?', 'No. Panasonic, Fujifilm, Canon, Nikon and Sony licence their LUTs for personal local use only, which is why this site does not bundle them. Download them yourself and import locally — the file never leaves your machine.'],
      ['Why does a vendor LUT look washed out?', 'Almost always the input curve: a log LUT expects log-encoded input. Names containing F-Log / V-Log switch automatically; pick the rest manually in the input-curve panel.'],
      ['Can I apply one to a JPEG?', 'Yes, but the result is off by design: the LUT expects log input while a JPEG is sRGB. Try 30–60 % strength, or use one of the site’s photo-oriented looks instead.'],
      ['What is the difference between the built-in looks and vendor LUTs?', 'The 64 built-in looks are original 33³ recipes designed for display-encoded photos and released under the MIT licence; vendor LUTs are conversion tables for that camera’s log curve, licensed for local personal use only.'],
    ],
  },
};
