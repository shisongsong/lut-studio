#!/usr/bin/env node
/**
 * Property test for the Basic-panel tone model: `npm run test:tone`.
 *
 * This mirrors the luminance mapping in the fragment shader (renderer.js) using
 * the same calibration constants (TONE_MODEL). It is the contract the UI relies
 * on: no plateau, no cross-band damage, adaptive highlights/shadows, a real
 * highlight shoulder for scene-linear headroom, endpoint behaviour for
 * whites/blacks, and local contrast preserved inside a region.
 */
import { TONE_MODEL, TONE_EV_MIN, TONE_EV_MAX } from '../public/js/renderer.js';

const lin = (s) => { s = Math.max(0, Math.min(1, s)); return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const srgb = (y) => { y = Math.max(0, y); return y <= 0.0031308 ? 12.92 * y : 1.055 * Math.pow(y, 1 / 2.4) - 0.055; };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const evOf = (y) => Math.max(TONE_EV_MIN, Math.min(TONE_EV_MAX, Math.log2(Math.max(y, 1e-7) / 0.18)));

/**
 * Mirror of the shader's luminance mapping. Y / Yguide are *scene-linear*
 * values (the linear RAW path can exceed 1.0). `baseCurve` mirrors the display
 * S-curve the linear path applies after encoding.
 */
function toneMapLinear(Y, Yguide, tone = {}, { baseCurve = false } = {}) {
  const ev = evOf(Y);
  const slope = 1 + 0.32 * (tone.contrast || 0) / 100;
  const evC = Math.max(TONE_EV_MIN - 8, Math.min(TONE_EV_MAX + 4, ev * slope));
  const Yc = 0.18 * Math.pow(2, evC);
  const gEv = evOf(Yguide);
  const s = (tone.shadows || 0) / 100;
  const h = (tone.highlights || 0) / 100;

  const shadowW = sigmoid(-(gEv - TONE_MODEL.shadow.pivotEv) / TONE_MODEL.shadow.widthEv);
  const gainShadow = Math.pow(2, s * TONE_MODEL.shadow.stops * shadowW);

  let gainHighlight = 1;
  if (h < 0) {
    const p = TONE_MODEL.highlight.shoulderPivotEv;
    const asym = TONE_MODEL.highlight.shoulderAsymEv;
    const shoulder = p + asym * (1 - Math.exp(-Math.max(0, gEv - p) / asym));
    const target = gEv >= p ? shoulder : gEv;
    gainHighlight = Math.pow(2, (-h) * (target - gEv));
  } else if (h > 0) {
    const highlightW = sigmoid((gEv - TONE_MODEL.highlight.pivotEv) / TONE_MODEL.highlight.widthEv);
    gainHighlight = Math.pow(2, h * TONE_MODEL.highlight.stops * highlightW);
  }
  const Yl = Yc * gainShadow * gainHighlight;

  let d = srgb(Math.min(Yl, 1));
  if (baseCurve) d = d * 0.6 + (d * d * (3 - 2 * d)) * 0.4;

  const w = (tone.whites || 0) / 100;
  const b = (tone.blacks || 0) / 100;
  const whMask = smooth(TONE_MODEL.whites.knee, 1, d);
  if (w > 0) d += TONE_MODEL.whites.boost * w * d * whMask;
  else if (w < 0) d -= TONE_MODEL.whites.recover * -w * (1 - d) * whMask;
  d = clamp01(d);
  if (b > 0) d += TONE_MODEL.blacks.lift * b * (1 - smooth(0, 0.5, d));
  else if (b < 0) d *= 1 - TONE_MODEL.blacks.crush * -b * (1 - smooth(0, TONE_MODEL.blacks.toe, d));
  return clamp01(d);
}

/** sRGB-source variant: the inputs are display values. */
const toneModel = (dIn, gDisp, tone = {}) => toneMapLinear(lin(dIn), lin(gDisp), tone, { baseCurve: false });
/** Linear-RAW variant: scene-linear input, includes the display base curve. */
const toneModelRaw = (Y, Yg, tone = {}) => toneMapLinear(Y, Yg, tone, { baseCurve: true });

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`ok   ${name}`);
  else { failures++; console.error(`FAIL ${name} ${detail}`); }
};
const levels = (v) => Math.round(v * 255);
const N = 512;
const ramp = Array.from({ length: N + 1 }, (_, i) => i / N);

// 1. neutral is identity on the sRGB path, whatever the guide is
{
  let worst = 0;
  for (const g of [0, 0.05, 0.25, 0.5, 0.75, 1]) {
    for (const d of ramp) worst = Math.max(worst, Math.abs(toneModel(d, g) - d));
  }
  check('neutral is the identity for every guide value', worst < 2e-3, `max error ${worst}`);
}

// 2. the linear RAW base curve is monotone and keeps both endpoints
{
  let monotone = true;
  let prev = -1;
  for (const d of ramp) { const v = toneModelRaw(lin(d), lin(d)); if (v < prev - 1e-6) monotone = false; prev = v; }
  check('linear base curve is monotone with fixed endpoints',
    monotone && toneModelRaw(0, 0) < 0.002 && toneModelRaw(1, 1) > 0.99);
}

// 3. monotone in the pixel value for every single-slider extreme (sRGB + RAW)
{
  let bad = null;
  const single = [];
  for (const k of ['contrast', 'shadows', 'highlights', 'whites', 'blacks']) {
    for (const v of [-100, -50, 50, 100]) single.push({ [k]: v });
  }
  const run = (map, guides, values, label) => {
    for (const tone of single) {
      for (const g of guides) {
        let prev = -1;
        for (const v of values) {
          const out = map(v, g, tone);
          if (out < prev - 1e-6) { bad = { label, tone, g, v, out, prev }; return false; }
          prev = out;
        }
      }
    }
    return true;
  };
  run(toneModel, [0.05, 0.2, 0.5, 0.7, 0.9], ramp, 'srgb');
  run(toneModelRaw, [0.02, 0.2, 0.5, 2, 8], [0, 0.05, 0.18, 0.5, 1, 2, 4, 8, 16], 'raw');
  check('mapping is monotone for every slider extreme', !bad, JSON.stringify(bad));
}

// 4. no dead plateau in the midtones (a curve compresses, it does not flatline)
{
  let bad = null;
  const tones = [
    { highlights: -100 }, { highlights: 100 }, { shadows: -100 }, { shadows: 100 },
    { whites: -100 }, { whites: 50 }, { blacks: -100 }, { blacks: 100 },
    { highlights: -100, shadows: 100 }, { highlights: -60, shadows: 80, contrast: 40 },
  ];
  for (const tone of tones) {
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

// 5. highlight recovery actually uses scene-linear headroom
{
  const clipped = toneModelRaw(4, 4, { highlights: 0 });            // > white, no recovery
  const rec = toneModelRaw(4, 4, { highlights: -100 });             // recovered
  const deeper = toneModelRaw(8, 8, { highlights: -100 });          // more headroom
  const neutral = toneModelRaw(0.18, 0.18);
  check('headroom above white clips when Highlights is 0', clipped > 0.995, String(levels(clipped)));
  check('highlights −100 recovers scene-linear headroom', rec > 0.75 && rec < 0.995 && deeper >= rec,
    JSON.stringify({ clipped: levels(clipped), rec: levels(rec), deeper: levels(deeper) }));
  check('highlight recovery leaves the midtones alone',
    Math.abs(toneModelRaw(0.18, 0.18, { highlights: -100 }) - neutral) < 0.02,
    JSON.stringify({ neutral: levels(neutral), recovered: levels(toneModelRaw(0.18, 0.18, { highlights: -100 })) }));
}

// 6. band isolation (uniform image, so guide == pixel)
{
  const delta = (tone, d) => levels(toneModel(d, d, tone)) - levels(toneModel(d, d));
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
    toneModel(0.97, 0.97, { highlights: -100 }) > 0.72,
    String(levels(toneModel(0.97, 0.97, { highlights: -100 }))));
}

// 7. highlights/shadows are adaptive: same pixel, different neighbourhood
{
  const dark = toneModel(0.15, 0.10, { shadows: 100 });
  const brightNeighbour = toneModel(0.15, 0.55, { shadows: 100 });
  check('shadows depend on the neighbourhood, not only the pixel', dark - brightNeighbour > 0.08,
    JSON.stringify({ dark: levels(dark), brightNeighbour: levels(brightNeighbour) }));
}

// 8. local contrast is preserved inside a shadow region (multiplicative lift)
{
  const g = 0.18;
  const a = lin(0.14), b = lin(0.18);
  const outA = lin(toneModel(0.14, g, { shadows: 100 }));
  const outB = lin(toneModel(0.18, g, { shadows: 100 }));
  const ratioIn = b / a, ratioOut = outB / outA;
  check('shadow lift is multiplicative (local contrast preserved)', Math.abs(ratioOut / ratioIn - 1) < 0.03,
    JSON.stringify({ ratioIn, ratioOut }));
}

// 9. endpoint magnitudes
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

// 10. response table for tuning (`node scripts/test-tone-model.mjs --table`)
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
  console.log('\nlinear scene:  ' + [0.05, 0.18, 0.5, 1, 2, 4, 8, 16].map((y) => y.toFixed(2).padStart(6)).join(''));
  for (const h of [0, -50, -100]) {
    console.log(`hl ${String(h).padStart(4)} →`, [0.05, 0.18, 0.5, 1, 2, 4, 8, 16]
      .map((y) => String(levels(toneModelRaw(y, y, { highlights: h }))).padStart(6)).join(''));
  }
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\ntone model: all checks passed');
