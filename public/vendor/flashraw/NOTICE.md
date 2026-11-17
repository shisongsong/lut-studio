# flashraw (vendored)

An unmodified copy of the browser build of
[flashraw](https://github.com/ybouane/flashraw) v0.3.1 (npm package of the same
version): `browser.js` and its modules, plus the two WASM binaries.

| file | what it is |
| --- | --- |
| `browser.js` | browser entry point (`decodeRaw`, `readMetadata`, …) |
| `core.js`, `errors.js`, `threads.js`, `flashraw_bindgen*.js`, `worker-protocol.js`, `thread-worker.browser.js` | runtime modules |
| `flashraw_simd.wasm` | SIMD128 build, used by every current browser (~3.4 MB) |
| `flashraw.wasm` | scalar fallback for browsers without SIMD128 (~3.3 MB) |

Vendored rather than bundled so the site keeps its "no build step" property. It
is loaded with a dynamic `import()` from `public/js/raw.js`, so visitors who
never open a RAW file never download it. Only one of the two binaries is ever
fetched — the runtime picks SIMD when the browser supports it.

## Licensing

- **flashraw** is Apache-2.0 / MIT dual licensed, © Yves Bouane and contributors.
  See `LICENSE-APACHE` and `LICENSE-MIT`.
- The Nikon HE/HE\* (TicoRAW) decoder inside it is an independent
  reverse-engineered implementation; no Nikon code is included.

No camera-vendor LUT or profile is included here.
