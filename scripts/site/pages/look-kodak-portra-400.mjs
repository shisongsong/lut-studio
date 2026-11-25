import { lookPage } from '../look-page.mjs';

export default lookPage('kodak-portra-400', {
  zh: {
    what: '这支 look 在红通道上加一点、蓝通道上收一点，把整体色温往暖里推。红色只在本来就偏红的区域继续加深，橙色附近的肤色被单独限制，不会过度饱和或滑向橙黄。高光在中段之后就开始柔和收肩，阴影带一点很淡的冷调，饱和基本维持原样。',
    goodFor: ['阴天或窗光下的街头人像', '逆光里的肤色和浅色衣服', '婚礼、家庭合影这类需要肤色稳的场合'],
    differs: '和柯达 Portra 160 比，这支更暖，红色和肤色更有存在感，高光也收得更柔；和柯达 Gold 200 比，它没有那种明显的金黄偏色，画面更干净，高光更利落。',
  },
  en: {
    what: 'A warm-leaning recipe: red is lifted slightly, blue pulled down, and red is deepened only where the image already runs warm, while the orange band around skin is held back so faces do not slide toward orange. Highlights begin rolling off softly past the middle, the shadows carry a trace of cool, and saturation stays close to the original.',
    goodFor: ['Overcast or window-lit street portraits', 'Backlit skin and pale clothing', 'Weddings and family groups where skin has to stay believable'],
    differs: 'Kodak Portra 160 is the cleaner, more neutral version — less warmth, no red accent and a plainer highlight roll-off; Kodak Gold 200 goes much further into gold and softens the highlights more, where this one keeps the whites cleaner.',
  },
});
