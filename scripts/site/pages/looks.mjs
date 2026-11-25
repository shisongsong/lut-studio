import { articleLd } from '../../site.mjs';
import { LOOKS, FILTERS } from '../../../public/js/looks.js';

const CAT_ORDER = FILTERS.filter(([id]) => id !== 'all').map(([id]) => id);

function groups(lang) {
  return CAT_ORDER.map((cat) => {
    const items = LOOKS.filter((look) => look.cat === cat);
    if (!items.length) return '';
    const label = lang === 'zh' ? items[0].catLabel : catLabelEn(cat);
    const cards = items
      .map((look) => {
        const name = lang === 'zh' ? look.name : look.en;
        const sub = lang === 'zh' ? `${look.en} · ${look.tag}` : label;
        return `<li class="look"><b>${name}</b><span>${sub}</span></li>`;
      })
      .join('');
    return `<h2 id="${cat}">${label}</h2><ul class="lookgrid">${cards}</ul>`;
  }).join('');
}

const CAT_EN = {
  cinema: 'Cinema',
  film: 'Film',
  bw: 'Black & white',
  warm: 'Warm & cool',
  punch: 'Style',
  vintage: 'Vintage',
  airy: 'Airy',
  leica: 'Leica',
  hasselblad: 'Hasselblad',
  kodak: 'Kodak',
  fuji: 'Fujifilm',
  ricoh: 'Ricoh',
  pana: 'Panasonic',
};
const catLabelEn = (cat) => CAT_EN[cat] || cat;

export default {
  slug: 'looks',
  kind: 'guide',
  hub: null,
  priority: 0.7,
  changefreq: 'weekly',
  updated: '2026-11-19',
  image: '/photos/dual.jpg',
  jsonLd: (lang) => [
    articleLd({
      lang,
      title: lang === 'zh' ? '64 款内置 LUT 一览' : 'All 64 built-in LUT looks',
      description:
        lang === 'zh'
          ? '按类别列出 64 款内置 look：电影、胶片、黑白、冷暖、复古、空气感、徕卡、哈苏、柯达、富士、理光、松下。'
          : 'Every built-in look by category: cinema, film, black and white, warm/cool, vintage, airy, Leica, Hasselblad, Kodak, Fujifilm, Ricoh, Panasonic.',
      path: lang === 'zh' ? '/looks' : '/en/looks',
      image: '/photos/dual.jpg',
      updated: '2026-11-19',
      hub: lang === 'zh' ? 'LUT' : 'Looks',
    }),
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: lang === 'zh' ? 'LUT ARCHIVE 内置 look' : 'LUT ARCHIVE built-in looks',
      numberOfItems: LOOKS.length,
      itemListElement: LOOKS.map((look, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: lang === 'zh' ? look.name : look.en,
        description: look.tag,
      })),
    },
  ],
  zh: {
    title: '64 款内置 LUT：电影、胶片、黑白与相机风格',
    description: '按类别浏览 64 款内置 look：电影青橙、经典胶片、柯达、富士、理光、松下、徕卡与哈苏风格，附适用场景说明。',
    kicker: 'LUT 目录',
    h1: '64 款内置 look，全部来自原创配方',
    lede: '这些不是厂商发布的 LUT 文件，而是按对应风格的色彩响应写的原始配方：电影、胶片、黑白、冷暖、复古、空气感，以及柯达、富士、理光、松下、徕卡、哈苏的风格近似。',
    body: `<p>每一款都能调强度，也可以把两款叠在一起（比如一层胶片底子加一层轻微的高光偏色），再合并成一个 <code>.cube</code> 导出。内置 look 用 33³ 精度打包，和下载到的立方体是同一份数据。</p>
${groups('zh')}
<h2 id="how-to">怎么用</h2>
<p>打开浏览器里的编辑器，拖入一张照片，在底部的胶片条里切换 look；底部的纵向滑轨调强度，<code>DUAL LUT</code> 打开第二个槽位。想把这些 look 用在别的软件里，可以直接<a href="/download">打包下载全部 64 款 .cube</a>（MIT 许可、不注册）；要用厂商的 LOG LUT，去 <a href="/get-luts">官方下载入口</a> 拿文件再导入编辑器。</p>
<p>不确定 LUT 精度会不会影响画质，可以先看 <a href="/guides/lut-size">LUT 精度实测</a>。</p>`,
    faq: [
      ['这些 LUT 和柯达、富士官方的一样吗？', '不一样。它们是按对应风格的色彩响应重新生成的配方，不是厂商文件；观感接近，但不是逐字节复刻。'],
      ['可以在 Premiere 或 Resolve 里用吗？', '可以。仓库里的 <code>.cube</code> 是标准 3D LUT 文件，直接导入即可。'],
      ['黑白 look 是怎么做的？', '在 LUT 内把三通道映射到同一亮度轴并保留局部对比，所以在浏览器里套用后饱和度会归零，而不是靠降低饱和度滑块模拟。'],
    ],
  },
  en: {
    title: 'All 64 built-in LUT looks: cinema, film, B&W and camera styles',
    description: 'Browse all 64 built-in looks by category: cinema, film, B&W, Kodak, Fujifilm, Ricoh, Panasonic, Leica and Hasselblad-inspired grades.',
    kicker: 'LOOK CATALOGUE',
    h1: '64 built-in looks, all from original recipes',
    lede: 'These are not vendor-published LUT files. They are original colour recipes written to match the response of the named styles: cinema, film, black and white, warm/cool, vintage, airy, plus Kodak, Fujifilm, Ricoh, Panasonic, Leica and Hasselblad-inspired grades.',
    body: `<p>Every look has an adjustable strength, two looks can be stacked (a film base plus a slight highlight tint, for example), and the stack can be baked into one <code>.cube</code> for other software. The built-in pack is 33³, and it is the same data as the downloadable cubes.</p>
${groups('en')}
<h2 id="how-to">How to use them</h2>
<p>Open the editor in the browser, drop in a photo, and switch looks in the filmstrip along the bottom; the vertical rail sets strength and <code>DUAL LUT</code> opens the second slot. To use the same grades in other software, <a href="/download">download all 64 as .cube files</a> (MIT, no signup); for vendor LOG LUTs, the <a href="/en/get-luts">LUT sources</a> page covers where the camera makers publish theirs.</p>
<p>If you are unsure whether LUT precision matters, the <a href="/guides/lut-size">measured LUT precision</a> write-up has the numbers.</p>`,
    faq: [
      ['Are these the same as the official Kodak or Fujifilm LUTs?', 'No. They are recipes regenerated to match the colour response of those styles, not vendor files. Close in look, not a byte-for-byte reproduction.'],
      ['Can I use them in Premiere or Resolve?', 'Yes. The <code>.cube</code> files in the repository are standard 3D LUTs and import directly.'],
      ['How are the black-and-white looks made?', 'Inside the LUT the three channels are mapped onto one luminance axis while preserving local contrast, so applying one drops saturation to zero instead of approximating it with the saturation slider.'],
    ],
  },
};
