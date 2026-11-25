import { rawFormatPage } from '../raw-formats.mjs';

export default rawFormatPage({
  ext: 'dng',
  extList: ['DNG'],
  brand: { zh: 'Adobe', en: 'Adobe' },
  title: {
    zh: '在浏览器里把 DNG 转成 JPG（不上传）',
    en: 'DNG to JPG in the browser, no upload',
  },
  description: {
    zh: '把 DNG（Adobe 开放容器、Apple ProRAW、手机与无人机）拖进浏览器即可显影并导出全分辨率 JPG：16 位线性、64 款 LUT，照片不上传。',
    en: 'Open a DNG in the browser: Adobe’s open container, Apple ProRAW, phone or drone raw. 16-bit linear development, 64 LUT looks, full-resolution JPEG export.',
  },
  h1: {
    zh: '把 DNG 转成 JPG，在浏览器里完成',
    en: 'Convert a DNG to JPG in the browser',
  },
  lede: {
    zh: '手上有一个 DNG——来自 Adobe 的转换工具、Apple ProRAW、手机或无人机——都可以直接拖进浏览器窗口显影并导出 JPG，解码在本机完成，照片不上传。',
    en: 'A DNG from Adobe’s converter, Apple ProRAW, a phone or a drone can be dropped straight into the browser window, developed and exported as a JPEG. Decoding runs on your machine; nothing is uploaded.',
  },
  also: {
    zh: '同一个页面也覆盖 Apple ProRAW、手机与无人机写出的 DNG：它们都是 DNG 容器，只是来源和元数据不同。',
    en: 'This page also covers Apple ProRAW and the DNG files written by phones and drones: same container, different provenance and metadata.',
  },
  note: {
    zh: `<p><strong>DNG</strong>（Digital Negative）是 Adobe 公开文档化的 RAW 容器，结构基于 TIFF/EP，设计目标是任何软件都能按公开规范读取，而不必逆向每一台相机的私有格式。它既是相机原生格式（徕卡、宾得等机身可以直接选择 DNG 记录），也是很多转换工具的输出格式。</p>
<p><strong>Apple ProRAW</strong> 的文件本身就是 DNG：苹果在 iPhone 12 Pro 及之后的 Pro 机型上提供 ProRAW，容器里除了原始传感器数据，还有苹果计算摄影的元数据。很多安卓手机通过 Camera2 RAW 接口输出 DNG，部分无人机也直接写 DNG——它们都走这一页的流程。</p>`,
    en: `<p><strong>DNG</strong> (Digital Negative) is Adobe’s openly documented raw container, built on TIFF/EP. Its point is that any software can read it from a public specification instead of reverse-engineering each camera’s private format. It is both a native camera format — Leica and Pentax bodies can record DNG directly — and the output of many conversion tools.</p>
<p><strong>Apple ProRAW</strong> files are DNGs: Apple offers ProRAW on iPhone 12 Pro and later Pro models, and the container holds the sensor data plus Apple’s computational-photography metadata. Many Android phones output DNG through the Camera2 RAW API and some drones write DNG directly; they all take this page’s workflow.</p>`,
  },
  extra: {
    zh: `<h3>来源不同的 DNG，结构也不完全一样</h3>
<p>DNG 是一个容器规范，不是一种固定的数据布局：相机原生 DNG、Adobe DNG Converter 转出来的 DNG、手机的多帧合成 DNG、无人机写出的 DNG，里面的数据组织和元数据都可能不同。有的保存原始传感器数据，需要去马赛克；有的已经做过线性化。这里不按来源区分，统一走 DNG 解码路径；如果某个文件的结构超出解码器能处理的范围，就走内嵌 JPEG 回退——文件里带一张足够大的相机预览时，至少还能拿到一张可用的图。</p>`,
    en: `<h3>DNGs from different sources are not laid out the same way</h3>
<p>DNG is a container specification, not one fixed data layout: a camera-native DNG, a file converted by Adobe DNG Converter, a multi-frame DNG from a phone and a DNG from a drone can organise their data and metadata differently. Some carry raw sensor data that needs demosaicing; others are already linearised. This page does not split them by origin — they all go through the DNG decode path — and if a file’s structure is outside what the decoder handles, the embedded camera JPEG is the fallback, provided the file carries a camera preview large enough to use.</p>`,
  },
  faq: {
    zh: [
      [
        'Apple ProRAW 也是 DNG 吗？',
        '是。ProRAW 是苹果在 iPhone 12 Pro 及之后的 Pro 机型上提供的格式，文件本身是 DNG 容器，走这一页的 DNG 解码路径。',
      ],
      [
        '手机和无人机拍的 DNG 也能打开吗？',
        '会进入同一条 DNG 路径。这些文件来源不同、元数据不同，结构也可能不同；如果超出解码器能处理的范围，会回退到文件里内嵌的相机 JPEG。',
      ],
    ],
    en: [
      [
        'Is Apple ProRAW a DNG?',
        'Yes. ProRAW is the format Apple offers on iPhone 12 Pro and later Pro models, and the file itself is a DNG container: it takes this page’s DNG decode path.',
      ],
      [
        'Do DNGs from phones and drones open too?',
        'They take the same DNG path. The files come from different sources with different metadata and sometimes different structures; if one is outside what the decoder handles, it falls back to the camera JPEG embedded in the file.',
      ],
    ],
  },
});
