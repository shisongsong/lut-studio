# LUT ARCHIVE — UX / performance audit (2026-11-25)

**Target:** https://lut.openanthropic.com — deployed build = git `HEAD 10935f1` (verified: deployed `index.html` sha256 == `git show HEAD:public/index.html`). Local runs use a frozen `git archive HEAD public` copy served by a Node static server that mimics the deployed Worker headers, so local and production are the same bytes.
**Browser:** Chrome for Testing 158.0.8127.18, headless, ANGLE Metal on Apple M4 (hardware WebGL2). Desktop 1440×900 DPR2, mobile 390×844 DPR2, throttled profile CPU 4× + 1.6 Mbps/750 kbps/300 ms RTT.
**Raw data:** [`ux-perf-raw-2026-11-25.json`](ux-perf-raw-2026-11-25.json) · **Screenshots:** [`shots/`](shots/)

## TL;DR

On a **controlled** slow network the app is actually in decent shape: local 4× CPU + 1.6 Mbps reaches "app ready" in **9.7 s p50** (FCP 580 ms, demo photo 3.85 s, LUT strip 9.9 s), CLS **0**, and load TBT **64 ms p50**. The slow production experience measured here is dominated by this host's broken network path (2 of 4 raw `luts.bin.gz` curl samples timed out mid-download; browser loads through the machine proxy fail 100% of the time, so all production numbers are the direct path).

But **interaction costs are not network noise**, and that is where the real user pain is: the AUTO-tone button blocks the main thread for ~190 ms on an M4, every LUT click repaints all 65 filmstrip thumbnails, the mobile UI is built out of 7–8.5 px type with 15 px-tall tap targets, and English mode still shows Chinese chrome.

## Ranked findings

### P0-1 · On the real production path the app does not become usable within 120 s — the hero photo is queued behind the 1.34 MB LUT pack
- **Measured** (n=1 at the 120 s cap, after 5 earlier runs hit the same cap; production, direct path, desktop 1440×900): TTFB **1.85 s**, HTML body finished at **11.83 s** (57.8 KB transfer / 183 KB decoded), `domInteractive` **11.87 s**, FCP = LCP **11.90 s**, shell never appeared (`#film` chips = 0), `window.__lutsEarly` never resolved, app-ready = **false at 122 s**. curl to the same origin in the same session: `luts.bin.gz` TTFB 2.7–8.2 s and 2 of 4 samples **timed out with only 368–598 KB of 1 339 532 B** received.
- **Why it matters:** the inline script at `public/index.html:72` starts a 1.34 MB `fetch('/luts.bin.gz')` at parse time, and the `<link rel=preload as=image href="/photos/demo.webp" fetchpriority=high>` (line 71) competes with it. The demo photo fetch only starts after `init()` → module evaluation, i.e. after the HTML finishes and the 8-module graph runs (11.9 s here). On any slow link the user stares at a 40 px inline LQIP / intro chrome long after a 160–270 KB hero could have painted.
- **Controlled evidence that ordering, not CPU, is the problem:** local mobile 4× CPU @1.6 Mbps — LUT pack is the long pole (LUT ready **9.72 s**, filmstrip skeletons until **9.86 s**) while the demo photo arrives at **3.85 s**; on desktop unthrottled, shell 135 ms, LUT ready 141 ms, no long task > 67 ms. The 1.34 MB download, not renderer work, defines "ready".
- **Repro:** DevTools → Network → Slow 3G, hard reload. Watch `/luts.bin.gz` (High priority) start before the demo image; `#film .chip.loading` stays for the whole download.
- **Fix (scoped):** in `public/index.html` — (a) remove the parse-time LUT fetch (line 72) and instead start it from `init()` **after** `loadDemoImage()` is kicked off, or set the hero image as high priority and start the LUT fetch on `requestIdleCallback`/after `demoLoaded`; (b) split `luts.bin.gz` per-category (or the 16 LUTs nearest the selected category first) so the strip can fill progressively instead of one 1.34 MB all-or-nothing blob (`loadLutPack()` / `renderFilmThumbs()` already lazy-render visible chips — the pack is the only monolith). Expected: first photo 1–2 s earlier on every slow link; "LUT ready" becomes incremental.

### P0-2 · The AUTO-tone button freezes the UI for ~0.2 s (Event Timing: 184–192 ms click→paint on an M4, CPU 1×)
- **Measured** (local, desktop, CPU 1×, n=3): Event Timing click duration **184 / 184 / 192 ms**; end-to-end click→painted **353 ms p50** (harness-inflated; Event Timing is not). With CPU 4×: script time **190–219 ms**, Event Timing **208–264 ms**, paint latency 264–393 ms (n=2). This is the single largest interaction block measured anywhere in the app.
- **Why it matters:** on a mid-range phone (≈4× the CPU of this M4 for scalar JS) this is a ~0.7–0.9 s dead UI, on a control the product presents as "auto". It also lands on the main thread *before* any feedback is painted.
- **Repro:** open a photo → 色调 → click 自动色调. Frames stall; slider/photo update only after the whole solve.
- **Fix (scoped):** `applyAutoTone()` in `public/index.html` calls `imageStats`/`solveCameraAutoTone` (`public/js/auto-tone.js`) and camera-look fitting synchronously. Move the stats+solve into a worker like `public/js/raw-worker.js` already does for RAW, or slice it over `requestAnimationFrame` chunks with an "AUTO…" busy state; cache the result keyed by `thumbSignature()`-style state so repeat presses are free.

### P1-1 · Mobile is built from desktop-scale hit areas: 25 of 90 visible controls are under 44 px, core actions are 13–17 px tall
- **Measured** (local, 390×844 DPR2, after load): `.tbtn` 指南 **17.6×14**, GitHub 33.7×12, lang **23.2×13**; category chips **30.7×17**; `#photoBtn` **28.5×15**; `#zoomBtn` 34×13; `#toneBtn` **28.5×15**; `#mergeBtn`/`#importBtn` 49.6×15; `#exportBtn` 39×15. Only 65 of 90 pass the 44 px Apple-HIG size; 0 controls are ≥44 px tall in the quick bar (`.quick` row is 48 px tall but individual buttons are 15 px text runs).
- **Why it matters:** "open your own photo", "色调", "导出" — the three things a phone user needs — are the smallest targets on screen, sitting over a photo with a gradient scrim. This is the most likely cause of real-world "it doesn't respond" reports that are not network.
- **Repro:** open on a phone (or 390 px viewport), try to tap 照片/色调/导出 without hitting a neighbour. Screenshot [`shots/21-tap-targets-mobile.png`](shots/21-tap-targets-mobile.png) marks every <44 px target in red.
- **Fix (scoped):** in the `@media(max-width:820px)` block of `public/index.html` give `.quick button`/`.tbtn`/`.cats button` a min-height 44 px and `padding: 12px 10px` (visual type can stay 8–9 px if the *box* is 44 px); convert the text-only quick bar into an icon+label row on mobile, and move `#photoBtn` to a visible primary "打开照片" button near the intro/empty state.

### P1-2 · Choosing any LUT repaints all 65 filmstrip thumbnails (and a slider drag schedules the same repaint 220 ms after you stop)
- **Measured** (local, 4× CPU): every LUT click leaves **settle work after the click** — post-action `TaskDuration` **29.7–35.2 ms**, and after a 40-step exposure drag the deferred settle window costs **160 ms TaskDuration / 141 ms script** (n=2; CPU 1× settle is proportionally smaller but still present). During the drag itself the input handlers are cheap (~0.1 ms/move — `renderSoon()` coalescing works), and the frame cadence drops to **p50 49.9 ms vs the harness's 33.4 ms baseline** at 4× CPU.
- **Root cause in code:** `render()` (`public/index.html:1865`) always calls `refreshFilmThumbsSoon()`, and `thumbSignature()` includes `state.look`, `state.strength`, `state.dual.*` — none of which change what a thumbnail looks like (`drawFilmThumb()` renders each look at `strength:100` with `adjThumb = {...adjFor(), nr:0, noDetail:true}`). So selecting a LUT invalidates the whole strip for nothing.
- **Why it matters:** each tap on the strip launches ~65 WebGL passes + canvas draws in 10 ms chunks (`BUDGET_MS = 10`) that steal frames from exactly the moment the user is judging the applied look.
- **Repro:** CPU 4× → click through the filmstrip; the photo updates, then ~0.3 s later a second burst of work starts (performance panel: `drawFilmThumb` frames).
- **Fix (scoped):** drop `state.look`, `state.strength`, `state.dual.enabled`, `state.dual.b`, `state.dual.strengthB` from `thumbSignature()`; also skip `refreshFilmThumbsSoon()` while `state.interacting` is true and fire it once on pointerup (the drag already ends with `state.interacting = false`).

### P1-3 · English mode leaks Chinese into visible UI and attributes, and the switch costs 280–390 ms of layout/rebuild
- **Measured** (local, CPU 1×, n=3): lang toggle click→paint **280 ms p50 / 393 ms max**; Event Timing 120–144 ms. After switching to EN: untranslated visible text `指南` (nav), `LUT 目录` (nav), intro `LOADING · 加载中`, toast `已重置色调参数`, plus `title="合并当前单/双 LUT 并保存下载"` on 合并 LUT and all four sheet close buttons keep `aria-label="关闭"`. Layout does not break: `docScrollW == innerW` on both 1440 and 390, and the mobile develop header wraps correctly (`actionsW 121, overflowX false`), which matches the in-code note.
- **Why it matters:** the product's English surface is a primary acquisition path (the marketing pages are fully bilingual), and screen-reader users in EN get Chinese labels.
- **Repro:** click `EN` in the top bar, then read the top nav / open a sheet with VoiceOver.
- **Fix (scoped):** `applyLang()` (`public/index.html:3010`) rebuilds the whole filmstrip; instead update text nodes in place (`buildFilm()` only when `allLooks().length` changes). Add `t()` keys for the static nav (`指南`, `LUT 目录` in the `<header class="topbar">` markup), `#introWait`, and the `aria-label`/`title` attributes; re-apply them in `applyLang()`.

### P1-4 · First-visit discoverability: no "open your own photo" affordance in the hero, and no visible "photos never leave your device" reassurance
- **Measured** (local, first visit, desktop): `#photoBtn` is a 30×15 px 8 px-mono text run labelled `照片` in the bottom quick bar, 856 px below the fold line of the photo; `trustVisible = false` — a substring scan of everything visible in the first viewport for 不上传 / 不经过服务器 / 只在本机 / 本地处理 finds nothing. The first-screen copy is `LUT ARCHIVE … 原片 未套 LUT · NO LOOK … 全部 电影 胶片 …` and the intro says only `64 LOOKS / OPEN SOURCE`. The privacy claim exists only in the meta description, the develop-panel hint, the export-sheet note and FAQ.
- **Why it matters:** the demo photo + 65 preloaded looks read as "gallery", not "editor". The privacy promise is the product's differentiator against Lightroom Web, but it is invisible exactly when a first-time visitor decides whether to trust it with a RAW.
- **Repro:** fresh profile → screenshot [`shots/01-first-visit-desktop-zh.png`](shots/01-first-visit-desktop-zh.png); search visible text for the privacy phrase.
- **Fix (scoped):** add a single prominent `打开照片 / OPEN PHOTO` button over the empty-state/hero (the `.look-line` area or a small `#introSub` line) and one always-visible line of trust copy (`照片只在本机处理，不上传 / Photos never leave this device`) next to the brand or under the intro; keep `#photoBtn` for the quick bar.

### P1-5 · Deployed build revalidates every non-HTML asset on every visit (historical — Lead reports immutable content-hashed caching shipped today)
- **Measured** (deployed HEAD, curl): `/luts.bin.gz` 1 339 532 B → `cache-control: public, max-age=0, must-revalidate`, ETag present; `/js/renderer.js` 16 387 B gz → same; `/photos/demo.webp` 268 294 B → same; `/vendor/flashraw/flashraw_simd.wasm` 1 203 208 B gz → same. HTML is `max-age=300` (root curl, 3 samples). Local warm-revisit simulation under those exact headers: **14 network requests, 11 conditional GETs (all 304, ~2.3 KB)** per repeat visit, wall 1.38–1.58 s vs 1.37 s cold on a zero-latency local link — the cost is the RTT, not the bytes, and on this host's 300 ms+ RTT path it is one full extra round-trip batch before the LUT strip can start.
- **Status:** the working tree already has `cacheControlFor()` / `LONG_LIVED` in `src/worker.js` (uncommitted at audit time, not deployed); the Lead states content-hashed immutable caching shipped today. Re-verify after deploy that `/luts.bin.*` and `/photos/*` no longer carry `max-age=0`. Keep this in the report only as "was fixed today".

### P2-1 · Mobile downloads 268 KB of hero it never uses
- **Measured** (local mobile, all 5/5 runs): two image fetches — `/photos/demo.webp` **268 573 B** (prerendered by the hard-coded preload at line 71) and `/photos/demo-phone.webp` **107 999 B** (actually displayed, chosen by `loadDemoImage()`’s `innerWidth <= 820` branch). Chrome logs `The resource …/demo.webp was preloaded using link preload but not used within a few seconds…` (warning, mobile + desktop). On the 1.6 Mbps profile this is ~1.4 s of high-priority bandwidth wasted ahead of the real hero.
- **Fix:** `<link rel="preload" as="image" media="(min-width:821px)" href="/photos/demo.webp">` plus a mobile one for `demo-phone.webp`; or a single `srcset`/`imagesrcset` preload.

### P2-2 · LCP element is 8 px hint text, not the photo — field LCP (shipped today) will understate perceived load
- **Measured** (all local runs): desktop LCP = `div#hint` ("轻点图像进入纯净模式 · 长按看原图 · 双指缩放", 201×11, font-size 8 px) at 144–160 ms; mobile LCP = `span.intro-word` ("LUT ARCHIVE", 10 px) at 92–150 ms. The hero is a CSS background LQIP + WebGL canvases, neither of which is an LCP candidate. Production probe: LCP = the same 8 px `#hint` at 11.9 s.
- **Action:** do not optimize against this LCP (it is not what users wait for); if field LCP is a goal, expose the demo hero as a real `<img>` for the first paint (it already exists as a 40 px inline LQIP). INP will catch P0-2.

### P2-3 · Everything is 7–8.5 px; `--faint` text contrast is ~2.4:1
- **Measured** (mobile 390×844, visible text nodes): font-size histogram `7px:67, 7.5px:73, 8px:5, 8.5px:14, 9px:1, 10px:1, 13px:1` — 154 nodes below 12 px. Contrast on `#0a0a0b`: `--faint` rgba(242,241,236,.32) ≈ **2.4:1**, `--muted` (.56) ≈ **5.2:1**, `--ink` **17.5:1**, `--accent` **11.2:1**. `.meta`, `.hint`, `.look-no`, `.chip .nm`, `.dev-sub`, `.dev-hint` are all in the 7–8.5 px range over photos.
- **Why:** this is the fastest fix with the highest perceived-quality payoff on mobile — it is an art-directed print aesthetic, but at 390 px it is unreadable and the axe/contrast story for a "browser editor" is weak. Fix: `--faint` → .46–.5 alpha, bump `.meta/.hint/.chip .nm/.dev-sub` to ≥10 px on `max-width:820px`.

### P2-4 · 404 favicon on every cold visit (the only console error in local runs)
- **Measured:** `/favicon.ico` **404** in 5/5 cold local desktop runs and in the successful production navigation; marketing pages declare `<link rel="icon" href="/favicon.svg">`, the app shell (`public/index.html`) does not.
- **Fix:** add the same two link tags to `public/index.html` `<head>`. Removes a console error + one wasted request on every first visit.

### P2-5 · Web-Animations intro ignores `prefers-reduced-motion`
- **Measured:** with `reducedMotion: reduce`, the CSS rule reduces transitions to 0.001 s, but `playIntro()`’s `el.film.animate(...)` still reports a **700 ms** animation (`document.getAnimations()` → `film`), and `el.field.animate(...)` runs 1100 ms. Fix: guard `playIntro()`/`animate()` calls with `matchMedia('(prefers-reduced-motion: reduce)').matches` (one line in `public/index.html:3948`-ish).
- Also: export/import/develop panels are `hidden`-toggled `div`s with no `role="dialog"`/`aria-modal`/focus move — screen-reader focus stays on the trigger. Add `role="dialog" aria-modal="true"` + focus first button + restore focus on close.

## What is NOT a problem (don't chase these)
- **CLS is 0** in every local run/profile (desktop, mobile, 4× CPU+1.6 Mbps): no layout shift.
- **Load TBT is small**: local desktop p50 **4 ms** (p90 11 ms), mobile p50 0 ms, 4× CPU + slow net p50 **64 ms**; the only long task >50 ms on a cold load is the module-eval chunk (67 ms at 4× CPU). Load is not JS-bound.
- **Critical path is flat**: 8 first-party ES modules, no render-blocking external CSS, **0 font bytes** (the five `.woff2` files in `public/fonts/` are never referenced; the UI uses system stacks) and no third-party requests (15–17 requests total; all same-origin). `renderer.js` is the largest at 52.7 KB raw / 16.4 KB gz.
- **The LUT inflate/parse is cheap**: local unthrottled "LUT ready" 141 ms after navigation, no long task >50 ms; on the throttled profile LUT-ready time = the 1.34 MB download (9.7 s), not `DecompressionStream` work.
- **Filmstrip lazy rendering and drag coalescing are good**: only visible chips draw immediately, the rest fill in 10 ms idle chunks; `renderSoon()` keeps pointer moves at ~0.1 ms (the jank is the deferred repaint, P1-2, not the input path).
- **Large-image / junk-file error paths** are handled with a localized toast ("这个格式浏览器解不了，试试 JPG / PNG / WebP") and a busy overlay with step list + ETA; no unhandled exception, no stuck spinner.
- **No uploads / no third-party beacons** observed in any load (all requests first-party; photo never sent).
- **Reduced-motion CSS** is wired (transitions clamped to 0.001 s) except the WAAPI intro (P2-5).
- **Mobile layout does not overflow**: `docScrollW == innerW` (390) in zh and en, including the develop bottom sheet; the header-wrap bug mentioned in the CSS comment is indeed fixed (`actions overflowX false`).

## Not measured / why
- **Production load matrix n≥3**: this host's network to Cloudflare is erratic; every full-app-ready attempt exceeded the 120 s cap (5 runs) and raw curl to `luts.bin.gz` timed out mid-transfer in 2/4 samples. Only 1 completed browser navigation (P0-1) + static curl header probes exist. Also note Chrome cannot reach the host through the machine system proxy at all (`net::ERR_CONNECTION_CLOSED` in 6/6 attempts) — all browser numbers use `--no-proxy-server` (direct).
- **Production warm-cache distribution**: not collected (Lead shipped content-hashed immutable caching today; the local warm measurement in P1-5 documents the old behaviour only).
- **axe-core automated a11y run**: script written but not executed before the time cut; a11y findings above come from DOM inspection (89 buttons, **0** without an accessible name on desktop; headings H1→H2 valid; all four icon-only close buttons have `aria-label`).
- **Marketing crawl (24 sitemap URLs, redirect chains, canonical/hreflang reciprocity, internal links, mobile text size on about/faq/guides/alternatives)**: crawler script written (`crawl.js`), not run. Not included in findings — do not treat crawler health as audited.
- **RAW decode / full-res export timings** (16 MB NEF `testdata/.../DSC_2901.NEF`, 8000×6000 JPEG, 100% JPEG export download): flows script written, not executed. Export/RAW loading states were reviewed in code only.
- **60 Hz frame cadence**: headless Chromium here runs rAF at ~30 Hz (baseline p50 33.4 ms); drag frame counts are reported relative to that baseline, not as "dropped at 60 fps".
- **Safari/WebKit, iOS**: Chromium only.

## Methodology (short)
- **Deployed vs local:** verified deployed `index.html`/`about.html` sha256 against `git show HEAD:public/<file>`; byte-identical. Local server replays HEAD's exact bytes and the deployed Worker's headers (`cache-control`, ETag/304, gzip, `/api/geo`), so load results are CPU/renderer isolation, not content differences.
- **Load:** fresh `BrowserContext` per cold run; PerformanceObserver for LCP/CLS/longtask/paint; app milestones read from the app's own state (`window.__ltLut().ready`, `#metaDims` painted, `#film .chip` built, `#intro.done`); per-request wire bytes/priorities/status from CDP `Network.*`; warm revisit in the same context. n=5 cold + 2 warm per local profile; throttled profile n=3+2.
- **Interaction:** local server, CDP `Emulation.setCPUThrottlingRate(4)`, Chromium `Performance.getMetrics` deltas (`TaskDuration`, `ScriptDuration`) around each action, Event Timing (`click`→next paint) for trusted clicks, and rAF cadence during synthetic pointer drags. Harness overhead flagged where it inflates numbers.
- **UX/a11y:** DOM inspection at 1440×900 and 390×844 (tap-target rects, font-size histogram, visible-text scans, EN-mode CJK scan), screenshots at `docs/research/shots/`.
