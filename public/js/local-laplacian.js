/**
 * Fast Local Laplacian tone remap in log-luminance (EV) space.
 *
 * This is an independent implementation of the published fast LLF construction:
 * uniformly sample the guide-intensity axis, build a Laplacian pyramid for each
 * monotone remap, interpolate the pyramid coefficients with tent weights, then
 * collapse. It runs on a small full-frame EV guide; the returned EV delta can be
 * applied to full-resolution RGB as a luminance ratio.
 *
 * References: Paris, Hasinoff & Kautz, SIGGRAPH 2011; Aubry et al., SIGGRAPH
 * Asia 2014. No reference implementation code is copied.
 */
export const LOCAL_LAPLACIAN = Object.freeze({
  minEV: -10,
  maxEV: 12,
  samples: 12,
  maxLevels: 8,
  minCoarseSize: 8,
  coreSigmaEV: 1.32,
  transitionEV: 9.0,
  shadowPivotEV: -1.5,
  shadowFullEV: -8,
  highlightStartEV: 0.5,
  highlightFullEV: 7,
  shadowLiftStops: 3.5,
  shadowLowerStops: 2.5,
  highlightRecoverStops: 3.0,
  highlightLiftStops: 1.2,
});

const KERNEL = [1 / 8, 3 / 8, 3 / 8, 1 / 8];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function normalizedSlider(value) {
  return clamp(Number(value) || 0, -100, 100) / 100;
}

/** Bounded, smooth exposure offset for one sampled guide intensity. */
export function localToneOffset(referenceEV, { shadows = 0, highlights = 0 } = {}) {
  const sh = normalizedSlider(shadows);
  const hi = normalizedSlider(highlights);
  const shadowZone = 1 - smoothstep(LOCAL_LAPLACIAN.shadowFullEV, LOCAL_LAPLACIAN.shadowPivotEV, referenceEV);
  const highlightZone = smoothstep(LOCAL_LAPLACIAN.highlightStartEV, LOCAL_LAPLACIAN.highlightFullEV, referenceEV);
  const shadowStops = sh >= 0
    ? sh * LOCAL_LAPLACIAN.shadowLiftStops
    : sh * LOCAL_LAPLACIAN.shadowLowerStops;
  const highlightStops = hi <= 0
    ? hi * LOCAL_LAPLACIAN.highlightRecoverStops
    : hi * LOCAL_LAPLACIAN.highlightLiftStops;
  return shadowStops * shadowZone + highlightStops * highlightZone;
}

function localInfluence(valueEV, referenceEV) {
  const distance = Math.abs(valueEV - referenceEV);
  const sigma = LOCAL_LAPLACIAN.coreSigmaEV;
  if (distance <= sigma) return 1;
  if (distance >= sigma + LOCAL_LAPLACIAN.transitionEV) return 0;
  return 1 - smoothstep(sigma, sigma + LOCAL_LAPLACIAN.transitionEV, distance);
}

/**
 * A constant exposure shift in the local core preserves fine texture; the
 * smooth return to identity is wide enough that every sampled remap stays
 * monotone at the full slider range.
 */
export function localLaplacianRemap(valueEV, referenceEV, controls = {}) {
  return valueEV + localToneOffset(referenceEV, controls) * localInfluence(valueEV, referenceEV);
}

function downsample4(src, width, height) {
  const outW = Math.max(1, Math.ceil(width / 2));
  const outH = Math.max(1, Math.ceil(height / 2));
  const out = new Float32Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    const cy = y * 2;
    for (let x = 0; x < outW; x++) {
      const cx = x * 2;
      let sum = 0;
      for (let ky = 0; ky < 4; ky++) {
        const sy = clamp(cy + ky - 1, 0, height - 1);
        const wy = KERNEL[ky];
        for (let kx = 0; kx < 4; kx++) {
          const sx = clamp(cx + kx - 1, 0, width - 1);
          sum += src[sy * width + sx] * wy * KERNEL[kx];
        }
      }
      out[y * outW + x] = sum;
    }
  }
  return { data: out, width: outW, height: outH };
}

function sampleLinear(src, width, height, x, y) {
  const px = clamp(x, 0, width - 1);
  const py = clamp(y, 0, height - 1);
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const tx = px - x0, ty = py - y0;
  const a = src[y0 * width + x0] * (1 - tx) + src[y0 * width + x1] * tx;
  const b = src[y1 * width + x0] * (1 - tx) + src[y1 * width + x1] * tx;
  return a * (1 - ty) + b * ty;
}

function upsampleLinear(src, srcW, srcH, outW, outH) {
  const out = new Float32Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    // The 4-tap downsampler's sample centers sit halfway between even pixels.
    const sy = (y - 0.5) * 0.5;
    for (let x = 0; x < outW; x++) {
      const sx = (x - 0.5) * 0.5;
      out[y * outW + x] = sampleLinear(src, srcW, srcH, sx, sy);
    }
  }
  return out;
}

function gaussianPyramid(data, width, height, maxLevels) {
  const pyramid = [{ data, width, height }];
  while (pyramid.length < maxLevels) {
    const prev = pyramid[pyramid.length - 1];
    if (Math.min(prev.width, prev.height) <= LOCAL_LAPLACIAN.minCoarseSize) break;
    pyramid.push(downsample4(prev.data, prev.width, prev.height));
  }
  return pyramid;
}

function laplacianPyramid(gaussian) {
  const laplacian = new Array(gaussian.length);
  for (let level = 0; level < gaussian.length - 1; level++) {
    const cur = gaussian[level], coarse = gaussian[level + 1];
    const up = upsampleLinear(coarse.data, coarse.width, coarse.height, cur.width, cur.height);
    const band = new Float32Array(cur.data.length);
    for (let i = 0; i < band.length; i++) band[i] = cur.data[i] - up[i];
    laplacian[level] = { data: band, width: cur.width, height: cur.height };
  }
  laplacian[gaussian.length - 1] = gaussian[gaussian.length - 1];
  return laplacian;
}

/**
 * Return a per-pixel EV correction for a full-frame low-resolution EV guide.
 * Inputs are scene log-luminance values log2(Y / 0.18); output is O - I in EV.
 */
export function fastLocalLaplacianEV(inputEV, width, height, controls = {}, options = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('width and height must be positive integers');
  }
  if (!inputEV || inputEV.length !== width * height) throw new RangeError('EV map size does not match dimensions');
  const shadows = normalizedSlider(controls.shadows) * 100;
  const highlights = normalizedSlider(controls.highlights) * 100;
  const output = new Float32Array(width * height);
  if (shadows === 0 && highlights === 0) return output;

  const minEV = LOCAL_LAPLACIAN.minEV;
  const maxEV = LOCAL_LAPLACIAN.maxEV;
  const sampleCount = Math.max(2, Math.floor(options.samples || LOCAL_LAPLACIAN.samples));
  const maxLevels = Math.max(1, Math.floor(options.levels || LOCAL_LAPLACIAN.maxLevels));
  const spacing = (maxEV - minEV) / (sampleCount - 1);
  const tone = { shadows, highlights };
  const zeroPosition = clamp((0 - minEV) / spacing, 0, sampleCount - 1);
  let zeroResponse = 0;
  for (let sample = 0; sample < sampleCount; sample++) {
    const referenceEV = minEV + sample * spacing;
    const tent = Math.max(0, 1 - Math.abs(zeroPosition - sample));
    zeroResponse += localLaplacianRemap(0, referenceEV, tone) * tent;
  }
  const source = new Float32Array(inputEV.length);
  for (let i = 0; i < source.length; i++) source[i] = clamp(inputEV[i], minEV, maxEV);
  const sourcePyramid = gaussianPyramid(source, width, height, maxLevels);
  const accum = sourcePyramid.map((level) => new Float32Array(level.data.length));

  for (let sample = 0; sample < sampleCount; sample++) {
    const referenceEV = minEV + sample * spacing;
    const remapped = new Float32Array(source.length);
    for (let i = 0; i < source.length; i++) {
      remapped[i] = localLaplacianRemap(source[i], referenceEV, tone);
    }
    const laplacian = laplacianPyramid(gaussianPyramid(remapped, width, height, sourcePyramid.length));

    for (let level = 0; level < sourcePyramid.length; level++) {
      const guide = sourcePyramid[level].data;
      const band = laplacian[level].data;
      const dst = accum[level];
      for (let i = 0; i < guide.length; i++) {
        const position = clamp((guide[i] - minEV) / spacing, 0, sampleCount - 1);
        const tent = Math.max(0, 1 - Math.abs(position - sample));
        dst[i] += band[i] * tent;
      }
    }
  }

  let reconstructed = accum[accum.length - 1];
  for (let level = accum.length - 2; level >= 0; level--) {
    const base = sourcePyramid[level];
    const coarse = sourcePyramid[level + 1];
    const up = upsampleLinear(reconstructed, coarse.width, coarse.height, base.width, base.height);
    const detail = accum[level];
    const next = new Float32Array(detail.length);
    for (let i = 0; i < next.length; i++) next[i] = up[i] + detail[i];
    reconstructed = next;
  }

  for (let i = 0; i < output.length; i++) output[i] = reconstructed[i] - source[i] - zeroResponse;
  return output;
}
