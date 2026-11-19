import { articleLd } from '../../site.mjs';

export default {
  slug: 'guides/lut-size',
  hub: 'guides',
  kind: 'guide',
  priority: 0.8,
  changefreq: 'monthly',
  updated: '2026-11-19',
  readMinutes: 6,
  image: '/photos/zoom.jpg',
  jsonLd: (lang) => [
    articleLd({
      lang,
      title:
        lang === 'zh'
          ? 'LUT 精度实测：17³ 到 33³，网页上该用多大'
          : 'How precise does a web LUT need to be? 17³ to 33³, measured',
      description:
        lang === 'zh'
          ? '同一组照片查询点实测 17³、21³、25³、33³ 的四档 LUT：三线性插值误差、最大偏差与 gzip 包体积。'
          : 'One photo-derived query set, four LUT sizes: mean and maximum trilinear error plus the gzipped pack cost of the 64 looks.',
      path: lang === 'zh' ? '/guides/lut-size' : '/en/guides/lut-size',
      image: '/photos/zoom.jpg',
      updated: '2026-11-19',
      hub: lang === 'zh' ? '指南' : 'Guides',
    }),
  ],
  zh: {
    title: 'LUT 精度实测：17³、21³、25³ 还是 33³',
    description: '同一组照片查询点实测四档 LUT：三线性插值平均误差、最大偏差和 gzip 包体积，说明 33³ 为什么精确、65³ 为什么没有收益。',
    kicker: '指南 · LUT 精度',
    h1: 'LUT 要做多精细，画质才看不出差别',
    lede: 'LUT 的精度就是立方体边长：17³ 有 4,913 个节点，33³ 有 35,937 个。我们用同一组照片查询点量了四档尺寸的插值误差，结论不是「越大越好」，而是要和作者写下的那个立方体对齐。',
    body: `<h2 id="measure">怎么测的，量到了什么</h2>
<p>方法很直接：以 33³ 的母版为参照，把同一款 look 重采样成 17³、21³、25³，再用三线性插值回答一组取自真实照片的查询点，逐通道比较相对母版的偏差。误差单位是 0–255 的色阶，不是百分比。被测的是这批 look 的颜色响应，不是显示器或相机。</p>
<table>
  <thead><tr><th>边长</th><th>平均误差（/255）</th><th>最大误差（/255）</th><th>64 款 look 的包体积</th></tr></thead>
  <tbody>
    <tr><td>17³</td><td>0.226</td><td>20.8</td><td>约 0.65 MB gzip</td></tr>
    <tr><td>21³</td><td>0.182</td><td>11.6</td><td>约 1.2 MB gzip</td></tr>
    <tr><td>25³</td><td>0.128</td><td>11.3</td><td>没有单独统计</td></tr>
    <tr><td>33³</td><td>0（与母版完全一致）</td><td>0</td><td>1.34 MB gzip（差值编码）</td></tr>
  </tbody>
</table>
<p>真正有用的是平均误差和最大误差之间的落差。17³ 的平均误差只有 0.226 个色阶，典型像素看上去不会有事；最大误差 20.8 个色阶却足够在平滑的天空渐变上留下一条条台阶。21³ 把最大值压到 11.6，25³ 是 11.3，到 33³ 两项一起归零。均值好看不代表安全，判断够不够用要看最大值落在哪。</p>

<h2 id="curvature">误差为什么长在曲线弯得最厉害的地方</h2>
<p>三线性插值做的事，是用周围 8 个节点按距离加权平均。如果这 8 个节点之间的映射是一条直线，结果就完全正确；如果映射在弯——暗部的趾部、高光的肩部、接近饱和的红、被扭过色相的肤色——加权平均就会把弯的地方拉直。误差大致随「曲线的弯曲程度 × 节点间距的平方」增长，节点间距减半，误差理论上降到四分之一左右。</p>
<p>这也解释了为什么均值和最大值差两个数量级。照片的绝大部分像素待在中间调，那里的响应接近线性，17³ 的 0.226 个色阶来自这里；最大误差出现在少数被推到拐点上的颜色——大面积渐变的天空、很饱和的红、暗部刚离开黑的地方——那里 17³ 的插值能差出 20.8 个色阶。人眼对平滑过渡里的固定台阶格外敏感，所以只看平均误差会高估小立方体的表现。</p>

<h2 id="exact">33³ 的误差为什么是 0</h2>
<p>因为这 64 款 look 本来就是以 33³ 写下来的：仓库里的每一个 <code>.cube</code> 都是 <code>LUT_3D_SIZE 33</code>，正好 35,937 行数值。拿 33³ 对照 33³，查询点落在作者给出的节点上，差值是 0。它精确不是因为边长足够大，而是因为它就是母版本身。</p>
<p>还有一层容易被忽略：渲染时像素几乎不会正好落在节点上，GPU 一直在节点之间做三线性插值。这一步不算误差，它就是 3D LUT 的定义方式——作者写下 33³ 的节点，等于约定节点之间按线性插值来读。所以「零误差」指的是和作者的数据一致，不是指屏幕上绝对没有插值。</p>

<h2 id="bigger">65³ 为什么没有可见收益</h2>
<p>65³ 每款 look 有 274,625 个节点，是 33³ 的 7.6 倍。64 款 look 全部算上约 52 MB 原始数据，下载、解压、显存都要跟着涨，但多出来的信息量是零：它只是在同一份 33³ 母版上采样得更密，不会比 33³ 离母版更近。33³ 已经把「和作者数据完全一致」做到了，再加密度只是把同一份折线画得更细。</p>
<p>网页端还有一笔隐形成本：LUT 是作为 3D 纹理传给着色器的，边长翻一倍，纹理占用的显存就是 8 倍。多出来的那点插值精度没人看得见，带宽和显存却都要付。</p>

<h2 id="pack">33³ 为什么只占 1.34 MB：差值编码</h2>
<p>33³ 的原始体积并不小：35,937 个节点 × 4 字节 × 64 款 ≈ 9.2 MB。能塞进 1.34 MB 的 gzip 包，是因为 LUT 是平滑的三维渐变，同一行里相邻两个节点通常只差几个色阶。打包时每个节点存成「与左边邻居的差值」，再用 gzip 压缩，体积从 9,199,880 字节降到 1,342,919 字节；解码时按行累加就能无损还原。文件头里记着边长和 look 数量，版本对不上可以直接拒绝，而不是把坏数据交给着色器。</p>
<p>这 64 款 look 在浏览器里是懒解码的：选中哪一款才解哪一款，一款约 2 ms。所以 1.34 MB 是网络传输量，不是启动时就要吃掉的显存——立方体也是按需上传的，一支 33³ 在 GPU 上约 140 KB。</p>

<h2 id="pick">所以一张要上网页的 LUT 该做多大</h2>
<dl class="facts">
  <div><dt>17³</dt><dd>包最小，均值不到 1 个色阶，最大值 20.8，渐变更容易出现台阶</dd></div>
  <div><dt>21³</dt><dd>最大误差减半到 11.6，整包约 1.2 MB gzip</dd></div>
  <div><dt>33³</dt><dd>和作者写下的立方体零误差，整包 1.34 MB gzip</dd></div>
  <div><dt>65³</dt><dd>约 52 MB / 64 款，没有可见收益</dd></div>
</dl>
<p>选择的关键是母版在哪一档。母版本来就是 33³ 时，没必要为了省几十万字节降到 21³：差值编码之后，33³ 的整包只比 21³ 大一点，最大误差却从 11.6 个色阶直接归零。反过来，母版是 17³ 的，硬升成 33³ 也不会变准，只会让文件变大——体积要花在有信息量的地方。</p>
<p>想看看这 64 款 look 实际长什么样，去<a href="/looks">look 目录</a>；想把自己叠加的两款 look 烘成一个可下载的 .cube，做法在<a href="/guides/merge-lut">合并 LUT</a>；想在浏览器里直接对着一张 RAW 验证这些渐变，打开<a href="/">编辑器</a>拖一张照片进去就行。</p>`,
    faq: [
      [
        '为什么 17³ 的平均误差不到 1 个色阶，还说它不够？',
        '平均值被中间调的像素稀释了。照片的大部分颜色落在响应接近线性的区域，插值几乎不产生偏差；最大误差出现在曲线拐点上，17³ 能达到 20.8 个色阶，而台阶恰好最容易被眼睛在一大片平滑渐变里抓到。判断标准应该看最大值，不是平均值。',
      ],
      [
        '为什么 21³ 和 25³ 的最大误差几乎一样？',
        '最大误差由整批 look 里弯曲最厉害的那一处决定，那一点往往已经贴近拐点或者色域边缘。从 21³ 到 25³ 节点变密了，均值明显下降（0.182 → 0.128），但最坏那一点的弯曲没有被抹平，所以最大值只从 11.6 降到 11.3。到 33³ 直接对上母版数据，才归零。',
      ],
      [
        '把 33³ 的 look 存成 65³ 会不会更准？',
        '不会。33³ 已经是作者给出的数据本身，65³ 只是把同一份数据采样得更密，信息量没有增加；64 款 look 的原始体积却会涨到约 52 MB。要更准只能改母版（重新写配方），不能靠提高采样密度。',
      ],
    ],
  },
  en: {
    title: 'How precise should a LUT be? 17³ to 33³, measured',
    description: 'One photo-derived query set, four LUT sizes: mean and maximum trilinear error, gzip pack cost, why 33³ is exact and why 65³ buys nothing visible.',
    kicker: 'GUIDE · LUT PRECISION',
    h1: 'How precise does a LUT have to be before the difference disappears',
    lede: 'A LUT’s precision is its cube edge: 17³ holds 4,913 nodes, 33³ holds 35,937. We ran one photo-derived query set through four sizes, and the answer is not “bigger is better” — it is “match the cube the look was authored on”.',
    body: `<h2 id="measure">How it was measured</h2>
<p>The reference is the authored 33³ cube. The look was resampled to 17³, 21³ and 25³, then sampled with trilinear interpolation at query points taken from real photographs. Every channel was compared against the authored cube, in code values of 0–255 rather than percentages. What is under test is the colour response of these looks — not a monitor and not a camera.</p>
<table>
  <thead><tr><th>Edge</th><th>Mean error (/255)</th><th>Max error (/255)</th><th>Pack for 64 looks</th></tr></thead>
  <tbody>
    <tr><td>17³</td><td>0.226</td><td>20.8</td><td>~0.65 MB gzip</td></tr>
    <tr><td>21³</td><td>0.182</td><td>11.6</td><td>~1.2 MB gzip</td></tr>
    <tr><td>25³</td><td>0.128</td><td>11.3</td><td>not measured separately</td></tr>
    <tr><td>33³</td><td>0 (identical to authored)</td><td>0</td><td>1.34 MB gzip, delta-coded</td></tr>
  </tbody>
</table>
<p>The gap between mean and maximum is the part that matters. At 17³ the mean is 0.226 of a code value, so a typical pixel looks fine; the maximum of 20.8 is more than enough to leave visible steps across a smooth sky gradient. 21³ halves the worst case to 11.6, 25³ sits at 11.3, and 33³ takes both numbers to zero. A comfortable average does not mean a safe worst case.</p>

<h2 id="curvature">Error lives where the curve bends hardest</h2>
<p>Trilinear interpolation takes the eight surrounding nodes and weights them by distance. If the mapping between those nodes is a straight line, the result is exact; if it bends — a shadow toe, a highlight shoulder, near-saturated red, a hue that has been rotated — averaging pulls the bend straight. The error grows roughly with curvature times the square of the node spacing, so halving the spacing should cut it to about a quarter in smooth regions.</p>
<p>That also explains why mean and maximum are two orders of magnitude apart. Most pixels in a photograph sit in the midtones, where the response is close to linear, and that is where the 0.226 mean at 17³ comes from. The maximum lands on the few colours that sit near a kink: a wide gradient in the sky, a saturated red, the first values above black. Those are also exactly the places where a fixed step in a smooth ramp is easy to see, which is why the mean flatters a small cube.</p>

<h2 id="exact">Why 33³ has zero error</h2>
<p>Because these 64 looks were authored at 33³ in the first place: every <code>.cube</code> in the repository is <code>LUT_3D_SIZE 33</code> with exactly 35,937 rows. Compare 33³ with 33³ and the query lands on the numbers the author wrote — the difference is zero. It is exact not because the edge is large enough, but because it is the source data.</p>
<p>One nuance is easy to miss: a real pixel almost never lands on a node, so the GPU interpolates trilinearly all the time. That is not error, it is the definition of a 3D LUT — writing 33³ nodes is a statement that everything between them should be read linearly. “Zero error” means agreement with the authored data, not the absence of interpolation on screen.</p>

<h2 id="bigger">Why 65³ buys nothing visible</h2>
<p>A 65³ look has 274,625 nodes, 7.6 times as many as 33³. Across 64 looks that is roughly 52 MB of raw data before compression, which every download, inflate and GPU upload has to pay for — and the extra information is zero. It is the same authored data sampled more densely, so it cannot get closer to the source than 33³ already is. Once the error against the authored cube is zero, more nodes only draw the same polyline in finer ink.</p>
<p>On the web there is a second cost: the LUT is uploaded as a 3D texture, and doubling the edge multiplies its texture memory by eight. Nobody sees the extra interpolation accuracy; everybody pays the bandwidth.</p>

<h2 id="pack">Why 33³ costs only 1.34 MB: delta coding</h2>
<p>The raw size of 33³ is not small: 35,937 nodes × 4 bytes × 64 looks ≈ 9.2 MB. It fits in a 1.34 MB gzip pack because a LUT is a smooth 3D gradient, and neighbouring samples along a row usually differ by only a few code values. The pack stores each sample as its difference from the neighbour to the left, gzips the diffs, and shrinks the payload from 9,199,880 bytes to 1,342,919 bytes; the decoder adds the diffs back losslessly. A small header records the edge and look count, so a stale pack can be rejected instead of feeding bad data to the shader.</p>
<p>The 64 looks are decoded lazily in the browser: only the look you select is inflated, at about 2 ms per look. The 1.34 MB is the network payload, not resident texture memory — cubes are uploaded on demand, and one 33³ cube is about 140 KB of GPU texture.</p>

<h2 id="pick">So how big should a web LUT be</h2>
<dl class="facts">
  <div><dt>17³</dt><dd>smallest pack, mean under 1 code value, max 20.8, banding risk on gradients</dd></div>
  <div><dt>21³</dt><dd>worst case halved to 11.6, pack around 1.2 MB gzip</dd></div>
  <div><dt>33³</dt><dd>zero error against the authored cube, 1.34 MB gzip</dd></div>
  <div><dt>65³</dt><dd>about 52 MB for 64 looks, nothing visible gained</dd></div>
</dl>
<p>The decision follows the source cube. If the look was authored at 33³, do not drop to 21³ to save a few hundred kilobytes: with delta coding the whole 33³ pack is only slightly larger than the 21³ one, while the worst-case error goes from 11.6 code values to zero. If the source really is 17³, resampling it to 33³ does not make it accurate — it only makes the file bigger. Spend size where the information actually is.</p>
<p>To see the 64 looks in action, browse the <a href="/en/looks">look catalogue</a>; to bake two stacked looks into one downloadable .cube, read <a href="/en/guides/merge-lut">merging LUTs</a>; to check the gradients against a real RAW, open the <a href="/">editor</a> and drop a photo in.</p>`,
    faq: [
      [
        'A mean error under one code value at 17³ sounds fine — why is it not?',
        'The mean is diluted by midtone pixels. Most colours in a photo sit where the response is nearly linear and interpolation barely deviates; the maximum error lands on the bends, and at 17³ it reaches 20.8 code values. A fixed step is most visible exactly there, in a wide smooth gradient, which is why the maximum is the honest number.',
      ],
      [
        'Why do 21³ and 25³ have almost the same maximum error?',
        'The maximum is set by the sharpest bend in the whole set of looks, and that point usually sits near an extreme or a gamut edge. Going from 21³ to 25³ adds nodes and pulls the mean down (0.182 to 0.128), but the worst bend is not smoothed away, so the maximum only moves from 11.6 to 11.3. At 33³ the samples coincide with the authored data, and it drops to zero.',
      ],
      [
        'Would storing a 33³ look at 65³ make it more accurate?',
        'No. 33³ is already the authored data; 65³ is the same data sampled more densely, with no added information — and the raw size for 64 looks grows to roughly 52 MB. Accuracy can only improve by changing the source (rewriting the recipe), not by sampling it harder.',
      ],
    ],
  },
};
