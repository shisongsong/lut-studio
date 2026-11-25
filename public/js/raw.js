/**
 * RAW support.
 *
 * A WebAssembly build of [flashraw](https://github.com/ybouane/flashraw) unpacks
 * and demosaics RAW files in a Web Worker, applying as-shot white balance and the
 * camera colour matrix. The normal worker result is 16-bit RGB with an extended
 * white point, converted to scene-linear half floats with highlight headroom;
 * the WebGL renderer applies the display transform before any LUT. If the linear
 * path is unavailable, the worker can return a display-ready 8-bit frame. If RAW
 * development itself fails, the caller falls back to the camera JPEG embedded in
 * the file via `extractRawPreview()`.
 *
 * The decoder is a ~3.4 MB WASM payload that is only fetched the first time a RAW
 * file is opened.
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
export async function extractRawPreview(buffer, maxWidth = 0) {
  const bytes = new Uint8Array(buffer);
  const spans = findJpegSpans(bytes)
    .map((s) => ({ ...s, size: s.end - s.start }))
    .filter((s) => s.size > 100 * 1024)
    .sort((a, b) => b.size - a.size)
    .slice(0, 4);

  for (const span of spans) {
    const blob = new Blob([bytes.subarray(span.start, span.end)], { type: 'image/jpeg' });
    // A histogram reference only needs a small decode; asking createImageBitmap to
    // resize avoids holding a 20 MP JPEG in memory on phones.
    const scaled = maxWidth > 0 ? { resizeWidth: maxWidth, resizeQuality: 'medium' } : {};
    try {
      let bitmap;
      try {
        bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image', ...scaled });
      } catch {
        bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      }
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
 * Develop a RAW file, in a worker.
 *
 * The normal result is scene-linear 16-bit data with highlight headroom:
 * `{ linear: true, data, preview, guide: { data, evMap, w, h }, ... }` for the
 * GPU path. `guide.evMap` is the downscaled unblurred scene-EV map used by the
 * Local Laplacian worker. If linear decode cannot run, the worker falls back to
 * a display-ready 8-bit `bitmap` so the photo still opens.
 *
 * @param {ArrayBuffer} buffer raw file bytes (kept intact — a copy goes to the worker)
 * @returns {Promise<{linear:boolean, data?:Uint16Array, preview?:object, guide?:object,
 *   bitmap?:ImageBitmap, width:number, height:number, model:string,
 *   exposureEV:number, ms:number}>}
 */
export function developRaw(buffer) {
  const started = performance.now();
  const id = ++nextId;
  const copy = buffer.slice(0);
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve: (data) => resolve({
        linear: !!data.linear,
        data: data.full || null,
        preview: data.preview || null,
        guide: data.guide || null,
        bitmap: data.bitmap || null,
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
