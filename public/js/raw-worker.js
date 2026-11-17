/**
 * RAW development, off the main thread.
 *
 * Runs flashraw (WASM) in a module worker so a 26 MP decode does not freeze the
 * page, and hands the result back as a transferable ImageBitmap.
 */
import { decodeRaw, readMetadata } from '/vendor/flashraw/browser.js';

/**
 * How many stops this frame is off a normal exposure.
 *
 * Calibrated against what a photographer actually does: put the *upper* end of
 * the frame where a finished photo lives (the 95th percentile at ~0.93 sRGB,
 * which lets ~5% of speculars clip — a dim interior should get bright, not stay
 * moody), and never lift midtones past ~0.62 sRGB. The old 99.5-percentile
 * target protected a single lamp so hard that an indoor frame stayed 2 stops
 * dark; that is why it always needed a manual +1.2 EV.
 *
 * Brightness only — no colour, saturation or white balance.
 */
function autoExposureEV(data) {
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
  const toLin = (s) => (s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4));
  const p50 = pct(0.50) / 255;
  const p95 = pct(0.95) / 255;
  const evHi = Math.log2(toLin(0.93) / Math.max(toLin(p95), 1e-6));
  const evMid = Math.log2(toLin(0.62) / Math.max(toLin(p50), 1e-6));
  return Math.max(-1.0, Math.min(4.5, Math.min(evHi, evMid)));
}

/** Perceptual S-curve: 60% linear + 40% smoothstep. Deepens shadows, opens highlights. */
function softenCurve(data) {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    const s = v * v * (3 - 2 * v);
    lut[i] = Math.round((v * 0.6 + s * 0.4) * 255);
  }
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
}

/**
 * flashraw 0.3.1 currently decodes only the top part of very wide frames (a
 * 8256px Z 9 NEF comes back with the lower ~73% as exact zeros). A photo that
 * is genuinely black at the bottom would not have *exact* zero rows below a
 * fully wiped band, so use that signature to fall back to the camera JPEG that
 * the RAW carries instead of showing a half-black image.
 */
function decodeLooksTruncated(data, width, height) {
  const bands = 32;
  if (height < bands * 8) return false;
  const means = new Float32Array(bands);
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
    means[b] = s / Math.max(1, n);
    if (means[b] > 4) lastContent = b;
  }
  if (lastContent < 0 || lastContent > bands - 6) return false;
  for (let b = lastContent + 1; b < bands; b++) if (means[b] !== 0) return false;
  return true;
}

self.onmessage = async (event) => {
  const { id, buffer } = event.data;
  try {
    const frame = await decodeRaw(buffer, {
      output: 'rgba8',       // display-ready sRGB, orientation applied
      demosaic: 'auto',      // AHD on Bayer sensors
      whiteBalance: 'as-shot',
      highlights: 'blend',   // keeps colour in partly clipped highlights
    });
    const imageData = frame.toImageData();
    if (decodeLooksTruncated(imageData.data, imageData.width, imageData.height)) {
      frame.free?.();
      const err = new Error('RAW decoder returned a truncated frame');
      err.kind = 'IncompleteDecode';
      throw err;
    }
    // A neutral linear render is correct but reads flat next to what a camera or
    // Apple's RAW pipeline produces: measured against the same NEF rendered by
    // sips, the neutral version had its midtones bunched up (25/50/75th
    // percentile luminance 0.15/0.22/0.42 versus 0.04/0.09/0.29). A gentle
    // S-curve gives the frame the shoulders and depth of a finished photo before
    // any LUT is applied; the tone panel is still there to push it further.
    softenCurve(imageData.data);

    // Camera label for the UI only — never let a metadata hiccup fail the decode.
    let model = '';
    try {
      const meta = await readMetadata(buffer);
      const make = (meta?.camera?.make || '').trim();
      const name = (meta?.camera?.model || '').trim();
      const brand = make.split(/\s+/)[0] || '';
      model = name && brand && !name.toUpperCase().includes(brand.toUpperCase()) ? `${make} ${name}` : name || make;
    } catch { /* optional */ }

    const exposureEV = autoExposureEV(imageData.data);
    const bitmap = await createImageBitmap(imageData);
    frame.free?.();
    self.postMessage(
      { id, ok: true, bitmap, width: imageData.width, height: imageData.height, model, exposureEV },
      [bitmap],
    );
  } catch (err) {
    self.postMessage({ id, ok: false, kind: err?.kind || null, message: String(err?.message || err) });
  }
};
