/**
 * Auto Tone's two measurement spaces.
 *
 * The neutral development (camera look off) is the canonical baseline the
 * percentile heuristic was calibrated against: it reproduces Lightroom Mobile's
 * Auto slider values on the night reference frame. That heuristic is unchanged.
 *
 * With the camera look on the situation is different. The look is a
 * display-space curve applied *after* the tone stage, so the same slider values
 * no longer mean the same thing: a highlight drop fired before the curve is
 * stretched by it, and the frame reads visibly darker. The camera branch
 * therefore:
 *
 *  1. keeps the camera's own exposure (the render already matches the camera
 *     JPEG's scene brightness),
 *  2. uses the neutral heuristic's result only as a one-way placement hint —
 *     it may brighten / open the frame, never darken it,
 *  3. solves the four tone sliders on the actual rendered (with-look) histogram,
 *     so the sliders compose with the display curve instead of fighting it.
 *
 * The target model and the solver are pure functions: the browser supplies the
 * render measurement, the unit tests supply a synthetic response.
 */

export const TONE_SLIDER_KEYS = ['contrast', 'highlights', 'shadows', 'whites', 'blacks'];

/** Slider ranges the camera branch may use. It only opens up, protects the top
 *  end and deepens a washed black floor; it never pushes a slider the way that
 *  darkens the frame. */
export const CAMERA_TONE_BOUNDS = {
  contrast: [-10, 10],
  highlights: [-70, 0],
  shadows: [0, 70],
  whites: [-25, 20],
  blacks: [-30, 0],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * The Lightroom-calibrated percentile heuristic for the neutral development.
 * Kept byte-for-byte equivalent to the values the app shipped before the camera
 * look existed.
 */
export function neutralAutoValues(m) {
  const spread = (m.p75 - m.p25) / 255;
  return {
    contrast: Math.round(clamp((0.61 - spread) * 100, -10, 60)),
    highlights: -Math.round(clamp((m.p95 - 140) * 0.94, 20, 80)),
    shadows: Math.round(clamp((28.5 - m.p5) * 0.7 + 4.4, 0, 55)),
    whites: Math.round(clamp((m.p95 - 205) * 0.5 + 5.5, -20, 30)),
    blacks: Math.round(clamp((2 - m.p1) / 255 / 0.216 * 100, -30, 8)),
  };
}

/**
 * Display-space targets for the camera-look render.
 *
 * @param base percentiles of the render as the user sees it (camera look on,
 *             camera exposure already applied)
 * @param ref  percentiles the neutral heuristic would produce on the canonical
 *             neutral development — a scene-relative placement hint
 */
export function cameraAutoTargets(base, ref) {
  // The hint is one-way: it can open the frame toward the neutral placement,
  // but a neutral result that is darker than the camera rendition is ignored
  // (that was the "Auto Tone darkens my photo" bug).
  const lift = clamp(0.55 * (ref.p50 - base.p50), 0, 14);
  const t25 = Math.round(Math.max(base.p25, Math.min(ref.p25, base.p25 + lift)));
  const t50 = Math.round(Math.max(base.p50, Math.min(ref.p50, base.p50 + lift)));
  const t5 = Math.round(Math.max(base.p5, Math.min(ref.p5, base.p5 + Math.min(4, lift))));

  // Top end: a clipped camera rendering gets its very top pulled down to the
  // first level that is no longer a hard white; a rendering with unused
  // headroom gets stretched into it. Both stay inside 0-245 for p99.
  let t99 = base.p99;
  let t995 = base.p995;
  if (base.p99 >= 247) {
    t99 = Math.round(Math.min(base.p99, Math.max(244, ref.p99)));
    t995 = Math.round(Math.min(base.p995, Math.max(248, ref.p995)));
  } else if (base.p99 <= 240 && base.p995 <= 246) {
    t99 = Math.min(244, base.p99 + 5);
    t995 = Math.min(247, base.p995 + 4);
  }

  // A washed-out black floor is the one place the camera branch may lower the
  // bottom end; a frame that is already dark is left alone.
  const t1 = base.p1 > 7 ? 4 : base.p1;

  return { p1: t1, p5: t5, p25: t25, p50: t50, p95: base.p95, p99: t99, p995: t995 };
}

/**
 * Solve shadows/highlights/whites/blacks so the rendered histogram hits the
 * targets. Each slider owns one statistic (shadows → p25/p50, highlights →
 * p99, whites → p995, blacks → p1); the gain of that statistic is measured on
 * the photo itself with a small probe, then a damped fixed-point iteration
 * corrects for the cross-talk between the sliders.
 *
 * @param {object} opts
 * @param {(values: object) => object} opts.measure  renders one candidate and
 *        returns its display percentiles ({p1,p5,p25,p50,p75,p95,p99,p995,mean})
 * @param {object} opts.base     percentiles before Auto Tone
 * @param {object} opts.targets  output of cameraAutoTargets()
 * @param {object} [opts.bounds] slider ranges
 * @param {number} [opts.passes] correction passes
 * @returns {{values: object, targets: object, after: object}}
 */
export function solveCameraAutoTone({ measure, base, targets, bounds = CAMERA_TONE_BOUNDS, passes = 3 }) {
  const zero = { contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 };
  const v = { ...zero };
  const statOf = (m) => ({
    p1: m.p1, p5: m.p5, p25: m.p25, p50: m.p50, p75: m.p75, p95: m.p95, p99: m.p99, p995: m.p995,
    // measureTone() reports the per-channel mean as well; the no-darkening
    // contract is written against the whole-frame luma mean when available.
    mean: Number.isFinite(m.lumaMean)
      ? m.lumaMean
      : Array.isArray(m.mean)
        ? 0.2126 * m.mean[0] + 0.7152 * m.mean[1] + 0.0722 * m.mean[2]
        : m.mean,
  });

  const m0 = statOf(measure(v));
  const probes = { shadows: 18, highlights: -18, whites: 15, blacks: -15 };
  const gains = {};
  for (const [key, probe] of Object.entries(probes)) {
    const m = statOf(measure({ ...zero, [key]: probe }));
    let delta;
    if (key === 'shadows') delta = ((m.p25 - m0.p25) + (m.p50 - m0.p50)) / 2;
    else if (key === 'highlights') delta = m.p99 - m0.p99;
    else if (key === 'whites') delta = m.p995 - m0.p995;
    else delta = m.p1 - m0.p1;
    const gain = delta / probe;
    gains[key] = Number.isFinite(gain) && Math.abs(gain) >= 0.02 ? gain : 0;
  }

  const nudge = (key, err) => {
    const gain = gains[key];
    const [lo, hi] = bounds[key];
    const next = gain ? v[key] + (err / gain) * 0.85 : 0;
    v[key] = Math.round(clamp(next, lo, hi));
  };

  for (let pass = 0; pass < passes; pass++) {
    const m = pass === 0 ? m0 : statOf(measure(v));
    nudge('shadows', ((targets.p25 - m.p25) + (targets.p50 - m.p50)) / 2);
    nudge('highlights', targets.p99 - m.p99);
    nudge('whites', targets.p995 - m.p995);
    nudge('blacks', targets.p1 - m.p1);
  }

  // Hard contract: the frame must not come out darker than the camera render.
  // Closing the top end is the only move that can cost brightness, so it is the
  // one that is given back if the measured result falls below the baseline.
  let after = measure(v);
  for (let i = 0; i < 4 && (after.mean < base.mean - 1.5 || after.p50 < base.p50 - 1); i++) {
    if (v.highlights < 0) v.highlights = Math.round(v.highlights * 0.5);
    if (v.whites < 0) v.whites = Math.round(v.whites * 0.5);
    if (v.blacks < 0) v.blacks = Math.round(v.blacks * 0.5);
    after = measure(v);
  }

  return { values: { contrast: 0, ...v }, targets, after, gains };
}
