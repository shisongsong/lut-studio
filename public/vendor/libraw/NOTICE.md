# libraw-wasm (vendored)

These four files are an unmodified copy of the `dist/` directory of
[libraw-wasm](https://github.com/ybouane/LibRaw-Wasm) v1.6.0, taken from the npm
package of the same version.

| file | what it is |
| --- | --- |
| `index.js` | ES-module wrapper, spawns the worker |
| `worker.js` | Emscripten glue running inside the Web Worker |
| `libraw.js` | Emscripten runtime |
| `libraw.wasm` | LibRaw compiled to WebAssembly (~1.4 MB) |

It is vendored rather than bundled so the site keeps its "no build step"
property, and it is loaded with a dynamic `import()` from
`public/js/raw.js` so visitors who never open a RAW file never download it.

## Licensing

- **libraw-wasm** is ISC licensed, © Yves Bouane and contributors.
- **LibRaw** is dual licensed under LGPL-2.1 and CDDL-1.0. This site uses the
  library as shipped, unmodified, and does not link it statically into its own
  code — the LGPL relinking requirement is satisfied by the fact that the WASM
  binary is a separate file that can be replaced.
- **dcraw** code contained in LibRaw is © Dave Coffin.

No Nikon, Canon, Sony or other camera-vendor code or LUT is included here.
