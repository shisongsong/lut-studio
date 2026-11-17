/**
 * RAW development, off the main thread.
 *
 * Runs flashraw (WASM) in a module worker so a 26 MP decode does not freeze the
 * page, and hands the result back as a transferable ImageBitmap.
 */
import { decodeRaw, readMetadata } from '/vendor/flashraw/browser.js';

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

    const bitmap = await createImageBitmap(imageData);
    frame.free?.();
    self.postMessage(
      { id, ok: true, bitmap, width: imageData.width, height: imageData.height, model },
      [bitmap],
    );
  } catch (err) {
    self.postMessage({ id, ok: false, kind: err?.kind || null, message: String(err?.message || err) });
  }
};
