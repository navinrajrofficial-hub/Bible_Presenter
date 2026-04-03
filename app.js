// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════
let slides = [];
let currentIdx = 0;
let dragSrcIdx = null;
let thumbDragged = false;
let presentIdx = null;
let activeTab = 'html';
let saveTimer = null;
let _tempBackupSlides = null;
let _tempBackupIdx = -1;

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
  if (_tempBackupSlides) return; // Prevent overwriting DB with temporary presentation slides

  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // Run the actual localStorage write during browser idle time so it never
    // blocks a frame. Falls back to a direct call on browsers without rIC.
    const doSave = () => {
      try {
        // Serialise only the fields we need; runtime-only props (_thumbHtml etc.) are excluded
        const payload = slides.map(s => {
          const { id, type, name, html, title, body, bg, color, layout, font, bookmarked } = s;
          return type === 'html'
            ? { id, type, name, html, bookmarked: !!bookmarked }
            : { id, type, name, title, body, bg, color, layout, font, bookmarked: !!bookmarked };
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
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=swap');
@font-face{font-family:'Noto Serif Tamil';src:local('Noto Serif Tamil'),local('Nirmala UI'),local('Vijaya'),local('Latha'),local('Tamil Sangam MN');font-weight:400 900;}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:100%;height:100%;overflow:hidden;}
body{
  background:${bg};
  perspective: 2000px;
  font-family:'Noto Serif Tamil',serif;
}
.flip-card {
  width:100%; height:100%;
  position:relative;
  transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  transform-style:preserve-3d;
  cursor:pointer;
}
.flip-card.flipped {
  transform: rotateY(180deg);
}
.flip-card-front, .flip-card-back {
  position:absolute;
  width:100%; height:100%;
  backface-visibility:hidden;
  -webkit-backface-visibility:hidden;
  display:flex; align-items:center; justify-content:center; background:${bg};
}
.flip-card-front {
  flex-direction:column;
}
.flip-card-back {
  transform: rotateY(180deg);
  padding:1.2vw;
}
.front-title {
  font-size:15vh;
  font-weight:900;
  color:${col}; text-align:center; padding:0 4vw; line-height:1.2;
  -webkit-text-stroke: 0.04em currentColor;
}
.front-graphics {
  font-family:'Caveat', cursive; font-size:8vh; color:${col}; opacity:0.8; margin-top:3vh;
}
.verse-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;gap:0.6vh;overflow:hidden;}
.verse-text{
  font-weight:900;color:${col};text-align:center;line-height:1.22;word-break:break-word;width:100%;white-space:pre-wrap;
  -webkit-text-stroke: 0.04em currentColor;
}
.verse-ref{
  color:${col};opacity:0.9;font-style:italic;letter-spacing:2px;text-align:right;align-self:flex-end;padding-right:1vw;
  font-weight:900;
}
<\/style><\/head><body>
<div class="flip-card" id="flip-card" onclick="this.classList.toggle('flipped')">
  <div class="flip-card-front">
    <div class="front-title" id="frontTitle">${verseRef || 'வசனம்'}</div>
  </div>
  <div class="flip-card-back">
    <div class="verse-wrap" id="vwrap">
      <div class="verse-text" id="vtext">${verseText}<\/div>
      ${verseRef ? `<div class="verse-ref" id="vref">— ${verseRef}<\/div>` : ''}
    </div>
  </div>
</div>
<script>
var MAX_FONT = 130;
function autoFit() {
  var wrap = document.getElementById('vwrap');
  var vt   = document.getElementById('vtext');
  var vr   = document.getElementById('vref');
  if (!wrap || !vt) return;
  var availW = wrap.clientWidth || window.innerWidth;
  var availH = wrap.clientHeight || window.innerHeight;
  if (availH < 10 || availW < 10) { setTimeout(autoFit, 100); return; }
  vt.style.width = '100%';
  var lo = 8, hi = Math.min(availH, MAX_FONT);
  for (var i = 0; i < 30; i++) {
    var mid = (lo + hi) / 2;
    vt.style.fontSize = mid + 'px';
    if (vr) vr.style.fontSize = (mid * 0.32) + 'px';
    var needed = vt.scrollHeight + (vr ? vr.offsetHeight + mid * 0.2 : 0);
    if (needed > availH || vt.scrollWidth > availW) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  vt.style.fontSize = lo + 'px';
  if (vr) vr.style.fontSize = (lo * 0.32) + 'px';

  var fTitle = document.getElementById('frontTitle');
  if (fTitle && fTitle.scrollWidth > window.innerWidth * 0.9) {
    fTitle.style.fontSize = '12vh';
  }
}
document.addEventListener("visibilitychange", function() {
    if (document.hidden) {
        var card = document.getElementById('flip-card');
        if (card) card.classList.remove('flipped');
    }
});
if (typeof IntersectionObserver !== 'undefined') {
  let observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(!entry.isIntersecting) {
         var card = document.getElementById('flip-card');
         if (card) card.classList.remove('flipped');
      }
    });
  });
  observer.observe(document.body);
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
      var card = document.getElementById('flip-card');
      if (card) card.classList.toggle('flipped');
      e.preventDefault();
  }
});

document.fonts ? document.fonts.ready.then(autoFit) : window.addEventListener('load', autoFit);
window.addEventListener('resize', autoFit);
<\/script>
<\/body><\/html>`;
}

// ── ANIME (Static dark navy gradient) version of Vasanam slide ──
function createAnimeVasanamHtml(verseText, verseRef) {
  return `<!DOCTYPE html><html lang="ta"><head><meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=swap');
@font-face{font-family:'Noto Serif Tamil';src:local('Noto Serif Tamil'),local('Nirmala UI'),local('Vijaya'),local('Latha'),local('Tamil Sangam MN');font-weight:400 900;}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:100%;height:100%;overflow:hidden;}
body{background:linear-gradient(180deg,#020510 0%,#0a1628 40%,#162a50 70%,#1b3a5c 100%);perspective:2000px;font-family:'Noto Serif Tamil',serif;}
.sky{position:absolute;inset:0;z-index:0;}
.flip-card {width:100%;height:100%;position:relative;transition:transform 0.8s cubic-bezier(0.4,0,0.2,1);transform-style:preserve-3d;cursor:pointer;z-index:5;}
.flip-card.flipped {transform:rotateY(180deg);}
.flip-card-front, .flip-card-back {position:absolute;width:100%;height:100%;backface-visibility:hidden;-webkit-backface-visibility:hidden;display:flex;align-items:center;justify-content:center;}
.flip-card-front {flex-direction:column;}
.flip-card-back {transform:rotateY(180deg);padding:1.2vw;}
.front-title {font-size:15vh;font-weight:900;color:#ffffff;text-align:center;padding:0 4vw;line-height:1.2;text-shadow:0 2px 10px rgba(0,0,0,0.8);-webkit-text-stroke: 0.04em currentColor;}
.front-graphics {font-family:'Caveat', cursive;font-size:8vh;color:#ffffff;opacity:0.8;margin-top:3vh;text-shadow:0 2px 6px rgba(0,0,0,0.6);}
.verse-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;gap:0.6vh;overflow:hidden;position:relative;}
.verse-text{font-weight:900;color:#ffffff;text-align:center;line-height:1.22;word-break:break-word;width:100%;white-space:pre-wrap;text-shadow:0 2px 10px rgba(0,0,0,0.8);-webkit-text-stroke: 0.04em currentColor;}
.verse-ref{color:#ffffff;opacity:0.9;font-style:italic;letter-spacing:2px;text-align:right;align-self:flex-end;padding-right:1vw;font-weight:900;text-shadow:0 2px 6px rgba(0,0,0,0.6);}
<\/style><\/head><body>
<div class="sky"><\/div>
<div class="flip-card" id="flip-card" onclick="this.classList.toggle('flipped')">
  <div class="flip-card-front">
    <div class="front-title" id="frontTitle">${verseRef || 'வசனம்'}</div>
  </div>
  <div class="flip-card-back">
    <div class="verse-wrap" id="vwrap">
      <div class="verse-text" id="vtext">${verseText}<\/div>
      ${verseRef ? `<div class="verse-ref" id="vref">— ${verseRef}<\/div>` : ''}
    </div>
  </div>
</div>
<script>
var MAX_FONT = 130;
function autoFit() {
  var wrap = document.getElementById('vwrap');
  var vt   = document.getElementById('vtext');
  var vr   = document.getElementById('vref');
  if (!wrap || !vt) return;
  var availW = wrap.clientWidth || window.innerWidth;
  var availH = wrap.clientHeight || window.innerHeight;
  if (availH < 10 || availW < 10) { setTimeout(autoFit, 100); return; }
  vt.style.width = '100%';
  var lo = 8, hi = Math.min(availH, MAX_FONT);
  for (var i = 0; i < 30; i++) {
    var mid = (lo + hi) / 2;
    vt.style.fontSize = mid + 'px';
    if (vr) vr.style.fontSize = (mid * 0.32) + 'px';
    var needed = vt.scrollHeight + (vr ? vr.offsetHeight + mid * 0.2 : 0);
    if (needed > availH || vt.scrollWidth > availW) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  vt.style.fontSize = lo + 'px';
  if (vr) vr.style.fontSize = (lo * 0.32) + 'px';

  var fTitle = document.getElementById('frontTitle');
  if (fTitle && fTitle.scrollWidth > window.innerWidth * 0.9) {
    fTitle.style.fontSize = '12vh';
  }
}
document.addEventListener("visibilitychange", function() {
    if (document.hidden) {
        var card = document.getElementById('flip-card');
        if (card) card.classList.remove('flipped');
    }
});
if (typeof IntersectionObserver !== 'undefined') {
  let observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(!entry.isIntersecting) {
         var card = document.getElementById('flip-card');
         if (card) card.classList.remove('flipped');
      }
    });
  });
  observer.observe(document.body);
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
      var card = document.getElementById('flip-card');
      if (card) card.classList.toggle('flipped');
      e.preventDefault();
  }
});

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
    return { id, type: 'html', name: 'HTML Slide', html: '', bookmarked: false };
  } else {
    return {
      id, type: 'simple', name: 'New Slide', bookmarked: false,
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
  if (slide.type !== 'html') return simpleToHtml(slide);
  var html = slide.html || '';

  // Normalize whitespace inside the verse-text block.
  // If the author intentionally uses hard breaks (multiline lines), preserve them.
  // If the input is wrapped at each word (common when pasting), collapse those
  // line breaks back into spaces so text wraps normally.
  html = html.replace(/(<div[^>]*\bverse-text\b[^>]*>)([\s\S]*?)(<\/div>)/gi, function(_, open, content, close) {
    const normalized = content.replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n');

    // Detect if the text is split into many very short lines (likely auto-wrapped).
    const trimmedLines = lines.map(l => l.trim()).filter(l => l.length > 0);
    const shortLineCount = trimmedLines.filter(l => l.length <= 10).length;
    const shouldCollapse = trimmedLines.length > 2 && shortLineCount / trimmedLines.length > 0.6;

    if (shouldCollapse) {
      // Collapse to a single paragraph, letting normal wrapping decide line breaks.
      return open + trimmedLines.join(' ') + close;
    }

    // Otherwise, preserve intentional line breaks (single newline -> line break)
    // while still letting the browser wrap lines as needed.
    const htmlLines = lines.map(l => l.trimEnd()).join('<br>');
    return open + htmlLines + close;
  });
  var override = '<style>.verse-text{white-space:pre-line !important;word-break:normal !important;overflow-wrap:break-word !important;}</style>';
  if (html.indexOf(override) !== -1) return html;
  var hi = html.indexOf('</head>');
  return hi !== -1 ? html.slice(0, hi) + override + html.slice(hi) : override + html;
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

  const bmBtn = document.createElement('button');
  bmBtn.className = 'thumb-bookmark';
  bmBtn.type = 'button';
  bmBtn.textContent = 'B';
  bmBtn.title = 'Bookmark slide';
  bmBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSlideBookmark(Number(thumb.dataset.idx));
  });
  bmBtn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });
  thumb.appendChild(bmBtn);

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
  const posInput = document.createElement('input');
  posInput.type = 'number';
  posInput.className = 'thumb-pos-input';
  posInput.title = 'Type position number + Enter to move';
  posInput.min = 1;
  posInput.addEventListener('click',     (e) => e.stopPropagation());
  posInput.addEventListener('mousedown', (e) => e.stopPropagation());
  posInput.addEventListener('focus', () => {
    posInput.value = Number(thumb.dataset.idx) + 1;
    posInput.select();
  });
  posInput.addEventListener('blur', () => {
    posInput.value = Number(thumb.dataset.idx) + 1;
  });
  posInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      moveSlideToPos(Number(thumb.dataset.idx), parseInt(posInput.value, 10));
      posInput.blur();
    } else if (e.key === 'Escape') {
      posInput.value = Number(thumb.dataset.idx) + 1;
      posInput.blur();
    } else {
      e.stopPropagation();
    }
  });
  moveWrap.appendChild(btnUp); moveWrap.appendChild(posInput); moveWrap.appendChild(btnDown);
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
    const bmBtn = thumb.querySelector('.thumb-bookmark');
    if (bmBtn) {
      const isBookmarked = !!s.bookmarked;
      bmBtn.classList.toggle('active', isBookmarked);
      bmBtn.title = isBookmarked ? 'Remove bookmark' : 'Bookmark slide';
    }
    const pi = thumb.querySelector('.thumb-pos-input');
    if (pi && document.activeElement !== pi) pi.value = i + 1;

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

  renderPresentBookmarks();
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

function moveSlideToPos(fromIdx, targetPos) {
  const toIdx = Math.max(0, Math.min(targetPos - 1, slides.length - 1));
  if (toIdx === fromIdx) return;
  const [moved] = slides.splice(fromIdx, 1);
  slides.splice(toIdx, 0, moved);
  if (currentIdx === fromIdx) currentIdx = toIdx;
  else if (fromIdx < toIdx && currentIdx > fromIdx && currentIdx <= toIdx) currentIdx--;
  else if (fromIdx > toIdx && currentIdx >= toIdx && currentIdx < fromIdx) currentIdx++;
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
    const pi = el.querySelector('.thumb-pos-input');
    if (pi && document.activeElement !== pi) pi.value = i + 1;
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
  bpHideBookDropdown();
  // Intelligent override: when user focuses a slide from the left list,
  // close right-side helper drawers so the main preview/editor stays visible.
  if (_bpOpen) toggleBiblePanel();
  if (_spOpen) toggleSongPanel();
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

function toggleSlideBookmark(idx) {
  const s = slides[idx];
  if (!s) return;
  s.bookmarked = !s.bookmarked;

  const thumb = document.querySelector(`#slide-list .thumb[data-idx="${idx}"]`);
  const bmBtn = thumb ? thumb.querySelector('.thumb-bookmark') : null;
  if (bmBtn) {
    bmBtn.classList.toggle('active', !!s.bookmarked);
    bmBtn.title = s.bookmarked ? 'Remove bookmark' : 'Bookmark slide';
  }

  renderPresentBookmarks();
  scheduleSave();
}

function gotoSlide(inp) {
  let n = parseInt(inp.value, 10);
  inp.value = '';
  if (isNaN(n) || !slides.length) return;
  n = Math.max(1, Math.min(n, slides.length));
  const idx = n - 1;
  selectSlide(idx);
  document.querySelector(`#slide-list .thumb[data-idx="${idx}"]`)?.scrollIntoView({ block: 'nearest' });
  inp.blur();
}

// ══════════════════════════════════════════════════
//  ACTIONS
// ══════════════════════════════════════════════════
let _pendingSlideType = null;
let _pendingSlide = null;

function addSlide(type) {
  _pendingSlideType = type;
  _pendingSlide = null;

  const total = slides.length;
  const defaultPos = total ? (currentIdx + 2) : 1;
  const inp = document.getElementById('insert-position');
  inp.value = defaultPos;
  inp.min = 1;
  inp.max = total + 1;

  if (total) {
    document.getElementById('insert-modal-info').textContent =
      `Current: slide ${currentIdx + 1} of ${total}. Enter 1-${total + 1}:`;
  } else {
    document.getElementById('insert-modal-info').textContent =
      'No slides yet. Enter 1 to add the first slide:';
  }

  const modal = document.getElementById('insert-modal');
  modal.style.display = 'flex';
  inp.focus();
  inp.select();
}

function confirmInsertSlide() {
  const total = slides.length;
  let pos = parseInt(document.getElementById('insert-position').value, 10);
  if (isNaN(pos) || pos < 1) pos = 1;
  if (pos > total + 1) pos = total + 1;
  closeInsertModal();
  const s = _pendingSlide || createSlide(_pendingSlideType);
  _pendingSlide = null;
  const idx = pos - 1;
  slides.splice(idx, 0, s);
  currentIdx = idx;
  renderAll(); renderPreview(); renderEditor();
  scheduleSave();
  if (s.name) showToast(`✓ Slide added: ${s.name}`, 'success');
}

function closeInsertModal() {
  document.getElementById('insert-modal').style.display = 'none';
}

function openDeleteRangeModal() {
  if (slides.length === 0) {
    showToast("No slides to delete.");
    return;
  }
  document.getElementById('delete-range-modal').style.display = 'flex';
  document.getElementById('delete-range-from').value = currentIdx + 1;
  document.getElementById('delete-range-to').value = currentIdx + 1;
  document.getElementById('delete-range-error').style.display = 'none';
  document.getElementById('delete-range-to').focus();
  document.getElementById('delete-range-to').select();
}

function closeDeleteRangeModal() {
  document.getElementById('delete-range-modal').style.display = 'none';
}

function confirmDeleteRange() {
  const fromEl = document.getElementById('delete-range-from');
  const toEl = document.getElementById('delete-range-to');
  const errorEl = document.getElementById('delete-range-error');

  let fromPos = parseInt(fromEl.value, 10);
  let toPos = parseInt(toEl.value, 10);

  if (isNaN(fromPos) || isNaN(toPos) || fromPos > toPos || fromPos < 1 || toPos > slides.length) {
    errorEl.textContent = `Invalid range. Enter values from 1 to ${slides.length}.`;
    errorEl.style.display = 'block';
    return;
  }

  const count = toPos - fromPos + 1;
  if (!confirm(`Are you sure you want to delete ${count} slide(s) from #${fromPos} to #${toPos}?`)) {
    return;
  }

  // Convert to 0-based indices
  const startIndex = fromPos - 1;
  slides.splice(startIndex, count);
  
  if (currentIdx >= slides.length) {
    currentIdx = Math.max(0, slides.length - 1);
  } else if (currentIdx >= startIndex && currentIdx < startIndex + count) {
    // If we're inside the deleted range, drop back to the start index (or end if it's the last ones)
    currentIdx = Math.min(startIndex, Math.max(0, slides.length - 1));
  }
  
  closeDeleteRangeModal();
  renderAll(); 
  renderPreview(); 
  renderEditor();
  scheduleSave();
  showToast(`Deleted ${count} slide(s).`);
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

const tamilBibleBookNames = {
  "ஆதியாகமம்": { en: "Genesis", tg: "Aathiyagamam" },
  "யாத்திராகமம்": { en: "Exodus", tg: "Yaathiragamam" },
  "லேவியராகமம்": { en: "Leviticus", tg: "Leviyaragamam" },
  "எண்ணாகமம்": { en: "Numbers", tg: "Ennagamam" },
  "உபாகமம்": { en: "Deuteronomy", tg: "Ubaagamam" },
  "யோசுவா": { en: "Joshua", tg: "Yosuva" },
  "நியாயாதிபதிகள்": { en: "Judges", tg: "Niyayadhipathigal" },
  "ரூத்": { en: "Ruth", tg: "Ruth" },
  "1 சாமுவேல்": { en: "1 Samuel", tg: "1 Samuvel", alt: "1 Samvel" },
  "2 சாமுவேல்": { en: "2 Samuel", tg: "2 Samuvel", alt: "2 Samvel" },
  "1 இராஜாக்கள்": { en: "1 Kings", tg: "1 Rajakkal", alt: "1 Irajakkal, 1 Irakkal, 1 Rajakal, 1 irajakal" },
  "2 இராஜாக்கள்": { en: "2 Kings", tg: "2 Rajakkal", alt: "2 Irajakkal, 2 Irakkal, 2 Rajakal, 2 irajakal" },
  "1 நாளாகமம்": { en: "1 Chronicles", tg: "1 Nalagamam" },
  "2 நாளாகமம்": { en: "2 Chronicles", tg: "2 Nalagamam" },
  "எஸ்றா": { en: "Ezra", tg: "Esra" },
  "நெகேமியா": { en: "Nehemiah", tg: "Nehemiya" },
  "எஸ்தர்": { en: "Esther", tg: "Esther" },
  "யோபு": { en: "Job", tg: "Yobu" },
  "சங்கீதம்": { en: "Psalms", tg: "Sangeetham" },
  "நீதிமொழிகள்": { en: "Proverbs", tg: "Neethimozhigal" },
  "பிரசங்கி": { en: "Ecclesiastes", tg: "Prasangi" },
  "உன்னதப்பாட்டு": { en: "Song of Solomon", tg: "Unnathappattu" },
  "ஏசாயா": { en: "Isaiah", tg: "Esaya" },
  "எரேமியா": { en: "Jeremiah", tg: "Eremiya" },
  "புலம்பல்": { en: "Lamentations", tg: "Pulambal" },
  "எசேக்கியேல்": { en: "Ezekiel", tg: "Esekkiyel" },
  "தானியேல்": { en: "Daniel", tg: "Dhaniyel" },
  "ஓசேயா": { en: "Hosea", tg: "Osiya" },
  "யோவேல்": { en: "Joel", tg: "Yovel" },
  "ஆமோஸ்": { en: "Amos", tg: "Amos" },
  "ஒபதியா": { en: "Obadiah", tg: "Obathiya" },
  "யோனா": { en: "Jonah", tg: "Yona" },
  "மீகா": { en: "Micah", tg: "Miga" },
  "நாகூம்": { en: "Nahum", tg: "Nagum" },
  "ஆபகூக்": { en: "Habakkuk", tg: "Abakuk" },
  "செப்பனியா": { en: "Zephaniah", tg: "Seppaniya" },
  "ஆகாய்": { en: "Haggai", tg: "Agai" },
  "சகரியா": { en: "Zechariah", tg: "Sagariya" },
  "மல்கியா": { en: "Malachi", tg: "Malkiya" },
  "மத்தேயு": { en: "Matthew", tg: "Matheyu" },
  "மாற்கு": { en: "Mark", tg: "Marku" },
  "லூக்கா": { en: "Luke", tg: "Lukka" },
  "யோவான்": { en: "John", tg: "Yovan" },
  "அப்போஸ்தலருடைய நடபடிகள்": { en: "Acts", tg: "Apposthalar Nadapadigal" },
  "ரோமர்": { en: "Romans", tg: "Romar" },
  "1 கொரிந்தியர்": { en: "1 Corinthians", tg: "1 Korinthiyar" },
  "2 கொரிந்தியர்": { en: "2 Corinthians", tg: "2 Korinthiyar" },
  "கலாத்தியர்": { en: "Galatians", tg: "Kalathiyar" },
  "எபேசியர்": { en: "Ephesians", tg: "Ebesiyar" },
  "பிலிப்பியர்": { en: "Philippians", tg: "Pilippiyar" },
  "கொலோசியர்": { en: "Colossians", tg: "Koloseyar" },
  "1 தெசலோனிக்கேயர்": { en: "1 Thessalonians", tg: "1 Thesalonikkeyar" },
  "2 தெசலோனிக்கேயர்": { en: "2 Thessalonians", tg: "2 Thesalonikkeyar" },
  "1 தீமோத்தேயு": { en: "1 Timothy", tg: "1 Theemotheyu" },
  "2 தீமோத்தேயு": { en: "2 Timothy", tg: "2 Theemotheyu" },
  "தீத்து": { en: "Titus", tg: "Theethu" },
  "பிலேமோன்": { en: "Philemon", tg: "Pilemon" },
  "எபிரேயர்": { en: "Hebrews", tg: "Ebireyar" },
  "யாக்கோபு": { en: "James", tg: "Yakkobu" },
  "1 பேதுரு": { en: "1 Peter", tg: "1 Peduru" },
  "2 பேதுரு": { en: "2 Peter", tg: "2 Peduru" },
  "1 யோவான்": { en: "1 John", tg: "1 Yovan" },
  "2 யோவான்": { en: "2 John", tg: "2 Yovan" },
  "3 யோவான்": { en: "3 John", tg: "3 Yovan" },
  "யூதா": { en: "Jude", tg: "Yudha" },
  "வெளிப்படுத்தல்": { en: "Revelation", tg: "Velippaduthal\t" } // App uses this key
};

// Populate book dropdown on load
function renderBpBookList(filterStr = "") {
  const ul = document.getElementById('bp-book-list');
  ul.innerHTML = '';
  const lowerFilter = filterStr.toLowerCase().trim();
  
  let results = [];
  let index = 0;

  Object.keys(bibleData).forEach(name => {
    const meta = tamilBibleBookNames[name] || { en: "", tg: "" };
    const n = name.toLowerCase();
    const e = meta.en.toLowerCase();
    const t = meta.tg.toLowerCase();

    if (!lowerFilter) {
      results.push({ name, meta, score: 0, index });
    } else {
      const fullSearch = `${n} ${e} ${t}`;
      if (fullSearch.includes(lowerFilter)) {
        let score = 2; // Default to partial substring match

        // Exact prefix match gets the highest priority
        if (n.startsWith(lowerFilter) || e.startsWith(lowerFilter) || t.startsWith(lowerFilter)) {
          score = 0;
        } 
        // Word boundary match gets second priority (e.g., "1 John" -> typing "j" matches "john")
        else {
          const words = fullSearch.split(/[\s\-]+/);
          if (words.some(w => w.startsWith(lowerFilter))) {
            score = 1;
          }
        }
        results.push({ name, meta, score, index });
      }
    }
    index++;
  });

  // Sort by match quality, then alphabetically, and fallback to canonical Bible order
  results.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;

    // Standard alphabetical fuzzy sort inside the same matching tier
    const nameA = (a.meta.en || a.meta.tg || a.name).toLowerCase();
    const nameB = (b.meta.en || b.meta.tg || b.name).toLowerCase();
    
    // Check if one exactly equals the filter string (exact match priority)
    if (nameA === lowerFilter && nameB !== lowerFilter) return -1;
    if (nameB === lowerFilter && nameA !== lowerFilter) return 1;

    // Normal alphabetic sort
    const alphaCompare = nameA.localeCompare(nameB);
    if (alphaCompare !== 0) return alphaCompare;

    // Fallback back to canonical chapter order if everything else is equal
    return a.index - b.index;
  });

  results.forEach(res => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="ta-name">${res.name}</span> <span class="en-name">${res.meta.en} / ${res.meta.tg}</span>`;
    li.onclick = () => {
      document.getElementById('bp-book').value = res.name;
      document.getElementById('bp-book-display').value = res.name + (res.meta.en ? ` (${res.meta.en})` : '');
      document.getElementById('bp-book-list').classList.remove('show');
      bpOnBookChange();
    };
    ul.appendChild(li);
  });
}

function bpShowBookDropdown() {
  document.getElementById('bp-book-list').classList.add('show');
  renderBpBookList(document.getElementById('bp-book-display').value);
}

function bpFilterBookDropdown() {
  renderBpBookList(document.getElementById('bp-book-display').value);
}

function bpHideBookDropdown() {
  document.getElementById('bp-book-list')?.classList.remove('show');
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  const fContainer = document.querySelector('.custom-book-field');
  if (fContainer && !fContainer.contains(e.target)) {
    bpHideBookDropdown();
  }
});

(function bpInit() {
  renderBpBookList();
  
  // Snap back invalid text on blur
  const displayInput = document.getElementById('bp-book-display');
  if (displayInput) {
    displayInput.addEventListener('blur', () => {
      setTimeout(() => {
        const currentVal = document.getElementById('bp-book').value;
        if (currentVal && bibleData[currentVal]) {
          const meta = tamilBibleBookNames[currentVal] || { en: "" };
          displayInput.value = currentVal + (meta.en ? ` (${meta.en})` : '');
        } else {
          displayInput.value = '';
        }
      }, 200);
    });
  }
})();

let _bpOpen = false;
let _bpBook = null, _bpChapter = null, _bpVerse = null;
let _bpVoiceListening = false;
let _bpVoiceLastRefKey = '';
let _bpVoiceLastAt = 0;
let _bpVoiceMicGranted = false;
let _bpVoiceEngine = 'local';

// Local ASR service (EXE/server) runtime state
let _bpLocalAsrRecorder = null;
let _bpLocalAsrStream = null;
let _bpLocalAsrBusy = false;
let _bpLocalAsrErrors = 0;
let _bpLocalAsrLastText = '';
let _bpLocalAsrActiveEndpoint = '';

const BP_LOCAL_ASR_STORAGE_KEY = 'bp_local_asr_base_url';
const BP_LOCAL_ASR_DEFAULT_BASE = 'http://127.0.0.1:8765';

function bpTamilDigitsToAscii(str) {
  const map = {
    '௦': '0', '௧': '1', '௨': '2', '௩': '3', '௪': '4',
    '௫': '5', '௬': '6', '௭': '7', '௮': '8', '௯': '9'
  };
  return String(str || '').replace(/[௦-௯]/g, d => map[d] || d);
}

function bpNormalizeSpeechText(raw) {
  let text = bpTamilDigitsToAscii(String(raw || ''))
    .toLowerCase()
    .replace(/[|]/g, ':')
    .replace(/[.,;!?]/g, ' ')
    .replace(/["'`]/g, '');

  // Enterprise ASR (Automatic Speech Recognition) Phonetic Correction Interceptor:
  // Google's Cloud Voice AI often mishears spoken Tamil words as completely different Tamil words
  // (e.g. "ஒன்னாம் அதிகாரம்" -> misheard as "உன்ன பரிகாரம்").
  // This forcibly catches the AI's hallucinations and maps them back to correct Bible terminology.
  const asrCorrections = [
    [/பரிகாரம்/g, 'அதிகாரம்'],        // "Parikaram" (Remedy) -> "Adhigaram" (Chapter)
    [/உன்ன/g, '1 '],               // "Unna" (You) -> "1 "
    [/ஒன்னு/g, '1 '],               // "Onnu" -> "1 "
    [/ரெண்டு/g, '2 '],              // "Rendu" -> "2 "
    [/மூனு/g, '3 '],                // "Moonu" -> "3 "
    [/ராஜாக்கள்/g, 'இராஜாக்கள்'],     // Fixes missing leading "I"
    [/சாமவேல்|சாமுவேல்/g, 'சாமுவேல்'], // Standardize Samuel
    [/சங்கீதம்/g, 'சங்கீதம்'],
    [/புலம்பல்/g, 'புலம்பல்']
  ];

  for (const [bad, good] of asrCorrections) {
    text = text.replace(bad, good);
  }

  return text.replace(/\s+/g, ' ').trim();
}

function bpPhoneticBookKey(raw) {
  return bpNormalizeSpeechText(raw)
    .replace(/\s+/g, '')
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/dh/g, 'th')
    .replace(/zh/g, 'l')
    .replace(/ck/g, 'k')
    .replace(/[cqg]/g, 'k')
    .replace(/ph/g, 'f')
    .replace(/bh/g, 'b')
    .replace(/yy+/g, 'y');
}

function bpConvertSpeechNumberWords(text) {
  let out = ` ${text} `;
  const pairs = [
    // Double digit / Teens
    ['பதினொன்று', '11'], ['பதினொன்னாம்', '11'], ['பதினொன்றாம்', '11'], ['pathinonru', '11'], ['pathinonnam', '11'],
    ['பன்னிரண்டு', '12'], ['பன்னிரண்டாம்', '12'], ['பன்னெண்டு', '12'], ['pannirandu', '12'], ['pannirendu', '12'],
    ['பதிமூன்று', '13'], ['பதிமூன்றாம்', '13'], ['pathimoonru', '13'], ['pathimoonam', '13'],
    ['பதினான்கு', '14'], ['பதினாலாம்', '14'], ['pathinaalu', '14'], ['pathinaalam', '14'],
    ['பதினைந்து', '15'], ['பதினைந்தாம்', '15'], ['pathinainthu', '15'], ['pathinanjam', '15'],
    ['பதினாறு', '16'], ['பதினாறாம்', '16'], ['pathinaaru', '16'],
    ['பதினேழு', '17'], ['பதினேழாம்', '17'], ['pathinezhu', '17'],
    ['பதினெட்டு', '18'], ['பதினெட்டாம்', '18'], ['pathinettu', '18'],
    ['பத்தொன்பது', '19'], ['பத்தொன்பதாம்', '19'], ['pathombadhu', '19'],
    ['இருபது', '20'], ['இருபதாம்', '20'], ['irubadhu', '20'], ['irubatham', '20'],
    ['முப்பது', '30'], ['முப்பதாம்', '30'], ['muppadhu', '30'], ['muppatham', '30'],

    // Common Tanglish + English ordinals/cardinals used while speaking references
    ['onm', '1'], ['onnu', '1'], ['onna', '1'], ['onru', '1'], ['ondru', '1'], ['one', '1'], ['first', '1'],
    ['rendu', '2'], ['irandu', '2'], ['randu', '2'], ['two', '2'], ['second', '2'],
    ['moonu', '3'], ['moondru', '3'], ['munru', '3'], ['three', '3'], ['third', '3'],
    ['naalu', '4'], ['naangu', '4'], ['four', '4'], ['fourth', '4'],
    ['ainthu', '5'], ['anju', '5'], ['five', '5'], ['fifth', '5'],
    ['aaru', '6'], ['six', '6'], ['sixth', '6'],
    ['ezhu', '7'], ['seven', '7'], ['seventh', '7'],
    ['ettu', '8'], ['eight', '8'], ['eighth', '8'],
    ['ombodhu', '9'], ['onbadhu', '9'], ['nine', '9'], ['ninth', '9'],
    ['pathu', '10'], ['ten', '10'], ['tenth', '10'],

    // Common Tamil ordinal transliterations
    ['mudhalam', '1'], ['muthalam', '1'], ['modhalam', '1'],
    ['irandam', '2'], ['randam', '2'],
    ['moondram', '3'], ['munram', '3'],
    ['naangam', '4'], ['naalam', '4'],
    ['aindham', '5'], ['ancham', '5'],
    ['aaram', '6'],
    ['ezham', '7'],
    ['ettam', '8'],
    ['onbadham', '9'],
    ['patham', '10'],

    // Tamil script numbers (longest matching words first)
    ['முதலாவது', '1'], ['முதலாம்', '1'], ['முதல்', '1'], ['ஒன்று', '1'], ['ஒன்னு', '1'], ['ஒண்ணு', '1'], ['ஒன்னாம்', '1'], ['ஒன்றாம்', '1'],
    ['இரண்டாவது', '2'], ['ரெண்டாவது', '2'], ['இரண்டாம்', '2'], ['ரெண்டாம்', '2'], ['இரண்டு', '2'], ['ரெண்டு', '2'],
    ['மூன்றாவது', '3'], ['மூன்றாம்', '3'], ['மூனாம்', '3'], ['மூன்று', '3'], ['மூனு', '3'],
    ['நான்காவது', '4'], ['நான்காம்', '4'], ['நாலாம்', '4'], ['நான்கு', '4'], ['நாலு', '4'],
    ['ஐந்தாவது', '5'], ['ஐந்தாம்', '5'], ['அஞ்சாம்', '5'], ['ஐந்து', '5'], ['அஞ்சு', '5'],
    ['ஆறாவது', '6'], ['ஆறாம்', '6'], ['ஆறு', '6'],
    ['ஏழாவது', '7'], ['ஏழாம்', '7'], ['ஏழு', '7'],
    ['எட்டாவது', '8'], ['எட்டாம்', '8'], ['எட்டு', '8'],
    ['ஒன்பதாவது', '9'], ['ஒன்பதாம்', '9'], ['ஒன்பது', '9'],
    ['பத்தாவது', '10'], ['பத்தாம்', '10'], ['பத்து', '10']
  ];

  for (const [word, num] of pairs) {
    // DO NOT use \b because it fails silently for non-ASCII characters like Tamil!
    const rx = new RegExp(`(^|\\s)${word}(?=\\s|$)`, 'gi');
    out = out.replace(rx, `$1${num}`);
  }
  return out.replace(/\s+/g, ' ').trim();
}

function bpBuildVoiceBookAliases() {
  const aliases = [];
  const numTamil = { '1': 'ஒன்று', '2': 'இரண்டு', '3': 'மூன்று' };
  const numTamilAlt = { '1': 'முதல்', '2': 'இரண்டாம்', '3': 'மூன்றாம்' };
  const numEn = { '1': 'one', '2': 'two', '3': 'three' };
  const numEnOrd = { '1': 'first', '2': 'second', '3': 'third' };
  const numRoman = { '1': 'i', '2': 'ii', '3': 'iii' };

  function pushAlias(book, text) {
    const n = bpNormalizeSpeechText(text);
    if (!n) return;
    aliases.push({ book, alias: n, key: bpPhoneticBookKey(n) });
  }

  Object.keys(bibleData).forEach(book => {
    const meta = tamilBibleBookNames[book] || { en: '', tg: '', alt: '' };
    pushAlias(book, book);
    pushAlias(book, meta.en || '');
    pushAlias(book, meta.tg || '');

    const alts = (meta.alt || '').split(',');
    for (const a of alts) {
      if (a.trim()) pushAlias(book, a.trim());
    }

    const m = book.match(/^([123])\s+(.+)$/);
    if (!m) return;
    const n = m[1];
    const baseTa = m[2];
    const baseEn = (meta.en || '').replace(/^[123]\s+/, '');
    const baseTg = (meta.tg || '').replace(/^[123]\s+/, '');

    pushAlias(book, `${n} ${baseTa}`);
    pushAlias(book, `${numTamil[n]} ${baseTa}`);
    pushAlias(book, `${numTamilAlt[n]} ${baseTa}`);

    if (baseEn) {
      pushAlias(book, `${n} ${baseEn}`);
      pushAlias(book, `${numEn[n]} ${baseEn}`);
      pushAlias(book, `${numEnOrd[n]} ${baseEn}`);
      pushAlias(book, `${numRoman[n]} ${baseEn}`);
    }
    if (baseTg) {
      pushAlias(book, `${n} ${baseTg}`);
      pushAlias(book, `${numTamil[n]} ${baseTg}`);
      pushAlias(book, `${numEn[n]} ${baseTg}`);
    }
  });

  // Prefer longer aliases first so specific book names win
  aliases.sort((a, b) => b.alias.length - a.alias.length);
  return aliases;
}

const _bpVoiceBookAliases = bpBuildVoiceBookAliases();

function bpResolveBookFromSpeech(bookPartRaw) {
  const transcript = bpNormalizeSpeechText(bookPartRaw);
  if (!transcript) return null;
  const partKey = bpPhoneticBookKey(transcript);

  // 1. Exact or Word Boundary matching on plain text (Safest)
  for (const row of _bpVoiceBookAliases) {
    if (transcript === row.alias) return row.book;
    // Match only if it's a distinct structural word, avoiding sub-accidental matches
    if (new RegExp(`(?:^|\\s)${row.alias}(?:\\s|$)`, 'i').test(transcript)) return row.book;
  }

  // 2. Loose Substring matching on plain text
  for (const row of _bpVoiceBookAliases) {
    if (transcript.includes(row.alias)) return row.book;
  }

  // 3. Phonetic matching (Fuzzy Tanglish Mapping)
  for (const row of _bpVoiceBookAliases) {
    if (!row.key || !partKey) continue;
    // It must be at least 4 characters to allow aggressive substring match, 
    // to prevent a 2-letter book alias matching inside a random word accidentally!
    if (partKey === row.key) return row.book;
    if (row.key.length > 3 && partKey.includes(row.key)) return row.book;
  }

  return null;
}

function bpParseSpokenReference(transcriptRaw) {
  // First, completely convert all numeric words (including Tanglish/Tamil) to digits
  const text = bpConvertSpeechNumberWords(bpNormalizeSpeechText(transcriptRaw));
  if (!text) return null;

  const bookFallback = _bpBook || null;
  const book = bpResolveBookFromSpeech(text) || bookFallback;
  if (!book) return null; // We absolutely need a book to proceed

  // Enterprise NLP Proximity Math:
  // Instead of relying on rigid regular expressions which fail randomly over edge cases,
  // we break down the entire speech into an array of meaning tokens and calculate proximity.

  // 1. Separate numbers from connecting characters safely padding spaces
  let tokenText = text
    .replace(/[:.-]/g, ' ')
    // Replace Tamil case markers loosely attached to numbers
    .replace(/(க்கு|ல்|ில்|in|il|ku|kku|வது|ம்|th|ஆம்|aam)/g, ' ') 
    .replace(/\s+/g, ' ')
    .trim();

  const words = tokenText.split(' ');

  // 2. Identify structural indices 
  const chKeywords = ['chapter', 'அதிகாரம்', 'அதிகாரத்துல', 'அதிகாரத்தில்', 'adhigaram', 'athigaram', 'adhikaram', 'athikaram', 'adhigaaram', 'athigaaram'];
  const vsKeywords = ['verse', 'வசனம்', 'வசனம', 'வசனத்துல', 'வசனத்தில்', 'vasanam', 'vasanamum', 'vasanamn', 'vasanathula', 'vasanathil'];

  let chapterIdx = -1;
  let verseIdx = -1;
  const numberTokens = [];

  // 3. Scan timeline of the phrase linearly (Natural Language mapping)
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w) continue;

    // Log occurrence of category keywords
    if (chKeywords.some(kw => w.includes(kw))) chapterIdx = i;
    else if (vsKeywords.some(kw => w.includes(kw))) verseIdx = i;

    // Is it a standalone numeric digit mapping?
    const num = parseInt(w, 10);
    if (!isNaN(num) && w.match(/^\d{1,3}$/)) {
      numberTokens.push({ val: num, idx: i });
    }
  }

  // 4. Proximity & Logical Binding
  let chapter = undefined;
  let verse = undefined;

  if (numberTokens.length >= 2) {
    const tn1 = numberTokens[0];
    const tn2 = numberTokens[1];

    if (chapterIdx !== -1 && verseIdx !== -1) {
      // Mathematical distance matching: Bind the number to the CLOSEST keyword
      const dist1C = Math.abs(tn1.idx - chapterIdx);
      const dist1V = Math.abs(tn1.idx - verseIdx);
      const dist2C = Math.abs(tn2.idx - chapterIdx);
      const dist2V = Math.abs(tn2.idx - verseIdx);

      // If Number 1 is closer to "Verse" AND Number 2 is closer to "Chapter" -> We flip!
      if (dist1V + dist2C < dist1C + dist2V) {
        chapter = tn2.val;
        verse = tn1.val;
      } else {
        // Natural reading (Number 1 mapped to Chapter, Number 2 to Verse)
        chapter = tn1.val;
        verse = tn2.val;
      }
    } else if (chapterIdx !== -1 && verseIdx === -1) {
      // Example: "ஆதியாகமம் 10 அதிகாரம் 1" -> First number gets attached strictly to chapter, remaining falls to verse.
      if (Math.abs(tn1.idx - chapterIdx) <= Math.abs(tn2.idx - chapterIdx)) {
        chapter = tn1.val; verse = tn2.val;
      } else {
        chapter = tn2.val; verse = tn1.val;
      }
    } else if (verseIdx !== -1 && chapterIdx === -1) {
      // Example: "ஆதியாகமம் 10 வசனம் 1" -> Bind whichever is closer to verse
      if (Math.abs(tn1.idx - verseIdx) < Math.abs(tn2.idx - verseIdx)) {
        verse = tn1.val; chapter = tn2.val;
      } else {
        verse = tn2.val; chapter = tn1.val;
      }
    } else {
      // Naked mapping "ஆதியாகமம் 10 1" -> Default to Chapter first, Verse second
      chapter = tn1.val;
      verse = tn2.val;
    }
  } else if (numberTokens.length === 1) {
    const tn1 = numberTokens[0];
    if (verseIdx !== -1 && chapterIdx === -1) {
      // Completely alone Verse declaration: "10 வசனம்"
      verse = tn1.val;
    } else {
      // Completely alone Chapter declaration: "10 அதிகாரம்", or just naked "10"
      chapter = tn1.val;
    }
  }

  if (chapter === undefined && verse === undefined) return null;

  const result = { book };
  if (chapter !== undefined) result.chapter = chapter;
  if (verse !== undefined) result.verse = verse;
  return result;
}

function bpSetListenButtonState() {
  const btn = document.getElementById('bp-listen-btn');
  if (!btn) return;
  btn.classList.toggle('active', _bpVoiceListening);
  btn.textContent = _bpVoiceListening ? '🛑 Stop Listening' : '🎤 Listen';
}

function bpSetListenStatus(msg, type) {
  const el = document.getElementById('bp-listen-status');
  if (!el) return;
  el.textContent = msg;
  if (type === 'ok') el.style.color = '#86efac';
  else if (type === 'err') el.style.color = '#fca5a5';
  else el.style.color = '#9ca3af';
}

function bpApplyVoiceReference(ref, transcript) {
  const data = bibleData[ref.book];
  if (!data) return;

  const resolvedChapter = ref.chapter !== undefined ? ref.chapter : (_bpChapter || 1);
  const chap = Math.max(1, Math.min(resolvedChapter, data.chapters));

  // If user says "1ம் அதிகாரம்" (chapter only) and they're in a NEW book, default verse to 1.
  // Otherwise, if they only said chapter but didn't say verse, reuse the old verse.
  let resolvedVerse = ref.verse !== undefined ? ref.verse : (_bpVerse || 1);
  if (ref.chapter !== undefined && ref.verse === undefined && ref.book !== _bpBook) {
      resolvedVerse = 1;
  }

  const verseCount = ((data.versesPerChapter && data.versesPerChapter[chap - 1]) || 0);
  const verse = Math.max(1, verseCount ? Math.min(resolvedVerse, verseCount) : resolvedVerse);

  _bpBook = ref.book;
  _bpChapter = chap;
  _bpVerse = verse;

  document.getElementById('bp-book').value = ref.book;
  const meta = tamilBibleBookNames[ref.book] || { en: '' };
  document.getElementById('bp-book-display').value = ref.book + (meta.en ? ` (${meta.en})` : '');
  bpOnBookChange();

  document.getElementById('bp-chapter').value = chap;
  bpOnChapterChange();

  document.getElementById('bp-verse').value = verse;
  bpOnVerseChange();

  // Always let the user see that speech populated the Bible panel fields.
  showToast(`🎤 Selected ${ref.book} ${chap}:${verse}`, 'info', 1200);
  bpSetListenStatus(`Heard: ${ref.book} ${chap}:${verse}`, 'ok');

  const key = `${ref.book}|${chap}|${verse}`;
  const now = Date.now();
  if (key === _bpVoiceLastRefKey && (now - _bpVoiceLastAt) < 3500) return;
  _bpVoiceLastRefKey = key;
  _bpVoiceLastAt = now;

  if (!_bpOpen) toggleBiblePanel();

  bpShowFullscreen();
  showToast(`🎤 ${ref.book} ${chap}:${verse} detected`, 'success', 1600);
}

function bpApplyVoiceBookOnly(book) {
  const data = bibleData[book];
  if (!data) return;
  _bpBook = book;
  _bpChapter = null;
  _bpVerse = null;

  document.getElementById('bp-book').value = book;
  const meta = tamilBibleBookNames[book] || { en: '' };
  document.getElementById('bp-book-display').value = book + (meta.en ? ` (${meta.en})` : '');
  bpOnBookChange();

  if (!_bpOpen) toggleBiblePanel();
  bpSetListenStatus(`Heard Book: ${book}`, 'ok');
  showToast(`🎤 Selected Book: ${book}`, 'info', 1200);
}

function bpToggleVoiceListen() {
  if (_bpVoiceListening) {
    bpStopVoiceListen();
  } else {
    bpStartVoiceListen();
  }
}

function bpHandleRecognizedTranscript(transcript) {
  const heard = String(transcript || '').trim();
  if (!heard) return;

  bpSetListenStatus(`Heard: ${heard}`, 'info');

  const parsed = bpParseSpokenReference(heard);
  if (parsed) {
    bpApplyVoiceReference(parsed, heard);
    return;
  }

  const bookOnly = bpResolveBookFromSpeech(heard);
  if (bookOnly) {
    bpApplyVoiceBookOnly(bookOnly);
    return;
  }

  bpSetListenStatus(`No reference match: ${heard}`, 'err');
}

function bpGetLocalAsrBaseUrl() {
  const saved = localStorage.getItem(BP_LOCAL_ASR_STORAGE_KEY);
  return (saved && saved.trim()) ? saved.trim() : BP_LOCAL_ASR_DEFAULT_BASE;
}

function bpSetLocalAsrBaseUrl(url) {
  const val = String(url || '').trim();
  if (!val) {
    localStorage.removeItem(BP_LOCAL_ASR_STORAGE_KEY);
    return;
  }
  localStorage.setItem(BP_LOCAL_ASR_STORAGE_KEY, val);
}

// Expose config helpers in console for quick field setup.
window.bpSetLocalAsrBaseUrl = bpSetLocalAsrBaseUrl;
window.bpGetLocalAsrBaseUrl = bpGetLocalAsrBaseUrl;

function bpExtractLocalAsrText(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload.trim();

  if (typeof payload.text === 'string') return payload.text.trim();
  if (typeof payload.transcript === 'string') return payload.transcript.trim();
  if (payload.result && typeof payload.result.text === 'string') return payload.result.text.trim();
  if (payload.data && typeof payload.data.text === 'string') return payload.data.text.trim();
  if (Array.isArray(payload.segments)) {
    const merged = payload.segments.map(s => (s && s.text ? String(s.text) : '')).join(' ').trim();
    if (merged) return merged;
  }
  return '';
}

async function bpTranscribeWithLocalAsr(blob) {
  const base = bpGetLocalAsrBaseUrl().replace(/\/+$/, '');
  const endpoints = [`${base}/inference`, `${base}/transcribe`, `${base}/asr`];

  let lastError = null;
  for (const url of endpoints) {
    try {
      const fd = new FormData();
      fd.append('file', blob, 'voice.webm');
      fd.append('language', 'ta');
      fd.append('task', 'transcribe');

      const res = await fetch(url, { method: 'POST', body: fd });
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }

      const ct = (res.headers.get('content-type') || '').toLowerCase();
      let text = '';
      if (ct.includes('application/json')) {
        const json = await res.json();
        text = bpExtractLocalAsrText(json);
      } else {
        text = bpExtractLocalAsrText(await res.text());
      }

      if (text) {
        _bpLocalAsrActiveEndpoint = url;
        return text;
      }
      lastError = new Error('empty transcription');
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('local asr unavailable');
}

async function bpStartLocalAsrListen() {
  if (!window.MediaRecorder || !window.fetch) return false;

  try {
    _bpLocalAsrStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true
      }
    });

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    _bpLocalAsrRecorder = new MediaRecorder(_bpLocalAsrStream, { mimeType });
    _bpLocalAsrRecorder.ondataavailable = async (e) => {
      if (!_bpVoiceListening || _bpVoiceEngine !== 'local') return;
      if (_bpLocalAsrBusy || !e.data || !e.data.size) return;

      _bpLocalAsrBusy = true;
      try {
        const text = await bpTranscribeWithLocalAsr(e.data);
        if (!text || text === _bpLocalAsrLastText) return;
        _bpLocalAsrLastText = text;
        _bpLocalAsrErrors = 0;
        bpHandleRecognizedTranscript(text);
      } catch (err) {
        _bpLocalAsrErrors += 1;
        const msg = err && err.message ? err.message : 'local asr error';
        bpSetListenStatus(`Local ASR error: ${msg}`, 'err');
      } finally {
        _bpLocalAsrBusy = false;
      }
    };

    _bpLocalAsrRecorder.start(2500);
    return true;
  } catch (_) {
    return false;
  }
}

function bpStopLocalAsrListen() {
  if (_bpLocalAsrRecorder) {
    try {
      if (_bpLocalAsrRecorder.state !== 'inactive') _bpLocalAsrRecorder.stop();
    } catch (_) {}
    _bpLocalAsrRecorder = null;
  }

  if (_bpLocalAsrStream) {
    _bpLocalAsrStream.getTracks().forEach(t => {
      try { t.stop(); } catch (_) {}
    });
    _bpLocalAsrStream = null;
  }

  _bpLocalAsrBusy = false;
  _bpLocalAsrErrors = 0;
  _bpLocalAsrLastText = '';
}

async function bpEnsureMicPermission() {
  if (_bpVoiceMicGranted) return true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    _bpVoiceMicGranted = true;
    return true;
  } catch (_) {
    return false;
  }
}

async function bpStartVoiceListen() {
  const hasPermission = await bpEnsureMicPermission();
  if (!hasPermission) {
    showToast('Microphone permission denied', 'error');
    bpStopVoiceListen();
    return;
  }

  // Offline-only mode: use local ASR service exclusively.
  const localStarted = await bpStartLocalAsrListen();
  if (localStarted) {
    _bpVoiceEngine = 'local';
    _bpVoiceListening = true;
    _bpLocalAsrErrors = 0;
    bpSetListenButtonState();
    bpSetListenStatus(`Voice status: listening (Local ASR ${_bpLocalAsrActiveEndpoint || bpGetLocalAsrBaseUrl()})`, 'ok');
    showToast('Local ASR listening started', 'success', 1700);
    return;
  }

  _bpVoiceListening = false;
  bpSetListenButtonState();
  bpSetListenStatus('Local ASR not reachable. Start your offline ASR server and try again.', 'err');
  showToast('Offline ASR server is not running', 'error', 2200);
}

function bpStopVoiceListen() {
  _bpVoiceListening = false;
  bpSetListenButtonState();
  bpSetListenStatus('Voice status: stopped', 'info');

  if (_bpVoiceEngine === 'local') {
    bpStopLocalAsrListen();
  }

  _bpVoiceEngine = 'local';
  showToast('Bible listening stopped', 'info', 1200);
}

function bpCleanNumericSearch(raw) {
  return String(raw || '').replace(/\D+/g, '');
}

function bpFindNumericOption(selectEl, numericText) {
  let exact = null;
  let partial = null;
  for (const opt of selectEl.options) {
    if (!opt.value) continue;
    const valStr = String(opt.value);
    if (valStr === numericText) {
      exact = opt;
      break;
    }
    if (!partial && valStr.startsWith(numericText)) {
      partial = opt;
    }
  }
  return { exact, partial };
}

function bpOnChapterSearchInput() {
  const input = document.getElementById('bp-chapter-search');
  const chapSel = document.getElementById('bp-chapter');
  if (!input || !chapSel || chapSel.disabled) return;
  const cleaned = bpCleanNumericSearch(input.value);
  if (input.value !== cleaned) input.value = cleaned;
  if (!cleaned) return;
  const match = bpFindNumericOption(chapSel, cleaned);
  if (match.exact) {
    chapSel.value = match.exact.value;
    bpOnChapterChange();
  }
}

function bpOnChapterSearchKeydown(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const input = document.getElementById('bp-chapter-search');
  const chapSel = document.getElementById('bp-chapter');
  if (!input || !chapSel || chapSel.disabled) return;
  const cleaned = bpCleanNumericSearch(input.value);
  if (!cleaned) return;
  const match = bpFindNumericOption(chapSel, cleaned);
  const target = match.exact || match.partial;
  if (!target) return;
  chapSel.value = target.value;
  bpOnChapterChange();
}

function bpOnVerseSearchInput() {
  const input = document.getElementById('bp-verse-search');
  const verseSel = document.getElementById('bp-verse');
  if (!input || !verseSel || verseSel.disabled) return;
  const cleaned = bpCleanNumericSearch(input.value);
  if (input.value !== cleaned) input.value = cleaned;
  if (!cleaned) return;
  const match = bpFindNumericOption(verseSel, cleaned);
  if (match.exact) {
    verseSel.value = match.exact.value;
    bpOnVerseChange();
  }
}

function bpOnVerseSearchKeydown(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const input = document.getElementById('bp-verse-search');
  const verseSel = document.getElementById('bp-verse');
  if (!input || !verseSel || verseSel.disabled) return;
  const cleaned = bpCleanNumericSearch(input.value);
  if (!cleaned) return;
  const match = bpFindNumericOption(verseSel, cleaned);
  const target = match.exact || match.partial;
  if (!target) return;
  verseSel.value = target.value;
  bpOnVerseChange();
}

function toggleBiblePanel() {
  const panel = document.getElementById('bible-panel');
  const btn   = document.getElementById('btn-bible-panel');
  const willOpen = !_bpOpen;

  // Intelligent override: only one right-side drawer should be open at a time.
  if (willOpen && _spOpen) {
    _spOpen = false;
    document.getElementById('song-panel')?.classList.remove('open');
    document.getElementById('btn-song-panel')?.classList.remove('panel-open');
  }

  _bpOpen = willOpen;
  panel.classList.toggle('open', _bpOpen);
  btn.classList.toggle('panel-open', _bpOpen);

  // Ensure the custom book dropdown does not float above other UI when closing.
  if (!_bpOpen) {
    document.getElementById('bp-book-list')?.classList.remove('show');
  }
}

function bpOnBookChange() {
  const bookName = document.getElementById('bp-book').value;
  _bpBook    = bookName || null;
  _bpChapter = null;
  _bpVerse   = null;
  const chapSel  = document.getElementById('bp-chapter');
  const chapSearch = document.getElementById('bp-chapter-search');
  const verseSel = document.getElementById('bp-verse');
  const verseSearch = document.getElementById('bp-verse-search');
  chapSel.innerHTML  = '<option value="">— அதிகாரம் —</option>';
  verseSel.innerHTML = '<option value="">— எல்லா வசனங்கள் —</option>';
  verseSel.disabled  = true;
  if (chapSearch) {
    chapSearch.value = '';
    chapSearch.disabled = true;
  }
  if (verseSearch) {
    verseSearch.value = '';
    verseSearch.disabled = true;
  }
  if (!bookName) { chapSel.disabled = true; bpUpdatePreview(); return; }
  const chapCnt = bibleData[bookName].chapters;
  for (let c = 1; c <= chapCnt; c++) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = `அதிகாரம் ${c}`;
    chapSel.appendChild(opt);
  }
  chapSel.disabled = false;
  if (chapSearch) chapSearch.disabled = false;

  if (chapCnt > 0) {
    chapSel.value = 1;
    bpOnChapterChange();
  } else {
    bpUpdatePreview();
  }
}

function bpOnChapterChange() {
  const chapSel  = document.getElementById('bp-chapter');
  const chapNum  = parseInt(chapSel.value);
  _bpChapter     = chapNum || null;
  _bpVerse       = null;
  const verseSel = document.getElementById('bp-verse');
  const chapSearch = document.getElementById('bp-chapter-search');
  const verseSearch = document.getElementById('bp-verse-search');
  if (chapSearch) chapSearch.value = _bpChapter ? String(_bpChapter) : '';
  if (verseSearch) verseSearch.value = '';
  verseSel.innerHTML = '<option value="">— எல்லா வசனங்கள் —</option>';
  if (!_bpBook || !chapNum) {
    verseSel.disabled = true;
    if (verseSearch) verseSearch.disabled = true;
    bpUpdatePreview();
    return;
  }
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
    if (verseSearch) verseSearch.disabled = false;
    
    // Auto-select verse 1 when chapter changes
    verseSel.value = 1;
    bpOnVerseChange();
  } else {
    verseSel.disabled = true;
    if (verseSearch) verseSearch.disabled = true;
    bpUpdatePreview();
  }
}

function bpOnVerseChange() {
  _bpVerse = parseInt(document.getElementById('bp-verse').value) || null;
  const verseSearch = document.getElementById('bp-verse-search');
  if (verseSearch) verseSearch.value = _bpVerse ? String(_bpVerse) : '';
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
  return createAnimeVasanamHtml(text, ref);
}

function bpFsNav(dir) {
  if (!_bpBook || !_bpChapter || !_bpVerse) return;
  const books = Object.keys(bibleData);
  let bIdx = books.indexOf(_bpBook);
  let cNum = parseInt(_bpChapter);
  let vNum = parseInt(_bpVerse);

  function getVerseCount(book, chap) {
    const data = bibleData[book];
    const vpcArr = data.versesPerChapter;
    let count = (vpcArr && vpcArr[chap - 1]) || 0;
    if (!count && data.content && data.content[chap]) {
        count = Object.keys(data.content[chap]).length;
    }
    return count;
  }

  if (dir === 1) {
    vNum++;
    let maxV = getVerseCount(_bpBook, cNum);
    if (vNum > maxV) {
      vNum = 1;
      cNum++;
      if (cNum > bibleData[_bpBook].chapters) {
        cNum = 1;
        bIdx++;
        if (bIdx >= books.length) return; // end of bible
        _bpBook = books[bIdx];
      }
    }
  } else {
    vNum--;
    if (vNum < 1) {
      cNum--;
      if (cNum < 1) {
        bIdx--;
        if (bIdx < 0) return; // start of bible
        _bpBook = books[bIdx];
        cNum = bibleData[_bpBook].chapters;
      }
      vNum = getVerseCount(_bpBook, cNum);
    }
  }

  // Update UI state so the preview generates correctly
  document.getElementById('bp-book').value = _bpBook;
  const meta = tamilBibleBookNames[_bpBook] || { en: "" };
  document.getElementById('bp-book-display').value = _bpBook + (meta.en ? ` (${meta.en})` : '');
  bpOnBookChange();

  document.getElementById('bp-chapter').value = cNum;
  bpOnChapterChange();

  document.getElementById('bp-verse').value = vNum;
  bpOnVerseChange();

  // Now reload iframe by calling bpShowFullscreen
  bpShowFullscreen();
}

function bpShowFullscreen() {
  if (!_bpBook || !_bpChapter) { showToast('வசனம் தேர்ந்தெடுக்கவும்', 'error'); return; }
  const html = _bpBuildSlideHtml();
  if (!html) { showToast('Bible content not loaded yet — add verses first', 'error'); return; }
  const ref = document.getElementById('bp-preview-ref').textContent;
  // Show overlay FIRST so the iframe has real dimensions when autoFit runs
  document.getElementById('bp-fs-prev').style.display = 'block';
  document.getElementById('bp-fs-next').style.display = 'block';
  document.getElementById('present-overlay').classList.add('active', 'bible-fs');
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
  const slide = { 
    id: Date.now() + Math.random(), 
    type: 'html', 
    name: ref, 
    html,
    bibleBook: _bpBook,
    bibleChapter: _bpChapter,
    bibleVerse: _bpVerse 
  };
  if (!slides.length) {
    slides.push(slide);
    currentIdx = 0;
    renderAll(); renderPreview(); renderEditor();
    scheduleSave();
    showToast(`✓ Slide added: ${ref}`, 'success');
    return;
  }
  _pendingSlide = slide;
  _pendingSlideType = null;
  const defaultPos = currentIdx + 2;
  const inp = document.getElementById('insert-position');
  inp.value = defaultPos;
  inp.max = slides.length + 1;
  document.getElementById('insert-modal-info').textContent =
    `Current: slide ${currentIdx + 1} of ${slides.length}. Enter 1–${slides.length + 1}:`;
  const modal = document.getElementById('insert-modal');
  modal.style.display = 'flex';
  inp.focus(); inp.select();
}

// ══════════════════════════════════════════════════
//  SONG BOOK PANEL
// ══════════════════════════════════════════════════
let _spOpen = false;
let _spSongId = null;
let _spSongKeys = [];   // sorted array of song IDs
let _spFilteredKeys = []; // currently visible IDs after search
let _spFsEditorMode = 'edit'; // 'edit' | 'new'

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
      if (typeof _spTrySilentHandleRestore === "function") {
        await _spTrySilentHandleRestore();
      }
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
  const willOpen = !_spOpen;

  // Intelligent override: close Bible drawer before opening Song drawer.
  if (willOpen && _bpOpen) {
    _bpOpen = false;
    document.getElementById('bible-panel')?.classList.remove('open');
    document.getElementById('btn-bible-panel')?.classList.remove('panel-open');
    document.getElementById('bp-book-list')?.classList.remove('show');
  }

  _spOpen = willOpen;
  panel.classList.toggle('open', _spOpen);
  btn.classList.toggle('panel-open', _spOpen);
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
  document.getElementById('bp-fs-prev').style.display = 'none';
  document.getElementById('bp-fs-next').style.display = 'none';
  const overlay = document.getElementById('present-overlay');
  overlay.classList.remove('bible-fs');
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
  
  const presentControls = document.getElementById('sp-fs-present-controls');
  const addSongBtn = document.getElementById('sp-fs-add-song-btn');
  const updateSongBtn = document.getElementById('sp-fs-update-song-btn');
  if (presentControls && addSongBtn) {
    if (_spFsEditorMode === 'new') {
      presentControls.style.display = 'none';
      if (updateSongBtn) updateSongBtn.style.display = 'none';
      addSongBtn.style.display = 'block';
    } else {
      presentControls.style.display = 'flex';
      if (updateSongBtn) updateSongBtn.style.display = 'block';
      addSongBtn.style.display = 'none';
    }
  }
}

async function spSaveNewSong() {
  const songData = _spReadFsEditorSongInput();
  if (!songData) return; // validation failed

  const highestId = Math.max(0, ...Object.keys(songContent).map(Number));
  const newId = highestId + 1;

  try {
    const payload = JSON.stringify({
      id: newId,
      title: songData.title || "",
      artist: songData.artist || "",
      content: songData.content || ""
    });

    const res = await fetch('http://localhost:7777/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Server returned ${res.status}: ${errText}`);
    }

    // Successfully appended to the master JS file via SongSaver
    songContent[newId] = songData;
    showToast('✓ Song permanently saved to database!', 'success');
    
    // Switch to this new song and change to edit mode to show Presentation bounds
    _spRefreshSongListAndSelect(newId);
    spSetFsEditorMode('edit');
    return;
  } catch (err) {
    console.error("SongSaver server not reachable:", err.message);
    showToast('❌ Start SongSaver.bat first to save to script properly!', 'error');
  }
}

async function spUpdateExistingSong() {
  if (_spSongId === null || !songContent[_spSongId]) return;
  const songData = _spReadFsEditorSongInput();
  if (!songData) return;

  if (!confirm(`Are you sure you want to permanently update the song "${songData.title}" in the database?`)) {
    return;
  }

  try {
    const payload = JSON.stringify({
      id: _spSongId,
      title: songData.title || "",
      artist: songData.artist || "",
      content: songData.content || ""
    });

    const res = await fetch('http://localhost:7777/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Server returned ${res.status}: ${errText}`);
    }

    // Successfully updated in the master JS file via SongSaver
    songContent[_spSongId] = songData;
    showToast('✓ Song specifically updated in database!', 'success');
    
    // Refresh display
    _spRefreshSongListAndSelect(_spSongId);
    
    // Optional: reload the preview
    const pf = document.getElementById('present-iframe');
    if (pf) pf.srcdoc = _spBuildPageHtml();
  } catch (err) {
    console.error("SongSaver server not reachable:", err.message);
    showToast('❌ Update failed. Is Start_App.bat running?', 'error');
  }
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
  <\/style></head><body><div class="box"><h1>➕ New Song</h1><p>Use the editor on the right panel and click <b>Save Song to Database</b>.</p></div></body></html>`;

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
    const preview = v.length > 250 ? v.slice(0, 250) + '…' : v;
    div.innerHTML =
      '<div style="flex:1;"><span class="sp-fs-verse-text">' + _esc(preview).replace(/\n/g, '<br>') + '</span></div>' +
      '<div class="sp-fs-verse-ctrls">' +
        '<div class="sp-tag-group"><input type="radio" id="sp-m-'+i+'" name="sp-auto-main" value="'+i+'"><label for="sp-m-'+i+'" class="lbl-m" title="Set as Main Chorus">M</label></div>' +
        '<div class="sp-tag-group"><input type="radio" id="sp-s-'+i+'" name="sp-auto-sub" value="'+i+'"><label for="sp-s-'+i+'" class="lbl-s" title="Set as Mid/Sub Chorus">m</label></div>' +
        '<input type="number" id="sp-stz-'+i+'" class="sp-ord-in" min="1" placeholder="#" title="Stanza Order">' +
        '<button class="sp-fs-verse-add" onclick="spQueueAdd(' + i + ')" title="Add to queue manually">➕</button>' +
      '</div>';
    container.appendChild(div);
  });
  _spRenderQueue();
}

function spAutoGenerateQueue() {
  const mainInput = document.querySelector('input[name="sp-auto-main"]:checked');
  const subInput = document.querySelector('input[name="sp-auto-sub"]:checked');
  
  const mainIdx = mainInput ? parseInt(mainInput.value, 10) : -1;
  const subIdx = subInput ? parseInt(subInput.value, 10) : -1;

  // Gather all explicitly numbered stanzas
  let stanzas = [];
  for (let i = 0; i < _spVerses.length; i++) {
    const numVal = parseInt(document.getElementById('sp-stz-'+i).value, 10);
    if (!isNaN(numVal)) {
      stanzas.push({ idx: i, order: numVal });
    }
  }

  // If no order numbers were typed but we need standard order, assume non-choruses are stanzas
  if (stanzas.length === 0) {
    for (let i = 0; i < _spVerses.length; i++) {
      if (i !== mainIdx && i !== subIdx) {
        stanzas.push({ idx: i, order: stanzas.length + 1 });
      }
    }
  }

  // Sort stanzas by their given order
  stanzas.sort((a, b) => a.order - b.order);

  if (mainIdx === -1 && stanzas.length === 0) {
    showToast("Please tag a Main Chorus (M) or type Stanza orders (#) to generate.", "error");
    return;
  }

  _spQueue = [];

  // Always start with Main Chorus if it exists
  if (mainIdx !== -1) {
    _spQueue.push({ text: _spVerses[mainIdx], name: 'Main Chorus' });
  }

  stanzas.forEach((stz, i) => {
    // Add Sub Chorus if it exists
    if (subIdx !== -1) {
      _spQueue.push({ text: _spVerses[subIdx], name: 'Sub Chorus' });
    }
    
    // Add the specific Stanza
    _spQueue.push({ text: _spVerses[stz.idx], name: 'Stanza ' + stz.order });
    
    // If there's no sub chorus, we interleave the main chorus between stanzas
    if (subIdx === -1 && mainIdx !== -1 && i < stanzas.length - 1) {
      _spQueue.push({ text: _spVerses[mainIdx], name: 'Main Chorus' });
    }
  });

  // End the sequence
  if (subIdx !== -1) {
    _spQueue.push({ text: _spVerses[subIdx], name: 'Sub Chorus' });
  }
  if (mainIdx !== -1) {
    _spQueue.push({ text: _spVerses[mainIdx], name: 'Main Chorus' });
  }

  _spRenderQueue();
  showToast("Queue Auto-Generated Successfully!", "success");
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
  document.getElementById('bp-fs-prev').style.display = 'none';
  document.getElementById('bp-fs-next').style.display = 'none';
  const overlay = document.getElementById('present-overlay');
  overlay.classList.remove('bible-fs');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  renderPresentBookmarks();
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

function checkBibleVerseSlide(slide) {
  if (!slide) return null;
  if (slide.bibleBook) return { book: slide.bibleBook, chapter: slide.bibleChapter, verse: slide.bibleVerse || "1" };
  if (!slide.name) return null;
  const match = slide.name.match(/^(.*?)\s+(\d+)(?::(\d+))?$/);
  if (!match) return null;
  const book = match[1].trim();
  if (bibleData && bibleData[book]) {
    return { book, chapter: match[2], verse: match[3] || "1" };
  }
  return null;
}

function openCurrentSlideInBible() {
  const slide = slides[presentIdx];
  const ref = checkBibleVerseSlide(slide);
  if (!ref) return;

  document.getElementById('bp-book').value = ref.book;
  const meta = tamilBibleBookNames[ref.book] || { en: "" };
  document.getElementById('bp-book-display').value = ref.book + (meta.en ? ` (${meta.en})` : '');
  bpOnBookChange();

  document.getElementById('bp-chapter').value = ref.chapter;
  bpOnChapterChange();

  document.getElementById('bp-verse').value = ref.verse || "1";
  bpOnVerseChange();

  bpShowFullscreen();
}

function showPresentSlide() {
  const pif = document.getElementById('present-iframe');
  injectAutoFit(pif);
  pif.srcdoc = getPresentHtml(presentIdx);
  const ind = document.getElementById('present-indicator');
  ind.textContent = `${presentIdx + 1} / ${slides.length}`;
  ind.onclick = showGotoInput;

  const btnOpenBible = document.getElementById('present-open-bible-btn');
  if (btnOpenBible) {
    if (checkBibleVerseSlide(slides[presentIdx])) {
      btnOpenBible.style.display = 'inline-block';
    } else {
      btnOpenBible.style.display = 'none';
    }
  }

  renderPresentBookmarks();
}

function renderPresentBookmarks() {
  const overlay = document.getElementById('present-overlay');
  const listEl = document.getElementById('present-bookmark-list');
  if (!overlay || !listEl) return;
  if (!overlay.classList.contains('active') || overlay.classList.contains('panel-fs')) {
    listEl.innerHTML = '';
    return;
  }

  const bookmarks = [];
  for (let i = 0; i < slides.length; i++) {
    if (slides[i] && slides[i].bookmarked) bookmarks.push(i);
  }

  listEl.innerHTML = '';
  if (!bookmarks.length) {
    const empty = document.createElement('div');
    empty.className = 'present-bookmark-empty';
    empty.textContent = 'No bookmarks yet';
    listEl.appendChild(empty);
    return;
  }

  bookmarks.forEach(idx => {
    const s = slides[idx];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'present-bookmark-item' + (idx === presentIdx ? ' active' : '');
    btn.innerHTML = `<span class="pb-num">${idx + 1}</span><span class="pb-name">${s.name || 'Slide ' + (idx + 1)}</span>`;
    btn.addEventListener('click', () => presentJumpTo(idx));
    listEl.appendChild(btn);
  });
}

function presentJumpTo(idx) {
  if (idx < 0 || idx >= slides.length) return;
  if (presentIdx === idx) return;
  _presentPrevIdx = presentIdx;
  presentIdx = idx;
  showPresentSlide();
  updateBackBtn();
}

function showGotoInput() {
  const overlay = document.getElementById('present-overlay');
  if (overlay.classList.contains('bible-fs')) return;
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

function spShowTempSlides() {
  if (_spQueue.length === 0) { showToast('Queue is empty', 'error'); return; }
  const song = songContent[_spSongId];
  const songName = song ? song.title : 'Song';
  const songSlideBg = 'linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%)';
  
  const tempSlides = [];
  _spQueue.forEach((item, i) => {
    const ref = songName + '  (Song #' + _spSongId + ')';
    const html = createVasanamHtml(item.text, ref, songSlideBg, '#f8fafc', 'medium');
    tempSlides.push({ id: Date.now() + Math.random(), type: 'html', name: songName + ' - ' + (i + 1), html });
  });

  _tempBackupSlides = [...slides];
  _tempBackupIdx = currentIdx;

  slides.length = 0;
  slides.push(...tempSlides);
  currentIdx = 0;

  const overlay = document.getElementById('present-overlay');
  overlay.classList.remove('panel-fs'); // hiding the song panel
  
  startPresent();
}

function exitPresent() {
  const overlay = document.getElementById('present-overlay');
  
  // If we are currently in bible full screen but were doing a slideshow
  if (overlay.classList.contains('bible-fs') && typeof presentIdx === 'number' && presentIdx >= 0) {
    overlay.classList.remove('bible-fs');
    document.getElementById('bp-fs-prev').style.display = 'none';
    document.getElementById('bp-fs-next').style.display = 'none';
    showPresentSlide();
    return;
  }

  // Restore temp slides if active
  if (_tempBackupSlides) {
    slides.length = 0;
    slides.push(..._tempBackupSlides);
    currentIdx = _tempBackupIdx;
    _tempBackupSlides = null;
    _tempBackupIdx = -1;
    
    // Return back to the Song Panel presentation mode instead of full exit
    overlay.classList.add('panel-fs');
    presentIdx = null;
    _presentPrevIdx = null;
    updateBackBtn();
    
    const pif = document.getElementById('present-iframe');
    if (_spSongId !== null && typeof _spBuildPageHtml === 'function') {
      const html = _spBuildPageHtml();
      if (html) {
        pif.srcdoc = html;
        const song = songContent[_spSongId];
        if (song) document.getElementById('present-indicator').textContent = song.title;
      }
    } else {
      pif.srcdoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden}body{display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%);color:#f8fafc;font-family:'Noto Serif Tamil','Nirmala UI',serif;padding:4vw}.box{text-align:center;max-width:900px}h1{font-size:48px;line-height:1.25;color:#7dd3fc;margin-bottom:12px}p{font-size:26px;line-height:1.7;opacity:0.92}<\/style></head><body><div class="box"><h1>➕ New Song</h1><p>Use the editor on the right panel.</p></div></body></html>`;
      document.getElementById('present-indicator').textContent = 'New Song';
    }
    
    releaseWakeLock();
    return;
  }

  // Full exit
  overlay.classList.remove('active', 'panel-fs', 'bible-fs');
  document.body.style.overflow = '';
  document.getElementById('bp-fs-prev').style.display = 'none';
  document.getElementById('bp-fs-next').style.display = 'none';
  renderPresentBookmarks();
  presentIdx = null; // Clear presentIdx when fully pushed out
  releaseWakeLock();
}

// Keyboard nav in present mode
document.addEventListener('keydown', e => {
  const overlay = document.getElementById('present-overlay');
  if (!overlay.classList.contains('active')) return;

  if (overlay.classList.contains('bible-fs')) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') bpFsNav(1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') bpFsNav(-1);
    if (e.key === 'Escape') exitPresent();
    return;
  }

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

// ══════════════════════════════════════════════════
//  SONG PANEL RESIZER
// ══════════════════════════════════════════════════
(function initSpResizer() {
  const resizer = document.getElementById('sp-fs-resizer');
  let isResizing = false;

  if (!resizer) return;

  function setDragCover(active) {
    let cover = document.getElementById('sp-drag-cover');
    if (active) {
      if (!cover) {
        cover = document.createElement('div');
        cover.id = 'sp-drag-cover';
        cover.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:ew-resize;';
        document.body.appendChild(cover);
      }
      cover.style.display = 'block';
      document.body.style.cursor = 'ew-resize';
      resizer.classList.add('resizing');
    } else {
      if (cover) cover.style.display = 'none';
      document.body.style.cursor = '';
      resizer.classList.remove('resizing');
    }
  }

  // Classic drag-to-resize
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    setDragCover(true);
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    // Calculate width from the right edge
    let newWidth = window.innerWidth - e.clientX;
    
    // Constraints
    if (newWidth < 250) newWidth = 250;
    if (newWidth > window.innerWidth * 0.8) newWidth = window.innerWidth * 0.8;
    
    document.documentElement.style.setProperty('--sp-panel-width', newWidth + 'px');
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      setDragCover(false);
    }
  });

  // Also support double-click to quickly reset to default
  resizer.addEventListener('dblclick', () => {
    document.documentElement.style.setProperty('--sp-panel-width', '35vw');
  });
})();
