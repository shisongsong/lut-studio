/**
 * One WebGL2 renderer shared by the hero, the gallery thumbnails and the
 * studio. It owns a single offscreen canvas; callers copy the result into
 * normal 2D canvases (so crossfades stay simple and only one GL context is
 * created on phones).
 *
 * Pipeline: exposure + white balance in linear light → per-image tone curves
 * (global: exposure/contrast/whites/blacks; local: shadows/highlights through a
 * blurred guide) → the darktable sigmoid display transform (scene-referred RAW
 * path) → camera-preview look → vibrance/saturation → optional LOG encode → up
 * to 3 stacked LUTs.
 *
 * The tone curves are built on the CPU into a two-row, 1024-entry log-luminance
 * LUT from the photo's own measured EV percentiles (js/tone-curve.js) and
 * applied as a luminance *ratio* in linear light, so a tone move cannot shift
 * hue the way per-channel gamma-space offsets do. At slider zero the mapping is
 * the identity, which keeps the calibrated base rendering untouched.
 */
import { buildToneCurves, neutralSceneStats } from './tone-curve.js';

export { TONE_DOMAIN } from './tone-curve.js';
export const TONE_EV_MIN = -12.0;
export const TONE_EV_MAX = 10.0;
export const TONE_LUT_SIZE = 1024;
const glf = (n) => Number(n).toFixed(4);
// Chroma restore after the per-channel display transform (kept at 0: measured
// against Lightroom, per-channel output already carries the right saturation).
export const CHROMA_RESTORE = 0.0;

/**
 * Weight of the multiscale Local Laplacian EV-delta map on top of the adaptive
 * local tone curve.
 *
 * Set to zero on purpose: since the Basic sliders place their bands from each
 * photo's measured EV percentiles (js/tone-curve.js), the guide curve already
 * carries the whole visible, photo-specific response. The old LLF map used
 * fixed EV pivots calibrated on one night frame, so layering it on top made the
 * other photos respond twice, with an asynchronous pop when the worker map
 * arrived after the immediate preview. Leaving it at 0 keeps the slider
 * feedback deterministic (and removes the export tile-sampling risk entirely);
 * the operator and its unit tests are kept for a future adaptive use.
 */
export const LLF_WEIGHT = 0.0;

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
  // Keep darktable's scene-independent default display black target (0.0152%).
  // Per-image shadow placement belongs to exposure and local tone controls, not
  // to a base curve floor fitted against one night frame.
  black: 0.000152,
  hue: 1.0,
};

/**
 * Detail recovery (the Lightroom Detail panel's job), as a local-Laplacian
 * remap (Paris/Hasinoff/Kautz 2011).
 *
 * A global tone curve cannot tell a bright window from a bright patch of wall:
 * whatever it compresses, it compresses uniformly, so local contrast — what the
 * eye reads as "crisp" — gets flattened, worst where the curve is steepest (the
 * highlight shoulder and the shadow toe). The remap compares each pixel with its
 * blurred neighbourhood and, for deviations *below* sigma, replaces |i-g| with
 * sigma·(|i-g|/sigma)^alpha. With alpha < 1 that amplifies texture while staying
 * monotone and continuous; beyond sigma the mapping is the identity, so a real
 * edge (neon tube against a dark wall) is left exactly untouched. That identity
 * branch is what makes the stage halo-free by construction — any scheme whose
 * gain keeps growing with the deviation paints a white rim around every light,
 * which is exactly the "white ghosting" artifact this replaced.
 *
 * Two scales run in one pass: rho ~ 1 px (acutance) and rho ~ 8 px (the local
 * contrast that survives fitting the photo to the screen). Deviations under
 * `deadband` are sensor noise and get nothing; the whole stage fades out below
 * the measured noise floor in luminance.
 */
export const DETAIL = {
  // Two scales of the same local-Laplacian remap.
  sigma1: 0.22, alpha1: 0.60, weight1: 0.0,
  sigma2: 0.50, alpha2: 0.60, weight2: 0.0,
  localRadius: 8,
  // Deviations below this (log2 units, ~1.4% of luminance) are sensor noise,
  // not texture.
  deadband: 0.016,
  // Noise gate on the scene-linear luminance (this pipeline's units, where 1.0
  // is sensor white) below which detail is faded out entirely.
  gateLo: 0.0060,
  gateHi: 0.0200,
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
// Per-image tone LUT: two rows of R16F log-luminance values.
//   row 0 = global curve (exposure / contrast / whites / blacks), sampled at the
//           pixel's own EV;
//   row 1 = local delta (shadows / highlights), sampled at the blurred guide EV.
// Both rows are built on the CPU from the photo's measured EV percentiles, so a
// slider value means the same visual move on every photo (see js/tone-curve.js).
uniform sampler2D uTone;
// Low-frequency luminance guide: R8, log2(luma/0.18) mapped from -10..6 EV.
uniform sampler2D uGuide;
uniform int uHasGuide;
uniform vec4 uGuideRect;
// Scene-linear local tone correction from the multiscale Local Laplacian pass.
uniform sampler2D uLocalMap;
uniform int uHasLocalMap;
// How much of the LLF map is added on top of the adaptive guide response. The
// guide path carries the slider's main, clearly visible effect; the LLF term
// refines it locally without ever replacing it (LLF alone under-shifts small
// bright regions, because their coarse-level guide is dominated by dark
// neighbours).
uniform float uLocalWeight;
// Camera-preview look: a 256-entry display-luminance curve estimated from the
// camera JPEG embedded in the RAW. Applied after the display transform, before
// the user's whites/blacks and presence controls.
uniform sampler2D uCamLook;
uniform int uHasCamLook;
// Per-luma-band saturation factors and white-balance gains that go with the
// camera look, both estimated from the same embedded JPEG. Four bands keep a
// camera's punchy sky and warm skin from pulling against one another.
uniform vec4 uCamSatBands;
uniform vec3 uCamWb;
// When the visible area is rendered from a native-resolution crop instead of
// the (downscaled) preview, uTile maps the crop's local uv back to image uv.
uniform vec4 uTile;
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
uniform float uSigB;
uniform float uSigHue;
// Detail recovery (lightroom-style): relative local-contrast gain at two
// scales, gated by luminance so shadow noise stays put.
uniform float uSig1;
uniform float uAlpha1;
uniform float uWeight1;
uniform float uSig2;
uniform float uAlpha2;
uniform float uWeight2;
uniform float uDetailDead;
uniform float uLocalRadius;
uniform float uDetGateLo;
uniform float uDetGateHi;
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

/** Sample one row of the per-image tone LUT (row 0.25 global, 0.75 local). */
float toneCurve(float e, float row) {
  float u = clamp((e - TONE_EV_MIN) / (TONE_EV_MAX - TONE_EV_MIN), 0.0, 1.0);
  return texture(uTone, vec2(u, row)).r;
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
 * Local-contrast recovery, applied to the display-linear value right after the
 * sigmoid. A global curve compresses local contrast uniformly — worst where it
 * is steepest (the shadow toe and the highlight shoulder) — so the picture
 * reads as flat there. This measures the pixel's own deviation from its blurred
 * neighbourhood in the scene-linear domain and puts a fraction of it back as a
 * multiplicative gain, at two scales (acutance and the coarser scale that
 * survives on-screen downscaling). The deviation is clamped and applied as a
 * ratio, which keeps gradients intact (no halos), and gated by luminance so the
 * noise floor is not amplified.
 */
float llDelta(float d, float sigma, float alpha) {
  float ad = abs(d);
  if (ad <= 0.0 || ad >= sigma) return 0.0;   // identity at and beyond sigma
  // Symmetric: a pixel darker than its neighbourhood goes darker, a brighter
  // one goes brighter. Boosting only one sign silently brightens the frame.
  return sign(d) * (sigma * pow(ad / sigma, alpha) - ad);
}

vec3 applyDetail(vec3 disp, vec2 uv, vec3 gains) {
  vec3 Lw = vec3(0.2126, 0.7152, 0.0722);
  float Yc = max(dot(texture(uImage, uv).rgb * gains, Lw), 1e-7);
  vec2 t1 = uTexel;
  vec2 t2 = uTexel * uLocalRadius;
  float y1 = dot(texture(uImage, uv + vec2(t1.x, 0.0)).rgb * gains, Lw)
           + dot(texture(uImage, uv - vec2(t1.x, 0.0)).rgb * gains, Lw)
           + dot(texture(uImage, uv + vec2(0.0, t1.y)).rgb * gains, Lw)
           + dot(texture(uImage, uv - vec2(0.0, t1.y)).rgb * gains, Lw);
  y1 *= 0.25;
  float y2 = dot(texture(uImage, uv + vec2(t2.x, 0.0)).rgb * gains, Lw)
           + dot(texture(uImage, uv - vec2(t2.x, 0.0)).rgb * gains, Lw)
           + dot(texture(uImage, uv + vec2(0.0, t2.y)).rgb * gains, Lw)
           + dot(texture(uImage, uv - vec2(0.0, t2.y)).rgb * gains, Lw);
  y2 *= 0.25;
  float gate = smoothstep(uDetGateLo, uDetGateHi, min(Yc, min(y1, y2)));
  float d1 = log2(Yc / max(y1, 1e-7));
  float d2 = log2(Yc / max(y2, 1e-7));
  float act1 = smoothstep(uDetailDead, uDetailDead * 2.5, abs(d1));
  float act2 = smoothstep(uDetailDead * 0.5, uDetailDead * 2.0, abs(d2));
  float delta = (llDelta(d1, uSig1, uAlpha1) * uWeight1 * act1
               + llDelta(d2, uSig2, uAlpha2) * uWeight2 * act2) * gate;
  // Never let the recovered micro-contrast push a channel past white.
  float mx = max(disp.r, max(disp.g, disp.b));
  delta = min(delta, log2(1.0 / max(mx, 1e-6)) * 0.9);
  return disp * exp2(max(delta, -1.2));
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

/**
 * Sigmoid colour handling in rgb-ratio mode: the curve runs on the mean of the
 * three channels and the ratios are preserved, so a saturated neon keeps its
 * spectral colour instead of being pulled towards white — which is what the
 * per-channel mode does to bright saturated pixels (measured on the reference
 * frame: bright-band saturation 0.23 vs Lightroom's 0.41).
 *
 * The scaling can push a channel outside [black, white], so a hyperbolic gamut
 * compression shrinks the colour along the achromatic axis instead of clipping
 * it (the same construction darktable uses in this mode).
 */
vec3 sigmoidRgbRatio(vec3 v) {
  float avg = max((v.r + v.g + v.b) / 3.0, 0.0);
  float mn = min(v.r, min(v.g, v.b));
  float sf = mn < 0.0 ? -avg / (mn - avg) : 1.0;
  vec3 in3 = avg + sf * (v - avg);
  float luma = (in3.r + in3.g + in3.b) / 3.0;
  float mapped = sigCurve(luma);
  vec3 pre = luma > 1e-9 ? (mapped / luma) * in3 : vec3(mapped);
  float eps = 1e-6;
  float pmin = min(pre.r, min(pre.g, pre.b));
  float pmax = max(pre.r, max(pre.g, pre.b));
  float dbw = (uSigW - mapped) / (pmax - mapped + eps);
  float dbb = (uSigB - mapped) / (pmin - mapped - eps);
  float dbc = min(dbw, dbb);
  float cvm = (mapped - pmin) / (mapped + eps);
  float adj = 1.0 / (cvm * dbc + eps);
  float hc = 2.0 * cvm / (1.0 - cvm * cvm + eps) * adj;
  float hz = sqrt(hc * hc + 1.0);
  float cf = hc / (1.0 + hz) * dbc;
  return mapped + cf * (pre - mapped);
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
  // Image-space uv (the crop may be a sub-rectangle of the photo).
  vec2 imUv = uv * uTile.zw + uTile.xy;
  // Outside the photo: black letterbox when fitting, nothing when cropping.
  if (imUv.x < 0.0 || imUv.x > 1.0 || imUv.y < 0.0 || imUv.y > 1.0) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  // Photo-space uv for the maps that live in the full frame (blurred tone guide,
  // Local Laplacian EV map). The interactive native tile carries its offset in
  // uTile, so imUv is already photo-space there and uGuideRect stays identity;
  // a tiled export blits a tile-sized texture with identity uTile and passes the
  // tile's position in uGuideRect, so both cases resolve to the same photo uv.
  // Sampling these maps in tile space instead (the old bug) made every export
  // tile apply the whole frame's guide/local map to itself: blocks and ghost
  // copies of the picture inside the exported JPEG.
  vec2 mapUv = uGuideRect.xy + imUv * uGuideRect.zw;

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
  float wt = uTemp * 0.01;
  float tn = uTint * 0.01;
  vec3 gains = exp2(uExposure) * vec3(
    exp2(wt * 0.60 + tn * 0.14),
    exp2(-tn * 0.34),
    exp2(-wt * 0.60 + tn * 0.14)
  );
  lin *= gains;

  // Tone: the per-image curve built on the CPU (js/tone-curve.js). The global
  // row maps the pixel's own EV; the local row returns a delta sampled at the
  // blurred guide EV. At slider zero the global row is the identity and the
  // local row is zero, so the base rendering is untouched.
  float Y = max(dot(lin, vec3(0.2126, 0.7152, 0.0722)), 1e-7);
  float ev = clamp(log2(Y / 0.18), TONE_EV_MIN, TONE_EV_MAX);
  float gEv = ev;
  if (uHasGuide == 1) {
    // The guide lives in full-frame photo space (mapUv); see the export-tile fix.
    gEv = clamp(texture(uGuide, mapUv).r * 18.0 - 10.0 + uExposure, TONE_EV_MIN, TONE_EV_MAX);
  }
  float evBase = toneCurve(ev, 0.25);
  float evDelta = toneCurve(gEv, 0.75);
  if (uLinearInput == 1 && uHasLocalMap == 1) {
    // Local Laplacian refinement, already an EV delta in the same domain.
    evDelta += texture(uLocalMap, mapUv).r * uLocalWeight;
  }
  float Yl = 0.18 * exp2(evBase + evDelta);
  vec3 graded = lin * (Yl / Y);
  // Desaturate only what is about to clip, so pushed whites roll to white
  // instead of turning a sunset magenta. (sRGB input only — the RAW path
  // lets the sigmoid transform do this properly.)
  vec3 c;
  if (uLinearInput == 1) {
    vec3 disp = sigmoidPerChannel(graded);
    // Per-channel curves compress every channel towards the white point, so a
    // saturated light source converges on white (measured: bright-band
    // saturation 0.23 against Lightroom's 0.41 — the neon signs went pale).
    // Put chroma back proportionally, weighted towards the bright end.
    float Ld = dot(disp, vec3(0.2126, 0.7152, 0.0722));
    float chromaB = 1.0 + ${glf(CHROMA_RESTORE)} * smoothstep(0.12, 0.55, Ld);
    disp = clamp(vec3(Ld) + (disp - vec3(Ld)) * chromaB, 0.0, 1.0);
    if (uWeight1 > 0.0 || uWeight2 > 0.0) disp = applyDetail(disp, uv, gains);
    c = clamp(linearToSrgb(disp), 0.0, 1.0);
  } else {
    float mx = max(graded.r, max(graded.g, graded.b));
    if (mx > 1.0) graded = mix(graded, vec3(1.0), clamp((mx - 1.0) / mx, 0.0, 1.0) * 0.65);
    c = clamp(linearToSrgb(graded), 0.0, 1.0);
  }

  // Camera-preview look: map the neutral displayed luminance onto the camera's
  // own JPEG rendition (measured per photo from the embedded preview), keeping
  // hue by applying the tone change as a luminance ratio.
  if (uHasCamLook == 1) {
    float Lc = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float mapped = texture(uCamLook, vec2(clamp(Lc, 0.0, 1.0), 0.5)).r;
    c = Lc > 0.002 ? clamp(c * (mapped / Lc), 0.0, 1.0) : vec3(mapped);
    // Match the camera JPEG's warmth and saturation as well as its tone curve.
    c = clamp(c * uCamWb, 0.0, 1.0);
    float Lw = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // Banded saturation: interpolate between the four measured band factors by
    // output luma (0..1 → three segments), so each tonal range matches the
    // camera JPEG's own saturation instead of one global ratio.
    float pos = clamp(Lw, 0.0, 1.0) * 3.0;
    float t = pos - floor(pos);
    float sat0, sat1;
    if (pos < 1.0) { sat0 = uCamSatBands.x; sat1 = uCamSatBands.y; }
    else if (pos < 2.0) { sat0 = uCamSatBands.y; sat1 = uCamSatBands.z; }
    else { sat0 = uCamSatBands.z; sat1 = uCamSatBands.w; }
    float satF = mix(sat0, sat1, t);
    c = clamp(mix(vec3(Lw), c, satF), 0.0, 1.0);
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
    for (const name of ['uImage', 'uLut0', 'uLut1', 'uLut2', 'uHas0', 'uHas1', 'uHas2', 'uStr0', 'uStr1', 'uStr2', 'uRect', 'uExposure', 'uTemp', 'uTint', 'uVibrance', 'uSaturation', 'uLinearInput', 'uLogMode', 'uTone', 'uGuide', 'uHasGuide', 'uGuideRect', 'uLocalMap', 'uHasLocalMap', 'uLocalWeight', 'uCamLook', 'uHasCamLook', 'uCamSatBands', 'uCamWb', 'uTile', 'uNr', 'uNrColor', 'uTexel', 'uSigP', 'uSigQ', 'uSigPe', 'uSigFog', 'uSigW', 'uSigB', 'uSigHue', 'uSig1', 'uAlpha1', 'uWeight1', 'uSig2', 'uAlpha2', 'uWeight2', 'uDetailDead', 'uLocalRadius', 'uDetGateLo', 'uDetGateHi']) {
      this.uniform[name] = gl.getUniformLocation(this.program, name);
    }

    this.imageTex = null;
    this.imgW = 0;
    this.imgH = 0;
    this.tileRect = null;
    // Scene-linear sources keep two GPU textures: the downscaled preview and
    // the native-resolution crop used when zoomed in. Switching between them is
    // a pointer swap — re-uploading a 30 MB tile for every filmstrip thumbnail
    // was what made the viewer stutter.
    this.previewSlot = null;   // { tex, w, h, fullW, fullH }
    this.tileSlot = null;      // { tex, w, h, rect }
    this.texMode = 'preview';
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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, TONE_LUT_SIZE, 2, 0, gl.RED, gl.HALF_FLOAT, new Uint16Array(TONE_LUT_SIZE * 2));

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
    // Scene-linear local tone delta map (unit 6): EV offsets from the LLF worker.
    this.localMapTex = gl.createTexture();
    this.hasLocalMap = false;
    this.localMapKey = '';
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.localMapTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([0]));
    // Camera-preview look curve (unit 7): 256x1 R8 display-luminance mapping.
    this.camLookTex = gl.createTexture();
    this.hasCamLook = false;
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.camLookTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uniform.uGuide, 5);
    gl.uniform1i(this.uniform.uLocalMap, 6);
    gl.uniform1i(this.uniform.uCamLook, 7);
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
    if (this.previewSlot) this.gl.deleteTexture(this.previewSlot.tex);
    this.previewSlot = { tex: this._uploadLinearTex(preview.data, preview.w, preview.h), w: preview.w, h: preview.h, fullW, fullH };
    this.activatePreview();
    this.linear = true;
  }

  /** Show the downscaled preview texture (fit view, gestures, thumbnails). */
  activatePreview() {
    const slot = this.previewSlot;
    if (!slot) return;
    this.texMode = 'preview';
    this.imageTex = slot.tex;
    this.texW = slot.w;
    this.texH = slot.h;
    this.tileRect = null;
    this.imgW = slot.fullW;
    this.imgH = slot.fullH;
  }

  /** Show the native-resolution crop (zoomed inspection). */
  activateTile() {
    const slot = this.tileSlot;
    if (!slot) { this.activatePreview(); return; }
    this.texMode = 'tile';
    this.imageTex = slot.tex;
    this.texW = slot.w;
    this.texH = slot.h;
    this.tileRect = slot.rect;
    this.imgW = slot.rect ? slot.rect.fullW : slot.w;
    this.imgH = slot.rect ? slot.rect.fullH : slot.h;
  }

  /**
   * Upload one native-resolution tile of scene-linear half floats (export, or
   * the zoomed inspection view). `tile` describes where the crop sits inside
   * the full photo, so uv maths and the guide stay in image space.
   */
  setLinearTile(data, w, h, tile = null) {
    if (this.tileSlot) this.gl.deleteTexture(this.tileSlot.tex);
    this.tileSlot = {
      tex: this._uploadLinearTex(data, w, h),
      w, h,
      rect: tile ? { x: tile.x, y: tile.y, w: tile.w, h: tile.h, fullW: tile.fullW || w, fullH: tile.fullH || h } : null,
    };
    this.activateTile();
    this.linear = true;
  }

  /** Drop the native crop (e.g. a new photo or zoomed back out). */
  dropTile() {
    if (this.tileSlot) { this.gl.deleteTexture(this.tileSlot.tex); this.tileSlot = null; }
    if (this.texMode === 'tile') this.activatePreview();
  }

  _uploadLinearTex(data, w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB16F, w, h, 0, gl.RGB, gl.HALF_FLOAT, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
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

  /**
   * Upload the per-photo camera-preview look curve (256 display-luminance
   * samples). Pass null to fall back to the neutral development.
   */
  setCameraLook(curve, { sat = 1, wb = [1, 1, 1], satBands = null } = {}) {
    const gl = this.gl;
    if (!curve || curve.length !== 256) { this.hasCamLook = false; this.camSatBands = null; return; }
    this.camSat = Math.max(0.5, Math.min(1.6, sat));
    this.camWb = wb.map((v) => Math.max(0.5, Math.min(1.6, v)));
    this.camSatBands = Array.isArray(satBands) && satBands.length === 4
      ? satBands.map((v) => Math.max(0.4, Math.min(2.6, Number(v) || 1)))
      : null;
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.camLookTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, curve);
    gl.activeTexture(gl.TEXTURE0);
    this.hasCamLook = true;
  }

  /** Upload a low-resolution per-pixel EV correction from the Local Laplacian. */
  setLocalMap(map, key = '') {
    const gl = this.gl;
    this.localMapKey = key;
    if (!map || !map.data || !map.w || !map.h) { this.hasLocalMap = false; return; }
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.localMapTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const half = new Uint16Array(map.data.length);
    for (let i = 0; i < half.length; i++) half[i] = floatToHalf(map.data[i]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, map.w, map.h, 0, gl.RED, gl.HALF_FLOAT, half);
    gl.activeTexture(gl.TEXTURE0);
    this.hasLocalMap = true;
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

  /**
   * Rebuild the per-image tone LUT (two rows) when the sliders, the exposure or
   * the measured scene change. The curve maths is the pure JS module
   * js/tone-curve.js, so the node tests exercise exactly what the GPU samples.
   */
  _syncToneCurve(adjust) {
    const a = adjust || {};
    const scene = a.scene || neutralSceneStats(this.linear);
    const sig = [
      this.linear ? 1 : 0,
      Number(scene.p01).toFixed(2), Number(scene.p05).toFixed(2),
      Number(scene.p10).toFixed(2), Number(scene.p25).toFixed(2),
      Number(scene.p50).toFixed(2), Number(scene.p75).toFixed(2),
      Number(scene.p90).toFixed(2), Number(scene.p95).toFixed(2),
      Number(scene.p99).toFixed(2), Number(scene.p999).toFixed(2),
      (Number(a.exposure) || 0).toFixed(3),
      Math.round(Number(a.contrast) || 0), Math.round(Number(a.highlights) || 0),
      Math.round(Number(a.shadows) || 0), Math.round(Number(a.whites) || 0),
      Math.round(Number(a.blacks) || 0),
    ].join(',');
    if (sig === this.toneSig) return;
    this.toneSig = sig;
    const { base, local } = buildToneCurves({
      scene,
      exposure: Number(a.exposure) || 0,
      contrast: a.contrast,
      highlights: a.highlights,
      shadows: a.shadows,
      whites: a.whites,
      blacks: a.blacks,
    });
    const bits = new Uint16Array(TONE_LUT_SIZE * 2);
    for (let i = 0; i < TONE_LUT_SIZE; i++) {
      bits[i] = floatToHalf(base[i]);
      bits[TONE_LUT_SIZE + i] = floatToHalf(local[i]);
    }
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.toneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, TONE_LUT_SIZE, 2, 0, gl.RED, gl.HALF_FLOAT, bits);
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
    // Assigning width/height reallocates the drawing buffer even when the value
    // is unchanged, which is expensive on software renderers; only resize when
    // the target really changed (the filmstrip renders 44 badges per pass).
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
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
    // A native crop only covers part of the photo: express the visible
    // rectangle in the crop's own uv space, and tell the shader how to get
    // back to image space (guide lookups, letterbox test).
    let urect = rect;
    const T = this.tileRect;
    if (T) {
      urect = {
        x: (rect.x - T.x) / T.w,
        y: (rect.y - T.y) / T.h,
        w: rect.w / T.w,
        h: rect.h / T.h,
      };
      gl.uniform4f(this.uniform.uTile, T.x, T.y, T.w, T.h);
    } else {
      gl.uniform4f(this.uniform.uTile, 0, 0, 1, 1);
    }
    gl.uniform4f(this.uniform.uRect, urect.x, urect.y, urect.w, urect.h);
    gl.uniform1i(this.uniform.uLinearInput, this.linear ? 1 : 0);
    gl.uniform1i(this.uniform.uHasGuide, this.hasGuide ? 1 : 0);
    const gr = guideRect;
    gl.uniform4f(this.uniform.uGuideRect, gr ? gr.x : 0, gr ? gr.y : 0, gr ? gr.w : 1, gr ? gr.h : 1);
    const localMapOn = this.hasLocalMap && !adjust?.noLocalTone && this.localMapKey === adjust?.localToneKey;
    gl.uniform1i(this.uniform.uHasLocalMap, localMapOn ? 1 : 0);
    // LLF refinement is deliberately a fraction of the response: the guide-based
    // adaptive path must stay visible on its own (measured: LLF alone shifted the
    // night reference's bright pixels by only ~0.5 EV, which read as "no effect").
    gl.uniform1f(this.uniform.uLocalWeight, localMapOn ? LLF_WEIGHT : 0);
    gl.uniform1i(this.uniform.uHasCamLook, (this.hasCamLook && adjust?.camLook) ? 1 : 0);
    const satBands = this.camSatBands;
    if (satBands && satBands.length === 4) {
      gl.uniform4f(this.uniform.uCamSatBands, satBands[0], satBands[1], satBands[2], satBands[3]);
    } else {
      const s = this.camSat ?? 1;
      gl.uniform4f(this.uniform.uCamSatBands, s, s, s, s);
    }
    if (this.camWb) gl.uniform3f(this.uniform.uCamWb, this.camWb[0], this.camWb[1], this.camWb[2]);
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
    // All six Basic sliders live in the per-image curve; the sigmoid stays at
    // its calibrated shape (it is the display transform, not a control).
    this._syncToneCurve(adjust || {});
    const sig = sigmoidFit(SIGMOID.contrast, SIGMOID.skew);
    gl.uniform1f(this.uniform.uSigP, sig.p);
    gl.uniform1f(this.uniform.uSigQ, sig.q);
    gl.uniform1f(this.uniform.uSigPe, sig.pe);
    gl.uniform1f(this.uniform.uSigFog, sig.fog);
    gl.uniform1f(this.uniform.uSigW, sig.w);
    gl.uniform1f(this.uniform.uSigB, sig.b);
    gl.uniform1f(this.uniform.uSigHue, SIGMOID.hue);
    // Detail recovery runs only on the linear RAW path (a JPEG has already been
    // sharpened by the camera); the export can turn it off at tile borders.
    const detailOn = this.linear && !adjust?.noDetail;
    gl.uniform1f(this.uniform.uSig1, detailOn ? DETAIL.sigma1 : 0);
    gl.uniform1f(this.uniform.uAlpha1, DETAIL.alpha1);
    gl.uniform1f(this.uniform.uWeight1, detailOn ? DETAIL.weight1 : 0);
    gl.uniform1f(this.uniform.uSig2, detailOn ? DETAIL.sigma2 : 0);
    gl.uniform1f(this.uniform.uAlpha2, DETAIL.alpha2);
    gl.uniform1f(this.uniform.uWeight2, detailOn ? DETAIL.weight2 : 0);
    gl.uniform1f(this.uniform.uDetailDead, DETAIL.deadband);
    gl.uniform1f(this.uniform.uLocalRadius, DETAIL.localRadius);
    gl.uniform1f(this.uniform.uDetGateLo, DETAIL.gateLo);
    gl.uniform1f(this.uniform.uDetGateHi, DETAIL.gateHi);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }

  dispose() {
    const gl = this.gl;
    if (this.previewSlot) gl.deleteTexture(this.previewSlot.tex);
    if (this.tileSlot) gl.deleteTexture(this.tileSlot.tex);
    if (this.toneTex) gl.deleteTexture(this.toneTex);
    if (this.guideTex) gl.deleteTexture(this.guideTex);
    if (this.localMapTex) gl.deleteTexture(this.localMapTex);
    if (this.camLookTex) gl.deleteTexture(this.camLookTex);
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
