import { howToLd, articleLd } from '../../site.mjs';

const ZH_STEPS = [
  ['拖入 RAW', '把 NEF / CR2 / CR3 / ARW / DNG / RAF 等文件拖进窗口，或者点左下角的 PHOTO。解码在本机 Web Worker 里完成，文件不会被上传。'],
  ['先看自动曝光', 'RAW 打开时会按场景亮度算一个曝光：95% 分位靠近传感器白，中间调留在约 0.39 白以下。曝光滑块是相对这个自动值的偏移，0 就是保持打开时的亮度，往左往右各 5 档。'],
  ['用色调面板显影', '白平衡与曝光在线性光下处理。六个色调滑块按这张照片自己实测的亮度分位数放置作用范围：高光收紧实测顶部、阴影打开实测下部且不抬黑场、白色/黑色只动各自端点、对比度绕实测中位数。曲线是单调的对数亮度映射，降高光压的是斜率而不是把亮部统一压成白。'],
  ['套一个 LUT', '64 款内置 look 可以调强度，也可以叠第二支，或者导入自己的 .cube。'],
  ['导出', '按源图长边的 50 / 75 / 100% 导出 JPEG，100% 用内存里的原始帧分块渲染。'],
];

const EN_STEPS = [
  ['Drop in a RAW', 'Drag a NEF / CR2 / CR3 / ARW / DNG / RAF into the window, or press PHOTO. Decoding happens in a Web Worker on your machine; the file is never uploaded.'],
  ['Start from auto exposure', 'A RAW opens with an exposure computed from the scene: the 95th percentile sits near sensor white and midtones stay below about 0.39 of white. The exposure slider is an offset from that baseline: 0 keeps the photo as opened, ±5 stops either way.'],
  ['Develop it', 'White balance and exposure operate in linear light. Every tone slider places its band from this photo\'s own measured EV percentiles: highlights compress the measured top, shadows open the measured bottom without lifting the black point, whites/blacks move only their own endpoints, contrast pivots on the measured median. The curve is a monotone log-luminance mapping, so pulling highlights down reduces the top slope instead of flattening the bright end into white.'],
  ['Apply a look', 'Pick one of 64 built-in looks, dial its strength, stack a second one, or import your own .cube.'],
  ['Export', 'Write a JPEG at 50 / 75 / 100 % of the source long edge. 100 % renders the in-memory full-resolution frame in tiles.'],
];

export default {
  slug: 'guides/raw-in-browser',
  hub: 'guides',
  kind: 'guide',
  priority: 0.9,
  changefreq: 'monthly',
  updated: '2026-11-20',
  readMinutes: 6,
  image: '/photos/develop-desktop.jpg',
  jsonLd: (lang) => [
    articleLd({
      lang,
      title: lang === 'zh' ? '在浏览器里打开 RAW 并显影' : 'How to open and develop a RAW file in the browser',
      description:
        lang === 'zh'
          ? '浏览器内 RAW 解码的原理、支持的相机格式、处理步骤与实测数据。'
          : 'How in-browser RAW decoding works, which camera formats are supported, the processing steps and measured numbers.',
      path: lang === 'zh' ? '/guides/raw-in-browser' : '/en/guides/raw-in-browser',
      image: '/photos/develop-desktop.jpg',
      updated: '2026-11-20',
      hub: lang === 'zh' ? '指南' : 'Guides',
    }),
    howToLd({
      lang,
      name: lang === 'zh' ? '在浏览器里处理 RAW 照片' : 'Develop a RAW photo in the browser',
      description:
        lang === 'zh'
          ? '不安装软件，在浏览器里打开 RAW、显影、套 LUT 并导出全分辨率 JPEG。'
          : 'Open, develop and grade a RAW file and export a full-resolution JPEG without installing anything.',
      image: '/photos/develop-desktop.jpg',
      totalTime: 'PT3M',
      steps: lang === 'zh' ? ZH_STEPS : EN_STEPS,
    }),
  ],
  zh: {
    title: '在浏览器里打开 RAW 并显影（不上传、不装软件）',
    description: '浏览器里直接打开 NEF/CR2/ARW/DNG 等 RAW：16 位显影、暗房面板、64 款 LUT、全分辨率导出，照片不上传。',
    kicker: '指南 · RAW',
    h1: '在浏览器里打开 RAW，并按暗房方式处理',
    lede: 'NEF、CR2、CR3、ARW、DNG、RAF 都可以直接拖进浏览器窗口。解码、显影、调色、导出全部在这台机器上完成，照片不需要上传到任何地方。',
    body: `<figure class="figure"><img src="/photos/develop-desktop.jpg" width="1600" height="1000" alt="LUT ARCHIVE 的色调面板：RAW 打开后显示白平衡、光线、偏好与降噪滑块" loading="lazy"><figcaption>色调面板：RAW 打开时是中性状态，LUT 不挡在中间；直方图跟随当前显影实时更新。</figcaption></figure>

<h2 id="why">浏览器为什么能做 RAW 显影</h2>
<p>RAW 处理本质上是一条数值管线：拆包、去马赛克、白平衡、色彩矩阵、色调映射、输出。这些步骤不需要桌面应用，现代浏览器两样能力就够了——WebAssembly 负责解码这类重计算，WebGL2 负责把 16 位场景线性数据实时映射到屏幕。</p>
<p>LUT ARCHIVE 把 <a href="https://github.com/ybouane/flashraw" rel="noopener">flashraw</a> 编译成 WebAssembly，在 Web Worker 里完成解包、AHD 去马赛克、相机白平衡和相机色彩矩阵。解码结果保留 16 位和 4 档高于白的场景余量，再编码成场景线性半浮点交给 GPU——这就是高光滑块能像 RAW 处理器一样工作、而不是像 JPEG 编辑器那样把白色压成灰的原因。</p>
<p>显示变换用的是 darktable 的 <a href="https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/sigmoid/" rel="noopener">sigmoid</a>（jandren，darktable 4.2 起合入），在 0…∞ 上单调、渐近逼近白点而不裁切，参数用闭式解拟合。<code>npm run test:tone:reference</code> 会用隔离配置调用 darktable 5.6.2，将合成的 128×512 线性 EV 阶梯渲染为 16 位 PNG，再逐像素比较；本机观测到的最大线性光误差为 0.0014772，测试容限 0.0016。它验证的是 sigmoid 曲线，不是完整相机 RAW 解码或 Lightroom Auto 的等价性。</p>
<p>默认打开 RAW 时会叠加“相机风格”：从文件里内嵌的相机 JPEG 取亮度分位，和中性显影的直方图对齐，拟合成一条单调的显示曲线，并匹配相机 JPEG 的平均色度与 RGB 平衡来校准饱和度和白平衡，让默认画面接近手机相册/相机成片；它也可以一键关闭回到中性显影。参考图就在 RAW 文件里，不需要用户提供截图。</p>
<p>色调滑块的作用位置来自照片自己：Worker 在解码时顺便对约 320 px 的无模糊场景 EV 图量出分位数（p0.1 到 p99.9，另含最小/最大值），主线程用这些锚点加六个滑块值算出两条 1024 项对数亮度曲线——一条按像素自身 EV 映射（曝光、对比度、白色、黑色），一条按引导图 EV 返回修正量（阴影、高光）。两条都在 CPU 上生成，单调性、最小斜率与端点隔离都有数值检查和单元测试；滑块为零时曲线是恒等映射，所以打开时校准好的基准画面完全不受影响。旧版这里是固定 EV 分段加一层 Local Laplacian 修正，固定分段在一张夜景上校准，换一张白天照片就会让“高光 −100”表现得像整体降曝光、把中间调压暗一档多；现在这个故障场景已经写成回归测试。降高光是在对数域降低亮部斜率，实拍上可以在不牺牲中间调的前提下把 p99 拉低 30–110 个 8 位灰阶，而不是把阈值以上压成一块平白。自动色调用同一套锚点：百分位启发式给出目标位置，再按实际渲染直方图求解滑块，并保证不比打开时更暗、不增加裁切。</p>

<h2 id="formats">支持哪些文件</h2>
<table>
  <thead><tr><th>类型</th><th>格式</th></tr></thead>
  <tbody>
    <tr><td>RAW · 尼康</td><td>NEF / NRW（含 HE、HE* 压缩） · <a href="/raw/nef">NEF 转 JPG 指南</a></td></tr>
    <tr><td>RAW · 佳能</td><td>CR2、CR3 · <a href="/raw/cr3">CR3 / CR2 转 JPG 指南</a></td></tr>
    <tr><td>RAW · 索尼</td><td>ARW、SRF、SR2 · <a href="/raw/arw">ARW 转 JPG 指南</a></td></tr>
    <tr><td>RAW · DNG</td><td>Adobe DNG、Apple ProRAW、手机与无人机 DNG · <a href="/raw/dng">DNG 转 JPG 指南</a></td></tr>
    <tr><td>RAW · 富士</td><td>RAF（X-Trans 与 Bayer 机身） · <a href="/raw/raf">RAF 转 JPG 指南</a></td></tr>
    <tr><td>RAW · 其他</td><td>ORF、RW2、PEF、SRW、3FR、ERF、KDC、MOS、IIQ、X3F</td></tr>
    <tr><td>普通图像</td><td>JPEG、PNG、WebP、AVIF、HEIC/HEIF、TIFF</td></tr>
    <tr><td>色彩查找表</td><td>.cube，3D（<code>LUT_3D_SIZE</code> 2–128）与 1D 都支持</td></tr>
  </tbody>
</table>
<p>五种常见格式各有一篇说明，讲清这个容器里装了什么、拆不开时会发生什么；总览在<a href="/raw/">格式指南</a>。如果某个 RAW 完全拆不开，会退回到文件里内嵌的相机 JPEG——包括解码器返回截断数据的 45 MP 级机型。这比显示半张黑图好，也比直接报错好。</p>

<h2 id="how">一次完整的处理流程</h2>
<ol>
  <li><strong>拖入文件。</strong>浏览器会显示解包、去马赛克、生成预览几个阶段，带实时进度，不是一块假动画。</li>
  <li><strong>看自动曝光。</strong>RAW 的自动曝光在场景域里算：95% 分位靠近传感器白，中间调不超过约 0.39 白，所以暗的室内会被提亮，而不是停留在灰蒙蒙的状态。AUTO 按钮可以关掉。</li>
  <li><strong>色调面板。</strong>白平衡与曝光在线性光下处理；RAW 高光/阴影由模糊亮度引导图决定作用范围，再叠加 Local Laplacian 局部修正，白色/黑色在显示变换后调整。吸管可以点取中性灰，预览和导出共享同一条管线。</li>
  <li><strong>套 LUT。</strong>64 款内置 look，强度可调，可以叠第二支；导入的 .cube 会存在浏览器本地，下次还在。</li>
  <li><strong>导出。</strong>按源图长边的 50 / 75 / 100% 写 JPEG；100% 用内存里的全分辨率帧分块渲染，绕过 GPU 纹理上限。</li>
</ol>

<h2 id="numbers">实测数据</h2>
<dl class="facts">
  <div><dt>26 MP NEF</dt><dd>约 1.2 秒解码成 5568×3712 线性帧</dd></div>
  <div><dt>预览</dt><dd>长边 4096 px，全分辨率帧留在内存里供导出</dd></div>
  <div><dt>色调验证</dt><dd>合成 EV 阶梯：最大线性误差 0.0014772，测试容限 0.0016</dd></div>
  <div><dt>上传</dt><dd>0 字节：文件只在本机读取</dd></div>
</dl>

<h2 id="limits">它不做什么</h2>
<p>这是一台单张处理的暗房，不是资产管理系统：没有图库、批量同步、云端目录，也没有 AI 蒙版。预览解码长边限制在 4096 px，因为把 20 MP 以上的线性帧整块传给 GPU 既慢又占显存；导出不受这个限制。第一次打开 RAW 需要下载约 3.4 MB 的解码器，之后会命中缓存。</p>
<p>如果你要的是一整套后期工作流（目录、批量、打印），桌面软件仍然更合适；如果你只想在任意一台电脑上把一张 RAW 调到满意并导出一张全分辨率 JPEG，浏览器已经够用。</p>`,
    faq: [
      ['浏览器处理 RAW 会泄露照片吗？', '不会。解码、显影、导出都在本机的 Web Worker 和 GPU 里完成，文件没有上传接口。唯一的网络请求是应用资源本身，以及用来选择界面语言的 /api/geo 国家查询。'],
      ['为什么预览只到 4096 px？', '更大尺寸的线性帧整块传 GPU 会明显变卡。预览限制在长边 4096 px，而导出时仍然使用内存里的全分辨率帧分块渲染，所以导出的 JPEG 是完整分辨率。'],
      ['支持 Lightroom 的预设吗？', '不支持 .xmp 预设。可以把 LUT 以 .cube 导入，或者用内置 look 加上色调面板自己调。'],
    ],
  },
  en: {
    title: 'Open and develop RAW files in the browser (no upload)',
    description: 'Open NEF/CR2/ARW/DNG in the browser: 16-bit scene-linear development, a darkroom panel, 64 LUT looks and full-resolution export. Nothing is uploaded.',
    kicker: 'GUIDE · RAW',
    h1: 'Open a RAW in the browser and develop it like a darkroom',
    lede: 'NEF, CR2, CR3, ARW, DNG and RAF files can be dropped straight into the browser window. Decoding, developing, grading and exporting all happen on this machine — the photo is never uploaded.',
    body: `<figure class="figure"><img src="/photos/develop-desktop.jpg" width="1600" height="1000" alt="The develop panel in LUT ARCHIVE with white balance, light, presence and noise reduction sliders" loading="lazy"><figcaption>The develop panel: a RAW opens neutral, with no look in the way, and the histogram follows the current development.</figcaption></figure>

<h2 id="why">Why a browser can develop a RAW</h2>
<p>RAW processing is a numeric pipeline: unpack, demosaic, white balance, colour matrix, tone map, output. None of that requires a desktop app. A modern browser brings the two capabilities that matter — WebAssembly for the heavy decoding, WebGL2 for mapping 16-bit scene-linear data to the screen at interactive speed.</p>
<p>LUT ARCHIVE compiles <a href="https://github.com/ybouane/flashraw" rel="noopener">flashraw</a> to WebAssembly and runs unpacking, AHD demosaicing, camera white balance and the camera colour matrix in a Web Worker. The decode keeps 16 bits and four stops of scene headroom above white, then re-encodes the frame as scene-linear half floats for the GPU. That headroom is why the highlights slider behaves like a raw processor rather than a JPEG editor: it compresses real above-white sensor data back into visible gradation instead of darkening pixels that were clipped before it ever saw them.</p>
<p>The display transform is darktable's <a href="https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/sigmoid/" rel="noopener">sigmoid</a> (jandren, merged for darktable 4.2): monotone on 0…∞, asymptotic to the white target instead of clipping, with parameters fitted in closed form. <code>npm run test:tone:reference</code> uses an isolated darktable 5.6.2 CLI to render a synthetic 128×512 linear EV ramp to a 16-bit PNG and compare decoded pixels; the observed maximum linear-light error is 0.0014772 (test limit 0.0016). This validates the sigmoid curve, not a full camera RAW decode or Lightroom's Auto algorithm.</p>
<p>Opening a RAW also applies a camera look by default: the luminance percentiles of the camera JPEG embedded in the file are matched against the neutral render, and one monotone display curve is fitted, together with the camera JPEG's mean chroma and RGB balance for saturation and white balance, so the photo opens close to the phone gallery / camera rendition. One click in the Develop header returns to the neutral development. The reference lives inside the RAW file, so no screenshots are needed.</p>
<p>RAW highlights and shadows act in two layers: a blurred luminance guide decides where the exposure-style change applies, and a multiscale Local Laplacian refinement is added on top. A Worker builds a roughly 320px scene-EV map, creates monotone remap pyramids at evenly spaced intensity references, and combines them with tent weights; the GPU adds that EV map at 45 % weight as a luminance ratio to the full-resolution linear RAW before sigmoid. The LLF term is deliberately not the whole response: measured on the night reference it moved the brightest 1 % of pixels by only about 0.5 EV (small bright regions are edges to the pyramid), so using it alone made the Highlights slider read as broken. The slider mapping is an engineering design, not Adobe's internal parameterization; Auto Tone remains a separate percentile heuristic, not a claimed Lightroom Auto clone. With the camera look on, Auto Tone keeps the camera exposure, uses the neutral-calibration result only as a one-way placement hint (open/brighten allowed, darkening not), and solves the shadows/highlights/whites/blacks sliders against the actual with-look rendered histogram; with the look off the calibrated neutral heuristic is unchanged.</p>

<h2 id="formats">What it opens</h2>
<table>
  <thead><tr><th>Type</th><th>Formats</th></tr></thead>
  <tbody>
    <tr><td>RAW · Nikon</td><td>NEF / NRW (including HE and HE* compression) · <a href="/en/raw/nef">NEF to JPG guide</a></td></tr>
    <tr><td>RAW · Canon</td><td>CR2, CR3 · <a href="/en/raw/cr3">CR3 / CR2 to JPG guide</a></td></tr>
    <tr><td>RAW · Sony</td><td>ARW, SRF, SR2 · <a href="/en/raw/arw">ARW to JPG guide</a></td></tr>
    <tr><td>RAW · DNG</td><td>Adobe DNG, Apple ProRAW, phone and drone DNG · <a href="/en/raw/dng">DNG to JPG guide</a></td></tr>
    <tr><td>RAW · Fujifilm</td><td>RAF (X-Trans and Bayer bodies) · <a href="/en/raw/raf">RAF to JPG guide</a></td></tr>
    <tr><td>RAW · others</td><td>ORF, RW2, PEF, SRW, 3FR, ERF, KDC, MOS, IIQ, X3F</td></tr>
    <tr><td>Images</td><td>JPEG, PNG, WebP, AVIF, HEIC/HEIF, TIFF</td></tr>
    <tr><td>Look-up tables</td><td>.cube, both 3D (<code>LUT_3D_SIZE</code> 2–128) and 1D</td></tr>
  </tbody>
</table>
<p>The five common formats each have a page of their own explaining what the container holds and what happens when a frame cannot be unpacked; <a href="/en/raw/">the format guides</a> list them. If a RAW cannot be unpacked at all, the app falls back to the camera JPEG embedded in the file — including 45 MP-class bodies whose frames the decoder returns truncated. That beats showing half a black frame, and it beats failing outright.</p>

<h2 id="how">One pass through the app</h2>
<ol>
  <li><strong>Drop the file in.</strong> Unpacking, demosaicing and preview generation each show a named stage with a live clock instead of a fake animation.</li>
  <li><strong>Check the auto exposure.</strong> For RAW it is computed in the scene domain: the 95th percentile sits near sensor white and midtones stay below about 0.39 of white, so a dim interior comes out lit instead of muddy. The AUTO button turns it off.</li>
  <li><strong>Develop.</strong> White balance and exposure operate in linear light; RAW highlights/shadows pick their range from a blurred luminance guide and add a Local Laplacian refinement, while whites/blacks adjust the displayed endpoints. The eyedropper picks a neutral, and preview/export share the same pipeline.</li>
  <li><strong>Apply a look.</strong> 64 built-in looks with adjustable strength, a second slot for stacking, and local .cube import that survives a reload in IndexedDB.</li>
  <li><strong>Export.</strong> JPEG at 50 / 75 / 100 % of the source long edge; 100 % renders the in-memory full-resolution frame in tiles, past the GPU texture limit.</li>
</ol>

<h2 id="numbers">Measured numbers</h2>
<dl class="facts">
  <div><dt>26 MP NEF</dt><dd>about 1.2 s to a 5568×3712 linear frame</dd></div>
  <div><dt>Preview</dt><dd>4096 px long edge; the full frame stays in memory for export</dd></div>
  <div><dt>Tone check</dt><dd>synthetic EV ramp: 0.0014772 max linear error; 0.0016 limit</dd></div>
  <div><dt>Upload</dt><dd>zero bytes — files are only read locally</dd></div>
</dl>

<h2 id="limits">What it does not do</h2>
<p>This is a single-frame darkroom, not an asset manager: no library, no batch sync, no cloud catalogue, no AI masks. The preview is capped at 4096 px on the long edge because pushing a 20 MP+ linear frame to the GPU wholesale is both slow and memory-hungry; export is not capped. The first RAW you open downloads about 3.4 MB of decoder, cached afterwards.</p>
<p>If you need a full post-production workflow — catalogues, batch processing, printing — desktop software is still the right tool. If you want to take one RAW, develop it to taste and leave with a full-resolution JPEG on whatever machine you are on, the browser is enough.</p>`,
    faq: [
      ['Does processing a RAW in the browser upload the photo?', 'No. Decoding, developing and export all happen in a local Web Worker and on the GPU; there is no upload endpoint. The only network requests are the app assets and a /api/geo country lookup used to pick the interface language.'],
      ['Why is the preview limited to 4096 px?', 'Sending a larger linear frame to the GPU as one texture is noticeably slower. The preview is capped at 4096 px on the long edge, while export still renders the in-memory full-resolution frame in tiles, so the JPEG is full resolution.'],
      ['Can I use Lightroom presets?', 'Not .xmp presets. Import a look as .cube, or build the grade with the built-in looks and the develop panel.'],
    ],
  },
};
