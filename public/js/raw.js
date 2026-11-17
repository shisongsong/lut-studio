/**
 * RAW support.
 *
 * A WebAssembly build of [flashraw](https://github.com/ybouane/flashraw) does the
 * whole RAW pipeline in the browser, in a Web Worker: unpack (including Nikon
 * HE/HE* / TicoRAW), demosaic (AHD on Bayer sensors), camera white balance, the
 * camera colour matrix, highlight handling, and the sRGB encode. What comes back
 * is display-ready RGBA at full sensor resolution — exactly what a LUT should be
 * applied to.
 *
 * The decoder is a ~3.4 MB WASM payload that is only fetched the first time a RAW
 * file is opened. If it cannot decode the file (an exotic or damaged file), the
 * caller falls back to the camera JPEG embedded in the RAW via
 * `extractRawPreview()`.
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

/**
 * Thrown when the RAW file is understood but cannot be developed — an unsupported
 * compression, a truncated file, an exotic sensor layout. The caller falls back
 * to the embedded JPEG preview.
 */
export class RawUnsupported extends Error {
  /** @param {'compression'|'corrupt'|'decode'} reason */
  constructor(reason, cause) {
    super(reason, cause ? { cause } : undefined);
    this.reason = reason;
  }
}

let rawWorker = null;
let nextId = 0;
const pending = new Map();

function getWorker() {
  if (rawWorker) return rawWorker;
  rawWorker = new Worker('/js/raw-worker.js', { type: 'module' });
  rawWorker.onmessage = ({ data }) => {
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    if (data.ok) job.resolve(data);
    else {
      const kind = data.kind;
      job.reject(new RawUnsupported(
        kind === 'UnsupportedCompression' || kind === 'CameraUnsupported' ? 'compression'
          : kind === 'CorruptFile' ? 'corrupt'
            : kind === 'IncompleteDecode' ? 'incomplete'
              : 'decode',
        new Error(data.message),
      ));
    }
  };
  rawWorker.onerror = (event) => {
    for (const job of pending.values()) job.reject(event);
    pending.clear();
    rawWorker = null;
  };
  return rawWorker;
}

/**
 * Develop a RAW file into a full-resolution RGB image, in a worker.
 *
 * @param {ArrayBuffer} buffer raw file bytes (kept intact — a copy goes to the worker)
 * @returns {Promise<{bitmap: ImageBitmap, width: number, height: number, model: string, exposureEV: number, ms: number}>}
 */
export function developRaw(buffer) {
  const started = performance.now();
  const id = ++nextId;
  const copy = buffer.slice(0);
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve: (data) => resolve({
        bitmap: data.bitmap,
        width: data.width,
        height: data.height,
        model: data.model,
        exposureEV: data.exposureEV || 0,
        ms: Math.round(performance.now() - started),
      }),
      reject,
    });
    getWorker().postMessage({ id, buffer: copy }, [copy]);
  });
}
