import { articleLd, orgLd } from '../../site.mjs';

export default {
  slug: 'about',
  kind: 'guide',
  hub: null,
  priority: 0.6,
  changefreq: 'monthly',
  updated: '2026-11-20',
  image: '/photos/home-desktop.jpg',
  jsonLd: (lang) => [
    orgLd(),
    articleLd({
      lang,
      title: lang === 'zh' ? '关于 LUT ARCHIVE' : 'About LUT ARCHIVE',
      description:
        lang === 'zh'
          ? '一个在浏览器里跑完整 RAW 管线的开放源代码照片编辑器。'
          : 'An open-source photo editor that runs a complete RAW pipeline in the browser.',
      path: lang === 'zh' ? '/about' : '/en/about',
      image: '/photos/home-desktop.jpg',
      updated: '2026-11-20',
      hub: lang === 'zh' ? '关于' : 'About',
    }),
  ],
  zh: {
    title: '关于 LUT ARCHIVE：浏览器里的 RAW 暗房',
    description: 'LUT ARCHIVE 是一个 MIT 开源、在本机处理照片的浏览器暗房：16 位 RAW 管线、64 款 LUT、无账号无上传。',
    kicker: '关于',
    h1: '一个跑在浏览器里的暗房',
    lede: 'LUT ARCHIVE 把 RAW 解码、显影和 LUT 调色全部放在浏览器里完成。没有后端渲染，没有账号，照片不离开你的设备。',
    body: `<p>它解决的是一类很具体的场景：你手上有一张 RAW，需要用一台不属于你的电脑处理，不想为了它装一整套桌面软件，也不愿意把照片传到网盘或在线工具里。打开网页、拖进文件、调完、导出，结束。</p>

<h2 id="pipeline">管线</h2>
<p>RAW 在 Web Worker 里解码：<a href="https://github.com/ybouane/flashraw" rel="noopener">flashraw</a> 编译成 WebAssembly，负责解包、AHD 去马赛克、相机白平衡和相机色彩矩阵。解码按 16 位并保留高于白的 4 档场景余量，再编码成场景线性的半浮点数据给 GPU。显示变换用 darktable 的 sigmoid，逐通道加保色相，参数闭式拟合。高光之所以能压回来，是因为那些数据在解码时就没有被丢掉。</p>
<p>曝光和白平衡在线性光下乘性调整。六个色调滑块不再是写死的公式：解码时 Worker 已经量出这张照片自己的 EV 分位数（p0.1 到 p99.9），滑块的作用位置就落在实测区域上——高光在实测 p75 以上收紧，阴影以实测下四分位为中心并在实测 p1 处锁住黑场，白色/黑色只动各自那一端的实测范围，对比度绕实测中位数做斜率。全局与局部两条曲线在 CPU 上生成成 1024 项对数亮度 LUT（着色器按像素 EV 与引导图 EV 分别采样再相加），单调性和最小局部斜率都有数值保证，因此任何滑块组合都不会把画面折叠成色带；滑块为零时曲线是恒等映射，打开时校准好的基准画面不受影响。RAW 解码保留的 4 档高于白的余量也在这里被用于高光压缩：降高光是降低对数域的斜率，而不是把阈值以上统一压成同一块白。</p>
<p>自动色调用同一套实测锚点：相机风格开启时保留相机曝光，用百分位启发式给出目标位置，再按实际渲染直方图求解阴影/高光/白色/黑色滑块（不宣称复刻 Lightroom Auto）。曝光滑块是相对“打开时自动曝光”的偏移，0 表示保持打开时的亮度。预览和导出共用同一条管线，100% 导出以分块方式读取内存里的全分辨率帧。</p>

<h2 id="looks">LUT</h2>
<p>内置的 64 款 look 来自 <code>scripts/looks.mjs</code> 里的原始配方，生成 33³ 的立方体，打包时按行存差值再 gzip，整个包 1.34 MB，用到哪支解哪支。同一批 look 也以标准 <code>.cube</code> 文件形式放在仓库里，可以直接拿到 Resolve、Premiere、Photoshop 里用。它们是对相应胶片或相机风格的近似，不是厂商发布的 LUT 数据。</p>

<h2 id="limits">边界</h2>
<ul>
  <li>单张处理：没有图库、目录、批量套用和云端同步。</li>
  <li>预览解码长边 4096 px；导出不受此限制。</li>
  <li>需要 WebGL2。老设备或禁用了硬件加速的浏览器会退回提示页。</li>
  <li>不支持 Lightroom 的 <code>.xmp</code> 预设，支持 <code>.cube</code> LUT。</li>
  <li>第一次打开 RAW 需要下载约 3.4 MB 的解码器，之后由浏览器缓存。</li>
</ul>

<h2 id="open">开源</h2>
<p>项目以 MIT 协议开源，源码在 <a href="https://github.com/shisongsong/lut-studio" rel="noopener">github.com/shisongsong/lut-studio</a>。觉得哪里不对可以直接改，或者提 issue。隐私处理的细节写在 <a href="/privacy">隐私政策</a> 里，处理流程写在 <a href="/guides/raw-in-browser">RAW 指南</a> 里。</p>`,
    faq: [
      ['LUT ARCHIVE 收费吗？', '不收费，也没有付费墙和账号。项目是 MIT 开源的，全部功能在浏览器本地运行。'],
      ['照片会被保存吗？', '不会。应用没有上传接口，照片只在本机内存、GPU 和浏览器的本地存储（你导入的 LUT）里存在。'],
    ],
  },
  en: {
    title: 'About LUT ARCHIVE: a RAW darkroom in the browser',
    description: 'LUT ARCHIVE is a MIT-licensed browser darkroom that develops photos locally: a 16-bit RAW pipeline, 64 LUT looks, no account and no upload.',
    kicker: 'ABOUT',
    h1: 'A darkroom that runs in the browser',
    lede: 'LUT ARCHIVE does RAW decoding, development and LUT grading entirely in the browser. There is no server-side rendering, no account, and the photo never leaves your device.',
    body: `<p>It exists for one specific situation: you have a RAW, you are on a machine that is not yours, you do not want to install a whole desktop application for one photo, and you would rather not upload it to a cloud drive or an online converter. Open the page, drop the file in, develop it, export it.</p>

<h2 id="pipeline">Pipeline</h2>
<p>The RAW is decoded in a Web Worker: <a href="https://github.com/ybouane/flashraw" rel="noopener">flashraw</a> compiled to WebAssembly handles unpacking, AHD demosaicing, camera white balance and the camera colour matrix. The decode keeps 16 bits and four stops of scene headroom above white, then re-encodes the frame as scene-linear half floats for the GPU. The display transform is darktable's sigmoid, applied per channel with hue preservation and a closed-form parameter fit. Highlights can be recovered because that data was never discarded during decoding.</p>
<p>Exposure and white balance multiply the scene-linear RAW data. The six tone sliders are not fixed formulas: while decoding, the Worker already measures this photo's own EV percentiles (p0.1 to p99.9), and each slider places its band in that measured range — highlights tighten above the measured p75, shadows open around the measured lower quartile with the black point locked at the measured p1, whites/blacks move only their own measured ends, contrast pivots on the measured median. The global and local curves are built on the CPU as 1024-entry log-luminance LUTs (the shader samples the pixel EV and the blurred guide EV and adds both), and monotonicity plus a minimum local slope are enforced numerically, so no slider combination can fold the image into banded tones. At zero the curve is the identity, which leaves the calibrated base rendering untouched. The four stops of headroom kept by the decode are used here for highlight compression: lowering highlights reduces the log-domain slope rather than clamping everything above a threshold to one white.</p>
<p>Auto Tone uses the same measured anchors: it takes a target placement from a percentile heuristic, then solves shadows/highlights/whites/blacks against the actual rendered histogram and never darkens or further clips the frame. The exposure slider is an offset from the as-opened auto exposure (0 keeps the baseline). At 100 % the export renders the in-memory full-resolution frame in tiles, so the JPEG matches the displayed pipeline.</p>

<h2 id="looks">LUTs</h2>
<p>The 64 built-in looks come from the original recipes in <code>scripts/looks.mjs</code>, baked to 33³ cubes and packed as per-row deltas plus gzip: 1.34 MB for the whole pack, decoded per look on demand. The same looks ship as standard <code>.cube</code> files in the repository, ready for Resolve, Premiere or Photoshop. They approximate the named film stocks and camera profiles; they are not vendor-published LUT data.</p>

<h2 id="limits">Limits</h2>
<ul>
  <li>Single-image processing: no library, catalogue, batch apply or cloud sync.</li>
  <li>The preview decodes at 4096 px on the long edge; export is not capped.</li>
  <li>WebGL2 is required. Old hardware, or a browser with hardware acceleration disabled, gets an explanatory page instead.</li>
  <li>Lightroom <code>.xmp</code> presets are not supported; <code>.cube</code> LUTs are.</li>
  <li>The first RAW open downloads about 3.4 MB of decoder, cached by the browser afterwards.</li>
</ul>

<h2 id="open">Open source</h2>
<p>The project is MIT-licensed and the source lives at <a href="https://github.com/shisongsong/lut-studio" rel="noopener">github.com/shisongsong/lut-studio</a>. Change whatever is wrong, or open an issue. The privacy details are in the <a href="/en/privacy">privacy policy</a>, and the processing steps are in the <a href="/en/guides/raw-in-browser">RAW guide</a>.</p>`,
    faq: [
      ['Is LUT ARCHIVE free?', 'Yes. There is no paywall and no account; the project is MIT-licensed and everything runs locally in the browser.'],
      ['Are my photos stored anywhere?', 'No. There is no upload endpoint. Photos exist only in local memory, on the GPU, and in browser-local storage for LUTs you import yourself.'],
    ],
  },
};
