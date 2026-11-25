import { lookPage } from '../look-page.mjs';

export default lookPage('film-bleach', {
  zh: {
    what: '几乎是黑白的彩色：饱和先被压到很低，再由色相层分别把绿色、蓝色和肤色的浓度抽掉，最后只剩一层很薄的色。反差拉得很高，暗部压深，高光从很早的位置就开始宽宽地收肩，所以亮部发亮、发银，而不是一片死白。',
    goodFor: ['废弃厂房、金属和锈迹', '阴天或雨雾里的街头纪实', '强光下强调皮肤质感的特写'],
    differs: '和漂白黑白比，它留着一层很薄的颜色，黑位更沉、反差也更硬；和暗调电影比，暗调电影整体压暗、阴影偏冷蓝，这支更亮，颜色几乎抽干，亮部发银。',
  },
  en: {
    what: 'A near-monochrome colour grade: saturation is cut right down, then the hue stage pulls what is left out of greens, blues and skin separately, so only a thin wash of colour remains. Contrast is pushed hard, the dark end is crushed and the highlight shoulder starts early and wide, which is what makes the brights read bright and metallic rather than flat white.',
    goodFor: ['Abandoned factories, metal and rust', 'Overcast or rainy street documentary', 'Harsh-light close-ups that lean on skin texture'],
    differs: 'Bleach B&W is the fully monochrome version of the same idea, with a lifted black and no colour at all; Cinema Noir is also low in saturation but much darker with a cool blue shadow and colour still present, where this one is lighter and close to grey.',
  },
});
