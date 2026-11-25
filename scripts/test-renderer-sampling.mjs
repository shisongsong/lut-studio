#!/usr/bin/env node
/**
 * Regression guard for the tiled-export "floating layer" bug.
 *
 * The tone guide and the Local Laplacian EV map live in full-frame photo space.
 * The fragment shader must therefore resolve the tile's uv into photo space
 * (uGuideRect) before sampling them: a native inspection tile carries its offset
 * in uTile, a tiled export passes the tile's position in uGuideRect. Sampling
 * these maps in tile space (the bug) applied the whole frame's guide/LLF map to
 * every export tile, which surfaced as blocks and ghost copies of the picture
 * inside 100% exports as soon as Auto Tone or the H/S sliders were non-zero.
 *
 * The check reads the shader source because a real GPU assertion would need a
 * browser; the numeric end-to-end check lives in the production verification.
 */
import fs from 'node:fs';

const rendererPath = new URL('../public/js/renderer.js', import.meta.url);
const src = fs.readFileSync(rendererPath, 'utf8');

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`ok   ${name}`);
  else { failures++; console.error(`FAIL ${name} ${detail}`); }
};

check('shader: full-frame maps get a photo-space uv from uGuideRect',
  /vec2\s+mapUv\s*=\s*uGuideRect\.xy\s*\+\s*imUv\s*\*\s*uGuideRect\.zw;/.test(src));
check('shader: tone guide is sampled in photo space',
  src.includes('texture(uGuide, mapUv)'));
check('shader: LLF EV map is sampled in photo space',
  src.includes('texture(uLocalMap, mapUv)'));
check('shader: no tile-space tone-guide sampling',
  !/texture\(\s*uGuide\s*,\s*imUv\s*\)/.test(src));
check('shader: no tile-space LLF sampling',
  !/texture\(\s*uLocalMap\s*,\s*imUv\s*\)/.test(src));
check('shader: the export-facing uGuideRect uniform is still wired',
  src.includes('gl.uniform4f(this.uniform.uGuideRect,'));

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nall renderer sampling checks passed');
