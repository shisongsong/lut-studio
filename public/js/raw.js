/**
 * Pull the camera's embedded JPEG preview out of a RAW file.
 *
 * Browsers cannot decode RAW (NEF, CR2, ARW, DNG, RAF…): those files hold a
 * colour-filter-array mosaic plus camera metadata, and turning that into an
 * image needs demosaicing, white balance and a camera colour matrix — a whole
 * RAW pipeline. Almost every camera, however, stores a ready-made JPEG preview
 * inside the file (Nikon Z50 II: a full 5568×3712 frame), and that is what we
 * extract here, in the browser, with no upload and no extra dependencies.
 *
 * The result is the camera JPEG, not a RAW development: highlight recovery and
 * white-balance re-processing are not possible from these bytes.
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
 * @returns {Promise<{blob: Blob, width: number, height: number} | null>}
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
