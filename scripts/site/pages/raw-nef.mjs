import { rawFormatPage } from '../raw-formats.mjs';

export default rawFormatPage({
  ext: 'nef',
  extList: ['NEF', 'NRW'],
  brand: { zh: '尼康', en: 'Nikon' },
  also: {
    zh: '同一个页面也覆盖 NRW：它是尼康部分小型机使用的 RAW 变体，和 NEF 走同一条解码路径。',
    en: 'This page also covers NRW, the raw variant used by some smaller Nikon bodies; it takes the same decode path as NEF.',
  },
  note: {
    zh: `<p><strong>NEF</strong>（Nikon Electronic Format）是尼康的 RAW 格式，里面保存传感器的原始数据、拍摄时的白平衡与相机色彩矩阵，以及一张相机生成的 JPEG 预览。尼康的 DSLR 与 Z 系列无反都写 NEF；解码时按机身记录的参数还原色彩，不需要你另外安装相机配置文件。</p>
<p>NEF 还有几个变体：部分机身提供 <strong>HE</strong> 与 <strong>HE*</strong> 高效压缩 NEF（基于 TicoRAW 的压缩方式），文件比未压缩 NEF 小；<strong>NRW</strong> 则是部分小型机使用的变体。它们在这页走同一条流程，区别主要在解码这一端。</p>`,
    en: `<p><strong>NEF</strong> (Nikon Electronic Format) is Nikon’s raw format. It carries the sensor data, the white balance and camera colour matrix recorded at capture, and a camera-generated JPEG preview. Nikon’s DSLR and Z-series mirrorless bodies write NEF, and the decoder applies the parameters the camera recorded, so no separately installed camera profile is needed.</p>
<p>NEF comes in variants: some bodies offer <strong>HE</strong> and <strong>HE*</strong> high-efficiency compressed NEFs (compression based on TicoRAW), which are smaller than uncompressed NEFs, and <strong>NRW</strong>, a variant used by some smaller bodies. They take the same workflow on this page; the difference is on the decoding side.</p>`,
  },
  extra: {
    zh: `<h3>HE / HE* 与内嵌 JPEG 回退</h3>
<p>HE 与 HE* 是压缩的 NEF：解码器会先尝试完整的 16 位线性解码，如果这一帧没能解开（压缩 RAW 的帧有可能被判定为截断），就改用文件里内嵌的相机 JPEG。对 HE / HE* 文件来说，最坏的情况是拿到一张相机 JPEG——仍然可以调色和导出，但它不是线性显影。未压缩 NEF 偶尔也会遇到截断文件，回退逻辑对它们一样生效。</p>
<p>所以“能不能开”和“以哪种方式开”是两个问题：前者由解码器和文件决定，后者决定你手上是 16 位场景线性数据，还是相机已经处理过的 JPEG。</p>`,
    en: `<h3>HE / HE* and the embedded-JPEG fallback</h3>
<p>HE and HE* are compressed NEFs. The decoder tries the full 16-bit linear decode first; if that frame cannot be unpacked — a compressed raw frame can come back truncated — the camera JPEG embedded in the file is used instead. For an HE or HE* file the worst case is that camera JPEG: still editable and exportable, but not a linear development. Uncompressed NEFs occasionally hit truncated files too, and the fallback applies to them the same way.</p>
<p>So “will it open” and “how will it open” are two questions: the first is decided by the decoder and the file, the second decides whether you are working from 16-bit scene-linear data or from a JPEG the camera already processed.</p>`,
  },
  faq: {
    zh: [
      [
        'HE 和 HE* 的 NEF 也能打开吗？',
        '会进入同一条解码路径。HE / HE* 是压缩的 NEF，如果某一帧没能完整解开，页面会用文件里内嵌的相机 JPEG 继续，而不是报错——所以最坏的情况是一张相机 JPEG，而不是打不开。',
      ],
      [
        'NEF 和 NRW 有什么区别？',
        '都是尼康的 RAW。NRW 是部分小型机使用的变体，NEF 是 DSLR 与 Z 系列无反使用的格式；在这一页它们走同一条流程。',
      ],
    ],
    en: [
      [
        'Do HE and HE* NEFs open too?',
        'They take the same decode path. HE and HE* are compressed NEFs; if a particular frame cannot be fully unpacked, the page continues with the camera JPEG embedded in the file instead of failing, so the worst case is a camera JPEG rather than a file that will not open.',
      ],
      [
        'What is the difference between NEF and NRW?',
        'Both are Nikon raws. NRW is the variant used by some smaller bodies; NEF is the format written by the DSLR and Z-series mirrorless bodies. On this page they follow the same workflow.',
      ],
    ],
  },
});
