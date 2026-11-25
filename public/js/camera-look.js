/**
 * Camera-preview look estimation.
 *
 * A camera writes a finished JPEG into every RAW file; phone galleries and
 * editors' filmstrips show that JPEG, so a photo "looks right" there and looks
 * flat in a neutral scene-referred development. Professional tools solve this
 * with a per-camera profile; for a single-frame browser darkroom we estimate the
 * same thing per photo: compare the neutral render with the embedded camera JPEG
 * and fit one monotone display-space tone curve.
 *
 * The curve is a plain 256-entry mapping from the neutral displayed luminance to
 * the camera JPEG's luminance, built from matching percentiles so it adapts to
 * exposure, contrast and highlight placement in one step. Only percentiles are
 * used, so a different crop/resize between the preview and the render does not
 * matter.
 */
export const LOOK_PERCENTILES = [0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Luma bands used by the saturation match (0-64, 64-128, 128-192, 192-255). */
export const BAND_EDGES = Object.freeze([0, 64, 128, 192, 256]);
export const bandIndex = (luma) => {
  if (luma < 64) return 0;
  if (luma < 128) return 1;
  if (luma < 192) return 2;
  return 3;
};

/**
 * Per-band saturation factors: how much more/less saturated the camera JPEG is
 * in each luma band. This is what keeps a camera's punchy sky and warm skin
 * together without a single global gain washing one of them out.
 */
export function bandSaturationGains(renderStats, cameraStats, { lo = 0.55, hi = 2.4 } = {}) {
  const ours = renderStats?.bands || [];
  const theirs = cameraStats?.bands || [];
  const out = [];
  for (let i = 0; i < 4; i++) {
    const a = ours[i];
    const b = theirs[i];
    if (!a || !b || a.n < 0.004 || b.n < 0.004 || a.chroma < 1e-4) {
      out.push(1);
      continue;
    }
    out.push(clamp(b.chroma / a.chroma, lo, hi));
  }
  return out;
}

/**
 * Luminance percentiles plus the mean chroma and RGB of the pixels that carry
 * visible colour. The chroma/mean triple is what lets the fit also match the
 * camera's saturation and white balance, not just its tone curve.
 */
export function imageStats(rgba, width, height) {
  const n = width * height;
  if (!rgba || rgba.length < n * 4) throw new RangeError('RGBA buffer smaller than width*height*4');
  const hist = new Uint32Array(256);
  let chromaSum = 0, chromaCount = 0, r = 0, g = 0, b = 0, rgbCount = 0;
  // Per-luma-band chroma: cameras do not boost (or desaturate) every tone the
  // same way, so the saturation match happens per band instead of with one
  // whole-image ratio (which washed out some photos and oversaturated others).
  const bands = BAND_EDGES.slice(0, -1).map(() => ({ n: 0, chroma: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const R = rgba[p], G = rgba[p + 1], B = rgba[p + 2];
    const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    hist[Math.min(255, Math.max(0, Math.round(y)))]++;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    const ch = mx > 8 ? (mx - mn) / mx : 0;
    if (mx > 8) {
      chromaSum += ch;
      chromaCount++;
    }
    if (y > 12) {
      r += R; g += G; b += B; rgbCount++;
    }
    bands[bandIndex(y)].n++;
    bands[bandIndex(y)].chroma += ch;
    bands[bandIndex(y)].r += R;
    bands[bandIndex(y)].g += G;
    bands[bandIndex(y)].b += B;
  }
  const at = (q) => {
    let acc = 0;
    const target = n * q;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v;
    }
    return 255;
  };
  return {
    percentiles: LOOK_PERCENTILES.map(at),
    chroma: chromaCount ? chromaSum / chromaCount : 0,
    mean: rgbCount ? [r / rgbCount, g / rgbCount, b / rgbCount] : [0, 0, 0],
    hist,
    bands: bands.map((band) => ({
      n: band.n / n,
      chroma: band.n ? band.chroma / band.n : 0,
      rgb: band.n ? [band.r / band.n, band.g / band.n, band.b / band.n] : [0, 0, 0],
    })),
  };
}

/**
 * Colour side of the camera look: how much more saturated the camera JPEG is,
 * and the display-space channel gains that reproduce its white balance. Gains
 * are luminance-normalised so matching the tint does not also shift exposure.
 */
export function cameraLookGains(renderStats, cameraStats) {
  const sat = cameraStats.chroma > 0.02 && renderStats.chroma > 0.02
    ? Math.max(0.85, Math.min(1.5, cameraStats.chroma / renderStats.chroma))
    : 1;
  const gains = [0, 1, 2].map((c) => {
    const ours = Math.max(1, renderStats.mean[c]);
    const theirs = Math.max(0, cameraStats.mean[c]);
    return theirs / ours;
  });
  const wY = 0.2126 * gains[0] + 0.7152 * gains[1] + 0.0722 * gains[2];
  const norm = wY > 1e-3 ? wY : 1;
  return { sat, wb: gains.map((v) => Math.max(0.75, Math.min(1.35, v / norm))) };
}

/** Luminance percentiles (0–255) of RGBA pixel data. */
export function lumaPercentiles(rgba, width, height) {
  const n = width * height;
  if (!rgba || rgba.length < n * 4) throw new RangeError('RGBA buffer smaller than width*height*4');
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const y = 0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2];
    hist[Math.min(255, Math.max(0, Math.round(y)))]++;
  }
  const at = (q) => {
    let acc = 0;
    const target = n * q;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v;
    }
    return 255;
  };
  return LOOK_PERCENTILES.map(at);
}

/**
 * Build a monotone 256-entry display-luminance curve mapping the neutral render
 * (`sourcePct`, 0–255) onto the camera preview (`targetPct`).
 *
 * Returns null when the inputs are degenerate (a flat or nearly flat render has
 * no usable mapping). Slope is capped so a camera JPEG with a very steep curve
 * cannot amplify shadow noise without bound.
 */
export function buildCameraLookCurve(sourcePct, targetPct, { maxSlope = 3.0, minSlope = 0.35 } = {}) {
  if (!sourcePct || !targetPct || sourcePct.length !== LOOK_PERCENTILES.length || targetPct.length !== LOOK_PERCENTILES.length) {
    return null;
  }
  // Anchors in the source domain, strictly increasing; the percentiles are
  // already ordered, so equal neighbours just collapse.
  const anchors = [];
  const push = (x, y) => {
    const last = anchors[anchors.length - 1];
    if (last && x <= last[0]) {
      last[1] = Math.max(last[1], y);
      return;
    }
    anchors.push([x, y]);
  };
  push(0, 0);
  for (let i = 0; i < sourcePct.length; i++) {
    const x = clamp(Math.round(sourcePct[i]), 0, 255);
    const y = clamp(Math.round(targetPct[i]), 0, 255);
    push(x, Math.max(y, anchors[anchors.length - 1]?.[1] ?? 0));
  }
  push(255, 255);
  if (anchors.length < 3) return null;
  const first = anchors[0], last = anchors[anchors.length - 1];
  if (last[0] - first[0] < 32 || (sourcePct[5] - sourcePct[1]) < 8 || (targetPct[5] - targetPct[1]) < 8) return null;

  const curve = new Float32Array(256);
  let a = 0;
  for (let x = 0; x < 256; x++) {
    while (a < anchors.length - 2 && x > anchors[a + 1][0]) a++;
    const [x0, y0] = anchors[a];
    const [x1, y1] = anchors[Math.min(a + 1, anchors.length - 1)];
    const dx = Math.max(1, x1 - x0);
    let slope = (y1 - y0) / dx;
    slope = clamp(slope, minSlope, maxSlope);
    const target = a === anchors.length - 1 ? y1 : clamp(y0 + slope * (x - x0), 0, 255);
    curve[x] = clamp(target, 0, 255);
  }
  // Normalise the tails: the endpoints stay pinned to black/white.
  const endY = curve[255];
  for (let x = 0; x < 256; x++) {
    const t = x / 255;
    curve[x] = clamp(curve[x] + (255 - endY) * t * t, 0, 255);
  }
  // Monotone + light smoothing (a moving average keeps a non-decreasing curve).
  const smooth = new Float32Array(256);
  for (let x = 0; x < 256; x++) {
    let sum = 0, count = 0;
    for (let d = -2; d <= 2; d++) {
      const k = x + d;
      if (k < 0 || k > 255) continue;
      sum += Math.max(curve[k], k > 0 ? smooth[k - 1] : curve[k]);
      count++;
    }
    smooth[x] = sum / Math.max(1, count);
  }
  const out = new Uint8Array(256);
  for (let x = 0; x < 256; x++) {
    out[x] = clamp(Math.round(Math.max(smooth[x], x > 0 ? out[x - 1] : 0)), 0, 255);
  }
  out[0] = 0;
  out[255] = 255;
  return out;
}

/** Apply the curve to one 0–255 luminance value (used by tests/diagnostics). */
export function applyCameraLookCurve(curve, value) {
  const v = clamp(value, 0, 255);
  const i = Math.floor(v);
  if (i >= 255) return curve[255];
  const t = v - i;
  return curve[i] * (1 - t) + curve[i + 1] * t;
}
