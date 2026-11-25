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

- **B1 — AUTO tone: partially fixed 2026-11-25 (second pass).** What shipped:
  the button now dims immediately (busy state + `aria-busy`), the work is split
  across three frames so the pressed state paints first, and the result is cached
  per photo (`WeakMap` keyed on the source, keyed by photo/log/denoise/camera-look
  /exposure), so a repeat press does **zero work** — measured: first press leaves
  a ~116 ms long task, repeat presses leave **no** long task (was ~90 ms each).
  Slider values are byte-identical to before. **What remains:** the first press
  still blocks ~90–120 ms, because the six-to-ten 240 px WebGL read-backs are
  synchronous. A worker refactor is the real fix; it is a half-day job and it must
  keep `npm run test:tone`'s exact slider contracts.
- **B2 — LUT pack: progressive decode shipped 2026-11-25.** The pack is a
  header plus one independent delta-coded block per look, so the client now
  decodes blocks *as the gzip stream arrives* instead of waiting for the whole
  1.34 MB (`streamLutPack` / `noteLutBytes`). Readiness became a count
  (`lutReadyCount`), `lutData()` returns null for blocks still in flight, the
  strip repaints as blocks land, a chip whose look has not arrived shows a toast
  instead of selecting nothing, and a `?look=` deep link is retried until its
  block arrives. Measured (headless, 1.6 Mbps / 250 ms RTT, local server):
  **first look 17 ms normal / 627 ms throttled** (before: nothing until the whole
  pack finished, ~9.7 s on the same profile), half the strip at 7.4 s, full pack
  7.2 s, all 65 thumbnails painted at the end, deep link to the *last* look
  applies at 7.3 s when its block lands, no console errors. Fallback to the plain
  `luts.bin` still works (verified by blocking the .gz). New telemetry:
  `events.looks-first` (first block) in addition to `events.looks` (whole pack).
  Still open: on a metered connection the full pack is still downloaded in the
  background; a `saveData`/2G variant could stop after the first N blocks.
- **B3 — Mobile tap targets: key ones fixed 2026-11-25, rest open.** The quick
  bar buttons are now real 40 px-tall boxes (photo 38, tone/export/zoom/import 40),
  top-bar links 34–36 px, category chips 30 px — measured on 390 px before/after:
  PHOTO 28.5×15 → 55×38, 色调 28.5×15 → ~19×40, 导出 39×15 → ~29×40, no horizontal
  overflow, 导出 still above the fold. Still open: the *type* is 7–8 px (readability,
  see B5) and the 44 px Apple-HIG target is only reached by width+gap, not height.
  A transparent `::after` expansion was tried first and failed the hit probe
  (rows painted later won the hit test) — do not retry it.
- **B4 — English mode: leaks fixed 2026-11-25; switch cost remains.** All the
  leaked strings now have `t()` keys and are updated by `applyLang()` (nav, intro
  wait, close `aria-label`s, merge `title`, import sheet copy). Measured after the
  fix, the only Chinese left in EN mode is the `中文` toggle itself. Still open:
  the switch rebuilds the 65-chip strip (280–390 ms) — update text nodes in place
  instead of calling `buildFilm()` when the inventory has not changed.
- **B5 — Mobile readability: shipped 2026-11-25.** A `@media(max-width:820px)`
  block at the **end** of the stylesheet (order matters — the develop-panel base
  rules are declared later than the first mobile block, so an override placed
  there loses) now puts phones at: chip names 10 px, categories 10 px, quick row
  9 px, look line/trust 9.5–10 px, develop labels/values 10 px, develop hint
  10 px, toasts 10 px. Measured on 390 px: min font 7 px → 8.5 px (only the
  decorative thumbnail index), 154 nodes under 12 px → most are now 9–10 px,
  no label wraps, no horizontal overflow, panel still scrolls. `--faint` is
  .5 alpha (≈4.5:1 on the dark background). Screenshots:
  `research/shots/mobile-readability-after.png`, `mobile-develop-panel-after.png`.
  Note: desktop type is intentionally unchanged (print-like art direction).
- **B6 — First-visit trust signal: shipped 2026-11-25.** A muted line
  `◦ 照片不上传 · 只在本机处理` / `◦ Photos never leave your device` now sits under
  the look name (visible on phone and desktop; the `.hint` above it is hidden on
  phones), and the primary action is a bordered `打开照片` / `Open photo` button
  instead of a 8 px `PHOTO` text run. Verified in headless at 390 px and 1440 px,
  both languages, no page errors, no horizontal overflow. Watch `events.photo`
  and the ready→photo conversion in the daily report; if conversion does not move
  in two weeks, try a larger empty-state CTA over the canvas.

## Growth (needs content, not code)

- **C1 — `/download` shipped 2026-11-25** (64 `.cube`, 14.3 MB, MIT, no email;
  GitHub release v1.1.0). Watch `events.download_pack` and `visits.path =
  /download`; if it earns referrers (Reddit/小红书/GitHub), the pack is the link
  magnet — put a per-look gallery on it next.
- **C2 — Per-look pages: first batch of 12 shipped 2026-11-25.** Factory
  `scripts/site/look-page.mjs` (`lookPage(id, copy)` + `LAUNCHED_LOOK_IDS`),
  previews rendered from the real pipeline by `scripts/build-look-previews.mjs`
  (headless Chromium, `public/photos/looks/*.jpg`, 1200×801, committed), copy
  modules under `scripts/site/pages/look-*.mjs` written per look from the actual
  recipe values. Each page: before/after figures, what the look does, three
  concrete subjects, how it differs from its two nearest looks, a `?look=` CTA,
  a single `.cube` download (`/download/cubes/<id>.cube`, now served gzip:
  862 KB → 295 KB) and an honest "original recipe, not film data" block.
  `/looks` and `/download` link the launched looks; sitemap grew to 63 URLs.
  **Next batch:** add ids to `LAUNCHED_LOOK_IDS`, run
  `PLAYWRIGHT_CORE=… npm run build:previews`, write the modules, deploy. Keep
  batches at 4–6 and only after the first 12 have been indexed — thin-content
  risk is real for 64 near-identical pages.
- **C3 — `/en/get-luts`: shipped 2026-11-25.** The hand-written zh-only
  `public/get-luts.html` was ported to `scripts/site/pages/get-luts.mjs`, so both
  languages are generated with hreflang pairs, JSON-LD, sitemap entries and the
  standard nav. Content rewritten: vendor sources table (verified 2026-11-25 —
  Nikon's old support link was dead and now points at the N-Log LUT v2.00
  download page), the three-step import, the log-input explanation and the
  redistribution limits, plus four FAQs. `/en/download` and `/en/looks` now link
  the English mirror. Live: `/get-luts` and `/en/get-luts` (39 sitemap URLs
  submitted to IndexNow).
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
