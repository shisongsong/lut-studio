/** Parse a .cube LUT (1D or 3D) into the RGBA byte layout WebGL wants. */
export function parseCube(text) {
  const lines = String(text).split(/\r?\n/);
  let size = 0;
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];
  const values = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith('TITLE')) continue;
    if (upper.startsWith('LUT_3D_SIZE')) {
      size = Number(line.split(/\s+/)[1]);
      continue;
    }
    if (upper.startsWith('LUT_1D_SIZE')) {
      throw new Error('只支持 3D LUT（LUT_3D_SIZE）');
    }
    if (upper.startsWith('DOMAIN_MIN')) {
      domainMin = line.split(/\s+/).slice(1, 4).map(Number);
      continue;
    }
    if (upper.startsWith('DOMAIN_MAX')) {
      domainMax = line.split(/\s+/).slice(1, 4).map(Number);
      continue;
    }
    if (/^[-+]?[\d.]/.test(line)) {
      const parts = line.split(/\s+/);
      if (parts.length < 3) continue;
      values.push(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    }
  }

  if (!size || size < 2 || size > 65) throw new Error('LUT 尺寸无效');
  if (values.length !== size * size * size * 3) {
    throw new Error(`LUT 数据行数不对（${values.length / 3} / ${size ** 3}）`);
  }

  const data = new Uint8Array(size * size * size * 4);
  const scale = domainMax.map((max, i) => 1 / Math.max(1e-6, max - domainMin[i]));
  for (let i = 0, o = 0; i < values.length; i += 3, o += 4) {
    const r = (values[i] - domainMin[0]) * scale[0];
    const g = (values[i + 1] - domainMin[1]) * scale[1];
    const b = (values[i + 2] - domainMin[2]) * scale[2];
    data[o] = toByte(r);
    data[o + 1] = toByte(g);
    data[o + 2] = toByte(b);
    data[o + 3] = 255;
  }
  return { size, data };
}

function toByte(v) {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/** Minimal thumbnail-friendly summary for debugging. */
export function cubeTitle(text) {
  const m = /TITLE\s+"([^"]+)"/i.exec(String(text).slice(0, 400));
  return m ? m[1] : '';
}
