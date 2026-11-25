import { rawFormatPage } from '../raw-formats.mjs';

export default rawFormatPage({
  ext: 'arw',
  extList: ['ARW', 'SRF', 'SR2'],
  brand: { zh: '索尼', en: 'Sony' },
  also: {
    zh: '同一个页面也覆盖 SRF 与 SR2：它们是索尼更早的 RAW 容器，扩展名不同，流程一致。',
    en: 'This page also covers SRF and SR2, the earlier Sony raw containers; the extension differs, the workflow is the same.',
  },
  note: {
    zh: `<p><strong>ARW</strong> 是索尼的 RAW 格式，索尼 α 系列机身都写它。文件里保存传感器原始数据、拍摄时的白平衡与相机色彩矩阵，还有一张相机 JPEG 预览。</p>
<p><strong>SRF</strong> 与 <strong>SR2</strong> 是索尼更早的 RAW 容器，出现在早期机型上；扩展名不同，但这里按同一页的流程处理。索尼机身可以选择未压缩或压缩 RAW 记录，文件扩展名通常仍是 .ARW；能不能走完整的线性解码由文件本身决定，走不了时就用内嵌的 JPEG 回退。</p>`,
    en: `<p><strong>ARW</strong> is Sony’s raw format. Sony’s α bodies write it, and the file stores the raw sensor data, the white balance and camera colour matrix recorded at capture, plus a camera JPEG preview.</p>
<p><strong>SRF</strong> and <strong>SR2</strong> are earlier Sony raw containers from older bodies; the extensions differ, but they follow the same workflow on this page. Sony bodies can record uncompressed or compressed raw, usually still with the .ARW extension; whether a particular file takes the full linear decode depends on the file, and when it cannot, the embedded JPEG is the fallback.</p>`,
  },
  faq: {
    zh: [
      [
        'ARW 和 SRF / SR2 有什么区别？',
        'ARW 是索尼现在使用的 RAW 容器，SRF 和 SR2 出现在更早的机型上；扩展名不同，这一页按同一套流程处理。',
      ],
      [
        '索尼机身的压缩 RAW 能打开吗？',
        '扩展名通常仍是 .ARW；能不能完整线性解码由具体文件决定，解不开时会回退到内嵌的相机 JPEG，而不是报错。',
      ],
    ],
    en: [
      [
        'What is the difference between ARW, SRF and SR2?',
        'ARW is the Sony raw container used today; SRF and SR2 appear on earlier bodies. The extension differs, but this page treats them with the same workflow.',
      ],
      [
        'Can compressed Sony raw files be opened?',
        'The extension is normally still .ARW. Whether a particular file takes the full linear decode depends on the file; when it cannot, the embedded camera JPEG is the fallback instead of a hard failure.',
      ],
    ],
  },
});
