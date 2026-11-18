#!/usr/bin/env node
/**
 * Property test for the Basic-panel tone model: `npm run test:tone`.
 *
 * This mirrors the luminance mapping in the fragment shader (renderer.js) using
 * the same calibration constants (TONE_MODEL). It is the contract the UI relies
 * on: no plateau, no cross-band damage, adaptive highlights/shadows, endpoint
 * behaviour for whites/blacks, and local contrast preserved inside a region.
 */
import { TONE_MODEL, TONE_EV_MIN, TONE_EV_MAX } from '../public/js/renderer.js';

const lin = (s) => { s = Math.max(0, Math.min(1, s)); return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const srgb = (y) => { y = Math.max(0, y); return y <= 0.0031308 ? 12.92 * y : 1.055 * Math.pow(y, 1 / 2.4) - 0.055; };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/** Mirror of the shader's luminance mapping. dIn/gDisp are display sRGB 0..1. */
function toneModel(dIn, gDisp, tone = {}, exposure = 0) {
  const Y = lin(dIn) * Math.pow(2, exposure);
  const ev = Math.max(TONE_EV_MIN, Math.min(TONE_EV_MAX, Math.log2(Math.max(Y, 1e-7) / 0.18)));
  const slope = 1 + 0.32 * (tone.contrast || 0) / 100;
  const evC = Math.max(TONE_EV_MIN - 8, Math.min(TONE_EV_MAX + 4, ev * slope));
  const Yc = 0.18 * Math.pow(2, evC);
  const gY = lin(gDisp) * Math.pow(2, exposure);
  const gEv = Math.max(TONE_EV_MIN, Math.min(TONE_EV_MAX, Math.log2(Math.max(gY, 1e-7) / 0.18)));
  const s = (tone.shadows || 0) / 100, h = (tone.highlights || 0) / 100;
  const shadowW = sigmoid(-(gEv - TONE_MODEL.shadow.pivotEv) / TONE_MODEL.shadow.widthEv);
  const highlightW = sigmoid((gEv - TONE_MODEL.highlight.pivotEv) / TONE_MODEL.highlight.widthEv);
  const Yl = Yc * Math.pow(2, s * TONE_MODEL.shadow.stops * shadowW + h * TONE_MODEL.highlight.stops * highlightW);

  let d = srgb(Math.min(Yl, 1));
  const w = (tone.whites || 0) / 100, b = (tone.blacks || 0) / 100;
  const whMask = smooth(TONE_MODEL.whites.knee, 1, d);
  if (w > 0) d += TONE_MODEL.whites.boost * w * d * whMask;
  else if (w < 0) d -= TONE_MODEL.whites.recover * -w * (1 - d) * whMask;
  d = clamp01(d);
  if (b > 0) d += TONE_MODEL.blacks.lift * b * (1 - smooth(0, 0.5, d));
  else if (b < 0) d *= 1 - TONE_MODEL.blacks.crush * -b * (1 - smooth(0, TONE_MODEL.blacks.toe, d));
  return clamp01(d);
}

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`ok   ${name}`);
  else { failures++; console.error(`FAIL ${name} ${detail}`); }
};
const levels = (v) => Math.round(v * 255);
const N = 512;
const ramp = Array.from({ length: N + 1 }, (_, i) => i / N);

// 1. neutral is identity, whatever the guide is
{
  let worst = 0;
  for (const g of [0, 0.05, 0.25, 0.5, 0.75, 1]) {
    for (const d of ramp) worst = Math.max(worst, Math.abs(toneModel(d, g) - d));
  }
  check('neutral is the identity for every guide value', worst < 2e-3, `max error ${worst}`);
}

// 2. monotone in the pixel value for every single-slider extreme (no folds)
{
  let bad = null;
  const single = [];
  for (const k of ['contrast', 'shadows', 'highlights', 'whites', 'blacks']) {
    for (const v of [-100, -50, 50, 100]) single.push({ [k]: v });
  }
  for (const tone of single) {
    for (const g of [0.05, 0.2, 0.5, 0.7, 0.9]) {
      let prev = -1;
      for (const d of ramp) {
        const out = toneModel(d, g, tone);
        if (out < prev - 1e-6) { bad = { tone, g, d, out, prev }; break; }
        prev = out;
      }
      if (bad) break;
    }
    if (bad) break;
  }
  check('mapping is monotone for every slider extreme', !bad, JSON.stringify(bad));
}

// 3. no dead plateau: adjacent input steps stay strictly increasing in float,
//    and the 8-bit output cannot sit on one value for more than 6 steps in the
//    unclipped range (a real curve compresses, it does not flatline)
{
  let bad = null;
  for (const tone of [
    { highlights: -100 }, { highlights: 100 }, { shadows: -100 }, { shadows: 100 },
    { whites: -100 }, { whites: 50 }, { blacks: -100 }, { blacks: 100 },
    { highlights: -100, shadows: 100 }, { highlights: -60, shadows: 80, contrast: 40 },
  ]) {
    for (const g of [0.1, 0.35, 0.65]) {
      let run = 0, last = null;
      for (const d of ramp) {
        const out = toneModel(d, g, tone);
        const q = levels(out);
        if (q === last && out < 0.985 && out > 0.06) run++;
        else { last = q; run = 1; }
        if (run > 6) { bad = { tone, g, d, q, run }; break; }
      }
      if (bad) break;
    }
    if (bad) break;
  }
  check('no flat plateau in any tone mapping', !bad, JSON.stringify(bad));
}

// 4. band isolation (uniform image, so guide == pixel)
{
  const base = (d) => toneModel(d, d);
  const delta = (tone, d) => levels(toneModel(d, d, tone)) - levels(base(d));
  check('highlights −100 leaves the midtones alone',
    Math.abs(delta({ highlights: -100 }, 0.40)) <= 1 && Math.abs(delta({ highlights: -100 }, 0.30)) <= 1,
    JSON.stringify([0.3, 0.4].map((d) => delta({ highlights: -100 }, d))));
  check('highlights −100 really pulls the bright end back',
    delta({ highlights: -100 }, 0.90) <= -14, String(delta({ highlights: -100 }, 0.90)));
  check('shadows +100 barely touches the upper half',
    Math.abs(delta({ shadows: 100 }, 0.70)) <= 8 && Math.abs(delta({ shadows: 100 }, 0.55)) <= 8,
    JSON.stringify([0.55, 0.7].map((d) => delta({ shadows: 100 }, d))));
  check('shadows +100 really opens the shadows',
    delta({ shadows: 100 }, 0.08) >= 14, String(delta({ shadows: 100 }, 0.08)));
  check('whites are a top-end move',
    Math.abs(delta({ whites: -100 }, 0.50)) <= 7 && delta({ whites: -100 }, 0.85) <= -15,
    JSON.stringify([0.5, 0.85].map((d) => delta({ whites: -100 }, d))));
  check('whites +100 stretches the top of the range',
    delta({ whites: 100 }, 0.50) <= 4 && delta({ whites: 100 }, 0.70) >= 20,
    JSON.stringify([0.5, 0.7].map((d) => delta({ whites: 100 }, d))));
  check('blacks are a bottom-end move',
    Math.abs(delta({ blacks: 100 }, 0.50)) <= 2 && delta({ blacks: 100 }, 0.03) >= 6,
    JSON.stringify([0.03, 0.5].map((d) => delta({ blacks: 100 }, d))));
  check('highlights −100 does not turn white into grey',
    toneModel(0.97, 0.97, { highlights: -100 }) > 0.85,
    String(levels(toneModel(0.97, 0.97, { highlights: -100 }))));
}

// 5. highlights/shadows are adaptive: the same pixel changes with its
//    neighbourhood (the defining property of Lightroom's sliders)
{
  const dark = toneModel(0.15, 0.10, { shadows: 100 });
  const brightNeighbour = toneModel(0.15, 0.55, { shadows: 100 });
  check('shadows depend on the neighbourhood, not only the pixel', dark - brightNeighbour > 0.08,
    JSON.stringify({ dark: levels(dark), brightNeighbour: levels(brightNeighbour) }));
}

// 6. local contrast is preserved inside a shadow region (a global curve would
//    compress it; this is the "no mud" guarantee)
{
  const g = 0.18;
  const a = lin(0.14), b = lin(0.18);
  const outA = lin(toneModel(0.14, g, { shadows: 100 }));
  const outB = lin(toneModel(0.18, g, { shadows: 100 }));
  const ratioIn = b / a, ratioOut = outB / outA;
  check('shadow lift is multiplicative (local contrast preserved)', Math.abs(ratioOut / ratioIn - 1) < 0.03,
    JSON.stringify({ ratioIn, ratioOut }));
}

// 7. endpoint magnitudes
{
  const wPlus = toneModel(0.95, 0.95, { whites: 100 });
  const wMinus = toneModel(0.95, 0.95, { whites: -100 });
  const bPlus = toneModel(0.02, 0.02, { blacks: 100 });
  const bMinus = toneModel(0.02, 0.02, { blacks: -100 });
  check('whites +100 clips the white point', wPlus >= 0.995, String(levels(wPlus)));
  check('whites −100 recovers the white point', wMinus > 0.72 && wMinus < 0.92, String(levels(wMinus)));
  check('blacks +100 lifts the black point', bPlus >= 0.06, String(levels(bPlus)));
  check('blacks −100 crushes the black point', bMinus <= 0.02, String(levels(bMinus)));
}

// 8. response table for tuning (`node scripts/test-tone-model.mjs --table`)
if (process.argv.includes('--table')) {
  const bands = [0.03, 0.08, 0.15, 0.3, 0.5, 0.7, 0.8, 0.9, 0.97];
  const rows = {
    'shadows +100': { shadows: 100 }, 'shadows -100': { shadows: -100 },
    'highlights +100': { highlights: 100 }, 'highlights -100': { highlights: -100 },
    'whites +100': { whites: 100 }, 'whites -100': { whites: -100 },
    'blacks +100': { blacks: 100 }, 'blacks -100': { blacks: -100 },
    'contrast +100': { contrast: 100 }, 'contrast -100': { contrast: -100 },
  };
  console.log('\ninput display: ' + bands.map((b) => String(levels(b)).padStart(5)).join(''));
  for (const [label, tone] of Object.entries(rows)) {
    console.log(label.padEnd(16), bands.map((b) => String(levels(toneModel(b, b, tone))).padStart(5)).join(''));
  }
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\ntone model: all checks passed');
