#!/usr/bin/env node
/**
 * Property test for the Basic-panel tone model: `npm run test:tone`.
 *
 * This mirrors the luminance mapping in the fragment shader (renderer.js) using
 * the same calibration constants (TONE_MODEL, SIGMOID). It is the contract the
 * UI relies on: no plateau, no cross-band damage, adaptive highlights/shadows,
 * a real highlight shoulder for scene-linear headroom, endpoint behaviour for
 * whites/blacks, and a sigmoid display transform that matches darktable's
 * verified reference values.
 */
import { TONE_MODEL, TONE_EV_MIN, TONE_EV_MAX, SIGMOID, sigmoidFit } from '../public/js/renderer.js';

const lin = (s) => { s = Math.max(0, Math.min(1, s)); return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const srgb = (y) => { y = Math.max(0, y); return y <= 0.0031308 ? 12.92 * y : 1.055 * Math.pow(y, 1 / 2.4) - 0.055; };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const evOf = (y) => Math.max(TONE_EV_MIN, Math.min(TONE_EV_MAX, Math.log2(Math.max(y, 1e-7) / 0.18)));

/** The shader's sigmoid curve, on the CPU. `fit` comes from sigmoidFit(). */
const sigmoidCurve = (fit, x) => {
  const u = Math.pow(fit.fog + Math.max(x, 0), fit.p);
  const y = fit.w * Math.pow(u / (fit.pe + u), fit.q);
  return Number.isNaN(y) ? fit.w : y;
};

/**
 * Mirror of the shader's luminance mapping. Y / Yguide are *scene-linear*
 * values (the linear RAW path can exceed 1.0). `display` picks the transform
 * the two paths apply after the tone work: 'plain' encodes sRGB directly
 * (canvas input), 'sigmoid' routes scene values through the darktable
 * sigmoid view transform first (the RAW path — headroom rolls off instead
 * of clipping).
 */
function toneMapLinear(Y, Yguide, tone = {}, { display = 'plain' } = {}) {
  const rawPath = display === 'sigmoid';
  // On the RAW path the sigmoid curve owns mid-tone contrast (the 1D log LUT
  // is neutral there); on the sRGB path contrast stays in the LUT.
  const slope = rawPath ? 1 : 1 + 0.32 * (tone.contrast || 0) / 100;
  const ev = evOf(Y);
  const evC = Math.max(TONE_EV_MIN - 8, Math.min(TONE_EV_MAX + 4, ev * slope));
  const Yc = 0.18 * Math.pow(2, evC);
  const gEv = evOf(Yguide);
  const s = (tone.shadows || 0) / 100;
  const h = (tone.highlights || 0) / 100;

  let shadowDelta;
  if (s >= 0) {
    shadowDelta = s * TONE_MODEL.shadow.stops * sigmoid(-(gEv - TONE_MODEL.shadow.pivotEv) / TONE_MODEL.shadow.widthEv);
  } else {
    shadowDelta = s * TONE_MODEL.shadow.negA * sigmoid(-(gEv - TONE_MODEL.shadow.negPivotEv) / TONE_MODEL.shadow.negWidthEv);
  }

  let highlightDelta = 0;
  if (h < 0) {
    let drop = Math.min(
      TONE_MODEL.highlight.negSlope * Math.max(0, gEv - TONE_MODEL.highlight.negPivotEv),
      TONE_MODEL.highlight.negCapEv);
    drop += TONE_MODEL.highlight.headroomSlope * Math.max(0, gEv - TONE_MODEL.highlight.headroomFromEv);
    const mapped = gEv - (-h) * drop;
    const capEv = 10 + (-h) * (TONE_MODEL.highlight.whiteEv - 10);
    highlightDelta = Math.min(mapped, capEv) - gEv;
  } else if (h > 0) {
    const t = smooth(TONE_MODEL.highlight.posLoEv, TONE_MODEL.highlight.posHiEv, gEv);
    highlightDelta = h * (TONE_MODEL.highlight.posBase + TONE_MODEL.highlight.posExtra * t);
  }

  const Yl = Yc * Math.pow(2, shadowDelta + highlightDelta);
  let d;
  if (rawPath) {
    const cn = Math.max(-1, Math.min(1, (tone.contrast || 0) / 100));
    const fit = sigmoidFit(SIGMOID.contrast * Math.pow(2, SIGMOID.contrastGain * cn), SIGMOID.skew);
    // Yl is not clamped: the sigmoid curve is defined for all x >= 0 and the
    // above-white part is exactly the highlight headroom it compresses.
    d = srgb(Math.min(sigmoidCurve(fit, Yl), 1));
  } else {
    d = srgb(Math.min(Yl, 1));
  }

  const w = (tone.whites || 0) / 100;
  const b = (tone.blacks || 0) / 100;
  if (w > 0) d += w * TONE_MODEL.whites.stretch * Math.pow(d, TONE_MODEL.whites.gamma) * (1 - d);
  else if (w < 0) d -= -w * TONE_MODEL.whites.recover * Math.pow(d, 1.5) * (1 - d) * smooth(0.5, 1, d);
  d = clamp01(d);
  if (b < 0) {
    const point = -b * TONE_MODEL.blacks.point;
    d = clamp01((d - point) / Math.max(1e-3, 1 - point));
  } else if (b > 0) {
    const lifted = Math.pow(d, TONE_MODEL.blacks.gamma) * TONE_MODEL.blacks.gammaA + TONE_MODEL.blacks.gammaB;
    d = clamp01(d + (lifted - d) * b);
  }
  return clamp01(d);
}

/** sRGB-source variant: the inputs are display values. */
const toneModel = (dIn, gDisp, tone = {}) => toneMapLinear(lin(dIn), lin(gDisp), tone, { display: 'plain' });
/** Linear-RAW variant: scene-linear input through the sigmoid display transform. */
const toneModelRaw = (Y, Yg, tone = {}) => toneMapLinear(Y, Yg, tone, { display: 'sigmoid' });

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

// 2. the sigmoid display transform is monotone, anchored and non-clipping
{
  let monotone = true;
  let prev = -1;
  for (const d of ramp) { const v = toneModelRaw(lin(d), lin(d)); if (v < prev - 1e-6) monotone = false; prev = v; }
  const black = toneModelRaw(0, 0);
  const white = toneModelRaw(1, 1);        // sensor white
  const deep = toneModelRaw(16, 16);       // +6.4 EV of scene headroom
  // The black floor is SIGMOID.black (0.06% -> ~2/255), deliberately above
  // darktable's 0.0152% default so night shadows keep separation instead of
  // collapsing into a flat black patch.
  check('sigmoid path is monotone, black stays near-black, headroom never clips',
    monotone && black < 0.015 && white > 0.85 && white < 0.99 && deep > white && deep < 1.0,
    JSON.stringify({ black: levels(black), white: levels(white), deep: levels(deep) }));
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
        if (q === last && out < 0.94 && out > 0.06) run++;
        else { last = q; run = 1; }
        if (run > 6) { bad = { tone, g, d, q, run }; break; }
      }
      if (bad) break;
    }
    if (bad) break;
  }
  check('no flat plateau in any tone mapping', !bad, JSON.stringify(bad));
}

// 5. highlight behaviour on scene-linear headroom: smooth shoulder, real recovery
{
  const white = toneModelRaw(1, 1, { highlights: 0 });
  const four = toneModelRaw(4, 4, { highlights: 0 });
  const deep = toneModelRaw(16, 16, { highlights: 0 });
  check('sensor white renders bright without hard clipping', white > 0.85 && white < 0.99, String(levels(white)));
  check('headroom above white compresses smoothly (asymptotic, never clips)',
    four > white && deep > four && deep < 1.0, JSON.stringify({ white: levels(white), four: levels(four), deep: levels(deep) }));
  const rec = toneModelRaw(4, 4, { highlights: -100 });
  const more = toneModelRaw(8, 8, { highlights: -100 });
  check('highlights −100 recovers scene-linear headroom', rec > 0.35 && rec < 0.95 && more >= rec - 0.02,
    JSON.stringify({ rec: levels(rec), more: levels(more) }));
  check('highlights −100 compresses the midtones like Lightroom', (() => {
    const d = levels(toneModelRaw(0.18, 0.18, { highlights: -100 })) - levels(toneModelRaw(0.18, 0.18));
    return d <= -20 && d >= -55;
  })(), String(levels(toneModelRaw(0.18, 0.18, { highlights: -100 }))));
}

// 6. slider response calibrated against Lightroom Mobile (display levels)
{
  const delta = (tone, d) => levels(toneModel(d, d, tone)) - levels(toneModel(d, d));
  check('highlights −100 pulls the bright end back hard',
    delta({ highlights: -100 }, 0.85) <= -30 && Math.abs(delta({ highlights: -100 }, 0.15)) <= 4,
    JSON.stringify({ at85: delta({ highlights: -100 }, 0.85), at15: delta({ highlights: -100 }, 0.15) }));
  check('highlights +100 lifts the mid/high range',
    delta({ highlights: 100 }, 0.5) >= 30 && delta({ highlights: 100 }, 0.75) >= 40,
    JSON.stringify({ at50: delta({ highlights: 100 }, 0.5), at75: delta({ highlights: 100 }, 0.75) }));
  check('shadows +100 barely touches the upper half',
    Math.abs(delta({ shadows: 100 }, 0.75)) <= 8 && delta({ shadows: 100 }, 0.08) >= 14);
  check('shadows −100 only darkens the lower range',
    Math.abs(delta({ shadows: -100 }, 0.75)) <= 4 && delta({ shadows: -100 }, 0.12) <= -8);
  check('whites +100 is a strong top-end stretch',
    delta({ whites: 100 }, 0.5) >= 40 && delta({ whites: 100 }, 0.7) >= 30,
    JSON.stringify({ at50: delta({ whites: 100 }, 0.5), at70: delta({ whites: 100 }, 0.7) }));
  check('whites −100 only recovers highlights gently',
    Math.abs(delta({ whites: -100 }, 0.3)) <= 2 && delta({ whites: -100 }, 0.85) <= -2);
  check('blacks −100 is a real black-point move',
    delta({ blacks: -100 }, 0.5) <= -30 && toneModel(0.2, 0.2, { blacks: -100 }) <= 0.03,
    JSON.stringify({ at50: delta({ blacks: -100 }, 0.5), at20: levels(toneModel(0.2, 0.2, { blacks: -100 })) }));
  check('blacks +100 lifts the whole shadow range',
    delta({ blacks: 100 }, 0.5) >= 15 && delta({ blacks: 100 }, 0.08) >= 8,
    JSON.stringify({ at50: delta({ blacks: 100 }, 0.5), at08: delta({ blacks: 100 }, 0.08) }));
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
  check('whites −100 recovers the white point', wMinus > 0.85 && wMinus <= 0.96, String(levels(wMinus)));
  check('blacks +100 lifts the black point', bPlus >= 0.06, String(levels(bPlus)));
  check('blacks −100 crushes the black point', bMinus <= 1e-3, String(levels(bMinus)));
}

// 10. the sigmoid display transform matches darktable's algorithm
//
// The expected numbers below come from a faithful CPU port of darktable's own
// numeric fit (centre differences, delta = 1e-6) run with this project's
// parameters (contrast 1.5, skew 0, white 100%, black 0.06% instead of
// darktable's 0.0152% — the raised floor keeps night shadows apart). The test
// independent variable is therefore the closed-form fit in renderer.js.
{
  const fit = sigmoidFit();
  const curve = (x) => sigmoidCurve(fit, x);
  check('sigmoid fit defaults match darktable\'s numeric fit',
    Math.abs(fit.p - 1.5) < 1e-9 && Math.abs(fit.q - 1) < 1e-12 &&
    Math.abs(fit.fog - 3.605463273058600e-3) < 1e-10 &&
    Math.abs(fit.pe - 3.6060330994356454e-1) < 1e-10,
    JSON.stringify({ p: fit.p, q: fit.q, fog: fit.fog, pe: fit.pe }));
  check('sigmoid anchors: f(0)=black target, f(middle grey)=middle grey',
    Math.abs(curve(0) - SIGMOID.black) < 1e-12 && Math.abs(curve(0.1845) - 0.1845) < 1e-9);
  const ev = (e) => curve(0.1845 * Math.pow(2, e));
  check('sigmoid EV response matches the verified table',
    Math.abs(ev(-6) - 0.001447) < 2e-6 && Math.abs(ev(-1) - 0.076041) < 2e-6 &&
    Math.abs(ev(2) - 0.639125) < 2e-6 && Math.abs(ev(4) - 0.933735) < 2e-6 &&
    Math.abs(ev(6) - 0.991195) < 2e-6 && Math.abs(ev(8) - 0.998890) < 2e-6,
    JSON.stringify({ m6: ev(-6), p2: ev(2), p4: ev(4), p8: ev(8) }));
  let mono = true, prev = -1;
  for (let i = 0; i <= 160; i++) {
    const v = curve(0.1845 * Math.pow(2, -12 + 0.125 * i));
    if (v < prev - 1e-12) mono = false;
    prev = v;
  }
  check('sigmoid curve is monotone from −12 EV to +8 EV', mono);
  const grey = toneModelRaw(0.1845, 0.1845);
  check('grey renders at sRGB 46–47% (the darktable middle-grey anchor)',
    Math.abs(grey - srgb(0.1845)) < 0.004, String(levels(grey)));
}

// 11. response table for tuning (`node scripts/test-tone-model.mjs --table`)
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
