#!/usr/bin/env node
/**
 * Regression test for the contrast LUT: `npm run test:tone`.
 *
 * After the tone-engine rewrite, the 1024-entry log-luminance LUT only carries
 * contrast; highlights/shadows run through an adaptive guide and whites/blacks
 * are endpoint moves in the fragment shader (see scripts/test-tone-model.mjs for
 * those). What must hold here: identity at zero, monotone for every contrast
 * setting, and a slope that never flattens into a plateau.
 */
import { buildToneCurve, TONE_EV_MIN, TONE_EV_MAX, TONE_LUT_SIZE } from '../public/js/renderer.js';

const N = TONE_LUT_SIZE, EV_MIN = TONE_EV_MIN, EV_MAX = TONE_EV_MAX;
const evAt = (i) => EV_MIN + (EV_MAX - EV_MIN) * (i / (N - 1));

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`ok   ${name}`);
  else { failures++; console.error(`FAIL ${name} ${detail}`); }
};

// 1. neutral is the identity in log luminance
{
  const curve = buildToneCurve({});
  let worst = 0;
  for (let i = 0; i < N; i++) worst = Math.max(worst, Math.abs(curve[i] - evAt(i)));
  check('neutral curve is the identity', worst < 1e-4, `max error ${worst}`);
}

// 2. monotone and finite for the whole contrast range
{
  let bad = null;
  for (const contrast of [-100, -75, -50, -25, 0, 25, 50, 75, 100]) {
    const curve = buildToneCurve({ contrast });
    for (let i = 0; i < N; i++) {
      if (!Number.isFinite(curve[i]) || (i && curve[i] < curve[i - 1] - 1e-6)) { bad = { contrast, i }; break; }
    }
    if (bad) break;
  }
  check('contrast curve is monotone and finite at every setting', !bad, JSON.stringify(bad));
}

// 3. the curve never has a dead/flat segment (the old failure mode that turned
//    skies into a flat grey band)
{
  let worstSlope = Infinity, worstAt = 0;
  for (const contrast of [-100, -50, 0, 50, 100]) {
    const curve = buildToneCurve({ contrast });
    for (let i = 1; i < N; i++) {
      const slope = (curve[i] - curve[i - 1]) / 0.0215; // nominal LUT step in EV
      if (slope < worstSlope) { worstSlope = slope; worstAt = evAt(i); }
    }
  }
  check('contrast curve keeps a usable local slope (no plateau)', worstSlope > 0.5, `min slope ${worstSlope.toFixed(3)} at ${worstAt.toFixed(2)} EV`);
}

// 4. contrast pivots around mid grey and leaves the endpoints alone
{
  const plus = buildToneCurve({ contrast: 100 });
  const minus = buildToneCurve({ contrast: -100 });
  const at = (curve, ev) => curve[Math.round(((ev - EV_MIN) / (EV_MAX - EV_MIN)) * (N - 1))];
  check('contrast pivots around mid grey',
    Math.abs(at(plus, 0)) < 1e-4 && Math.abs(at(minus, 0)) < 1e-4 &&
    at(plus, 2) > 2.2 && at(minus, 2) < 1.8);
  check('contrast stays bounded at the extremes',
    Math.abs(at(plus, TONE_EV_MAX)) <= TONE_EV_MAX + 4 + 1e-4);
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\ntone curve: all checks passed');
