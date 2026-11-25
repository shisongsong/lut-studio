import { lookPage } from '../look-page.mjs';

export default lookPage('kodak-trix-400', {
  zh: {
    what: '黑白合成时，红色分到的权重比标准亮度高，所以红衣服、红砖会比在普通黑白里亮一点；绿色占的分量低一些，绿植相对更沉。中间的 S 曲线把灰阶拉开，暗部收得干净，没有加颗粒，画面是平滑的黑白。',
    goodFor: ['阴天的街头人物与表情特写', '混凝土、金属和玻璃的建筑结构', '光比大的纪实场景'],
    differs: '和中性黑白比，它的中间调分离更明显，暗部更沉；和银盐比，它更轻一点，银盐的中间调更厚、黑更低。',
  },
  en: {
    what: 'A monochrome conversion with more weight on red than a standard luminance mix, so brick and red clothing sit a little brighter than they would in a neutral black and white; green carries less and foliage goes comparatively darker. A firm S-curve separates the greys, blacks are pushed down, and no grain is added — the texture is whatever the file already has.',
    goodFor: ['Overcast street portraits and face close-ups', 'Concrete, steel and glass architecture', 'Documentary scenes with a wide brightness range'],
    differs: 'Mono Classic has the gentler, flatter curve and a slightly lighter dark end; Silver Gelatin is heavier through the midtones with a lower black, where this one stays lighter and more separated.',
  },
});
