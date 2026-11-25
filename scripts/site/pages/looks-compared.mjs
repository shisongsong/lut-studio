import { articleLd } from '../../site.mjs';
import { LOOKS } from '../../../public/js/looks.js';
import { LAUNCHED_LOOK_IDS } from '../look-page.mjs';

// One controlled comparison, read off the same card grid every time: same sample
// photo, same neutral development, every look at 100 %. The grid itself is the
// content; the prose only says what the measurements in scripts/looks.mjs imply.
function grid(lang) {
  return LAUNCHED_LOOK_IDS.map((id) => {
    const look = LOOKS.find((l) => l.id === id);
    if (!look) return '';
    const name = lang === 'zh' ? look.name : look.en;
    const href = lang === 'zh' ? `/looks/${id}` : `/en/looks/${id}`;
    const alt = lang === 'zh' ? `${name} 在同一张示例照片上的效果` : `${look.en} on the same sample photo`;
    return `<a class="card" href="${href}"><img src="/photos/looks/${id}-thumb.jpg" width="480" height="320" alt="${alt}" loading="lazy" style="width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;display:block;margin-bottom:12px"><h3>${name}</h3><p>${lang === 'zh' ? look.tag : look.en}</p></a>`;
  }).join('\n');
}

export default {
  slug: 'looks/compared',
  hub: null,
  kind: 'guide',
  priority: 0.8,
  changefreq: 'monthly',
  updated: '2026-11-25',
  readMinutes: 4,
  image: '/photos/looks/before.jpg',
  jsonLd: (lang) => [
    articleLd({
      lang,
      title: lang === 'zh' ? '12 款 look 对比：同一张照片，同一套显影' : '12 looks compared on one photo, same development',
      description:
        lang === 'zh'
          ? '同一张照片、同一套中性显影，12 款 look 各按 100% 强度出图后的并排对比：Portra、Ektar、Tri-X、Velvia、Classic Chrome、青橙、漂白等。'
          : 'One photo, one neutral development, twelve looks at 100 % side by side: Portra, Ektar, Tri-X, Velvia, Classic Chrome, Cinema Teal, Bleach Bypass and more.',
      path: lang === 'zh' ? '/looks/compared' : '/en/looks/compared',
      image: '/photos/looks/before.jpg',
      updated: '2026-11-25',
      hub: null,
    }),
  ],
  zh: {
    title: '12 款 look 对比：同一张照片，同一套显影',
    description: '同一张照片、同一套中性显影，12 款 look 按 100% 强度出图的并排对比：Portra、Ektar、Tri-X、Velvia、青橙、漂白都在。',
    kicker: '对比',
    h1: '同一张照片，12 种显影',
    lede:
      '这一页只有一个变量：套不套 look、套哪一支。12 张图都来自同一次中性显影（没有相机风格、没有手动调过滑块），每一支 look 都按 100% 强度出图。下面先说结论式的差别，再给出并排网格。',
    body: `<figure class="figure"><img src="/photos/looks/before.jpg" width="1200" height="801" alt="示例照片的中性显影：没有套任何 LUT" loading="lazy"><figcaption>基准：同一张示例照片的中性显影，没有套 look。下面 12 张都与它逐像素同源。</figcaption></figure>

<h2 id="grid">并排看</h2>
<div class="cards">
${grid('zh')}
</div>

<h2 id="pairs">四组容易混淆的，分别差在哪</h2>
<h3>柯达 Portra 400 / Portra 160 / Gold 200</h3>
<p>Portra 400 是这三支里最"暖而稳"的：红通道略抬、蓝通道略收，红色只在本来就偏红的区域加深，肤色附近的橙色被单独按住，所以人不会滑向橙黄。Portra 160 更中性、更干净，暖度更低，红色没有额外强调，整体像"少一点性格"的 400。Gold 200 则是明显更强的金黄色调、更软的高光——它本来就不打算中性。</p>
<h3>柯达 Tri-X 400 / 富士 Acros 100</h3>
<p>两支都是黑白，但转换方式不同。Tri-X 用的是接近全色的权重加更硬的中间调，黑位更低，出来是"重"的黑白；Acros 让绿色在灰阶里占更大权重、红蓝各留一份，曲线更平缓，黑位保持中性，所以雾天、雪景这类层次多的场景更容易拉开过渡。</p>
<h3>富士 Velvia 50 / Classic Chrome</h3>
<p>方向正好相反。Velvia 50 是全包饱和最高的一支（配方上叠了 1.28 的饱和度乘数），深绿、洋红阴影、高饱和；Classic Chrome 走收着的路线：饱和度整体压低、阴影偏冷、对比中等，适合纪实题材。想把画面"加味道"选前者，想让它"退一步"选后者。</p>
<h3>电影青橙 / 漂白</h3>
<p>青橙是按色相分离的：阴影往青里推、高光保持暖，肤色因为有橙色高光而更突出。漂白是反过来的逻辑：抬反差、掉饱和，让亮部发银——它不改色相分离，是把颜色抽走、把层次压硬。</p>

<h2 id="choose">怎么选</h2>
<ul>
<li><strong>拍人</strong>：Portra 400（暖、肤色稳）、Hasselblad Natural（最中性、高光最软）、徕卡经典（暖调深黑、红色更润）。</li>
<li><strong>拍景</strong>：Velvia 50（浓绿、高饱和）、Ektar 100（红最艳、阴影偏冷）、理光 GR 正片（高对比、红绿都浓）。</li>
<li><strong>要黑白</strong>：Tri-X 400（重、硬）、Acros 100（细、平）、富士 Acros 的绿权重让植被和天空的关系与中性黑白不同。</li>
<li><strong>要情绪</strong>：电影青橙（冷阴影暖高光）、漂白（高反差低饱和）、Kodachrome 64（红极浓、深黑、冷阴影）。</li>
</ul>
<p>拿不准就先在<a href="/">编辑器里</a>把照片拖进来，用底部胶片条逐个划过——所有渲染都在本机完成，看到的就是导出会得到的那一版。</p>

<h2 id="more">接着看</h2>
<p>每一支的独立页面（效果、题材、和相邻款的差别、单支 .cube 下载）：<a href="/looks">全部 64 款目录</a> · <a href="/download">64 款打包下载</a> · <a href="/guides/what-is-lut">LUT 是什么</a> · <a href="/guides/lut-size">LUT 精度实测</a></p>`,
    faq: [
      ['这些对比图是怎么出的？', '用同一张示例照片，在编辑器里保持中性显影（不套相机风格、不动滑块），只切换 look、强度固定 100%，然后直接读取渲染器画好的画面导出。所以差异只来自 look 本身。'],
      ['为什么没有把 64 款全放上来？', '这一页先做 12 款有独立页面的对比。其余 52 款在同一套显影下也能看，直接在 /looks 目录里点开或在编辑器胶片条里划过去即可。'],
      ['同一款 look 在不同照片上效果一样吗？', '方向一样，强度不一样。LUT 只做色彩映射，最终的观感还取决于照片本身的亮度分布与饱和度——在 RAW 上尤其明显，因为 RAW 先经过 16 位线性显影再进 LUT。'],
    ],
  },
  en: {
    title: '12 looks compared on one photo, same development',
    description: 'One photo, one neutral development, twelve looks at 100 % side by side: Portra, Ektar, Tri-X, Velvia, Classic Chrome, Cinema Teal and Bleach Bypass.',
    kicker: 'COMPARISON',
    h1: 'One photo, twelve developments',
    lede:
      'Only one variable changes on this page: which look is applied. All twelve images come from the same neutral development (no camera look, no slider touched) and every look is rendered at 100 % strength. The differences are summarised first, then the grid.',
    body: `<figure class="figure"><img src="/photos/looks/before.jpg" width="1200" height="801" alt="The sample photo developed neutrally, no LUT applied" loading="lazy"><figcaption>Reference: the sample photo developed neutrally, no look applied. Every image below shares these exact pixels.</figcaption></figure>

<h2 id="grid">Side by side</h2>
<div class="cards">
${grid('en')}
</div>

<h2 id="pairs">Four pairs that are easy to mix up</h2>
<h3>Kodak Portra 400 / Portra 160 / Gold 200</h3>
<p>Portra 400 is the warm, steady one: red lifted slightly, blue pulled down, and red deepened only where the image already runs warm while the orange band around skin is held back. Portra 160 is the cleaner, more neutral sibling — less warmth, no red accent. Gold 200 is deliberately further out: a stronger gold cast and softer highlights; it never tries to be neutral.</p>
<h3>Kodak Tri-X 400 / Fujifilm Acros 100</h3>
<p>Both are monochrome, but the conversions differ. Tri-X uses a near-panchromatic mix with a firmer midtone curve and a lower black point, so it reads heavy. Acros gives green more weight in the greys, keeps red and blue smaller, and uses a gentler curve with a neutral black — which is why fog, snow and many-step gradients separate more easily on it.</p>
<h3>Fujifilm Velvia 50 / Classic Chrome</h3>
<p>Opposite directions. Velvia 50 is the most saturated recipe in the pack (a 1.28 saturation multiplier is baked in): deep greens, magenta-leaning shadows, high saturation. Classic Chrome pulls back — lower saturation, cooler shadows, moderate contrast — and suits documentary work. Want more flavour, take Velvia; want the image to step back, take Classic Chrome.</p>
<h3>Cinema Teal / Bleach Bypass</h3>
<p>Cinema Teal separates by hue: shadows pushed toward cyan, highlights kept warm, skin standing out because it sits in the orange highlight range. Bleach Bypass works the other way: it raises contrast and drops saturation so the bright areas go silver — it does not move hue separation, it drains colour and hardens the tone steps.</p>

<h2 id="choose">How to choose</h2>
<ul>
<li><strong>People</strong>: Portra 400 (warm, stable skin), Hasselblad Natural (the most neutral, softest highlights), Leica Classic (warm, deep blacks, richer reds).</li>
<li><strong>Landscape</strong>: Velvia 50 (dense greens, high saturation), Ektar 100 (vivid reds, cool shadows), Ricoh GR Positive (high contrast, strong reds and greens).</li>
<li><strong>Monochrome</strong>: Tri-X 400 (heavy, firm), Acros 100 (fine, flat), and Acros's green weighting changes how foliage separates from sky.</li>
<li><strong>Mood</strong>: Cinema Teal (cool shadows, warm highlights), Bleach Bypass (high contrast, low saturation), Kodachrome 64 (deep reds, solid blacks, cool shadows).</li>
</ul>
<p>If you are unsure, <a href="/">open the editor</a>, drop a photo in and sweep the filmstrip — everything renders locally, and what you see is the version the export produces.</p>

<h2 id="more">Keep looking</h2>
<p>Each look has its own page (result, subjects, how it differs from its neighbours, single .cube download): <a href="/en/looks">all 64 in the catalogue</a> · <a href="/en/download">the 64-look pack</a> · <a href="/en/guides/what-is-lut">what a LUT is</a> · <a href="/en/guides/lut-size">measured LUT precision</a></p>`,
    faq: [
      ['How were these comparison images produced?', 'One sample photo, kept in the editor on a neutral development (no camera look, no sliders moved); only the look changes, at a fixed 100 % strength. The rendered frame is read straight from the renderer, so the difference comes from the look alone.'],
      ['Why only 12 looks and not all 64?', 'This page covers the twelve with their own page first. The other 52 can be viewed under the same development by opening them in the catalogue or sweeping the filmstrip in the editor.'],
      ['Does a look behave the same on every photo?', 'Same direction, different strength. A LUT only maps colours; the final result also depends on the photo’s own luminance distribution and saturation — especially on RAW, which is developed in 16-bit linear before the LUT runs.'],
    ],
  },
};
