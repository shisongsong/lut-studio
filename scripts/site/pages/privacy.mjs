import { articleLd } from '../../site.mjs';

export default {
  slug: 'privacy',
  kind: 'guide',
  hub: null,
  priority: 0.4,
  changefreq: 'yearly',
  updated: '2026-11-19',
  jsonLd: (lang) => [
    articleLd({
      lang,
      title: lang === 'zh' ? '隐私政策' : 'Privacy policy',
      description:
        lang === 'zh'
          ? 'LUT ARCHIVE 如何处理你的照片与数据：照片不上传，没有账号，没有追踪 Cookie。'
          : 'How LUT ARCHIVE handles your photos and data: no upload, no account, no tracking cookies.',
      path: lang === 'zh' ? '/privacy' : '/en/privacy',
      updated: '2026-11-19',
      hub: lang === 'zh' ? '隐私' : 'Privacy',
    }),
  ],
  zh: {
    title: '隐私政策：照片不上传，没有账号',
    description: '照片只在本机解码与渲染；没有账号、没有追踪 Cookie。唯一网络请求是页面资源与界面语言用的国家查询。',
    kicker: '隐私',
    h1: '照片不离开这台电脑',
    lede: '这一页只陈述实际发生的事，不写法律套话。',
    body: `<h2 id="photos">照片</h2>
<p>照片在浏览器的 Web Worker 和 GPU 里解码、显影、渲染、导出。应用没有上传照片的接口，也没有任何代码会把图像数据发到服务器。你关掉标签页，照片就没了（除非你自己另存了导出的 JPEG）。</p>

<h2 id="network">网络请求</h2>
<p>页面只会请求自己的资源：HTML、脚本、字体、示例图、LUT 数据包，以及第一次打开 RAW 时才下载的约 3.4 MB 解码器。此外有一个 <code>/api/geo</code> 请求，向 Cloudflare 查询你所在的国家代码，仅用于决定界面默认显示中文还是英文；它不包含照片，也不会被写入数据库。</p>

<h2 id="local">本地存储</h2>
<ul>
  <li>你导入的 <code>.cube</code> LUT 存在浏览器的 IndexedDB 里，只在本机。</li>
  <li>界面语言、Fit/Fill 选择、自动亮度开关这类偏好存在 localStorage。</li>
  <li>没有登录、没有 Cookie 追踪、没有第三方分析脚本、没有广告。</li>
</ul>

<h2 id="hosting">托管</h2>
<p>站点托管在 Cloudflare Workers 上。和所有网站一样，托管方会为传输和安全目的处理请求元数据（IP、User-Agent、时间）。项目本身不建立用户档案，也不把这些数据用于分析或营销。</p>

<h2 id="changes">变更</h2>
<p>如果这份政策有实质变化，会随代码一起提交，可以在 <a href="https://github.com/shisongsong/lut-studio" rel="noopener">仓库</a> 的历史里查到。</p>`,
  },
  en: {
    title: 'Privacy policy: no uploads, no account',
    description: 'Photos are decoded and rendered on your machine only. No account, no tracking cookies; the only network requests are app assets and a country lookup.',
    kicker: 'PRIVACY',
    h1: 'Your photos stay on your computer',
    lede: 'This page only describes what actually happens. No legal boilerplate.',
    body: `<h2 id="photos">Photos</h2>
<p>Photos are decoded, developed, rendered and exported inside the browser, in a Web Worker and on the GPU. There is no upload endpoint and no code path that sends image data to a server. Close the tab and the photo is gone, unless you saved the exported JPEG yourself.</p>

<h2 id="network">Network requests</h2>
<p>The page only requests its own assets: HTML, scripts, fonts, the sample photo, the LUT pack, and the ~3.4 MB decoder that is fetched the first time a RAW is opened. There is one <code>/api/geo</code> request to Cloudflare that returns a two-letter country code, used solely to choose the initial interface language. It carries no photo data and is not written to a database.</p>

<h2 id="local">Local storage</h2>
<ul>
  <li><code>.cube</code> LUTs you import are stored in the browser's IndexedDB, on this machine only.</li>
  <li>Preferences such as interface language, Fit/Fill and the auto-brightness toggle are stored in localStorage.</li>
  <li>No sign-in, no tracking cookies, no third-party analytics, no ads.</li>
</ul>

<h2 id="hosting">Hosting</h2>
<p>The site runs on Cloudflare Workers. As with any website, the host processes request metadata (IP address, User-Agent, timestamp) for delivery and security. The project does not build user profiles or use that data for analytics or marketing.</p>

<h2 id="changes">Changes</h2>
<p>If this policy changes materially, the change lands with the code and is visible in the <a href="https://github.com/shisongsong/lut-studio" rel="noopener">repository</a> history.</p>`,
  },
};
