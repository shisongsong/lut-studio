# Search / answer-engine (SEO · AEO · GEO) setup

The editor at `/` is a canvas, so nothing on it is readable by a crawler. The
readable surface is generated as static HTML from `scripts/site/pages/*.mjs`.
This file records how that works and the two things only the account owner can
do.

## Build and check

```sh
npm run build:site      # writes public/**.html, sitemap.xml, robots.txt, llms*.txt, looks.json
npm run seo:audit       # title/description/canonical/h1/JSON-LD/internal links, live sitemap
npm run seo:validate    # parses every JSON-LD block and every hreflang pair
npm run indexnow        # submits the sitemap to Bing/Yandex (after a deploy)
```

`BASE=http://127.0.0.1:8804 npm run seo:audit` audits a local `wrangler dev`
server before deploying; both scripts rewrite the sitemap host to `BASE` and
compare canonicals by path, so a local run has the same guarantees.

`node scripts/build-site.mjs --check` validates the page modules without
writing anything (used while copy is being edited).

## Page contract

One module per page family in `scripts/site/pages/`, default export:

```js
{
  slug: 'guides/lut-size',   // bare path; zh lives at /guides/lut-size, en at /en/guides/lut-size
  hub: 'guides',             // parent hub slug or null
  kind: 'guide',             // or 'hub' (listing page, relaxed length checks)
  priority: 0.8, changefreq: 'monthly', updated: 'YYYY-MM-DD',
  readMinutes: 6, image: '/photos/zoom.jpg',   // optional
  jsonLd: (lang) => [...],   // TechArticle/HowTo; FAQPage and BreadcrumbList are automatic
  zh: { title, description, kicker, h1, lede, body, faq? },
  en: { /* same */ },
}
```

`scripts/site.mjs` owns the HTML shell: head metadata, canonical, hreflang
(`zh-CN`, `en`, `x-default` → English), Open Graph, JSON-LD serialisation and the
shared CSS. Hub pages get a card list of their children automatically; guides get
previous/next links.

## URLs

The Worker owns the URL space (`run_worker_first: true`, `html_handling: "none"`
in `wrangler.jsonc`):

| request | response |
| --- | --- |
| `/guides/raw-in-browser` | `public/guides/raw-in-browser.html` (200) |
| `/guides/` | `public/guides/index.html` (200) |
| `/guides` | 301 → `/guides/` |
| `/get-luts.html` | 301 → `/get-luts` |
| unknown path | the inline 404 page, status 404 |

`_headers`/`_redirects` files are not used: the Worker is the only router.

## Manual steps (account owner)

1. **Submit the sitemap in Google Search Console.** The zone already has a
   domain property for `openanthropic.com` (DNS verification), which covers
   `lut.openanthropic.com`. In Search Console → **Sitemaps**, submit
   `https://lut.openanthropic.com/sitemap.xml`. IndexNow (Bing/Yandex) is
   already submitted by `npm run indexnow`.

2. **Turn off Cloudflare's managed robots.txt + AI crawler blocking.** This is
   zone-level and overrides everything in this repository, so it cannot be fixed
   from code:
   - Dashboard → the `openanthropic.com` zone → **AI Crawl Control** → Overview.
   - **Managed robots.txt** → choose **Disable robots.txt configuration**
     (currently Cloudflare prepends a block of `Disallow: /` rules for GPTBot,
     ClaudeBot, PerplexityBot, CCBot, Google-Extended, meta-externalagent … to
     `/robots.txt`, which makes the `Allow` entries in `scripts/build-site.mjs`
     ambiguous).
   - On the same page (or **Security → Settings → filter "Bot traffic" → AI
     Crawler and Agent access policies**) make sure Search / Agent / Training are
     **Allow** (or "Do not block"), not Block.
   - After saving, `curl -s https://lut.openanthropic.com/robots.txt | head -40`
     must no longer start with `# BEGIN Cloudflare Managed content`, and
     `curl -A "Mozilla/5.0 (compatible; ClaudeBot/1.0)" https://lut.openanthropic.com/guides/raw-in-browser`
     must return 200 instead of 403.

   Without step 2, AI crawlers are blocked at Cloudflare's edge: Googlebot gets
   200, but ClaudeBot / PerplexityBot get 403 and GPTBot cannot connect, so the
   `llms.txt` and JSON-LD work never reaches an answer engine.
