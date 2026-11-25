#!/usr/bin/env node
/**
 * Unit tests for Auto Tone's camera-look branch.
 *
 * The neutral branch is the pre-existing Lightroom-calibrated percentile
 * heuristic; it is pinned here so a refactor cannot change it silently. The
 * camera branch has a hard contract ("Auto Tone never makes the frame darker
 * than the camera rendition"), a one-way placement hint, and a solver that is
 * driven by the rendered histogram. The solver is tested against a synthetic
 * monotone response, so these checks are deterministic and need no browser.
 */
import {
  neutralAutoValues, cameraAutoTargets, solveCameraAutoTone,
  CAMERA_TONE_BOUNDS, TONE_SLIDER_KEYS,
} from '../public/js/auto-tone.js';

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`ok   ${name}`);
  else { failures++; console.error(`FAIL ${name} ${detail}`); }
};

// ---------- neutral heuristic is pinned to the shipped values ----------
{
  const m = { p1: 8, p5: 9, p25: 27, p50: 58, p75: 104, p95: 189, p99: 250 };
  const v = neutralAutoValues(m);
  check('neutral: night reference keeps the calibrated slider values',
    v.contrast === 31 && v.highlights === -46 && v.shadows === 18 && v.whites === -2 && v.blacks === -11,
    JSON.stringify(v));
  const dark = neutralAutoValues({ p1: 0, p5: 0, p25: 10, p50: 20, p75: 30, p95: 60, p99: 90 });
  check('neutral: dark flat frame clamps inside the shipped ranges',
    dark.contrast === 53 && dark.highlights === -20 && dark.shadows === 24 && dark.whites === -20 && dark.blacks === 4,
    JSON.stringify(dark));
}

// ---------- targets: night frame (clipped top, darker than the hint) ----------
const nightBase = { p1: 4, p5: 6, p25: 16, p50: 38, p75: 77, p95: 161, p99: 250, p995: 250, mean: 54.3 };
const nightRef = { p1: 3, p5: 6, p25: 24, p50: 49, p75: 84, p95: 161, p99: 237, p995: 237, mean: 60.2 };
{
  const t = cameraAutoTargets(nightBase, nightRef);
  check('targets: midtones follow the hint upward but are capped',
    t.p25 === 22 && t.p50 === 44, JSON.stringify(t));
  check('targets: shadows never fall below the camera rendering',
    t.p5 >= nightBase.p5 && t.p1 >= nightBase.p1 - 1, JSON.stringify(t));
  check('targets: clipped top is pulled down, not pushed up',
    t.p99 <= 244 && t.p995 <= 248 && t.p99 <= nightBase.p99, JSON.stringify(t));
}

// ---------- targets: bright frame, neutral result darker (must not darken) ----------
{
  const base = { p1: 5, p5: 13, p25: 48, p50: 105, p75: 155, p95: 213, p99: 232, p995: 237, mean: 104.8 };
  const ref = { p1: 4, p5: 14, p25: 45, p50: 86, p75: 116, p95: 168, p99: 196, p995: 204, mean: 84.5 };
  const t = cameraAutoTargets(base, ref);
  check('targets: a darker neutral result cannot darken the camera rendering',
    t.p50 >= base.p50 && t.p25 >= base.p25 && t.p5 >= base.p5, JSON.stringify(t));
  check('targets: unused headroom is stretched into, capped at 247',
    t.p99 > base.p99 && t.p99 <= 244 && t.p995 > base.p995 && t.p995 <= 247, JSON.stringify(t));
}

// ---------- targets: washed black floor ----------
{
  const base = { p1: 12, p5: 20, p25: 50, p50: 110, p75: 160, p95: 210, p99: 235, p995: 240, mean: 108 };
  const ref = { ...base, p1: 10, p50: 112 };
  const t = cameraAutoTargets(base, ref);
  check('targets: a washed black floor is deepened, a dark one left alone',
    t.p1 === 4 && cameraAutoTargets({ ...base, p1: 3 }, ref).p1 === 3, JSON.stringify(t));
}

// ---------- solver: linear synthetic response ----------
const linearMeasure = (coef) => (v) => ({
  p1: 4 + coef.p1 * v.blacks,
  p5: 6 + coef.p5 * v.shadows,
  p25: 16 + coef.p25 * v.shadows,
  p50: 38 + coef.p50 * v.shadows + coef.p50h * v.highlights,
  p75: 77 + coef.p75 * v.shadows,
  p95: 161 + coef.p95 * v.highlights,
  p99: 250 + coef.p99 * v.highlights + coef.p99w * v.whites,
  p995: 250 + coef.p995 * v.highlights + coef.p995w * v.whites,
  mean: 54.3 + coef.meanSh * v.shadows + coef.meanHi * v.highlights,
});

{
  const targets = { p1: 4, p5: 6, p25: 22, p50: 44, p95: 161, p99: 244, p995: 248 };
  const measure = linearMeasure({
    p1: 0.05, p5: 0.05, p25: 0.18, p50: 0.2, p50h: -0.05, p75: 0.2, p95: 0.5,
    p99: 0.35, p99w: 0.2, p995: 0.15, p995w: 0.1, meanSh: 0.13, meanHi: 0.05,
  });
  const out = solveCameraAutoTone({ measure, base: nightBase, targets });
  const a = out.after;
  check('solver: opens the midtones onto the target',
    Math.abs(a.p25 - 22) <= 1.5 && Math.abs(a.p50 - 44) <= 1.5, JSON.stringify({ p25: a.p25, p50: a.p50 }));
  check('solver: closes a clipped top onto the target',
    Math.abs(a.p99 - 244) <= 2, String(a.p99));
  check('solver: only uses the one-way slider ranges',
    out.values.contrast === 0 && out.values.shadows >= 0 && out.values.highlights <= 0 && out.values.blacks <= 0
      && TONE_SLIDER_KEYS.every((k) => {
        const [lo, hi] = CAMERA_TONE_BOUNDS[k];
        return out.values[k] >= lo && out.values[k] <= hi;
      }),
    JSON.stringify(out.values));
}

// ---------- solver: brightness guard gives back a top-end close ----------
{
  const targets = { p1: 4, p5: 6, p25: 22, p50: 44, p95: 161, p99: 244, p995: 248 };
  // closing the top end costs a lot of brightness on this synthetic frame
  const measure = linearMeasure({
    p1: 0.05, p5: 0.05, p25: 0.18, p50: 0.2, p50h: -0.05, p75: 0.2, p95: 0.5,
    p99: 0.35, p99w: 0.2, p995: 0.15, p995w: 0.1, meanSh: 0.13, meanHi: 0.9,
  });
  const out = solveCameraAutoTone({ measure, base: nightBase, targets });
  check('solver: brightness contract beats the top-end target',
    out.after.mean >= nightBase.mean - 1.5 && Math.abs(out.values.highlights) < 70,
    JSON.stringify({ values: out.values, mean: out.after.mean }));
}

// ---------- solver: dark underexposed frame gets lifted, never crushed ----------
{
  const base = { p1: 8, p5: 8, p25: 13, p50: 25, p75: 83, p95: 159, p99: 202, p995: 212, mean: 52.5 };
  const ref = { p1: 6, p5: 14, p25: 25, p50: 45, p75: 104, p95: 161, p99: 195, p995: 204, mean: 65.6 };
  const targets = cameraAutoTargets(base, ref);
  const measure = (v) => ({
    p1: base.p1 + 0.04 * v.blacks, p5: base.p5 + 0.06 * v.shadows,
    p25: base.p25 + 0.16 * v.shadows, p50: base.p50 + 0.2 * v.shadows + 0.02 * v.highlights,
    p75: base.p75, p95: base.p95 + 0.1 * v.shadows, p99: base.p99 + 0.3 * v.highlights,
    p995: base.p995 + 0.1 * v.whites, mean: base.mean + 0.15 * v.shadows + 0.1 * v.highlights,
  });
  const out = solveCameraAutoTone({ measure, base, targets });
  check('solver: underexposed frame is lifted toward the hint',
    out.after.p50 > base.p50 + 4 && out.values.shadows > 20, JSON.stringify(out.values));
  check('solver: no slider is pushed below the one-way bounds',
    out.values.shadows >= 0 && out.values.highlights <= 0 && out.values.blacks <= 0, JSON.stringify(out.values));
}

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nall auto-tone checks passed');
