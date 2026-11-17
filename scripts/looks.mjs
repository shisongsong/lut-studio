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

export const GRADES = [
  {
    id: 'soft-veil', name: '柔光', category: '胶片',
    fn: ([r, g, b]) => {
      let c = [r, g, b].map((v) => lift(contrast(v, 0.94), 0.02));
      c = sat(c[0], c[1], c[2], 0.94);
      return [c[0] * 1.02, c[1], c[2] * 0.99];
    },
  },
  {
    id: 'film-classic', name: '胶片', category: '胶片',
    fn: ([r, g, b]) => {
      let c = [contrast(r, 1.06), contrast(g, 1.06), contrast(b, 1.06)].map((v) => lift(v, 0.018));
      c = sat(c[0], c[1], c[2], 0.95);
      c = tint(c[0], c[1], c[2], -0.012, 0.004, 0.018);
      return [c[0] * 1.01, c[1], c[2] * 0.995];
    },
  },
  {
    id: 'cinema-teal', name: '电影', category: '电影',
    fn: ([r, g, b]) => {
      let c = [contrast(r, 1.1), contrast(g, 1.1), contrast(b, 1.1)];
      c = sat(c[0], c[1], c[2], 0.92);
      c = tint(c[0], c[1], c[2], -0.03, 0.005, 0.035); // teal shadows
      const l = luma(c[0], c[1], c[2]);
      const high = l * l;
      return [c[0] + 0.045 * high, c[1] + 0.018 * high, c[2] - 0.02 * high]; // warm highlights
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
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.05), gain(g, 1.005), gain(b, 0.94)];
      c = sat(c[0], c[1], c[2], 1.06);
      return [contrast(c[0], 1.03), contrast(c[1], 1.02), contrast(c[2], 1.01)];
    },
  },
  {
    id: 'cool-shade', name: '冷调', category: '冷调',
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.95), gain(g, 0.995), gain(b, 1.05)];
      c = sat(c[0], c[1], c[2], 0.98);
      return [contrast(c[0], 1.04), contrast(c[1], 1.04), contrast(c[2], 1.03)];
    },
  },
  {
    id: 'punch', name: '高对比', category: '高对比',
    fn: ([r, g, b]) => {
      let c = [contrast(r, 1.18), contrast(g, 1.18), contrast(b, 1.18)];
      c = sat(c[0], c[1], c[2], 1.04);
      return [lift(c[0], -0.004), lift(c[1], -0.004), lift(c[2], -0.004)];
    },
  },
  {
    id: 'faded-matte', name: '褪色', category: '复古',
    fn: ([r, g, b]) => {
      let c = [contrast(r, 0.9), contrast(g, 0.9), contrast(b, 0.9)].map((v) => lift(v, 0.055));
      c = sat(c[0], c[1], c[2], 0.82);
      return [c[0] * 1.02, c[1] * 1.005, c[2] * 0.985];
    },
  },
  {
    id: 'airy-day', name: '日系', category: '空气感',
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.04), gain(g, 1.055), gain(b, 1.03)].map((v) => lift(v, 0.03));
      c = [contrast(c[0], 0.92), contrast(c[1], 0.92), contrast(c[2], 0.92)];
      c = sat(c[0], c[1], c[2], 0.94);
      return [c[0], c[1] + 0.006, c[2] + 0.008];
    },
  },
  {
    id: 'vintage-70', name: '复古', category: '复古',
    fn: ([r, g, b]) => {
      const l = luma(r, g, b);
      let c = [mix(r, l * 1.08 + 0.03, 0.35), mix(g, l * 1.0 + 0.02, 0.3), mix(b, l * 0.86 + 0.01, 0.35)];
      c = [contrast(c[0], 0.96), contrast(c[1], 0.96), contrast(c[2], 0.96)].map((v) => lift(v, 0.035));
      return [c[0], c[1], c[2]];
    },
  },
  {
    id: 'haze-dream', name: '空气感', category: '空气感',
    fn: ([r, g, b]) => {
      let c = [lift(r, 0.045), lift(g, 0.045), lift(b, 0.05)];
      c = [contrast(c[0], 0.9), contrast(c[1], 0.9), contrast(c[2], 0.9)];
      c = sat(c[0], c[1], c[2], 0.9);
      const l = luma(c[0], c[1], c[2]);
      const high = l * l;
      return [c[0] + 0.012 * high, c[1] + 0.006 * high, c[2] + 0.02 * high];
    },
  },
  /* === 品牌风格参考（自研近似；非 Leica / Hasselblad 官方 LUT） === */
  {
    id: 'leica-classic', name: '徕卡风 · 经典', category: '徕卡',
    // 暖调、深黑、红润、低饱和：琥珀阴影 + 轻微红润，收一点饱和
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.028), gain(g, 1.0), gain(b, 0.968)];
      c = [scurve(c[0], 0.22), scurve(c[1], 0.19), scurve(c[2], 0.17)];
      c = [lift(c[0], -0.005), lift(c[1], -0.004), lift(c[2], -0.003)];
      c = splitTone(c[0], c[1], c[2], [0.011, 0.0, -0.008], [0.010, 0.003, -0.010]);
      c[0] = clamp01(c[0] + 0.045 * clamp01(c[0] - c[2])); // 红润但不偏橙
      c = [shoulder(c[0], 0.80, 0.12), shoulder(c[1], 0.80, 0.12), shoulder(c[2], 0.82, 0.12)];
      return sat(c[0], c[1], c[2], 0.92);
    },
  },
  {
    id: 'leica-modern', name: '徕卡风 · 现代', category: '徕卡',
    // 干净、微冷阴影、红黄鲜活：中性白平衡 + 冷阴影 + 暖高光
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
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.012), gain(g, 0.99), gain(b, 0.995)];
      c = [scurve(c[0], 0.17), scurve(c[1], 0.15), scurve(c[2], 0.16)];
      c = splitTone(c[0], c[1], c[2], [0.010, -0.006, 0.014], [0.004, 0.001, -0.004]);
      c[1] = clamp01(c[1] * 0.994); // 绿色略降
      c[0] = clamp01(c[0] + 0.025 * clamp01(c[0] - c[2])); // 暖肤色
      return sat(c[0], c[1], c[2], 1.0);
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
      let v = scurve(l, 0.26);
      v = contrast(v, 1.05);
      v = lift(v, -0.008);
      v = shoulder(v, 0.86, 0.10);
      return [v, v, v];
    },
  },
  {
    id: 'hasselblad-natural', name: '哈苏风 · 自然', category: '哈苏',
    // 肤色准确、柔和肩部、低饱和、高分离
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.006), gain(g, 1.002), gain(b, 0.998)];
      c = [scurve(c[0], 0.12), scurve(c[1], 0.12), scurve(c[2], 0.12)];
      c = [shoulder(c[0], 0.70, 0.18), shoulder(c[1], 0.70, 0.18), shoulder(c[2], 0.72, 0.18)];
      c = splitTone(c[0], c[1], c[2], [-0.004, 0.0, 0.006], [0.003, 0.002, 0.0]);
      return sat(c[0], c[1], c[2], 0.95);
    },
  },
  {
    id: 'hasselblad-portrait', name: '哈苏风 · 人像', category: '哈苏',
    // 奶油肤色、柔对比：轻微暖调 + 低对比 + 抬阴影 + 柔高光
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.018), gain(g, 1.002), gain(b, 0.988)];
      c = [contrast(c[0], 0.97), contrast(c[1], 0.97), contrast(c[2], 0.97)];
      c = [lift(c[0], 0.010), lift(c[1], 0.008), lift(c[2], 0.006)];
      c = [shoulder(c[0], 0.64, 0.24), shoulder(c[1], 0.64, 0.24), shoulder(c[2], 0.68, 0.24)];
      c = splitTone(c[0], c[1], c[2], [0.006, 0.001, -0.004], [0.008, 0.004, -0.006]);
      return sat(c[0], c[1], c[2], 0.96);
    },
  },
  {
    id: 'hasselblad-landscape', name: '哈苏风 · 风光', category: '哈苏',
    // 青蓝/深绿、中对比：冷阴影 + 压深绿色 + 高光略绿不偏黄
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.99), gain(g, 1.0), gain(b, 1.015)];
      c = [scurve(c[0], 0.17), scurve(c[1], 0.19), scurve(c[2], 0.16)];
      c[1] = clamp01(c[1] * 0.994); // 深绿
      c = splitTone(c[0], c[1], c[2], [-0.010, 0.002, 0.020], [0.004, 0.006, -0.008]);
      c = [shoulder(c[0], 0.84, 0.10), shoulder(c[1], 0.84, 0.10), shoulder(c[2], 0.84, 0.10)];
      return sat(c[0], c[1], c[2], 1.03);
    },
  },
  {
    id: 'hasselblad-cream', name: '哈苏风 · 奶油', category: '哈苏',
    // 提亮阴影、柔高光、低对比：奶油肤色，阴影不灰
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.012), gain(g, 1.006), gain(b, 0.992)];
      c = [contrast(c[0], 0.94), contrast(c[1], 0.94), contrast(c[2], 0.94)];
      c = [lift(c[0], 0.020), lift(c[1], 0.017), lift(c[2], 0.014)];
      c = [shoulder(c[0], 0.60, 0.28), shoulder(c[1], 0.60, 0.28), shoulder(c[2], 0.64, 0.28)];
      c = splitTone(c[0], c[1], c[2], [0.004, 0.001, 0.0], [0.010, 0.006, -0.004]);
      return sat(c[0], c[1], c[2], 0.95);
    },
  },
  {
    id: 'hasselblad-cool', name: '哈苏风 · 清冷', category: '哈苏',
    // 冷阴影、干净白：青蓝暗部 + 中性高光 + 低饱和
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.986), gain(g, 1.0), gain(b, 1.018)];
      c = [scurve(c[0], 0.16), scurve(c[1], 0.17), scurve(c[2], 0.16)];
      c = splitTone(c[0], c[1], c[2], [-0.010, -0.002, 0.016], [0.0, 0.0, 0.004]);
      c = [shoulder(c[0], 0.72, 0.20), shoulder(c[1], 0.72, 0.20), shoulder(c[2], 0.74, 0.20)];
      return sat(c[0], c[1], c[2], 0.95);
    },
  },
  {
    id: 'hasselblad-mono', name: '哈苏风 · 黑白', category: '哈苏',
    // 中性黑白、平滑中间调：标准 luma 权重 + 柔 S + 柔肩
    fn: ([r, g, b]) => {
      const l = luma(r, g, b);
      let v = scurve(l, 0.14);
      v = shoulder(v, 0.76, 0.14);
      return [v, v, v];
    },
  },

  /* === 新增：胶片 / 电影 / 黑白 / 复古 / 空气感 / 风格（自研，非厂商 LUT） === */

  // 中性的 Rec.709 观感：轻微 S 曲线、收一点饱和、柔和高光
  {
    id: 'cinema-709', name: '电影 709', category: '电影',
    fn: ([r, g, b]) => {
      let c = [scurve(r, 0.14), scurve(g, 0.14), scurve(b, 0.14)];
      c = sat(c[0], c[1], c[2], 0.98);
      c = [shoulder(c[0], 0.82, 0.12), shoulder(c[1], 0.82, 0.12), shoulder(c[2], 0.84, 0.12)];
      return [c[0] * 1.006, c[1], c[2] * 0.994];
    },
  },

  // 青蓝阴影 + 暖高光，夜色电影感
  {
    id: 'cinema-blue', name: '电影蓝', category: '电影',
    fn: ([r, g, b]) => {
      let c = [contrast(r, 1.08), contrast(g, 1.08), contrast(b, 1.08)];
      c = sat(c[0], c[1], c[2], 0.92);
      c = splitTone(c[0], c[1], c[2], [-0.030, -0.010, 0.045], [0.020, 0.008, -0.010]);
      return [c[0], c[1], c[2]];
    },
  },

  // 压暗、低饱和、冷阴影：夜戏味道
  {
    id: 'cinema-noir', name: '暗调电影', category: '电影',
    fn: ([r, g, b]) => {
      let c = [contrast(r, 1.16), contrast(g, 1.16), contrast(b, 1.16)];
      c = [gamma(c[0], 1.05), gamma(c[1], 1.05), gamma(c[2], 1.05)];
      c = sat(c[0], c[1], c[2], 0.82);
      c = splitTone(c[0], c[1], c[2], [-0.020, -0.008, 0.020], [0.015, 0.004, -0.010]);
      return [shoulder(c[0], 0.88, 0.08), shoulder(c[1], 0.88, 0.08), shoulder(c[2], 0.90, 0.08)];
    },
  },

  // 低饱和、青绿中间调、柔肩：安静的院线片感
  {
    id: 'film-eter', name: '电影绿', category: '胶片',
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.986), gain(g, 1.010), gain(b, 1.004)];
      c = [scurve(c[0], 0.12), scurve(c[1], 0.14), scurve(c[2], 0.12)];
      c = sat(c[0], c[1], c[2], 0.86);
      c = splitTone(c[0], c[1], c[2], [-0.006, 0.012, 0.006], [0.006, 0.004, -0.004]);
      return [shoulder(c[0], 0.78, 0.14), shoulder(c[1], 0.78, 0.14), shoulder(c[2], 0.80, 0.14)];
    },
  },

  // 漂白旁路：高反差、低饱和、银盐发亮
  {
    id: 'film-bleach', name: '漂白', category: '胶片',
    fn: ([r, g, b]) => {
      let c = [contrast(r, 1.22), contrast(g, 1.22), contrast(b, 1.22)];
      c = sat(c[0], c[1], c[2], 0.55);
      c = [shoulder(c[0], 0.86, 0.06), shoulder(c[1], 0.86, 0.06), shoulder(c[2], 0.88, 0.06)];
      return [c[0] * 1.010, c[1], c[2] * 0.990];
    },
  },

  // 纪录片感：中性偏冷、低饱和、层次清楚
  {
    id: 'film-doc', name: '纪录片', category: '胶片',
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.990), gain(g, 1.000), gain(b, 1.005)];
      c = [scurve(c[0], 0.16), scurve(c[1], 0.17), scurve(c[2], 0.15)];
      c = sat(c[0], c[1], c[2], 0.86);
      c = splitTone(c[0], c[1], c[2], [-0.008, -0.002, 0.012], [0.004, 0.002, 0.000]);
      return [c[0], c[1], c[2]];
    },
  },

  // 专业负片：肤色稳、对比适中、红黄干净
  {
    id: 'film-neg-hi', name: '专业负片', category: '胶片',
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.010), gain(g, 1.000), gain(b, 0.995)];
      c = [scurve(c[0], 0.18), scurve(c[1], 0.18), scurve(c[2], 0.16)];
      c = splitTone(c[0], c[1], c[2], [0.006, 0.000, -0.004], [0.004, 0.002, -0.002]);
      return sat(c[0], c[1], c[2], 1.02);
    },
  },

  // 绿调负片：阴影偏绿、饱和略高
  {
    id: 'film-green-neg', name: '绿调负片', category: '胶片',
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.990), gain(g, 1.015), gain(b, 0.995)];
      c = [scurve(c[0], 0.20), scurve(c[1], 0.22), scurve(c[2], 0.18)];
      c = splitTone(c[0], c[1], c[2], [-0.010, 0.014, -0.004], [0.006, 0.004, -0.004]);
      return sat(c[0], c[1], c[2], 1.08);
    },
  },

  // 钨丝灯夜景：蓝阴影、暖高光、高光轻微溢出
  {
    id: 'film-tungsten', name: '夜色青蓝', category: '胶片',
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.960), gain(g, 1.000), gain(b, 1.060)];
      c = [contrast(c[0], 1.04), contrast(c[1], 1.04), contrast(c[2], 1.04)];
      c = splitTone(c[0], c[1], c[2], [-0.012, -0.004, 0.030], [0.020, 0.008, 0.000]);
      const l = luma(c[0], c[1], c[2]);
      const high = l * l;
      return [c[0] + 0.030 * high, c[1] + 0.010 * high, c[2] - 0.004 * high];
    },
  },

  // 奶油负片：暖、柔、低对比，肤色讨喜
  {
    id: 'film-cream', name: '奶油负片', category: '胶片',
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.030), gain(g, 1.005), gain(b, 0.975)];
      c = [contrast(c[0], 0.95), contrast(c[1], 0.95), contrast(c[2], 0.95)];
      c = [lift(c[0], 0.020), lift(c[1], 0.018), lift(c[2], 0.016)];
      c = splitTone(c[0], c[1], c[2], [0.008, 0.002, -0.004], [0.008, 0.004, -0.006]);
      return sat(c[0], c[1], c[2], 0.94);
    },
  },

  // 漂白黑白：亮部发银、对比强
  {
    id: 'bw-bleach', name: '漂白黑白', category: '黑白',
    fn: ([r, g, b]) => {
      const l = 0.35 * r + 0.50 * g + 0.15 * b;
      let v = scurve(l, 0.30);
      v = lift(v, 0.020);
      v = shoulder(v, 0.78, 0.18);
      return [v, v, v];
    },
  },

  // 银盐：深黑、平滑过渡、全色响应
  {
    id: 'bw-silver', name: '银盐', category: '黑白',
    fn: ([r, g, b]) => {
      const l = 0.30 * r + 0.55 * g + 0.15 * b;
      let v = scurve(l, 0.18);
      v = contrast(v, 1.04);
      v = lift(v, -0.010);
      return [v, v, v];
    },
  },

  // 红滤镜：压暗天空、提亮肤色
  {
    id: 'bw-red', name: '红滤镜黑白', category: '黑白',
    fn: ([r, g, b]) => {
      const l = 0.55 * r + 0.36 * g + 0.09 * b;
      let v = scurve(l, 0.20);
      v = contrast(v, 1.02);
      return [v, v, v];
    },
  },

  // 一次成像：青阴影、暖高光、抬黑
  {
    id: 'vintage-instant', name: '一次成像', category: '复古',
    fn: ([r, g, b]) => {
      let c = [contrast(r, 0.86), contrast(g, 0.88), contrast(b, 0.86)];
      c = [lift(c[0], 0.060), lift(c[1], 0.050), lift(c[2], 0.055)];
      c = splitTone(c[0], c[1], c[2], [0.010, -0.004, 0.020], [0.020, 0.010, -0.010]);
      return sat(c[0], c[1], c[2], 0.90);
    },
  },

  // 金色负片：暖黄、饱和、高光偏金
  {
    id: 'vintage-gold', name: '金色负片', category: '复古',
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.050), gain(g, 1.005), gain(b, 0.940)];
      c = [scurve(c[0], 0.16), scurve(c[1], 0.16), scurve(c[2], 0.14)];
      c = splitTone(c[0], c[1], c[2], [0.006, 0.000, -0.004], [0.010, 0.006, -0.010]);
      return sat(c[0], c[1], c[2], 1.05);
    },
  },

  // 杂志褪色：抬黑、低饱和、偏冷
  {
    id: 'vintage-mag', name: '杂志褪色', category: '复古',
    fn: ([r, g, b]) => {
      let c = [contrast(r, 0.92), contrast(g, 0.92), contrast(b, 0.90)];
      c = [lift(c[0], 0.040), lift(c[1], 0.038), lift(c[2], 0.042)];
      c = splitTone(c[0], c[1], c[2], [-0.004, 0.000, 0.008], [0.004, 0.002, -0.002]);
      return sat(c[0], c[1], c[2], 0.82);
    },
  },

  // 薄雾：低对比、抬黑、微冷
  {
    id: 'airy-mist', name: '薄雾', category: '空气感',
    fn: ([r, g, b]) => {
      let c = [lift(r, 0.050), lift(g, 0.052), lift(b, 0.055)];
      c = [contrast(c[0], 0.88), contrast(c[1], 0.88), contrast(c[2], 0.88)];
      c = splitTone(c[0], c[1], c[2], [-0.006, 0.000, 0.010], [0.004, 0.004, 0.002]);
      return sat(c[0], c[1], c[2], 0.92);
    },
  },

  // 奶油高光：柔肩、暖白、低对比
  {
    id: 'airy-cream', name: '奶油高光', category: '空气感',
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.030), gain(g, 1.020), gain(b, 1.000)];
      c = [shoulder(c[0], 0.62, 0.26), shoulder(c[1], 0.62, 0.26), shoulder(c[2], 0.66, 0.26)];
      c = [contrast(c[0], 0.94), contrast(c[1], 0.94), contrast(c[2], 0.94)];
      c = [lift(c[0], 0.020), lift(c[1], 0.018), lift(c[2], 0.016)];
      return sat(c[0], c[1], c[2], 0.95);
    },
  },

  // 蓝调黄昏：整体偏蓝、阴影更蓝、高光中性
  {
    id: 'style-dusk', name: '蓝调黄昏', category: '风格',
    fn: ([r, g, b]) => {
      let c = [gain(r, 0.940), gain(g, 0.980), gain(b, 1.080)];
      c = [contrast(c[0], 1.05), contrast(c[1], 1.05), contrast(c[2], 1.05)];
      c = splitTone(c[0], c[1], c[2], [-0.020, -0.006, 0.035], [0.010, 0.004, 0.000]);
      return sat(c[0], c[1], c[2], 0.95);
    },
  },

  // 暖光室内：钨丝灯暖黄、抬黑、柔和
  {
    id: 'style-warmth', name: '暖光室内', category: '风格',
    fn: ([r, g, b]) => {
      let c = [gain(r, 1.070), gain(g, 1.010), gain(b, 0.900)];
      c = [contrast(c[0], 0.97), contrast(c[1], 0.97), contrast(c[2], 0.97)];
      c = [lift(c[0], 0.025), lift(c[1], 0.022), lift(c[2], 0.020)];
      c = splitTone(c[0], c[1], c[2], [0.012, 0.004, -0.008], [0.008, 0.004, -0.006]);
      return sat(c[0], c[1], c[2], 0.98);
    },
  },
];
