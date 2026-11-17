export const CAT_EN = {
  cinema: 'CINEMA', film: 'FILM', bw: 'B&W', warm: 'WARM / COOL', vintage: 'VINTAGE',
  airy: 'AIRY', punch: 'STYLE', leica: 'LEICA', hasselblad: 'HASSELBLAD',
};

export const I18N = {
  zh: {
    all: '全部', importLut: '导入 LUT', myLuts: '我的 LUT', importOk: '已导入 {n} 个 LUT', importFail: '这个 .cube 读不了',
    rawUnsupported: '这个 RAW 解不了，先用相机软件导出 JPG',
    rawDecoding: '正在解码 RAW（首次需加载解码器，约 3.4 MB）…',
    rawDeveloped: '已从 RAW 解码（相机白平衡 · 全分辨率）',
    rawExtracting: '解码失败，正在提取内嵌预览…',
    rawPreview: '已退回内嵌预览（相机 JPEG）',
    autoBright: '自动亮度',
    develop: '冲洗', developClose: '收起冲洗', autoTone: '自动色调', reset: '重置',
    original: '原片', noLook: 'NO LOOK', developing: '未套 LUT',
    dev_wb: '白平衡', dev_temp: '色温', dev_tint: '色调', dev_light: '光线', dev_presence: '偏好',
    dev_exposure: '曝光', dev_contrast: '对比度', dev_highlights: '高光', dev_shadows: '阴影',
    dev_whites: '白色', dev_blacks: '黑色', dev_vibrance: '自然饱和度', dev_saturation: '饱和度',
    devHint: '拖动即时看效果。白平衡用吸管点画面里的灰或白。照片只在本机处理。',
    pickHint: '点画面里的中性灰或白色', pickTooDark: '这里太暗了，换个亮一点的地方',
    picked: '白平衡已取点', autoToneDone: '自动色调已应用', resetDone: '已重置冲洗参数',
    autoToneTitle: '自动色调：按直方图摆好曝光、对比度、高光、阴影、白色、黑色',
    cubeSize3Range: 'LUT_3D_SIZE {n} 超出范围（支持 2–128）',
    cubeSize3Rows: '数据行数不对：LUT_3D_SIZE {n} 需要 {need} 行，文件里有 {got} 行',
    cubeSize1Range: 'LUT_1D_SIZE {n} 超出范围',
    cubeSize1Rows: '数据行数不对：LUT_1D_SIZE {n} 需要 {need} 行，文件里有 {got} 行',
    cubeNoSize: '没找到 LUT_3D_SIZE / LUT_1D_SIZE，这不像是 .cube 文件',
    cubeEmpty: '这个文件是空的，或者不是 .cube',
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
    rawDecoding: 'Developing the RAW (first run loads a 3.4 MB decoder)…',
    rawDeveloped: 'RAW developed (camera white balance · full resolution)',
    rawExtracting: 'Decoding failed — extracting the embedded preview…',
    rawPreview: 'Fell back to the embedded preview (camera JPEG)',
    autoBright: 'Auto brightness',
    develop: 'Develop', developClose: 'Hide develop', autoTone: 'Auto tone', reset: 'Reset',
    original: 'Original', noLook: 'NO LOOK', developing: 'NO LUT',
    dev_wb: 'White balance', dev_temp: 'Temp', dev_tint: 'Tint', dev_light: 'Light', dev_presence: 'Presence',
    dev_exposure: 'Exposure', dev_contrast: 'Contrast', dev_highlights: 'Highlights', dev_shadows: 'Shadows',
    dev_whites: 'Whites', dev_blacks: 'Blacks', dev_vibrance: 'Vibrance', dev_saturation: 'Saturation',
    devHint: 'Drag to see it live. Use the eyedropper for a grey or white reference. Nothing leaves this device.',
    pickHint: 'Click a neutral grey or white in the photo', pickTooDark: 'Too dark there — pick a brighter spot',
    picked: 'White balance set', autoToneDone: 'Auto tone applied', resetDone: 'Develop settings reset',
    autoToneTitle: 'Auto tone: exposure, contrast, highlights, shadows, whites and blacks from the histogram',
    cubeSize3Range: 'LUT_3D_SIZE {n} is out of range (2–128 supported)',
    cubeSize3Rows: 'Wrong number of rows: LUT_3D_SIZE {n} needs {need}, the file has {got}',
    cubeSize1Range: 'LUT_1D_SIZE {n} is out of range',
    cubeSize1Rows: 'Wrong number of rows: LUT_1D_SIZE {n} needs {need}, the file has {got}',
    cubeNoSize: 'No LUT_3D_SIZE / LUT_1D_SIZE found — this does not look like a .cube file',
    cubeEmpty: 'This file is empty, or is not a .cube',
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
