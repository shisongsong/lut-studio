import { lookPage } from '../look-page.mjs';

export default lookPage('fuji-acros-100', {
  zh: {
    what: '这支的黑白转换不是按标准亮度配权：绿的权重最大，红和蓝各留一份，所以红、绿、蓝在灰阶里的相对明暗和普通黑白不同。反差曲线很轻，黑位保持中性，没有刻意压黑；层次是一档一档慢慢过渡的，不追求深黑和高反差。',
    goodFor: ['雾天、雪景这类灰阶层次多的场景', '室内自然光的黑白人像', '静物与建筑里的柔和过渡'],
    differs: '和中性黑白比，它更依赖绿通道，红和蓝的明暗关系不同；和柯达 Tri-X 400 比，曲线的中间分离更轻、暗部更中性。',
  },
  en: {
    what: 'Not a standard luminance mix: green carries the most weight, red and blue keep a smaller share, so how reds, greens and blues sit relative to each other in the greys differs from a neutral conversion. The contrast curve is gentle and the black point is left neutral rather than crushed, so the emphasis is on slow, even tonal steps rather than deep blacks or high contrast.',
    goodFor: ['Fog, snow and scenes built on many grey steps', 'Black-and-white portraits in soft indoor light', 'Still life and architecture with gentle gradients'],
    differs: 'Mono Classic is the neutral conversion to compare it with, and this one leans on the green channel differently; Tri-X 400 has a firmer midtone curve, a slightly lower black and a redder channel mix, where this one stays lighter and flatter.',
  },
});
