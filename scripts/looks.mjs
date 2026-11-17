/**
 * Colour grade recipes for the built-in LUT pack.
 *
 * Every look is generated from the maths below — no third-party LUT data is
 * copied or resampled. `scripts/build-luts.mjs` bakes them into
 * `public/luts.bin` (17^3 RGBA per look, in the order of `public/js/looks.js`).
 *
 * Input/output are gamma-space RGB in 0..1, which is what a `.cube` file stores
 * and what the WebGL shader samples. Recipes are deliberately restrained: the
 * strength slider mixes them with the original photo.
 */

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const mix = (a, b, t) => a + (b - a) * t;
const contrast = (v, k) => clamp01((v - 0.5) * k + 0.5);
const lift = (v, l) => clamp01(v * (1 - l) + l);
const gain = (v, g) => clamp01(v * g);
const gamma = (v, g) => clamp01(Math.pow(Math.max(0, v), g));
const sat = (r, g, b, s) => {
  const l = luma(r, g, b);
  return [mix(l, r, s), mix(l, g, s), mix(l, b, s)];
};
const tint = (r, g, b, sr, sg, sb) => {
  const l = luma(r, g, b);
  const shadow = Math.pow(1 - l, 2);
  const high = Math.pow(l, 2);
  return [r + sr * shadow, g + sg * shadow, b + sb * shadow];
};

/* 品牌风格用的少量扩展 helper（阴影/高光分身、柔肩、平滑 S 曲线） */
const splitTone = (r, g, b, sh, hi) => {
  const l = luma(r, g, b);
  const ws = Math.pow(1 - l, 2);
  const wh = Math.pow(l, 2);
  return [
    r + sh[0] * ws + hi[0] * wh,
    g + sh[1] * ws + hi[1] * wh,
    b + sh[2] * ws + hi[2] * wh,
  ];
};
/** 高光肩部：knee 以上平滑压缩，避免死白；amount 0..0.4。 */
const shoulder = (v, knee = 0.72, amount = 0.2) => {
  const x = clamp01(v);
  if (x <= knee) return x;
  const t = (x - knee) / (1 - knee);
  return clamp01(knee + (1 - knee) * (t - amount * t * t));
};
/** 平滑 S 曲线：两端不动，中间分离度更高，比线性 contrast 更柔。 */
const scurve = (v, k = 0.18) => clamp01(v + k * (v - 0.5) * (1 - Math.abs(2 * v - 1)));

/* ------------------------------------------------------------------------- *
 * Hue-selective colour stage
 *
 * Per-channel curves move contrast and cast, but they cannot do what a real film
 * emulation does: treat one part of the colour wheel differently from another.
 * ETERNA mutes greens and cyans while leaving skin alone; Classic Chrome pushes
 * blues toward cyan and pulls the saturation out of foliage. That needs an HSL
 * round-trip with smooth, overlapping hue lobes — which is exactly what a 3D LUT
 * can carry and what plain curves cannot.
 * ------------------------------------------------------------------------- */

function rgb2hsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hsl2rgb(h, s, l) {
  if (s <= 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const chan = (t) => {
    t = (t % 1 + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [chan(h + 1 / 3), chan(h), chan(h - 1 / 3)];
}

/** Smooth 0..1 weight around a hue, zero beyond `width` (fraction of the wheel). */
function hueLobe(h, center, width) {
  let d = Math.abs(h - center) % 1;
  if (d > 0.5) d = 1 - d;
  if (d >= width) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * d) / width));
}

/**
 * Apply a hue-selective colour character on top of the per-channel curve.
 *
 * @param {number[]} rgb gamma-space 0..1
 * @param {{shifts?: Array<{h:number,w:number,dh?:number,ds?:number,dl?:number}>,
 *          vib?: number, split?: {sh:number[],hi:number[]}, protectSkin?: boolean}} color
 */
export function applyColor(rgb, color) {
  if (!color) return rgb;
  let [r, g, b] = [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];

  if (color.vib && color.vib !== 1) {
    const [h, s, l] = rgb2hsl(r, g, b);
    // Vibrance: the duller a pixel is, the more it moves; vivid pixels barely budge.
    const w = 1 - 0.7 * Math.min(1, Math.abs(s - 0.3) / 0.7);
    [r, g, b] = hsl2rgb(h, clamp01(s * (1 + (color.vib - 1) * w)), l);
  }

  if (color.shifts && color.shifts.length) {
    let [h, s, l] = rgb2hsl(r, g, b);
    for (const sh of color.shifts) {
      const k = hueLobe(h, sh.h, sh.w ?? 0.12);
      if (!k) continue;
      if (sh.dh) h = (h + sh.dh * k + 1) % 1;
      if (sh.ds) s = clamp01(s * (1 + (sh.ds - 1) * k));
      if (sh.dl) l = clamp01(l + sh.dl * k);
    }
    if (color.protectSkin) {
      // Keep the orange band from drifting and from over-saturating.
      const k = hueLobe(h, 0.07, 0.09);
      s = clamp01(mix(s, Math.min(s, 0.60), 0.55 * k));
      h = mix(h, 0.07, 0.35 * k);
    }
    [r, g, b] = hsl2rgb(h, s, l);
  }

  if (color.split) {
    const sh = color.split.sh || [0, 0, 0];
    const hi = color.split.hi || [0, 0, 0];
    const l = luma(r, g, b);
    const ws = Math.pow(1 - l, 2), wh = Math.pow(l, 2);
    r = clamp01(r + sh[0] * ws + hi[0] * wh);
    g = clamp01(g + sh[1] * ws + hi[1] * wh);
    b = clamp01(b + sh[2] * ws + hi[2] * wh);
  }
  return [r, g, b];
}

/* ------------------------------------------------------------------------- *
 * Finishing stage
 *
 * Measured against a real film emulation on the same test colours, the recipes
 * above came out systematically wrong in three ways: blacks lifted to 0.04-0.06
 * (milky), no highlight shoulder at all (1.0 in stayed 0.97-1.0 out, flat
 * whites), and saturation below 1 (grey). The Fuji F-Log→ETERNA cube, measured
 * through the same harness, does the opposite: black 0.007, 1.0 lands at 0.835,
 * and saturated colours come out 33% more saturated than they went in.
 *
 * This stage puts every look on that footing, so the per-look recipes only have
 * to describe their character, not fight a milky base.
 * ------------------------------------------------------------------------- */
const FINISH = { black: 0.035, knee: 0.62, rolloff: 0.88, sat: 1.70 };

function finishChannel(v, k) {
  const x = clamp01((v - k.black) / (1 - k.black));
  if (x <= k.knee) return x;
  const t = (x - k.knee) / (1 - k.knee);
  const amount = (1 - k.rolloff) / (1 - k.knee);
  return clamp01(k.knee + (1 - k.knee) * (t - amount * t * t));
}

/** The full recipe: per-channel curve, hue-selective character, then the filmic finish. */
export function gradeLook(look, rgb) {
  const out = applyColor(look.fn(rgb), look.color);
  const k = look.finish ? { ...FINISH, ...look.finish } : FINISH;
  const c = out.map((v) => finishChannel(v, k));
  return sat(c[0], c[1], c[2], k.sat);
}

/* Named colour characters. Each one is a deliberate answer to "what should this
 * look do to greens / blues / skin / shadows", not a random tweak. */
const C = {
  // Fuji ETERNA: greens and cyans pulled down and cooled, blues dense, skin
  // untouched, gentle warm highlights. Measured against the real cube, the
  // character is "cool hues darker and denser, warm hues left alone".
  eterna: {
    shifts: [
      { h: 0.30, w: 0.16, ds: 0.90, dl: -0.06 },
      { h: 0.50, w: 0.15, ds: 0.95, dl: -0.07 },
      { h: 0.66, w: 0.14, ds: 1.10, dl: -0.09, dh: -0.010 },
      // The reference pushes violet toward magenta and darkens it: that is what
      // gives a film sky its dense, slightly purple blue instead of a flat one.
      { h: 0.75, w: 0.13, dh: 0.075, dl: -0.10 },
      { h: 0.88, w: 0.10, dh: 0.050, ds: 1.15 },
    ],
    vib: 1.02, protectSkin: true,
    split: { sh: [0.004, 0.010, 0.008], hi: [0.012, 0.006, -0.004] },
  },
  // Fuji Classic Chrome: desaturated foliage, deeper reds, blues pulled to cyan.
  classicChrome: {
    shifts: [
      { h: 0.33, w: 0.14, ds: 0.80, dl: -0.04 },
      { h: 0.50, w: 0.12, ds: 0.95, dl: -0.06 },
      { h: 0.63, w: 0.14, ds: 1.00, dh: 0.012, dl: -0.05 },
      { h: 0.99, w: 0.10, ds: 1.00, dl: -0.010 },
    ],
    vib: 1.00, protectSkin: true,
    split: { sh: [0.004, 0.005, 0.010], hi: [0.008, 0.004, -0.004] },
  },
  provia: {
    shifts: [
      { h: 0.32, w: 0.12, ds: 1.10, dh: -0.006 },
      { h: 0.63, w: 0.12, ds: 1.12 },
    ],
    vib: 1.14, protectSkin: true,
  },
  portra: {
    shifts: [
      { h: 0.31, w: 0.15, ds: 0.95, dh: 0.010 },
      { h: 0.62, w: 0.12, ds: 1.00 },
    ],
    vib: 1.02, protectSkin: true,
    split: { sh: [0.006, 0.004, 0.002], hi: [0.014, 0.008, 0.000] },
  },
  tealOrange: {
    shifts: [
      { h: 0.55, w: 0.14, dh: -0.018, ds: 1.05, dl: -0.05 },
      { h: 0.06, w: 0.09, ds: 1.08 },
    ],
    vib: 1.02, protectSkin: true,
    split: { sh: [-0.006, 0.004, 0.014], hi: [0.016, 0.006, -0.006] },
  },
  leica: {
    shifts: [
      { h: 0.33, w: 0.12, ds: 1.08, dl: -0.03 },
      { h: 0.62, w: 0.12, ds: 1.08 },
    ],
    vib: 1.10, protectSkin: true,
  },
  hasselblad: {
    shifts: [
      { h: 0.30, w: 0.12, ds: 1.00 },
      { h: 0.60, w: 0.12, ds: 1.02 },
    ],
    vib: 1.06, protectSkin: true,
  },
  vintage: {
    shifts: [
      { h: 0.33, w: 0.15, ds: 0.88, dl: -0.03 },
      { h: 0.60, w: 0.14, ds: 0.92 },
    ],
    vib: 0.95, protectSkin: true,
    split: { sh: [0.010, 0.006, 0.000], hi: [0.012, 0.008, -0.004] },
  },
  airy: {
    shifts: [
      { h: 0.33, w: 0.14, ds: 0.95 },
      { h: 0.58, w: 0.12, ds: 0.96 },
    ],
    vib: 0.98, protectSkin: true,
    split: { sh: [0.004, 0.006, 0.008], hi: [0.010, 0.008, 0.004] },
  },
  cool: {
    shifts: [
      { h: 0.58, w: 0.14, ds: 1.06, dh: -0.006, dl: -0.04 },
      { h: 0.33, w: 0.12, ds: 0.96 },
    ],
    vib: 1.02,
    split: { sh: [0.000, 0.006, 0.014], hi: [0.006, 0.006, 0.004] },
  },
  noir: {
    shifts: [
      { h: 0.33, w: 0.16, ds: 0.70, dl: -0.04 },
      { h: 0.58, w: 0.16, ds: 0.92, dl: -0.05 },
      { h: 0.06, w: 0.10, ds: 0.92 },
    ],
    vib: 0.90, protectSkin: true,
    split: { sh: [-0.008, 0.002, 0.016], hi: [0.006, 0.004, 0.000] },
  },
  bleach: {
    shifts: [
      { h: 0.33, w: 0.18, ds: 0.55 },
      { h: 0.58, w: 0.16, ds: 0.70 },
      { h: 0.06, w: 0.12, ds: 0.78 },
    ],
    vib: 0.80,
    split: { sh: [0.002, 0.004, 0.008], hi: [0.006, 0.006, 0.006] },
  },
  greenNeg: {
    shifts: [
      { h: 0.30, w: 0.16, ds: 0.95, dh: 0.012, dl: -0.03 },
      { h: 0.55, w: 0.14, ds: 0.92, dl: -0.05 },
    ],
    vib: 0.98, protectSkin: true,
    split: { sh: [-0.004, 0.012, 0.002], hi: [0.010, 0.006, -0.006] },
  },
  tungsten: {
    shifts: [
      { h: 0.62, w: 0.13, ds: 1.08, dl: -0.03 },
      { h: 0.33, w: 0.13, ds: 0.96 },
    ],
    vib: 1.04, protectSkin: true,
    split: { sh: [-0.004, 0.004, 0.012], hi: [0.016, 0.008, -0.006] },
  },
};

export const GRADES = [
  {
    id: 'soft-veil', name: '柔光', category: '胶片',
    color: C.vintage,
    fn: ([r, g, b]) => {
      let c = [r, g, b].map((v) => lift(contrast(v, 0.86), 0.045));
      c = sat(c[0], c[1], c[2], 0.90);
      return [c[0] * 1.01, c[1], c[2] * 0.995];
    },
  },
  {
    id: 'film-classic', name: '胶片', category: '胶片',
    color: C.classicChrome,
    fn: ([r, g, b]) => {
      let c = [contrast(r, 1.10), contrast(g, 1.08), contrast(b, 1.04)].map((v) => lift(v, 0.026));
      c = sat(c[0], c[1], c[2], 0.94);
      c = tint(c[0], c[1], c[2], 0.022, 0.006, -0.018);
      return [c[0] * 1.035, c[1], c[2] * 0.975];
    },
  },
  {
    id: 'cinema-teal', name: '电影', category: '电影',
    color: C.tealOrange,
    fn: ([r, g, b]) => {
      let c = [contrast(r, 1.14), contrast(g, 1.12), contrast(b, 1.10)];
      c = sat(c[0], c[1], c[2], 0.88);
      c = tint(c[0], c[1], c[2], -0.050, 0.002, 0.055); // teal shadows
      const l = luma(c[0], c[1], c[2]);
      const high = l * l;
      return [c[0] + 0.060 * high, c[1] + 0.022 * high, c[2] - 0.030 * high]; // warm highlights
    },
  },
  {
    id: 'mono-classic', name: '黑白', category: '黑白',
    fn: ([r, g, b]) => {
      const l = contrast(luma(r, g, b), 1.08);
      return [lift(l, 0.008), lift(l, 0.008), lift(l, 0.008)];
    },
  },
  {
    id: 'mono-contrast', name: '黑白高反差', category: '黑白',
    fn: ([r, g, b]) => {
      const l = clamp01(Math.pow(contrast(luma(r, g, b), 1.22), 1.04));
      return [l, l, l];
    },
  },
  {
    id: 'warm-sun', name: '暖阳', category: '暖调',
    color: C.vintage,
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.085), gain(g, 1.005), gain(b, 0.900)];
      c = sat(c[0], c[1], c[2], 1.12);
      return [contrast(c[0], 1.04), contrast(c[1], 1.02), contrast(c[2], 1.01)];
    },
  },
  {
    id: 'cool-shade', name: '冷调', category: '冷调',
    color: C.cool,
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.925), gain(g, 0.990), gain(b, 1.075)];
      c = sat(c[0], c[1], c[2], 1.02);
      return [contrast(c[0], 1.05), contrast(c[1], 1.05), contrast(c[2], 1.04)];
    },
  },
  {
    id: 'punch', name: '高对比', category: '高对比',
    color: C.provia,
    fn: ([r, g, b]) => {
      let c = [contrast(r, 1.18), contrast(g, 1.18), contrast(b, 1.18)];
      c = sat(c[0], c[1], c[2], 1.04);
      return [lift(c[0], -0.004), lift(c[1], -0.004), lift(c[2], -0.004)];
    },
  },
  {
    id: 'faded-matte', name: '褪色', category: '复古',
    color: C.vintage,
    fn: ([r, g, b]) => {
      let c = [contrast(r, 0.88), contrast(g, 0.88), contrast(b, 0.88)].map((v) => lift(v, 0.068));
      c = sat(c[0], c[1], c[2], 0.70);
      return [c[0] * 1.01, c[1] * 1.0, c[2] * 0.995];
    },
  },
  {
    id: 'airy-day', name: '日系', category: '空气感',
    color: C.airy,
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.04), gain(g, 1.055), gain(b, 1.03)].map((v) => lift(v, 0.03));
      c = [contrast(c[0], 0.92), contrast(c[1], 0.92), contrast(c[2], 0.92)];
      c = sat(c[0], c[1], c[2], 0.94);
      return [c[0], c[1] + 0.006, c[2] + 0.008];
    },
  },
  {
    id: 'vintage-70', name: '复古', category: '复古',
    color: C.vintage,
    fn: ([r, g, b]) => {
      const l = luma(r, g, b);
      let c = [mix(r, l * 1.08 + 0.03, 0.35), mix(g, l * 1.0 + 0.02, 0.3), mix(b, l * 0.86 + 0.01, 0.35)];
      c = [contrast(c[0], 0.96), contrast(c[1], 0.96), contrast(c[2], 0.96)].map((v) => lift(v, 0.035));
      return [c[0], c[1], c[2]];
    },
  },
  {
    id: 'haze-dream', name: '空气感', category: '空气感',
    color: C.airy,
    fn: ([r, g, b]) => {
      let c = [lift(r, 0.050), lift(g, 0.052), lift(b, 0.062)];
      c = [contrast(c[0], 0.88), contrast(c[1], 0.88), contrast(c[2], 0.88)];
      c = sat(c[0], c[1], c[2], 0.84);
      c = [gain(c[0], 0.985), gain(c[1], 0.995), gain(c[2], 1.025)];
      const l = luma(c[0], c[1], c[2]);
      const high = l * l;
      return [c[0] + 0.008 * high, c[1] + 0.008 * high, c[2] + 0.026 * high];
    },
  },
  /* === 品牌风格参考（自研近似；非 Leica / Hasselblad 官方 LUT） === */
  {
    id: 'leica-classic', name: '徕卡风 · 经典', category: '徕卡',
    // 暖调、深黑、红润、低饱和：琥珀阴影 + 轻微红润，收一点饱和
    color: C.leica,
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.055), gain(g, 1.0), gain(b, 0.940)];
      c = [scurve(c[0], 0.26), scurve(c[1], 0.22), scurve(c[2], 0.19)];
      c = [lift(c[0], -0.010), lift(c[1], -0.009), lift(c[2], -0.008)];
      c = splitTone(c[0], c[1], c[2], [0.016, 0.0, -0.012], [0.014, 0.004, -0.014]);
      c[0] = clamp01(c[0] + 0.060 * clamp01(c[0] - c[2])); // 红润但不偏橙
      c = [shoulder(c[0], 0.78, 0.14), shoulder(c[1], 0.78, 0.14), shoulder(c[2], 0.80, 0.14)];
      return sat(c[0], c[1], c[2], 0.90);
    },
  },
  {
    id: 'leica-modern', name: '徕卡风 · 现代', category: '徕卡',
    // 干净、微冷阴影、红黄鲜活：中性白平衡 + 冷阴影 + 暖高光
    color: C.leica,
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.012), gain(g, 1.0), gain(b, 0.996)];
      c = [scurve(c[0], 0.16), scurve(c[1], 0.16), scurve(c[2], 0.15)];
      c = splitTone(c[0], c[1], c[2], [-0.009, -0.002, 0.012], [0.006, 0.002, -0.004]);
      c[0] = clamp01(c[0] + 0.05 * clamp01(c[0] - c[2])); // 红黄更鲜活
      c[1] = clamp01(c[1] + 0.02 * clamp01(c[1] - c[2]));
      return sat(c[0], c[1], c[2], 1.04);
    },
  },
  {
    id: 'leica-vivid', name: '徕卡风 · 鲜艳', category: '徕卡',
    // 高饱和高对比，但不炸色：S 曲线 + 收黑 + 提饱和
    color: C.provia,
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.02), gain(g, 1.005), gain(b, 0.985)];
      c = [scurve(c[0], 0.28), scurve(c[1], 0.26), scurve(c[2], 0.24)];
      c = [lift(c[0], -0.007), lift(c[1], -0.006), lift(c[2], -0.005)];
      c = [shoulder(c[0], 0.84, 0.10), shoulder(c[1], 0.84, 0.10), shoulder(c[2], 0.85, 0.10)];
      return sat(c[0], c[1], c[2], 1.16);
    },
  },
  {
    id: 'leica-ccd', name: '徕卡风 · CCD', category: '徕卡',
    // 洋红阴影、暖肤色、绿色略降（CCD 数码机味道）
    color: C.leica,
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.012), gain(g, 0.99), gain(b, 0.995)];
      c = [scurve(c[0], 0.17), scurve(c[1], 0.15), scurve(c[2], 0.16)];
      c = splitTone(c[0], c[1], c[2], [0.034, -0.022, 0.040], [0.006, 0.001, -0.006]);
      c[1] = clamp01(c[1] * 0.972); // 绿色略降
      c[0] = clamp01(c[0] + 0.055 * clamp01(c[0] - c[2])); // 暖肤色
      return sat(c[0], c[1], c[2], 1.03);
    },
  },
  {
    id: 'leica-mono', name: '徕卡风 · 黑白', category: '徕卡',
    // 红滤镜式明暗：红权重高（肤色更亮、天空压暗），深黑
    fn: ([r, g, b]) => {
      const l = 0.50 * r + 0.40 * g + 0.10 * b;
      let v = scurve(l, 0.20);
      v = lift(v, -0.008);
      return [v, v, v];
    },
  },
  {
    id: 'leica-mono-contrast', name: '徕卡风 · 黑白高反差', category: '徕卡',
    // 红滤镜 + 更强 S 曲线，黑白分离度高但不糊
    fn: ([r, g, b]) => {
      const l = 0.52 * r + 0.38 * g + 0.10 * b;
      let v = scurve(l, 0.34);
      v = contrast(v, 1.12);
      v = lift(v, -0.016);
      v = shoulder(v, 0.84, 0.10);
      return [v, v, v];
    },
  },
  {
    id: 'hasselblad-natural', name: '哈苏风 · 自然', category: '哈苏',
    // 肤色准确、柔和肩部、低饱和、高分离
    color: C.hasselblad,
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.004), gain(g, 1.002), gain(b, 1.000)];
      c = [scurve(c[0], 0.08), scurve(c[1], 0.08), scurve(c[2], 0.08)];
      c = [shoulder(c[0], 0.64, 0.24), shoulder(c[1], 0.64, 0.24), shoulder(c[2], 0.66, 0.24)];
      c = splitTone(c[0], c[1], c[2], [-0.004, 0.0, 0.006], [0.003, 0.002, 0.0]);
      return sat(c[0], c[1], c[2], 0.90);
    },
  },
  {
    id: 'hasselblad-portrait', name: '哈苏风 · 人像', category: '哈苏',
    // 奶油肤色、柔对比：轻微暖调 + 低对比 + 抬阴影 + 柔高光
    color: C.hasselblad,
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.035), gain(g, 1.004), gain(b, 0.972)];
      c = [contrast(c[0], 0.96), contrast(c[1], 0.96), contrast(c[2], 0.96)];
      c = [lift(c[0], 0.014), lift(c[1], 0.011), lift(c[2], 0.008)];
      c = [shoulder(c[0], 0.62, 0.26), shoulder(c[1], 0.62, 0.26), shoulder(c[2], 0.66, 0.26)];
      c = splitTone(c[0], c[1], c[2], [0.010, 0.002, -0.008], [0.012, 0.006, -0.010]);
      return sat(c[0], c[1], c[2], 0.93);
    },
  },
  {
    id: 'hasselblad-landscape', name: '哈苏风 · 风光', category: '哈苏',
    // 青蓝/深绿、中对比：冷阴影 + 压深绿色 + 高光略绿不偏黄
    color: C.hasselblad,
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.960), gain(g, 1.010), gain(b, 1.040)];
      c = [scurve(c[0], 0.17), scurve(c[1], 0.19), scurve(c[2], 0.16)];
      c[1] = clamp01(c[1] * 0.980); // 深绿
      c = splitTone(c[0], c[1], c[2], [-0.016, 0.008, 0.032], [0.002, 0.008, -0.012]);
      c = [shoulder(c[0], 0.84, 0.10), shoulder(c[1], 0.84, 0.10), shoulder(c[2], 0.84, 0.10)];
      return sat(c[0], c[1], c[2], 1.10);
    },
  },
  {
    id: 'hasselblad-cream', name: '哈苏风 · 奶油', category: '哈苏',
    // 提亮阴影、柔高光、低对比：奶油肤色，阴影不灰
    color: C.airy,
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.045), gain(g, 1.010), gain(b, 0.955)];
      c = [contrast(c[0], 0.92), contrast(c[1], 0.92), contrast(c[2], 0.92)];
      c = [lift(c[0], 0.032), lift(c[1], 0.027), lift(c[2], 0.022)];
      c = [shoulder(c[0], 0.55, 0.32), shoulder(c[1], 0.55, 0.32), shoulder(c[2], 0.60, 0.32)];
      c = splitTone(c[0], c[1], c[2], [0.010, 0.002, -0.006], [0.014, 0.008, -0.010]);
      return sat(c[0], c[1], c[2], 0.90);
    },
  },
  {
    id: 'hasselblad-cool', name: '哈苏风 · 清冷', category: '哈苏',
    // 冷阴影、干净白：青蓝暗部 + 中性高光 + 低饱和
    color: C.cool,
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.950), gain(g, 0.995), gain(b, 1.065)];
      c = [scurve(c[0], 0.16), scurve(c[1], 0.17), scurve(c[2], 0.16)];
      c = splitTone(c[0], c[1], c[2], [-0.020, -0.004, 0.032], [0.0, 0.0, 0.012]);
      c = [shoulder(c[0], 0.72, 0.18), shoulder(c[1], 0.72, 0.18), shoulder(c[2], 0.74, 0.18)];
      return sat(c[0], c[1], c[2], 0.90);
    },
  },
  {
    id: 'hasselblad-mono', name: '哈苏风 · 黑白', category: '哈苏',
    // 暖调黑白：银盐暖棕，和中性黑白拉开距离
    fn: ([r, g, b]) => {
      const l = 0.34 * r + 0.52 * g + 0.14 * b;
      let v = scurve(l, 0.16);
      v = shoulder(v, 0.74, 0.16);
      return [clamp01(v * 1.020 + 0.004), clamp01(v * 0.995), clamp01(v * 0.950)];
    },
  },

  /* === 新增：胶片 / 电影 / 黑白 / 复古 / 空气感 / 风格（自研，非厂商 LUT） === */

  // 中性 Rec.709：明显收饱和 + 轻微 S，阴影微冷
  {
    id: 'cinema-709', name: '电影 709', category: '电影',
    color: C.eterna,
    fn: ([r, g, b]) => {
      let c = [scurve(r, 0.20), scurve(g, 0.20), scurve(b, 0.20)];
      c = [gain(c[0], 0.980), gain(c[1], 0.995), gain(c[2], 1.020)];
      c = [lift(c[0], 0.020), lift(c[1], 0.021), lift(c[2], 0.024)];
      c = sat(c[0], c[1], c[2], 0.82);
      c = splitTone(c[0], c[1], c[2], [-0.010, -0.002, 0.016], [0.010, 0.005, -0.008]);
      return [shoulder(c[0], 0.80, 0.14), shoulder(c[1], 0.80, 0.14), shoulder(c[2], 0.82, 0.14)];
    },
  },

  // 强青蓝：蓝通道抬高、阴影青、饱和略增
  {
    id: 'cinema-blue', name: '电影蓝', category: '电影',
    color: C.tealOrange,
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.920), gain(g, 1.010), gain(b, 1.090)];
      c = [contrast(c[0], 1.12), contrast(c[1], 1.12), contrast(c[2], 1.12)];
      c = sat(c[0], c[1], c[2], 1.06);
      c = splitTone(c[0], c[1], c[2], [-0.040, 0.014, 0.050], [0.030, 0.012, -0.015]);
      return [c[0], c[1], c[2]];
    },
  },

  // 暗调：压 gamma、低饱和、冷阴影
  {
    id: 'cinema-noir', name: '暗调电影', category: '电影',
    color: C.noir,
    fn: ([r, g, b]) => {
      let c = [contrast(r, 1.28), contrast(g, 1.28), contrast(b, 1.28)];
      c = [gamma(c[0], 1.22), gamma(c[1], 1.22), gamma(c[2], 1.22)];
      c = sat(c[0], c[1], c[2], 0.50);
      c = splitTone(c[0], c[1], c[2], [-0.030, -0.012, 0.030], [0.020, 0.006, -0.012]);
      return [c[0], c[1], c[2]];
    },
  },

  // 电影绿：低饱和、青绿中间调、抬黑
  {
    id: 'film-eter', name: '电影绿', category: '胶片',
    color: C.eterna,
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.95), gain(g, 1.03), gain(b, 1.01)];
      c = [scurve(c[0], 0.10), scurve(c[1], 0.12), scurve(c[2], 0.10)];
      c = sat(c[0], c[1], c[2], 0.68);
      c = [lift(c[0], 0.030), lift(c[1], 0.032), lift(c[2], 0.030)];
      c = splitTone(c[0], c[1], c[2], [-0.012, 0.030, 0.012], [0.008, 0.006, -0.006]);
      return [shoulder(c[0], 0.78, 0.14), shoulder(c[1], 0.78, 0.14), shoulder(c[2], 0.80, 0.14)];
    },
  },

  // 漂白旁路：极低饱和 + 高反差 + 亮肩
  {
    id: 'film-bleach', name: '漂白', category: '胶片',
    color: C.bleach,
    fn: ([r, g, b]) => {
      let c = [contrast(r, 1.35), contrast(g, 1.35), contrast(b, 1.35)];
      c = sat(c[0], c[1], c[2], 0.30);
      c = [lift(c[0], -0.010), lift(c[1], -0.010), lift(c[2], -0.010)];
      c = [shoulder(c[0], 0.70, 0.20), shoulder(c[1], 0.70, 0.20), shoulder(c[2], 0.72, 0.20)];
      return [c[0] * 1.01, c[1], c[2] * 0.99];
    },
  },

  // 纪录片：冷、清晰、去饱和
  {
    id: 'film-doc', name: '纪录片', category: '胶片',
    color: C.classicChrome,
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.955), gain(g, 0.995), gain(b, 1.065)];
      c = [contrast(c[0], 1.14), contrast(c[1], 1.14), contrast(c[2], 1.14)];
      c = sat(c[0], c[1], c[2], 0.70);
      c = splitTone(c[0], c[1], c[2], [-0.022, -0.004, 0.028], [0.004, 0.002, 0.000]);
      return [c[0], c[1], c[2]];
    },
  },

  // 专业负片：暖肤、饱和、红黄
  {
    id: 'film-neg-hi', name: '专业负片', category: '胶片',
    color: C.portra,
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.085), gain(g, 1.010), gain(b, 0.925)];
      c = [scurve(c[0], 0.22), scurve(c[1], 0.22), scurve(c[2], 0.20)];
      c = splitTone(c[0], c[1], c[2], [0.018, 0.000, -0.012], [0.008, 0.002, -0.006]);
      return sat(c[0], c[1], c[2], 1.24);
    },
  },

  // 绿调负片：绿阴影、高饱和
  {
    id: 'film-green-neg', name: '绿调负片', category: '胶片',
    color: C.greenNeg,
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.96), gain(g, 1.04), gain(b, 0.97)];
      c = [scurve(c[0], 0.18), scurve(c[1], 0.18), scurve(c[2], 0.16)];
      c = splitTone(c[0], c[1], c[2], [-0.020, 0.030, -0.008], [0.010, 0.006, -0.006]);
      return sat(c[0], c[1], c[2], 1.22);
    },
  },

  // 夜色青蓝：强蓝、暖高光
  {
    id: 'film-tungsten', name: '夜色青蓝', category: '胶片',
    color: C.tungsten,
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.860), gain(g, 0.940), gain(b, 1.200)];
      c = [contrast(c[0], 1.15), contrast(c[1], 1.15), contrast(c[2], 1.15)];
      c = splitTone(c[0], c[1], c[2], [-0.010, -0.010, 0.055], [0.035, 0.014, -0.005]);
      c = sat(c[0], c[1], c[2], 1.05);
      const l = luma(c[0], c[1], c[2]);
      const high = l * l;
      return [c[0] + 0.035 * high, c[1] + 0.012 * high, c[2] - 0.004 * high];
    },
  },

  // 奶油负片：暖、低对比、大抬黑、低饱和
  {
    id: 'film-cream', name: '奶油负片', category: '胶片',
    color: C.airy,
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.10), gain(g, 1.03), gain(b, 0.90)];
      c = [contrast(c[0], 0.86), contrast(c[1], 0.86), contrast(c[2], 0.86)];
      c = [lift(c[0], 0.058), lift(c[1], 0.050), lift(c[2], 0.042)];
      c = sat(c[0], c[1], c[2], 0.86);
      return [shoulder(c[0], 0.58, 0.30), shoulder(c[1], 0.58, 0.30), shoulder(c[2], 0.62, 0.30)];
    },
  },

  // 漂白黑白：亮部发银、强反差、抬黑
  {
    id: 'bw-bleach', name: '漂白黑白', category: '黑白',
    fn: ([r, g, b]) => {
      const l = 0.35 * r + 0.50 * g + 0.15 * b;
      let v = contrast(scurve(l, 0.34), 1.15);
      v = lift(v, 0.030);
      v = shoulder(v, 0.72, 0.22);
      return [v, v, v];
    },
  },

  // 银盐：深黑、厚中间调
  {
    id: 'bw-silver', name: '银盐', category: '黑白',
    fn: ([r, g, b]) => {
      const l = 0.30 * r + 0.55 * g + 0.15 * b;
      let v = scurve(l, 0.20);
      v = gamma(v, 1.12);
      v = lift(v, -0.020);
      return [v, v, v];
    },
  },

  // 红滤镜：红权重高，压暗天空
  {
    id: 'bw-red', name: '红滤镜黑白', category: '黑白',
    fn: ([r, g, b]) => {
      const l = 0.78 * r + 0.18 * g + 0.04 * b;
      let v = scurve(l, 0.24);
      v = contrast(v, 1.12);
      v = lift(v, -0.012);
      return [v, v, v];
    },
  },

  // 一次成像：青阴影、暖高光、大抬黑、低饱和
  {
    id: 'vintage-instant', name: '一次成像', category: '复古',
    color: C.vintage,
    fn: ([r, g, b]) => {
      let c = [contrast(r, 0.80), contrast(g, 0.84), contrast(b, 0.76)];
      c = [lift(c[0], 0.090), lift(c[1], 0.075), lift(c[2], 0.100)];
      c = splitTone(c[0], c[1], c[2], [0.030, -0.014, 0.055], [0.040, 0.020, -0.020]);
      return sat(c[0], c[1], c[2], 0.70);
    },
  },

  // 金色负片：暖黄、高饱和
  {
    id: 'vintage-gold', name: '金色负片', category: '复古',
    color: C.vintage,
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.12), gain(g, 1.02), gain(b, 0.86)];
      c = [scurve(c[0], 0.20), scurve(c[1], 0.20), scurve(c[2], 0.18)];
      c = splitTone(c[0], c[1], c[2], [0.012, 0.002, -0.010], [0.018, 0.010, -0.018]);
      return sat(c[0], c[1], c[2], 1.25);
    },
  },

  // 杂志褪色：冷、低饱和、抬黑
  {
    id: 'vintage-mag', name: '杂志褪色', category: '复古',
    color: C.vintage,
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.96), gain(g, 0.97), gain(b, 1.03)];
      c = [contrast(c[0], 0.88), contrast(c[1], 0.88), contrast(c[2], 0.88)];
      c = [lift(c[0], 0.050), lift(c[1], 0.048), lift(c[2], 0.052)];
      return sat(c[0], c[1], c[2], 0.62);
    },
  },

  // 薄雾：冷、低对比、大抬黑
  {
    id: 'airy-mist', name: '薄雾', category: '空气感',
    color: C.airy,
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.98), gain(g, 1.00), gain(b, 1.05)];
      c = [lift(c[0], 0.060), lift(c[1], 0.062), lift(c[2], 0.065)];
      c = [contrast(c[0], 0.80), contrast(c[1], 0.80), contrast(c[2], 0.80)];
      return sat(c[0], c[1], c[2], 0.80);
    },
  },

  // 奶油高光：暖白、强柔肩、抬黑
  {
    id: 'airy-cream', name: '奶油高光', category: '空气感',
    color: C.airy,
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.075), gain(g, 1.030), gain(b, 0.930)];
      c = [shoulder(c[0], 0.52, 0.40), shoulder(c[1], 0.52, 0.40), shoulder(c[2], 0.56, 0.40)];
      c = [contrast(c[0], 0.88), contrast(c[1], 0.88), contrast(c[2], 0.88)];
      c = [lift(c[0], 0.050), lift(c[1], 0.046), lift(c[2], 0.040)];
      return sat(c[0], c[1], c[2], 0.78);
    },
  },

  // 蓝调黄昏：强蓝、低饱和
  {
    id: 'style-dusk', name: '蓝调黄昏', category: '风格',
    color: C.cool,
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.88), gain(g, 0.95), gain(b, 1.16)];
      c = [contrast(c[0], 1.10), contrast(c[1], 1.10), contrast(c[2], 1.10)];
      c = splitTone(c[0], c[1], c[2], [-0.030, -0.010, 0.050], [0.015, 0.006, 0.000]);
      return sat(c[0], c[1], c[2], 0.88);
    },
  },

  // 暖光室内：钨丝灯强暖
  {
    id: 'style-warmth', name: '暖光室内', category: '风格',
    color: C.tungsten,
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.14), gain(g, 1.00), gain(b, 0.80)];
      c = [contrast(c[0], 0.92), contrast(c[1], 0.92), contrast(c[2], 0.92)];
      c = [lift(c[0], 0.040), lift(c[1], 0.035), lift(c[2], 0.030)];
      c = splitTone(c[0], c[1], c[2], [0.020, 0.006, -0.012], [0.010, 0.004, -0.008]);
      return sat(c[0], c[1], c[2], 0.95);
    },
  },
];
