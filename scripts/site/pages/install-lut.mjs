import { articleLd } from '../../site.mjs';

// Menu paths and folders, checked 2026-11-25 against Adobe's documentation, the
// Microsoft/Adobe install notes and the vendor help pages. When an app changes
// its UI, fix the row here — this page is the one place that keeps them.
const APPS = [
  {
    zh: 'Photoshop',
    en: 'Photoshop',
    zhWhere: '图层 → 新建调整图层 → 颜色查找（Color Lookup）→ 载入 3D LUT，选中 .cube 文件。',
    enWhere: 'Layer → New Adjustment Layer → Color Lookup → Load 3D LUT, then pick the .cube file.',
    zhNote: '调整图层不破坏原图；强度用图层不透明度控制。也可以把 LUT 打包成 Camera Raw 配置文件（见 Lightroom 一节）。',
    enNote: 'The adjustment layer is non-destructive; use the layer opacity for strength. You can also package the LUT as a Camera Raw profile (see the Lightroom row).',
  },
  {
    zh: 'Premiere Pro',
    en: 'Premiere Pro',
    zhWhere: 'Lumetri Color → Creative → Look → Browse，选 .cube。',
    enWhere: 'Lumetri Color → Creative → Look → Browse, then pick the .cube.',
    zhNote: 'LOG 素材的转换 LUT 应该放在 Basic Correction → Input LUT，而不是 Creative 的 Look——前者是"把 LOG 变成 Rec.709"，后者是创意调色。强度在 Intensity 滑轨上。',
    enNote: 'A LOG-conversion LUT belongs in Basic Correction → Input LUT, not in Creative → Look: the first turns LOG into Rec.709, the second is a creative grade. Strength lives on the Intensity slider.',
  },
  {
    zh: 'DaVinci Resolve',
    en: 'DaVinci Resolve',
    zhWhere: 'Project Settings → Color Management → Lookup Tables → Open LUT Folder，把 .cube 放进对应目录并 Update Lists；或直接在 Color 页的 LUT 浏览面板里右键 Refresh。',
    enWhere: 'Project Settings → Color Management → Lookup Tables → Open LUT Folder, drop the .cube in and press Update Lists; or right-click the LUT browser on the Color page and Refresh.',
    zhNote: '默认目录：macOS /Library/Application Support/Blackmagic Design/DaVinci Resolve/LUT；Windows C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\LUT。Linux 通常在 /opt/resolve/LUT（以本机安装为准）。',
    enNote: 'Default folders: macOS /Library/Application Support/Blackmagic Design/DaVinci Resolve/LUT; Windows C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\LUT; Linux usually /opt/resolve/LUT (check your install).',
  },
  {
    zh: 'Final Cut Pro',
    en: 'Final Cut Pro',
    zhWhere: '把 .cube 放进 ~/Library/Application Support/ProApps/Color Profiles/LUTs（没有 Color Profiles/LUTs 就自己建），然后给片段加 Effects → Color → Custom LUT，在 LUT 菜单里选它。',
    enWhere: 'Put the .cube into ~/Library/Application Support/ProApps/Color Profiles/LUTs (create the folder if missing), then add Effects → Color → Custom LUT to a clip and pick it from the LUT menu.',
    zhNote: 'FCP 只在启动时读取该目录，放完文件要重启一次。',
    enNote: 'FCP reads that folder at launch, so restart it once after adding files.',
  },
  {
    zh: 'After Effects',
    en: 'After Effects',
    zhWhere: 'Effect → Color Correction → Apply Color LUT，在效果控件里指向 .cube；或者用 Lumetri Color 的 Creative → Look。',
    enWhere: 'Effect → Color Correction → Apply Color LUT and point the effect controls at the .cube; or use Lumetri Color → Creative → Look.',
    zhNote: '调整层上挂 LUT、下面放素材，强度和开关都集中在调整层上。',
    enNote: 'Put the LUT on an adjustment layer above the footage so strength and on/off live in one place.',
  },
  {
    zh: 'Lightroom Classic',
    en: 'Lightroom Classic',
    zhWhere: '它不能直接打开 .cube。路是：Photoshop → Filter → Camera Raw Filter → Presets 面板里 Option/Alt 点 ⋯ → Create Profile，勾 Color Lookup Table 并载入 .cube，存成 .xmp 配置；然后重启 Lightroom，在 Develop → Basic → 配置文件浏览器里用它。',
    enWhere: 'It cannot open a .cube directly. The route: Photoshop → Filter → Camera Raw Filter → hold Option/Alt and click ⋯ in the Presets panel → Create Profile, tick Color Lookup Table and load the .cube; that writes an .xmp profile. Restart Lightroom, then use it from Develop → Basic → Profile Browser.',
    zhNote: '需要 Lightroom Classic 7.3（2018 年 4 月）或更新；配置文件有 0–200 的 Amount 滑轨，强度从这里调。',
    enNote: 'Requires Lightroom Classic 7.3 (April 2018) or newer. Profiles expose a 0–200 Amount slider for strength.',
  },
  {
    zh: 'Affinity Photo',
    en: 'Affinity Photo',
    zhWhere: '图层 → 新建调整图层 → LUT（或 Adjustments 面板里的 LUT），然后在对话框里 Load LUT 选 .cube。',
    enWhere: 'Layer → New Adjustment Layer → LUT (or the LUT adjustment in the Adjustments panel), then Load LUT and pick the .cube.',
    zhNote: '不破坏原图，强度用图层不透明度。',
    enNote: 'Non-destructive; strength via layer opacity.',
  },
];

function table(lang) {
  const rows = APPS.map(
    (app) =>
      `<tr><th scope="row">${lang === 'zh' ? app.zh : app.en}</th><td>${lang === 'zh' ? app.zhWhere : app.enWhere}${
        (lang === 'zh' ? app.zhNote : app.enNote) ? `<br><small>${lang === 'zh' ? app.zhNote : app.enNote}</small>` : ''
      }</td></tr>`
  ).join('\n');
  return `<table>
<caption>${lang === 'zh' ? '各软件的 .cube 安装位置（2026-11 核对）' : 'Where each app expects a .cube (checked Nov 2026)'}</caption>
<thead><tr><th scope="col">${lang === 'zh' ? '软件' : 'App'}</th><th scope="col">${lang === 'zh' ? '位置' : 'Where'}</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
}

export default {
  slug: 'guides/install-lut',
  hub: 'guides',
  kind: 'guide',
  priority: 0.8,
  changefreq: 'monthly',
  updated: '2026-11-25',
  readMinutes: 6,
  image: '/photos/develop-desktop.jpg',
  jsonLd: (lang) => [
    articleLd({
      lang,
      title: lang === 'zh' ? 'LUT 怎么装：Photoshop、Premiere、Resolve、Final Cut Pro 的路径' : 'How to install a LUT in Photoshop, Premiere, Resolve and Final Cut Pro',
      description:
        lang === 'zh'
          ? '各软件里 .cube 的确切安装位置与菜单路径，含 LOG 输入 LUT 与创意 LUT 的区别、Lightroom Classic 的配置文件路线。'
          : 'Exact menu paths and folders for installing .cube LUTs, including the difference between a LOG input LUT and a creative look, and the Lightroom Classic profile route.',
      path: lang === 'zh' ? '/guides/install-lut' : '/en/guides/install-lut',
      image: '/photos/develop-desktop.jpg',
      updated: '2026-11-25',
      hub: lang === 'zh' ? '指南' : 'Guides',
    }),
  ],
  zh: {
    title: 'LUT 怎么装：PS / PR / Resolve / FCP 路径与步骤',
    description: 'PS、PR、Resolve、FCP、AE、Affinity 与 Lightroom Classic 的 .cube 安装路径与步骤，含 LOG 输入与在线预览。',
    kicker: '指南 · 安装 LUT',
    h1: 'LUT 装在哪里：每个软件的准确路径',
    lede:
      '同一支 .cube，在不同软件里的入口完全不同，而且"创意 LUT"和"LOG 转换 LUT"要放的位置也不一样。这一页把常用软件的菜单路径、文件夹位置和容易踩的坑一次列清；装之前想先看看效果，直接在浏览器里套一遍最快。',
    body: `<p>先分清两类 LUT，放错位置是绝大多数"套上之后不对"的原因：</p>
<ul>
<li><strong>LOG 转换 LUT</strong>（厂商发布、名字里常带 F-Log / V-Log / S-Log / N-Log）：它的作用是把 LOG 编码的画面转换到 Rec.709，应该放在输入侧——Premiere 的 Input LUT、Resolve 的节点前段、FCP 的输入 LUT 槽。喂给它普通 sRGB 照片或已转换的画面，结果会发灰或过曝。</li>
<li><strong>创意 LUT</strong>（风格 look）：放在显示编码的画面上，应该挂在调色链的后段——Premiere 的 Creative → Look、Resolve 的后段节点、PS/Affinity 的调整图层。本站的 64 款 look 属于这一类，为显示编码的照片设计。</li>
</ul>

<h2 id="where">各软件的位置</h2>
${table('zh')}

<h2 id="flow">一个通用流程</h2>
<ol>
<li><strong>先预览</strong>：把照片拖进<a href="/">浏览器里的编辑器</a>，在胶片条上套一遍看方向对不对——本机渲染，不上传。</li>
<li><strong>再下载</strong>：单支 .cube 在各自的 look 页下（比如 <a href="/looks/kodak-portra-400">柯达 Portra 400</a>），或者<a href="/download">一次拿全部 64 款</a>。</li>
<li><strong>按上表装进软件</strong>：装完在软件里做一次身份验证——套上 LUT 再关掉，画面应当完全回到原样。回不去就说明前置的色彩管理或输入曲线不对。</li>
<li><strong>调强度</strong>：多数软件都有 Intensity / Amount / 不透明度，先看 100% 再决定降多少。LUT 是色彩映射，不能恢复已经过曝的白。</li>
</ol>

<h2 id="traps">三个常见坑</h2>
<ul>
<li><strong>Resolve 找不到 LUT</strong>：文件放进目录后要 Update Lists / Refresh，Resolve 不会自动扫描新文件。</li>
<li><strong>Final Cut Pro 装完没出现</strong>：它只在启动时读 LUT 目录，放完要重启。</li>
<li><strong>Lightroom Classic 说"不支持 .cube"</strong>：它确实不能直接打开，但可以把 LUT 包成配置文件（上表最后一行），之后在配置文件浏览器里用。</li>
</ul>

<h2 id="more">相关</h2>
<p><a href="/download">下载 64 款原创 LUT</a> · <a href="/looks/compared">同一张照片上的 12 款对比</a> · <a href="/guides/what-is-lut">LUT 是什么（1D/3D、LOG 前提）</a> · <a href="/get-luts">厂商官方 LUT 来源</a> · <a href="/faq">常见问题</a></p>`,
    faq: [
      ['为什么 LUT 套上之后画面发灰？', '九成是输入曲线：LOG LUT 需要 LOG 编码的输入。把转换 LUT 放到输入槽（Premiere 的 Input LUT、Resolve 的前段节点），或者先确认素材本身已经是 Rec.709。'],
      ['一支 LUT 能同时用在照片和视频上吗？', '可以，但要注意输入前提。本站的 look 是为显示编码的照片（sRGB）设计的；厂商的 LOG 转换 LUT 是给 LOG 视频设计的，直接套在照片上会偏。'],
      ['装完怎么做一次验证？', '套上 LUT 再关掉，画面应当逐像素回到原样；如果关掉后颜色仍有偏移，说明挂载的位置（输入槽 vs 创意槽）或色彩管理设置有问题。'],
    ],
  },
  en: {
    title: 'How to install a LUT in Photoshop, Premiere, Resolve and FCP',
    description: 'Exact menu paths and folders for .cube LUTs in Photoshop, Premiere Pro, DaVinci Resolve, Final Cut Pro, After Effects, Affinity and Lightroom Classic.',
    kicker: 'GUIDE · INSTALL A LUT',
    h1: 'Where a LUT actually goes, app by app',
    lede:
      'The same .cube lives in a different place in every app — and a creative look goes somewhere different from a LOG conversion LUT. This page lists the menu paths, the folders and the usual traps; if you want to see the result first, preview it in the browser instead of installing anything.',
    body: `<p>Two kinds of LUT, and putting one in the other's slot is the cause of most "it looks wrong after installing":</p>
<ul>
<li><strong>LOG conversion LUTs</strong> (published by camera makers, usually named F-Log / V-Log / S-Log / N-Log): they convert LOG-encoded footage to Rec.709 and belong on the input side — Premiere's Input LUT, an early node in Resolve, the input LUT slot in FCP. Feed them an ordinary sRGB photo or already-converted footage and the result goes flat or blown out.</li>
<li><strong>Creative LUTs</strong> (looks): they work on display-encoded images and belong late in the chain — Premiere's Creative → Look, a late Resolve node, an adjustment layer in Photoshop or Affinity. The 64 looks on this site are in this group and are authored for display-encoded photos.</li>
</ul>

<h2 id="where">Where each app expects it</h2>
${table('en')}

<h2 id="flow">A workflow that works everywhere</h2>
<ol>
<li><strong>Preview first</strong>: drop the photo into the <a href="/">browser editor</a> and sweep the filmstrip to check the direction — rendered on your device, nothing uploaded.</li>
<li><strong>Then download</strong>: a single .cube is on each look page (e.g. <a href="/looks/kodak-portra-400">Kodak Portra 400</a>), or <a href="/download">take all 64 at once</a>.</li>
<li><strong>Install using the table above</strong>, then verify: apply the LUT, switch it off again, and the image should return exactly to the original. If it does not, the slot or the colour management in front of it is wrong.</li>
<li><strong>Set the strength</strong>: most apps expose Intensity / Amount / opacity. Judge at 100 % first, then dial back. A LUT is a colour mapping — it cannot recover clipped white.</li>
</ol>

<h2 id="traps">Three traps worth knowing</h2>
<ul>
<li><strong>Resolve cannot see the LUT</strong>: after copying the file, press Update Lists / Refresh — Resolve does not rescan the folder automatically.</li>
<li><strong>Final Cut Pro does not show it</strong>: FCP reads the LUT folder at launch, so restart it after adding files.</li>
<li><strong>Lightroom Classic says it cannot open .cube</strong>: true — but the LUT can be packaged as a profile (last row of the table) and then used from the Profile Browser.</li>
</ul>

<h2 id="more">Related</h2>
<p><a href="/en/download">Download the 64 looks</a> · <a href="/en/looks/compared">12 looks compared on one photo</a> · <a href="/en/guides/what-is-lut">What a LUT is (1D/3D, the log precondition)</a> · <a href="/en/get-luts">Official vendor LUT sources</a> · <a href="/en/faq">FAQ</a></p>`,
    faq: [
      ['Why does the image look washed out after applying a LUT?', 'Nine times out of ten it is the input: a LOG LUT expects LOG-encoded input. Put the conversion LUT in the input slot (Premiere Input LUT, an early Resolve node), or make sure the footage is already Rec.709.'],
      ['Can one LUT be used on photos and video?', 'Yes, but the input precondition still applies. The looks on this site are authored for display-encoded photos (sRGB); vendor LOG conversion LUTs are authored for LOG video and will be off when applied to a photo.'],
      ['How do I verify an install?', 'Apply the LUT, then disable it: the image should return pixel-for-pixel to the original. If colour is still shifted, the slot (input vs creative) or the colour management settings are wrong.'],
    ],
  },
};
