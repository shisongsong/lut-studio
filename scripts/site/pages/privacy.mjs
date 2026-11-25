import { articleLd } from '../../site.mjs';

export default {
  slug: 'privacy',
  kind: 'guide',
  hub: null,
  priority: 0.4,
  changefreq: 'yearly',
  updated: '2026-11-25',
  jsonLd: (lang) => [
    articleLd({
      lang,
      title: lang === 'zh' ? '隐私政策' : 'Privacy policy',
      description:
        lang === 'zh'
          ? 'LUT ARCHIVE 如何处理你的照片与数据：照片不上传，没有账号，没有追踪 Cookie，只有一个汇总访问量的自有统计。'
          : 'How LUT ARCHIVE handles your photos and data: no upload, no account, no tracking cookies, one aggregate first-party counter.',
      path: lang === 'zh' ? '/privacy' : '/en/privacy',
      updated: '2026-11-25',
      hub: lang === 'zh' ? '隐私' : 'Privacy',
    }),
  ],
  zh: {
    title: '隐私政策：照片不上传，没有账号',
    description: '照片只在本机解码与渲染；没有账号、没有追踪 Cookie、没有第三方分析脚本。唯一的统计是本站自己记录的匿名访问计数。',
    kicker: '隐私',
    h1: '照片不离开这台电脑',
    lede: '这一页只陈述实际发生的事，不写法律套话。',
    body: `<h2 id="photos">照片</h2>
<p>照片在浏览器的 Web Worker 和 GPU 里解码、显影、渲染、导出。应用没有上传照片的接口，也没有任何代码会把图像数据发到服务器。你关掉标签页，照片就没了（除非你自己另存了导出的 JPEG）。<strong>统计请求里不包含照片、文件名、元数据或你导入的 LUT。</strong></p>

<h2 id="network">网络请求</h2>
<p>页面只会请求自己的资源：HTML、脚本、字体、示例图、LUT 数据包，以及第一次打开 RAW 时才下载的约 3.4 MB 解码器。此外有两个本站自己的接口：</p>
<ul>
  <li><code>/api/geo</code>：向 Cloudflare 查询你所在的国家代码，仅用于决定界面默认显示中文还是英文。</li>
  <li><code>/api/beacon</code>：匿名的访问统计，见下一节。如果你的浏览器开启了「请勿追踪」（DNT），这个请求根本不会发出。</li>
</ul>

<h2 id="measure">访问统计</h2>
<p>为了知道站点是否真的可用、哪些页面没人看、加载到底有多慢，本站记录一份汇总访问日志（存在 Cloudflare D1，不上传给任何第三方）。每次访问记录的内容只有：</p>
<ul>
  <li>访问的页面路径，以及来源网站的域名（例如 <code>google.com</code>，不记录完整来源链接）；</li>
  <li>浏览器自己生成的随机访客编号（存在本机 localStorage，和你的身份无关，清除浏览器数据即可重置）；</li>
  <li>界面语言、设备类型（桌面 / 平板 / 手机）、视口宽度；</li>
  <li>性能指标（加载耗时、最大内容绘制、布局偏移）与几个功能事件的名称（例如「打开了照片」「套用了某个 LUT」「导出了 JPEG」）；</li>
  <li>Cloudflare 边缘提供的两位国家代码。</li>
</ul>
<p>不记录：IP 地址（Worker 从不读取）、完整 User-Agent、Cookie、照片内容、文件名、你导入或合并的 LUT 内容、任何可以还原成具体个人的信息。项目不建立用户画像，也不把这些数据用于广告或出售。</p>
<p><strong>如何退出统计</strong>：在浏览器里开启「请勿追踪」（Do Not Track），或在开发者工具里执行一次 <code>localStorage.setItem('lut.noTrack','1')</code> 后刷新页面。退出后编辑器功能完全不受影响。</p>

<h2 id="local">本地存储</h2>
<ul>
  <li>你导入的 <code>.cube</code> LUT 存在浏览器的 IndexedDB 里，只在本机。</li>
  <li>界面语言、自动亮度开关这类偏好，以及上面那个随机访客编号，存在 localStorage。</li>
  <li>没有登录、没有 Cookie、没有第三方分析脚本、没有广告。</li>
</ul>

<h2 id="retention">保留时间</h2>
<p>访问日志只保留最近 180 天，之后由维护脚本删除；汇总报表里不含任何可以指向个人的字段。</p>

<h2 id="hosting">托管</h2>
<p>站点托管在 Cloudflare Workers 上。和所有网站一样，托管方会为传输和安全目的处理请求元数据（IP、User-Agent、时间）。项目本身不建立用户档案，也不把这些数据用于分析或营销。</p>

<h2 id="changes">变更</h2>
<p>如果这份政策有实质变化，会随代码一起提交，可以在 <a href="https://github.com/shisongsong/lut-studio" rel="noopener">仓库</a> 的历史里查到。这份统计是 2026-11-25 加入的。</p>`,
  },
  en: {
    title: 'Privacy policy: no uploads, no account',
    description: 'Photos are decoded and rendered on your machine only. No account, no tracking cookies, no third-party analytics — just one anonymous first-party visit counter.',
    kicker: 'PRIVACY',
    h1: 'Your photos stay on your computer',
    lede: 'This page only describes what actually happens. No legal boilerplate.',
    body: `<h2 id="photos">Photos</h2>
<p>Photos are decoded, developed, rendered and exported inside the browser, in a Web Worker and on the GPU. There is no upload endpoint and no code path that sends image data to a server. Close the tab and the photo is gone, unless you saved the exported JPEG yourself. <strong>The visit statistics never include your photo, its file name, its metadata, or any LUT you imported.</strong></p>

<h2 id="network">Network requests</h2>
<p>The page only requests its own assets: HTML, scripts, fonts, the sample photo, the LUT pack, and the ~3.4 MB decoder that is fetched the first time a RAW is opened. There are two endpoints of our own:</p>
<ul>
  <li><code>/api/geo</code> — returns a two-letter country code from Cloudflare, used solely to pick the initial interface language.</li>
  <li><code>/api/beacon</code> — the anonymous visit counter described below. If your browser sends Do Not Track, this request is never made at all.</li>
</ul>

<h2 id="measure">Visit statistics</h2>
<p>So that we can tell whether the site actually works, which pages nobody reads, and how slow the load really is, the site keeps one aggregate visit log (in Cloudflare D1, never sent to a third party). Each visit records only:</p>
<ul>
  <li>the page path, and the hostname of the referring site (e.g. <code>google.com</code> — never the full referring URL);</li>
  <li>a random visitor id the browser generates itself and keeps in localStorage; it is not derived from you, and clearing site data resets it;</li>
  <li>interface language, device class (desktop / tablet / phone), viewport width;</li>
  <li>performance numbers (load timing, largest contentful paint, layout shift) and the names of a few feature events (e.g. "opened a photo", "applied a LUT", "exported a JPEG");</li>
  <li>the two-letter country code supplied by Cloudflare's edge.</li>
</ul>
<p>Never recorded: IP address (the Worker never reads it), full User-Agent string, cookies, photo content, file names, imported or merged LUT contents, or anything that could be traced back to a person. No profiles are built, and the data is not sold or used for advertising.</p>
<p><strong>Opting out</strong>: enable Do Not Track in the browser, or run <code>localStorage.setItem('lut.noTrack','1')</code> once in the developer console and reload. The editor is unaffected.</p>

<h2 id="local">Local storage</h2>
<ul>
  <li><code>.cube</code> LUTs you import are stored in the browser's IndexedDB, on this machine only.</li>
  <li>Preferences such as interface language and the auto-brightness toggle, plus the random visitor id mentioned above, live in localStorage.</li>
  <li>No sign-in, no cookies, no third-party analytics, no ads.</li>
</ul>

<h2 id="retention">Retention</h2>
<p>Visit rows are kept for 180 days and then deleted by the maintenance script. Report output contains no per-person fields.</p>

<h2 id="hosting">Hosting</h2>
<p>The site runs on Cloudflare Workers. As with any website, the host processes request metadata (IP address, User-Agent, timestamp) for delivery and security. The project does not build user profiles or use that data for analytics or marketing.</p>

<h2 id="changes">Changes</h2>
<p>If this policy changes materially, the change lands with the code and is visible in the <a href="https://github.com/shisongsong/lut-studio" rel="noopener">repository</a> history. The visit counter was added on 2026-11-25.</p>`,
  },
};
