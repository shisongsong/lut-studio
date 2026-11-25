#!/usr/bin/env node
/**
 * Unit tests for the camera-preview look fit: a monotone 256-entry curve that
 * maps the neutral render's luminance percentiles onto the camera JPEG's.
 *
 * These are synthetic anchors; the end-to-end check (browser, real NEF) is the
 * separate production verification.
 */
import { LOOK_PERCENTILES, lumaPercentiles, imageStats, cameraLookGains, buildCameraLookCurve, applyCameraLookCurve } from '../public/js/camera-look.js';

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`ok   ${name}`);
  else { failures++; console.error(`FAIL ${name} ${detail}`); }
};

// 1. luma percentiles from known pixel data
{
  const w = 4, h = 4;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = Math.round((i / (w * h - 1)) * 255);
    rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
  }
  const pct = lumaPercentiles(rgba, w, h);
  check('lumaPercentiles returns ordered 0-255 values',
    pct.length === LOOK_PERCENTILES.length && pct.every((v, i) => i === 0 || v >= pct[i - 1]) && pct.every((v) => v >= 0 && v <= 255),
    JSON.stringify(pct));
  check('lumaPercentiles median of a linear ramp is near the middle',
    Math.abs(pct[3] - 128) <= 20, String(pct[3]));
}

// 2. identity fit: same distribution on both sides keeps the render unchanged
{
  const pct = [8, 20, 60, 110, 160, 210, 245];
  const curve = buildCameraLookCurve(pct, pct);
  const worst = Math.max(...[20, 60, 110, 160, 210, 245].map((v) => Math.abs(applyCameraLookCurve(curve, v) - v)));
  check('equal histograms produce a near-identity curve', worst <= 4, `max error ${worst}`);
}

// 3. a brighter/high-contrast camera JPEG lifts the fit toward its percentiles
{
  const source = [8, 20, 60, 110, 160, 210, 245];
  const target = [16, 35, 95, 150, 200, 235, 250];
  const curve = buildCameraLookCurve(source, target);
  const errors = source.map((x, i) => Math.abs(applyCameraLookCurve(curve, x) - target[i]));
  check('fit maps each source percentile onto the camera percentile',
    Math.max(...errors) <= 8, JSON.stringify(errors));
  check('fit brightens the midtones for a brighter camera JPEG',
    applyCameraLookCurve(curve, 110) > 110 + 20, String(applyCameraLookCurve(curve, 110)));
}

// 4. curve invariants: endpoints, monotonicity, byte range
{
  const source = [2, 10, 40, 90, 140, 200, 250];
  const target = [0, 30, 80, 120, 160, 220, 255];
  const curve = buildCameraLookCurve(source, target);
  let monotone = true;
  for (let i = 1; i < 256; i++) if (curve[i] < curve[i - 1]) monotone = false;
  check('camera look curve is monotone and 0-255', monotone && curve[0] === 0 && curve[255] === 255 && curve.every((v) => v >= 0 && v <= 255));
}

// 5. degenerate inputs are rejected instead of producing a wild curve
{
  check('flat render is rejected', buildCameraLookCurve([0, 0, 0, 0, 0, 0, 0], [10, 20, 60, 110, 160, 210, 245]) === null);
  check('flat camera JPEG is rejected', buildCameraLookCurve([8, 20, 60, 110, 160, 210, 245], [128, 128, 128, 128, 128, 128, 128]) === null);
  check('wrong length is rejected', buildCameraLookCurve([8, 20, 60], [8, 20, 60]) === null);
}

// 6. colour side: chroma ratio and luminance-normalised white-balance gains
{
  const w = 4, h = 4;
  const grey = new Uint8ClampedArray(w * h * 4);
  const warm = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    grey[i * 4] = 120; grey[i * 4 + 1] = 120; grey[i * 4 + 2] = 120; grey[i * 4 + 3] = 255;
    warm[i * 4] = 150; warm[i * 4 + 1] = 120; warm[i * 4 + 2] = 80; warm[i * 4 + 3] = 255;
  }
  const greyStats = imageStats(grey, w, h);
  const warmStats = imageStats(warm, w, h);
  check('imageStats reports zero chroma for grey', Math.abs(greyStats.chroma) < 1e-6, String(greyStats.chroma));
  check('imageStats reports chroma for colour', warmStats.chroma > 0.3, String(warmStats.chroma));

  // Colour baseline with some chroma, camera JPEG more saturated: the gain must
  // follow the chroma ratio (and stay inside its clamp).
  const muted = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    muted[i * 4] = 120; muted[i * 4 + 1] = 112; muted[i * 4 + 2] = 104; muted[i * 4 + 3] = 255;
  }
  const gains = cameraLookGains(imageStats(muted, w, h), warmStats);
  check('camera saturation gain follows the chroma ratio', gains.sat > 1.2 && gains.sat <= 1.5, String(gains.sat));
  check('white-balance gains warm the render and stay bounded',
    gains.wb[0] > gains.wb[2] && gains.wb.every((v) => v >= 0.75 && v <= 1.35),
    JSON.stringify(gains.wb));
  const identity = cameraLookGains(warmStats, warmStats);
  check('identical stats give neutral gains', Math.abs(identity.sat - 1) < 1e-9 && identity.wb.every((v) => Math.abs(v - 1) < 1e-9),
    JSON.stringify(identity));
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\ncamera look: all checks passed');
