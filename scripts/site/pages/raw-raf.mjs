import { rawFormatPage } from '../raw-formats.mjs';

export default rawFormatPage({
  ext: 'raf',
  extList: ['RAF'],
  brand: { zh: '富士', en: 'Fujifilm' },
  description: {
    zh: '把富士 RAF（X 系列的 X-Trans 与 GFX 中画幅）拖进浏览器就能显影并导出全分辨率 JPG：16 位线性处理、64 款 LUT，不装软件、不上传照片。',
    en: 'Open a Fujifilm RAF from an X-Trans or GFX body in the browser, develop it on a 16-bit linear pipeline with 64 LUT looks, and export a full-resolution JPEG.',
  },
  also: {
    zh: '同一个页面也覆盖 GFX 中画幅机身写出的 RAF：它们用常规 Bayer 阵列而不是 X-Trans，但同样按 RAF 处理。',
    en: 'This page also covers the RAF files written by GFX medium-format bodies: those use a conventional Bayer array rather than X-Trans, but they are still RAF.',
  },
  note: {
    zh: `<p><strong>RAF</strong> 是富士的 RAW 格式，内部是相机专用的 TIFF 结构，保存传感器原始数据、白平衡信息与相机生成的 JPEG 预览。富士 X 系列 APS-C 机身使用 <strong>X-Trans</strong> 滤色阵列，GFX 中画幅机身使用常规 Bayer 阵列，但两者都写 .RAF。</p>
<p>X-Trans 的排布不是 Bayer 的 2×2 单元，而是 6×6 的重复图案，设计初衷是抑制摩尔纹；代价是去马赛克必须按 X-Trans 的排布处理，不能套用 Bayer 的算法。这条管线对 RAF 直接解码，不需要先把 RAF 转成 DNG。</p>`,
    en: `<p><strong>RAF</strong> is Fujifilm’s raw format. Internally it is a camera-specific TIFF structure holding the raw sensor data, white balance information and a camera-generated JPEG preview. Fujifilm’s X-series APS-C bodies use the <strong>X-Trans</strong> colour filter array, while the GFX medium-format bodies use a conventional Bayer array — and both write .RAF.</p>
<p>The X-Trans pattern is not a Bayer 2×2 unit but a 6×6 repeating pattern, designed to suppress moiré; the cost is that demosaicing has to follow the X-Trans layout rather than a Bayer algorithm. This pipeline decodes RAF directly, without converting it to DNG first.</p>`,
  },
  faq: {
    zh: [
      [
        'X-Trans 和普通 Bayer RAW 有什么区别？',
        'X-Trans 是富士的 6×6 非 Bayer 滤色阵列，去马赛克不能按 Bayer 的方法做；X 系列 APS-C 机身用 X-Trans，GFX 中画幅机身用 Bayer 阵列，两者都写 .RAF。',
      ],
      [
        'RAF 需要先转成 DNG 吗？',
        '不需要。RAF 直接在浏览器里解码，走同一条 16 位线性管线；只有某个文件拆不开时，才会用内嵌的相机 JPEG。',
      ],
    ],
    en: [
      [
        'How is X-Trans different from a normal Bayer raw?',
        'X-Trans is Fujifilm’s 6×6 non-Bayer colour filter array, so demosaicing cannot use a Bayer algorithm; the X-series APS-C bodies use X-Trans, the GFX medium-format bodies use a Bayer array, and both write .RAF.',
      ],
      [
        'Does a RAF have to be converted to DNG first?',
        'No. RAF decodes directly in the browser on the same 16-bit linear pipeline; the embedded camera JPEG is only used when a particular file cannot be unpacked.',
      ],
    ],
  },
});
