export const CAT_EN = {
  cinema: 'CINEMA', film: 'FILM', bw: 'B&W', warm: 'WARM / COOL', vintage: 'VINTAGE',
  airy: 'AIRY', punch: 'STYLE', leica: 'LEICA', hasselblad: 'HASSELBLAD',
};

export const I18N = {
  zh: {
    photo: '照片', fit: '适应', fill: '铺满', dual: '双 LUT', dualOn: '双 LUT 已开',
    export: '导出', language: 'EN',
    hint: '拖动分割线 · 长按右侧看原图',
    exportTitle: '导出', exportSub: '选择画质', exportBtn: '导出 JPEG',
    exportNote: '照片只在本机渲染，导出不经过服务器。',
    photoLoaded: '照片已载入，只在本机处理',
    formatError: '这个格式浏览器解不了，试试 JPG / PNG / WebP',
    exportDone: '已导出',
  },
  en: {
    photo: 'Photo', fit: 'Fit', fill: 'Fill', dual: 'Dual LUT', dualOn: 'Dual LUT on',
    export: 'Export', language: '中文',
    hint: 'Drag the line · long-press right to see original',
    exportTitle: 'Export', exportSub: 'Choose quality', exportBtn: 'Export JPEG',
    exportNote: 'Rendering happens on your device — exports never touch a server.',
    photoLoaded: 'Photo loaded — nothing uploaded',
    formatError: 'This format could not be decoded — try JPG / PNG / WebP',
    exportDone: 'Exported',
  },
};

export function t(lang, key) {
  return (I18N[lang] && I18N[lang][key]) || (I18N.zh[key] || key);
}

export function displayName(look, lang) {
  return lang === 'en' ? look.en : look.name;
}

export function displayMeta(look, lang) {
  return lang === 'en' ? CAT_EN[look.cat] || look.cat.toUpperCase() : look.catLabel;
}
