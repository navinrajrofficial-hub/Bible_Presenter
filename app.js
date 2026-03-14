// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════
let slides = [];
let currentIdx = 0;
let dragSrcIdx = null;
let thumbDragged = false;
let presentIdx = 0;
let activeTab = 'html';
let saveTimer = null;

// ── LAZY THUMBNAIL LOADER ──
// Only renders an iframe's srcdoc when the thumbnail scrolls into view.
// Uses a 200px vertical rootMargin so the next thumb is pre-loaded before
// the user reaches it, keeping scrolling smooth.
const _thumbObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const thumb = entry.target;
    const fr = thumb.querySelector('iframe');
    if (!fr) return;
    // Load (or reload) only when there's pending HTML that differs from what's showing
    if (fr._pendingHtml !== undefined && fr._lastSrcdoc !== fr._pendingHtml) {
      fr._lastSrcdoc = fr._pendingHtml;
      fr.srcdoc = fr._pendingHtml;
      fr._loaded = true;
    }
  });
}, {
  root: document.getElementById('slide-list'),
  rootMargin: '200px 0px',
  threshold: 0
});

// ══════════════════════════════════════════════════
//  TOAST HELPER
// ══════════════════════════════════════════════════
function showToast(msg, type = 'success', duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = ''; }, duration);
}

// ══════════════════════════════════════════════════
//  AUTO-SAVE TO localStorage
// ══════════════════════════════════════════════════
const STORAGE_KEY = 'presenter_slides_v1';

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // Run the actual localStorage write during browser idle time so it never
    // blocks a frame. Falls back to a direct call on browsers without rIC.
    const doSave = () => {
      try {
        // Serialise only the fields we need; runtime-only props (_thumbHtml etc.) are excluded
        const payload = slides.map(s => {
          const { id, type, name, html, title, body, bg, color, layout, font } = s;
          return type === 'html' ? { id, type, name, html } : { id, type, name, title, body, bg, color, layout, font };
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ slides: payload, currentIdx }));
        const ind = document.getElementById('save-indicator');
        ind.classList.add('show');
        clearTimeout(ind._t);
        ind._t = setTimeout(() => ind.classList.remove('show'), 1800);
      } catch(e) {
        showToast('Auto-save failed (storage full?)', 'error');
      }
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(doSave, { timeout: 2000 });
    } else {
      doSave();
    }
  }, 600);
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.slides) && data.slides.length) {
      slides = data.slides;
      currentIdx = Math.min(data.currentIdx || 0, slides.length - 1);
      return true;
    }
  } catch(e) {}
  return false;
}

// ══════════════════════════════════════════════════
//  EXPORT MODAL
// ══════════════════════════════════════════════════
function openExportModal() {
  if (!slides.length) { showToast('No slides to export!', 'error'); return; }
  document.getElementById('export-all-count').textContent =
    `(${slides.length} slide${slides.length > 1 ? 's' : ''})`;
  const fromEl = document.getElementById('export-from');
  const toEl   = document.getElementById('export-to');
  fromEl.value = 1;
  fromEl.max   = slides.length;
  toEl.value   = slides.length;
  toEl.max     = slides.length;
  // Reset to "all" mode
  document.getElementById('export-mode-all').checked = true;
  document.getElementById('export-range-inputs').style.display = 'none';
  document.getElementById('export-opt-all').style.borderColor = '#34d399';
  document.getElementById('export-opt-range').style.borderColor = '#2a2a2e';
  updateExportRangeInfo();
  document.getElementById('export-modal').style.display = 'flex';
}

function closeExportModal() {
  document.getElementById('export-modal').style.display = 'none';
}

function updateExportRangeInfo() {
  const from  = parseInt(document.getElementById('export-from').value, 10);
  const to    = parseInt(document.getElementById('export-to').value,   10);
  const valid = !isNaN(from) && !isNaN(to) && from >= 1 && to >= from && from <= slides.length;
  const count = valid ? Math.min(to, slides.length) - from + 1 : 0;
  document.getElementById('export-range-info').textContent =
    valid ? `= ${count} slide${count !== 1 ? 's' : ''}` : '⚠ invalid range';
}

function doExport() {
  const mode = document.querySelector('input[name="export-mode"]:checked').value;
  let subset;
  if (mode === 'all') {
    subset = slides;
  } else {
    const from = parseInt(document.getElementById('export-from').value, 10);
    const to   = parseInt(document.getElementById('export-to').value,   10);
    if (isNaN(from) || isNaN(to) || from < 1 || to < from || from > slides.length) {
      showToast('Invalid range — check From / To values', 'error'); return;
    }
    subset = slides.slice(from - 1, Math.min(to, slides.length));
  }
  if (!subset.length) { showToast('No slides in selected range!', 'error'); return; }
  const payload = JSON.stringify({ version: 1, slides: subset }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'presentation.prsn';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast(`✓ Exported ${subset.length} slide${subset.length > 1 ? 's' : ''}`, 'success');
  closeExportModal();
}

// ══════════════════════════════════════════════════
//  IMPORT  (load from .prsn / .json file)
// ══════════════════════════════════════════════════
let _pendingImport = null; // holds parsed slides while modal is open

function triggerImport() {
  document.getElementById('file-import-input').click();
}

document.getElementById('file-import-input').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => processImport(e.target.result, file.name);
  reader.readAsText(file);
  this.value = ''; // reset so same file can be re-imported
});

function processImport(text, fileName) {
  try {
    const data = JSON.parse(text);
    let imported = [];
    if (Array.isArray(data)) {
      imported = data;
    } else if (data && Array.isArray(data.slides)) {
      imported = data.slides;
    } else {
      throw new Error('Unrecognized file format');
    }
    if (!imported.length) throw new Error('File contains no slides');

    // If no existing slides, skip modal and just load directly
    if (!slides.length) {
      slides = imported;
      currentIdx = 0;
      renderAll(); renderPreview(); renderEditor();
      scheduleSave();
      showToast(`✓ Imported ${imported.length} slide${imported.length > 1 ? 's' : ''}`, 'success');
      return;
    }

    // Show modal to let user choose Replace or Append
    _pendingImport = imported;
    const n = imported.length;
    document.getElementById('import-modal-info').textContent =
      `"${fileName || 'file'}" contains ${n} slide${n > 1 ? 's' : ''}. ` +
      `You currently have ${slides.length} slide${slides.length > 1 ? 's' : ''}.`;
    // Default to Append when slides already exist
    document.getElementById('import-mode-append').checked = true;
    document.getElementById('import-opt-replace').style.borderColor = '#2a2a2e';
    document.getElementById('import-opt-append').style.borderColor  = '#60a5fa';
    document.getElementById('import-modal').style.display = 'flex';
  } catch(e) {
    showToast('Import error: ' + e.message, 'error');
  }
}

function closeImportModal() {
  _pendingImport = null;
  document.getElementById('import-modal').style.display = 'none';
}

function confirmImport() {
  if (!_pendingImport) return;
  const mode = document.querySelector('input[name="import-mode"]:checked').value;
  const imported = _pendingImport;
  if (mode === 'replace') {
    slides = imported;
    currentIdx = 0;
  } else {
    // Append to end — reassign fresh IDs so imported slides never collide with
    // existing thumbCache entries (same-ID collision would displace old thumbs).
    const existingIds = new Set(slides.map(s => String(s.id)));
    const remapped = imported.map(s => {
      let newId = Date.now() + Math.random();
      while (existingIds.has(String(newId))) newId = Date.now() + Math.random();
      existingIds.add(String(newId));
      return Object.assign({}, s, { id: newId });
    });
    slides.push(...remapped);
    // currentIdx unchanged
  }
  closeImportModal();
  renderAll(); renderPreview(); renderEditor();
  scheduleSave();
  // For append: reset scroll to top so all existing slides remain visible.
  // New slides are at the bottom and can be reached by scrolling down.
  if (mode === 'append') {
    requestAnimationFrame(() => {
      document.getElementById('slide-list').scrollTop = 0;
    });
  }
  showToast(`\u2713 ${mode === 'replace' ? 'Replaced with' : 'Appended'} ${imported.length} slide${imported.length > 1 ? 's' : ''}`, 'success');
}

// ══════════════════════════════════════════════════
//  VASANAM SLIDE GENERATOR
// ══════════════════════════════════════════════════
function createVasanamHtml(verseText, verseRef, bgColor, textColor, fontSize) {
  // fontSize param kept for compatibility but auto-fit handles sizing dynamically
  const bg  = bgColor   || '#3c096c';
  const col = textColor || '#ffd700';
  return `<!DOCTYPE html><html lang="ta"><head><meta charset="UTF-8">
<style>
@font-face{font-family:'Noto Serif Tamil';src:local('Noto Serif Tamil'),local('Nirmala UI'),local('Vijaya'),local('Latha'),local('Tamil Sangam MN');font-weight:400 900;}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:100%;height:100%;overflow:hidden;}
body{
  background:${bg};
  display:flex;align-items:center;justify-content:center;
  font-family:'Noto Serif Tamil',serif;padding:1.2vw;position:relative;
}
.verse-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;gap:0.6vh;overflow:hidden;}
.verse-text{
  font-weight:900;color:${col};text-align:center;line-height:1.22;word-break:break-word;width:100%;
}
.verse-ref{
  color:${col};opacity:0.9;font-style:italic;letter-spacing:2px;text-align:right;align-self:flex-end;padding-right:1vw;
  font-weight:900;
}
<\/style><\/head><body>
<div class="verse-wrap" id="vwrap">
  <div class="verse-text" id="vtext">${verseText}<\/div>
  ${verseRef ? `<div class="verse-ref" id="vref">— ${verseRef}<\/div>` : ''}
<\/div>
<script>
var MAX_FONT = 130;
function autoFit() {
  var wrap = document.getElementById('vwrap');
  var vt   = document.getElementById('vtext');
  var vr   = document.getElementById('vref');
  if (!wrap || !vt) return;
  var availW = wrap.clientWidth;
  var availH = wrap.clientHeight;
  if (availH < 10 || availW < 10) { setTimeout(autoFit, 100); return; }
  vt.style.width = '100%';
  var lo = 8, hi = Math.min(availH, MAX_FONT);
  for (var i = 0; i < 30; i++) {
    var mid = (lo + hi) / 2;
    vt.style.fontSize = mid + 'px';
    if (vr) vr.style.fontSize = (mid * 0.32) + 'px';
    var needed = vt.scrollHeight + (vr ? vr.offsetHeight + mid * 0.2 : 0);
    if (needed > availH || vt.scrollWidth > vt.clientWidth + 1) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  vt.style.fontSize = lo + 'px';
  if (vr) vr.style.fontSize = (lo * 0.32) + 'px';
}
document.fonts ? document.fonts.ready.then(autoFit) : window.addEventListener('load', autoFit);
window.addEventListener('resize', autoFit);
<\/script>
<\/body><\/html>`;
}

// ── ANIME (Static dark navy gradient) version of Vasanam slide ──
function createAnimeVasanamHtml(verseText, verseRef) {
  return `<!DOCTYPE html><html lang="ta"><head><meta charset="UTF-8">
<style>
@font-face{font-family:'Noto Serif Tamil';src:local('Noto Serif Tamil'),local('Nirmala UI'),local('Vijaya'),local('Latha'),local('Tamil Sangam MN');font-weight:400 900;}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:100%;height:100%;overflow:hidden;}
body{background:linear-gradient(180deg,#020510 0%,#0a1628 40%,#162a50 70%,#1b3a5c 100%);display:flex;align-items:center;justify-content:center;font-family:'Noto Serif Tamil',serif;padding:1.2vw;position:relative;}
.sky{position:absolute;inset:0;z-index:0;}
.verse-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;gap:0.6vh;overflow:hidden;position:relative;z-index:5;}
.verse-text{font-weight:900;color:#ffffff;text-align:center;line-height:1.22;word-break:break-word;width:100%;text-shadow:0 2px 10px rgba(0,0,0,0.8);}
.verse-ref{color:#ffffff;opacity:0.9;font-style:italic;letter-spacing:2px;text-align:right;align-self:flex-end;padding-right:1vw;font-weight:900;text-shadow:0 2px 6px rgba(0,0,0,0.6);}
<\/style><\/head><body>
<div class="sky"><\/div>
<div class="verse-wrap" id="vwrap">
  <div class="verse-text" id="vtext">${verseText}<\/div>
  ${verseRef ? `<div class="verse-ref" id="vref">— ${verseRef}<\/div>` : ''}
<\/div>
<script>
var MAX_FONT = 130;
function autoFit() {
  var wrap = document.getElementById('vwrap');
  var vt   = document.getElementById('vtext');
  var vr   = document.getElementById('vref');
  if (!wrap || !vt) return;
  var availW = wrap.clientWidth;
  var availH = wrap.clientHeight;
  if (availH < 10 || availW < 10) { setTimeout(autoFit, 100); return; }
  vt.style.width = '100%';
  var lo = 8, hi = Math.min(availH, MAX_FONT);
  for (var i = 0; i < 30; i++) {
    var mid = (lo + hi) / 2;
    vt.style.fontSize = mid + 'px';
    if (vr) vr.style.fontSize = (mid * 0.32) + 'px';
    var needed = vt.scrollHeight + (vr ? vr.offsetHeight + mid * 0.2 : 0);
    if (needed > availH || vt.scrollWidth > vt.clientWidth + 1) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  vt.style.fontSize = lo + 'px';
  if (vr) vr.style.fontSize = (lo * 0.32) + 'px';
}
document.fonts ? document.fonts.ready.then(autoFit) : window.addEventListener('load', autoFit);
window.addEventListener('resize', autoFit);
<\/script>
<\/body><\/html>`;
}

// ══════════════════════════════════════════════════
//  SLIDE DATA HELPERS
// ══════════════════════════════════════════════════
function createSlide(type) {
  const id = Date.now() + Math.random();
  if (type === 'html') {
    return { id, type: 'html', name: 'HTML Slide', html: '' };
  } else {
    return {
      id, type: 'simple', name: 'New Slide',
      title: 'Slide Title', body: '• Point one\n• Point two\n• Point three',
      bg: '#3c096c', color: '#ffd700', layout: 'center', font: 'Noto Serif Tamil'
    };
  }
}

// Offline font stacks — no CDN needed
const GOOGLE_FONT_URLS = {};

function simpleToHtml(s) {
  const align      = s.layout === 'left' ? 'left' : 'center';
  const alignItems = s.layout === 'left' ? 'flex-start' : 'center';
  const padding    = s.layout === 'left' ? '4vw 8vw' : '4vw 6vw';
  const hasTitle   = s.title && s.title.trim();
  const hasBody    = s.body  && s.body.trim();
  const fontName   = s.font  || 'Noto Serif Tamil';
  const fontStack  = `'${fontName}', Georgia, serif`;
  const gfUrl      = GOOGLE_FONT_URLS[fontName];
  const gfLink     = gfUrl ? `<link href="${gfUrl}" rel="stylesheet">` : '';

  const bodyLines = hasBody ? s.body.split('\n').filter(l => l.trim()).map(l =>
    l.startsWith('•') || l.startsWith('-')
      ? `<div class="bullet">❯ ${l.replace(/^[•\-]\s*/,'')}<\/div>`
      : `<div class="bline">${l}<\/div>`
  ).join('') : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${gfLink}
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:100%;height:100%;overflow:hidden;}
body{background:${s.bg};display:flex;align-items:center;justify-content:center;padding:${padding};}
.wrap{display:flex;flex-direction:column;align-items:${alignItems};width:100%;height:100%;justify-content:center;gap:0.45em;overflow:hidden;}
.s-title{
  font-weight:900;
  color:${s.color};
  text-align:${align};
  line-height:1.2;
  font-family:${fontStack};
  word-break:break-word;
  letter-spacing:0.04em;
  text-shadow:0 2px 18px rgba(0,0,0,0.45),0 0 40px rgba(0,0,0,0.25);
}
.s-body{
  font-weight:800;
  color:${s.color};
  text-align:${align};
  line-height:1.55;
  font-family:${fontStack};
  opacity:0.96;
  word-break:break-word;
  letter-spacing:0.025em;
}
.bullet{margin-bottom:0.22em;}
.bline{margin-bottom:0.12em;}
.divider{
  width:${align==='center'?'50%':'65%'};
  height:2px;
  background:${s.color};
  opacity:0.35;
  margin:0.2em ${align==='center'?'auto':'0'};
  border-radius:2px;
}
<\/style><\/head><body>
<div class="wrap" id="swrap">
  ${hasTitle ? `<div class="s-title" id="stitle">${s.title}<\/div>` : ''}
  ${hasTitle && hasBody ? `<div class="divider"><\/div>` : ''}
  ${hasBody  ? `<div class="s-body"  id="sbody">${bodyLines}<\/div>` : ''}
<\/div>
<script>
function autoFit() {
  var wrap  = document.getElementById('swrap');
  var title = document.getElementById('stitle');
  var body  = document.getElementById('sbody');
  if (!wrap) return;
  var availW = wrap.clientWidth, availH = wrap.clientHeight;
  if (availH < 10 || availW < 10) return;
  // Reset first so measurements start clean on each call
  if (title) title.style.fontSize = '';
  if (body)  body.style.fontSize  = '';
  var lo = 6, hi = availH * 0.92;
  for (var i = 0; i < 32; i++) {
    var mid = (lo + hi) / 2;
    if (title) title.style.fontSize = mid + 'px';
    if (body)  body.style.fontSize  = (title ? mid * 0.58 : mid) + 'px';
    // Measure each child's rendered height directly.
    // wrap.scrollHeight is UNRELIABLE in a flex container with justify-content:center
    // + overflow:hidden because upward overflow is silently clipped and not reported.
    var needed = (title ? title.offsetHeight : 0)
               + (body  ? body.offsetHeight  : 0)
               + 28; // budget for divider + flex gaps
    var wideT = title && title.scrollWidth > availW * 0.98;
    var wideB = body  && body.scrollWidth  > availW * 0.98;
    if (needed > availH * 0.92 || wideT || wideB) { hi = mid; } else { lo = mid; }
  }
  if (title) title.style.fontSize = lo + 'px';
  if (body)  body.style.fontSize  = (title ? lo * 0.58 : lo) + 'px';
}
document.addEventListener('DOMContentLoaded', autoFit);
document.fonts ? document.fonts.ready.then(autoFit) : window.addEventListener('load', autoFit);
window.addEventListener('resize', autoFit);
<\/script>
<\/body><\/html>`;
}

function getHtml(slide) {
  return slide.type === 'html' ? slide.html : simpleToHtml(slide);
}

// Thumbnail variant: animations fast-forwarded to final state so visible content
// shows instantly without CPU-burning canvas loops.
// Result is cached directly on the slide object (slide._thumbHtml) so renderAll()
// never recomputes it for slides that haven't changed.
function getThumbHtml(slide) {
  if (slide._thumbHtml !== undefined) return slide._thumbHtml;
  const html = getHtml(slide);
  // Use a large negative delay so all animations immediately reach their
  // 100% (final) keyframe — combined with animation-fill-mode:forwards on
  // each slide's own styles, all elements instantly appear at their end state.
  const freeze =
    '<style>*,*::before,*::after{' +
      'animation-delay:-9999s!important;' +
      'animation-duration:1ms!important;' +
      'animation-iteration-count:1!important;' +
      'animation-play-state:running!important;' +
      'transition:none!important;}' +
      'canvas{display:none!important;}' +
      'video{display:none!important;}' +
    '</style>' +
    // Stop requestAnimationFrame loops (canvas draw calls) silently
    '<script>window.requestAnimationFrame=function(){return 0;};' +
      'window.cancelAnimationFrame=function(){};' +
    '<\/script>';
  const hi = html.indexOf('</head>');
  const result = hi !== -1 ? html.slice(0, hi) + freeze + html.slice(hi) : freeze + html;
  slide._thumbHtml = result;
  return result;
}

// ══════════════════════════════════════════════════
//  RENDER  (diff-based, reuses iframe DOM nodes)
// ══════════════════════════════════════════════════

// Cache: slideId (string) → thumb <div> element
const thumbCache = {};

// Build a brand-new thumb element for a slide (called only once per slide).
// The iframe starts empty; _thumbObserver sets srcdoc when the thumb scrolls
// into the visible area of the slide-list panel (lazy loading).
function buildThumb(s) {
  const sid = String(s.id);
  const thumb = document.createElement('div');
  thumb.dataset.slideId = sid;
  // Use data-idx at click time so index is always current after reorder
  thumb.addEventListener('click', () => {
    if (thumbDragged) { thumbDragged = false; return; }
    selectSlide(Number(thumb.dataset.idx));
  });

  const fr = document.createElement('iframe');
  fr.sandbox = 'allow-scripts allow-same-origin';
  // Defer the srcdoc write; _thumbObserver triggers it once visible
  fr._pendingHtml = getThumbHtml(s);
  fr._loaded = false;
  thumb.appendChild(fr);

  const num = document.createElement('div'); num.className = 'thumb-num';
  thumb.appendChild(num);
  const lbl = document.createElement('div'); lbl.className = 'thumb-label';
  thumb.appendChild(lbl);

  const grip = document.createElement('div');
  grip.className = 'thumb-grip';
  grip.textContent = '⠇ ⠇ ⠇';
  grip.title = 'Drag to reorder';
  grip.addEventListener('mousedown', (e) => {
    e.preventDefault(); e.stopPropagation();
    startThumbDrag(e, Number(thumb.dataset.idx));
  });
  thumb.appendChild(grip);

  const moveWrap = document.createElement('div'); moveWrap.className = 'thumb-move-wrap';
  const btnUp   = document.createElement('button'); btnUp.className   = 'thumb-move'; btnUp.textContent   = '▲'; btnUp.title   = 'Move slide up';
  const btnDown = document.createElement('button'); btnDown.className = 'thumb-move'; btnDown.textContent = '▼'; btnDown.title = 'Move slide down';
  // Read dataset.idx at event time so handler is always correct after reorder
  btnUp.addEventListener('mousedown',   (e) => { e.stopPropagation(); e.preventDefault(); moveSlide(Number(thumb.dataset.idx), -1); });
  btnDown.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); moveSlide(Number(thumb.dataset.idx),  1); });
  moveWrap.appendChild(btnUp); moveWrap.appendChild(btnDown);
  thumb.appendChild(moveWrap);

  thumbCache[sid] = thumb;
  return thumb;
}

// Update a single thumb's iframe when slide content changed (after Apply).
function updateThumb(idx) {
  const s = slides[idx];
  if (!s) return;
  const thumb = thumbCache[String(s.id)];
  if (!thumb) return;
  const fr = thumb.querySelector('iframe');
  const newHtml = getThumbHtml(s);
  fr._pendingHtml = newHtml;
  // If already loaded/visible, update immediately; otherwise observer handles it
  if (fr._loaded && fr._lastSrcdoc !== newHtml) {
    fr._lastSrcdoc = newHtml;
    fr.srcdoc = newHtml;
  }
  thumb.querySelector('.thumb-label').textContent = s.name;
}

function renderAll() {
  const list = document.getElementById('slide-list');

  // Ensure the + button exists (reuse across renders)
  let addBtn = list.querySelector('.add-slide-btn');
  if (!addBtn) {
    addBtn = document.createElement('div');
    addBtn.className = 'add-slide-btn';
    addBtn.textContent = '+';
    addBtn.title = 'Add HTML slide';
    addBtn.onclick = () => addSlide('html');
    list.appendChild(addBtn);
  }

  const activeIds = new Set(slides.map(s => String(s.id)));

  // Remove thumbs for deleted slides from cache + DOM
  for (const id of Object.keys(thumbCache)) {
    if (!activeIds.has(id)) {
      const el = thumbCache[id];
      if (el.parentNode) el.parentNode.removeChild(el);
      delete thumbCache[id];
    }
  }

  slides.forEach((s, i) => {
    const sid = String(s.id);
    // Reuse or create thumb
    const isNew = !thumbCache[sid];
    const thumb = thumbCache[sid] || buildThumb(s);

    // Update pending HTML; _thumbObserver triggers srcdoc write when visible
    const fr = thumb.querySelector('iframe');
    const newHtml = getThumbHtml(s);
    if (fr._pendingHtml !== newHtml) {
      fr._pendingHtml = newHtml;
      // If it's already been loaded/visible, refresh immediately
      if (fr._loaded) { fr._lastSrcdoc = newHtml; fr.srcdoc = newHtml; }
    }

    // Update cheap mutable parts
    thumb.dataset.idx = i;
    thumb.className = 'thumb' + (i === currentIdx ? ' active' : '');
    thumb.querySelector('.thumb-num').textContent  = i + 1;
    thumb.querySelector('.thumb-label').textContent = s.name;

    // Only call insertBefore if thumb is not already in the correct position.
    // Skipping unnecessary DOM moves prevents browsers from resetting srcdoc
    // on iframes that are moved within the same parent.
    // NEW thumbs (not yet in the DOM) always need insertBefore — their
    // nextSibling is null and the next slide's thumb may not exist yet,
    // so the `nextSibling !== expectedNext` check would incorrectly skip them.
    const expectedNext = (i + 1 < slides.length)
      ? (thumbCache[String(slides[i + 1].id)] || null)
      : addBtn;
    if (isNew || thumb.nextSibling !== expectedNext) {
      list.insertBefore(thumb, addBtn);
      // Re-assert srcdoc for already-loaded thumbs whose content may have been
      // cleared by the browser during the DOM move.
      if (!isNew && fr._loaded && fr._pendingHtml) {
        fr._lastSrcdoc = fr._pendingHtml;
        fr.srcdoc = fr._pendingHtml;
      }
    }

    // Start observing after the element is in the DOM (observer needs it mounted)
    if (isNew) _thumbObserver.observe(thumb);
  });

  document.getElementById('slide-counter').textContent =
    slides.length ? `${currentIdx + 1} / ${slides.length}` : '— / —';
}

function moveSlide(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= slides.length) return;
  const tmp = slides[idx];
  slides[idx] = slides[newIdx];
  slides[newIdx] = tmp;
  if (currentIdx === idx) currentIdx = newIdx;
  else if (currentIdx === newIdx) currentIdx = idx;
  scheduleSave();
  renderAll();
  renderEditor();
  renderPreview();
}

// ══════════════════════════════════════════════════
//  LIVE GRIP DRAG-AND-DROP
// ══════════════════════════════════════════════════
function startThumbDrag(startEvt, srcIdx) {
  const list = document.getElementById('slide-list');
  let liveIdx = srcIdx;  // current position of the dragged slide in the live list

  // Mark the source thumb
  function getThumbs() { return Array.from(list.querySelectorAll('.thumb')); }
  getThumbs()[srcIdx].classList.add('dnd-moving');

  // Full-page cover so nothing else steals mouse events (esp. iframes in center panel)
  const cover = document.createElement('div');
  cover.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:grabbing;';
  document.body.appendChild(cover);

  function clearHighlights() {
    getThumbs().forEach(t => t.classList.remove('dnd-target-above','dnd-target-below'));
  }

  function onMove(ev) {
    clearHighlights();
    const thumbs = getThumbs();
    let hoverIdx = -1;
    let hoverHalf = 'above';
    for (let i = 0; i < thumbs.length; i++) {
      const r = thumbs[i].getBoundingClientRect();
      if (ev.clientY >= r.top && ev.clientY <= r.bottom) {
        hoverIdx  = i;
        hoverHalf = ev.clientY < (r.top + r.height / 2) ? 'above' : 'below';
        break;
      }
    }
    if (hoverIdx === -1 || hoverIdx === liveIdx) return;

    // Work out target position
    let targetIdx = hoverHalf === 'above' ? hoverIdx : hoverIdx + 1;
    if (targetIdx > liveIdx) targetIdx--;   // compensate for moving source
    if (targetIdx === liveIdx) return;

    // Live-move in slides[]
    const moved = slides.splice(liveIdx, 1)[0];
    slides.splice(targetIdx, 0, moved);
    if      (currentIdx === liveIdx)                               currentIdx = targetIdx;
    else if (currentIdx > liveIdx  && currentIdx <= targetIdx)    currentIdx--;
    else if (currentIdx < liveIdx  && currentIdx >= targetIdx)    currentIdx++;
    liveIdx = targetIdx;

    // Lightweight re-render of just the list (no preview reload)
    renderList();
    getThumbs()[liveIdx].classList.add('dnd-moving');

    // Auto-scroll
    const lr = list.getBoundingClientRect();
    if (ev.clientY < lr.top    + 40) list.scrollTop -= 10;
    if (ev.clientY > lr.bottom - 40) list.scrollTop += 10;
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    cover.remove();
    clearHighlights();
    getThumbs().forEach(t => t.classList.remove('dnd-moving'));
    thumbDragged = liveIdx !== srcIdx;
    if (thumbDragged) {
      scheduleSave();
      renderAll();
      renderEditor();
      renderPreview();
    }
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// Lightweight list-only re-render (for live drag preview, no iframes reloaded)
function renderList() {
  const list = document.getElementById('slide-list');
  const addBtn = list.querySelector('.add-slide-btn');
  // Build map: slideId -> thumb element
  const map = {};
  Array.from(list.querySelectorAll('.thumb')).forEach(t => { map[t.dataset.slideId] = t; });
  // Re-insert thumbs in new slides[] order, updating number labels
  slides.forEach((s, i) => {
    const el = map[s.id];
    if (!el) return;
    el.dataset.idx = i;
    el.querySelector('.thumb-num').textContent = i + 1;
    el.classList.toggle('active', i === currentIdx);
    list.insertBefore(el, addBtn);
  });
}

function injectAutoFit(iframe) {
  // Attach only once per iframe element
  if (iframe._autoFitAttached) return;
  iframe._autoFitAttached = true;
  // Inject auto-fit into iframes that have verse-text (old or new vasanam slides)
  iframe.addEventListener('load', function() {
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const vt = doc.getElementById('vtext');
      const vw = doc.getElementById('vwrap');
      // Old slides use .verse-text / .verse-wrap class names, new use ids
      const vtEl = vt || doc.querySelector('.verse-text');
      const vwEl = vw || doc.querySelector('.verse-wrap');
      if (!vtEl || !vwEl) return;
      // Give IDs if missing (old slides)
      if (!vt) vtEl.id = 'vtext';
      if (!vw) vwEl.id = 'vwrap';
      const vr = doc.getElementById('vref') || doc.querySelector('.verse-ref');
      if (vr && !doc.getElementById('vref')) vr.id = 'vref';
      // Don't double-inject if already has autoFit
      if (doc.getElementById('_autofit_injected')) return;
      const s = doc.createElement('script');
      s.id = '_autofit_injected';
      s.textContent = `
        function autoFit() {
          var wrap = document.getElementById('vwrap');
          var vt   = document.getElementById('vtext');
          var vr   = document.getElementById('vref');
          if (!wrap || !vt) return;
          var availW = wrap.clientWidth;
          var availH = wrap.clientHeight;
          if (availH < 10 || availW < 10) { setTimeout(autoFit, 100); return; }
          vt.style.fontSize = '';
          if (vr) vr.style.fontSize = '';
          vt.style.width = '100%';
          var MAX_FONT = 130;
          var lo = 8, hi = Math.min(availH, MAX_FONT);
          for (var i = 0; i < 30; i++) {
            var mid = (lo + hi) / 2;
            vt.style.fontSize = mid + 'px';
            if (vr) vr.style.fontSize = (mid * 0.32) + 'px';
            var needed = vt.scrollHeight + (vr ? vr.offsetHeight + mid * 0.2 : 0);
            if (needed > availH || vt.scrollWidth > vt.clientWidth + 1) { hi = mid; } else { lo = mid; }
          }
          vt.style.fontSize = lo + 'px';
          if (vr) vr.style.fontSize = (lo * 0.32) + 'px';
        }
        autoFit();
        window.addEventListener('resize', autoFit);
      `;
      doc.body.appendChild(s);
    } catch(e) {}
  });
}

let _previewLoadTimer = null;

function renderPreview() {
  const pf = document.getElementById('preview-frame');
  const loadingEl = document.getElementById('preview-loading');

  if (!slides.length) {
    pf.srcdoc = '<body style="background:#08080a"></body>';
    pf._lastSrcdoc = '';
    if (loadingEl) loadingEl.classList.remove('visible');
    return;
  }

  const newHtml = getHtml(slides[currentIdx]);
  // If the content hasn't changed (e.g. tab switch with no edits), skip the reload
  // entirely — this eliminates the blank flash when navigating to the same slide.
  if (pf._lastSrcdoc === newHtml) {
    if (loadingEl) loadingEl.classList.remove('visible');
    return;
  }
  pf._lastSrcdoc = newHtml;

  // Show loading spinner
  if (loadingEl) loadingEl.classList.add('visible');
  clearTimeout(_previewLoadTimer);

  injectAutoFit(pf);

  const hideSpinner = () => { if (loadingEl) loadingEl.classList.remove('visible'); };
  pf.addEventListener('load', hideSpinner, { once: true });
  // Fallback: force-hide spinner after 8s if load never fires (e.g. font block)
  _previewLoadTimer = setTimeout(hideSpinner, 8000);

  // Directly assign srcdoc — the browser correctly tears down the old document
  // and creates a fresh one without needing a blank-first reset.
  pf.srcdoc = newHtml;
}

function renderEditor() {
  if (!slides.length) return;
  const s = slides[currentIdx];

  document.getElementById('slide-name').value = s.name;

  if (s.type === 'html') {
    document.getElementById('html-editor').value = s.html;
  } else {
    document.getElementById('s-title').value = s.title || '';
    document.getElementById('s-body').value = s.body || '';
    document.getElementById('s-bg').value = s.bg || '#0a0300';
    document.getElementById('s-bg-text').value = s.bg || '#0a0300';
    document.getElementById('s-color').value = s.color || '#f5d97a';
    document.getElementById('s-color-text').value = s.color || '#f5d97a';
    document.getElementById('s-layout').value = s.layout || 'center';
    document.getElementById('s-font').value   = s.font   || 'Noto Serif Tamil';
  }

  // Auto-switch tab based on slide type
  if (s.type === 'html' && activeTab !== 'html') switchTab('html');
  if (s.type === 'simple' && activeTab !== 'simple') switchTab('simple');
}

function selectSlide(i) {
  currentIdx = i;
  // Lightweight: just flip the active class — no iframe recreation at all
  document.querySelectorAll('#slide-list .thumb').forEach(t => {
    t.classList.toggle('active', Number(t.dataset.idx) === i);
  });
  document.getElementById('slide-counter').textContent =
    slides.length ? `${currentIdx + 1} / ${slides.length}` : '— / —';
  renderPreview();
  renderEditor();
}

// ══════════════════════════════════════════════════
//  ACTIONS
// ══════════════════════════════════════════════════
function addSlide(type) {
  const s = createSlide(type);
  slides.splice(currentIdx + 1, 0, s);
  currentIdx = currentIdx + 1;
  renderAll(); renderPreview(); renderEditor();
  scheduleSave();
}

function deleteCurrentSlide() {
  if (!slides.length) return;
  if (!confirm(`Delete "${slides[currentIdx].name}"?`)) return;
  slides.splice(currentIdx, 1);
  if (currentIdx >= slides.length) currentIdx = slides.length - 1;
  renderAll(); renderPreview(); renderEditor();
  scheduleSave();
}

function applyHtml() {
  if (!slides.length) return;
  slides[currentIdx].html = document.getElementById('html-editor').value;
  slides[currentIdx].type = 'html';
  delete slides[currentIdx]._thumbHtml;   // invalidate cached thumb HTML
  updateThumb(currentIdx);               // refresh the one changed thumbnail
  renderPreview();
  scheduleSave();
}

function applySimple() {
  if (!slides.length) return;
  const s = slides[currentIdx];
  s.type   = 'simple';
  s.title  = document.getElementById('s-title').value;
  s.body   = document.getElementById('s-body').value;
  s.bg     = document.getElementById('s-bg').value;
  s.color  = document.getElementById('s-color').value;
  s.layout = document.getElementById('s-layout').value;
  s.font   = document.getElementById('s-font').value;
  delete s._thumbHtml;           // invalidate cached thumb HTML
  updateThumb(currentIdx);       // refresh the one changed thumbnail
  renderPreview();
  scheduleSave();
}

function updateCurrentName(val) {
  if (!slides.length) return;
  slides[currentIdx].name = val;
  document.getElementById('slide-name').value = val;
  const thumbs = document.querySelectorAll('.thumb-label');
  if (thumbs[currentIdx]) thumbs[currentIdx].textContent = val;
  scheduleSave();
}

function switchTab(tab) {
  activeTab = tab;
  document.getElementById('tab-html').className = 'etab' + (tab === 'html' ? ' active' : '');
  document.getElementById('tab-simple').className = 'etab' + (tab === 'simple' ? ' active' : '');
  document.getElementById('panel-html').style.display = tab === 'html' ? 'flex' : 'none';
  document.getElementById('panel-simple').style.display = tab === 'simple' ? 'flex' : 'none';
}

// ══════════════════════════════════════════════════
//  VASANAM MODAL
// ══════════════════════════════════════════════════
function openVasanamModal() {
  document.getElementById('vasanam-modal').style.display = 'flex';
}
function closeVasanamModal() {
  document.getElementById('vasanam-modal').style.display = 'none';
}
function addVasanamSlide() {
  const text = document.getElementById('vs-text').value.trim();
  const ref  = document.getElementById('vs-ref').value.trim();
  const bg   = document.getElementById('vs-bg').value;
  const col  = document.getElementById('vs-color').value;
  const fs   = document.getElementById('vs-fontsize').value;
  if (!text) { alert('வசன உரை தேவை!'); return; }
  const id = Date.now() + Math.random();
  const slide = { id, type: 'html', name: ref || 'வசனம்', html: createVasanamHtml(text, ref, bg, col, fs) };
  slides.splice(currentIdx + 1, 0, slide);
  currentIdx = currentIdx + 1;
  closeVasanamModal();
  renderAll(); renderPreview(); renderEditor();
  scheduleSave();
}

// Vasanam color pickers sync
document.getElementById('vs-bg').addEventListener('input', e => {
  document.getElementById('vs-bg-text').value = e.target.value;
});
document.getElementById('vs-color').addEventListener('input', e => {
  document.getElementById('vs-color-text').value = e.target.value;
});
document.getElementById('vs-bg-text').addEventListener('input', e => {
  if (/^#[0-9a-f]{6}$/i.test(e.target.value))
    document.getElementById('vs-bg').value = e.target.value;
});
document.getElementById('vs-color-text').addEventListener('input', e => {
  if (/^#[0-9a-f]{6}$/i.test(e.target.value))
    document.getElementById('vs-color').value = e.target.value;
});

// Import modal radio toggle
document.querySelectorAll('input[name="import-mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const isAppend = document.getElementById('import-mode-append').checked;
    document.getElementById('import-opt-replace').style.borderColor = isAppend ? '#2a2a2e' : '#60a5fa';
    document.getElementById('import-opt-append').style.borderColor  = isAppend ? '#60a5fa' : '#2a2a2e';
  });
});

// Export modal radio toggle
document.querySelectorAll('input[name="export-mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const isRange = document.getElementById('export-mode-range').checked;
    document.getElementById('export-range-inputs').style.display = isRange ? 'flex' : 'none';
    document.getElementById('export-opt-all').style.borderColor   = isRange ? '#2a2a2e' : '#34d399';
    document.getElementById('export-opt-range').style.borderColor = isRange ? '#34d399' : '#2a2a2e';
    if (isRange) updateExportRangeInfo();
  });
});

// Color pickers sync
document.getElementById('s-bg').addEventListener('input', e => {
  document.getElementById('s-bg-text').value = e.target.value;
});
document.getElementById('s-color').addEventListener('input', e => {
  document.getElementById('s-color-text').value = e.target.value;
});
document.getElementById('s-bg-text').addEventListener('input', e => {
  if (/^#[0-9a-f]{6}$/i.test(e.target.value))
    document.getElementById('s-bg').value = e.target.value;
});
document.getElementById('s-color-text').addEventListener('input', e => {
  if (/^#[0-9a-f]{6}$/i.test(e.target.value))
    document.getElementById('s-color').value = e.target.value;
});

// ══════════════════════════════════════════════════
//  TAMIL BIBLE PANEL
// ══════════════════════════════════════════════════
const bibleData = {
  // ── OLD TESTAMENT ──
  "ஆதியாகமம்":        { chapters: 50,  versesPerChapter: [] },
  "யாத்திராகமம்":      { chapters: 40,  versesPerChapter: [] },
  "லேவியராகமம்":       { chapters: 27,  versesPerChapter: [] },
  "எண்ணாகமம்":        { chapters: 36,  versesPerChapter: [] },
  "உபாகமம்":          { chapters: 34,  versesPerChapter: [] },
  "யோசுவா":           { chapters: 24,  versesPerChapter: [] },
  "நியாயாதிபதிகள்":    { chapters: 21,  versesPerChapter: [] },
  "ரூத்":             { chapters: 4,   versesPerChapter: [] },
  "1 சாமுவேல்":       { chapters: 31,  versesPerChapter: [] },
  "2 சாமுவேல்":       { chapters: 24,  versesPerChapter: [] },
  "1 இராஜாக்கள்":     { chapters: 22,  versesPerChapter: [] },
  "2 இராஜாக்கள்":     { chapters: 25,  versesPerChapter: [] },
  "1 நாளாகமம்":       { chapters: 29,  versesPerChapter: [] },
  "2 நாளாகமம்":       { chapters: 36,  versesPerChapter: [] },
  "எஸ்றா":            { chapters: 10,  versesPerChapter: [] },
  "நெகேமியா":         { chapters: 13,  versesPerChapter: [] },
  "எஸ்தர்":           { chapters: 10,  versesPerChapter: [] },
  "யோபு":             { chapters: 42,  versesPerChapter: [] },
  "சங்கீதம்":          { chapters: 150, versesPerChapter: [] },
  "நீதிமொழிகள்":       { chapters: 31,  versesPerChapter: [] },
  "பிரசங்கி":          { chapters: 12,  versesPerChapter: [] },
  "உன்னதப்பாட்டு":     { chapters: 8,   versesPerChapter: [] },
  "ஏசாயா":            { chapters: 66,  versesPerChapter: [] },
  "எரேமியா":          { chapters: 52,  versesPerChapter: [] },
  "புலம்பல்":          { chapters: 5,   versesPerChapter: [] },
  "எசேக்கியேல்":       { chapters: 48,  versesPerChapter: [] },
  "தானியேல்":         { chapters: 12,  versesPerChapter: [] },
  "ஓசேயா":            { chapters: 14,  versesPerChapter: [] },
  "யோவேல்":           { chapters: 3,   versesPerChapter: [] },
  "ஆமோஸ்":            { chapters: 9,   versesPerChapter: [] },
  "ஒபதியா":           { chapters: 1,   versesPerChapter: [] },
  "யோனா":             { chapters: 4,   versesPerChapter: [] },
  "மீகா":             { chapters: 7,   versesPerChapter: [] },
  "நாகூம்":            { chapters: 3,   versesPerChapter: [] },
  "ஆபகூக்":           { chapters: 3,   versesPerChapter: [] },
  "செப்பனியா":        { chapters: 3,   versesPerChapter: [] },
  "ஆகாய்":            { chapters: 2,   versesPerChapter: [] },
  "சகரியா":           { chapters: 14,  versesPerChapter: [] },
  "மல்கியா":          { chapters: 4,   versesPerChapter: [] },
  // ── NEW TESTAMENT ──
  "மத்தேயு":          { chapters: 28,  versesPerChapter: [] },
  "மாற்கு":           { chapters: 16,  versesPerChapter: [] },
  "லூக்கா":           { chapters: 24,  versesPerChapter: [] },
  "யோவான்":           { chapters: 21,  versesPerChapter: [] },
  "அப்போஸ்தலருடைய நடபடிகள்": { chapters: 28, versesPerChapter: [] },
  "ரோமர்":            { chapters: 16,  versesPerChapter: [] },
  "1 கொரிந்தியர்":    { chapters: 16,  versesPerChapter: [] },
  "2 கொரிந்தியர்":    { chapters: 13,  versesPerChapter: [] },
  "கலாத்தியர்":       { chapters: 6,   versesPerChapter: [] },
  "எபேசியர்":         { chapters: 6,   versesPerChapter: [] },
  "பிலிப்பியர்":       { chapters: 4,   versesPerChapter: [] },
  "கொலோசியர்":        { chapters: 4,   versesPerChapter: [] },
  "1 தெசலோனிக்கேயர்": { chapters: 5,  versesPerChapter: [] },
  "2 தெசலோனிக்கேயர்": { chapters: 3,  versesPerChapter: [] },
  "1 தீமோத்தேயு":     { chapters: 6,   versesPerChapter: [] },
  "2 தீமோத்தேயு":     { chapters: 4,   versesPerChapter: [] },
  "தீத்து":           { chapters: 3,   versesPerChapter: [] },
  "பிலேமோன்":         { chapters: 1,   versesPerChapter: [] },
  "எபிரேயர்":         { chapters: 13,  versesPerChapter: [] },
  "யாக்கோபு":         { chapters: 5,   versesPerChapter: [] },
  "1 பேதுரு":         { chapters: 5,   versesPerChapter: [] },
  "2 பேதுரு":         { chapters: 3,   versesPerChapter: [] },
  "1 யோவான்":         { chapters: 5,   versesPerChapter: [] },
  "2 யோவான்":         { chapters: 1,   versesPerChapter: [] },
  "3 யோவான்":         { chapters: 1,   versesPerChapter: [] },
  "யூதா":             { chapters: 1,   versesPerChapter: [] },
  "வெளிப்படுத்தல்":    { chapters: 22,  versesPerChapter: [] },
};

// Populate book dropdown on load
(function bpInit() {
  const sel = document.getElementById('bp-book');
  Object.keys(bibleData).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
})();

let _bpOpen = false;
let _bpBook = null, _bpChapter = null, _bpVerse = null;

function toggleBiblePanel() {
  const panel = document.getElementById('bible-panel');
  const btn   = document.getElementById('btn-bible-panel');
  _bpOpen = !_bpOpen;
  panel.classList.toggle('open', _bpOpen);
  btn.classList.toggle('panel-open', _bpOpen);
}

function bpOnBookChange() {
  const bookName = document.getElementById('bp-book').value;
  _bpBook    = bookName || null;
  _bpChapter = null;
  _bpVerse   = null;
  const chapSel  = document.getElementById('bp-chapter');
  const verseSel = document.getElementById('bp-verse');
  chapSel.innerHTML  = '<option value="">— அதிகாரம் —</option>';
  verseSel.innerHTML = '<option value="">— எல்லா வசனங்கள் —</option>';
  verseSel.disabled  = true;
  if (!bookName) { chapSel.disabled = true; bpUpdatePreview(); return; }
  const chapCnt = bibleData[bookName].chapters;
  for (let c = 1; c <= chapCnt; c++) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = `அதிகாரம் ${c}`;
    chapSel.appendChild(opt);
  }
  chapSel.disabled = false;
  bpUpdatePreview();
}

function bpOnChapterChange() {
  const chapNum  = parseInt(document.getElementById('bp-chapter').value);
  _bpChapter     = chapNum || null;
  _bpVerse       = null;
  const verseSel = document.getElementById('bp-verse');
  verseSel.innerHTML = '<option value="">— எல்லா வசனங்கள் —</option>';
  if (!_bpBook || !chapNum) { verseSel.disabled = true; bpUpdatePreview(); return; }
  const data       = bibleData[_bpBook];
  const content    = (data.content && data.content[chapNum]) || null;
  const vpcArr     = data.versesPerChapter;
  let verseCount   = (vpcArr && vpcArr[chapNum - 1]) || 0;
  if (!verseCount && content) verseCount = Object.keys(content).length;
  if (verseCount > 0) {
    for (let v = 1; v <= verseCount; v++) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = `வசனம் ${v}`;
      verseSel.appendChild(opt);
    }
    verseSel.disabled = false;
  } else {
    verseSel.disabled = true;
  }
  bpUpdatePreview();
}

function bpOnVerseChange() {
  _bpVerse = parseInt(document.getElementById('bp-verse').value) || null;
  bpUpdatePreview();
}

function bpUpdatePreview() {
  const emptyEl = document.getElementById('bp-preview-empty');
  const textEl  = document.getElementById('bp-preview-text');
  const refEl   = document.getElementById('bp-preview-ref');
  if (!_bpBook || !_bpChapter) {
    emptyEl.style.display = '';
    textEl.style.display  = 'none';
    refEl.style.display   = 'none';
    return;
  }
  const data    = bibleData[_bpBook];
  const content = (data.content && data.content[_bpChapter]) || null;
  let text = '', ref = `${_bpBook} ${_bpChapter}`;
  if (_bpVerse && content && content[_bpVerse]) {
    text = content[_bpVerse];
    ref  = `${_bpBook} ${_bpChapter}:${_bpVerse}`;
  } else if (!_bpVerse && content) {
    text = Object.entries(content)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([v, t]) => `${v}. ${t}`)
      .join('\n');
  } else {
    text = '(உள்ளடக்கம் இன்னும் சேர்க்கப்படவில்லை — Bible content will be added soon.)';
  }
  textEl.textContent = text;
  refEl.textContent  = ref;
  emptyEl.style.display = 'none';
  textEl.style.display  = '';
  refEl.style.display   = '';
}

function _bpBuildSlideHtml() {
  const text = document.getElementById('bp-preview-text').textContent;
  const ref  = document.getElementById('bp-preview-ref').textContent;
  if (!text || text.includes('இன்னும் சேர்க்கப்படவில்லை')) return null;
  const anime = document.getElementById('bp-anime-check').checked;
  if (anime) return createAnimeVasanamHtml(text, ref);
  return createVasanamHtml(text, ref, '#3c096c', '#ffd700', 'medium');
}

function bpShowFullscreen() {
  if (!_bpBook || !_bpChapter) { showToast('வசனம் தேர்ந்தெடுக்கவும்', 'error'); return; }
  const html = _bpBuildSlideHtml();
  if (!html) { showToast('Bible content not loaded yet — add verses first', 'error'); return; }
  const ref = document.getElementById('bp-preview-ref').textContent;
  // Show overlay FIRST so the iframe has real dimensions when autoFit runs
  document.getElementById('present-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
  const pif = document.getElementById('present-iframe');
  injectAutoFit(pif);
  pif.srcdoc = html;
  document.getElementById('present-indicator').textContent = ref;
}

function bpAddAsSlide() {
  if (!_bpBook || !_bpChapter) { showToast('வசனம் தேர்ந்தெடுக்கவும்', 'error'); return; }
  const html = _bpBuildSlideHtml();
  if (!html) { showToast('Bible content not loaded yet — add verses first', 'error'); return; }
  const ref   = document.getElementById('bp-preview-ref').textContent;
  const slide = { id: Date.now() + Math.random(), type: 'html', name: ref, html };
  slides.push(slide);
  currentIdx = slides.length - 1;
  renderAll(); renderPreview(); renderEditor();
  scheduleSave();
  showToast(`✓ Slide added: ${ref}`, 'success');
}

// ══════════════════════════════════════════════════
//  SONG BOOK PANEL
// ══════════════════════════════════════════════════
let _spOpen = false;
let _spSongId = null;
let _spSongKeys = [];   // sorted array of song IDs
let _spFilteredKeys = []; // currently visible IDs after search
let _spSongDbFileHandle = null; // File System Access API handle
let _spSongDbIdbHandle  = null; // IDB-restored handle waiting for permission grant
let _spFsEditorMode = 'edit'; // 'edit' | 'new'

// ── IndexedDB helpers: persist FileSystemFileHandle + local songs ────────────
function _spIdbUpgrade(e) {
  const db = e.target.result;
  if (!db.objectStoreNames.contains('handles'))    db.createObjectStore('handles');
  if (!db.objectStoreNames.contains('localSongs')) db.createObjectStore('localSongs');
}

function _spIdbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('BiblePresenterDb', 2);
    req.onupgradeneeded = _spIdbUpgrade;
    req.onsuccess = e => res(e.target.result);
    req.onerror   = () => rej(req.error);
  });
}

async function _spIdbPutHandle(handle) {
  try {
    const db = await _spIdbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'songContent');
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror   = () => { db.close(); rej(tx.error); };
    });
  } catch (_) {}
}

async function _spIdbGetHandle() {
  try {
    const db = await _spIdbOpen();
    return await new Promise(res => {
      const tx = db.transaction('handles', 'readonly');
      const get = tx.objectStore('handles').get('songContent');
      get.onsuccess = () => { db.close(); res(get.result || null); };
      get.onerror   = () => { db.close(); res(null); };
    });
  } catch (_) { return null; }
}

async function _spIdbSaveSong(id, song) {
  try {
    const db = await _spIdbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction('localSongs', 'readwrite');
      tx.objectStore('localSongs').put(song, id);
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror   = () => { db.close(); rej(tx.error); };
    });
  } catch (_) {}
}

async function _spIdbLoadAllSongs() {
  try {
    const db = await _spIdbOpen();
    return await new Promise(res => {
      const tx    = db.transaction('localSongs', 'readonly');
      const all   = {};
      const cur   = tx.objectStore('localSongs').openCursor();
      cur.onsuccess = ev => {
        const c = ev.target.result;
        if (c) { all[c.key] = c.value; c.continue(); }
      };
      tx.oncomplete = () => { db.close(); res(all); };
      tx.onerror    = () => { db.close(); res({}); };
    });
  } catch (_) { return {}; }
}

// ── Pure JS file writing (File System Access API) ──

async function _spGetFileHandle() {
  // Reuse existing handle
  if (_spSongDbFileHandle) return _spSongDbFileHandle;
  // Try IDB-stored handle
  if (_spSongDbIdbHandle) {
    try {
      const perm = await _spSongDbIdbHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        _spSongDbFileHandle = _spSongDbIdbHandle;
        _spSongDbIdbHandle = null;
        return _spSongDbFileHandle;
      }
    } catch (_) {}
  }
  // Ask user to pick the file (first time only)
  if (!window.showSaveFilePicker) return null;
  try {
    _spSongDbFileHandle = await window.showSaveFilePicker({
      suggestedName: 'song_content.js',
      types: [{ description: 'JavaScript', accept: { 'text/javascript': ['.js'] } }]
    });
    _spIdbPutHandle(_spSongDbFileHandle);
    return _spSongDbFileHandle;
  } catch (e) {
    return null;
  }
}

async function _spWriteFile(jsText) {
  const handle = await _spGetFileHandle();
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(jsText);
    await writable.close();
    return true;
  }
  return false;
}

async function _spAppendToFile(id, song) {
  const handle = await _spGetFileHandle();
  if (!handle) return false;
  const file = await handle.getFile();
  const text = await file.text();
  const patched = _spAppendSongEntryToJsText(text, id, song);
  if (!patched) return false;
  const writable = await handle.createWritable();
  await writable.write(patched);
  await writable.close();
  return true;
}


async function _spTrySilentHandleRestore() {
  if (_spSongDbFileHandle) return true;
  const h = await _spIdbGetHandle();
  if (!h) return false;
  try {
    const perm = await h.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      _spSongDbFileHandle = h;
      return true;
    }
    _spSongDbIdbHandle = h; // save for requestPermission on next user gesture
  } catch (_) {}
  return false;
}

// Build the song list on load
(function spInit() {
  if (typeof songContent === 'undefined') return;
  _spSongKeys = Object.keys(songContent).map(Number).sort((a, b) => a - b);
  _spFilteredKeys = _spSongKeys.slice();
  spPopulateList(_spFilteredKeys);

  setTimeout(async () => {
    try {
      // Load locally-saved songs from IDB and merge into songContent
      const local = await _spIdbLoadAllSongs();
      const localIds = Object.keys(local).map(Number);
      if (localIds.length) {
        localIds.forEach(id => { songContent[id] = local[id]; });
        _spSongKeys = Object.keys(songContent).map(Number).sort((a, b) => a - b);
        _spFilteredKeys = _spSongKeys.slice();
        spPopulateList(_spFilteredKeys);
      }
      await _spTrySilentHandleRestore();
    } catch (e) {}
  }, 300);
})();

function spPopulateList(keys) {
  const sel = document.getElementById('sp-song');
  sel.innerHTML = '';
  keys.forEach(id => {
    const s = songContent[id];
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `${id}. ${s.title}`;
    sel.appendChild(opt);
  });
}

function toggleSongPanel() {
  const panel = document.getElementById('song-panel');
  const btn   = document.getElementById('btn-song-panel');
  _spOpen = !_spOpen;
  panel.classList.toggle('open', _spOpen);
  btn.classList.toggle('panel-open', _spOpen);
  // Close bible panel if open
  if (_spOpen && _bpOpen) toggleBiblePanel();
}

function spTogglePicker() {
  document.getElementById('sp-picker').classList.toggle('collapsed');
}

function spOnSearch() {
  const q = document.getElementById('sp-search').value.trim().toLowerCase();
  if (!q) {
    _spFilteredKeys = _spSongKeys.slice();
  } else {
    _spFilteredKeys = _spSongKeys.filter(id => {
      const s = songContent[id];
      return s.title.toLowerCase().includes(q)
          || String(id).includes(q)
          || (s.artist && s.artist.toLowerCase().includes(q));
    });
  }
  spPopulateList(_spFilteredKeys);
}

function spOnSongChange() {
  const val = document.getElementById('sp-song').value;
  _spSongId = val !== '' ? Number(val) : null;
  spUpdatePreview();
  spSyncFsEditorFromCurrentSong();
  // Collapse picker and update label when song selected
  if (_spSongId !== null && songContent[_spSongId]) {
    const song = songContent[_spSongId];
    document.getElementById('sp-picker-label').textContent = `#${_spSongId} — ${song.title}`;
    document.getElementById('sp-picker').classList.add('collapsed');
  }
}

function spUpdatePreview() {
  const emptyEl = document.getElementById('sp-preview-empty');
  const titleEl = document.getElementById('sp-preview-title');
  const artistEl = document.getElementById('sp-preview-artist');
  const textEl  = document.getElementById('sp-preview-text');
  const refEl   = document.getElementById('sp-preview-ref');
  if (_spSongId === null || !songContent[_spSongId]) {
    emptyEl.style.display = '';
    titleEl.style.display = 'none';
    artistEl.style.display = 'none';
    textEl.style.display  = 'none';
    refEl.style.display   = 'none';
    return;
  }
  const song = songContent[_spSongId];
  titleEl.textContent = song.title;
  artistEl.textContent = song.artist ? `Artist: ${song.artist}` : '';
  // Normalize line endings and preserve blank lines as paragraph breaks
  const cleaned = song.content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')       // trim trailing spaces per line
    .replace(/\n{3,}/g, '\n\n');    // collapse 3+ newlines to 2
  textEl.textContent = cleaned;
  refEl.textContent = `Song #${_spSongId}`;
  emptyEl.style.display = 'none';
  titleEl.style.display = '';
  artistEl.style.display = song.artist ? '' : 'none';
  textEl.style.display  = '';
  refEl.style.display   = '';
}

function _spBuildSlideHtml() {
  if (_spSongId === null || !songContent[_spSongId]) return null;
  const song = songContent[_spSongId];
  const text = song.content;
  const ref = `${song.title}  (Song #${_spSongId})`;
  const songSlideBg = 'linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%)';
  return createVasanamHtml(text, ref, songSlideBg, '#f8fafc', 'medium');
}

function _spBuildPageHtml() {
  if (_spSongId === null || !songContent[_spSongId]) return null;
  const song = songContent[_spSongId];
  const cleaned = song.content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
  const escaped = cleaned
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  const artistLine = song.artist ? `<div style="font-size:14px;color:#6b6b75;margin-bottom:12px;">Artist: ${song.artist.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>` : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+Tamil&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%); color: #f8fafc;
      font-family: 'Noto Serif Tamil', serif;
      padding: 40px 60px 60px;
      line-height: 2.2;
      overflow-y: auto;
    }
    body::-webkit-scrollbar { width: 6px; }
    body::-webkit-scrollbar-thumb { background: rgba(52,211,153,0.3); border-radius: 3px; }
    h1 { color: #34d399; font-size: 28px; margin-bottom: 8px; line-height: 1.4; }
    .content { font-size: 20px; }
    .ref { text-align: right; color: #34d399; font-size: 13px; margin-top: 30px; padding-top: 12px; border-top: 1px solid rgba(52,211,153,0.25); font-family: monospace; }
  </style></head><body>
    <h1>${song.title.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</h1>
    ${artistLine}
    <div class="content">${escaped}</div>
    <div class="ref">Song #${_spSongId}</div>
  </body></html>`;
}

function spShowFullscreen() {
  if (_spSongId === null) { showToast('பாடல் தேர்ந்தெடுக்கவும்', 'error'); return; }
  const html = _spBuildPageHtml();
  if (!html) { showToast('Song content not available', 'error'); return; }
  const song = songContent[_spSongId];
  const overlay = document.getElementById('present-overlay');
  overlay.classList.add('active', 'panel-fs');
  document.body.style.overflow = 'hidden';
  const pif = document.getElementById('present-iframe');
  pif.srcdoc = html;
  document.getElementById('present-indicator').textContent = song.title;
  spSetFsEditorMode('edit');
  spSyncFsEditorFromCurrentSong();
  _spPopulateVerses(song);
}

function spSetFsEditorMode(mode) {
  _spFsEditorMode = mode === 'new' ? 'new' : 'edit';
  const saveCurrentBtn = document.querySelector('.sp-fs-db-btn.save');
  if (saveCurrentBtn) saveCurrentBtn.style.display = _spFsEditorMode === 'new' ? 'none' : '';
}

function spOpenNewSongEditor() {
  const overlay = document.getElementById('present-overlay');
  overlay.classList.add('active', 'panel-fs');
  document.body.style.overflow = 'hidden';
  spSetFsEditorMode('new');

  const pif = document.getElementById('present-iframe');
  pif.srcdoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;overflow:hidden}
    body{display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%);color:#f8fafc;font-family:'Noto Serif Tamil','Nirmala UI',serif;padding:4vw}
    .box{text-align:center;max-width:900px}
    h1{font-size:48px;line-height:1.25;color:#7dd3fc;margin-bottom:12px}
    p{font-size:26px;line-height:1.7;opacity:0.92}
  <\/style></head><body><div class="box"><h1>➕ New Song</h1><p>Use the editor on the right panel and click <b>Save As New</b>.</p></div></body></html>`;

  document.getElementById('present-indicator').textContent = 'New Song';
  document.getElementById('sp-fs-title-text').textContent = 'New Song (unsaved)';

  const titleEl = document.getElementById('sp-db-title');
  const artistEl = document.getElementById('sp-db-artist');
  const contentEl = document.getElementById('sp-db-content');
  if (titleEl) titleEl.value = '';
  if (artistEl) artistEl.value = '';
  if (contentEl) contentEl.value = '';
  if (titleEl) titleEl.focus();

  _spQueue = [];
  _spVerses = [];
  document.getElementById('sp-fs-verses').innerHTML = '<div class="sp-fs-empty">New song mode — enter lyrics and save as new</div>';
  _spRenderQueue();
}

function spSyncFsEditorFromCurrentSong() {
  const titleEl = document.getElementById('sp-db-title');
  const artistEl = document.getElementById('sp-db-artist');
  const contentEl = document.getElementById('sp-db-content');
  if (!titleEl || !artistEl || !contentEl) return;
  if (_spSongId === null || !songContent[_spSongId]) {
    titleEl.value = '';
    artistEl.value = '';
    contentEl.value = '';
    return;
  }
  const song = songContent[_spSongId];
  titleEl.value = song.title || '';
  artistEl.value = song.artist || '';
  contentEl.value = song.content || '';
}

function _spReadFsEditorSongInput() {
  const titleEl = document.getElementById('sp-db-title');
  const artistEl = document.getElementById('sp-db-artist');
  const contentEl = document.getElementById('sp-db-content');
  if (!titleEl || !artistEl || !contentEl) return null;
  const title = titleEl.value.trim();
  const artist = artistEl.value.trim();
  const content = contentEl.value.replace(/\r\n/g, '\n').trim();
  if (!content) { showToast('Lyrics content is required', 'error'); return null; }
  const firstLine = content.split('\n').map(l => l.trim()).find(Boolean) || '';
  const resolvedTitle = title || firstLine.slice(0, 80) || 'New Song';
  return { title: resolvedTitle, artist, content };
}

function _spRefreshSongListAndSelect(songId) {
  _spSongKeys = Object.keys(songContent).map(Number).sort((a, b) => a - b);
  // If search is active, keep it; if song is hidden by filter, reset search.
  spOnSearch();
  const sel = document.getElementById('sp-song');
  let found = false;
  for (let i = 0; i < sel.options.length; i++) {
    if (Number(sel.options[i].value) === songId) { found = true; break; }
  }
  if (!found) {
    document.getElementById('sp-search').value = '';
    _spFilteredKeys = _spSongKeys.slice();
    spPopulateList(_spFilteredKeys);
  }
  sel.value = String(songId);
  _spSongId = songId;
  spUpdatePreview();
  const song = songContent[_spSongId];
  if (song) document.getElementById('sp-picker-label').textContent = `#${_spSongId} — ${song.title}`;
  if (document.getElementById('present-overlay').classList.contains('panel-fs') && song) {
    const html = _spBuildPageHtml();
    if (html) document.getElementById('present-iframe').srcdoc = html;
    document.getElementById('present-indicator').textContent = song.title;
    _spPopulateVerses(song);
  }
}

function _spEscTpl(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

function _spBuildSongContentJsText() {
  const ids = Object.keys(songContent).map(Number).sort((a, b) => a - b);
  const lines = [];
  lines.push('// ══════════════════════════════════════════════════════');
  lines.push('//  Tamil Songs Content — Auto-generated from app editor');
  lines.push('//  Total: ' + ids.length + ' songs');
  lines.push('// ══════════════════════════════════════════════════════');
  lines.push('');
  lines.push('const songContent = {');
  ids.forEach((id, idx) => {
    const s = songContent[id] || {};
    lines.push('');
    lines.push('  // ── Song ' + id + ' ───────────────────────────────────────');
    lines.push('  ' + id + ': {');
    lines.push('    title: `' + _spEscTpl(s.title || '') + '`,');
    lines.push('    artist: ' + JSON.stringify(s.artist || '') + ',');
    lines.push('    content: `' + _spEscTpl(s.content || '') + '`');
    lines.push('  }' + (idx < ids.length - 1 ? ',' : ''));
  });
  lines.push('');
  lines.push('};');
  return lines.join('\n') + '\n';
}

function _spBuildSongEntryBlock(id, song) {
  return [
    '  // ── Song ' + id + ' ───────────────────────────────────────',
    '  ' + id + ': {',
    '    title: `' + _spEscTpl(song.title || '') + '`,',
    '    artist: ' + JSON.stringify(song.artist || '') + ',',
    '    content: `' + _spEscTpl(song.content || '') + '`',
    '  }'
  ].join('\n');
}

function _spAppendSongEntryToJsText(existingText, id, song) {
  const closeMatch = existingText.match(/}\s*;\s*$/);
  if (!closeMatch) return null;
  const closeIndex = closeMatch.index;
  const beforeCloseTrimmed = existingText.slice(0, closeIndex).replace(/\s+$/,'');
  const lastChar = beforeCloseTrimmed.slice(-1);
  const block = _spBuildSongEntryBlock(id, song);
  const sep = (lastChar === '{' || lastChar === ',') ? '\n\n' : ',\n\n';
  return beforeCloseTrimmed + sep + block + '\n\n};\n';
}

async function spSaveCurrentSongToDb() {
  if (_spSongId === null || !songContent[_spSongId]) {
    showToast('Select a song first', 'error');
    return;
  }

  const input = _spReadFsEditorSongInput();
  if (!input) return;
  const updated = { title: input.title, artist: input.artist, content: input.content };
  songContent[_spSongId] = updated;
  await _spIdbSaveSong(_spSongId, updated);
  _spRefreshSongListAndSelect(_spSongId);
  spSyncFsEditorFromCurrentSong();

  try {
    const wrote = await _spWriteFile(_spBuildSongContentJsText());
    if (wrote) {
      showToast(`✓ Song #${_spSongId} saved to song_content.js`, 'success');
    } else {
      showToast(`✓ Song #${_spSongId} saved in memory (browser blocked file save)`, 'info', 4000);
    }
  } catch (e) {
    _spSongDbFileHandle = null;
    showToast('File save failed — try again', 'error');
  }
}

async function spSaveAsNewSongToDb() {
  const input = _spReadFsEditorSongInput();
  if (!input) return;

  const nextId  = _spSongKeys.length ? _spSongKeys[_spSongKeys.length - 1] + 1 : 0;
  const newSong = { title: input.title, artist: input.artist, content: input.content };
  songContent[nextId] = newSong;
  _spRefreshSongListAndSelect(nextId);
  spSetFsEditorMode('edit');
  spSyncFsEditorFromCurrentSong();

  try {
    const wrote = await _spAppendToFile(nextId, newSong);
    if (wrote) {
      showToast(`✓ Song #${nextId} saved to song_content.js`, 'success');
    } else {
      showToast(`✓ Song #${nextId} added (pick song_content.js to save permanently)`, 'info', 4000);
    }
  } catch (e) {
    _spSongDbFileHandle = null;
    showToast('File save failed — try again', 'error');
  }
}

function spAddAsSlide() {
  if (_spSongId === null) { showToast('பாடல் தேர்ந்தெடுக்கவும்', 'error'); return; }
  const html = _spBuildSlideHtml();
  if (!html) { showToast('Song content not available', 'error'); return; }
  const song = songContent[_spSongId];
  const name = `${song.title} (#${_spSongId})`;
  const slide = { id: Date.now() + Math.random(), type: 'html', name, html };
  slides.push(slide);
  currentIdx = slides.length - 1;
  renderAll(); renderPreview(); renderEditor();
  scheduleSave();
  showToast(`✓ Slide added: ${name}`, 'success');
}

// ══════════════════════════════════════════════════
//  SONG STAGING PANEL (split verses → queue → main slides)
// ══════════════════════════════════════════════════
let _spVerses = [];   // split verse texts for current song
let _spQueue  = [];   // queued items: { text, name }

function _spSplitVerses(content) {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .split(/\n\s*\n/)
    .map(v => v.trim())
    .filter(v => v.length > 0);
}

function _spPopulateVerses(song) {
  _spVerses = _spSplitVerses(song.content);
  _spQueue = [];
  document.getElementById('sp-fs-title-text').textContent = song.title + ' (#' + _spSongId + ')';
  const container = document.getElementById('sp-fs-verses');
  container.innerHTML = '';
  _spVerses.forEach((v, i) => {
    const div = document.createElement('div');
    div.className = 'sp-fs-verse';
    const preview = v.length > 80 ? v.slice(0, 80) + '…' : v;
    div.innerHTML =
      '<span class="sp-fs-verse-text">' + _esc(preview).replace(/\n/g, ' ') + '</span>' +
      '<button class="sp-fs-verse-add" onclick="spQueueAdd(' + i + ')" title="Add to queue">➕</button>';
    container.appendChild(div);
  });
  _spRenderQueue();
}

function _esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function spQueueAdd(verseIdx) {
  const text = _spVerses[verseIdx];
  if (!text) return;
  const num = _spQueue.length + 1;
  _spQueue.push({ text, name: 'Verse ' + num });
  _spRenderQueue();
}

function _spRenderQueue() {
  const container = document.getElementById('sp-fs-queue');
  const countEl = document.getElementById('sp-fs-queue-count');
  countEl.textContent = _spQueue.length;
  container.innerHTML = '';
  if (_spQueue.length === 0) {
    container.innerHTML = '<div class="sp-fs-empty">No slides queued yet</div>';
    return;
  }
  _spQueue.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'sp-fs-item';
    el.id = 'sp-fs-item-' + i;
    const preview = item.text.length > 60 ? item.text.slice(0, 60).replace(/\n/g, ' ') + '…' : item.text.replace(/\n/g, ' ');
    el.innerHTML =
      '<div class="sp-fs-item-row">' +
        '<span class="sp-fs-item-name">' + _esc(preview) + '</span>' +
        '<div class="sp-fs-item-btns">' +
          '<button onclick="spQueueMove(' + i + ',-1)" title="Move up"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
          '<button onclick="spQueueMove(' + i + ',1)" title="Move down"' + (i === _spQueue.length - 1 ? ' disabled' : '') + '>▼</button>' +
          '<button class="sp-fs-edit" onclick="spQueueEdit(' + i + ')" title="Edit">✎</button>' +
          '<button onclick="spQueueCopy(' + i + ')" title="Copy">⧉</button>' +
          '<button class="sp-fs-remove" onclick="spQueueRemove(' + i + ')" title="Remove">✕</button>' +
        '</div>' +
      '</div>';
    container.appendChild(el);
  });
}

function spQueueMove(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= _spQueue.length) return;
  const temp = _spQueue[idx];
  _spQueue[idx] = _spQueue[target];
  _spQueue[target] = temp;
  _spRenderQueue();
}

function spQueueRemove(idx) {
  _spQueue.splice(idx, 1);
  _spRenderQueue();
}

function spQueueCopy(idx) {
  const copy = { text: _spQueue[idx].text, name: _spQueue[idx].name + ' (copy)' };
  _spQueue.splice(idx + 1, 0, copy);
  _spRenderQueue();
}

function spQueueEdit(idx) {
  const el = document.getElementById('sp-fs-item-' + idx);
  if (!el) return;
  if (el.classList.contains('editing')) {
    // close editor
    el.classList.remove('editing');
    const ed = el.querySelector('.sp-fs-editor');
    if (ed) ed.remove();
    return;
  }
  el.classList.add('editing');
  const editor = document.createElement('div');
  editor.className = 'sp-fs-editor';
  editor.innerHTML =
    '<textarea class="sp-fs-ta">' + _esc(_spQueue[idx].text) + '</textarea>' +
    '<button class="sp-fs-save-btn" onclick="spQueueSave(' + idx + ')">Save</button>';
  el.appendChild(editor);
  const ta = editor.querySelector('.sp-fs-ta');
  ta.focus();
}

function spQueueSave(idx) {
  const el = document.getElementById('sp-fs-item-' + idx);
  if (!el) return;
  const ta = el.querySelector('.sp-fs-ta');
  if (ta) _spQueue[idx].text = ta.value;
  _spRenderQueue();
}

function spCommitAllToMain() {
  if (_spQueue.length === 0) { showToast('Queue is empty', 'error'); return; }
  const song = songContent[_spSongId];
  const songName = song ? song.title : 'Song';
  const songSlideBg = 'linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%)';
  _spQueue.forEach((item, i) => {
    const ref = songName + '  (Song #' + _spSongId + ')';
    const html = createVasanamHtml(item.text, ref, songSlideBg, '#f8fafc', 'medium');
    const slide = { id: Date.now() + Math.random(), type: 'html', name: songName + ' - ' + (i + 1), html };
    slides.push(slide);
  });
  currentIdx = slides.length - 1;
  renderAll(); renderPreview(); renderEditor();
  scheduleSave();
  const count = _spQueue.length;
  _spQueue = [];
  _spRenderQueue();
  exitPresent();
  showToast('✓ ' + count + ' slides added from ' + songName, 'success');
}

// ══════════════════════════════════════════════════
//  PRESENT MODE
// ══════════════════════════════════════════════════
let _wakeLock = null;

async function acquireWakeLock() {
  if ('wakeLock' in navigator) {
    try { _wakeLock = await navigator.wakeLock.request('screen'); }
    catch (_) { /* user or browser denied */ }
  }
}

async function releaseWakeLock() {
  if (_wakeLock) {
    await _wakeLock.release();
    _wakeLock = null;
  }
}

// Re-acquire if the page regains visibility while presenting
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' &&
      document.getElementById('present-overlay').classList.contains('active')) {
    acquireWakeLock();
  }
});

function startPresent() {
  if (!slides.length) return;
  _presentPrevIdx = null;
  presentIdx = currentIdx;
  showPresentSlide();
  updateBackBtn();
  document.getElementById('present-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
  acquireWakeLock();
}

// Cache HTML strings for present-mode so rapid navigation never re-serialises
const _presentHtmlCache = new Map();
function getPresentHtml(idx) {
  const s = slides[idx];
  const key = String(s.id) + (s.type === 'html' ? s.html : JSON.stringify(s));
  if (!_presentHtmlCache.has(key)) _presentHtmlCache.set(key, getHtml(s));
  return _presentHtmlCache.get(key);
}

let _presentNavTimer = null;
let _presentNavQueued = null;
let _presentPrevIdx = null;

function showPresentSlide() {
  const pif = document.getElementById('present-iframe');
  injectAutoFit(pif);
  pif.srcdoc = getPresentHtml(presentIdx);
  const ind = document.getElementById('present-indicator');
  ind.textContent = `${presentIdx + 1} / ${slides.length}`;
  ind.onclick = showGotoInput;
}

function showGotoInput() {
  const ind = document.getElementById('present-indicator');
  const total = slides.length;
  const current = presentIdx + 1;
  ind.onclick = null;
  ind.innerHTML = `<input id="present-goto-input" type="text" value="${current}" maxlength="4"> / ${total}`;
  const inp = document.getElementById('present-goto-input');
  inp.focus();
  inp.select();
  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { goToSlide(this.value); e.stopPropagation(); }
    else if (e.key === 'Escape') { restoreIndicator(); e.stopPropagation(); }
    else { e.stopPropagation(); }
  });
  inp.addEventListener('blur', function() { restoreIndicator(); });
}

function restoreIndicator() {
  const ind = document.getElementById('present-indicator');
  ind.textContent = `${presentIdx + 1} / ${slides.length}`;
  ind.onclick = showGotoInput;
}

function goToSlide(val) {
  const num = parseInt(val, 10);
  if (isNaN(num) || num < 1 || num > slides.length) {
    const inp = document.getElementById('present-goto-input');
    if (inp) {
      inp.classList.add('error');
      inp.select();
      setTimeout(() => inp.classList.remove('error'), 600);
    }
    return;
  }
  _presentPrevIdx = presentIdx;
  presentIdx = num - 1;
  showPresentSlide();
  updateBackBtn();
  document.getElementById('present-indicator').onclick = showGotoInput;
}

function presentGoBack() {
  if (_presentPrevIdx === null) return;
  const tmp = presentIdx;
  presentIdx = _presentPrevIdx;
  _presentPrevIdx = tmp;
  showPresentSlide();
  updateBackBtn();
}

function updateBackBtn() {
  const btn = document.getElementById('present-back-btn');
  if (!btn) return;
  btn.style.display = _presentPrevIdx !== null ? '' : 'none';
}

function presentNav(dir) {
  // Coalesce rapid arrow-key repeats: only commit the final target index
  const target = (_presentNavQueued !== null ? _presentNavQueued : presentIdx) + dir;
  if (target < 0 || target >= slides.length) return;
  _presentNavQueued = target;

  const veil = document.getElementById('transition-veil');
  veil.classList.add('flash');

  clearTimeout(_presentNavTimer);
  _presentNavTimer = setTimeout(() => {
    presentIdx = _presentNavQueued;
    _presentNavQueued = null;
    showPresentSlide();
    setTimeout(() => veil.classList.remove('flash'), 200);
  }, 80); // wait 80 ms for burst key-presses to settle before loading iframe
}

function exitPresent() {
  const overlay = document.getElementById('present-overlay');
  overlay.classList.remove('active', 'panel-fs');
  document.body.style.overflow = '';
  releaseWakeLock();
}

// Keyboard nav in present mode
document.addEventListener('keydown', e => {
  const overlay = document.getElementById('present-overlay');
  if (!overlay.classList.contains('active')) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') presentNav(1);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') presentNav(-1);
  if (e.key === 'Backspace') presentGoBack();
  if (e.key === 'Escape') exitPresent();
});

// ══════════════════════════════════════════════════
//  INIT — restore from localStorage or load defaults
// ══════════════════════════════════════════════════
(function init() {
  const restored = loadFromStorage();

  if (!restored) {
    currentIdx = 0;
  }

  renderAll();
  renderPreview();
  renderEditor();

  if (restored) {
    showToast('↩ Session restored from last save', 'success', 3000);
  }
})();
