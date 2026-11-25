/**
 * Hub page for the per-format RAW guides (`/raw/`, `/en/raw/`).
 *
 * The five child pages are page modules too (`raw-nef`, `raw-cr3`, `raw-arw`,
 * `raw-dng`, `raw-raf`); the build renders their cards under this page's intro.
 */
export default {
  slug: 'raw',
  hub: null,
  kind: 'hub',
  priority: 0.9,
  changefreq: 'monthly',
  updated: '2026-11-25',
  image: '/photos/develop-desktop.jpg',
  zh: {
    title: 'RAW 格式指南：把常见 RAW 转成 JPG',
    description: 'NEF、CR3、ARW、DNG、RAF 五种常见 RAW 各自是什么、浏览器里怎么解码、什么时候回退到内嵌 JPEG，以及如何导出全分辨率 JPG。',
    kicker: '格式',
    h1: '按相机格式，把手上的 RAW 转成 JPG',
    lede: '五篇文章分别讲尼康 NEF、佳能 CR3/CR2、索尼 ARW、Adobe 与 Apple 的 DNG、富士 RAF：文件里有什么、浏览器怎么解码、拆不开时会发生什么，以及导出的到底是什么。',
    body: `<p>如果只想知道手上这个文件能不能打开：上面五种都在支持范围内，直接拖进<a href="/">编辑器</a>即可，不需要先选格式。每一页讲的是这个容器本身——它装了什么、哪些机身会写它、解码失败时页面怎么处理。</p>
<p>五页共享同一条管线：16 位解码并保留 4 档高于白的场景余量、场景线性数据在 GPU 上显影、darktable sigmoid 显示变换、64 款 look 排在显示变换之后。完整原理和实测数字在<a href="/guides/raw-in-browser">在浏览器里打开 RAW</a>里，这里不重复第二遍。</p>`,
  },
  en: {
    title: 'RAW format guides: NEF, CR3, ARW, DNG and RAF to JPG',
    description: 'What NEF, CR3, ARW, DNG and RAF files are, how each is decoded in the browser, when the embedded JPEG is used instead, and how a full-resolution JPG is exported.',
    kicker: 'FORMATS',
    h1: 'Take the RAW format you have and make a JPG',
    lede: 'Five pages, one per format: what is inside a Nikon NEF, a Canon CR3/CR2, a Sony ARW, an Adobe or Apple DNG and a Fujifilm RAF, how the browser decodes it, and what happens when a frame cannot be unpacked.',
    body: `<p>If you only want to know whether your file opens here: all five are supported — drop it into the <a href="/">editor</a>; there is no format to choose first. Each page covers the container itself: what it holds, which bodies write it, and how the page handles a frame it cannot decode.</p>
<p>All five share one pipeline: a 16-bit decode that keeps four stops of scene headroom above white, scene-linear development on the GPU, darktable’s sigmoid display transform, and the 64 looks applied after that transform. The full explanation and the measured numbers are in <a href="/en/guides/raw-in-browser">opening a RAW in the browser</a>.</p>`,
  },
};
