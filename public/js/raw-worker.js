/**
 * RAW development, off the main thread.
 *
 * flashraw decodes RGB at 16 bit with an extended white point (`rgb16` +
 * `whitePoint`), which keeps the highlight headroom the sensor recorded instead
 * of clipping everything above white to 1.0. The worker then re-encodes those
 * samples as scene-linear half floats — the format the WebGL renderer upgrades
 * to a filterable RGB16F texture — so the Highlights slider can actually
 * recover bright detail, the way Lightroom does from linear raw data.
 *
 * The worker also prepares the two small artefacts that make the renderer feel
 * like a raw processor instead of a JPEG editor:
 *  - a downscaled linear preview (the GPU texture),
 *  - a blurred log-luminance guide for the adaptive shadows/highlights,
 * and the automatic exposure EV, all computed from the linear frame.
 */
import { decodeRaw, readMetadata } from '/vendor/flashraw/browser.js';

/** Scene-linear headroom kept by the 16-bit decode (4 stops above sensor white). */
const WHITE_POINT = 16;
const PREVIEW_LONG_EDGE = 4096;
const GUIDE_LONG_EDGE = 320;
const LUT_SIZE = 65536;

/* ------------------------------------------------------------------ */
/* half-float helpers                                                   */
/* ------------------------------------------------------------------ */
const _f32 = new Float32Array(1);
const _i32 = new Int32Array(_f32.buffer);

function floatToHalf(value) {
  _f32[0] = value;
  const x = _i32[0];
  let bits = (x >> 16) & 0x8000;
  let m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;
  if (e < 103) return bits;
  if (e > 142) { bits |= 0x7c00; return bits; }
  if (e < 113) {
    m |= 0x0800;
    bits |= ((m >> (114 - e)) + ((m >> (113 - e)) & 1)) & 0x7fff;
    return bits;
  }
  bits |= ((e - 112) << 10) | (m >> 1);
  bits += m & 1;
  return bits & 0xffff;
}

/**
 * sRGB-encoded 16-bit sample → scene-linear half float, with the extended white
 * point folded in. One table means the 60-million-sample conversion is a single
 * lookup per channel instead of a pow() per sample.
 */
let srgbToHalfLut = null;
function getSrgbToHalfLut() {
  if (srgbToHalfLut) return srgbToHalfLut;
  const lut = new Uint16Array(LUT_SIZE);
  for (let i = 0; i < LUT_SIZE; i++) {
    const s = i / (LUT_SIZE - 1);
    const lin = (s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)) * WHITE_POINT;
    lut[i] = floatToHalf(lin);
  }
  srgbToHalfLut = lut;
  return lut;
}

const toLin = (s) => (s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4));
const toSrgb = (v) => {
  v = Math.max(0, Math.min(1, v));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
};

/* ------------------------------------------------------------------ */
/* frame inspection                                                    */
/* ------------------------------------------------------------------ */

/**
 * flashraw 0.3.1 currently decodes only the top part of very wide frames (a
 * 8256px Z 9 NEF comes back with the lower ~73% as exact zeros). A photo that is
 * genuinely black at the bottom would not be *exact* zero rows below a fully
 * wiped band, so use that signature to fall back to the camera JPEG that the RAW
 * carries instead of showing a half-black image.
 */
function decodeLooksTruncated(data, width, height) {
  const bands = 32;
  if (height < bands * 8) return false;
  let lastContent = -1;
  for (let b = 0; b < bands; b++) {
    const y0 = Math.floor(height * b / bands);
    const y1 = Math.floor(height * (b + 1) / bands);
    const stepY = Math.max(1, Math.floor((y1 - y0) / 16));
    let s = 0, n = 0;
    for (let y = y0; y < y1; y += stepY) {
      for (let x = 0; x < width; x += 41) {
        const i = (y * width + x) * 3;
        s += data[i] + data[i + 1] + data[i + 2];
        n += 3;
      }
    }
    if (s / Math.max(1, n) > 16) lastContent = b;
  }
  if (lastContent < 0 || lastContent > bands - 6) return false;
  for (let b = lastContent + 1; b < bands; b++) {
    const y = Math.floor(height * (b + 0.5) / bands);
    for (let x = 0; x < width; x += 37) {
      const i = (y * width + x) * 3;
      if (data[i] || data[i + 1] || data[i + 2]) return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* derived data                                                        */
/* ------------------------------------------------------------------ */

/** Box-average the 16-bit encoded frame down to the GPU preview size. */
function buildPreview(frameData, w, h, lut) {
  const scale = Math.min(1, PREVIEW_LONG_EDGE / Math.max(w, h));
  if (scale >= 1) return null;
  const dw = Math.max(8, Math.round(w * scale));
  const dh = Math.max(8, Math.round(h * scale));
  const out = new Uint16Array(dw * dh * 3);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * h / dh);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * w / dw);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / dw));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * w + x0) * 3;
        for (let xx = x0; xx < x1; xx++) {
          r += frameData[i]; g += frameData[i + 1]; b += frameData[i + 2];
          i += 3; n++;
        }
      }
      const o = (y * dw + x) * 3;
      out[o] = lut[Math.min(LUT_SIZE - 1, Math.round(r / n))];
      out[o + 1] = lut[Math.min(LUT_SIZE - 1, Math.round(g / n))];
      out[o + 2] = lut[Math.min(LUT_SIZE - 1, Math.round(b / n))];
    }
  }
  return { data: out, w: dw, h: dh };
}

/**
 * Blurred log-luminance guide for the adaptive tone sliders, built in linear
 * light from the same box-averaged samples. Encoded to R8 over [-10, 8] EV.
 */
function buildGuide(frameData, w, h) {
  const scale = Math.min(1, GUIDE_LONG_EDGE / Math.max(w, h));
  const gw = Math.max(8, Math.round(w * scale));
  const gh = Math.max(8, Math.round(h * scale));
  const ev = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    const y0 = Math.floor(y * h / gh);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / gh));
    for (let x = 0; x < gw; x++) {
      const x0 = Math.floor(x * w / gw);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / gw));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * w + x0) * 3;
        for (let xx = x0; xx < x1; xx++) {
          r += frameData[i]; g += frameData[i + 1]; b += frameData[i + 2];
          i += 3; n++;
        }
      }
      const lin = (
        0.2126 * toLin(r / n / 65535) +
        0.7152 * toLin(g / n / 65535) +
        0.0722 * toLin(b / n / 65535)
      ) * WHITE_POINT;
      ev[y * gw + x] = Math.max(-10, Math.min(8, Math.log2(Math.max(lin, 1e-7) / 0.18)));
    }
  }

  // Separable cross-bilateral blur: weights are quantised by EV difference so
  // the pass is a table lookup instead of an exp() per neighbour.
  const radius = Math.max(2, Math.round(Math.min(gw, gh) * 0.035));
  const SIGMA = 0.65;
  const QUANT = 256;
  const wts = new Float32Array(QUANT + 1);
  for (let i = 0; i <= QUANT; i++) {
    const diff = (i / QUANT) * 5.0;
    wts[i] = Math.exp(-(diff * diff) / (2 * SIGMA * SIGMA));
  }
  const tmp = new Float32Array(ev.length);
  const pass = (srcArr, dstArr, horizontal) => {
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const ci = y * gw + x;
        const cv = srcArr[ci];
        let sum = 0, wsum = 0;
        const from = horizontal ? Math.max(0, x - radius) : Math.max(0, y - radius);
        const to = horizontal ? Math.min(gw - 1, x + radius) : Math.min(gh - 1, y + radius);
        for (let n = from; n <= to; n++) {
          const ni = horizontal ? y * gw + n : n * gw + x;
          const q = Math.min(QUANT, Math.round(Math.abs(srcArr[ni] - cv) / 5.0 * QUANT));
          const w = wts[q];
          sum += srcArr[ni] * w;
          wsum += w;
        }
        dstArr[ci] = wsum > 0 ? sum / wsum : cv;
      }
    }
  };
  pass(ev, tmp, true);
  pass(tmp, ev, false);

  const data = new Uint8Array(gw * gh);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(((ev[i] + 10) / 18) * 255);
  return { data, w: gw, h: gh };
}

/**
 * Automatic exposure, measured in scene-linear light. Scene-referred, like
 * the rest of the RAW pipeline: the anchors are *scene* constants, so auto
 * exposure means the same thing whatever display transform runs later. The
 * 95th percentile lands near sensor white (everything above it is specular
 * headroom the sigmoid display transform compresses), and the midtones are
 * not pushed past ~0.39 of white. Both values reproduce the calibration the
 * old display-referred pipeline landed on, which the regression suite's
 * exposure contracts (dim frame, daylight frame) are written against.
 */
function autoExposureEV(frameData, w, h) {
  const N = w * h;
  const stride = Math.max(1, Math.floor(N / 120000));
  const lums = [];
  for (let p = 0; p < N; p += stride) {
    const i = p * 3;
    lums.push((
      0.2126 * toLin(frameData[i] / 65535) +
      0.7152 * toLin(frameData[i + 1] / 65535) +
      0.0722 * toLin(frameData[i + 2] / 65535)
    ) * WHITE_POINT);
  }
  lums.sort((a, b) => a - b);
  const at = (p) => lums[Math.min(lums.length - 1, Math.floor(lums.length * p))];
  const evHi = Math.log2(0.88 / Math.max(at(0.95), 1e-7));
  const evMid = Math.log2(0.39 / Math.max(at(0.50), 1e-7));
  return Math.max(-1.0, Math.min(4.5, Math.min(evHi, evMid)));
}

/** Camera label for the UI only — never let a metadata hiccup fail the decode. */
async function readCameraModel(buffer) {
  try {
    const meta = await readMetadata(buffer);
    const make = (meta?.camera?.make || '').trim();
    const name = (meta?.camera?.model || '').trim();
    const brand = make.split(/\s+/)[0] || '';
    return name && brand && !name.toUpperCase().includes(brand.toUpperCase()) ? `${make} ${name}` : name || make;
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* legacy 8-bit path (fallback only)                                   */
/* ------------------------------------------------------------------ */

function decodeLooksTruncated8(data, width, height) {
  const bands = 32;
  if (height < bands * 8) return false;
  let lastContent = -1;
  for (let b = 0; b < bands; b++) {
    const y0 = Math.floor(height * b / bands);
    const y1 = Math.floor(height * (b + 1) / bands);
    const stepY = Math.max(1, Math.floor((y1 - y0) / 16));
    let s = 0, n = 0;
    for (let y = y0; y < y1; y += stepY) {
      for (let x = 0; x < width; x += 41) {
        const i = (y * width + x) * 4;
        s += data[i] + data[i + 1] + data[i + 2];
        n += 3;
      }
    }
    if (s / Math.max(1, n) > 4) lastContent = b;
  }
  if (lastContent < 0 || lastContent > bands - 6) return false;
  for (let b = lastContent + 1; b < bands; b++) {
    const y = Math.floor(height * (b + 0.5) / bands);
    for (let x = 0; x < width; x += 37) {
      const i = (y * width + x) * 4;
      if (data[i] || data[i + 1] || data[i + 2]) return false;
    }
  }
  return true;
}

function softenCurve(data) {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    lut[i] = Math.round((v * 0.6 + (v * v * (3 - 2 * v)) * 0.4) * 255);
  }
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
}

function autoExposureEV8(data) {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * 7) {
    const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) | 0;
    hist[l > 255 ? 255 : l]++;
    n++;
  }
  const pct = (p) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= n * p) return v;
    }
    return 255;
  };
  const p50 = pct(0.50) / 255;
  const p95 = pct(0.95) / 255;
  const evHi = Math.log2(toLin(0.93) / Math.max(toLin(p95), 1e-6));
  const evMid = Math.log2(toLin(0.62) / Math.max(toLin(p50), 1e-6));
  return Math.max(-1.0, Math.min(4.5, Math.min(evHi, evMid)));
}

/* ------------------------------------------------------------------ */
/* decode                                                              */
/* ------------------------------------------------------------------ */

const incompleteError = (message) => {
  const err = new Error(message || 'RAW decoder returned an incomplete frame');
  err.kind = 'IncompleteDecode';
  return err;
};

/** Extended-range linear decode: the path that keeps highlight headroom. */
async function decodeLinear(buffer) {
  const frame = await decodeRaw(buffer, {
    output: 'rgb16',
    // Keep four stops of scene headroom in the 16-bit output instead of clipping
    // at white; the shader turns this back into scene-linear half floats.
    whitePoint: WHITE_POINT,
    demosaic: 'auto',
    whiteBalance: 'as-shot',
    highlights: 'clip',
  });
  try {
    if (frame.incomplete || frame.source === 'preview') throw incompleteError();
    const w = frame.width, h = frame.height;
    const data = frame.data;
    if (!data || data.length !== w * h * 3) throw incompleteError('unexpected RGB16 layout');
    if (decodeLooksTruncated(data, w, h)) throw incompleteError();
    const lut = getSrgbToHalfLut();
    const N = w * h;
    const full = new Uint16Array(N * 3);
    for (let i = 0; i < full.length; i++) full[i] = lut[data[i]];
    const preview = buildPreview(data, w, h, lut);
    const guide = buildGuide(data, w, h);
    const exposureEV = autoExposureEV(data, w, h);
    return { linear: true, full, w, h, preview, guide, exposureEV };
  } finally {
    frame.free?.();
  }
}

/** Display-ready 8-bit decode: used only if the linear path cannot run. */
async function decodeLegacy(buffer) {
  const frame = await decodeRaw(buffer, {
    output: 'rgba8',
    demosaic: 'auto',
    whiteBalance: 'as-shot',
    highlights: 'blend',
  });
  const imageData = frame.toImageData();
  if (frame.incomplete || decodeLooksTruncated8(imageData.data, imageData.width, imageData.height)) {
    frame.free?.();
    throw incompleteError();
  }
  softenCurve(imageData.data);
  const exposureEV = autoExposureEV8(imageData.data);
  const bitmap = await createImageBitmap(imageData);
  frame.free?.();
  return { linear: false, bitmap, w: imageData.width, h: imageData.height, exposureEV };
}

/* ------------------------------------------------------------------ */
/* message handling                                                    */
/* ------------------------------------------------------------------ */

self.onmessage = async (event) => {
  const { id, buffer } = event.data;
  try {
    const model = await readCameraModel(buffer);
    let out;
    try {
      out = await decodeLinear(buffer);
    } catch (err) {
      // The linear path is the good one; if it cannot run (exotic output,
      // memory pressure) the display-ready decode still gets a usable photo.
      if (err?.kind === 'IncompleteDecode') throw err;
      try { out = await decodeLegacy(buffer); }
      catch { throw err; }
    }
    if (out.linear) {
      self.postMessage({
        id, ok: true, linear: true, model,
        full: out.full, width: out.w, height: out.h,
        preview: out.preview, guide: out.guide,
        exposureEV: out.exposureEV,
      }, [out.full.buffer, out.preview.data.buffer, out.guide.data.buffer]);
    } else {
      self.postMessage(
        { id, ok: true, linear: false, bitmap: out.bitmap, width: out.w, height: out.h, model, exposureEV: out.exposureEV },
        [out.bitmap],
      );
    }
  } catch (err) {
    self.postMessage({ id, ok: false, kind: err?.kind || null, message: String(err?.message || err) });
  }
};
