#!/usr/bin/env node
/** Synthetic property/regression tests for the fast LLF tone remap. */
import { fastLocalLaplacianEV, localLaplacianRemap } from '../public/js/local-laplacian.js';
import { LLF_WEIGHT } from '../public/js/renderer.js';

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`ok   ${name}`);
  else { failures++; console.error(`FAIL ${name} ${detail}`); }
};
const mapped = (input, delta) => Float32Array.from(input, (v, i) => v + delta[i]);
const stats = (data) => {
  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of data) { min = Math.min(min, v); max = Math.max(max, v); sum += v; }
  return { min, max, mean: sum / data.length };
};
const stddev = (data) => {
  const mean = stats(data).mean;
  let sum = 0;
  for (const v of data) sum += (v - mean) ** 2;
  return Math.sqrt(sum / data.length);
};

// 1. Neutral settings are an exact identity, including odd image dimensions.
{
  const input = Float32Array.from({ length: 37 * 23 }, (_, i) => -9 + (i % 37) * 0.3);
  const delta = fastLocalLaplacianEV(input, 37, 23, { shadows: 0, highlights: 0 });
  check('zero sliders return a zero EV-delta map', delta.every((v) => v === 0));
}

// 2. Every sampled remap is monotone for slider extremes and mixed endpoints.
{
  const controls = [
    { shadows: -100 }, { shadows: 100 },
    { highlights: -100 }, { highlights: 100 },
    { shadows: 100, highlights: -100 },
    { shadows: -100, highlights: 100 },
  ];
  const refs = [-10, -8, -4, -1.5, 0, 0.5, 4, 7, 8, 10, 12];
  let bad = null;
  for (const tone of controls) for (const ref of refs) {
    let previous = -Infinity;
    for (let i = 0; i <= 1800; i++) {
      const x = -10 + i * 0.01;
      const y = localLaplacianRemap(x, ref, tone);
      if (!Number.isFinite(y) || y < previous - 1e-7) { bad = { tone, ref, x, y, previous }; break; }
      previous = y;
    }
    if (bad) break;
  }
  check('each reference remap stays finite and monotone', !bad, JSON.stringify(bad));
}

// 3. Constant scenes move in the intended zone; middle gray remains anchored.
{
  const dark = new Float32Array(64 * 64).fill(-6);
  const bright = new Float32Array(64 * 64).fill(3);
  const middle = new Float32Array(64 * 64).fill(0);
  const darkDelta = stats(fastLocalLaplacianEV(dark, 64, 64, { shadows: 100 })).mean;
  const brightDelta = stats(fastLocalLaplacianEV(bright, 64, 64, { highlights: -100 })).mean;
  const middleDelta = stats(fastLocalLaplacianEV(middle, 64, 64, { shadows: 100, highlights: -100 })).mean;
  check('shadow lift raises a dark constant field', darkDelta > 2.0 && darkDelta < 3.2, String(darkDelta));
  check('highlight recovery lowers a bright constant field', brightDelta < -0.7 && brightDelta > -1.4, String(brightDelta));
  check('18% gray stays fixed when both sliders move', Math.abs(middleDelta) < 1e-6, String(middleDelta));
}

// 4. A one-dimensional exposure ramp never reverses under tone extremes.
{
  const width = 128;
  const input = Float32Array.from({ length: width }, (_, x) => -8 + 12 * x / (width - 1));
  const settings = [{ shadows: 100 }, { highlights: -100 }, { shadows: 100, highlights: -100 }];
  let bad = null;
  for (const tone of settings) {
    const output = mapped(input, fastLocalLaplacianEV(input, width, 1, tone));
    for (let x = 1; x < width; x++) {
      if (output[x] < output[x - 1] - 1e-5) { bad = { tone, x, a: output[x - 1], b: output[x] }; break; }
    }
    if (bad) break;
  }
  check('mapped gray ramps do not invert', !bad, JSON.stringify(bad));
}

// 5. A high-contrast step stays finite and within the original scene range.
{
  const width = 128, height = 32;
  const input = Float32Array.from({ length: width * height }, (_, i) => i % width < width / 2 ? -6 : 3);
  const delta = fastLocalLaplacianEV(input, width, height, { shadows: 100, highlights: -100 });
  const output = mapped(input, delta);
  const s = stats(output);
  check('step-edge output keeps ringing below 0.15 EV',
    [...output].every(Number.isFinite) && s.min >= -6.15 && s.max <= 3.15,
    JSON.stringify(s));
}

// 6. Constant EV displacement in the remap core preserves fine shadow texture.
{
  const width = 128, height = 64;
  const input = Float32Array.from({ length: width * height }, (_, i) => -5 + 0.12 * Math.sin((i % width) * Math.PI / 2));
  const output = mapped(input, fastLocalLaplacianEV(input, width, height, { shadows: 100 }));
  const ratio = stddev(output) / stddev(input);
  check('shadow lift retains local fine-texture contrast', ratio > 0.8 && ratio < 1.2, String(ratio));
}

// 7. Characterisation: LLF alone must not be sold as the slider's whole
//    response. Small bright regions are edges to the pyramid, so their
//    coarse-level guide is dominated by dark neighbours and the shift collapses.
//    On the night reference this measured ~0.5 EV where the guide-adaptive path
//    moved the top percentile far more. That is why the adaptive guide curve
//    carries the sliders today (js/tone-curve.js) and the LLF map is dormant
//    (LLF_WEIGHT = 0): layering its fixed-pivot deltas on top made slider
//    response photo-dependent and popped in asynchronously.
{
  const width = 213, height = 320;
  const input = new Float32Array(width * height).fill(-6);
  // Photo-like scene: a small bright patch rather than a large uniform region.
  for (let y = 140; y < 180; y++) for (let x = 90; x < 130; x++) input[y * width + x] = 4;
  const delta = fastLocalLaplacianEV(input, width, height, { highlights: -100 });
  let worst = 0;
  for (let y = 140; y < 180; y++) for (let x = 90; x < 130; x++) worst = Math.min(worst, delta[y * width + x]);
  check('LLF alone only weakly shifts a small bright region (why it is not the main path)',
    worst > -1.2,
    JSON.stringify({ worst }));
  check('LLF is dormant: the adaptive guide curve owns the slider response',
    LLF_WEIGHT === 0,
    String(LLF_WEIGHT));
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nlocal Laplacian: all checks passed');
