import { articleLd } from '../../site.mjs';

export default {
  slug: 'guides/what-is-lut',
  hub: 'guides',
  kind: 'guide',
  priority: 0.9,
  changefreq: 'monthly',
  updated: '2026-11-19',
  readMinutes: 7,
  image: '/photos/home-desktop.jpg',
  jsonLd: (lang) => [
    articleLd({
      lang,
      title: lang === 'zh' ? 'LUT 是什么：1D 与 3D、.cube 格式与 LOG 输入' : 'What is a LUT? 1D vs 3D, .cube files and log input',
      description:
        lang === 'zh'
          ? '查找表的基础：1D 与 3D 的区别、.cube 里的 LUT_3D_SIZE、厂商 LOG LUT 的输入前提，以及强度混合与高光裁切。'
          : 'Look-up table basics: 1D versus 3D, what LUT_3D_SIZE means, the log input that vendor LUTs expect, and why a LUT cannot recover clipped highlights.',
      path: lang === 'zh' ? '/guides/what-is-lut' : '/en/guides/what-is-lut',
      image: '/photos/home-desktop.jpg',
      updated: '2026-11-19',
      hub: lang === 'zh' ? '指南' : 'Guides',
    }),
  ],
  zh: {
    title: 'LUT 是什么：1D、3D、.cube 与 LOG 输入',
    description: 'LUT 是输入颜色换成输出颜色的查找表。讲清 1D 与 3D 的区别、.cube 里的 LUT_3D_SIZE、厂商 LOG LUT 的输入前提，以及强度滑块和裁切高光。',
    kicker: '指南 · LUT 基础',
    h1: 'LUT 是一张颜色对照表，不是一层滤镜',
    lede: 'LUT（look-up table，查找表）把一组输入颜色换成另一组输出颜色。1D 和 3D 能做的事差很远，厂商 LUT 还要求输入是 LOG 编码；前提弄错，画面会发暗、发硬而且偏色。',
    body: `<h2 id="what">一张表：输入颜色进，输出颜色出</h2>
<p>3D LUT 是一块立方体数据，三条轴都是 0–1 的 RGB 取值，边长 n 表示每个通道被切成 n 个节点，所以整块表有 n³ 个节点。渲染时，像素的 RGB 在立方体里定位，读出周围 8 个节点的值，用三线性插值算出一个新的 RGB。它不改变结构、不改变锐度，只改变颜色落在哪儿。</p>
<p>行业通用的交换格式是 <code>.cube</code>，纯文本：</p>
<pre><code>TITLE "奶油高光"
LUT_3D_SIZE 33
DOMAIN_MIN 0 0 0
DOMAIN_MAX 1 1 1
0.07830 0.07540 0.07112
…</code></pre>
<p><code>LUT_3D_SIZE 33</code> 表示边长 33，文件里就要有 35,937 行 RGB 数值；<code>DOMAIN_MIN</code> / <code>DOMAIN_MAX</code> 声明输入范围，通常是 0–1。数据行的顺序是 R 变化最快、其次 G、最后 B。1D LUT 用 <code>LUT_1D_SIZE</code>，行数少得多：n 行 RGB 数值，三个通道各查一条曲线。</p>
<p>这个编辑器支持 3D LUT（<code>LUT_3D_SIZE</code> 2–128）和 1D LUT，导入时会在本地解析：<code>.cube</code> 是一段文本，可能带 UTF-8 BOM；解析后存进浏览器的 IndexedDB，文件不经过任何服务器（细节见<a href="/privacy">隐私说明</a>）。1D 会被烘到一张 33³ 的网格上，这样渲染器只需要处理一种数据。</p>

<h2 id="1d-3d">1D 和 3D 差在哪</h2>
<table>
  <thead><tr><th></th><th>1D LUT</th><th>3D LUT</th></tr></thead>
  <tbody>
    <tr><td>数据</td><td>每个通道一张曲线，n 个采样点</td><td>n³ 个 RGB 三元组，33³ 是 35,937 个</td></tr>
    <tr><td>怎么查表</td><td>三个通道各查各的：f(R)、g(G)、h(B)</td><td>用 RGB 一起定位，三线性插值</td></tr>
    <tr><td>能做什么</td><td>黑位、白位、gamma、单通道偏移这类逐通道曲线</td><td>任意颜色映射：色相旋转、去饱和、胶片式交叉染色、色域压缩</td></tr>
    <tr><td>做不到什么</td><td>跨通道效果：单独抽掉某个色相、把彩色转成黑白</td><td>不增加信息；节点之间仍然靠插值得到</td></tr>
  </tbody>
</table>
<p>关键区别在「通道之间能不能互相影响」。1D LUT 对 R、G、B 分别算，红色通道的结果永远不会参考绿色；胶片那种红往青里跑、蓝色高光偏暖的交叉染色，以及把画面真正压成黑白（三个通道按亮度重新分配），都必须有 3D LUT 才能表达。所以内置的 64 款 look 全部是 33³ 的立方体，<a href="/guides/lut-size">测量它们的精度</a>时量的也是 3D 立方体。</p>

<h2 id="log">为什么厂商 LUT 要 LOG 输入，直接套普通照片会怎样</h2>
<p>LOG 是一种把场景亮度摊开的编码：它把暗部抬起来，让 0–1 的码值装下远超显示范围的动态范围，而不是像 sRGB 那样按显示对比度分配。相机厂商发布的 F-Log、F-Log2、V-Log LUT，都是针对「已经按对应 LOG 曲线编码的输入」设计的——表里的每个输入码值都对应一个明确的场景亮度。</p>
<p>普通照片是显示编码的 sRGB。同一档暗部亮度，在 LOG 编码里的码值比 sRGB 里高得多。把 LOG LUT 直接套上去，相当于告诉它「这些暗部比你想象的暗得多」，出来的画面就会整体发暗、暗部发死，颜色也会因为查表位置错位而偏掉或过饱和。这不是 LUT 做错了，是输入条件不成立。</p>
<p>这个编辑器在套 LUT 之前有一个输入色彩空间选项：sRGB、F-Log、F-Log2、V-Log。选 LOG 时，它先把显示值转回线性，再按对应 LOG 的公开传递函数重新编码，然后才查表；导入的 .cube 文件名或标题里带 F-Log / V-Log 时，这个选项会自动切过去。色域仍按 sRGB 处理，所以厂商 LUT 的结果是接近，而不是逐字节一致。</p>

<h2 id="strength">强度滑块到底在混什么</h2>
<p>这一步的公式很简单：<code>mix(v, lut(v), strength)</code>。强度 0 时输出等于输入，100 时输出完全等于查表结果，中间就是两个数值之间的一条直线。它不是「把 LUT 的参数改小」，而是按比例把原图和调色结果兑在一起。</p>
<p>所以重口味的 look 拉到 50% 不会变成一款温和的 look，只会变成一张「一半原色、一半风格」的画面：对比被稀释，饱和度显得更平。厂商 LOG LUT 用在普通照片上时，编辑器给的建议强度是 30–60%，原因就在这儿——先小剂量找回一点风格，别指望一张为 LOG 设计的表在 sRGB 上等效。</p>
<p>叠两款 look 时，每一层都各自混一次，A 的结果是 B 的输入；这套顺序和混合方式会被原样烘进合并出来的 .cube，具体做法见<a href="/guides/merge-lut">合并 LUT</a>；全部 64 款也可以<a href="/download">打包下载 .cube</a>。</p>

<h2 id="cannot">LUT 救不回已经死白的高光</h2>
<p>LUT 是逐像素换色：它读一个现有的 RGB，吐出另一个 RGB。如果一个像素的三个通道都已经卡在 1.0，它在表里只能被映射成某个固定的输出值——整块死白区域都会变成同一种颜色，里面本来有的天空层次、云、灯泡边缘，LUT 一个也变不出来。同理，它也修不了白平衡失准的片子：单个通道被裁掉之后，那个通道的信息已经没了。查表时输入还会被截断（clamp）到 0–1，超过 1 的数据在 LUT 这一层不被考虑。</p>
<p>这就是为什么这个编辑器先跑完整条 RAW 管线：RAW 按 16 位解码，保留 4 档高于白的场景余量，显示变换用 darktable 的 <a href="https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/sigmoid/" rel="noopener">sigmoid</a>——在 0…∞ 上单调、渐近逼近白点而不裁切，高光是被压缩进可见范围，而不是被砍掉。显影完、映射到显示空间之后，LUT 才接手。处理顺序见<a href="/guides/raw-in-browser">在浏览器里打开 RAW</a>。</p>

<h2 id="pipeline">在这台编辑器里，LUT 排在管线的哪一步</h2>
<ol>
  <li><strong>解码与显影。</strong>RAW 在 Web Worker 里解成 16 位场景线性帧，曝光、白平衡、高光阴影都在线性空间处理，真实的高于白数据还在。</li>
  <li><strong>显示变换。</strong>sigmoid 把场景线性压缩到 0–1 的显示值，保持单调，不裁切。</li>
  <li><strong>输入色彩空间（可选）。</strong>套厂商 LOG LUT 时，把显示值按对应 LOG 曲线重新编码。</li>
  <li><strong>LUT。</strong>A 槽位按强度混合，开了双 LUT 再走 B 槽位；两者都按 <code>mix(v, lut(v), s)</code> 执行。</li>
  <li><strong>导出。</strong>JPEG 按 50 / 75 / 100% 源图长边渲染，和屏幕共用同一条管线。</li>
</ol>
<dl class="facts">
  <div><dt>3D 立方体</dt><dd>33³ = 35,937 个节点</dd></div>
  <div><dt>导入格式</dt><dd>.cube：LUT_3D_SIZE 2–128，1D 也支持</dd></div>
  <div><dt>输入色彩空间</dt><dd>sRGB / F-Log / F-Log2 / V-Log</dd></div>
  <div><dt>强度</dt><dd>0–100% 的线性 mix，不是参数插值</dd></div>
</dl>
<p>看懂这几个前提，再回头用 <a href="/looks">64 款内置 look</a> 或导入自己的 .cube，就大致能预判一个 LUT 在你手头的素材上是否成立。想直接验证，打开<a href="/">编辑器</a>拖一张 RAW 进去，把同一款 look 的强度从 100 拉到 0 看一遍就行。</p>`,
    faq: [
      [
        'LUT 和滤镜、预设有什么区别？',
        'LUT 是一张固定的颜色映射表，只有「强度」这一个可调项，调完就不能再改它的内部逻辑；预设（比如 .xmp）存的是一组滑块参数，加载后还能继续调。这个编辑器不支持 .xmp 预设，彩色风格以 LUT 的形式进来：内置 look 或你导入的 .cube。',
      ],
      [
        '普通照片直接套厂商 LOG LUT，为什么画面发暗发硬？',
        '因为 LOG LUT 假设输入是 LOG 编码。LOG 把暗部抬得很高，普通 sRGB 照片的暗部码值比 LUT 预期的低得多，它就会把画面当成比实际更暗的场景来处理，结果偏暗、暗部发死、颜色错位。先把输入色彩空间切到对应的 F-Log 或 V-Log，再套这支 LUT，结果才对。',
      ],
      [
        'LUT 能救回已经过曝的高光吗？',
        '不能。LUT 只重映射每个像素现有的颜色，已经被裁到 1.0 的通道没有可恢复的层次，所有死白像素只会被映射成同一个固定值。要保住高光，必须在 LUT 之前处理：保留高于白的场景数据，再用单调的色调映射压回可见范围，这也是这个编辑器先显影 RAW、后套 LUT 的原因。',
      ],
    ],
  },
  en: {
    title: 'What is a LUT? 1D vs 3D, .cube files and log input',
    description: 'A LUT maps input colours to output colours. What 1D and 3D can do, what LUT_3D_SIZE means, the log input vendor LUTs expect, and why clipped highlights stay clipped.',
    kicker: 'GUIDE · LUT BASICS',
    h1: 'A LUT is a colour table, not a filter',
    lede: 'A look-up table takes a colour in and returns another colour out. A 1D table and a 3D table can do very different things, and vendor LUTs assume log-encoded input — get that precondition wrong and the image turns dark, harsh and off-colour.',
    body: `<h2 id="what">A table: colours go in, colours come out</h2>
<p>A 3D LUT is a cube of data. Each axis is an RGB channel running from 0 to 1, the edge n says how many nodes each channel is cut into, so the table holds n³ nodes. To render a pixel, its RGB is located inside the cube, the eight surrounding nodes are read, and trilinear interpolation produces a new RGB. It does not touch structure or sharpness — it only moves colours around.</p>
<p>The interchange format is <code>.cube</code>, plain text:</p>
<pre><code>TITLE "Cream Highlight"
LUT_3D_SIZE 33
DOMAIN_MIN 0 0 0
DOMAIN_MAX 1 1 1
0.07830 0.07540 0.07112
…</code></pre>
<p><code>LUT_3D_SIZE 33</code> means an edge of 33, so the file must contain 35,937 rows of RGB values; <code>DOMAIN_MIN</code> / <code>DOMAIN_MAX</code> declare the input range, normally 0–1. Rows are ordered with R changing fastest, then G, then B. A 1D LUT uses <code>LUT_1D_SIZE</code> and stores far fewer rows — n rows of RGB, one curve per channel.</p>
<p>This editor imports 3D LUTs (<code>LUT_3D_SIZE</code> 2–128) and 1D LUTs, parsing the file locally: a .cube is text, possibly with a UTF-8 BOM; it is stored in the browser’s IndexedDB and never sent anywhere (the details are in the <a href="/en/privacy">privacy note</a>). A 1D file is baked onto a 33³ grid so the renderer only ever deals with one kind of data.</p>

<h2 id="1d-3d">1D versus 3D</h2>
<table>
  <thead><tr><th></th><th>1D LUT</th><th>3D LUT</th></tr></thead>
  <tbody>
    <tr><td>Data</td><td>one curve per channel, n samples each</td><td>n³ RGB triplets, 35,937 at 33³</td></tr>
    <tr><td>Lookup</td><td>each channel maps alone: f(R), g(G), h(B)</td><td>all three channels index the cube, then trilinear interpolation</td></tr>
    <tr><td>Can do</td><td>black point, white point, gamma, per-channel shifts</td><td>any colour mapping: hue rotation, desaturation, film-style cross-talk, gamut compression</td></tr>
    <tr><td>Cannot do</td><td>cross-channel effects: pull one hue only, convert colour to monochrome</td><td>add information; values between nodes are still interpolated</td></tr>
  </tbody>
</table>
<p>The decisive difference is whether channels can influence each other. A 1D LUT evaluates R, G and B separately, so the red channel never consults green. The cross-talk of film — red drifting towards cyan, warm blue highlights — and a genuine black-and-white conversion that redistributes all three channels by luminance both need a 3D table. That is why all 64 built-in looks are 33³ cubes, and why <a href="/en/guides/lut-size">the precision measurement</a> measures 3D cubes.</p>

<h2 id="log">Why vendor LUTs want log input — and what sRGB does to them</h2>
<p>Log encoding spreads scene brightness out: it lifts the shadows so that the 0–1 code range holds far more dynamic range than a display, instead of following display contrast the way sRGB does. The F-Log, F-Log2 and V-Log LUTs published by camera makers are designed for input already encoded with that curve — every input code value corresponds to a specific scene luminance.</p>
<p>An ordinary photograph is display-encoded sRGB. The same shadow detail sits at a far higher code value in log than it does in sRGB. Feed the sRGB value to a log LUT and you are telling it “this shadow is far darker than it is”, so the result comes out dark and crushed, and colours drift or oversaturate because every lookup happens at the wrong place in the cube. The LUT is not broken; its input precondition is not met.</p>
<p>This editor has an input colour space setting in front of the LUT: sRGB, F-Log, F-Log2, V-Log. With a log profile selected it converts the display value back to linear, re-encodes it with the published transfer function, and only then samples the table; when an imported .cube has F-Log or V-Log in its name or title, the setting switches automatically. Gamut is still treated as sRGB, so vendor LUTs land close but not byte-exact.</p>

<h2 id="strength">What the strength slider actually mixes</h2>
<p>The grading step is <code>mix(v, lut(v), strength)</code>. At 0 the output equals the input, at 100 it equals the table’s output, and in between it is a straight line between the two values. It does not shrink the LUT’s parameters; it blends the original image and the graded image in proportion.</p>
<p>So a heavy look at 50 % does not become a gentler look — it becomes half original colour and half style: contrast is diluted and saturation looks flatter. This is also why the editor suggests 30–60 % when a vendor log LUT is used on an ordinary photo: take a small dose of the look, and do not expect a table designed for log to behave as an sRGB grade.</p>
<p>When two looks are stacked, each layer mixes once and A’s output becomes B’s input; that order and blend are baked verbatim into a merged .cube — see <a href="/en/guides/merge-lut">merging LUTs</a>.</p>

<h2 id="cannot">A LUT cannot bring clipped highlights back</h2>
<p>A LUT is a per-pixel colour swap: it reads an existing RGB and returns another RGB. If all three channels of a pixel are pinned at 1.0, the table can only map that to some fixed output value — every fully clipped highlight collapses to one colour, so the sky gradient or the lamp edge that used to be there is gone. The same applies when a single channel is clipped in a badly white-balanced shot: once it is clipped, that channel’s information is not there to recover. Lookup inputs are also clamped to 0–1, so values above 1 are not even considered at the LUT stage.</p>
<p>That is why this editor runs the whole RAW pipeline first: the RAW is decoded at 16 bits with four stops of scene headroom above white, and the display transform uses darktable’s <a href="https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/sigmoid/" rel="noopener">sigmoid</a> — monotone on 0…∞ and asymptotic to the white target rather than clipping, so highlights are compressed into the visible range instead of cut off. Only after development and the display transform does the LUT take over. The processing order is described in <a href="/en/guides/raw-in-browser">opening a RAW in the browser</a>.</p>

<h2 id="pipeline">Where the LUT sits in this editor’s pipeline</h2>
<ol>
  <li><strong>Decode and develop.</strong> The RAW becomes a 16-bit scene-linear frame in a Web Worker; exposure, white balance, highlights and shadows act in linear space, with the real above-white data still present.</li>
  <li><strong>Display transform.</strong> Sigmoid compresses scene-linear into 0–1 display values, monotone and without clipping.</li>
  <li><strong>Input colour space (optional).</strong> For vendor log LUTs, the display value is re-encoded with the matching log curve.</li>
  <li><strong>LUT.</strong> Slot A mixes by strength; with dual LUTs enabled, slot B follows. Both run <code>mix(v, lut(v), s)</code>.</li>
  <li><strong>Export.</strong> JPEG at 50 / 75 / 100 % of the source long edge, from the same pipeline the screen uses.</li>
</ol>
<dl class="facts">
  <div><dt>3D cube</dt><dd>33³ = 35,937 nodes</dd></div>
  <div><dt>Import</dt><dd>.cube: LUT_3D_SIZE 2–128, 1D too</dd></div>
  <div><dt>Input profiles</dt><dd>sRGB / F-Log / F-Log2 / V-Log</dd></div>
  <div><dt>Strength</dt><dd>a 0–100 % linear mix, not parameter interpolation</dd></div>
</dl>
<p>With those preconditions in mind, the <a href="/en/looks">64 built-in looks</a> and any .cube you import become predictable on your own footage. To check it directly, open the <a href="/">editor</a>, drop in a RAW and sweep one look’s strength from 100 to 0.</p>`,
    faq: [
      [
        'How is a LUT different from a filter or a preset?',
        'A LUT is a fixed colour mapping with exactly one dial — strength — and its internal logic cannot be edited once it is a table. A preset such as .xmp stores slider values that stay editable after loading. This editor does not support .xmp presets; colour styles arrive as LUTs: a built-in look or a .cube you import.',
      ],
      [
        'Why does a vendor log LUT make an ordinary photo go dark and harsh?',
        'Because the LUT assumes log-encoded input. Log lifts the shadows, so an sRGB photo’s shadow code values are far lower than the table expects; the LUT treats them as a much darker scene, and the result is dark and crushed with shifted colours. Switch the input colour space to the matching F-Log or V-Log profile before applying that LUT.',
      ],
      [
        'Can a LUT recover blown highlights?',
        'No. A LUT only remaps colours that are already there. A channel clipped at 1.0 has no recoverable detail, and every clipped pixel maps to one fixed value. Highlights have to be protected before the LUT: keep the above-white scene data and compress it with a monotone tone map — which is why this editor develops the RAW first and applies LUTs afterwards.',
      ],
    ],
  },
};
