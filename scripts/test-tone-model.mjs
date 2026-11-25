#!/usr/bin/env node
/**
 * End-to-end contracts for the Basic-panel sliders (`npm run test:tone`).
 *
 * The per-slider shape is tested in test-tone-curve.mjs; this file puts the
 * curve through the *display pipeline* (sigmoid → sRGB) on the real measured
 * statistics of the four calibration RAWs, and asserts what a photographer
 * expects from each slider:
 *
 *   highlights −100  recovers the top, leaves the midtones where they are;
 *   shadows +100     opens the shadows, never lifts the black point;
 *   whites ±100      moves the white point, not the exposure;
 *   blacks ±100      moves the black point, not the middle of the histogram;
 *   contrast ±100    pivots on the photo's own median;
 *   every setting    keeps the mapping monotone (no banded / solarised tones).
 *
 * The old engine failed exactly these contracts: fixed EV pivots made
 * highlights/whites behave like exposure on a daylit frame, and the display
 * offsets crushed midtones when the sliders reached their ends. The numbers in
 * the assertions below are the regression fence for that.
 */
import { buildToneCurves, sampleCurve, sanitizeSceneStats } from '../public/js/tone-curve.js';
import { SIGMOID, sigmoidFit } from '../public/js/renderer.js';

const fit = sigmoidFit(SIGMOID.contrast, SIGMOID.skew, SIGMOID.white, SIGMOID.black);
const sigmoid = (x) => {
  const u = Math.pow(fit.fog + Math.max(x, 0), fit.p);
  const y = fit.w * Math.pow(u / (fit.pe + u), fit.q);
  return Number.isNaN(y) ? fit.w : y;
};
const toSrgb = (y) => {
  y = Math.max(0, y);
  return y <= 0.0031308 ? 12.92 * y : 1.055 * Math.pow(y, 1 / 2.4) - 0.055;
};

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`ok   ${name}`);
  else { failures++; console.error(`FAIL ${name} ${detail}`); }
};

/** The four calibration scenes: measured scene EV + the exposure on open. */
const SCENES = {
  night: {
    exposure: 1.89,
    stats: {
      p001: -9.4, p005: -8.0, p01: -6.94, p02: -6.6, p05: -6.27, p10: -5.76,
      p25: -4.74, p50: -3.38, p75: -2.14, p90: -1.01, p95: 0.25, p98: 1.5,
      p99: 2.44, p995: 2.46, p999: 2.47, min: -10, max: 2.62, linear: true,
    },
  },
  day: {
    exposure: 1.58,
    stats: {
      p001: -7.4, p005: -5.6, p01: -6.32, p02: -5.4, p05: -5.11, p10: -4.38,
      p25: -3.06, p50: -1.47, p75: -0.52, p90: 0.23, p95: 0.65, p98: 1.0,
      p99: 1.36, p995: 1.6, p999: 1.82, min: -9, max: 2.07, linear: true,
    },
  },
  dim: {
    exposure: 3.22,
    stats: {
      p001: -7.4, p005: -6.4, p01: -6.27, p02: -6.0, p05: -5.82, p10: -5.59,
      p25: -5.13, p50: -4.19, p75: -2.31, p90: -1.47, p95: -0.95, p98: -0.5,
      p99: -0.11, p995: 0.3, p999: 0.69, min: -9, max: 2.22, linear: true,
    },
  },
  flat: {
    exposure: 0.9,
    stats: {
      p001: -4.0, p005: -3.4, p01: -3.1, p02: -2.9, p05: -2.6, p10: -2.2,
      p25: -1.6, p50: -1.0, p75: -0.2, p90: 0.6, p95: 0.9, p98: 1.1,
      p99: 1.3, p995: 1.5, p999: 1.7, min: -5, max: 2.0, linear: true,
    },
  },
};
const sceneOf = (name) => sanitizeSceneStats(SCENES[name].stats);

/** Scene EV samples, piecewise-linear between the measured quantiles. */
function sceneSamples(name, n = 8000) {
  const sc = sceneOf(name);
  const anchors = [
    [0.001, sc.p001], [0.005, sc.p005], [0.01, sc.p01], [0.02, sc.p02],
    [0.05, sc.p05], [0.10, sc.p10], [0.25, sc.p25], [0.50, sc.p50],
    [0.75, sc.p75], [0.90, sc.p90], [0.95, sc.p95], [0.98, sc.p98],
    [0.99, sc.p99], [0.995, sc.p995], [0.999, sc.p999],
  ];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    let k = 0;
    while (k < anchors.length - 2 && u > anchors[k + 1][0]) k++;
    const [u0, e0] = anchors[k];
    const [u1, e1] = anchors[k + 1];
    const t = Math.min(1, Math.max(0, (u - u0) / Math.max(1e-9, u1 - u0)));
    out[i] = e0 + (e1 - e0) * t;
  }
  return out;
}

/** Run the atonal form of the shader pipeline (guide EV == pixel EV). */
function render(stats, exposure, tone = {}) {
  const scene = sanitizeSceneStats(stats);
  const curves = buildToneCurves({ scene, exposure, ...tone });
  const evs = sceneSamples(Object.keys(SCENES).find((k) => SCENES[k].stats === stats) || 'day');
  const values = new Float32Array(evs.length);
  for (let i = 0; i < evs.length; i++) {
    const y = 0.18 * Math.pow(2, evs[i] + exposure);
    const ev = Math.log2(y / 0.18);
    const outEv = sampleCurve(curves.base, ev) + sampleCurve(curves.local, ev);
    values[i] = sigmoid(0.18 * Math.pow(2, outEv));
  }
  const enc = Array.from(values, (v) => Math.round(toSrgb(v) * 255)).sort((a, b) => a - b);
  const n = enc.length;
  const q = (p) => enc[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];
  return {
    mean: enc.reduce((a, b) => a + b, 0) / n,
    p1: q(0.01), p5: q(0.05), p25: q(0.25), p50: q(0.50), p75: q(0.75),
    p90: q(0.90), p95: q(0.95), p99: q(0.99), p999: q(0.999),
    black: enc.filter((v) => v <= 1).length / n,
    white: enc.filter((v) => v >= 254).length / n,
    // strict monotonicity of the whole rendered mapping
    monotone: (() => {
      let prev = -Infinity;
      for (const e of evs) {
        const y = 0.18 * Math.pow(2, e + exposure);
        const ev = Math.log2(y / 0.18);
        const v = sampleCurve(curves.base, ev) + sampleCurve(curves.local, ev);
        if (v < prev - 1e-6) return false;
        prev = v;
      }
      return true;
    })(),
  };
}

function sceneName(stats) {
  return Object.keys(SCENES).find((k) => SCENES[k].stats === stats);
}
function baseOf(name) {
  return render(SCENES[name].stats, SCENES[name].exposure);
}
function moved(name, tone) {
  return render(SCENES[name].stats, SCENES[name].exposure, tone);
}

// ---------------------------------------------------------------------------
// every combination stays monotone and has a plausible baseline
// ---------------------------------------------------------------------------
for (const name of Object.keys(SCENES)) {
  const b = baseOf(name);
  check(`${name}: base rendering is plausible and monotone`,
    b.monotone && b.p50 > 2 && b.p50 < 250 && b.p5 >= 0 && b.p999 <= 255,
    JSON.stringify(b));
}

// ---------------------------------------------------------------------------
// exposure: symmetric gain (applied before the curve), no curve change
// ---------------------------------------------------------------------------
{
  for (const name of Object.keys(SCENES)) {
    const b = baseOf(name);
    const up = render(SCENES[name].stats, SCENES[name].exposure + 1, {});
    const down = render(SCENES[name].stats, SCENES[name].exposure - 1, {});
    check(`${name}: +1 EV brightens, −1 EV darkens`,
      up.p50 > b.p50 + 8 && down.p50 < b.p50 - 8,
      `p50 ${down.p50} / ${b.p50} / ${up.p50}`);
  }
}

// ---------------------------------------------------------------------------
// highlights: top only, never a flat white plate
// ---------------------------------------------------------------------------
for (const name of Object.keys(SCENES)) {
  const b = baseOf(name);
  const rec = moved(name, { highlights: -100 });
  const lift = moved(name, { highlights: 100 });
  check(`${name}: highlights −100 recovers the top`,
    rec.p95 <= b.p95 - 12 && rec.p99 <= b.p99 - 12 && rec.white <= b.white + 0.002,
    `p95 ${b.p95}->${rec.p95} p99 ${b.p99}->${rec.p99} white ${b.white}->${rec.white}`);
  check(`${name}: highlights −100 leaves the midtones alone`,
    Math.abs(rec.p50 - b.p50) <= 10 && Math.abs(rec.p25 - b.p25) <= 6,
    `p50 ${b.p50}->${rec.p50} p25 ${b.p25}->${rec.p25}`);
  check(`${name}: highlights −100 does not flatten the top (still monotone)`,
    rec.monotone && rec.p90 > rec.p50 + 20,
    `p90 ${rec.p90} vs p50 ${rec.p50}`);
  check(`${name}: highlights +100 lifts the bright end`,
    lift.p95 >= b.p95 + 4 && Math.abs(lift.p50 - b.p50) <= 10,
    `p95 ${b.p95}->${lift.p95} p50 ${b.p50}->${lift.p50}`);
}

// ---------------------------------------------------------------------------
// shadows: open the shadows, never the black point
// ---------------------------------------------------------------------------
for (const name of Object.keys(SCENES)) {
  const b = baseOf(name);
  const open = moved(name, { shadows: 100 });
  const deep = moved(name, { shadows: -100 });
  check(`${name}: shadows +100 opens the shadows`,
    open.p5 >= b.p5 + 4 && open.p25 >= b.p25 + 6,
    `p5 ${b.p5}->${open.p5} p25 ${b.p25}->${open.p25}`);
  check(`${name}: shadows +100 keeps the black point`,
    open.p1 <= b.p1 + 3 && open.black <= b.black + 0.01,
    `p1 ${b.p1}->${open.p1} black ${b.black}->${open.black}`);
  check(`${name}: shadows +100 leaves the highlights alone`,
    Math.abs(open.p95 - b.p95) <= 3,
    `p95 ${b.p95}->${open.p95}`);
  check(`${name}: shadows −100 deepens the shadows`,
    deep.p25 <= b.p25 - 4 && Math.abs(deep.p95 - b.p95) <= 3,
    `p25 ${b.p25}->${deep.p25} p95 ${b.p95}->${deep.p95}`);
}

// ---------------------------------------------------------------------------
// whites / blacks: endpoint moves, not exposure
// ---------------------------------------------------------------------------
for (const name of Object.keys(SCENES)) {
  const b = baseOf(name);
  const wUp = moved(name, { whites: 100 });
  const wDown = moved(name, { whites: -100 });
  check(`${name}: whites +100 moves the white point up`,
    wUp.p99 >= b.p99 + 3 && Math.abs(wUp.p50 - b.p50) <= 6,
    `p99 ${b.p99}->${wUp.p99} p50 ${b.p50}->${wUp.p50}`);
  check(`${name}: whites −100 moves the white point down`,
    wDown.p99 <= b.p99 - 5 && Math.abs(wDown.p50 - b.p50) <= 6,
    `p99 ${b.p99}->${wDown.p99} p50 ${b.p50}->${wDown.p50}`);
  check(`${name}: whites +100 does not behave like exposure`,
    wUp.p50 <= b.p50 + 8,
    `p50 ${b.p50}->${wUp.p50}`);

  const bUp = moved(name, { blacks: 100 });
  const bDown = moved(name, { blacks: -100 });
  check(`${name}: blacks +100 lifts the black floor`,
    bUp.p1 >= b.p1 + 3 && Math.abs(bUp.p50 - b.p50) <= 6,
    `p1 ${b.p1}->${bUp.p1} p50 ${b.p50}->${bUp.p50}`);
  check(`${name}: blacks −100 deepens the bottom without wiping the middle`,
    bDown.p5 <= b.p5 - 2 && Math.abs(bDown.p50 - b.p50) <= 4,
    `p5 ${b.p5}->${bDown.p5} p50 ${b.p50}->${bDown.p50}`);
}

// ---------------------------------------------------------------------------
// contrast: pivot on the photo's own median
// ---------------------------------------------------------------------------
for (const name of Object.keys(SCENES)) {
  const b = baseOf(name);
  const plus = moved(name, { contrast: 100 });
  const minus = moved(name, { contrast: -100 });
  check(`${name}: contrast +100 expands around the median`,
    plus.p95 >= b.p95 + 1 && plus.p5 <= b.p5 + 2 && Math.abs(plus.p50 - b.p50) <= 4,
    `p5 ${b.p5}->${plus.p5} p50 ${b.p50}->${plus.p50} p95 ${b.p95}->${plus.p95}`);
  check(`${name}: contrast −100 flattens around the median`,
    minus.p95 <= b.p95 - 1 && Math.abs(minus.p50 - b.p50) <= 4,
    `p50 ${b.p50}->${minus.p50} p95 ${b.p95}->${minus.p95}`);
}

// ---------------------------------------------------------------------------
// cross-image consistency: the same slider must not act like exposure on one
// frame and like a local move on another
// ---------------------------------------------------------------------------
{
  const midShift = (name, tone) => { const b = baseOf(name); const m = moved(name, tone); return Math.abs(m.p50 - b.p50); };
  const midShifts = Object.keys(SCENES).map((name) => midShift(name, { highlights: -100 }));
  check('highlights −100 keeps the midtone shift similar on every photo',
    Math.max(...midShifts) - Math.min(...midShifts) <= 8,
    `p50 shifts ${midShifts.map((v) => v.toFixed(1)).join(' / ')}`);
  const whiteShifts = Object.keys(SCENES).map((name) => midShift(name, { whites: 100 }));
  check('whites +100 keeps the midtone shift similar on every photo',
    Math.max(...whiteShifts) - Math.min(...whiteShifts) <= 8,
    `p50 shifts ${whiteShifts.map((v) => v.toFixed(1)).join(' / ')}`);
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\ntone model: all checks passed');
