#!/usr/bin/env node
/**
 * Pre-compress the large binary payloads with brotli.
 *
 * Cloudflare compresses the wasm decoder itself, but not our
 * `application/octet-stream` LUT pack — 844 KB went over the wire raw on every
 * cold visit. `src/worker.js` serves `luts.bin.br` with `content-encoding: br`
 * when the browser accepts it, and falls back to the plain file otherwise.
 *
 * Run after `npm run build:luts`; `npm run deploy` does it automatically.
 */
import { brotliCompressSync, constants } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = ['public/luts.bin'];

for (const file of FILES) {
  const src = readFileSync(file);
  const out = brotliCompressSync(src, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
  writeFileSync(`${file}.br`, out);
  console.log(`${file}: ${(src.length / 1024).toFixed(0)} KB → ${(out.length / 1024).toFixed(0)} KB`);
}
