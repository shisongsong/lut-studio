import { articleLd, howToLd } from '../../site.mjs';

const ZH_STEPS = [
  ['先挑 A 槽的 look', '在底部胶片条里选一款内置 look，或者「我的 LUT」里导入的 .cube。A 是栈里的第一层。'],
  ['打开双 LUT，再挑 B 槽', '点工具栏的「双 LUT」打开第二个槽位，给 B 选另一款 look。B 作用在 A 的结果上。'],
  ['分别定强度', 'A、B 各有一条强度滑轨，B 默认 60%。合并会把当前强度原样烘进立方体：屏幕上是什么样，导出就是什么样。'],
  ['按「合并 LUT」', '一次做两件事：把 A、B 按顺序烘成一个 33³ 立方体（35,937 个节点），并存进浏览器的「我的 LUT」。'],
  ['在「我的 LUT」里确认', '合并结果的名字是「A + B」，和导入的 .cube 放在一起，刷新页面之后还在。'],
  ['下载 .cube，拿去别的软件用', '合并的同时自动下载 33³ 的 .cube。在 Resolve / Premiere / Photoshop 里把强度设成 100%，看到的就是刚才屏幕上的结果。'],
];

const EN_STEPS = [
  ['Pick look A', 'Choose a built-in look from the filmstrip, or any .cube stored under My LUTs. A is the first layer in the stack.'],
  ['Turn on DUAL LUT and pick B', 'Press DUAL LUT in the toolbar to open the second slot, then choose a different look for B. B runs on the output of A.'],
  ['Set both strengths', 'A and B each have a strength slider; B starts at 60%. The merge bakes the current strengths into the cube, so what you see is what gets exported.'],
  ['Press MERGE', 'One press does two things: it bakes A and B, in order, into a 33³ cube (35,937 nodes) and saves it under My LUTs in the browser.'],
  ['Find it under My LUTs', 'The merged look is named “A + B”, sits next to your imported .cube files and survives a page reload.'],
  ['Download the .cube and use it elsewhere', 'The same press downloads the 33³ .cube. Load it in Resolve, Premiere or Photoshop at 100 % strength to get the result you just saw.'],
];

export default {
  slug: 'guides/merge-lut',
  hub: 'guides',
  kind: 'guide',
  priority: 0.8,
  changefreq: 'monthly',
  updated: '2026-11-19',
  readMinutes: 5,
  image: '/photos/dual.jpg',
  jsonLd: (lang) => [
    articleLd({
      lang,
      title: lang === 'zh' ? '合并 LUT：把两款 look 烘成一个 .cube' : 'Merge two LUTs into one downloadable .cube',
      description:
        lang === 'zh'
          ? '把叠加的两支 LUT 按强度合成一个 33³ 的 .cube，下载后可在 Resolve、Premiere、Photoshop 里直接使用。'
          : 'Bake two stacked LUTs and their strengths into one 33³ .cube you can download and load in Resolve, Premiere or Photoshop.',
      path: lang === 'zh' ? '/guides/merge-lut' : '/en/guides/merge-lut',
      image: '/photos/dual.jpg',
      updated: '2026-11-19',
      hub: lang === 'zh' ? '指南' : 'Guides',
    }),
    howToLd({
      lang,
      name: lang === 'zh' ? '把两支 LUT 合并成一个 .cube 并导出' : 'Merge two LUTs into one .cube and download it',
      description:
        lang === 'zh'
          ? '在浏览器里叠加两款 look、调好强度、烘成一个 33³ .cube，存进「我的 LUT」并导出给其他软件使用。'
          : 'Stack two looks in the browser, set both strengths, bake them into one 33³ .cube, keep it in My LUTs and export it for other software.',
      image: '/photos/dual.jpg',
      totalTime: 'PT2M',
      steps: lang === 'zh' ? ZH_STEPS : EN_STEPS,
    }),
  ],
  zh: {
    title: '合并 LUT：把两款 look 烘成一个 .cube',
    description: '两款 look 调好强度后烘成一个 33³ 的 .cube，存进「我的 LUT」并下载，Resolve、Premiere、Photoshop 都能直接用。',
    kicker: '指南 · 合并 LUT',
    h1: '把两支 LUT 合成一支，带出浏览器',
    lede: '这个编辑器可以同时叠两款 look：A 是底，B 叠在 A 的结果上，各自有强度。合并 LUT 会把这份叠加原样烘成一个 33³ 的 .cube，存进「我的 LUT」，同时下载到本地。',
    body: `<figure class="figure"><img src="/photos/dual.jpg" width="1400" height="875" alt="LUT ARCHIVE 编辑器打开双 LUT 时的界面，A 与 B 两个槽位分别选了一款 look" loading="lazy"><figcaption>双 LUT 状态：A、B 各自有强度滑轨，「合并 LUT」把当前的叠加烘成一个立方体。</figcaption></figure>

<h2 id="why">为什么要把两支 LUT 烘成一支</h2>
<p>最直接的用处是交付。Resolve、Premiere、Photoshop 的 LUT 槽位一次只认一个查找表；把 A + B 的叠加烘成一个 .cube，别人只要加载这一个文件，就能得到和你一样的调色，不需要知道你用了哪两款 look、强度各是多少。</p>
<p>第二个用处是留档。合并结果会存进浏览器的「我的 LUT」，和导入的 .cube 放在一起，之后还能像普通 look 一样被选中、被再次叠加。你可以把它当成「把当前这套调色冻结下来」的按钮。</p>
<p>第三个用处是一致性。合并执行的就是渲染器用的那条公式，不是另写一套近似算法，所以它不会在屏幕和导出文件之间引入第二套色彩逻辑。</p>

<h2 id="math">合并到底算了什么</h2>
<p>每个槽位做一次带强度的混合，A 先执行、B 后执行：</p>
<pre><code>v = 输入颜色
for 槽位 in [A, B]:
  s = 强度 / 100
  t = trilinear_sample(槽位.lut, v)
  v = v + (t - v) * s        // 即 mix(v, lut(v), s)
输出 = clamp(v, 0, 1)</code></pre>
<p>这就是着色器里的 <code>applyLut</code>：<code>mix(c, texture(lut, clamp(c,0,1)).rgb, s)</code>。合并时对 33³ 网格里的每个节点跑一遍同样的过程，把结果写成一个新的 33³ 立方体。源立方体用三线性插值读取，输出每个通道量化到 1/255——和网页里 LUT 纹理的精度完全一样。</p>
<p>经测试，把 A、B 的强度都放在 100% 去合并，再用这枚 .cube 在宿主软件里按 100% 强度渲染，画面和屏幕上的一致：两边算的是同一条式子、同一个节点网格、同一套量化。<a href="/guides/lut-size">LUT 精度实测</a>里解释过为什么 33³ 就是这批 look 的母版尺寸。</p>
<p>不想一支一支合并，也可以<a href="/download">一次下载全部 64 款 .cube</a>，在宿主软件里自己叠。</p>

<h2 id="file">导出的 .cube 里有什么</h2>
<p>文件是纯文本，四行文件头加 35,937 行 RGB 数值：</p>
<pre><code>TITLE "A + B"
LUT_3D_SIZE 33
DOMAIN_MIN 0 0 0
DOMAIN_MAX 1 1 1
0.07830 0.07540 0.07112
…</code></pre>
<p><code>TITLE</code> 是「A + B」这样的名字，<code>LUT_3D_SIZE 33</code> 告诉宿主软件立方体边长，<code>DOMAIN_MIN</code> / <code>DOMAIN_MAX</code> 声明输入范围是 0–1。数据行按 R 最快、其次 G、最后 B 的顺序排列，每行三个五位小数。33³ 的 .cube 是几百 KB 的文本文件——仓库里每一款内置 look 的 .cube 就在 840 KB 上下。</p>

<h2 id="order">顺序不能反，也不能当平均</h2>
<p>A 先跑 B 后跑，和 B 先跑 A 后跑不是同一个结果：B 的输入是 A 处理过的颜色，换过来它面对的输入分布就变了。两支各 50% 的叠加也不等于「平均两支 LUT」——每一层都是对上一层的输出做一次线性混合，颜色被推了两次，方向和单层完全不同。</p>
<p>这也是为什么合并前要先在屏幕上把强度调好：合并只是把当前状态固定下来，它不会替你做取舍。想要另一个顺序，把 B 放 A、A 放 B 再合并一次即可。</p>

<h2 id="reuse">合并后的 LUT 还能继续用吗</h2>
<p>可以。它出现在「我的 LUT」分类里，可以再当 A 或 B，和其他 look 继续叠。只挑一款 look 也能直接合并，那等于把这款内置 look 导出成 .cube，不需要打开双 LUT。</p>
<p>要注意每合并一次，输出都会重新量化到 8 位。叠三层时，正确做法是先把两款合成一款，再把结果和第三款合成，而不是反复拿中间文件来回烘；每多烘一次，舍入误差就多累积一次（哪怕很小）。</p>

<h2 id="use">在 Resolve / Premiere / Photoshop 里怎么用</h2>
<p>把下载的 .cube 载入宿主软件的 LUT 槽位：Resolve 的颜色节点、Premiere 的 Lumetri、Photoshop 的 Color Lookup 图层都能直接读。<strong>强度设成 100%</strong>——合并时 A、B 的强度已经烘进数值里，在宿主里再往下拉，等于在已经调好的画面上又加了一层减淡。</p>
<p>还有一点要匹配：这枚 .cube 是在显示编码（sRGB）空间里烘焙的，喂给它的画面也应该是显示编码的普通素材。如果输入是 F-Log、V-Log 这类 LOG 素材，要先做一次输入转换，否则结果会偏——原理和厂商 LOG LUT 一样，写在 <a href="/guides/what-is-lut">LUT 是什么</a>里。这也是这个编辑器先把 <a href="/guides/raw-in-browser">16 位 RAW 显影管线</a>跑完、再把 LUT 放在显示变换之后的原因。</p>
<p>打开<a href="/">编辑器</a>，拖一张照片进来，选两款 look、调好强度、按一下合并，就能得到你自己的第一枚 .cube。</p>`,
    faq: [
      [
        '合并是把两个 LUT 的数值相加吗？',
        '不是。它按槽位顺序执行 mix(v, lut(v), s)：A 的输出是 B 的输入，每一步都是原值和查表结果之间的线性混合，再整体裁到 0–1。合并结果与「两支数值相加再除以二」是两回事，后者在颜色上通常没有意义。',
      ],
      [
        '为什么同一枚 .cube 在 Premiere 里看起来和网页不一样？',
        '先确认两件事：宿主里的 LUT 强度是 100%，输入素材是显示编码（sRGB）而不是 LOG。宿主软件在 LUT 之前还有自己的色彩管理和色调映射，所以画面不会逐像素相同；但如果这两点都满足，色调走向会一致。',
      ],
      [
        '能合并 1D LUT 吗？',
        '能。导入时 1D LUT 会被烘焙成 33³ 的 3D 立方体（逐通道曲线映射到 RGB 三个轴），合并走的是同一条路径，所以导出的永远是 3D 33³ 的 .cube。',
      ],
    ],
  },
  en: {
    title: 'Merge two LUTs into one .cube for Resolve or Premiere',
    description: 'Stack two looks, set both strengths, bake them into a single 33³ .cube, keep it under My LUTs and download it for Resolve, Premiere or Photoshop.',
    kicker: 'GUIDE · MERGE LUTS',
    h1: 'Bake two LUTs into one and take it out of the browser',
    lede: 'The editor can stack two looks: A underneath, B on top of A’s output, each with its own strength. Press MERGE and the whole stack is baked into one 33³ .cube, saved under My LUTs and downloaded to your machine.',
    body: `<figure class="figure"><img src="/photos/dual.jpg" width="1400" height="875" alt="The LUT ARCHIVE editor with dual LUT enabled, showing one look in slot A and another in slot B" loading="lazy"><figcaption>Dual LUT mode: A and B have independent strength rails, and MERGE bakes the current stack into one cube.</figcaption></figure>

<h2 id="why">Why bake two LUTs into one</h2>
<p>The obvious reason is hand-off. A LUT slot in Resolve, Premiere or Photoshop takes one table at a time. Bake the A + B stack into a single .cube and the other person only has to load one file to get the grade you built — no explanation of which two looks were used or how strong each one was.</p>
<p>The second reason is keeping the grade. The merged look lands under My LUTs next to your imported .cube files, and from there it behaves like any other look: you can select it, stack it, and it is still there after a reload. It is effectively a freeze button for the current stack.</p>
<p>The third reason is consistency. The bake runs the same composition the renderer runs; it is not a second approximation, so no second colour model creeps in between the screen and the file.</p>

<h2 id="math">What the bake actually computes</h2>
<p>Each slot performs one strength-weighted blend, A first and B second:</p>
<pre><code>v = input colour
for slot in [A, B]:
  s = strength / 100
  t = trilinear_sample(slot.lut, v)
  v = v + (t - v) * s        // that is mix(v, lut(v), s)
output = clamp(v, 0, 1)</code></pre>
<p>That is exactly the shader’s <code>applyLut</code>: <code>mix(c, texture(lut, clamp(c,0,1)).rgb, s)</code>. The merge runs the same loop over every node of a 33³ grid and writes a new 33³ cube. Source cubes are read with trilinear interpolation, and the output is quantised to 1/255 per channel — the same precision as the LUT texture in the browser.</p>
<p>If both strengths are at 100 %, a host app that renders the downloaded .cube at 100 % strength reproduces the screen: same formula, same node grid, same quantisation. <a href="/en/guides/lut-size">The LUT precision measurement</a> explains why 33³ is the authored size for these looks.</p>
<p>If you would rather stack them in your own app, <a href="/en/download">download all 64 cubes</a> in one zip.</p>

<h2 id="file">What is in the exported .cube</h2>
<p>The file is plain text: four header lines and 35,937 rows of RGB values.</p>
<pre><code>TITLE "A + B"
LUT_3D_SIZE 33
DOMAIN_MIN 0 0 0
DOMAIN_MAX 1 1 1
0.07830 0.07540 0.07112
…</code></pre>
<p><code>TITLE</code> carries a name such as “A + B”, <code>LUT_3D_SIZE 33</code> tells the host app the edge length, and <code>DOMAIN_MIN</code> / <code>DOMAIN_MAX</code> declare a 0–1 input range. Rows are ordered with R fastest, then G, then B, three five-decimal numbers per line. A 33³ .cube is a few hundred KB of text — each built-in look in the repository is around 840 KB.</p>

<h2 id="order">The order is part of the grade</h2>
<p>A then B is not the same as B then A: B’s input is whatever A produced, so swapping the slots changes the colours it is asked to map. Two layers at 50% are not an average of two LUTs either — each layer mixes against the output of the previous one, so the colour is pushed twice and in a different direction.</p>
<p>Set the strengths before you merge, because the bake freezes the current state rather than making choices for you. If you want the other order, swap the slots and merge again.</p>

<h2 id="reuse">Can a merged LUT be used again?</h2>
<p>Yes. It appears in the My LUTs category and can be picked as A or B for another stack. Merging a single look works too: that is how you export one built-in look as a .cube without turning on dual mode.</p>
<p>Keep in mind that every merge re-quantises its output to 8 bits. With three looks, merge the first two, then merge that result with the third, rather than repeatedly re-baking intermediate files — each pass accumulates a little more rounding, even when it is small.</p>

<h2 id="use">Using it in Resolve, Premiere or Photoshop</h2>
<p>Load the downloaded .cube into a LUT slot: a colour node in Resolve, Lumetri in Premiere, a Color Lookup layer in Photoshop — all of them read this format. <strong>Set strength to 100 %</strong>. The strengths of A and B are already baked into the numbers; pulling the host slider down just flattens a grade that is already finished.</p>
<p>One more thing has to match: the cube was baked in display-encoded sRGB space, so feed it display-encoded footage. LOG footage such as F-Log or V-Log needs an input transform first, for the same reason vendor LOG LUTs do — that is covered in <a href="/en/guides/what-is-lut">what a LUT is</a>. It is also why this editor runs a whole <a href="/en/guides/raw-in-browser">16-bit RAW development pipeline</a> and puts the LUT after the display transform.</p>
<p>Open the <a href="/">editor</a>, drop a photo in, pick two looks, set the strengths and press merge — that is your first .cube.</p>`,
    faq: [
      [
        'Does merging add the two LUTs together?',
        'No. It runs mix(v, lut(v), s) per slot in order: A’s output is B’s input, and each step linearly blends the incoming value with the looked-up value before clamping to 0–1. That is not the same as averaging the two tables, which usually has no meaningful colour interpretation.',
      ],
      [
        'Why does the same .cube look different in Premiere than in the browser?',
        'Check two things first: the host LUT strength is 100 %, and the footage is display-encoded sRGB rather than LOG. Host apps have their own colour management and tone mapping before the LUT, so the result will not be pixel-identical, but with those two conditions met the grade goes the same way.',
      ],
      [
        'Can I merge 1D LUTs?',
        'Yes. On import a 1D LUT is baked onto a 33³ 3D grid — the per-channel curve is applied along each of the three axes — and the merge uses that grid. The exported file is always a 3D 33³ .cube.',
      ],
    ],
  },
};
