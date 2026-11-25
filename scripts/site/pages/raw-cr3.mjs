import { rawFormatPage } from '../raw-formats.mjs';

export default rawFormatPage({
  ext: 'cr3',
  extList: ['CR3', 'CR2'],
  brand: { zh: '佳能', en: 'Canon' },
  also: {
    zh: '同一个页面也覆盖 CR2：它是 CR3 之前的佳能 RAW 容器，结构不同，但同样列在支持格式里。',
    en: 'This page also covers CR2, the Canon raw container that came before CR3; it is a different structure but is on the supported list too.',
  },
  note: {
    zh: `<p><strong>CR3</strong> 是佳能 2018 年起使用的 RAW 容器，<strong>CR2</strong> 是它之前的格式。两者的结构不同：CR2 是 TIFF 结构的 RAW，CR3 基于 ISO base media file format（ISOBMFF）——和 MP4 同一个文件家族，所以能读 CR2 的代码不一定能读 CR3。</p>
<p>佳能 EOS R 系列无反使用 CR3，更早的 EOS 机身使用 CR2。这里两种容器都列在支持范围内，页面流程相同：打开、显影、套 look、导出。CR3 文件里通常还带一张相机 JPEG，用于默认的相机风格观感，也用于解码失败时的回退。</p>`,
    en: `<p><strong>CR3</strong> is the raw container Canon has used since 2018; <strong>CR2</strong> is the format before it. The two are not the same structure: CR2 is a TIFF-derived raw, while CR3 is built on the ISO base media file format (ISOBMFF) — the same file family as MP4 — so code that reads CR2 is not automatically able to read CR3.</p>
<p>Canon’s EOS R-series mirrorless bodies use CR3, and earlier EOS bodies use CR2. Both containers are on the supported list here and the page workflow is the same: open, develop, apply a look, export. A CR3 normally also embeds a camera JPEG, used for the default camera-look rendition and for the fallback when decoding fails.</p>`,
  },
  faq: {
    zh: [
      [
        'CR3 和 CR2 有什么区别？',
        'CR2 是佳能较早的 TIFF 结构 RAW，CR3 基于 ISO base media file format（ISOBMFF，和 MP4 同一家族）。两种容器都能在这一页直接打开，但读取它们的代码不通用。',
      ],
      [
        'CR3 里的相机 JPEG 会被用到吗？',
        '会。默认的相机风格观感会参考文件里内嵌的 JPEG，解码失败时也用它回退；正常解码走的仍然是 16 位线性帧。',
      ],
    ],
    en: [
      [
        'What is the difference between CR3 and CR2?',
        'CR2 is Canon’s earlier TIFF-derived raw; CR3 is built on the ISO base media file format (ISOBMFF, the family MP4 belongs to). Both containers open directly on this page, but the code that reads one does not automatically read the other.',
      ],
      [
        'Is the camera JPEG inside a CR3 used?',
        'Yes. The default camera-look rendition reads the JPEG embedded in the file, and the same JPEG is the fallback when decoding fails; normal decoding still uses the 16-bit linear frame.',
      ],
    ],
  },
});
