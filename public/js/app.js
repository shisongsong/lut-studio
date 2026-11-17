import { LOOKS, LOOK_MAP, FILTERS, FEATURED } from './looks.js';
import { LookRenderer } from './renderer.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DPR = Math.min(window.devicePixelRatio || 1, 2);

const PHOTOS = [
  { id: 'landscape', name: 'Lago di Braies', src: '/photos/landscape.webp', thumb: '/photos/thumbs/landscape.webp' },
  { id: 'city', name: 'City Dusk', src: '/photos/city.webp', thumb: '/photos/thumbs/city.webp' },
  { id: 'portrait', name: 'Portrait', src: '/photos/portrait.webp', thumb: '/photos/thumbs/portrait.webp' },
  { id: 'man', name: 'Low Key Portrait', src: '/photos/man.webp', thumb: '/photos/thumbs/man.webp' },
  { id: 'forest', name: 'Forest Light', src: '/photos/forest.webp', thumb: '/photos/thumbs/forest.webp' },
];

const state = {
  photoId: 'landscape',
  lookId: 'cinema-teal',
  strength: 100,
  adjust: { exposure: 0, contrast: 0, temp: 0 },
  wipe: 0.52,
  filter: 'all',
  compare: false,
  studioOpen: false,
};

const els = {};
const hero = { layers: [], active: 0, timer: 0, paused: false, resumeTimer: 0, inView: true, heroPhoto: PHOTOS[0], image: null };
const studio = { photo: PHOTOS[0], image: null, box: { w: 0, h: 0 }, stripBuilt: false, renderQueued: false, compareHeld: false };

let lutBundle = null;
const lutData = new Map();
const imageCache = new Map();
let heroRenderer = null;
let studioRenderer = null;
let introDone = false;

/* ------------------------------------------------------------------ boot */

init().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<div class="fatal">启动失败：${escapeHtml(err.message)}</div>`);
});

async function init() {
  cacheEls();
  bindEvents();
  buildFilters();
  buildLookCards();
  observeReveals();
  generateDialTicks();

  const started = performance.now();
  await Promise.all([loadLutBundle(), loadHeroImage()]);
  heroRenderer = new LookRenderer();
  heroRenderer.setImage(hero.image);
  studioRenderer = new LookRenderer();

  // hero first paint
  renderHeroLook(state.lookId, { instant: true });
  await buildHeroChips();
  renderLookCardThumbs();
  startAutoCycle();

  // keep the intro on screen for a beat, then reveal
  const wait = Math.max(0, 900 - (performance.now() - started));
  setTimeout(() => {
    introDone = true;
    document.body.classList.add('ready');
    const intro = $('#intro');
    if (intro) {
      intro.classList.add('done');
      setTimeout(() => intro.remove(), 900);
    }
  }, wait);
}

function cacheEls() {
  Object.assign(els, {
    hero: $('#hero'),
    heroBase: $('#heroBase'),
    heroLayerA: $('#heroLayerA'),
    heroLayerB: $('#heroLayerB'),
    heroFilm: $('#heroFilm'),
    heroStatusLook: $('#heroStatusLook'),
    heroStatusHint: $('#heroStatusHint'),
    heroHint: $('#heroHint'),
    heroWipeHandle: $('#heroWipeHandle'),
    heroMedia: $('.hero-media'),
    filters: $('#filters'),
    looksGrid: $('#looksGrid'),
    studio: $('#studio'),
    studioClose: $('#studioClose'),
    studioStage: $('#studioStage'),
    studioBase: $('#studioBase'),
    studioBg: $('#studioBg'),
    studioLayer: $('#studioLayer'),
    studioWipe: $('#studioWipe'),
    studioWipeHandle: $('#studioWipeHandle'),
    studioStrip: $('#studioStrip'),
    studioLookName: $('#studioLookName'),
    studioPhotoName: $('#studioPhotoName'),
    studioExport: $('#studioExport'),
    studioPhotoBtn: $('#studioPhotoBtn'),
    photoSheet: $('#photoSheet'),
    photoGrid: $('#photoGrid'),
    sheetClose: $('#sheetClose'),
    fileInput: $('#fileInput'),
    dial: $('#strengthDial'),
    dialDot: $('#dialDot'),
    strengthValue: $('#strengthValue'),
    adjExposure: $('#adjExposure'),
    adjContrast: $('#adjContrast'),
    adjTemp: $('#adjTemp'),
    adjExposureValue: $('#adjExposureValue'),
    adjContrastValue: $('#adjContrastValue'),
    adjTempValue: $('#adjTempValue'),
    compareBtn: $('#compareBtn'),
    resetBtn: $('#resetBtn'),
    toast: $('#toast'),
  });
  hero.layers = [els.heroLayerA, els.heroLayerB];
}

/* --------------------------------------------------------------- assets */

async function loadLutBundle() {
  const res = await fetch('/luts.bin', { cache: 'force-cache' });
  if (!res.ok) throw new Error(`LUT 加载失败 (${res.status})`);
  lutBundle = new Uint8Array(await res.arrayBuffer());
  const size = 17;
  const per = size ** 3 * 4;
  LOOKS.forEach((look, i) => {
    lutData.set(look.id, { size, data: lutBundle.subarray(i * per, (i + 1) * per) });
  });
}

async function loadHeroImage() {
  if (!els.heroBase.complete) {
    await new Promise((resolve, reject) => {
      els.heroBase.addEventListener('load', resolve, { once: true });
      els.heroBase.addEventListener('error', reject, { once: true });
    });
  }
  try { await els.heroBase.decode(); } catch { /* already decoded */ }
  hero.image = els.heroBase;
}

function getPhotoImage(photo) {
  if (imageCache.has(photo.src)) return imageCache.get(photo.src);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = photo.src;
  });
  imageCache.set(photo.src, promise);
  return promise;
}

/* ------------------------------------------------------------------ hero */

function renderHeroLook(lookId, { instant = false } = {}) {
  const data = lutData.get(lookId);
  if (!data || !hero.image) return;
  const rect = els.heroMedia.getBoundingClientRect();
  const w = Math.max(2, Math.round(rect.width * DPR));
  const h = Math.max(2, Math.round(rect.height * DPR));
  heroRenderer.render([{ id: lookId, parsed: data, strength: 100 }], state.adjust, w, h);

  const target = hero.layers[hero.active ^ 1];
  const previous = hero.layers[hero.active];
  for (const layer of hero.layers) {
    if (layer.width !== w || layer.height !== h) {
      layer.width = w;
      layer.height = h;
    }
  }
  const ctx = target.getContext('2d', { alpha: false });
  ctx.drawImage(heroRenderer.canvas, 0, 0);
  if (instant) {
    target.style.transition = 'none';
    previous.style.transition = 'none';
    target.classList.add('is-on');
    previous.classList.remove('is-on');
    requestAnimationFrame(() => {
      target.style.transition = '';
      previous.style.transition = '';
    });
  } else {
    target.classList.add('is-on');
    previous.classList.remove('is-on');
  }
  hero.active ^= 1;

  const look = LOOK_MAP.get(lookId);
  if (look) els.heroStatusLook.textContent = `${look.en} / ${look.name}`;
  updateChipStates();
}

function cycleHeroLook() {
  if (!FEATURED.length) return;
  const current = FEATURED.findIndex((look) => look.id === state.lookId);
  const next = FEATURED[(current + 1 + FEATURED.length) % FEATURED.length];
  state.lookId = next.id;
  renderHeroLook(next.id);
}

function startAutoCycle() {
  clearInterval(hero.timer);
  if (prefersReduced) {
    els.heroStatusHint.textContent = '点任意一款切换';
    return;
  }
  hero.timer = setInterval(() => {
    if (hero.paused || !hero.inView || state.studioOpen || document.hidden || !introDone) return;
    cycleHeroLook();
  }, 3600);
}

function pauseAutoCycle(ms = 14000) {
  hero.paused = true;
  clearTimeout(hero.resumeTimer);
  hero.resumeTimer = setTimeout(() => { hero.paused = false; }, ms);
}

function updateChipStates() {
  $$('.film-chip', els.heroFilm).forEach((chip) => {
    chip.classList.toggle('on', chip.dataset.look === state.lookId);
  });
  const active = $(`.film-chip[data-look="${state.lookId}"]`, els.heroFilm);
  if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

async function buildHeroChips() {
  const frag = document.createDocumentFragment();
  FEATURED.forEach((look, i) => {
    const chip = document.createElement('button');
    chip.className = 'film-chip';
    chip.dataset.look = look.id;
    chip.style.animationDelay = `${0.55 + i * 0.05}s`;
    chip.innerHTML = `<span class="chip-thumb"><canvas width="192" height="128"></canvas></span><span class="chip-name">${escapeHtml(look.name)}</span>`;
    chip.addEventListener('click', () => {
      pauseAutoCycle();
      state.lookId = look.id;
      renderHeroLook(look.id);
    });
    frag.appendChild(chip);
  });
  els.heroFilm.appendChild(frag);

  for (const chip of $$('.film-chip', els.heroFilm)) {
    const look = LOOK_MAP.get(chip.dataset.look);
    const data = lutData.get(look.id);
    const canvas = $('canvas', chip);
    if (!data) continue;
    heroRenderer.render([{ id: look.id, parsed: data, strength: 100 }], state.adjust, 192, 128);
    canvas.getContext('2d', { alpha: false }).drawImage(heroRenderer.canvas, 0, 0);
    await nextFrame();
  }
  updateChipStates();
}

/* -------------------------------------------------------------- wipe ui */

function bindWipe(stage, handle, { onStart } = {}) {
  let drag = null;
  const start = (event) => {
    if (event.button != null && event.button !== 0) return;
    drag = { x: event.clientX };
    handle.setPointerCapture?.(event.pointerId);
    stage.classList.add('wiping');
    onStart?.();
    event.preventDefault();
  };
  const move = (event) => {
    if (!drag) return;
    const rect = stage.getBoundingClientRect();
    const value = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0.02, 0.98);
    setWipe(stage, value);
    hideHeroHint();
  };
  const end = () => {
    drag = null;
    stage.classList.remove('wiping');
  };
  handle.addEventListener('pointerdown', start);
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, a')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    start(event);
    const onMove = (e) => move(e);
    const onUp = () => {
      end();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

function setWipe(stage, value) {
  stage.style.setProperty('--wipe', String(value));
  if (stage === els.hero) state.wipe = value;
  if (stage === els.studioStage) studio.wipe = value;
}

function hideHeroHint() {
  if (els.heroHint) els.heroHint.classList.add('gone');
}

/* --------------------------------------------------------------- looks */

function buildFilters() {
  const frag = document.createDocumentFragment();
  FILTERS.forEach(([key, label]) => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (key === 'all' ? ' on' : '');
    chip.dataset.filter = key;
    chip.textContent = label;
    chip.setAttribute('role', 'tab');
    chip.addEventListener('click', () => {
      state.filter = key;
      $$('.filter-chip', els.filters).forEach((b) => b.classList.toggle('on', b.dataset.filter === key));
      $$('.look-card', els.looksGrid).forEach((card) => {
        card.hidden = key !== 'all' && card.dataset.cat !== key;
      });
    });
    frag.appendChild(chip);
  });
  els.filters.appendChild(frag);
}

function buildLookCards() {
  const frag = document.createDocumentFragment();
  LOOKS.forEach((look) => {
    const card = document.createElement('button');
    card.className = 'look-card';
    card.dataset.cat = look.cat;
    card.dataset.look = look.id;
    card.innerHTML = `
      <span class="look-media">
        <img src="/photos/thumbs/landscape.webp" alt="" loading="lazy" decoding="async">
        <canvas width="480" height="360"></canvas>
        <span class="look-open">打开 ↗</span>
      </span>
      <span class="look-info">
        <span class="look-name">${escapeHtml(look.name)}</span>
        <span class="look-en">${escapeHtml(look.en)}</span>
        <span class="look-cat">${escapeHtml(look.catLabel)}</span>
      </span>
      <span class="look-tag">${escapeHtml(look.tag)}</span>`;
    card.addEventListener('click', () => {
      openStudio({ lookId: look.id });
    });
    frag.appendChild(card);
  });
  els.looksGrid.appendChild(frag);
}

async function renderLookCardThumbs() {
  if (!heroRenderer) return;
  const cards = $$('.look-card', els.looksGrid);
  let i = 0;
  for (const card of cards) {
    const look = LOOK_MAP.get(card.dataset.look);
    const data = lutData.get(look.id);
    const canvas = $('canvas', card);
    if (data && canvas) {
      heroRenderer.render([{ id: look.id, parsed: data, strength: 100 }], state.adjust, 480, 360);
      canvas.getContext('2d', { alpha: false }).drawImage(heroRenderer.canvas, 0, 0);
    }
    if (++i % 4 === 0) await nextFrame();
  }
}

function observeReveals() {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12 });
  $$('.reveal', document).forEach((el) => io.observe(el));
  const cardIo = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        cardIo.unobserve(entry.target);
      }
    }
  }, { threshold: 0.08 });
  $$('.look-card', els.looksGrid).forEach((el) => cardIo.observe(el));

  const heroIo = new IntersectionObserver(([entry]) => {
    hero.inView = entry.isIntersecting;
  }, { threshold: 0.05 });
  heroIo.observe(els.hero);
}

/* --------------------------------------------------------------- studio */

async function openStudio({ lookId, photoId } = {}) {
  if (lookId) state.lookId = lookId;
  if (photoId) state.photoId = photoId;
  const photo = PHOTOS.find((p) => p.id === state.photoId) || PHOTOS[0];
  state.studioOpen = true;
  document.body.classList.add('studio-open');
  els.studio.hidden = false;
  els.studio.style.setProperty('--wipe', String(state.wipe));
  els.studioLookName.textContent = LOOK_MAP.get(state.lookId)?.name || '';
  els.studioPhotoName.textContent = photo.name;
  await setStudioPhoto(photo);
  buildStudioStrip();
  layoutStudio();
  // small entrance beat for the photo
  els.studioStage.classList.add('enter');
  setTimeout(() => els.studioStage.classList.remove('enter'), 600);
}

function closeStudio() {
  state.studioOpen = false;
  state.compare = false;
  document.body.classList.remove('studio-open');
  els.studio.hidden = true;
  els.photoSheet.hidden = true;
  els.studioStage.classList.remove('comparing');
  pauseAutoCycle(6000);
}

async function setStudioPhoto(photo) {
  studio.photo = photo;
  state.photoId = photo.id;
  let image;
  try {
    image = photo.image || (await getPhotoImage(photo));
  } catch {
    toast('这张图片浏览器解不了，换一张试试');
    throw new Error('image decode failed');
  }
  studio.image = image;
  if (!studioRenderer) studioRenderer = new LookRenderer();
  studioRenderer.setImage(image);
  els.studioBase.src = photo.src;
  els.studioBase.alt = photo.name;
  if (els.studioBg) els.studioBg.src = photo.src;
  els.studioPhotoName.textContent = photo.name;
  els.studioLookName.textContent = LOOK_MAP.get(state.lookId)?.name || '';
  if (!els.studio.hidden) {
    layoutStudio();
    buildStudioStrip(true);
  }
}

function layoutStudio() {
  if (els.studio.hidden || !studio.image) return;
  const rect = els.studioStage.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  const img = studio.image;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(rect.width / iw, rect.height / ih);
  const w = Math.max(40, Math.round(iw * scale));
  const h = Math.max(40, Math.round(ih * scale));
  studio.box = { w, h };
  const left = Math.round((rect.width - w) / 2);
  const top = Math.round((rect.height - h) / 2);
  for (const el of [els.studioBase, els.studioLayer]) {
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
  }
  Object.assign(els.studioWipe.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
  els.studioWipe.style.setProperty('--wipe', String(state.wipe));
  const cw = Math.round(w * DPR);
  const ch = Math.round(h * DPR);
  if (els.studioLayer.width !== cw || els.studioLayer.height !== ch) {
    els.studioLayer.width = cw;
    els.studioLayer.height = ch;
  }
  renderStudio();
}

function renderStudioSoon() {
  if (studio.renderQueued) return;
  studio.renderQueued = true;
  requestAnimationFrame(() => {
    studio.renderQueued = false;
    renderStudio();
  });
}

function renderStudio() {
  if (!studioRenderer || !studio.image || !studio.box.w) return;
  const data = lutData.get(state.lookId);
  if (!data) return;
  const cw = Math.max(2, Math.round(studio.box.w * DPR));
  const ch = Math.max(2, Math.round(studio.box.h * DPR));
  studioRenderer.render([{ id: state.lookId, parsed: data, strength: state.strength }], state.adjust, cw, ch);
  const ctx = els.studioLayer.getContext('2d', { alpha: false });
  ctx.drawImage(studioRenderer.canvas, 0, 0);
  updateStudioLabels();
}

function buildStudioStrip(force = false) {
  if (studio.stripBuilt && !force) {
    updateStripStates();
    return;
  }
  studio.stripBuilt = true;
  els.studioStrip.innerHTML = '';
  const frag = document.createDocumentFragment();
  LOOKS.forEach((look) => {
    const chip = document.createElement('button');
    chip.className = 'strip-chip';
    chip.dataset.look = look.id;
    chip.innerHTML = `<canvas width="128" height="88"></canvas><span class="strip-name">${escapeHtml(look.name)}</span>`;
    chip.addEventListener('click', () => {
      state.lookId = look.id;
      renderStudioSoon();
      updateStripStates();
      els.studioLookName.textContent = look.name;
    });
    frag.appendChild(chip);
  });
  els.studioStrip.appendChild(frag);
  updateStripStates();
  renderStripThumbs();
}

async function renderStripThumbs() {
  if (!studioRenderer) return;
  let i = 0;
  for (const chip of $$('.strip-chip', els.studioStrip)) {
    const look = LOOK_MAP.get(chip.dataset.look);
    const data = lutData.get(look.id);
    const canvas = $('canvas', chip);
    if (data && canvas) {
      studioRenderer.render([{ id: look.id, parsed: data, strength: 100 }], { exposure: 0, contrast: 0, temp: 0 }, 128, 88);
      canvas.getContext('2d', { alpha: false }).drawImage(studioRenderer.canvas, 0, 0);
    }
    if (++i % 4 === 0) await nextFrame();
  }
}

function updateStripStates() {
  $$('.strip-chip', els.studioStrip).forEach((chip) => {
    chip.classList.toggle('on', chip.dataset.look === state.lookId);
  });
  const active = $(`.strip-chip[data-look="${state.lookId}"]`, els.studioStrip);
  if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function updateStudioLabels() {
  els.strengthValue.textContent = String(Math.round(state.strength));
  els.dial.setAttribute('aria-valuenow', String(Math.round(state.strength)));
  const angle = (state.strength / 100) * 270 - 135;
  const rad = (angle * Math.PI) / 180;
  const r = 50;
  els.dialDot.setAttribute('cx', String(60 + r * Math.sin(rad)));
  els.dialDot.setAttribute('cy', String(60 - r * Math.cos(rad)));
  els.adjExposureValue.textContent = (state.adjust.exposure >= 0 ? '+' : '') + state.adjust.exposure.toFixed(2);
  els.adjContrastValue.textContent = (state.adjust.contrast > 0 ? '+' : '') + Math.round(state.adjust.contrast);
  els.adjTempValue.textContent = (state.adjust.temp > 0 ? '+' : '') + Math.round(state.adjust.temp);
  updateSliderFill(els.adjExposure, -2, 2);
  updateSliderFill(els.adjContrast, -100, 100);
  updateSliderFill(els.adjTemp, -100, 100);
  els.studioLookName.textContent = LOOK_MAP.get(state.lookId)?.name || '';
}

function updateSliderFill(input, min, max) {
  const pct = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty('--fill', `${pct}%`);
}

function setStrength(value) {
  state.strength = clamp(Math.round(value), 0, 100);
  updateStudioLabels();
  renderStudioSoon();
  if (navigator.vibrate) navigator.vibrate(2);
}

function setCompare(on) {
  state.compare = on;
  els.studioStage.classList.toggle('comparing', on);
}

/* --------------------------------------------------------------- export */

async function exportImage() {
  if (!studio.image) return;
  els.studioExport.disabled = true;
  toast('正在导出全分辨率照片…');
  await new Promise((resolve) => setTimeout(resolve, 40));
  try {
    const data = lutData.get(state.lookId);
    if (!data) throw new Error('LUT 未加载');
    const img = studio.image;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const cap = Math.min(4096, studioRenderer.maxTexture);
    const scale = Math.min(1, cap / Math.max(iw, ih));
    const w = Math.round(iw * scale);
    const h = Math.round(ih * scale);
    studioRenderer.render([{ id: state.lookId, parsed: data, strength: state.strength }], state.adjust, w, h);
    const out = document.createElement('canvas');
    out.width = studioRenderer.canvas.width;
    out.height = studioRenderer.canvas.height;
    out.getContext('2d', { alpha: false }).drawImage(studioRenderer.canvas, 0, 0);
    const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/jpeg', 0.94));
    if (!blob) throw new Error('导出失败');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const look = LOOK_MAP.get(state.lookId);
    a.href = url;
    a.download = `lut-studio-${look?.en || 'look'}-${Date.now()}.jpg`.replace(/\s+/g, '-');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`已导出 ${out.width}×${out.height} JPEG`);
    // restore preview-sized render
    layoutStudio();
  } catch (err) {
    toast(`导出失败：${err.message}`);
  } finally {
    els.studioExport.disabled = false;
  }
}

/* --------------------------------------------------------------- sheet */

function buildPhotoSheet() {
  if (els.photoGrid.childElementCount) return;
  const frag = document.createDocumentFragment();
  PHOTOS.forEach((photo) => {
    const b = document.createElement('button');
    b.className = 'photo-thumb';
    b.innerHTML = `<img src="${photo.thumb}" alt="${escapeHtml(photo.name)}" loading="lazy"><span>${escapeHtml(photo.name)}</span>`;
    b.addEventListener('click', async () => {
      els.photoSheet.hidden = true;
      try {
        await setStudioPhoto(photo);
        buildStudioStrip(true);
        layoutStudio();
      } catch { /* toast already shown */ }
    });
    frag.appendChild(b);
  });
  els.photoGrid.appendChild(frag);
}

async function handleUpload(file) {
  if (!file) return;
  toast('正在读取照片…');
  try {
    let image;
    try {
      image = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      const url = URL.createObjectURL(file);
      image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('decode'));
        img.src = url;
      });
    }
    const src = URL.createObjectURL(file);
    const photo = { id: `upload-${Date.now()}`, name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || '我的照片', src, image };
    PHOTOS.push(photo);
    els.photoSheet.hidden = true;
    await setStudioPhoto(photo);
    buildStudioStrip(true);
    layoutStudio();
    toast('已载入你的照片');
  } catch {
    toast('这个格式浏览器解不了，试试 JPG / PNG / WebP');
  }
}

/* --------------------------------------------------------------- events */

function bindEvents() {
  // hero auto-cycle pause
  els.hero.addEventListener('pointerenter', () => { hero.paused = true; }, { passive: true });
  els.hero.addEventListener('pointerleave', () => { hero.paused = false; }, { passive: true });

  bindWipe(els.hero, els.heroWipeHandle, { onStart: () => { pauseAutoCycle(); hideHeroHint(); } });
  bindWipe(els.studioStage, els.studioWipeHandle, { onStart: () => setCompare(false) });

  $$('[data-open-studio]').forEach((btn) => {
    btn.addEventListener('click', () => openStudio({ lookId: state.lookId }));
  });

  els.studioClose.addEventListener('click', closeStudio);
  els.studioExport.addEventListener('click', exportImage);
  els.studioPhotoBtn.addEventListener('click', () => {
    buildPhotoSheet();
    els.photoSheet.hidden = false;
  });
  els.sheetClose.addEventListener('click', () => { els.photoSheet.hidden = true; });
  els.photoSheet.addEventListener('click', (event) => {
    if (event.target === els.photoSheet) els.photoSheet.hidden = true;
  });
  els.fileInput.addEventListener('change', () => {
    const file = els.fileInput.files?.[0];
    els.fileInput.value = '';
    if (file) handleUpload(file);
  });

  // strength dial
  let dialDrag = null;
  els.dial.addEventListener('pointerdown', (event) => {
    dialDrag = { y: event.clientY, value: state.strength };
    els.dial.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  els.dial.addEventListener('pointermove', (event) => {
    if (!dialDrag) return;
    setStrength(dialDrag.value - (event.clientY - dialDrag.y) * 0.8);
  });
  const endDial = () => { dialDrag = null; };
  els.dial.addEventListener('pointerup', endDial);
  els.dial.addEventListener('pointercancel', endDial);
  els.dial.addEventListener('wheel', (event) => {
    event.preventDefault();
    setStrength(state.strength + (event.deltaY > 0 ? -2 : 2));
  }, { passive: false });
  els.dial.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') { event.preventDefault(); setStrength(state.strength + 2); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') { event.preventDefault(); setStrength(state.strength - 2); }
    if (event.key === 'Home') { event.preventDefault(); setStrength(0); }
    if (event.key === 'End') { event.preventDefault(); setStrength(100); }
  });

  // adjustments
  const bindSlider = (input, key, min, max, fmt) => {
    const apply = () => {
      state.adjust[key] = Number(input.value);
      if (fmt) fmt();
      updateStudioLabels();
      renderStudioSoon();
    };
    input.addEventListener('input', apply);
    input.addEventListener('change', apply);
  };
  bindSlider(els.adjExposure, 'exposure', -2, 2);
  bindSlider(els.adjContrast, 'contrast', -100, 100);
  bindSlider(els.adjTemp, 'temp', -100, 100);

  // compare: hold button or space
  const holdStart = (event) => {
    event.preventDefault();
    setCompare(true);
  };
  const holdEnd = () => setCompare(false);
  els.compareBtn.addEventListener('pointerdown', holdStart);
  els.compareBtn.addEventListener('pointerup', holdEnd);
  els.compareBtn.addEventListener('pointerleave', holdEnd);
  els.compareBtn.addEventListener('pointercancel', holdEnd);
  els.resetBtn.addEventListener('click', () => {
    state.strength = 100;
    state.adjust = { exposure: 0, contrast: 0, temp: 0 };
    els.adjExposure.value = '0';
    els.adjContrast.value = '0';
    els.adjTemp.value = '0';
    setWipe(els.studioStage, 0.52);
    updateStudioLabels();
    renderStudioSoon();
    toast('已重置');
  });

  // keyboard
  window.addEventListener('keydown', (event) => {
    if (!state.studioOpen) return;
    if (event.key === 'Escape') {
      if (!els.photoSheet.hidden) els.photoSheet.hidden = true;
      else closeStudio();
    } else if (event.code === 'Space') {
      event.preventDefault();
      setCompare(true);
    } else if (event.key.toLowerCase() === 'e' && !event.metaKey && !event.ctrlKey) {
      exportImage();
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space' && state.studioOpen) setCompare(false);
  });

  // drag & drop anywhere
  const onDragOver = (event) => {
    event.preventDefault();
    document.body.classList.add('dragging');
  };
  const onDragLeave = () => document.body.classList.remove('dragging');
  const onDrop = (event) => {
    event.preventDefault();
    document.body.classList.remove('dragging');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (!state.studioOpen) openStudio({ lookId: state.lookId }).then(() => handleUpload(file));
    else handleUpload(file);
  };
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);

  // resize
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (hero.image && !state.studioOpen) renderHeroLook(state.lookId, { instant: true });
      if (state.studioOpen) layoutStudio();
    }, 160);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hero.paused = true;
  });

  // hide the hint after the first real interaction
  ['pointerdown', 'wheel'].forEach((type) => {
    els.hero.addEventListener(type, hideHeroHint, { once: true, passive: true });
  });
}

/* ----------------------------------------------------------------- dial */

function generateDialTicks() {
  const g = $('#dialTicks');
  if (!g) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i <= 40; i++) {
    const angle = (i / 40) * 270 - 135;
    const rad = (angle * Math.PI) / 180;
    const major = i % 5 === 0;
    const r1 = 42;
    const r2 = major ? 36 : 39;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(60 + r1 * Math.sin(rad)));
    line.setAttribute('y1', String(60 - r1 * Math.cos(rad)));
    line.setAttribute('x2', String(60 + r2 * Math.sin(rad)));
    line.setAttribute('y2', String(60 - r2 * Math.cos(rad)));
    line.setAttribute('class', major ? 'dial-tick major' : 'dial-tick');
    frag.appendChild(line);
  }
  g.appendChild(frag);
}

/* ---------------------------------------------------------------- utils */

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
