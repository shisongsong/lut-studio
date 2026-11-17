export const CAT_EN = {
  cinema: 'CINEMA', film: 'FILM', bw: 'B&W', warm: 'WARM / COOL', vintage: 'VINTAGE',
  airy: 'AIRY', punch: 'STYLE', leica: 'LEICA', hasselblad: 'HASSELBLAD',
};

export const I18N = {
  zh: {
    all: '全部', importLut: '导入 LUT', myLuts: '我的 LUT', importOk: '已导入 {n} 个 LUT', importFail: '这个 .cube 读不了',
    rawUnsupported: '这个 RAW 解不了（可能是尼康 HE/HE* 压缩），先用相机软件导出 JPG',
    rawDecoding: '正在解码 RAW（首次需加载解码器，约 1.4 MB）…',
    rawDeveloped: '已从 RAW 解码（相机白平衡 · 全分辨率）',
    rawExtracting: '解码失败，正在提取内嵌预览…',
    rawHeUnsupported: '这个 NEF 是 HE/HE* 压缩，开源解码器解不了，改用相机内嵌的 JPEG…',
    rawPreview: '已退回内嵌预览（相机 JPEG）',
    rawPreviewHe: 'HE/HE* 压缩：已用相机内嵌 JPEG（想真冲洗就把相机压缩改成 Lossless）',
    logHint: '输入色彩空间：普通照片用 sRGB；套厂商 LOG LUT 时切到对应 LOG', photo: '照片', fit: '适应', fill: '铺满', dual: '双 LUT', dualOn: '双 LUT 已开',
    export: '导出', language: 'EN',
    hint: '拖动分割线 · 长按右侧看原图',
    exportTitle: '导出', exportSub: '选择画质', exportBtn: '导出 JPEG',
    exportNote: '照片只在本机渲染，导出不经过服务器。',
    photoLoaded: '照片已载入，只在本机处理',
    formatError: '这个格式浏览器解不了，试试 JPG / PNG / WebP',
    exportDone: '已导出',
  },
  en: {
    all: 'All', importLut: 'Import LUT', myLuts: 'My LUTs', importOk: 'Imported {n} LUT(s)', importFail: 'Could not read that .cube',
    rawUnsupported: 'This RAW cannot be decoded — export a JPG with the camera software.',
    rawDecoding: 'Developing the RAW (first run loads a 1.4 MB decoder)…',
    rawDeveloped: 'RAW developed (camera white balance · full resolution)',
    rawExtracting: 'Decoding failed — extracting the embedded preview…',
    rawHeUnsupported: 'This NEF uses HE/HE* compression, which the open-source decoder cannot unpack — using the embedded camera JPEG…',
    rawPreview: 'Fell back to the embedded preview (camera JPEG)',
    rawPreviewHe: 'HE/HE* compression: using the embedded camera JPEG (set the camera to Lossless for a real RAW development)',
    logHint: 'Input profile: sRGB for normal photos, switch to the matching LOG for vendor LOG LUTs', photo: 'Photo', fit: 'Fit', fill: 'Fill', dual: 'Dual LUT', dualOn: 'Dual LUT on',
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
