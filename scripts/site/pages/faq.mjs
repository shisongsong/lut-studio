import { articleLd } from '../../site.mjs';

const FAQ_ZH = [
  [
    '照片会被上传到服务器吗？',
    `<p>不会。RAW 解码在本机的 Web Worker 里完成，显影和渲染在 GPU 上完成，文件只在本机读取，没有上传接口。整站只有两类网络请求：应用自身的静态资源，以及用来选择初始界面语言的 <code>/api/geo</code> 国家码查询。没有账号系统，也没有统计或跟踪 Cookie，细节写在<a href="/privacy">隐私说明</a>里。</p>`,
  ],
  [
    '支持哪些 RAW 格式？',
    `<p>NEF / NRW（含 HE、HE* 压缩）、CR2、CR3、ARW、SRF、SR2、DNG、RAF、ORF、RW2、PEF、SRW、3FR、ERF、KDC、MOS、IIQ、X3F。普通的 JPEG、PNG、WebP、AVIF、HEIC/HEIF、TIFF 也能打开。如果某个 RAW 完全拆不开，会退回到文件里内嵌的相机 JPEG，而不是显示半张黑图。</p>`,
  ],
  [
    '真的免费吗？用什么许可证？',
    `<p>免费，也不需要注册。代码以 MIT 许可证开源，<a href="https://github.com/shisongsong/lut-studio" rel="noopener">源码在 GitHub 上</a>，可以自己读、自己部署。没有订阅，也没有需要付费才能解锁的功能。</p>`,
  ],
  [
    'LUT 是什么？内置 LUT 用多大尺寸？',
    `<p>LUT 是一张“输入颜色对应输出颜色”的查找表，等于把一条调色固化下来，套用时比重新调一遍滑块更快，也更容易带到别的软件里。内置的 64 款 look 打包成 33×33×33：每个通道 33 级，共 35,937 个节点，相对原始配方是精确的。我们也测过更小的尺寸——17³ 平均误差 0.226 级（满量程 255，最大 20.8），21³ 平均 0.182（最大 11.6），25³ 平均 0.128（最大 11.3）；再往上到 65³ 只是把体积放大几十倍，看不出差别。全部 look 在 <a href="/looks">LUT 目录</a>里。</p>`,
  ],
  [
    '可以导入自己的 .cube 文件吗？',
    `<p>可以。3D LUT（<code>LUT_3D_SIZE</code> 2–128）和 1D LUT 都支持，1D 会烘焙到 3D 网格上，带 UTF-8 BOM 的文件也能正常读。文件在本机解析，不经过服务器；导入后出现在“我的 LUT”里，关掉页面再打开还在。</p>`,
  ],
  [
    '双 LUT 和合并功能是干什么用的？',
    `<p>两个槽位可以各放一款 look、各自调强度，比如一层偏冷的胶片底子加一层很轻的高光暖色。调好之后，合并会按渲染时的规则 <code>mix(v, lut(v), strength)</code>（每个槽位各算一次）把两层烘焙成一个 33³ LUT，存进“我的 LUT”，并下载成 .cube（35,937 行）；拿到 Premiere、Resolve 或其他支持 .cube 的软件里，看到的就是同一套颜色。</p>`,
  ],
  [
    '为什么厂商 LUT 需要 F-Log / V-Log？',
    `<p>富士、松下等厂商发布的 LUT 是按 log 编码的画面做的：输入不是普通显示图，而是把高光压进码值范围的 log 信号，直接套在 sRGB 画面上颜色会偏。这个工具提供 sRGB / F-Log / F-Log2 / V-Log 输入配置：选对应项后，画面先用厂商公布的传递函数重新编码，再让 LUT 运行；名字里带 F-Log 或 V-Log 的 LUT 会自动识别。色域仍按 sRGB 处理，所以结果接近，但不是逐字节复刻。原理见<a href="/guides/raw-in-browser">浏览器 RAW 指南</a>。</p>`,
  ],
  [
    '导出得到什么？',
    `<p>JPEG，按源图长边的 50 / 75 / 100% 三档输出，质量分别是 0.90 / 0.95 / 0.98。选 100% 时，用内存里的全分辨率帧分块渲染，可以超过 GPU 纹理上限，不会偷偷缩图。导出的是已经应用了显影和 LUT 的成品；没有 TIFF 或 DNG 输出。</p>`,
  ],
  [
    '手机上能用吗？',
    `<p>能。编辑器有窄屏布局，在支持 WebGL2 的手机浏览器里可以运行；如果设备或浏览器不支持 WebGL2，编辑器渲染不了。手机上用不到键盘快捷键，切换 look、导出都在界面按钮上。界面语言按国家自动选择，也可以在工具栏切换中英文。</p>`,
  ],
  [
    '能离线用吗？',
    `<p>没有“离线模式”开关，实际能不能用取决于浏览器缓存。第一次访问要联网加载应用资源，第一次打开 RAW 还要下载约 3.4 MB 的解码器；这些资源被浏览器缓存下来之后，断网再打开同一台机器上的页面通常还能继续用，前提是缓存没有被清掉。清空缓存、换浏览器或换设备之后，需要重新联网下载一次。</p>`,
  ],
  [
    '有图库或者批量模式吗？',
    `<p>没有。这是一个单张编辑器：一次处理一张照片，没有目录、评分、关键字、批量队列，也没有云同步。要做批量或长期图库，桌面软件更合适，<a href="/alternatives/lightroom-web">与 Lightroom 的对比</a>里写了它在哪里停下来。</p>`,
  ],
  [
    '导入的 LUT 存在哪里？',
    `<p>存在浏览器的 IndexedDB 里，归在“我的 LUT”名下；合并出来的 LUT 也存在同一处，界面偏好则放在 localStorage。它们不会上传，也不会在设备之间同步。清空站点数据会一起清掉，所以想保留合并好的 look，记得下载成 .cube 存到本地。</p>`,
  ],
];

const FAQ_EN = [
  [
    'Does it upload my photos?',
    `<p>No. RAW decoding runs in a Web Worker on this machine, development and rendering happen on the GPU, and files are only read locally — there is no upload endpoint. The only network requests are the app's own assets and an <code>/api/geo</code> country lookup used to choose the initial interface language. There is no account system and no analytics or tracking cookies; the <a href="/en/privacy">privacy note</a> has the details.</p>`,
  ],
  [
    'Which RAW formats can it open?',
    `<p>NEF / NRW (including HE and HE* compression), CR2, CR3, ARW, SRF, SR2, DNG, RAF, ORF, RW2, PEF, SRW, 3FR, ERF, KDC, MOS, IIQ and X3F. It also opens JPEG, PNG, WebP, AVIF, HEIC/HEIF and TIFF. If a RAW cannot be unpacked at all, the camera JPEG embedded in the file is used instead of showing half a black frame.</p>`,
  ],
  [
    'Is it really free, and under what license?',
    `<p>Yes, and there is no sign-up. The code is MIT-licensed and published <a href="https://github.com/shisongsong/lut-studio" rel="noopener">on GitHub</a>, so you can read it or deploy your own copy. There is no subscription and no paid tier.</p>`,
  ],
  [
    'What is a LUT, and what size are the built-in ones?',
    `<p>A LUT is a look-up table mapping input colour to output colour: a grade frozen into data, so applying it is faster and more portable than recreating a series of slider moves. The 64 built-in looks ship as a 33×33×33 pack — 33 steps per channel, 35,937 entries — which is exact against the authored recipes. Smaller sizes were measured too: 17³ has a mean error of 0.226 levels out of 255 (maximum 20.8), 21³ a mean of 0.182 (max 11.6), 25³ a mean of 0.128 (max 11.3); going up to 65³ would multiply the storage for no visible gain. The full list is in the <a href="/en/looks">look catalogue</a>.</p>`,
  ],
  [
    'Can I import my own .cube files?',
    `<p>Yes. 3D LUTs (<code>LUT_3D_SIZE</code> 2–128) and 1D LUTs are supported; 1D tables are baked onto a 3D grid, and a UTF-8 BOM is tolerated. Files are parsed locally and never uploaded, and they appear under “My LUTs”, where they survive a reload.</p>`,
  ],
  [
    'What are the dual-LUT and merge features for?',
    `<p>The two slots each hold a look with its own strength — a cool film base under a light warm highlight tint, for example. When the stack looks right, merge bakes both layers into one 33³ LUT using the same rule the renderer uses, <code>mix(v, lut(v), strength)</code> per slot, saves it under My LUTs and downloads it as a .cube (35,937 rows) that works in Premiere, Resolve or any other .cube-capable app.</p>`,
  ],
  [
    'Why do vendor LUTs need F-Log or V-Log?',
    `<p>Vendor LUTs from Fujifilm, Panasonic and others are built for a log-encoded image: the input is not a normal display picture but a signal that packs highlights into a code range, so applying one directly to an sRGB image shifts colours. The app has sRGB, F-Log, F-Log2 and V-Log input profiles: choose the matching one and the frame is re-encoded with the published transfer function before the LUT runs. A LUT whose name carries F-Log or V-Log is detected automatically. Gamut is still treated as sRGB, so results are close but not byte-exact. The <a href="/en/guides/raw-in-browser">RAW-in-browser guide</a> covers the pipeline in detail.</p>`,
  ],
  [
    'What does export give me?',
    `<p>A JPEG at 50 / 75 / 100 % of the source long edge, at quality 0.90 / 0.95 / 0.98 respectively. The 100 % option renders the in-memory full-resolution frame in tiles, so it can go past the GPU texture limit instead of quietly downscaling. The export includes the development and the LUT; there is no TIFF or DNG output.</p>`,
  ],
  [
    'Does it work on a phone?',
    `<p>Yes. The editor has a narrow-screen layout and runs in a phone browser that supports WebGL2; if the device or browser does not support WebGL2, the editor cannot render. Keyboard shortcuts do not apply on a phone — switching looks and exporting are on-screen controls. The interface is Chinese and English, auto-selected by country and switchable from the toolbar.</p>`,
  ],
  [
    'Does it work offline?',
    `<p>There is no offline-mode switch, so what happens depends on the browser cache. The first visit needs a connection to load the app assets, and the first RAW open downloads about 3.4 MB of decoder. Once those resources are committed to the browser cache, reopening the page without a connection will usually still load — provided the cache has not been cleared. After a cache clear, or on a different browser or device, they have to be downloaded again.</p>`,
  ],
  [
    'Is there a library or a batch mode?',
    `<p>No. This is a single-frame editor: one photo at a time, with no catalogue, ratings, keywords, batch queue or sync. For batch processing or a long-term library, desktop software is the right category; the <a href="/en/alternatives/lightroom-web">Lightroom comparison</a> explains where this tool stops.</p>`,
  ],
  [
    'Where do imported LUTs get stored?',
    `<p>In the browser's IndexedDB, under “My LUTs”; merged LUTs are kept in the same place, and interface preferences live in localStorage. They are not uploaded and do not sync between devices. Clearing site data removes them, so download a .cube if you want to keep a merged look.</p>`,
  ],
];

const faqBody = (items) =>
  `<div class="faq">${items
    .map(
      ([question, answer], index) =>
        `<details${index === 0 ? ' open' : ''}><summary>${question}</summary><div class="a">${answer}</div></details>`
    )
    .join('\n')}</div>`;

export default {
  slug: 'faq',
  hub: null,
  kind: 'guide',
  priority: 0.6,
  changefreq: 'monthly',
  updated: '2026-11-19',
  readMinutes: 6,
  image: '/photos/home-desktop.jpg',
  jsonLd: (lang) => [
    articleLd({
      lang,
      title: lang === 'zh' ? 'LUT ARCHIVE 常见问题' : 'LUT ARCHIVE FAQ',
      description:
        lang === 'zh'
          ? '关于浏览器 RAW 编辑器最常被问到的 12 个问题：上传、格式、LUT 尺寸、.cube 导入、log 输入、导出、手机、离线、批量与许可证。'
          : 'Twelve answers about the browser RAW editor: uploads, formats, LUT size, .cube import, log input, export, phones, offline use, batch and license.',
      path: lang === 'zh' ? '/faq' : '/en/faq',
      image: '/photos/home-desktop.jpg',
      updated: '2026-11-19',
      hub: lang === 'zh' ? '常见问题' : 'FAQ',
    }),
  ],
  zh: {
    title: '常见问题：RAW 格式、LUT、隐私、离线与开源许可',
    description: '关于这个浏览器 RAW 编辑器最常被问到的 12 个问题：照片会不会上传、能打开哪些格式、LUT 多大、能否离线、导出得到什么，以及它做不到的事。',
    kicker: '常见问题',
    h1: '使用之前，你大概会问的 12 个问题',
    lede: '照片去了哪里、能打开哪些文件、LUT 有多精确、断网还能不能用——这一页按实际实现回答，也把做不到的部分一起说清楚。',
    body: `<p>这一页把使用前最常被问到的 12 个问题一次答完：照片会不会上传、能打开哪些 RAW、LUT 用多大尺寸、能不能离线、导出得到什么、手机上能不能用。答案按实际实现写，包括它做不到的部分。</p>
<p>想先看它怎么工作，读<a href="/guides/raw-in-browser">在浏览器里打开 RAW</a>；想比较桌面软件，看<a href="/alternatives/lightroom-web">与 Lightroom 的对比</a>。</p>
<h2 id="questions">问题与答案</h2>
${faqBody(FAQ_ZH)}`,
    faq: FAQ_ZH,
  },
  en: {
    title: 'FAQ: RAW formats, LUT size, privacy, offline use and license',
    description: 'Twelve answers about the browser RAW editor: uploads, supported RAW formats, LUT size, .cube import, log input, export, phones, offline use, batch and license.',
    kicker: 'FAQ',
    h1: 'The twelve questions people ask before using it',
    lede: 'Where the photo goes, which files it opens, how exact the LUTs are, whether it still works without a connection — answered from what is actually implemented, including what it does not do.',
    body: `<p>This page answers the twelve questions that come up before using it: whether photos are uploaded, which RAW files it opens, what size the LUTs are, whether it works offline, what export produces and whether it runs on a phone. The answers describe what is actually implemented, including what it cannot do.</p>
<p>To see how it works first, read <a href="/en/guides/raw-in-browser">opening a RAW in the browser</a>; to compare it with desktop software, read the <a href="/en/alternatives/lightroom-web">Lightroom comparison</a>.</p>
<h2 id="questions">Questions and answers</h2>
${faqBody(FAQ_EN)}`,
    faq: FAQ_EN,
  },
};
