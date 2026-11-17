/**
 * One WebGL2 renderer shared by the hero, the gallery thumbnails and the
 * studio. It owns a single offscreen canvas; callers copy the result into
 * normal 2D canvases (so crossfades stay simple and only one GL context is
 * created on phones).
 *
 * Pipeline: exposure + white balance in linear light → monotone tone curve
 * sampled in log2 luminance (contrast / shadows / highlights / whites / blacks)
 * → vibrance/saturation → optional LOG encode → up to 3 stacked LUTs.
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
  const contrast = pick(tone.contrast);
  const shadows = pick(tone.shadows);
  const highlights = pick(tone.highlights);
  const whites = pick(tone.whites);
  const blacks = pick(tone.blacks);

  const slope = 1 + 0.35 * contrast;   // ±35% slope around mid grey
  const shAmp = 2.4 * shadows;         // stops, deepest shadows
  const hiAmp = 2.0 * highlights;      // stops, upper range
  const whAmp = 2.8 * whites;          // stops, top end only
  const blAmp = 1.0 * blacks;          // stops, toe shaping
  const out = new Float32Array(TONE_LUT_SIZE);

  for (let i = 0; i < TONE_LUT_SIZE; i++) {
    const ev = TONE_EV_MIN + (TONE_EV_MAX - TONE_EV_MIN) * (i / (TONE_LUT_SIZE - 1));
    let x = ev * slope;
    x += shAmp * (1 - smoothstep(-4.2, -0.2, x));
    x += hiAmp * smoothstep(0.3, 3.2, x);
    x += whAmp * smoothstep(1.2, 4.5, x);
    x += blAmp * (1 - smoothstep(-9.0, -5.5, x));
    let y = GREY * Math.pow(2, x);
    if (blacks > 0) y += 0.0065 * blacks * (1 - smoothstep(0.004, 0.05, y));
    else if (blacks < 0) y -= 0.0080 * -blacks * (1 - smoothstep(0.002, 0.03, y));
    y = Math.max(y, 1e-8);
    out[i] = Math.log2(y / GREY);
  }
  // Strictly non-decreasing: no tone inversion at any setting combination.
  for (let i = 1; i < TONE_LUT_SIZE; i++) {
    if (out[i] < out[i - 1]) out[i] = out[i - 1];
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
uniform vec2 uRes;
uniform float uImgAspect;
uniform float uFit;
uniform float uExposure;
uniform float uTemp;
uniform float uTint;
uniform float uVibrance;
uniform float uSaturation;
// 1D tone LUT in log2 luminance (R16F, TONE_LUT_SIZE samples).
uniform sampler2D uTone;
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

void main() {
  // image-space uv: (0,0) = top-left of the source, independent of the
  // browser's flipY handling for Image vs ImageBitmap uploads.
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  float canvasAspect = uRes.x / uRes.y;
  if (uFit > 0.5) {
    // contain: whole photo visible, black letterbox
    if (canvasAspect > uImgAspect) {
      float visible = uImgAspect / canvasAspect;
      uv.x = (uv.x - (1.0 - visible) * 0.5) / visible;
    } else {
      float visible = canvasAspect / uImgAspect;
      uv.y = (uv.y - (1.0 - visible) * 0.5) / visible;
    }
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      outColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
  } else {
    // cover: fill the viewport, crop the overflow
    if (canvasAspect > uImgAspect) {
      float visible = uImgAspect / canvasAspect;
      uv.y = (uv.y - 0.5) * visible + 0.5;
    } else {
      float visible = canvasAspect / uImgAspect;
      uv.x = (uv.x - 0.5) * visible + 0.5;
    }
  }

  vec3 c = texture(uImage, uv).rgb;
  if (uNr > 0.0 || uNrColor > 0.0) c = denoise(c, uv);
  // Exposure and white balance are multiplicative in linear light, which is the
  // whole point of a RAW processor: channel gains must not clip independently in
  // the encoded curve. +temp = warmer (more red, less blue), +tint = magenta.
  vec3 lin = srgbToLinear(c) * exp2(uExposure);
  float wt = uTemp * 0.01;
  float tn = uTint * 0.01;
  lin *= vec3(
    exp2(wt * 0.60 + tn * 0.14),
    exp2(-tn * 0.34),
    exp2(-wt * 0.60 + tn * 0.14)
  );

  // Tone: a single monotone curve in log2 luminance, applied as a luminance
  // ratio so hue and saturation survive. The LUT is built so no combination of
  // blacks/whites/highlights/shadows can fold the curve.
  float Y = max(dot(lin, vec3(0.2126, 0.7152, 0.0722)), 1e-7);
  float ev = clamp(log2(Y / 0.18), TONE_EV_MIN, TONE_EV_MAX);
  float tu = (ev - TONE_EV_MIN) / (TONE_EV_MAX - TONE_EV_MIN);
  float Yt = 0.18 * exp2(texture(uTone, vec2(tu, 0.5)).r);
  vec3 graded = lin * (Yt / Y);
  // Desaturate only what is about to clip, so pushed whites roll to white
  // instead of turning a sunset magenta.
  float mx = max(graded.r, max(graded.g, graded.b));
  if (mx > 1.0) graded = mix(graded, vec3(1.0), clamp((mx - 1.0) / mx, 0.0, 1.0) * 0.65);
  c = clamp(linearToSrgb(graded), 0.0, 1.0);

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
    for (const name of ['uImage', 'uLut0', 'uLut1', 'uLut2', 'uHas0', 'uHas1', 'uHas2', 'uStr0', 'uStr1', 'uStr2', 'uRes', 'uImgAspect', 'uFit', 'uExposure', 'uTemp', 'uTint', 'uVibrance', 'uSaturation', 'uLogMode', 'uTone', 'uNr', 'uNrColor', 'uTexel']) {
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
    gl.activeTexture(gl.TEXTURE0);
  }

  /**
   * Upload the photo once; thumbnails and previews reuse it.
   * Images larger than MAX_TEXTURE_SIZE are downscaled for the GPU preview;
   * full-resolution export re-uploads crops instead (see exportImage()).
   */
  setImage(source) {
    const gl = this.gl;
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

  /** Rebuild + upload the tone LUT only when one of the five tone controls moved. */
  _syncToneCurve(adjust) {
    const tone = adjust || {};
    const sig = `${tone.contrast | 0}|${tone.highlights | 0}|${tone.shadows | 0}|${tone.whites | 0}|${tone.blacks | 0}`;
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
   */
  render(luts, adjust, w, h, fit = 'cover') {
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

    gl.uniform2f(this.uniform.uRes, w, h);
    gl.uniform1f(this.uniform.uImgAspect, this.imgW / this.imgH);
    gl.uniform1f(this.uniform.uFit, fit === 'contain' ? 1 : 0);
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
    this._syncToneCurve(adjust);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }

  dispose() {
    const gl = this.gl;
    if (this.imageTex) gl.deleteTexture(this.imageTex);
    if (this.toneTex) gl.deleteTexture(this.toneTex);
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
