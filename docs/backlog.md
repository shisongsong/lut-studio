# Backlog — measured, prioritized, owner: the daily traffic run

Everything below came from two measurements taken on 2026-11-25, not from taste:
[`research/growth-2026-11-25.md`](research/growth-2026-11-25.md) (demand, competitors,
distribution, crawl state) and [`research/ux-perf-audit-2026-11-25.md`](research/ux-perf-audit-2026-11-25.md)
(real-browser timings, interaction cost, mobile/a11y). Re-verify a finding before
acting on it — two of the audit's items were already fixed the same day.

The daily run picks **one** item, ships it, verifies it in production, and records
it. If the day's traffic data shows something more urgent (a P0 error, a broken
funnel step), that wins.

## Blocked on someone other than the code (ask / wait)

- **A1 — Cloudflare AI-crawler + robots gate.** Verified 2026-11-25: ClaudeBot,
  GPTBot and PerplexityBot get **HTTP 403** from the edge, and Cloudflare's
  *managed* robots.txt block (prepended to ours) tells **Baiduspider**, GPTBot,
  ClaudeBot, CCBot, Bytespider, KimiBot and others `Disallow: /`. Our own
  `public/robots.txt` allows all of them; the managed block still overrides it.
  Fix is dashboard-only (zone `openanthropic.com` → AI Crawl Control → disable
  managed robots.txt; Security → Bots → AI crawler access → Allow). Until then
  every AI-search/Baidu effort is dead on arrival. Verify after the change:
  ```sh
  for ua in "ClaudeBot/1.0" "GPTBot/1.2" "PerplexityBot/1.0" "Baiduspider/2.0"; do
    curl -s -o /dev/null -w "%{http_code} " -A "Mozilla/5.0 (compatible; $ua)" \
      https://lut.openanthropic.com/guides/raw-in-browser; done; echo
  # expect 200 200 200 200, and robots.txt no longer starting with "# As a condition"
  ```
- **A2 — Google Search Console.** No API credentials here. GSC is where the
  format/look pages' impressions would be measured; ask for read access or a
  token before investing in more content.

## Product / performance (evidence, then fix)

- **B1 — AUTO tone blocks the main thread ~190 ms** (Event Timing 184–192 ms on
  an M4, 208–264 ms at 4× CPU; the worst interaction in the app). `applyAutoTone()`
  in `public/index.html` runs stats+solve synchronously; `public/js/auto-tone.js`
  is already pure. Move it into a worker or slice it over rAF chunks with an
  "AUTO…" busy state, and cache the result per photo+slider state.
- **B2 — 1.34 MB LUT pack is a monolith on the critical path.** Ready-to-looks
  9.7 s on a 1.6 Mbps/4× CPU profile. Options, in order of value: split the pack
  per category (or the ~16 looks nearest the selected category first) so the
  strip fills progressively; ship the 21³ subset in front of the 33³ pack.
  Measure with `events`: `looks` (ms) should drop, `ready` must not move.
- **B3 — Mobile tap targets: 25 of 90 visible controls are under 44 px**; PHOTO
  28.5×15, 色调 28.5×15, 导出 39×15 in the quick bar. Add `min-height:44px`
  padding boxes in the `max-width:820px` block (keep the type size; grow the box),
  and give the empty state one obvious `打开照片 / OPEN PHOTO` button.
- **B4 — English mode leaks Chinese** (nav `指南`, `LUT 目录`, intro
  `LOADING · 加载中`, toast `已重置色调参数`, `title`/`aria-label="关闭"`) and the
  language switch rebuilds the 65-chip strip (280–390 ms). Add missing `t()` keys
  and update text nodes in place instead of calling `buildFilm()`.
- **B5 — Body text is 7–8.5 px on mobile** (154 visible nodes under 12 px);
  `--faint` contrast was raised .32→.46 on 2026-11-25, still below 4.5:1.
  Raise `.meta/.hint/.chip .nm/.dev-sub` to ≥10 px on phones.
- **B6 — First-visit trust signal is invisible.** No "photos never leave this
  device" line and no open-photo affordance in the first viewport; the demo +
  65 looks read as a gallery, not an editor. One line of trust copy + one CTA.

## Growth (needs content, not code)

- **C1 — `/download` shipped 2026-11-25** (64 `.cube`, 14.3 MB, MIT, no email;
  GitHub release v1.1.0). Watch `events.download_pack` and `visits.path =
  /download`; if it earns referrers (Reddit/小红书/GitHub), the pack is the link
  magnet — put a per-look gallery on it next.
- **C2 — Only 5 of 64 looks have a URL** (`/raw/*` shipped 2026-11-25; per-look
  pages did not). Start with 12 high-demand looks (Portra 400, Classic Chrome,
  Tri-X, Velvia 50, Leica Classic, …), each with a uniquely rendered
  before/after, the `.cube` download, `?look=<id>` CTA, and one honest
  "approximates the stock, not film data" line. Publish in batches of 4–6.
- **C3 — `/en/get-luts` does not exist** (zh page is hand-written outside the
  page system). Port it to a page module so hreflang/sitemap/JSON-LD come free.
- **C4 — Distribution, in order of expected value:** one honest Show HN, one
  r/postprocessing before/after (never r/photography — Rule 1 bans promotion),
  Product Hunt with 4–5 real stills, V2EX /go/create, 少数派 社区作品. One good
  artifact + five honest communities beats fifty directories. Read the
  distribution table in the research doc for the exact rules before posting.

## Guardrails

- Never claim Lightroom equivalence, never fabricate numbers, never add
  `aggregateRating` without real ratings, never gate the pack behind email.
- Keep the privacy promise: first-party, cookieless, no photo data; see README
  "Traffic measurement" and the privacy page.
- Data unchanged is a valid outcome: report the trend, do not invent a change.
