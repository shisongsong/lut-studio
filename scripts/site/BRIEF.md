# SEO/AEO content brief — LUT ARCHIVE

Read this fully before writing. You are writing **page modules** for the static,
crawlable part of `lut.openanthropic.com`. The app itself is a canvas; these pages
are the only text a search engine or an AI answer engine can read. So: accurate,
specific, useful, no marketing filler.

Repo root: `/Volumes/huanyin/Workstation/x-media/lut-studio`

## The product (facts only — do not invent numbers)

- **What it is**: a photo editor that runs entirely in the browser (`/`). Open a
  RAW or ordinary image, develop it with a Lightroom-style panel, apply one of 64
  generated LUT looks (or import a `.cube`), stack two looks, merge them into one,
  export a full-resolution JPEG. No account, no upload, no server-side rendering.
- **RAW decoding**: [flashraw](https://github.com/ybouane/flashraw) compiled to
  WebAssembly, vendored (~3.4 MB, fetched only when a RAW is opened), runs in a
  Web Worker. Formats: NEF/NRW (incl. HE, HE*), CR2, CR3, ARW, SRF, SR2, DNG,
  RAF, ORF, RW2, PEF, SRW, 3FR, ERF, KDC, MOS, IIQ, X3F. Fallback to the embedded
  camera JPEG when a RAW cannot be unpacked (incl. 45 MP-class truncated frames).
- **Pipeline**: 16-bit decode with an extended white point (4 stops of scene
  headroom above white), re-encoded as scene-linear half floats for the GPU.
  Display transform = darktable sigmoid (jandren, merged for darktable 4.2 in
  [PR #12642](https://github.com/darktable-org/darktable/pull/12642)), per-channel
  with hue preservation, closed-form parameter fit. The optional darktable CLI
  reference test renders a synthetic 128×512 linear EV ramp through darktable
  5.6.2 with an explicit XMP sidecar; the observed maximum linear-light error is
  0.0014772 (acceptance limit 0.0016). This validates the sigmoid curve, not a
  full camera RAW decode or Lightroom's Auto algorithm.
- **RAW Highlights/Shadows**: the visible response comes from an adaptive blurred
  luminance guide; a dedicated Worker also applies an eight-reference fast Local
  Laplacian remap to a 320 px scene-EV map, and the GPU adds its EV delta at 45 %
  weight as a luminance ratio to the full-resolution linear frame before sigmoid.
  LLF alone under-shifts small bright regions (~0.5 EV on the night reference), so
  it is a refinement, not the whole response. Guide and LLF map are full-frame, so
  tiles resolve their coordinates into photo space before sampling (a tile-space
  read made 100 % exports show block/ghost copies). The slider mapping is an
  engineering design, not an Adobe parameter match. Auto Tone remains a separate percentile
  heuristic and is not claimed to reproduce LR Auto. With the camera look on it
  keeps the camera exposure and solves its sliders on the rendered histogram
  (one-way placement hint from the neutral heuristic, no-darkening contract);
  with the look off the calibrated neutral values are unchanged.
- **Auto exposure** (RAW only): scene-domain anchors — 95th percentile near
  sensor white, midtones kept below ~0.39 of white. `AUTO` in the toolbar turns
  it off.
- **Performance**: a 26 MP NEF becomes a 5568×3712 linear frame in ~1.2 s on a
  recent laptop. Preview is capped at 4096 px on the long edge; the
  full-resolution frame stays in memory and export renders it in tiles.
- **Export**: JPEG at 50 / 75 / 100 % of the source long edge (quality 0.90 /
  0.95 / 0.98), full resolution even past the GPU texture limit.
- **LUT pack**: 64 original looks generated from recipes in `scripts/looks.mjs`
  (cinema, film, black and white, warm/cool, vintage, airy, plus Leica,
  Hasselblad, Kodak, Fujifilm, Ricoh, Panasonic-inspired grades). Shipped as one
  delta-coded 33³ pack: 9,199,880 bytes raw → 1,342,919 bytes gzipped, decoded
  lazily per look (~2 ms each). The same looks exist as standard `.cube` files.
  **These are original recipes that approximate the named stocks/profiles; they
  are not vendor LUT data.** Say exactly that if it comes up.
- **LUT size measurement** (our own test, the numbers are real — reuse them):
  | edge | mean error (levels of 255) | max error | pack cost |
  | --- | --- | --- | --- |
  | 17³ | 0.226 | 20.8 | ~0.65 MB gzip |
  | 21³ | 0.182 | 11.6 | ~1.2 MB gzip |
  | 25³ | 0.128 | 11.3 | — |
  | 33³ | 0 (exact vs authored) | 0 | 1.34 MB gzip delta-coded |
  Error = trilinear interpolation against the authored 33³ cube, measured over
  a photo-derived query set. 65³ would be 274,625 entries per look, ~52 MB raw
  for 64 looks, for no visible gain.
- **Import**: any `.cube`, 3D (`LUT_3D_SIZE` 2–128) and 1D (baked onto a 3D
  grid), UTF-8 BOM tolerated, parsed locally, stored in IndexedDB under
  "我的 LUT / My LUTs".
- **Input profiles**: sRGB / F-Log / F-Log2 / V-Log. Vendor LUTs are built for log
  input, so the app re-encodes the image with the published transfer function
  before the LUT runs. Gamut is still treated as sRGB, so vendor LUTs are close
  but not byte-exact. Auto-detected from F-Log / V-Log in the LUT name.
- **Merge**: stack two looks, bake the composition into one 33³ LUT, save it under
  My LUTs and download it as `.cube` (35,937 rows). Composition is
  `mix(v, lut(v), strength)` per slot, exactly what the renderer does.
- **Interface**: Chinese and English (auto-selected by country, toggle in the
  toolbar). Keyboard: ←/→ switch looks, E export, +/−/0 zoom. Split-view compare,
  long-press the right side to see the original.
- **Privacy**: no account, no upload, no analytics/tracking cookies. The only
  network requests are app assets and `/api/geo` (country code, used to choose
  the initial UI language). Imported LUTs and preferences live in
  IndexedDB/localStorage.
- **License**: MIT, source at <https://github.com/shisongsong/lut-studio>.
- **Limits**: WebGL2 required; single-image editor (no library/catalogue, no
  batch, no cloud sync, no AI masks); `.xmp` presets are not supported; the first
  RAW open downloads the ~3.4 MB decoder.

## Your output: page modules

One file per page in `scripts/site/pages/`. Default export:

```js
import { articleLd, howToLd } from '../../site.mjs';

export default {
  slug: 'guides/lut-size',      // bare path, no leading slash, no language prefix
  hub: 'guides',                // 'guides' or 'alternatives' (parent hub)
  kind: 'guide',
  priority: 0.8,                // sitemap priority 0.5–0.9
  changefreq: 'monthly',
  updated: '2026-11-19',        // today
  readMinutes: 5,               // optional
  image: '/photos/home-desktop.jpg', // optional OG image, one of the /photos/*.jpg
  jsonLd: (lang) => [articleLd({ lang, title, description, path, image, updated, hub })],
  zh: {
    title: '',        // ≤ 40 chars, Chinese
    description: '',  // 50–85 chars, Chinese
    kicker: '指南 · LUT',
    h1: '',
    lede: '',
    body: `...HTML...`,
    faq: [['问题？', '答案。'], ...],   // optional, becomes FAQPage JSON-LD
  },
  en: { /* same shape, English */ },
};
```

Rules enforced by `node scripts/build-site.mjs --check`:

- zh title ≤ 40 chars, en title ≤ 62.
- zh description 50–85 chars, en description 110–165.
- body must contain ≥ 700 characters of text (strip tags).
- zh body must contain Chinese; en body must NOT contain Chinese characters.
- internal links must point at real pages. Valid targets:
  `/`, `/guides/`, `/guides/raw-in-browser`, `/looks`, `/faq`, `/about`,
  `/privacy`, `/get-luts`, `/alternatives/lightroom-web`, and for English
  `/en/...` mirrors of those. Link with `<a href="...">`. External links must
  use `rel="noopener"`.
- Do not invent statistics, quotes, benchmarks, user counts or competitor facts.
  If you need a number and it is not in this brief, leave it out.

## Style

- Read `scripts/site/pages/raw-in-browser.mjs` first — copy its structure and
  tone. That is the quality bar.
- Use `<h2 id="...">` sections with ids, `<p>`, `<ul>/<ol>`, `<table>`,
  `<dl class="facts">` (the template styles all of these). Use
  `<figure class="figure"><img src="/photos/....jpg" alt="..."><figcaption>...</figcaption></figure>`
  at most once per page, only when the image helps. Available images:
  `/photos/home-desktop.jpg` (editor), `/photos/develop-desktop.jpg` (develop
  panel), `/photos/dual.jpg` (dual LUT), `/photos/zoom.jpg` (100% zoom),
  `/photos/home-mobile.jpg` (phone).
- `lede` is the paragraph under the h1: 1–3 sentences, concrete.
- Write for a photographer deciding whether to use this, and for an AI agent that
  may quote one paragraph. Headings should be questions or concrete claims, not
  "Introduction" / "Conclusion".
- Chinese: 简体中文, natural, no translationese, no "首先/其次/最后" filler.
  English: plain, specific, no "revolutionary", no "seamlessly".
- One `<dl class="facts">` block max, one table max, no nested headings deeper
  than h3.
- Don't mention "SEO", "AI answer engine", "this page exists to..." — readers
  never see the plumbing.

## Verification

Run `node scripts/build-site.mjs --check` from the repo root after each page.
It prints per-field problems. **Do not run the full `node scripts/build-site.mjs`
(your teammates may be writing other modules); do not edit shared files**
(`scripts/site.mjs`, `scripts/build-site.mjs`, `public/index.html`,
`src/worker.js`, `scripts/`, `public/` other than `/photos`).

If `--check` reports an issue you believe is a false positive, report it in your
final message instead of changing the shared scripts.

## Assignments

`content-mechanics`:
- `scripts/site/pages/lut-size.mjs` — slug `guides/lut-size`
- `scripts/site/pages/merge-lut.mjs` — slug `guides/merge-lut`
- `scripts/site/pages/what-is-lut.mjs` — slug `guides/what-is-lut`

`content-positioning`:
- `scripts/site/pages/alternatives-lightroom.mjs` — slug `alternatives/lightroom-web`, hub `alternatives`
- `scripts/site/pages/faq.mjs` — slug `faq`, hub `null` (standalone; use the FAQ page shape below)

For `faq.mjs`, `hub` must be `null` and `kind: 'guide'`; the page body should be
a short intro plus the same Q&As rendered as `<div class="faq"><details>...`
markup (the FAQ JSON-LD comes from `copy.faq`). Aim for 10–12 questions covering
formats, privacy, LUT sizes, log input, dual/merge, export, mobile/WebGL2,
offline use, license and pricing.
