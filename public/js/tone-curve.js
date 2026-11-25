/**
 * Scene-adaptive tone curve for the Basic panel.
 *
 * WHY THIS EXISTS
 *
 * The old sliders were four independent formulas with fixed numerical anchors:
 * shadows were lifted inside a logistic band centred at −1.9 EV, highlights
 * dropped above −2.7 EV with a hard cap at sensor white, whites were a fixed
 * display-space stretch, blacks a fixed display-space offset. Those anchors were
 * calibrated on ONE night frame. On any other photo the bands sat in the wrong
 * place: highlights −100 darkened the midtones of a daylight frame by 1.7 stops
 * (it was acting like exposure), shadows +100 lifted the black point into a grey
 * haze, whites +100 clipped 7 % of a sunny street and also brightened the
 * midtones, and blacks −100 wiped out the middle of the histogram. Every slider
 * "had its own problem" because none of them knew anything about the photo.
 *
 * The curve here is built per image from the scene's own measured EV
 * percentiles (see evStats below, computed by the RAW worker / guide builder):
 *
 *   - every slider anchor is a measured quantile of *this* photo, so the same
 *     slider value means the same visual move on a night frame, a sunny frame
 *     and a dim indoor frame;
 *   - the whole mapping is a monotone function of log luminance, and the slope
 *     is checked numerically, so no combination can fold the curve (a fold is
 *     what produces the banded "solarised" look);
 *   - highlights compress the top in the log domain instead of clamping it to a
 *     white plate, which is what keeps specular/headroom gradation recoverable
 *     (the RAW decode carries four stops above sensor white);
 *   - shadows lift the measured shadow band without moving the black point;
 *   - whites/blacks scale only their own end of the measured range, so they can
 *     no longer behave like exposure.
 *
 * Two curves are produced:
 *   base  — global mapping of the pixel's own EV: exposure, contrast, whites,
 *           blacks;
 *   local — *delta* mapping of the blurred guide EV: shadows, highlights. The
 *           guide is a cross-bilateral blur, so applying a band move through it
 *           is a local (halo-free) tone equalizer: a bright window keeps its own
 *           placement instead of dragging the whole frame with it.
 * The fragment shader samples base at the pixel EV and local at the guide EV and
 * adds both. At slider zero base is the identity and local is zero, so the
 * calibrated base rendering (camera-look match) is untouched by construction.
 *
 * Units: EV around 18 % scene grey, i.e. scene white (sensor saturation) is at
 * SENSOR_WHITE_EV. The domain matches the renderer's 1D tone texture.
 */

export const TONE_DOMAIN = Object.freeze({ min: -12, max: 10, size: 1024 });

/** Scene-referred EV of a value of 1.0 (sensor white), 18 % grey = EV 0. */
export const SENSOR_WHITE_EV = Math.log2(1 / 0.18);

/**
 * Calibration of the slider → curve mapping. Amplitudes are in EV (shadows) or
 * in curve slope (highlights); bands are placed from measured quantiles.
 */
export const TONE_TUNING = Object.freeze({
  // contrast slope around the measured median: ±100 → ×0.70 .. ×1.30
  contrastGain: 0.30,
  // shadows: EV lift at the measured lower quartile, ±100
  shadowLift: 0.82,
  shadowDeepen: 1.05,
  // highlights: slope change in the upper range (1 EV of curve slope per unit)
  highlightRecover: 0.78,
  highlightLift: 0.58,
  // softness of the highlight gate, EV
  highlightSoftness: 0.75,
  // whites: top-range scale, ±100 → ×0.60 .. ×1.40
  whitesScale: 0.40,
  // blacks: bottom-range scale, ±100 → distance below the knee ×1.65 .. ×0.35
  blacksScale: 0.65,
});

const { min: EV_MIN, max: EV_MAX } = TONE_DOMAIN;
/** Number of samples in each tone-curve row (the GPU texture width). */
export const TONE_LUT_SIZE = TONE_DOMAIN.size;
const QUANTILES = [
  ['p001', 0.001], ['p005', 0.005], ['p01', 0.01], ['p02', 0.02],
  ['p05', 0.05], ['p10', 0.10], ['p25', 0.25], ['p50', 0.50],
  ['p75', 0.75], ['p90', 0.90], ['p95', 0.95], ['p98', 0.98],
  ['p99', 0.99], ['p995', 0.995], ['p999', 0.999],
];
export const SCENE_QUANTILE_KEYS = QUANTILES.map(([k]) => k);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / Math.max(1e-6, b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Percentiles of an EV buffer (the RAW worker's unblurred scene-EV map, or the
 * sRGB guide's display-EV map). Values outside the renderer's tone domain are
 * clamped; a photo whose whole frame sits at one level gets a degenerate but
 * safe set of anchors.
 *
 * @param {Float32Array|number[]} values
 * @param {{linear?:boolean, stride?:number}} [opts]
 * @returns {{p001:number,...,p999:number,min:number,max:number,linear:boolean,count:number}}
 */
export function evStats(values, opts = {}) {
  const { linear = true, stride = 1 } = opts;
  const n = values?.length || 0;
  if (!n) return neutralSceneStats(linear);
  const step = Math.max(1, stride | 0);
  const sample = [];
  for (let i = 0; i < n; i += step) {
    const v = values[i];
    if (Number.isFinite(v)) sample.push(clamp(v, EV_MIN, EV_MAX));
  }
  if (!sample.length) return neutralSceneStats(linear);
  sample.sort((a, b) => a - b);
  const at = (q) => sample[Math.min(sample.length - 1, Math.max(0, Math.round(q * (sample.length - 1))))];
  const out = { linear, count: sample.length, min: sample[0], max: sample[sample.length - 1] };
  for (const [key, q] of QUANTILES) out[key] = at(q);
  return out;
}

/** A plausible mid-range scene, used until the real measurement arrives. */
export function neutralSceneStats(linear = true) {
  return {
    linear,
    count: 0,
    min: -10,
    max: SENSOR_WHITE_EV,
    p001: -9.0, p005: -7.6, p01: -7.0, p02: -6.3, p05: -5.4, p10: -4.6,
    p25: -2.5, p50: -0.2, p75: 1.4, p90: 2.2, p95: 2.42, p98: 2.46,
    p99: SENSOR_WHITE_EV, p995: SENSOR_WHITE_EV, p999: SENSOR_WHITE_EV,
  };
}

/**
 * Guarantee the anchors are ordered and inside the domain, whatever the input:
 * a photo that is 90 % pure black still needs anchors that make the curve
 * monotone, and a nearly-clipped frame must not produce a zero-width band.
 */
export function sanitizeSceneStats(stats, { linear } = {}) {
  const base = stats || neutralSceneStats(linear);
  const out = {
    ...neutralSceneStats(linear ?? base.linear ?? true),
    ...base,
    linear: linear ?? base.linear ?? true,
  };
  let prev = EV_MIN;
  for (const key of SCENE_QUANTILE_KEYS) {
    let v = Number(out[key]);
    if (!Number.isFinite(v)) v = prev;
    v = clamp(v, EV_MIN, EV_MAX);
    if (v < prev) v = prev;
    out[key] = v;
    prev = v;
  }
  out.min = clamp(Number(out.min) || EV_MIN, EV_MIN, EV_MAX);
  out.max = clamp(Number(out.max) || out.p999, EV_MIN, EV_MAX);
  if (out.max < out.p999) out.max = out.p999;
  return out;
}

/** EV at LUT index i. */
export const evAtIndex = (i) => EV_MIN + (EV_MAX - EV_MIN) * (i / (TONE_LUT_SIZE - 1));

/** LUT index for an EV. */
export const indexForEv = (ev) => clamp(Math.round(((ev - EV_MIN) / (EV_MAX - EV_MIN)) * (TONE_LUT_SIZE - 1)), 0, TONE_LUT_SIZE - 1);

/**
 * The global mapping: exposure + contrast + whites/blacks.
 *
 * Neutral (all sliders zero) is the identity for every scene and every exposure:
 * the exposure is folded into the measured anchors, so it shifts *where the
 * image content sits* on the curve rather than the curve's shape.
 *
 * @param {object} stats sanitized scene stats
 * @param {{exposure?:number, contrast?:number, whites?:number, blacks?:number}} adjust
 * @returns {Float32Array} display EV for each input EV
 */
export function buildBaseCurve(stats, adjust = {}) {
  const sc = sanitizeSceneStats(stats);
  const exposure = Number(adjust.exposure) || 0;
  const cN = clamp((Number(adjust.contrast) || 0) / 100, -1, 1);
  const wN = clamp((Number(adjust.whites) || 0) / 100, -1, 1);
  const bN = clamp((Number(adjust.blacks) || 0) / 100, -1, 1);

  const mid = clamp(sc.p50 + exposure, EV_MIN + 1.5, EV_MAX - 1.5);
  const slope = clamp(1 + TONE_TUNING.contrastGain * cN, 0.45, 1.8);
  const at = (x) => mid + slope * (x - mid);

  // Whites own the image's own upper range. The band starts below the measured
  // p75 (where "the bright part of this photo" begins), never below the median,
  // and the change is a pure range scale above that point: the top moves, the
  // middle does not.
  const topStart = clamp(
    Math.max(sc.p75 + exposure + 0.05, mid + 0.35, EV_MIN + 2),
    EV_MIN + 1, EV_MAX - 0.5,
  );
  const whitesScale = clamp(1 + TONE_TUNING.whitesScale * wN, 0.35, 1.9);

  // Blacks own the bottom: the knee sits a measured fraction of the way from
  // the median down to the photo's own p5 (never above it, never closer to the
  // middle than 0.35 EV). Negative expands the distance below the knee
  // (deepens/crushes the bottom), positive compresses it (lifts the black
  // floor). The knee never moves, so the middle is untouched.
  const p5 = sc.p05 + exposure;
  const bottomKnee = clamp(
    Math.min(mid - 0.55 * Math.max(0.4, mid - p5), mid - 0.35),
    EV_MIN + 0.5, mid - 0.3,
  );
  const blacksScale = clamp(1 - TONE_TUNING.blacksScale * bN, 0.3, 2.1);

  const out = new Float32Array(TONE_LUT_SIZE);
  for (let i = 0; i < TONE_LUT_SIZE; i++) {
    const x = evAtIndex(i);
    let y = at(x);
    if (x > topStart) {
      const ya = at(topStart);
      y = ya + (y - ya) * whitesScale;
    } else if (x < bottomKnee) {
      const yk = at(bottomKnee);
      y = yk - (yk - y) * blacksScale;
    }
    out[i] = clamp(y, EV_MIN - 8, EV_MAX + 8);
  }
  repairMonotone(out);
  enforceMinSlope(out, MIN_CURVE_SLOPE);
  return out;
}

/**
 * The local delta curve: shadows and highlights, sampled at the guide EV.
 *
 * Shadows are a Gaussian band centred on the measured lower quartile: it lifts
 * (or deepens) exactly the tonal neighbourhood the photo calls its shadows, with
 * no move at the measured black point and none in the highlights.
 *
 * Highlights are a soft gate that starts at the measured upper quartile and
 * turns into a *slope* reduction (negative slider) or increase (positive) above
 * it. A slope change in the log domain is a real HDR compression: it keeps
 * ordering and gradation instead of clamping everything above a threshold to
 * one white level (the old `min(mapped, cap)` bug that made highlights −100 a
 * flat plate).
 *
 * @returns {Float32Array} EV delta for each guide EV
 */
export function buildLocalCurve(stats, adjust = {}) {
  const sc = sanitizeSceneStats(stats);
  const exposure = Number(adjust.exposure) || 0;
  const sN = clamp((Number(adjust.shadows) || 0) / 100, -1, 1);
  const hN = clamp((Number(adjust.highlights) || 0) / 100, -1, 1);
  const midAnchor = clamp(sc.p50 + exposure + 0.4, EV_MIN + 2, EV_MAX - 1);

  const shadowPeak = clamp(sc.p25 + exposure, EV_MIN + 2, EV_MAX - 2);
  // Wide enough to cover the photo's shadow range, bounded so the band cannot
  // swallow the midtones.
  const shadowWidth = clamp(Math.max(1.5, (sc.p75 - sc.p25) * 0.62), 1.5, 3.4);
  const shadowAmp = sN * (sN >= 0 ? TONE_TUNING.shadowLift : TONE_TUNING.shadowDeepen);
  // Black-point lock: the measured p1 (deepest real tone of this photo) receives
  // no shadow move at all, so lifting shadows can never turn the black point
  // grey. Full lift is reached by the measured p5.
  const shadowGateLo = sc.p01 + exposure;
  const shadowGateHi = Math.max(shadowGateLo + 0.05, sc.p05 + exposure);

  // The highlight gate starts where the photo's bright range starts, never below
  // the median and never so close to white that the gate has no room.
  const highlightStart = clamp(
    Math.max(sc.p75 + exposure + 0.15, midAnchor, EV_MIN + 2),
    EV_MIN + 2, EV_MAX - 0.8,
  );
  const soft = TONE_TUNING.highlightSoftness;
  const highlightAmp = hN * (hN >= 0 ? TONE_TUNING.highlightLift : TONE_TUNING.highlightRecover);

  const out = new Float32Array(TONE_LUT_SIZE);
  for (let i = 0; i < TONE_LUT_SIZE; i++) {
    const e = evAtIndex(i);
    // The band is wider below its peak than above it: Lightroom's Shadows
    // opens the very bottom of the photo, not just the quarter-tone region.
    const sideWidth = e < shadowPeak ? shadowWidth * 1.4 : shadowWidth * 0.85;
    const z = (e - shadowPeak) / sideWidth;
    const shadow = shadowAmp * Math.exp(-0.5 * z * z)
      * smoothstep(shadowGateLo, shadowGateHi, e)
      * (1 - smoothstep(sc.p75 + exposure, sc.p90 + exposure, e));
    // softplus gate: delta ≈ amp·(e-start) far above the start, smooth at it,
    // ~0 below it. Its derivative is a sigmoid in [0,1], so the total curve
    // slope stays positive for |amp| < 1.
    const x = (e - highlightStart) / soft;
    const past = x > 30 ? x : Math.log1p(Math.exp(x));
    const highlight = highlightAmp * soft * past;
    out[i] = shadow + highlight;
  }
  return out;
}

/** Smallest forward difference of a curve (EV out per EV in). */
export function minCurveSlope(curve) {
  let min = Infinity;
  for (let i = 1; i < curve.length; i++) {
    const d = (curve[i] - curve[i - 1]) / (EV_MAX - EV_MIN) * (TONE_LUT_SIZE - 1);
    if (d < min) min = d;
  }
  return min;
}

/** Smallest slope a curve is allowed to keep; below this it reads as a flat band. */
export const MIN_CURVE_SLOPE = 0.10;

/** Repair a curve that folded, without changing its scale of operation. */
export function repairMonotone(curve) {
  const step = 1e-5;
  for (let i = 1; i < curve.length; i++) {
    if (!(curve[i] > curve[i - 1])) curve[i] = curve[i - 1] + step;
  }
  return curve;
}

/**
 * Keep at least `minSlope` everywhere. A degenerate frame (everything at one
 * level) or an extreme combination can otherwise collapse a stretch of the LUT
 * into one value, which is exactly the banding the curve is meant to avoid.
 */
export function enforceMinSlope(curve, minSlope = MIN_CURVE_SLOPE) {
  const step = (EV_MAX - EV_MIN) / (TONE_LUT_SIZE - 1);
  const minDelta = Math.max(1e-5, minSlope * step);
  for (let i = 1; i < curve.length; i++) {
    const min = curve[i - 1] + minDelta;
    if (curve[i] < min) curve[i] = min;
  }
  return curve;
}

/**
 * Build both LUT rows for one slider state.
 *
 * The local row is scaled down if (in a flat region, where guide EV == pixel EV)
 * base slope + local slope would drop below `minSlope`. That keeps the composed
 * mapping monotone for every slider combination, which is what prevents the
 * banded shadows of the old model.
 *
 * @param {{scene:object, exposure?:number, contrast?:number, highlights?:number,
 *          shadows?:number, whites?:number, blacks?:number}} adjust
 * @returns {{base:Float32Array, local:Float32Array, localScale:number}}
 */
export function buildToneCurves(adjust = {}) {
  const scene = sanitizeSceneStats(adjust.scene);
  const exposure = Number(adjust.exposure) || 0;
  const base = buildBaseCurve(scene, {
    exposure,
    contrast: adjust.contrast,
    whites: adjust.whites,
    blacks: adjust.blacks,
  });
  const local = buildLocalCurve(scene, {
    exposure,
    shadows: adjust.shadows,
    highlights: adjust.highlights,
  });
  const baseMin = minCurveSlope(base);
  const localMin = minCurveSlope(local);
  const budget = Math.max(0.10, baseMin - 0.12);
  let localScale = 1;
  if (localMin < 0) {
    localScale = clamp(budget / -localMin, 0, 1);
    if (localScale < 0.999) {
      for (let i = 0; i < local.length; i++) local[i] *= localScale;
    }
  }
  // Final composed guard (flat neighbourhoods see base + local): where the two
  // rows would still fold together, raise the local row just enough to keep the
  // composed mapping monotone. Only extreme combinations reach this branch.
  const step = (EV_MAX - EV_MIN) / (TONE_LUT_SIZE - 1);
  const minDelta = MIN_CURVE_SLOPE * step;
  for (let i = 1; i < TONE_LUT_SIZE; i++) {
    const prev = base[i - 1] + local[i - 1];
    const need = prev + minDelta - base[i];
    if (local[i] < need) local[i] = need;
  }
  return { base, local, localScale };
}

/**
 * CPU mirror of the shader's mapping for one luminance: used by the node tests
 * to prove the slider contracts without a browser.
 *
 * @param {number} y scene-linear luminance (includes WB + exposure)
 * @param {number} guideY scene-linear luminance of the blurred guide at the
 *        same exposure (pass `y` for a flat neighbourhood)
 * @param {{base:Float32Array, local:Float32Array}} curves
 * @returns {number} display-linear value after the tone stage (before sigmoid)
 */
export function applyCurvesToLuma(y, guideY, curves) {
  const ev = clamp(Math.log2(Math.max(y, 1e-9) / 0.18), EV_MIN, EV_MAX);
  const gEv = clamp(Math.log2(Math.max(guideY, 1e-9) / 0.18), EV_MIN, EV_MAX);
  const outEv = sampleCurve(curves.base, ev) + sampleCurve(curves.local, gEv);
  return 0.18 * Math.pow(2, outEv);
}

/** Linear interpolation into a tone LUT, mirroring the GPU's LINEAR filter. */
export function sampleCurve(curve, ev) {
  const f = clamp(((ev - EV_MIN) / (EV_MAX - EV_MIN)) * (TONE_LUT_SIZE - 1), 0, TONE_LUT_SIZE - 1);
  const i = Math.floor(f);
  const j = Math.min(TONE_LUT_SIZE - 1, i + 1);
  const t = f - i;
  return curve[i] * (1 - t) + curve[j] * t;
}

/** Compose the curves with the shader's sigmoid, for end-to-end CPU checks. */
export function applySigmoidTone(y, guideY, curves, sigmoidCurveFn) {
  const displayLin = applyCurvesToLuma(y, guideY, curves);
  return sigmoidCurveFn(displayLin);
}
