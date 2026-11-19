// Submit every URL in the sitemap to IndexNow (Bing, Yandex, Seznam, Naver).
// Runs after a deploy. The key file is a static asset at /{key}.txt, served by
// the Worker's clean-URL handler. Fail-soft: a ping outage never breaks a deploy.
//
// Usage: node scripts/indexnow.mjs
const KEY = '98695ba7201e729624ae26fb362daac3';
const HOST = 'lut.openanthropic.com';
const SITEMAP = `https://${HOST}/sitemap.xml`;

async function submit(urls) {
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: `https://${HOST}/${KEY}.txt`,
      urlList: urls,
    }),
  });
  console.log(`IndexNow: submitted ${urls.length} URLs — HTTP ${response.status}`);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(text.slice(0, 300));
  }
}

try {
  const sitemap = await fetch(SITEMAP, { signal: AbortSignal.timeout(20000) });
  if (!sitemap.ok) throw new Error(`sitemap fetch failed: HTTP ${sitemap.status}`);
  const xml = await sitemap.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  for (let i = 0; i < urls.length; i += 5000) await submit(urls.slice(i, i + 5000));
} catch (error) {
  console.error('IndexNow ping failed:', error?.message || error);
}
