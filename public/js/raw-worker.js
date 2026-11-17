/**
 * RAW development, off the main thread.
 *
 * Runs flashraw (WASM) in a module worker so a 26 MP decode does not freeze the
 * page, and hands the result back as a transferable ImageBitmap.
 */
import { decodeRaw, readMetadata } from '/vendor/flashraw/browser.js';

/**
 * How many stops this frame is off a neutral exposure.
 *
 * Percentile based, like dcraw's auto-bright but gentler: the top of the
 * histogram is pushed towards white, and a frame whose midtones sit far below
 * middle grey gets lifted even when a small specular keeps the top end up.
 * Deliberately brightness only — no colour, saturation or white balance.
 */
function autoExposureEV(data) {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * 7) {
    const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) | 0;
    hist[l > 255 ? 255 : l]++;
    n++;
  }
  let acc = 0, p50 = 0, p995 = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (!p50 && acc >= n * 0.5) p50 = v;
    if (acc >= n * 0.995) { p995 = v; break; }
  }
  const toLin = (s) => (s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4));
  const hi = toLin(p995 / 255), mid = toLin(p50 / 255);
  const evHi = Math.log2(toLin(0.92) / Math.max(hi, 1e-5));
  const evMid = Math.log2(toLin(0.48) / Math.max(mid, 1e-5));
  let ev = evHi;
  if (p50 / 255 < 0.20) ev = Math.max(evHi, Math.min(evMid, 2.0));
  return Math.max(-0.8, Math.min(2.0, ev));
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
