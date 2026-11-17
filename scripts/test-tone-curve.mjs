#!/usr/bin/env node
/**
 * Regression test for the tone curve: `npm run test:tone`.
 *
 * The curve is the whole reason blacks/whites/highlights/shadows behave like a
 * darkroom tool instead of gamma-space offsets, so it is tested outside the
 * browser: identity at neutral, monotone for every combination, and the
 * band separation that makes each slider feel like its Lightroom counterpart.
 */
import { buildToneCurve, TONE_EV_MIN, TONE_EV_MAX, TONE_LUT_SIZE } from '../public/js/renderer.js';

const N = TONE_LUT_SIZE, EV_MIN = TONE_EV_MIN, EV_MAX = TONE_EV_MAX, GREY = 0.18;
const evAt = (i) => EV_MIN + (EV_MAX - EV_MIN) * (i / (N - 1));
const idx = (ev) => Math.round(((ev - EV_MIN) / (EV_MAX - EV_MIN)) * (N - 1));
const at = (curve, ev) => curve[idx(ev)];

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

// 2. every combination of the five controls is monotone and finite
{
  const steps = [-1, -0.5, 0, 0.5, 1];
  let combos = 0, bad = null;
  for (const contrast of steps) for (const shadows of steps) for (const highlights of steps) {
    for (const whites of steps) for (const blacks of steps) {
      const curve = buildToneCurve({
        contrast: contrast * 100, shadows: shadows * 100, highlights: highlights * 100,
        whites: whites * 100, blacks: blacks * 100,
      });
      combos++;
      for (let i = 0; i < N; i++) {
        if (!Number.isFinite(curve[i]) || (i && curve[i] < curve[i - 1] - 1e-6)) {
          bad = { contrast, shadows, highlights, whites, blacks, i };
          break;
        }
      }
    }
  }
  check(`monotone and finite over ${combos} combinations`, !bad, JSON.stringify(bad));
}

// 3. band separation, measured in stops
const base = buildToneCurve({});
const delta = (tone, ev) => at(buildToneCurve(tone), ev) - at(base, ev);

check('shadows+ moves only the dark end',
  delta({ shadows: 100 }, -6) > 2 && Math.abs(delta({ shadows: 100 }, 0)) < 0.01 && Math.abs(delta({ shadows: 100 }, 3)) < 0.01);
check('shadows- moves only the dark end',
  delta({ shadows: -100 }, -6) < -2 && Math.abs(delta({ shadows: -100 }, 0)) < 0.01);
check('highlights- moves only the bright end',
  delta({ highlights: -100 }, 3) < -1.5 && Math.abs(delta({ highlights: -100 }, 0)) < 0.01 && Math.abs(delta({ highlights: -100 }, -6)) < 0.01);
check('whites- moves only the very top',
  delta({ whites: -100 }, 4.5) < -2 && Math.abs(delta({ whites: -100 }, 2)) < 0.6 && Math.abs(delta({ whites: -100 }, 0)) < 0.01);
check('blacks+ lifts the black point without a grey veil',
  Math.pow(2, at(buildToneCurve({ blacks: 100 }), -12)) * GREY > 0.002 &&
  Math.abs(delta({ blacks: 100 }, 2)) < 0.01);
check('blacks- crushes the toe to true black',
  Math.pow(2, at(buildToneCurve({ blacks: -100 }), -12)) * GREY < 1e-6);
check('contrast pivots around mid grey',
  Math.abs(delta({ contrast: 100 }, 0)) < 0.01 && delta({ contrast: 100 }, 2) > 0.5 && delta({ contrast: 100 }, -2) < -0.5);

// 4. print the response table (useful when retuning the amplitudes)
if (process.argv.includes('--table')) {
  const bands = [-10, -6, -4, -2, 0, 2, 3, 4.5];
  const rows = {
    'shadows +100': { shadows: 100 }, 'shadows -100': { shadows: -100 },
    'highlights +100': { highlights: 100 }, 'highlights -100': { highlights: -100 },
    'whites +100': { whites: 100 }, 'whites -100': { whites: -100 },
    'blacks +100': { blacks: 100 }, 'blacks -100': { blacks: -100 },
    'contrast +100': { contrast: 100 }, 'contrast -100': { contrast: -100 },
  };
  console.log('\ninput EV:      ' + bands.map(b => String(b).padStart(6)).join(''));
  for (const [label, tone] of Object.entries(rows)) {
    console.log(label.padEnd(15), bands.map(b => delta(tone, b).toFixed(2).padStart(6)).join(''));
  }
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\ntone curve: all checks passed');
