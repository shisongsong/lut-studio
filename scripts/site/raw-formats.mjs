/**
 * Per-format RAW → JPG landing pages.
 *
 * Five thin page modules — `pages/raw-nef.mjs`, `raw-cr3`, `raw-arw`, `raw-dng`,
 * `raw-raf` — call `rawFormatPage()` and pass only what is specific to their
 * container: the extensions the page covers, the brand, one paragraph of
 * format facts and the format-specific questions. The factory owns everything
 * that must not drift between the five pages: the answer paragraph, the
 * measured description of the decode pipeline, the embedded-JPEG fallback, the
 * limits list and the cross-links.
 *
 * The pipeline wording and the numbers are the ones already published on
 * `/guides/raw-in-browser` (and in `scripts/site/BRIEF.md`): 16-bit decode with
 * four stops of scene headroom, scene-linear WebGL2 render, darktable sigmoid
 * display transform, then the 64 looks. Do not add measurements here that the
 * brief does not carry.
 */
import { articleLd, howToLd, pagePath } from '../site.mjs';

const UPDATED = '2026-11-25';
const IMAGE = '/photos/develop-desktop.jpg';
const HUB = { zh: '格式', en: 'Formats' };

// The five pages cross-link each other; the factory drops the current page.
const SIBLINGS = [
  { ext: 'nef', zh: 'NEF（尼康）', en: 'NEF (Nikon)' },
  { ext: 'cr3', zh: 'CR3 / CR2（佳能）', en: 'CR3 / CR2 (Canon)' },
  { ext: 'arw', zh: 'ARW / SRF / SR2（索尼）', en: 'ARW / SRF / SR2 (Sony)' },
  { ext: 'dng', zh: 'DNG（Adobe / ProRAW / 手机）', en: 'DNG (Adobe / ProRAW / phones)' },
  { ext: 'raf', zh: 'RAF（富士 X-Trans）', en: 'RAF (Fujifilm X-Trans)' },
];

/** zh lives at the root, English under /en. Used for every internal link. */
const link = (lang, path) => (lang === 'zh' || path === '/' ? path : `/en${path}`);

/** Shared HowTo steps: open → develop with the tone/LUT panel → export. */
const stepsFor = (lang, extNames) =>
  lang === 'zh'
    ? [
        [
          '打开文件',
          `把 ${extNames} 拖进浏览器窗口，或点左下角的 PHOTO 选文件；解码在本机 Web Worker 里完成，文件不上传。`,
        ],
        [
          '显影、套 look',
          '用色调面板调白平衡、曝光、高光与阴影，再在 64 款内置 look 里选一款（强度可调，也能叠加第二款）。',
        ],
        [
          '导出全分辨率 JPEG',
          '按源图长边的 50 / 75 / 100% 导出；100% 用内存里的全分辨率帧分块渲染，和屏幕共用同一条管线。',
        ],
      ]
    : [
        [
          'Open the file',
          `Drop the ${extNames} into the browser window or press PHOTO. Decoding runs in a Web Worker on your machine; the file is never uploaded.`,
        ],
        [
          'Develop and grade',
          'Set white balance, exposure, highlights and shadows in the develop panel, then choose one of the 64 built-in looks (adjustable strength, optional second slot).',
        ],
        [
          'Export a full-resolution JPEG',
          'Export at 50 / 75 / 100 % of the source long edge; 100 % renders the in-memory full-resolution frame in tiles through the same pipeline as the screen.',
        ],
      ];

/** Questions every format page answers the same way (format-agnostic facts). */
const sharedFaq = (lang) =>
  lang === 'zh'
    ? [
        [
          '在浏览器里打开 RAW 会上传照片吗？',
          '不会。解码在本机的 Web Worker 里完成，显影和渲染在 GPU 上完成，文件只在本机读取，没有上传接口。唯一的网络请求是应用自身的静态资源，以及用来选择界面语言的 /api/geo 国家查询。',
        ],
        [
          '导出的 JPG 和相机内嵌的 JPEG 一样吗？',
          '正常路径不一样：导出的是解码后的 16 位线性帧，经 sigmoid 显示变换和可选的 LUT 渲染；相机 JPEG 只在某一帧拆不开时作为回退。回退时拿到的就是相机当时那张 JPEG，可以继续调色和导出，但里面没有高于白的场景数据。',
        ],
        [
          '和 Lightroom 导出的 JPG 结果一样吗？',
          '不是同一个实现。这里是一条独立的管线：16 位解码、darktable sigmoid 显示变换、LUT 排在显示变换之后；没有 Lightroom 的目录、蒙版和相机配置文件，所以结果不会逐像素一致。',
        ],
        [
          '浏览器需要满足什么条件？',
          '需要支持 WebGL2 的浏览器（Chrome、Edge、Safari、Firefox 的较新版本）。第一次打开 RAW 要下载约 3.4 MB 的解码器，之后从浏览器缓存加载；不支持 WebGL2 的设备上编辑器无法渲染。',
        ],
      ]
    : [
        [
          'Does opening a RAW here upload the photo?',
          'No. Decoding runs in a Web Worker on this machine, development and rendering happen on the GPU, and the file is only read locally — there is no upload endpoint. The only network requests are the app assets and a /api/geo country lookup used to choose the interface language.',
        ],
        [
          'Is the exported JPEG the camera JPEG inside the file?',
          'Normally no: export renders the decoded 16-bit linear frame through the display transform and any look. The embedded camera JPEG is only used when a frame cannot be unpacked; then you get the camera’s own JPEG, which can still be edited and exported but carries no above-white scene data.',
        ],
        [
          'Is the result the same as a Lightroom JPEG export?',
          'No, it is a different implementation: a 16-bit decode, darktable’s sigmoid display transform, and LUTs applied after the display transform, with no catalogue, masks or camera profiles. The result is not pixel-identical.',
        ],
        [
          'What does the browser need to support?',
          'A WebGL2-capable browser (a recent Chrome, Edge, Safari or Firefox). The first RAW open downloads about 3.4 MB of decoder, cached afterwards; without WebGL2 the editor cannot render.',
        ],
      ];

function bodyFor(lang, { primary, extNames, also, note, extra }) {
  const siblings = SIBLINGS.filter((s) => s.ext !== primary.toLowerCase())
    .map((s) => `<a href="${link(lang, `/raw/${s.ext}`)}">${s[lang]}</a>`)
    .join(' · ');

  if (lang === 'zh') {
    return `<h2 id="answer">${primary} 在浏览器里打开，不安装也不上传</h2>
<p>把 ${extNames} 拖进浏览器窗口——或者点左下角的 <code>PHOTO</code> 选文件——画面就出来了。解码在 Web Worker 里完成，显影和渲染在 GPU 上完成，照片没有被上传到任何服务器，也没有账号、邮箱或“上传后转换”的步骤。调好之后按导出，得到的是一张全分辨率 JPEG。</p>
<p>它也不依赖电脑上装了什么 RAW 编解码器：解码器是随页面加载的 WebAssembly 模块。所以换一台电脑、用一个受限的公司账号，或者临时借来的机器，处理同一个文件的结果都一样。第一次打开 RAW 要下载约 3.4 MB 的解码器，之后由浏览器缓存。</p>

<h2 id="format">${primary} 是什么文件</h2>
${note}
<p>${also}</p>
${extra || ''}

<h2 id="pipeline">打开之后，这段 RAW 经历了什么</h2>
<p>解码器（<a href="https://github.com/ybouane/flashraw" rel="noopener">flashraw</a> 编译成 WebAssembly）在 Web Worker 里完成解包、去马赛克、相机白平衡和相机色彩矩阵。结果按 16 位解码，并保留 4 档高于白的场景余量，再编码成场景线性半浮点交给 GPU；WebGL2 负责把这份线性数据实时映射到屏幕。这份高于白的余量，是高光滑块能像 RAW 处理器一样工作、而不是像 JPEG 编辑器那样把白色压成灰的原因。</p>
<p>显示变换用 darktable 的 <a href="https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/sigmoid/" rel="noopener">sigmoid</a>（jandren，darktable 4.2 起合入）：在 0…∞ 上单调、渐近逼近白点而不裁切，逐通道计算并保留色相，参数用闭式解拟合。仓库里的 <code>npm run test:tone:reference</code> 用隔离配置调用 darktable 5.6.2，把合成的 128×512 线性 EV 阶梯渲染成 16 位 PNG 再逐像素比较；本机观测到的最大线性光误差为 0.0014772（测试容限 0.0016）。它验证的是 sigmoid 曲线，不是完整相机 RAW 解码或 Lightroom Auto 的等价性。</p>
<p>64 款内置 look 排在显示变换之后：LUT 读到的已经是显示空间的值，它改变颜色和对比关系，但不负责把高光救回来。每个阶段的细节和实测数字，读<a href="${link('zh', '/guides/raw-in-browser')}">在浏览器里打开 RAW</a>这篇指南。</p>

<h2 id="fallback">拆不开的帧：会退到内嵌 JPEG</h2>
<p>不是每个文件都能完整解开。如果解码器无法解包，或者返回的是截断的帧，页面不会给你半张黑图，也不会直接失败：它改用文件里内嵌的相机 JPEG。你仍然可以调色、套 look、导出 JPEG，但那是相机当时的 JPEG，不是 16 位线性显影，高于白的部分已经按相机的显示曲线压过一遍。</p>
<p>这就是两条路径的差别：能解码时，编辑和导出都基于真实的场景线性数据；回退时，起点是相机已经处理过的 JPEG。这里不隐藏回退，也不把它说成“完整解码”——文件能不能解开，由文件本身和当前解码器决定。</p>

<h2 id="limits">可以做什么，不能做什么</h2>
<p>可以：打开单张 RAW、按上面的管线显影、套一款内置 look 或叠加第二款、导出全分辨率 JPEG。</p>
<ul>
  <li><strong>一次一张。</strong>没有批量队列，没有图库、评分、关键字和云端目录。</li>
  <li><strong>需要 WebGL2。</strong>不支持 WebGL2 的设备上编辑器无法渲染，这不是降级到慢速 CPU 渲染的问题。</li>
  <li><strong>不支持 .xmp 预设。</strong>能导入的是标准 .cube LUT。</li>
  <li><strong>预览长边 4096 px。</strong>导出不受这个限制：用内存里的全分辨率帧分块渲染。</li>
  <li><strong>第一次打开 RAW 要下载约 3.4 MB 的解码器</strong>，之后走浏览器缓存。</li>
</ul>

<h2 id="next">相关页面</h2>
<ul>
  <li><a href="${link('zh', '/guides/raw-in-browser')}">在浏览器里打开 RAW：完整流程与实测数据</a></li>
  <li><a href="${link('zh', '/download')}">下载全部 64 款 LUT 的 .cube 包</a></li>
  <li><a href="${link('zh', '/looks')}">64 款内置 LUT 一览</a></li>
  <li><a href="${link('zh', '/raw/')}">全部五种格式指南（NEF / CR3 / ARW / DNG / RAF）</a></li>
  <li><a href="${link('zh', '/faq')}">常见问题：格式、隐私、导出与离线</a></li>
  <li><a href="/">打开编辑器，直接拖入 ${primary}</a></li>
</ul>
<p>其他格式：${siblings}。</p>`;
  }

  return `<h2 id="answer">Open a ${primary} in the browser — no install, no upload</h2>
<p>Drop the ${extNames} into the browser window — or press <code>PHOTO</code> in the bottom-left corner — and the picture appears. Decoding runs in a Web Worker, development and rendering happen on the GPU, and the photo is never uploaded to a server: there is no account, no email and no “upload to convert” step. When the grade looks right, export a full-resolution JPEG.</p>
<p>It also does not depend on a raw codec installed on the computer: the decoder is a WebAssembly module loaded with the page. So a different laptop, a locked-down work account or a borrowed machine all open the same file the same way. The first RAW open downloads about 3.4 MB of decoder, cached by the browser afterwards.</p>

<h2 id="format">What a ${primary} file is</h2>
${note}
<p>${also}</p>
${extra || ''}

<h2 id="pipeline">What the pipeline does to it</h2>
<p>The decoder (<a href="https://github.com/ybouane/flashraw" rel="noopener">flashraw</a> compiled to WebAssembly) runs in a Web Worker and performs unpacking, demosaicing, camera white balance and the camera colour matrix. The result is decoded at 16 bits with four stops of scene headroom kept above white, then re-encoded as scene-linear half floats for the GPU; WebGL2 maps that linear data to the screen in real time. The headroom is why the highlights slider behaves like a raw processor rather than a JPEG editor: it compresses real above-white sensor data back into visible gradation instead of clipping what it never had.</p>
<p>The display transform is darktable’s <a href="https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/sigmoid/" rel="noopener">sigmoid</a> (jandren, merged for darktable 4.2): monotone on 0…∞, asymptotic to the white target instead of clipping, computed per channel with hue preservation and fitted in closed form. The repository’s <code>npm run test:tone:reference</code> renders a synthetic 128×512 linear EV ramp through an isolated darktable 5.6.2 CLI to a 16-bit PNG and compares pixels; the observed maximum linear-light error is 0.0014772 (test limit 0.0016). That validates the sigmoid curve, not a full camera RAW decode or Lightroom’s Auto algorithm.</p>
<p>The 64 built-in looks sit after the display transform: a LUT reads display-space values, so it changes colour and contrast relationships but is not what rescues a highlight. Each stage and the measured numbers are covered in <a href="${link('en', '/guides/raw-in-browser')}">the RAW-in-the-browser guide</a>.</p>

<h2 id="fallback">When a frame cannot be unpacked</h2>
<p>Not every file unpacks completely. If the decoder cannot unpack the frame, or returns a truncated one, the page does not show half a black photo and does not fail outright: it falls back to the camera JPEG embedded in the file. You can still grade it, apply a look and export a JPEG, but it is the camera’s JPEG, not a 16-bit linear development — the above-white part was already compressed by the camera’s own display curve.</p>
<p>That is the difference between the two paths: when decoding works, editing and export start from real scene-linear data; on the fallback, the starting point is a JPEG the camera already processed. The fallback is not hidden and it is not called “full decoding” — whether a file decodes depends on the file and on the current decoder.</p>

<h2 id="limits">What you can and cannot do</h2>
<p>You can open one RAW, develop it on the pipeline above, apply one built-in look (or stack a second) and export a full-resolution JPEG.</p>
<ul>
  <li><strong>One frame at a time.</strong> There is no batch queue, no library, no ratings, keywords or cloud catalogue.</li>
  <li><strong>WebGL2 is required.</strong> Without WebGL2 the editor cannot render; this is not a slow CPU fallback.</li>
  <li><strong>No .xmp presets.</strong> Standard .cube LUTs can be imported instead.</li>
  <li><strong>Preview is capped at 4096 px</strong> on the long edge; export is not — it renders the in-memory full-resolution frame in tiles.</li>
  <li><strong>The first RAW open downloads about 3.4 MB of decoder</strong>, served from the browser cache afterwards.</li>
</ul>

<h2 id="next">Related pages</h2>
<ul>
  <li><a href="${link('en', '/guides/raw-in-browser')}">Opening a RAW in the browser: the full workflow and measured numbers</a></li>
  <li><a href="${link('en', '/download')}">Download all 64 LUTs as .cube files</a></li>
  <li><a href="${link('en', '/looks')}">All 64 built-in LUT looks</a></li>
  <li><a href="${link('en', '/raw/')}">All five format guides (NEF / CR3 / ARW / DNG / RAF)</a></li>
  <li><a href="${link('en', '/faq')}">FAQ: formats, privacy, export and offline use</a></li>
  <li><a href="/">Open the editor and drop the ${primary} in</a></li>
</ul>
<p>Other formats: ${siblings}.</p>`;
}

/**
 * Build one complete page module for a raw format.
 *
 * @param {object} spec
 * @param {string} spec.ext        slug tail, lowercase (`nef` → `/raw/nef`)
 * @param {string[]} spec.extList  extensions the page covers, first one is primary
 * @param {{zh:string,en:string}} spec.brand
 * @param {{zh:string,en:string}} spec.also   one sentence naming related variants
 * @param {{zh:string,en:string}} spec.note   format facts as HTML paragraphs
 * @param {{zh:string,en:string}} [spec.extra] optional extra HTML inside the format section
 * @param {{zh:Array<[string,string]>,en:Array<[string,string]>}} [spec.faq]
 * @param {{zh?:string,en?:string}} [spec.title] override the generated title
 * @param {{zh?:string,en?:string}} [spec.description] override the generated description
 * @param {{zh?:string,en?:string}} [spec.h1] override the generated h1
 * @param {{zh?:string,en?:string}} [spec.lede] override the generated lede
 * @param {number} [spec.readMinutes]
 */
export function rawFormatPage(spec) {
  const {
    ext,
    extList,
    brand,
    also,
    note,
    extra,
    faq = {},
    title = {},
    description = {},
    h1 = {},
    lede = {},
    readMinutes = 5,
  } = spec;
  const primary = extList[0];
  const extNames = extList.join(' / ');
  const slug = `raw/${ext}`;

  const generated = {
    zh: {
      title: `在浏览器里把 ${primary} 转成 JPG（不上传）`,
      description: `把${brand.zh} ${extNames} 拖进浏览器就能显影并导出全分辨率 JPG：16 位线性处理、64 款 LUT，不装软件、不上传照片。`,
      kicker: `格式 · ${brand.zh} ${primary}`,
      h1: `把${brand.zh} ${primary} 转成 JPG，在浏览器里完成`,
      lede: `手上有一个 ${primary} 文件，想换成 JPG：拖进浏览器窗口就能显影并导出，解码在本机完成，照片不上传，也不用注册。`,
    },
    en: {
      title: `${primary} to JPG in the browser, no upload`,
      description: `Open a ${brand.en} ${extNames} file in the browser, develop it on a 16-bit linear pipeline with 64 LUT looks, and export a full-resolution JPEG. Nothing is uploaded.`,
      kicker: `FORMAT · ${brand.en} ${primary}`,
      h1: `Convert a ${brand.en} ${primary} to JPG in the browser`,
      lede: `You have one ${primary} file and want a JPEG: drop it into the browser window, develop it and export. Decoding runs on your machine; the file is never uploaded and no account is needed.`,
    },
  };

  const copy = {};
  for (const lang of ['zh', 'en']) {
    copy[lang] = {
      title: title[lang] || generated[lang].title,
      description: description[lang] || generated[lang].description,
      kicker: generated[lang].kicker,
      h1: h1[lang] || generated[lang].h1,
      lede: lede[lang] || generated[lang].lede,
      body: bodyFor(lang, { primary, extNames, also: also[lang], note: note[lang], extra: extra?.[lang] }),
      faq: [...sharedFaq(lang), ...(faq[lang] || [])],
    };
  }

  return {
    slug,
    hub: 'raw',
    kind: 'guide',
    priority: 0.9,
    changefreq: 'monthly',
    updated: UPDATED,
    readMinutes,
    image: IMAGE,
    jsonLd: (lang) => [
      articleLd({
        lang,
        title: copy[lang].title,
        description: copy[lang].description,
        path: pagePath(lang, slug),
        image: IMAGE,
        updated: UPDATED,
        hub: HUB[lang],
      }),
      howToLd({
        lang,
        name:
          lang === 'zh'
            ? `把 ${primary} 转成 JPG：在浏览器里打开、显影、导出`
            : `Convert a ${primary} to JPG in the browser`,
        description:
          lang === 'zh'
            ? `不安装软件，在浏览器里打开 ${primary}、显影、套 look，并导出全分辨率 JPEG。`
            : `Open a ${primary} in the browser, develop it, apply a look and export a full-resolution JPEG without installing anything.`,
        image: IMAGE,
        totalTime: 'PT3M',
        steps: stepsFor(lang, extNames),
      }),
    ],
    zh: copy.zh,
    en: copy.en,
  };
}
