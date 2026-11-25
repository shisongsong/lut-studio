import { articleLd } from '../../site.mjs';

const ALT_FAQ_ZH = [
  ['有免费的浏览器版 Lightroom 替代品吗？', '有，但只覆盖一半：浏览器可以免费打开单张 RAW、显影、套 LUT、导出 JPEG；图库、批量、云同步没有免费的浏览器替代品。'],
  ['这个工具能替代 Lightroom 的图库和批量处理吗？', '不能。它是单张编辑器，没有目录、评分、关键字、批量队列或同步。'],
  ['能导入 Lightroom 的预设吗？', '不能导入 .xmp 预设。可以导入 .cube LUT，或者用内置 look 加显影面板重新调。'],
];

const ALT_FAQ_EN = [
  ['Is there a free browser alternative to Lightroom?', 'Yes, for half the job: a browser can open one RAW, develop it, apply a LUT and export a JPEG for free. There is no free browser replacement for a catalogue, batch processing or cloud sync.'],
  ['Can this tool replace Lightroom’s library and batch processing?', 'No. It is a single-frame editor: no catalogue, ratings, keywords, batch queue or sync.'],
  ['Can I import Lightroom presets?', 'Not .xmp presets. You can import .cube LUTs, or rebuild the grade with the built-in looks and the develop panel.'],
];

const faqBody = (items) =>
  `<div class="faq">${items
    .map(([question, answer]) => `<details><summary>${question}</summary><div class="a"><p>${answer}</p></div></details>`)
    .join('\n')}</div>`;

export default {
  slug: 'alternatives/lightroom-web',
  hub: 'alternatives',
  kind: 'guide',
  priority: 0.8,
  changefreq: 'monthly',
  updated: '2026-11-20',
  readMinutes: 7,
  image: '/photos/home-desktop.jpg',
  jsonLd: (lang) => [
    articleLd({
      lang,
      title: lang === 'zh' ? '浏览器里有免费的 Lightroom 替代品吗' : 'Is there a free browser alternative to Lightroom?',
      description:
        lang === 'zh'
          ? '免费的浏览器工具能替代 Lightroom 的哪一半，不能替代哪一半，以及五种工具各自适合的任务。'
          : 'Which half of Lightroom a free browser tool can replace, which half it cannot, and which tool fits which job.',
      path: lang === 'zh' ? '/alternatives/lightroom-web' : '/en/alternatives/lightroom-web',
      image: '/photos/home-desktop.jpg',
      updated: '2026-11-20',
      hub: lang === 'zh' ? '工具对比' : 'Comparisons',
    }),
  ],
  zh: {
    title: '免费的浏览器 Lightroom 替代品？先看你要做哪件事',
    description: '浏览器里能免费打开单张 RAW、显影、套 LUT、导出 JPEG，但没有图库和批量。用一张表看清五种工具各自适合谁。',
    kicker: '对比 · Lightroom',
    h1: '浏览器里有免费的 Lightroom 替代品吗？',
    lede: '一半有，一半没有。单张 RAW 的显影、调色和导出，浏览器可以免费做完；Lightroom 的另一半是目录、批量和云端图库，这部分目前没有免费的浏览器替代品，这个工具也不假装自己能做。',
    body: `<figure class="figure"><img src="/photos/home-desktop.jpg" width="1400" height="875" alt="LUT ARCHIVE 在浏览器里的编辑界面：左侧是色调面板，底部是 look 胶片条，画布上是一张正在显影的照片" loading="lazy"><figcaption>浏览器里的编辑器：显影面板、look 胶片条和画布在同一个页面里，没有安装步骤。</figcaption></figure>

<h2 id="answer">有免费的浏览器版 Lightroom 吗？</h2>
<p>有，但只覆盖一半的活。Lightroom 同时是两样东西：一台 RAW 显影器，和一套围绕目录（catalogue）与云端图库建立的工作流。浏览器能免费做前一半——打开单张 RAW、按暗房方式显影、套 LUT、导出 JPEG，不安装、不注册、照片不离开本机。后一半——图库、批量、跨设备同步——没有免费的浏览器方案能替代，本文介绍的这个工具也不做。</p>
<p>所以选工具之前，先确认你手上这件事需要哪一半。</p>

<h2 id="compare">五种工具放在同一张表里</h2>
<table>
  <thead><tr><th>工具</th><th>在哪运行</th><th>它是什么</th><th>费用</th><th>适合</th></tr></thead>
  <tbody>
    <tr><td>Lightroom</td><td>桌面 + 浏览器</td><td>RAW 显影器，围绕目录与云端图库组织工作流</td><td>订阅</td><td>长期整理大量照片、跨设备编辑</td></tr>
    <tr><td>darktable</td><td>仅桌面</td><td>免费开源的完整 RAW 管线，模块多，学习曲线陡</td><td>免费、开源</td><td>愿意投入时间，对显影流程要精细控制</td></tr>
    <tr><td>RawTherapee</td><td>仅桌面</td><td>免费开源的 RAW 处理器，参数细、功能强</td><td>免费、开源</td><td>在桌面端逐张精修 RAW</td></tr>
    <tr><td>Photopea</td><td>仅浏览器</td><td>免费的像素与图层编辑器，不是 RAW 显影器</td><td>免费使用</td><td>修图、合成、抠图</td></tr>
    <tr><td>LUT ARCHIVE</td><td>仅浏览器</td><td>免费的单张 RAW 显影加 LUT 调色</td><td>免费、MIT</td><td>在任意电脑上处理一张 RAW 并导出 JPEG</td></tr>
  </tbody>
</table>
<p>表里没有排名，只有边界。“仅桌面”不是缺点，“仅浏览器”也不是优点——它们决定了你能在什么地方打开文件，以及这个工具是为什么样的工作流设计的。</p>

<h2 id="does">这个浏览器暗房实际能做到什么</h2>
<p>它是一台单帧暗房。<a href="/guides/raw-in-browser">在浏览器里打开 RAW</a> 之后，解码交给 Web Worker 里的 flashraw，16 位场景线性数据在 GPU 上显影，显示变换用 darktable 的 sigmoid。合成线性 EV 阶梯通过 darktable 5.6.2 CLI 做了像素级参考测试，观测最大线性误差为 0.0014772；这是曲线验证，不是完整 RAW 或 Lightroom Auto 等价验证。</p>
<ul>
  <li><strong>RAW 解码</strong>：NEF / NRW（含 HE、HE* 压缩）、CR2、CR3、ARW、SRF、SR2、DNG、RAF、ORF、RW2、PEF、SRW、3FR、ERF、KDC、MOS、IIQ、X3F；拆不开时退回文件内嵌的相机 JPEG。</li>
  <li><strong>显影</strong>：白平衡与曝光在线性光下处理；六个色调滑块按这张照片自己实测的 EV 分位数放置作用范围（高光收紧实测顶部、阴影打开实测下部并锁住黑场、白色/黑色只动各自端点、对比度绕实测中位数），曲线在 CPU 上生成为单调 LUT，着色器按像素 EV 与引导图 EV 分别采样；RAW 打开时另有按场景亮度计算的自动曝光，曝光滑块是相对它的偏移。</li>
  <li><strong>LUT</strong>：64 款内置 look，可调强度、可叠第二支、可合并成一个 <code>.cube</code>，也能导入自己的 .cube。完整清单在 <a href="/looks">LUT 目录</a>。</li>
  <li><strong>导出</strong>：JPEG 按源图长边的 50 / 75 / 100% 三档输出，100% 用内存里的全分辨率帧分块渲染。</li>
  <li><strong>隐私</strong>：没有账号，没有上传，没有统计脚本；唯一的网络请求是应用资源和用来选界面语言的 <code>/api/geo</code> 国家码查询。</li>
</ul>

<h2 id="limits">它明确不做的事</h2>
<p>这一段是为了省你的时间：如果你需要下面任何一项，就不用在这个方向上继续找了，直接用桌面软件。</p>
<ul>
  <li><strong>没有图库或目录</strong>：一次只处理一张照片，关掉页面就没有“上一次编辑”，也没有评分、关键字和收藏夹。</li>
  <li><strong>没有批量</strong>：不能把一组参数套到 200 张 RAW 上，没有队列，也没有同步。</li>
  <li><strong>没有云同步</strong>：导入的 LUT 和界面偏好存在浏览器的 IndexedDB / localStorage 里，换设备或换浏览器都带不过去。</li>
  <li><strong>没有 AI 蒙版</strong>：没有主体、天空或人像识别蒙版。</li>
  <li><strong>不支持 .xmp 预设</strong>：Lightroom 的预设不能直接导入，能导入的是 .cube。</li>
  <li><strong>有前提</strong>：需要支持 WebGL2 的浏览器；预览长边限制在 4096 px（导出不受这个限制）；第一次打开 RAW 要下载约 3.4 MB 的解码器，之后走缓存。</li>
</ul>

<h2 id="pick">按你手上的任务选工具</h2>
<h3 id="one-raw">只想在借来的电脑上把一张 RAW 调出来</h3>
<p>这种情况浏览器方案最省事：不用装软件、不用登录，也不用把卡里的文件拷到别人的硬盘上再装一个试用版。打开 <a href="/">编辑器</a>，拖入文件，显影、套 look、导出 JPEG 就结束了。代价是要接受它的边界：第一次打开 RAW 之前得联网下载解码器，处理完带走的是 JPEG 和合并出来的 .cube，没有可以在别的软件里接着改的 .xmp。</p>

<h3 id="batch">手上有 200 张 RAW 要批量处理</h3>
<p>这个工具在这一项上直接出局：它没有批量，也没有队列。这是桌面软件的地盘——Lightroom 的目录与云同步本来就是按成组的照片组织的，darktable、RawTherapee 也是桌面端的完整 RAW 管线。批量如果只是偶尔一次，免费桌面软件可以应付；如果批量是常态，那正是 Lightroom 这类目录型产品的主场。</p>

<h3 id="luts">想用富士、柯达这类风格的 LUT</h3>
<p>64 款内置 look 里有柯达、富士、理光、松下、徕卡、哈苏风格的近似配方，可以调强度、叠两支、合并导出成 .cube。这里要说明一句：它们是按对应风格的色彩响应写的原创配方，不是厂商发布的 LUT 数据，观感接近，但不是逐字节复刻。厂商发布的 LUT 也能导入，但这些 LUT 是按 log 输入做的——把输入配置设为 F-Log、F-Log2 或 V-Log（名字里带这些标识的 LUT 会自动识别），应用会先用对应的传递函数把画面重新编码，再让 LUT 运行；色域仍按 sRGB 处理，所以结果接近，但不是字节级一致。细节见 <a href="/guides/raw-in-browser">浏览器 RAW 指南</a> 和 <a href="/looks">LUT 目录</a>。</p>

<h3 id="privacy">不想让照片离开这台机器</h3>
<p>这个工具的解码、显影和渲染全部在本机完成，文件没有上传接口。判断别的工具时，可以先问一句“处理发生在哪里”：本地渲染的浏览器工具、不碰服务器的桌面工具，与以目录和云端图库为中心的工作流，不是一回事。如果照片不允许经过任何第三方服务器，这条比“谁的功能多”更值得优先看。</p>

<h2 id="faq">三个常见追问</h2>
${faqBody(ALT_FAQ_ZH)}

<h2 id="verdict">一句话结论</h2>
<p>要图库、批量、跨设备同步，答案是“没有免费的浏览器替代品”，去用桌面软件；只是要在手边任意一台机器上把一张 RAW 显影、调色、导出 JPEG，浏览器里已经有免费且够用的工具，而且它连安装都省了。</p>`,
    faq: ALT_FAQ_ZH,
  },
  en: {
    title: 'A free browser alternative to Lightroom? Choose by job',
    description: 'A browser editor can develop one RAW and grade it with LUTs for free, but it cannot replace a catalogue, batch or cloud library. Compare five tools by job.',
    kicker: 'COMPARISON · LIGHTROOM',
    h1: 'Is there a free browser alternative to Lightroom?',
    lede: 'Half of one. A browser can develop a single RAW, grade it and export a JPEG for free; the other half of Lightroom — catalogue, batch and cloud library — has no free browser replacement, and this tool does not pretend otherwise.',
    body: `<figure class="figure"><img src="/photos/home-desktop.jpg" width="1400" height="875" alt="The LUT ARCHIVE editor in a browser: develop panel on the left, look filmstrip along the bottom, a photo being developed on the canvas" loading="lazy"><figcaption>The editor in a browser: develop panel, look filmstrip and canvas on one page, with no install step.</figcaption></figure>

<h2 id="answer">Is there a free browser version of Lightroom?</h2>
<p>Yes for half the job, no for the other half. Lightroom is two things at once: a RAW developer and a workflow built around a catalogue and a cloud library. A browser can do the first half for free — open one RAW, develop it like a darkroom, apply a LUT, export a JPEG — with no install, no account and no upload. The second half, a library with batch and cross-device sync, has no free browser replacement today, and this browser editor does not attempt it.</p>
<p>So before picking a tool, work out which half your job needs.</p>

<h2 id="compare">Five tools in one table</h2>
<table>
  <thead><tr><th>Tool</th><th>Runs in</th><th>What it is</th><th>Cost</th><th>Best for</th></tr></thead>
  <tbody>
    <tr><td>Lightroom</td><td>Desktop + browser</td><td>RAW developer organised around a catalogue and a cloud library</td><td>Subscription</td><td>Managing a large library across devices</td></tr>
    <tr><td>darktable</td><td>Desktop only</td><td>Free and open-source, full RAW pipeline, many modules, steep learning curve</td><td>Free, open source</td><td>Trading time for fine control over development</td></tr>
    <tr><td>RawTherapee</td><td>Desktop only</td><td>Free and open-source RAW processor with detailed controls</td><td>Free, open source</td><td>Careful per-frame RAW work on a desktop</td></tr>
    <tr><td>Photopea</td><td>Browser only</td><td>Free pixel and layer editor, not a RAW developer</td><td>Free to use</td><td>Retouching, compositing and cut-outs</td></tr>
    <tr><td>LUT ARCHIVE</td><td>Browser only</td><td>Free single-frame RAW development and LUT grading</td><td>Free, MIT</td><td>Developing one RAW and exporting a JPEG anywhere</td></tr>
  </tbody>
</table>
<p>Nothing in the table is a ranking, only a boundary. "Desktop only" is not a flaw and "browser only" is not a feature — the two decide where you can open the file and what workflow the tool was built around.</p>

<h2 id="does">What this browser darkroom actually does</h2>
<p>It is a single-frame darkroom. <a href="/en/guides/raw-in-browser">Open a RAW in the browser</a> and flashraw decodes it in a Web Worker; the 16-bit scene-linear frame is developed on the GPU, using darktable's sigmoid display transform. A synthetic linear EV ramp is pixel-compared against darktable 5.6.2 CLI output with an observed maximum linear error of 0.0014772; this checks the curve, not a full camera RAW pipeline or Lightroom Auto equivalence.</p>
<ul>
  <li><strong>RAW decoding</strong>: NEF / NRW (including HE and HE* compression), CR2, CR3, ARW, SRF, SR2, DNG, RAF, ORF, RW2, PEF, SRW, 3FR, ERF, KDC, MOS, IIQ, X3F; if a file cannot be unpacked, the camera JPEG embedded in it is used instead.</li>
  <li><strong>Development</strong>: white balance and exposure operate in linear light; every tone slider places its band from this photo's measured EV percentiles (highlights tighten the measured top, shadows open the measured bottom while locking the black point, whites/blacks move only their measured ends, contrast pivots on the measured median) and the curve is built as a monotone LUT; a RAW also opens with scene-derived auto exposure, and the exposure slider is an offset from it.</li>
  <li><strong>LUTs</strong>: 64 built-in looks with adjustable strength, a second slot for stacking, a merge into one <code>.cube</code>, and local .cube import. The full list is in the <a href="/en/looks">look catalogue</a>.</li>
  <li><strong>Export</strong>: JPEG at 50 / 75 / 100 % of the source long edge; 100 % renders the in-memory full-resolution frame in tiles.</li>
  <li><strong>Privacy</strong>: no account, no upload, no analytics; the only network requests are app assets and a <code>/api/geo</code> country lookup used to pick the interface language.</li>
</ul>

<h2 id="limits">What it explicitly does not do</h2>
<p>This section exists to save you time. If you need any of the following, stop looking in this direction and open a desktop application.</p>
<ul>
  <li><strong>No library or catalogue</strong>: one photo at a time; close the tab and there is no last edit, no ratings, keywords or collections.</li>
  <li><strong>No batch</strong>: you cannot apply one set of adjustments to 200 RAW files, and there is no queue or sync.</li>
  <li><strong>No cloud sync</strong>: imported LUTs and interface preferences live in the browser's IndexedDB / localStorage, so another device or browser starts empty.</li>
  <li><strong>No AI masks</strong>: no subject, sky or portrait masking.</li>
  <li><strong>No .xmp presets</strong>: Lightroom presets do not import; .cube files do.</li>
  <li><strong>Prerequisites</strong>: a WebGL2 browser; preview capped at 4096 px on the long edge (export is not capped); the first RAW open downloads about 3.4 MB of decoder, cached afterwards.</li>
</ul>

<h2 id="pick">Pick by the job you have</h2>
<h3 id="one-raw">I just need to develop one RAW on a borrowed laptop</h3>
<p>The browser is the shortest path here: nothing to install, no sign-in, and no copying the card onto someone else's machine to install a trial. Open the <a href="/">editor</a>, drop the file in, develop it, apply a look, export the JPEG. The trade-off is its boundaries: the first RAW open needs a network connection to fetch the decoder, and what you leave with is a JPEG plus a merged .cube if you made one — not an .xmp that another app can keep editing from.</p>

<h3 id="batch">I have 200 RAW files to batch</h3>
<p>This tool is out of its depth here: no batch, no queue. This is desktop territory — Lightroom's catalogue and cloud sync are organised around groups of photos, and darktable and RawTherapee are full desktop RAW pipelines. If batch is a one-off, a free desktop tool covers it; if batch is your normal week, that is what a catalogue-based product is for.</p>

<h3 id="luts">I need to use Fujifilm or Kodak-style look LUTs</h3>
<p>Among the 64 built-in looks are Kodak, Fujifilm, Ricoh, Panasonic, Leica and Hasselblad-inspired recipes, with adjustable strength, a second slot for stacking and a merge into one .cube. One honest caveat: these are original recipes written to match the colour response of those styles, not vendor LUT data — close in look, not a byte-for-byte reproduction. Vendor LUTs do import, but they are built for log input: set the input profile to F-Log, F-Log2 or V-Log (a LUT whose name carries the tag is detected automatically) and the app re-encodes the frame with the published transfer function before the LUT runs. Gamut is still treated as sRGB, so the result is close but not byte-exact. Details are in the <a href="/en/guides/raw-in-browser">RAW-in-browser guide</a> and the <a href="/en/looks">look catalogue</a>.</p>

<h3 id="privacy">I do not want my photos uploaded</h3>
<p>Decoding, development and rendering all happen on this machine, and there is no upload endpoint. When judging another tool, ask where the processing happens: a browser app that renders locally or a desktop app that never touches a server is not the same category as a workflow built around a cloud library. If a photo must not pass through any third-party server, that constraint matters more than the feature list.</p>

<h2 id="faq">Three follow-up questions</h2>
${faqBody(ALT_FAQ_EN)}

<h2 id="verdict">The short answer</h2>
<p>If you need a library, batch or cross-device sync, there is no free browser replacement — use desktop software. If you need to develop one RAW, grade it and leave with a JPEG on whatever machine you are sitting at, a free browser tool is already enough, and it skips the install entirely.</p>`,
    faq: ALT_FAQ_EN,
  },
};
