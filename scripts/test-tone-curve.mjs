#!/usr/bin/env node
/**
 * Property tests for the scene-adaptive tone curve (`npm run test:tone`).
 *
 * The curve is what every Basic slider is built on, so the invariants here are
 * the contract the whole panel relies on:
 *
 *  - neutral is the identity (the calibrated base rendering and the camera-look
 *    match must not move when no slider is touched);
 *  - every slider combination stays monotone and keeps a usable local slope (a
 *    folded or flat curve is the banded "solarised" shadow / flat white sky);
 *  - the anchors really come from the measured scene: the same slider value
 *    lands in the photo's own shadow/highlight range on a night frame and on a
 *    daylight frame, instead of at a fixed EV that only fitted one photo;
 *  - each slider is confined to its named end of the histogram (highlights
 *    cannot darken midtones, whites cannot act like exposure, blacks cannot
 *    wipe the middle, shadows cannot lift the black point).
 */
import {
  buildToneCurves, buildBaseCurve, buildLocalCurve, sampleCurve, evStats,
  sanitizeSceneStats, neutralSceneStats, minCurveSlope, evAtIndex,
  TONE_DOMAIN, TONE_LUT_SIZE, SENSOR_WHITE_EV,
} from '../public/js/tone-curve.js';

const EV_MIN = TONE_DOMAIN.min;
const EV_MAX = TONE_DOMAIN.max;
const EV_SPAN = EV_MAX - EV_MIN;

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`ok   ${name}`);
  else { failures++; console.error(`FAIL ${name} ${detail}`); }
};

/**
 * The scenes below are the real measured statistics of the four calibration
 * RAWs (scene-referred EV before the auto exposure), plus the exposure the
 * renderer applies on open. Keeping the numbers honest here means the property
 * tests exercise the same anchor placement the browser does.
 */
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
const scene = (name) => sanitizeSceneStats(SCENES[name].stats);
const exposureOf = (name) => SCENES[name].exposure;
/** Display-referred EV of a measured quantile, as the shader receives it. */
const evOf = (name, key) => SCENES[name].stats[key] + SCENES[name].exposure;

// ---------------------------------------------------------------------------
// 1. identity at neutral
// ---------------------------------------------------------------------------
{
  let worstBase = 0;
  let worstLocal = 0;
  for (const name of Object.keys(SCENES)) {
    for (const exposure of [-3, -1, 0, 0.7, 2.5, exposureOf(name)]) {
      const { base, local } = buildToneCurves({ scene: scene(name), exposure });
      for (let i = 0; i < TONE_LUT_SIZE; i++) {
        worstBase = Math.max(worstBase, Math.abs(base[i] - evAtIndex(i)));
        worstLocal = Math.max(worstLocal, Math.abs(local[i]));
      }
    }
  }
  check('neutral global curve is the identity on every scene and exposure', worstBase < 1e-4, `max error ${worstBase}`);
  check('neutral local curve is zero everywhere', worstLocal < 1e-9, `max ${worstLocal}`);
}

// ---------------------------------------------------------------------------
// 2. monotone + usable slope for the whole slider space
// ---------------------------------------------------------------------------
{
  const values = [-100, -60, -25, 0, 25, 60, 100];
  let worstSlope = Infinity;
  let worstCombo = '';
  let bad = null;
  for (const name of Object.keys(SCENES)) {
    for (const contrast of values) {
      for (const shadows of [-100, 0, 100]) {
        for (const highlights of [-100, 0, 100]) {
          for (const whites of [-100, 0, 100]) {
            for (const blacks of [-100, 0, 100]) {
              const curves = buildToneCurves({ scene: scene(name), exposure: exposureOf(name), contrast, shadows, highlights, whites, blacks });
              if (!curves.base.every(Number.isFinite) || !curves.local.every(Number.isFinite)) {
                bad = { name, contrast, shadows, highlights, whites, blacks, reason: 'non-finite' };
                break;
              }
              // In a flat neighbourhood guide EV == pixel EV, so the composed
              // mapping is base + local; that is the curve a smooth sky sees.
              for (let i = 0; i < TONE_LUT_SIZE; i++) {
                const composed = curves.base[i] + curves.local[i];
                if (i) {
                  const prev = curves.base[i - 1] + curves.local[i - 1];
                  const slope = (composed - prev) / EV_SPAN * (TONE_LUT_SIZE - 1);
                  if (slope < worstSlope) {
                    worstSlope = slope;
                    worstCombo = `${name} c${contrast} s${shadows} h${highlights} w${whites} b${blacks} @${evAtIndex(i).toFixed(2)}`;
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  check('no slider combination folds the curve (monotone, finite)', !bad, JSON.stringify(bad));
  check('the composed curve keeps a usable slope (no plateau / banding)', worstSlope > 0.05, `min slope ${worstSlope.toFixed(3)} at ${worstCombo}`);
}

// ---------------------------------------------------------------------------
// 3. anchors follow the measured scene (the whole point of the rewrite)
// ---------------------------------------------------------------------------
{
  const peakOf = (name, adjust) => {
    const local = buildLocalCurve(scene(name), { exposure: exposureOf(name), ...adjust });
    let best = -Infinity, bestEv = 0;
    for (let i = 2; i < TONE_LUT_SIZE - 2; i++) {
      if (local[i] > best) { best = local[i]; bestEv = evAtIndex(i); }
    }
    return { peak: best, at: bestEv };
  };
  const night = peakOf('night', { shadows: 100 });
  const day = peakOf('day', { shadows: 100 });
  check('shadows +100 peaks inside each photo\'s own measured shadows',
    night.at < evOf('night', 'p50') && day.at < evOf('day', 'p50')
      && Math.abs(night.at - evOf('night', 'p25')) < 1.6 && Math.abs(day.at - evOf('day', 'p25')) < 1.6,
    `night peak ${night.at.toFixed(2)} EV (p25 ${evOf('night', 'p25').toFixed(2)}), day peak ${day.at.toFixed(2)} EV (p25 ${evOf('day', 'p25').toFixed(2)})`);
  check('the shadow band is not pinned to one fixed EV across scenes',
    Math.abs(night.at - day.at) > 1.0,
    `night ${night.at.toFixed(2)} vs day ${day.at.toFixed(2)}`);

  const topMove = (name) => {
    const exp = exposureOf(name);
    const base = buildToneCurves({ scene: scene(name), exposure: exp });
    const rec = buildToneCurves({ scene: scene(name), exposure: exp, highlights: -100 });
    const total = (curves, ev) => sampleCurve(curves.base, ev) + sampleCurve(curves.local, ev);
    return {
      mid: Math.abs(total(rec, evOf(name, 'p50')) - total(base, evOf(name, 'p50'))),
      top: total(base, evOf(name, 'p95')) - total(rec, evOf(name, 'p95')),
    };
  };
  for (const name of ['night', 'day', 'dim']) {
    const t = topMove(name);
    check(`${name}: highlights −100 recovers the top without moving the midtone`,
      t.top > 0.35 && t.mid < 0.25, `top −${t.top.toFixed(2)} EV, mid Δ${t.mid.toFixed(2)} EV`);
  }
}

// ---------------------------------------------------------------------------
// 4. per-slider confinement
// ---------------------------------------------------------------------------
{
  const total = (curves, ev) => sampleCurve(curves.base, ev) + sampleCurve(curves.local, ev);
  const delta = (name, adjust, ev) => {
    const exp = exposureOf(name);
    return total(buildToneCurves({ scene: scene(name), exposure: exp, ...adjust }), ev)
      - total(buildToneCurves({ scene: scene(name), exposure: exp }), ev);
  };

  for (const name of ['night', 'day', 'dim', 'flat']) {
    // shadows: move the shadow band, keep the black point and the highlights
    const sp = delta(name, { shadows: 100 }, evOf(name, 'p25'));
    const sBlack = Math.abs(delta(name, { shadows: 100 }, evOf(name, 'p01')));
    const sTop = Math.abs(delta(name, { shadows: 100 }, evOf(name, 'p95')));
    check(`${name}: shadows +100 lifts p25, keeps the black point and the top`,
      sp > 0.35 && sBlack < 0.2 && sTop < 0.15,
      `p25 +${sp.toFixed(2)} EV, p1 ${sBlack.toFixed(2)}, p95 ${sTop.toFixed(2)}`);

    // highlights: top only
    const hTop = delta(name, { highlights: -100 }, evOf(name, 'p95'));
    const hMid = Math.abs(delta(name, { highlights: -100 }, evOf(name, 'p50')));
    check(`${name}: highlights −100 only moves the top`, hTop < -0.3 && hMid < 0.2,
      `p95 ${hTop.toFixed(2)} EV, p50 Δ${hMid.toFixed(2)}`);

    // whites: top only, mid untouched
    const wTop = delta(name, { whites: -100 }, evOf(name, 'p95'));
    const wMid = Math.abs(delta(name, { whites: -100 }, evOf(name, 'p50')));
    check(`${name}: whites −100 recovers the top only`, wTop < -0.15 && wMid < 0.05,
      `p95 ${wTop.toFixed(2)} EV, p50 Δ${wMid.toFixed(2)}`);

    // blacks: bottom only, middle untouched
    const bLow = delta(name, { blacks: -100 }, evOf(name, 'p05'));
    const bMid = Math.abs(delta(name, { blacks: -100 }, evOf(name, 'p50')));
    check(`${name}: blacks −100 deepens the bottom only`, bLow < -0.2 && bMid < 0.05,
      `p5 ${bLow.toFixed(2)} EV, p50 Δ${bMid.toFixed(2)}`);

    // contrast: pivot at the measured median
    const cPivot = Math.abs(delta(name, { contrast: 100 }, evOf(name, 'p50')));
    const cTop = delta(name, { contrast: 100 }, evOf(name, 'p95'));
    check(`${name}: contrast pivots on the measured median`, cPivot < 0.05 && cTop > 0.1,
      `p50 Δ${cPivot.toFixed(3)}, p95 +${cTop.toFixed(2)}`);
  }
}

// ---------------------------------------------------------------------------
// 5. measured statistics
// ---------------------------------------------------------------------------
{
  const buf = new Float32Array(10000);
  for (let i = 0; i < buf.length; i++) buf[i] = -10 + 20 * (i / (buf.length - 1));
  const st = evStats(buf);
  check('evStats returns ordered quantiles',
    st.p01 <= st.p05 && st.p05 <= st.p25 && st.p25 <= st.p50 && st.p50 <= st.p75 && st.p75 <= st.p95 && st.p95 <= st.p999,
    JSON.stringify(st));
  check('evStats places the median on a uniform EV buffer', Math.abs(st.p50) < 0.05, String(st.p50));

  const degenerate = sanitizeSceneStats({ p50: -9, p999: -9, min: -9, max: -9, linear: true });
  const curves = buildToneCurves({ scene: degenerate, contrast: 100, shadows: 100, highlights: 100, whites: 100, blacks: -100 });
  check('a degenerate (all-black) scene still produces a monotone finite curve',
    curves.base.every(Number.isFinite) && minCurveSlope(curves.base) > 0.05,
    `min slope ${minCurveSlope(curves.base).toFixed(3)}`);

  const neutral = neutralSceneStats(true);
  check('default scene is a sane mid-range scene',
    neutral.p05 < neutral.p50 && neutral.p50 < neutral.p95 && neutral.p999 <= EV_MAX,
    JSON.stringify({ p05: neutral.p05, p50: neutral.p50, p95: neutral.p95 }));
  check('sensor white anchor is 18 % grey at 1.0', Math.abs(SENSOR_WHITE_EV - Math.log2(1 / 0.18)) < 1e-9);
}

// ---------------------------------------------------------------------------
// 6. base curve stays inside the representable range
// ---------------------------------------------------------------------------
{
  let worst = 0;
  for (const name of Object.keys(SCENES)) {
    for (const exposure of [-4, 0, 4]) {
      for (const contrast of [-100, 100]) {
        for (const whites of [-100, 100]) {
          for (const blacks of [-100, 100]) {
            const base = buildBaseCurve(scene(name), { exposure: exposureOf(name) + exposure, contrast, whites, blacks });
            for (let i = 0; i < base.length; i++) worst = Math.max(worst, Math.abs(base[i]));
          }
        }
      }
    }
  }
  check('base curve output stays finite for every extreme', Number.isFinite(worst) && worst < 40, `max |EV| ${worst.toFixed(2)}`);
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\ntone curve: all checks passed');
