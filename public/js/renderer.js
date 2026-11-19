/**
 * One WebGL2 renderer shared by the hero, the gallery thumbnails and the
 * studio. It owns a single offscreen canvas; callers copy the result into
 * normal 2D canvases (so crossfades stay simple and only one GL context is
 * created on phones).
 *
 * Pipeline: exposure + white balance in linear light → monotone tone curve
 * sampled in log2 luminance (shadows / highlights / whites / blacks) → the
 * darktable sigmoid display transform (scene-referred RAW path) →
 * vibrance/saturation → optional LOG encode → up to 3 stacked LUTs.
 *
 * The tone curve is built on the CPU into a 1024-entry log-luminance LUT and
 * applied as a luminance *ratio* in linear light, so a tone move cannot shift
 * hue the way per-channel gamma-space offsets do. The model follows the log
 * exposure domain of darktable's filmic RGB (black/white points, latitude,
 * toe/shoulder) and the zone-masked exposure corrections of darktable's tone
 * equalizer; RawTherapee's Shadows/Highlights is the reference for keeping
 * chroma stable when shadows are lifted. No GPL code was copied — the sources
 * were only read for the maths.
 */
export const TONE_EV_MIN = -12.0;
export const TONE_EV_MAX = 10.0;
export const TONE_LUT_SIZE = 1024;
const GREY = 0.18;

/**
 * Calibration of the Basic-panel tone sliders.
 *
 * The bands follow Adobe's own histogram ranges for the Lightroom Basic panel
 * (Shadows 10–30 %, Highlights 70–90 %, Whites 90–100 %, Blacks 0–10 % of the
 * displayed tonal range). Highlights and shadows are amplitude-limited
 * exposure changes applied through a blurred luminance guide (a local tone
 * map, the way Lightroom's adaptive sliders behave); whites and blacks are
 * endpoint moves with a soft shoulder/toe.
 *
 * These numbers are injected into the shader too, so the browser render and
 * `scripts/test-tone-model.mjs` share one calibration.
 */
const glf = (n) => Number(n).toFixed(4);

export const TONE_MODEL = {
  // Calibrated from Lightroom Mobile (Adobe Color) on the night test frame:
  // highlights are a logistic EV compression (negative) / lift (positive),
  // shadows are the adaptive logistic band, whites/blacks are the display-space
  // endpoint curves LR actually exhibits (see testdata/lr-calibration).
  shadow: {
    stops: 1.9, pivotEv: -1.9, widthEv: 0.8,
    negA: 1.35, negPivotEv: -2.6, negWidthEv: 0.7,
  },
  highlight: {
    // negative: EV drop that grows with luminance, capped, then compressed into
    // white for scene-linear headroom (linear RAW path)
    negSlope: 0.40, negPivotEv: -2.7, negCapEv: 2.0,
    headroomSlope: 0.7, headroomFromEv: 2.4, whiteEv: 2.45,
    // positive: EV lift, stronger in the mid/high range
    posBase: 0.5, posExtra: 0.5, posLoEv: -3.5, posHiEv: 0.5,
  },
  // display-space white point stretch (positive) / gentle recovery (negative)
  whites: { stretch: 1.5, gamma: 2.0, recover: 0.35 },
  // display-space black point: negative = levels move, positive = gamma lift
  blacks: { point: 0.216, gamma: 0.75, gammaA: 0.967, gammaB: 0.0157 },
};

/**
 * The RAW display transform: darktable's sigmoid view transform
 * (scene-referred → display). The curve is the generalized log-logistic
 * (Naka-Rushton) family from darktable's sigmoid module (jandren, PR #12642,
 * darktable 4.2) — implemented from the published maths, no GPL code copied.
 * It anchors middle grey, rolls highlights off smoothly instead of clipping
 * them and keeps everything monotonic for any input in [0, +inf).
 */
export const SIGMOID = {
  // darktable's MIDDLE_GREY constant: scene 0.1845 maps to display-linear
  // 0.1845, which is sRGB 46.7% after the output encode.
  grey: 0.1845,
  contrast: 1.5,
  skew: 0,
  white: 1.0,
  black: 0.000152,
  hue: 1.0,
  // Basic-panel contrast (-100..100) scales the sigmoid contrast around the
  // darktable default; gain 0.6 spans darktable's own soft range (0.75..3.0),
  // so the extremes behave like Lightroom's Basic contrast.
  contrastGain: 0.6,
};

/**
 * Closed-form parameter fit of the sigmoid curve (matches darktable's own
 * numeric fit to 4e-10). Guarantees f(0)=b, f(g)=g, f(+inf)=w and a mid-grey
 * slope that depends on `contrast` only (skew moves compression between
 * shadows and highlights without shifting that slope).
 */
export function sigmoidFit(c = SIGMOID.contrast, s = SIGMOID.skew, w = SIGMOID.white, b = SIGMOID.black) {
  const g = SIGMOID.grey;
  const q = Math.pow(5, -s);
  const refSlope = c * (1 - g);
  const alpha = Math.pow(w / g, 1 / q);
  const tempSlope = (w * q / g) * (alpha - 1) * Math.pow(w / g, -(q + 1) / q);
  const p = refSlope / tempSlope;
  const WGR = alpha - 1;
  let fog = 0;
  if (b > 0) {
    const WBR = Math.pow(b / w, -1 / q) - 1;
    fog = g * Math.pow(WGR, 1 / p) / (Math.pow(WBR, 1 / p) - Math.pow(WGR, 1 / p));
  }
  const pe = Math.pow(fog + g, p) * WGR;
  return { p, q, pe, fog, w, b };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Build the tone curve as a mapping of log2 luminance (EV around 18% grey).
 *
 * - `contrast` is a slope around mid grey in the log/exposure domain, which is
 *   where a filmic curve keeps its linear "latitude".
 * - `shadows` / `highlights` are exposure-style corrections confined to their
 *   own range by smooth masks: lifting shadows multiplies the dark end (keeps
 *   detail and hue) instead of adding grey to it.
 * - `whites` moves the top of the range only, so it behaves like a white point.
 * - `blacks` has both a toe exposure component and a real linear floor/crush:
 *   multiplying zero by any gain can never lift a black, an additive term can.
 *
 * The result is monotone for every combination (a tone inversion is what makes
 * banded "solarised" shadows), so the LUT is repaired in place if an extreme
 * setting would fold it.
 *
 * @param {{contrast?:number, shadows?:number, highlights?:number, whites?:number, blacks?:number}} tone -100..100
 * @returns {Float32Array} TONE_LUT_SIZE log2 luminance values (EV around grey)
 */
export function buildToneCurve(tone = {}) {
  const pick = (v) => Math.max(-100, Math.min(100, Number(v) || 0)) / 100;
  // The tone sliders are no longer baked into this 1D curve: highlights,
  // shadows, whites and blacks need either a spatial guide or an endpoint move
  // in display space, so they run in the fragment shader (see FRAG below).
  // What remains here is contrast: a slope around mid grey in the log exposure
  // domain, applied as a luminance ratio so hue survives.
  const slope = 1 + 0.32 * pick(tone.contrast);
  const out = new Float32Array(TONE_LUT_SIZE);
  for (let i = 0; i < TONE_LUT_SIZE; i++) {
    const ev = TONE_EV_MIN + (TONE_EV_MAX - TONE_EV_MIN) * (i / (TONE_LUT_SIZE - 1));
    // Bounded only for float sanity: a hard clamp at the bottom would flatten
    // the deepest shadows into a plateau at high contrast.
    out[i] = Math.max(TONE_EV_MIN - 8, Math.min(TONE_EV_MAX + 4, ev * slope));
  }
  return out;
}

/** IEEE-754 float32 → float16 bits, for the R16F tone texture. */
const _f32 = new Float32Array(1);
const _i32 = new Int32Array(_f32.buffer);
function floatToHalf(value) {
  _f32[0] = value;
  const x = _i32[0];
  let bits = (x >> 16) & 0x8000;
  let m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;
  if (e < 103) return bits;                       // too small → signed zero
  if (e > 142) { bits |= 0x7c00; return bits; }   // overflow → ±inf
  if (e < 113) {                                  // subnormal half
    m |= 0x0800;
    bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
    return bits;
  }
  bits |= ((e - 112) << 10) | (m >> 1);
  bits += m & 1;
  return bits;
}

/**
 * The rectangle of the source image, in image uv coordinates, that the canvas
 * shows. `fit` decides the framing when zoom is 1 (`contain` shows the whole
 * photo with letterboxing, `cover` fills the canvas and crops), and `view`
 * ({zoom, cx, cy}) is the interactive inspection view: zoom scales that
 * rectangle down around a centre in image coordinates, so a zoomed preview
 * samples the full-resolution texture instead of upscaling a screen capture.
 *
 * The rectangle is clamped so the photo can never be dragged off screen: when
 * the rectangle is smaller than the image the photo edge stops at the canvas
 * edge, and while it is larger (the contain letterbox at zoom 1) it stays
 * centred on the uncovered axis.
 *
 * @returns {{x:number, y:number, w:number, h:number, cx:number, cy:number}}
 */
export function computeViewRect(imgW, imgH, canvasW, canvasH, fit = 'cover', view = null) {
  const imgAspect = imgW / imgH;
  const canvasAspect = canvasW / canvasH;
  let w, h;
  if (fit === 'contain') {
    if (canvasAspect > imgAspect) { w = canvasAspect / imgAspect; h = 1; }
    else { w = 1; h = imgAspect / canvasAspect; }
  } else if (canvasAspect > imgAspect) { w = 1; h = imgAspect / canvasAspect; }
  else { w = canvasAspect / imgAspect; h = 1; }

  const zoom = Math.max(1, Math.min(16, Number(view?.zoom) || 1));
  const bw = w / zoom;
  const bh = h / zoom;
  const clampAxis = (center, size) => {
    const lo = Math.min(0, 1 - size);
    const hi = Math.max(0, 1 - size);
    const start = center - size / 2;
    return Math.min(hi, Math.max(lo, start));
  };
  const x = clampAxis(Number.isFinite(view?.cx) ? view.cx : 0.5, bw);
  const y = clampAxis(Number.isFinite(view?.cy) ? view.cy : 0.5, bh);
  return { x, y, w: bw, h: bh, cx: x + bw / 2, cy: y + bh / 2 };
}

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler2D uImage;
uniform sampler3D uLut0;
uniform sampler3D uLut1;
uniform sampler3D uLut2;
uniform int uHas0;
uniform int uHas1;
uniform int uHas2;
uniform float uStr0;
uniform float uStr1;
uniform float uStr2;
// Image uv rectangle the canvas shows (x, y, w, h): fit + the interactive
// zoom/pan view are resolved on the CPU so the shader stays a straight sample.
uniform vec4 uRect;
uniform float uExposure;
uniform float uTemp;
uniform float uTint;
uniform float uVibrance;
uniform float uSaturation;
// 1 = the image texture holds scene-linear half floats (RAW path, headroom
// above 1.0 possible); 0 = plain sRGB RGBA8 (JPEG / demo / embedded preview).
uniform int uLinearInput;
// Basic-panel tone sliders in -100..100. Highlights/shadows are adaptive (they
// read a blurred luminance guide); whites/blacks are endpoint moves.
uniform float uShadows;
uniform float uHighlights;
uniform float uWhites;
uniform float uBlacks;
// 1D tone LUT in log2 luminance (R16F, TONE_LUT_SIZE samples).
uniform sampler2D uTone;
// Low-frequency luminance guide: R8, log2(luma/0.18) mapped from -10..6 EV.
uniform sampler2D uGuide;
uniform int uHasGuide;
uniform vec4 uGuideRect;
const float TONE_EV_MIN = -12.0;
const float TONE_EV_MAX = 10.0;
// Noise reduction (auto strength comes from a measured noise floor).
uniform float uNr;
uniform float uNrColor;
uniform vec2 uTexel;
// 0 = sRGB input, 1 = F-Log, 2 = F-Log2, 3 = V-Log.
// LOG modes encode the photo into the log curve the LUT expects, so vendor
// LUTs designed for log footage behave as intended instead of blowing out.
uniform int uLogMode;
// darktable sigmoid display transform (scene-referred RAW path). The JS
// side runs sigmoidFit() per parameter change and uploads the curve here.
uniform float uSigP;
uniform float uSigQ;
uniform float uSigPe;
uniform float uSigFog;
uniform float uSigW;
uniform float uSigHue;
in vec2 vUv;
out vec4 outColor;

vec3 applyLut(sampler3D lut, vec3 c, float s) {
  vec3 g = texture(lut, clamp(c, 0.0, 1.0)).rgb;
  return mix(c, g, s);
}

vec3 srgbToLinear(vec3 c) {
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, step(c, vec3(0.04045)));
}

vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, 12.92 * c, step(c, vec3(0.0031308)));
}

float srgbToLinear1(float c) {
  c = clamp(c, 0.0, 1.0);
  return mix(pow((c + 0.055) / 1.055, 2.4), c / 12.92, step(c, 0.04045));
}

float linearToSrgb1(float c) {
  c = max(c, 0.0);
  return mix(1.055 * pow(c, 1.0 / 2.4) - 0.055, 12.92 * c, step(c, 0.0031308));
}

// Published transfer functions: Fujifilm F-Log / F-Log2, Panasonic V-Log.
vec3 encodeLog(vec3 lin, int mode) {
  if (mode == 1) {
    vec3 hi = 0.344676 * (log2(0.555556 * lin + 0.009468) / log2(10.0)) + 0.790453;
    vec3 lo = 8.735631 * lin + 0.092864;
    return mix(lo, hi, step(vec3(0.00089), lin));
  }
  if (mode == 2) {
    vec3 hi = 0.245281 * (log2(5.555556 * lin + 0.064829) / log2(10.0)) + 0.384316;
    vec3 lo = 8.799461 * lin + 0.092864;
    return mix(lo, hi, step(vec3(0.000889), lin));
  }
  if (mode == 3) {
    vec3 hi = 0.241514 * (log2(lin + 0.00873) / log2(10.0)) + 0.598206;
    vec3 lo = 5.6 * lin + 0.125;
    return mix(lo, hi, step(vec3(0.01), lin));
  }
  return lin;
}

float lumaOf(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

/**
 * darktable sigmoid display transform, per channel with hue preservation
 * (darktable sigmoid module / jandren PR #12642 — formulas re-implemented,
 * no GPL code copied). Scene-referred RGB in, display-referred *linear* RGB
 * out; the sRGB encode happens after it, like darktable's output profile step.
 *   u = (fog + max(x, 0))^p ;  y = w * (u / (pe + u))^q
 * The fit anchors f(0.1845) = 0.1845 and converges to w, so above-white
 * scene headroom rolls off instead of clipping.
 */
float sigCurve(float x) {
  float u = pow(uSigFog + max(x, 0.0), uSigP);
  float y = uSigW * pow(u / (uSigPe + u), uSigQ);
  return isnan(y) ? uSigW : y;
}

vec3 sigmoidPerChannel(vec3 v) {
  // 1) Desaturate negative channels (white balance can undershoot them).
  float avg = max((v.r + v.g + v.b) / 3.0, 0.0);
  float mn = min(v.r, min(v.g, v.b));
  float sf = mn < 0.0 ? -avg / (mn - avg) : 1.0;
  vec3 in3 = avg + sf * (v - avg);
  // 2) The curve, one pass per channel.
  vec3 pc = vec3(sigCurve(in3.r), sigCurve(in3.g), sigCurve(in3.b));
  // 3) Hue preservation: blend the naive midscale-preserving midpoint against
  //    the per-channel result, then re-solve the remaining channel to keep
  //    the channel sum (energy) between the two behaviours.
  int mni, midi, mxi;
  mxi = (in3.r >= in3.g) ? ((in3.r >= in3.b) ? 0 : 2) : ((in3.g >= in3.b) ? 1 : 2);
  mni = (in3.r <= in3.g) ? ((in3.r <= in3.b) ? 0 : 2) : ((in3.g <= in3.b) ? 1 : 2);
  if (mni == mxi) {
    // Grey: any distinct channel order degenerates to a straight-through.
    mni = 2; midi = 1; mxi = 0;
  } else {
    midi = 3 - mni - mxi;
  }
  float imn = in3[mni];
  float imid = in3[midi];
  float imx = in3[mxi];
  float pmn = pc[mni];
  float pmid = pc[midi];
  float pmx = pc[mxi];
  float chroma = imx - imn;
  float midscale = chroma != 0.0 ? (imid - imn) / chroma : 0.0;
  float fullCorr = pmn + (pmx - pmn) * midscale;
  float naiveMid = (1.0 - uSigHue) * pmid + uSigHue * fullCorr;
  float pcEnergy = pc.r + pc.g + pc.b;
  float naiveEnergy = pmn + naiveMid + pmx;
  float mm = imn + imid;
  float blend = mm != 0.0 ? 2.0 * imn / mm : 0.0;
  float E = blend * pcEnergy + (1.0 - blend) * naiveEnergy;
  vec3 o;
  if (naiveMid <= pmid) {
    float cm = ((1.0 - uSigHue) * pmid
              + uSigHue * (midscale * pmx + (1.0 - midscale) * (E - pmx)))
              / (1.0 + uSigHue * (1.0 - midscale));
    o[mxi] = pmx;
    o[midi] = cm;
    o[mni] = E - pmx - cm;
  } else {
    float cm = ((1.0 - uSigHue) * pmid
              + uSigHue * (pmn * (1.0 - midscale) + midscale * (E - pmn)))
              / (1.0 + uSigHue * midscale);
    o[mni] = pmn;
    o[midi] = cm;
    o[mxi] = E - pmn - cm;
  }
  return o;
}

/**
 * Edge-aware denoise on the decoded frame, before any tone work amplifies it.
 *
 * Luma: 3x3 bilateral, so flat noise is averaged but edges (where the luma
 * difference is large) are kept. Chroma: a wider ring average of the colour
 * residual, which is where high-ISO noise turns into coloured blotches. This is
 * the same class of filter darktable/RawTherapee use for their denoise modules;
 * cheap enough to run in the display shader, so the export gets it too.
 */
vec3 denoise(vec3 c, vec2 uv) {
  float Y0 = lumaOf(c);
  float sig = mix(0.010, 0.055, uNr);
  vec3 acc = c;
  float wsum = 1.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      if (i == 0 && j == 0) continue;
      vec3 s = texture(uImage, uv + vec2(float(i), float(j)) * uTexel).rgb;
      float d = lumaOf(s) - Y0;
      float w = exp(-(d * d) / (2.0 * sig * sig));
      acc += s * w;
      wsum += w;
    }
  }
  vec3 avg = acc / wsum;

  vec3 chroma = c - vec3(Y0);
  vec3 chromaSum = vec3(0.0);
  float cw = 0.0;
  for (int k = 0; k < 8; k++) {
    float ang = float(k) * 0.7853982;
    vec2 off = vec2(cos(ang), sin(ang)) * uTexel * 2.5;
    vec3 s = texture(uImage, uv + off).rgb;
    float d = lumaOf(s) - Y0;
    float w = exp(-(d * d) / (2.0 * 0.10 * 0.10));
    chromaSum += (s - vec3(lumaOf(s))) * w;
    cw += w;
  }
  vec3 chromaOut = mix(chroma, chromaSum / max(cw, 1e-4), uNrColor);
  float Ys = mix(Y0, lumaOf(avg), uNr);
  return vec3(Ys) + chromaOut;
}

/**
 * Denoise for the linear RAW path. The same edge-aware idea as denoise(), but
 * the thresholds scale with the local luminance so they stay perceptual across
 * the scene-linear range (a fixed sigma would smooth highlights and leave the
 * shadows untouched).
 */
vec3 denoiseLinear(vec3 c, vec2 uv) {
  float Y0 = lumaOf(c);
  float sig = mix(0.10, 0.55, uNr) * max(Y0, 1e-4);
  vec3 acc = c;
  float wsum = 1.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      if (i == 0 && j == 0) continue;
      vec3 s = texture(uImage, uv + vec2(float(i), float(j)) * uTexel).rgb;
      float d = lumaOf(s) - Y0;
      float w = exp(-(d * d) / (2.0 * sig * sig));
      acc += s * w;
      wsum += w;
    }
  }
  vec3 avg = acc / wsum;

  float csig = mix(0.30, 0.90, uNrColor) * max(Y0, 1e-4);
  vec3 chroma = c - vec3(Y0);
  vec3 chromaSum = vec3(0.0);
  float cw = 0.0;
  for (int k = 0; k < 8; k++) {
    float ang = float(k) * 0.7853982;
    vec2 off = vec2(cos(ang), sin(ang)) * uTexel * 2.5;
    vec3 s = texture(uImage, uv + off).rgb;
    float d = lumaOf(s) - Y0;
    float w = exp(-(d * d) / (2.0 * csig * csig));
    chromaSum += (s - vec3(lumaOf(s))) * w;
    cw += w;
  }
  vec3 chromaOut = mix(chroma, chromaSum / max(cw, 1e-4), uNrColor);
  float Ys = mix(Y0, lumaOf(avg), uNr);
  return vec3(Ys) + chromaOut;
}

void main() {
  // image-space uv: (0,0) = top-left of the source, independent of the
  // browser's flipY handling for Image vs ImageBitmap uploads.
  vec2 uv = uRect.xy + vec2(vUv.x, 1.0 - vUv.y) * uRect.zw;
  // Outside the photo: black letterbox when fitting, nothing when cropping.
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 tex = texture(uImage, uv).rgb;
  vec3 lin;
  if (uLinearInput == 1) {
    // Scene-linear half floats: values above 1.0 are real highlight headroom.
    lin = (uNr > 0.0 || uNrColor > 0.0) ? denoiseLinear(tex, uv) : tex;
  } else {
    vec3 c = (uNr > 0.0 || uNrColor > 0.0) ? denoise(tex, uv) : tex;
    lin = srgbToLinear(c);
  }
  // Exposure and white balance are multiplicative in linear light, which is the
  // whole point of a RAW processor: channel gains must not clip independently in
  // the encoded curve. +temp = warmer (more red, less blue), +tint = magenta.
  lin *= exp2(uExposure);
  float wt = uTemp * 0.01;
  float tn = uTint * 0.01;
  lin *= vec3(
    exp2(wt * 0.60 + tn * 0.14),
    exp2(-tn * 0.34),
    exp2(-wt * 0.60 + tn * 0.14)
  );

  // Tone, in the same order as the Basic panel: contrast → highlights/shadows
  // (adaptive) → whites/blacks (endpoints). Everything ends up as a luminance
  // ratio, so hue and saturation survive.
  float Y = max(dot(lin, vec3(0.2126, 0.7152, 0.0722)), 1e-7);
  float ev = clamp(log2(Y / 0.18), TONE_EV_MIN, TONE_EV_MAX);
  float tu = (ev - TONE_EV_MIN) / (TONE_EV_MAX - TONE_EV_MIN);

  // 1) Contrast: the only thing left in the 1D LUT.
  float evC = texture(uTone, vec2(tu, 0.5)).r;
  float Yc = 0.18 * exp2(evC);

  // 2) Highlights / shadows: an exposure change weighted by a *blurred*
  //    luminance guide, so the weight is constant across a neighbourhood and
  //    micro-contrast inside the lifted region survives. The band is a logistic
  //    in log2 luminance: it falls off smoothly instead of ending on a hard
  //    mask edge, which keeps the whole mapping monotone (no flat spot — the
  //    artifact that used to turn skies into grey mush). Without a guide it
  //    degrades gracefully to a global curve.
  float gEv = ev;
  if (uHasGuide == 1) {
    vec2 gu = uGuideRect.xy + uv * uGuideRect.zw;
    gEv = clamp(texture(uGuide, gu).r * 18.0 - 10.0 + uExposure, -12.0, 10.0);
  }
  // Shadows: an exposure lift / drop weighted by a logistic band, calibrated
  // against Lightroom Mobile (positive and negative behave differently).
  float shadowN = clamp(uShadows, -100.0, 100.0) * 0.01;
  float shadowDelta = 0.0;
  if (shadowN >= 0.0) {
    float band = 1.0 / (1.0 + exp((gEv - ${glf(TONE_MODEL.shadow.pivotEv)}) / ${glf(TONE_MODEL.shadow.widthEv)}));
    shadowDelta = shadowN * ${glf(TONE_MODEL.shadow.stops)} * band;
  } else {
    float negBand = 1.0 / (1.0 + exp((gEv - ${glf(TONE_MODEL.shadow.negPivotEv)}) / ${glf(TONE_MODEL.shadow.negWidthEv)}));
    shadowDelta = shadowN * ${glf(TONE_MODEL.shadow.negA)} * negBand;
  }

  // Highlights, calibrated against Lightroom Mobile: negative is a ramp-shaped
  // EV drop that saturates and then compresses real above-white headroom into
  // near-white; positive is an EV lift that is stronger in the mid/high range.
  float hN = clamp(uHighlights, -100.0, 100.0) * 0.01;
  float highlightDelta = 0.0;
  if (hN < 0.0) {
    float drop = min(
      ${glf(TONE_MODEL.highlight.negSlope)} * max(0.0, gEv - ${glf(TONE_MODEL.highlight.negPivotEv)}),
      ${glf(TONE_MODEL.highlight.negCapEv)});
    // above white the real sensor headroom needs a stronger, linear compression
    drop += ${glf(TONE_MODEL.highlight.headroomSlope)}
      * max(0.0, gEv - ${glf(TONE_MODEL.highlight.headroomFromEv)});
    float mappedEv = gEv - (-hN) * drop;
    float capEv = mix(10.0, ${glf(TONE_MODEL.highlight.whiteEv)}, -hN);
    highlightDelta = min(mappedEv, capEv) - gEv;
  } else if (hN > 0.0) {
    float liftT = smoothstep(${glf(TONE_MODEL.highlight.posLoEv)}, ${glf(TONE_MODEL.highlight.posHiEv)}, gEv);
    highlightDelta = hN * (${glf(TONE_MODEL.highlight.posBase)} + ${glf(TONE_MODEL.highlight.posExtra)} * liftT);
  }
  float Yl = Yc * exp2(shadowDelta + highlightDelta);
  vec3 graded = lin * (Yl / Y);
  // Desaturate only what is about to clip, so pushed whites roll to white
  // instead of turning a sunset magenta. (sRGB input only — the RAW path
  // lets the sigmoid transform do this properly.)
  vec3 c;
  if (uLinearInput == 1) {
    c = clamp(linearToSrgb(sigmoidPerChannel(graded)), 0.0, 1.0);
  } else {
    float mx = max(graded.r, max(graded.g, graded.b));
    if (mx > 1.0) graded = mix(graded, vec3(1.0), clamp((mx - 1.0) / mx, 0.0, 1.0) * 0.65);
    c = clamp(linearToSrgb(graded), 0.0, 1.0);
  }

  // Whites / blacks, calibrated in display space against LR Mobile:
  // whites is a top-end stretch/recovery, blacks is a black-point move.
  float wN = clamp(uWhites, -100.0, 100.0) * 0.01;
  float bN = clamp(uBlacks, -100.0, 100.0) * 0.01;
  if (wN > 0.0) {
    c += wN * ${glf(TONE_MODEL.whites.stretch)} * pow(c, vec3(${glf(TONE_MODEL.whites.gamma)})) * (1.0 - c);
  } else if (wN < 0.0) {
    vec3 top = smoothstep(vec3(0.5), vec3(1.0), c);
    c -= -wN * ${glf(TONE_MODEL.whites.recover)} * pow(c, vec3(1.5)) * (1.0 - c) * top;
  }
  c = clamp(c, 0.0, 1.0);
  if (bN < 0.0) {
    float point = -bN * ${glf(TONE_MODEL.blacks.point)};
    c = clamp((c - point) / max(1e-3, 1.0 - point), 0.0, 1.0);
  } else if (bN > 0.0) {
    vec3 lifted = pow(c, vec3(${glf(TONE_MODEL.blacks.gamma)})) * ${glf(TONE_MODEL.blacks.gammaA)} + ${glf(TONE_MODEL.blacks.gammaB)};
    c = clamp(mix(c, lifted, bN), 0.0, 1.0);
  }

  // Presence: saturation is a flat scale around luma; vibrance leans on the
  // pixels that have room left, so skin does not go orange when the sky deepens.
  if (uSaturation != 0.0 || uVibrance != 0.0) {
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float hi = max(c.r, max(c.g, c.b));
    float lo = min(c.r, min(c.g, c.b));
    float curSat = hi > 0.0 ? (hi - lo) / hi : 0.0;
    float f = max(0.0, 1.0 + uSaturation + uVibrance * (1.0 - curSat) * 0.9);
    c = clamp(mix(vec3(lum), c, f), 0.0, 1.0);
  }

  if (uLogMode > 0) c = clamp(encodeLog(srgbToLinear(c), uLogMode), 0.0, 1.0);

  if (uHas0 == 1) c = applyLut(uLut0, c, uStr0);
  if (uHas1 == 1) c = applyLut(uLut1, c, uStr1);
  if (uHas2 == 1) c = applyLut(uLut2, c, uStr2);

  outColor = vec4(c, 1.0);
}`;

export class LookRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!this.gl) throw new Error('这台设备不支持 WebGL2');
    const gl = this.gl;
    this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;

    this.program = createProgram(gl, VERT, FRAG);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.uniform = {};
    for (const name of ['uImage', 'uLut0', 'uLut1', 'uLut2', 'uHas0', 'uHas1', 'uHas2', 'uStr0', 'uStr1', 'uStr2', 'uRect', 'uExposure', 'uTemp', 'uTint', 'uVibrance', 'uSaturation', 'uLinearInput', 'uShadows', 'uHighlights', 'uWhites', 'uBlacks', 'uLogMode', 'uTone', 'uGuide', 'uHasGuide', 'uGuideRect', 'uNr', 'uNrColor', 'uTexel', 'uSigP', 'uSigQ', 'uSigPe', 'uSigFog', 'uSigW', 'uSigHue']) {
      this.uniform[name] = gl.getUniformLocation(this.program, name);
    }

    this.imageTex = null;
    this.imgW = 0;
    this.imgH = 0;
    this.lutTex = new Map();
    this.dummyLut = createDummyLut(gl);
    // Tone LUT: one row of half-float log2-luminance values, rebuilt only when
    // a tone slider moves (see render()).
    this.toneTex = gl.createTexture();
    this.toneSig = null;
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.toneTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, TONE_LUT_SIZE, 1, 0, gl.RED, gl.HALF_FLOAT, new Uint16Array(TONE_LUT_SIZE));

    gl.useProgram(this.program);
    gl.uniform1i(this.uniform.uImage, 0);
    gl.uniform1i(this.uniform.uLut0, 1);
    gl.uniform1i(this.uniform.uLut1, 2);
    gl.uniform1i(this.uniform.uLut2, 3);
    gl.uniform1i(this.uniform.uTone, 4);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.dummyLut);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, this.dummyLut);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_3D, this.dummyLut);
    // Adaptive-tone guide texture (unit 5): 1x1 placeholder until a photo sets one.
    this.guideTex = gl.createTexture();
    this.hasGuide = false;
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.guideTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uniform.uGuide, 5);
  }

  /**
   * Upload the photo once; thumbnails and previews reuse it.
   * Images larger than MAX_TEXTURE_SIZE are downscaled for the GPU preview;
   * full-resolution export re-uploads crops instead (see exportImage()).
   */
  /**
   * Upload whatever the app handed over: an sRGB canvas, or a linear RAW source
   * ({ data, width, height, preview }) whose full-resolution frame stays on the
   * CPU for exports while the (possibly downscaled) preview goes to the GPU.
   */
  setSource(source) {
    if (!source) return;
    if (source.kind === 'linear') {
      const preview = source.preview || { data: source.data, w: source.width, h: source.height };
      this.setLinearPreview(preview, source.width, source.height);
    } else {
      this.setImage(source.canvas || source);
    }
  }

  setImage(source) {
    const gl = this.gl;
    this.linear = false;
    const w = source.naturalWidth || source.width;
    const h = source.naturalHeight || source.height;
    if (!w || !h) throw new Error('图片尺寸无效');
    this.imgW = w;
    this.imgH = h;
    let upload = source;
    const max = this.maxTexture;
    if (Math.max(w, h) > max) {
      const k = max / Math.max(w, h);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d', { alpha: false }).drawImage(source, 0, 0, c.width, c.height);
      upload = c;
    }
    if (this.imageTex) gl.deleteTexture(this.imageTex);
    this.imageTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, upload);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.texW = upload.width;
    this.texH = upload.height;
    this.linear = false;
  }

  /**
   * Upload a scene-linear image as a filterable RGB16F texture. `fullW/fullH`
   * describe the whole photo even when `preview` is a downscaled copy, so uv
   * maths, zoom and the guide still line up with the full-resolution frame.
   */
  setLinearPreview(preview, fullW, fullH) {
    this._uploadLinear(preview.data, preview.w, preview.h);
    this.imgW = fullW;
    this.imgH = fullH;
    this.linear = true;
  }

  /** Upload one native-resolution tile of scene-linear half floats (export). */
  setLinearTile(data, w, h) {
    this._uploadLinear(data, w, h);
    this.imgW = w;
    this.imgH = h;
    this.linear = true;
  }

  _uploadLinear(data, w, h) {
    const gl = this.gl;
    if (this.imageTex) gl.deleteTexture(this.imageTex);
    this.imageTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB16F, w, h, 0, gl.RGB, gl.HALF_FLOAT, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.texW = w;
    this.texH = h;
    this.linear = true;
  }

  /**
   * Upload the adaptive-tone guide: a small, blurred log-luminance map of the
   * source. The highlights/shadows sliders read it to decide *where* they apply,
   * so their effect is a local exposure change rather than a global curve.
   * @param {{w:number, h:number, data:Uint8Array}|null} guide
   */
  setGuide(guide) {
    const gl = this.gl;
    if (!guide || !guide.data || !guide.w || !guide.h) { this.hasGuide = false; return; }
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.guideTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, guide.w, guide.h, 0, gl.RED, gl.UNSIGNED_BYTE, guide.data);
    gl.activeTexture(gl.TEXTURE0);
    this.hasGuide = true;
  }

  _lutTexture(id, parsed) {
    let tex = this.lutTex.get(id);
    if (tex) return tex;
    const gl = this.gl;
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA, parsed.size, parsed.size, parsed.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, parsed.data);
    gl.bindTexture(gl.TEXTURE_3D, null);
    this.lutTex.set(id, tex);
    return tex;
  }

  /** Rebuild + upload the tone LUT only when contrast moved. */
  _syncToneCurve(adjust) {
    const tone = adjust || {};
    const sig = `${tone.contrast | 0}`;
    if (sig === this.toneSig) return;
    this.toneSig = sig;
    const gl = this.gl;
    const curve = buildToneCurve(tone);
    const bits = new Uint16Array(TONE_LUT_SIZE);
    for (let i = 0; i < TONE_LUT_SIZE; i++) bits[i] = floatToHalf(curve[i]);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.toneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, TONE_LUT_SIZE, 1, 0, gl.RED, gl.HALF_FLOAT, bits);
    gl.activeTexture(gl.TEXTURE0);
  }

  /**
   * Render into the internal canvas.
   * @param {Array<{id:string, parsed:{size:number,data:Uint8Array}, strength:number}>} luts
   * @param {{exposure:number, contrast:number, temp:number, tint:number,
   *          vibrance:number, saturation:number, highlights:number,
   *          shadows:number, whites:number, blacks:number, logMode:number}} adjust
   * @param {{zoom:number, cx:number, cy:number}|null} view interactive zoom/pan
   *        around the fit framing; omitted for exports and thumbnails.
   * @param {{x:number, y:number, w:number, h:number}|null} guideRect where the
   *        current image texture sits inside the full photo, for tiled exports.
   */
  render(luts, adjust, w, h, fit = 'cover', view = null, guideRect = null) {
    const gl = this.gl;
    if (!this.imageTex) return this.canvas;
    const max = this.maxTexture;
    const scale = Math.min(1, max / Math.max(w, h));
    w = Math.max(2, Math.round(w * scale));
    h = Math.max(2, Math.round(h * scale));
    this.canvas.width = w;
    this.canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex);

    const stack = (luts || []).slice(0, 3);
    for (let i = 0; i < 3; i++) {
      const unit = 1 + i;
      const has = stack[i] ? 1 : 0;
      const parsed = stack[i]?.parsed;
      const tex = has ? this._lutTexture(stack[i].id, parsed) : this.dummyLut;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_3D, tex);
      gl.uniform1i(this.uniform[`uHas${i}`], has);
      gl.uniform1f(this.uniform[`uStr${i}`], has ? Math.max(0, Math.min(1, (stack[i].strength ?? 100) / 100)) : 0);
    }
    gl.activeTexture(gl.TEXTURE0);

    const rect = computeViewRect(this.imgW, this.imgH, w, h, fit, view);
    gl.uniform4f(this.uniform.uRect, rect.x, rect.y, rect.w, rect.h);
    gl.uniform1i(this.uniform.uLinearInput, this.linear ? 1 : 0);
    gl.uniform1f(this.uniform.uShadows, adjust?.shadows || 0);
    gl.uniform1f(this.uniform.uHighlights, adjust?.highlights || 0);
    gl.uniform1f(this.uniform.uWhites, adjust?.whites || 0);
    gl.uniform1f(this.uniform.uBlacks, adjust?.blacks || 0);
    gl.uniform1i(this.uniform.uHasGuide, this.hasGuide ? 1 : 0);
    const gr = guideRect;
    gl.uniform4f(this.uniform.uGuideRect, gr ? gr.x : 0, gr ? gr.y : 0, gr ? gr.w : 1, gr ? gr.h : 1);
    gl.uniform1f(this.uniform.uExposure, adjust?.exposure || 0);
    gl.uniform1f(this.uniform.uTemp, adjust?.temp || 0);
    gl.uniform1f(this.uniform.uTint, adjust?.tint || 0);
    gl.uniform1f(this.uniform.uVibrance, adjust?.vibrance || 0);
    gl.uniform1f(this.uniform.uSaturation, adjust?.saturation || 0);
    gl.uniform1i(this.uniform.uLogMode, adjust?.logMode || 0);
    const nr = Math.max(0, Math.min(1, adjust?.nr || 0));
    gl.uniform1f(this.uniform.uNr, nr);
    gl.uniform1f(this.uniform.uNrColor, Math.max(0, Math.min(1, adjust?.nrColor || 0)));
    gl.uniform2f(this.uniform.uTexel, 1 / Math.max(1, this.texW), 1 / Math.max(1, this.texH));
    // The sigmoid display transform owns mid-tone contrast on the RAW path, so
    // the 1D log-domain LUT stays neutral there (it still drives contrast for
    // sRGB canvas input). The slider feeds sigmoid's contrast parameter.
    this._syncToneCurve(this.linear ? { contrast: 0 } : (adjust || {}));
    const cn = Math.max(-1, Math.min(1, (adjust?.contrast || 0) / 100));
    const sig = sigmoidFit(SIGMOID.contrast * Math.pow(2, SIGMOID.contrastGain * cn), SIGMOID.skew);
    gl.uniform1f(this.uniform.uSigP, sig.p);
    gl.uniform1f(this.uniform.uSigQ, sig.q);
    gl.uniform1f(this.uniform.uSigPe, sig.pe);
    gl.uniform1f(this.uniform.uSigFog, sig.fog);
    gl.uniform1f(this.uniform.uSigW, sig.w);
    gl.uniform1f(this.uniform.uSigHue, SIGMOID.hue);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }

  dispose() {
    const gl = this.gl;
    if (this.imageTex) gl.deleteTexture(this.imageTex);
    if (this.toneTex) gl.deleteTexture(this.toneTex);
    if (this.guideTex) gl.deleteTexture(this.guideTex);
    for (const tex of this.lutTex.values()) gl.deleteTexture(tex);
    this.lutTex.clear();
  }
}

function createProgram(gl, vsSource, fsSource) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'shader compile failed');
    }
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
  }
  return program;
}

function createDummyLut(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, tex);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  gl.bindTexture(gl.TEXTURE_3D, null);
  return tex;
}
