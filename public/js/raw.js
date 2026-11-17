/**
 * RAW support.
 *
 * Two paths, tried in this order:
 *
 * 1. `developRaw()` — real RAW development. A WebAssembly build of LibRaw
 *    (libraw-wasm, loaded lazily, ~1.4 MB) demosaics the sensor data in a Web
 *    Worker with the camera's white balance and colour matrix, and hands back a
 *    full-resolution RGB frame. This is the same class of pipeline the camera
 *    maker's own software runs, and it is what a LUT should be applied to.
 *
 * 2. `extractRawPreview()` — fallback. Some NEFs use Nikon's HE/HE* (TicoRAW)
 *    compression, which LibRaw cannot unpack; those files still carry a
 *    ready-made camera JPEG, so we pull that out instead. The result is a camera
 *    JPEG, not a RAW development.
 */

function findJpegSpans(bytes) {
  const spans = [];
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8 || bytes[i + 2] !== 0xff) continue;
    const end = findEoi(bytes, i + 2);
    if (end < 0) continue;
    spans.push({ start: i, end });
    i = end - 1;
  }
  return spans;
}

function findEoi(bytes, from) {
  for (let i = from; i + 1 < bytes.length; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return i + 2;
  }
  return -1;
}

/**
 * @param {ArrayBuffer} buffer raw file bytes
 * @returns {Promise<{blob: Blob, width: number, height: number, bitmap: ImageBitmap} | null>}
 */
export async function extractRawPreview(buffer) {
  const bytes = new Uint8Array(buffer);
  const spans = findJpegSpans(bytes)
    .map((s) => ({ ...s, size: s.end - s.start }))
    .filter((s) => s.size > 100 * 1024)
    .sort((a, b) => b.size - a.size)
    .slice(0, 4);

  for (const span of spans) {
    const blob = new Blob([bytes.subarray(span.start, span.end)], { type: 'image/jpeg' });
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { blob, width: bitmap.width, height: bitmap.height, bitmap };
    } catch {
      // not a decodable JPEG (thumbnail stub, EXIF preview…) — try the next one
    }
  }
  return null;
}

// The decoder is a ~1.4 MB WASM payload. Most visitors never open a RAW file,
// so it is only fetched the first time one is dropped in.
let librawModule = null;
function loadLibRaw() {
  librawModule ||= import('/vendor/libraw/index.js')
    .then((m) => m.default)
    .catch((err) => { librawModule = null; throw err; });
  return librawModule;
}

/**
 * Develop a RAW file into a full-resolution RGB canvas.
 *
 * Camera white balance is used (the shot as the photographer framed it), output
 * is sRGB at 8 bits — the LUT pipeline downstream is 8-bit anyway — and AHD
 * demosaicing, which is the quality/speed sweet spot.
 *
 * @param {ArrayBuffer} buffer raw file bytes
 * @returns {Promise<{canvas: HTMLCanvasElement, width: number, height: number, model: string, ms: number}>}
 */
export async function developRaw(buffer) {
  const started = performance.now();
  const LibRaw = await loadLibRaw();
  const raw = new LibRaw();
  try {
    // postMessage transfers the buffer to the worker, which detaches it here —
    // hand over a copy so the caller can still fall back to the embedded JPEG.
    await raw.open(new Uint8Array(buffer.slice(0)), {
      useCameraWb: true,
      outputColor: 1, // sRGB
      outputBps: 8,
      userQual: 3, // AHD
    });
    const meta = await raw.metadata();
    const img = await raw.imageData();
    if (!img || !img.width || !img.height) throw new Error('RAW decode produced no image');

    const pixels = img.data.constructor === Uint16Array ? to8Bit(img.data) : img.data;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    const frame = ctx.createImageData(img.width, img.height);
    for (let i = 0, j = 0, n = img.width * img.height; i < n; i++, j += 3) {
      const k = i * 4;
      frame.data[k] = pixels[j];
      frame.data[k + 1] = pixels[j + 1];
      frame.data[k + 2] = pixels[j + 2];
      frame.data[k + 3] = 255;
    }
    ctx.putImageData(frame, 0, 0);

    return {
      canvas,
      width: img.width,
      height: img.height,
      model: [meta?.camera_make, meta?.camera_model].filter(Boolean).join(' ').trim(),
      ms: Math.round(performance.now() - started),
    };
  } finally {
    raw.dispose();
  }
}

function to8Bit(src) {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] / 257;
  return out;
}
