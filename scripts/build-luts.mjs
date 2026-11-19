#!/usr/bin/env node
/**
 * Build the web LUT bundle.
 *
 * Source of truth: ./luts-src — one 33³ .cube per look, generated from the
 * recipes in scripts/looks.mjs by `npm run export:cubes`. Those same .cube files
 * are committed to the repo so people can download them for Resolve, Premiere,
 * Photoshop, etc.
 *
 * Vendor LUTs (Panasonic/FUJIFILM/Canon/Nikon/Sony) are intentionally NOT
 * included: their terms only allow local personal use, not public
 * redistribution. The app imports user-supplied .cube files instead.
 *
 * Output: public/luts.bin — one LUT_EDGE³ RGBA block per look, in the exact order of
 * LOOKS in public/js/looks.js. 17³ keeps the whole pack under ~1 MB while
 * trilinear filtering keeps the grades smooth.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOOKS, LUT_EDGE } from '../public/js/looks.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'luts-src');
const SIZE = LUT_EDGE;

function parseCube(text) {
  const lines = text.split(/\r?\n/);
  let size = 0;
  const values = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith('TITLE')) continue;
    if (upper.startsWith('LUT_3D_SIZE')) { size = Number(line.split(/\s+/)[1]); continue; }
    if (upper.startsWith('DOMAIN_')) continue;
    if (/^[-+]?[\d.]/.test(line)) {
      const p = line.split(/\s+/);
      if (p.length >= 3) values.push(Number(p[0]), Number(p[1]), Number(p[2]));
    }
  }
  if (values.length !== size ** 3 * 3) throw new Error(`bad cube (${values.length})`);
  return { size, values };
}

function sample(values, srcSize, x, y, z) {
  const fx = x * (srcSize - 1);
  const fy = y * (srcSize - 1);
  const fz = z * (srcSize - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
  const x1 = Math.min(srcSize - 1, x0 + 1);
  const y1 = Math.min(srcSize - 1, y0 + 1);
  const z1 = Math.min(srcSize - 1, z0 + 1);
  const tx = fx - x0, ty = fy - y0, tz = fz - z0;
  const at = (ix, iy, iz) => ((iz * srcSize + iy) * srcSize + ix) * 3;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const c00 = values[at(x0, y0, z0) + c] * (1 - tx) + values[at(x1, y0, z0) + c] * tx;
    const c10 = values[at(x0, y1, z0) + c] * (1 - tx) + values[at(x1, y1, z0) + c] * tx;
    const c01 = values[at(x0, y0, z1) + c] * (1 - tx) + values[at(x1, y0, z1) + c] * tx;
    const c11 = values[at(x0, y1, z1) + c] * (1 - tx) + values[at(x1, y1, z1) + c] * tx;
    const c0 = c00 * (1 - ty) + c10 * ty;
    const c1 = c01 * (1 - ty) + c11 * ty;
    out[c] = c0 * (1 - tz) + c1 * tz;
  }
  return out;
}

const perLut = SIZE ** 3 * 4;
const out = Buffer.alloc(LOOKS.length * perLut);

LOOKS.forEach((look, index) => {
  const { size, values } = parseCube(readFileSync(join(SRC, `${look.id}.cube`), 'utf8'));
  const base = index * perLut;
  for (let b = 0; b < SIZE; b++) {
    for (let g = 0; g < SIZE; g++) {
      for (let r = 0; r < SIZE; r++) {
        const [cr, cg, cb] = sample(values, size, r / (SIZE - 1), g / (SIZE - 1), b / (SIZE - 1));
        const o = base + (((b * SIZE + g) * SIZE + r) * 4);
        out[o] = Math.max(0, Math.min(255, Math.round(cr * 255)));
        out[o + 1] = Math.max(0, Math.min(255, Math.round(cg * 255)));
        out[o + 2] = Math.max(0, Math.min(255, Math.round(cb * 255)));
        out[o + 3] = 255;
      }
    }
  }
  console.log('baked', look.id);
});

/*
 * Store the cubes delta-encoded along the fastest axis, behind a small header.
 *
 * A LUT is a smooth 3D gradient, so neighbouring samples differ by a few code
 * values: storing those differences instead of the values shrinks the gzipped
 * pack from ~4.2 MB to ~1.3 MB at 33^3 with no loss at all (the decoder adds
 * them back). The header also lets the loader reject a stale or mismatched
 * bundle instead of feeding garbage to the shader — a version skew here is what
 * produced the "rainbow" frames earlier.
 *
 * Layout: "LUTD" | u8 edge | u8 format(1 = delta) | u16 looks | u32 reserved
 */
const HEADER = 8;
const body = Buffer.alloc(out.length);
const rowBytes = SIZE * 4;
for (let look = 0; look < LOOKS.length; look++) {
  const base = look * perLut;
  for (let row = 0; row < SIZE * SIZE; row++) {
    const o = base + row * rowBytes;
    for (let c = 0; c < 4; c++) body[o + c] = out[o + c];
    for (let x = 1; x < SIZE; x++) {
      const i = o + x * 4;
      for (let c = 0; c < 3; c++) body[i + c] = (out[i + c] - out[i - 4 + c]) & 0xff;
      body[i + 3] = 0; // alpha is constant 255
    }
  }
}
const header = Buffer.alloc(HEADER);
header.write('LUTD', 0, 'latin1');
header.writeUInt8(SIZE, 4);
header.writeUInt8(1, 5);
header.writeUInt16LE(LOOKS.length, 6);
const pack = Buffer.concat([header, body]);

mkdirSync(join(ROOT, 'public'), { recursive: true });
const target = join(ROOT, 'public', 'luts.bin');
writeFileSync(target, pack);
console.log(`\nwrote ${target} · ${LOOKS.length} looks · ${SIZE}³ · delta-coded · ${(pack.length / 1024).toFixed(0)} KB`);
