#!/usr/bin/env node
/**
 * Pre-compress the large binary payloads with brotli.
 *
 * Cloudflare compresses the wasm decoder itself, but not our
 * `application/octet-stream` LUT pack — 844 KB went over the wire raw on every
 * cold visit. We ship `luts.bin.gz` as an ordinary file and let the page inflate
 * it with DecompressionStream (with a plain `luts.bin` fallback). Using an
 * origin `content-encoding` header instead is unsafe: Cloudflare compresses
 * Worker responses too, which double-compresses the body.
 *
 * Run after `npm run build:luts`; `npm run deploy` does it automatically.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = ['public/luts.bin'];

for (const file of FILES) {
  const src = readFileSync(file);
  const out = gzipSync(src, { level: 9 });
  writeFileSync(`${file}.gz`, out);
  console.log(`${file}: ${(src.length / 1024).toFixed(0)} KB → ${(out.length / 1024).toFixed(0)} KB`);
}
