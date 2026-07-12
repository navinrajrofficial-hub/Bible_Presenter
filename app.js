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
let _voiceActive = false;
let _voiceBusy = false;
let _voiceAudioCtx = null;
let _voiceSource = null;
let _voiceProcessor = null;
let _voiceSamples = [];
let _voiceTimer = null;
let _voiceIndex = [];
const _voiceSampleRate = 16000;
const _voiceChunkMs = 3200;
const _voiceServerUrl = 'http://localhost:8123/transcribe';

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
const MEDIA_EMBED_MAX_BYTES = 8 * 1024 * 1024; // Keep localStorage reasonably safe when embedding files.

function normalizeSlide(raw) {
  const s = Object.assign({}, raw || {});
  s.id = s.id || (Date.now() + Math.random());
  s.bookmarked = !!s.bookmarked;
  s._rev = Number.isInteger(s._rev) ? s._rev : 0;

  if (s.type === 'html') {
    s.name = (typeof s.name === 'string' && s.name.trim()) ? s.name : 'HTML Slide';
    s.html = typeof s.html === 'string' ? s.html : '';
    // Preserve song group metadata if present (backward compatible - old files won't have this)
    if (s.songGroupId) {
      s.songGroupId = s.songGroupId;
      s.songGroupIndex = typeof s.songGroupIndex === 'number' ? s.songGroupIndex : 0;
      s.songGroupTotal = typeof s.songGroupTotal === 'number' ? s.songGroupTotal : 1;
      s.songGroupName = typeof s.songGroupName === 'string' ? s.songGroupName : '';
    }
    return s;
  }

  if (s.type === 'media') {
    s.name = (typeof s.name === 'string' && s.name.trim()) ? s.name : 'Media Slide';
    s.mediaKind = s.mediaKind === 'video' ? 'video' : 'image';
    s.mediaSrc = typeof s.mediaSrc === 'string' ? s.mediaSrc : '';
    return s;
  }

  s.type = 'simple';
  s.name = (typeof s.name === 'string' && s.name.trim()) ? s.name : 'New Slide';
  s.title = typeof s.title === 'string' ? s.title : 'Slide Title';
  s.body = typeof s.body === 'string' ? s.body : '• Point one\n• Point two\n• Point three';
  s.bg = typeof s.bg === 'string' ? s.bg : '#3c096c';
  s.color = typeof s.color === 'string' ? s.color : '#ffd700';
  s.layout = s.layout === 'left' ? 'left' : 'center';
  s.font = typeof s.font === 'string' ? s.font : 'Noto Serif Tamil';
  return s;
}

function normalizeSlides(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeSlide);
}

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
          const { id, type, name, bookmarked } = s;
          if (type === 'html') {
            const htmlSlide = { id, type, name, html: s.html || '', bookmarked: !!bookmarked };
            // Include song group metadata if present
            if (s.songGroupId) {
              htmlSlide.songGroupId = s.songGroupId;
              htmlSlide.songGroupIndex = s.songGroupIndex;
              htmlSlide.songGroupTotal = s.songGroupTotal;
              htmlSlide.songGroupName = s.songGroupName;
            }
            return htmlSlide;
          }
          if (type === 'media') {
            return {
              id,
              type,
              name,
              mediaKind: s.mediaKind === 'video' ? 'video' : 'image',
              mediaSrc: s.mediaSrc || '',
              bookmarked: !!bookmarked
            };
          }
          return {
            id,
            type: 'simple',
            name,
            title: s.title,
            body: s.body,
            bg: s.bg,
            color: s.color,
            layout: s.layout,
            font: s.font,
            bookmarked: !!bookmarked
          };
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
      slides = normalizeSlides(data.slides);
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

// ── File exists modal state ──
let _pendingExportData = null;

function closeFileExistsModal() {
  document.getElementById('file-exists-modal').style.display = 'none';
  document.getElementById('compare-result').style.display = 'none';
  _pendingExportData = null;
}

async function confirmFileExistsAction(action) {
  if (!_pendingExportData) return;
  
  if (action === 'compare') {
    // Compare existing file with new content
    try {
      const existing = JSON.parse(_pendingExportData.existingContent);
      const newData  = JSON.parse(_pendingExportData.content);
      
      const existingSlides = existing.slides || [];
      const newSlides      = newData.slides || [];
      
      let isDuplicate = false;
      if (existingSlides.length === newSlides.length) {
        isDuplicate = JSON.stringify(existingSlides) === JSON.stringify(newSlides);
      }
      
      const resultDiv = document.getElementById('compare-result');
      resultDiv.style.display = 'block';
      
      if (isDuplicate) {
        resultDiv.style.borderColor = '#22c55e';
        resultDiv.style.background = '#0a1f0a';
        resultDiv.innerHTML = `
          <div style="color:#22c55e;font-weight:600;margin-bottom:4px;">✓ DUPLICATE</div>
          <div style="color:#a1a1aa;">The existing file contains identical slides (${existingSlides.length} slides). No need to save again.</div>
        `;
      } else {
        resultDiv.style.borderColor = '#f59e0b';
        resultDiv.style.background = '#1f1508';
        resultDiv.innerHTML = `
          <div style="color:#f59e0b;font-weight:600;margin-bottom:4px;">⚠ DIFFERENT</div>
          <div style="color:#a1a1aa;">
            Existing: ${existingSlides.length} slides<br>
            New: ${newSlides.length} slides<br>
            Click "Save as New" to keep both versions.
          </div>
        `;
      }
    } catch(e) {
      showToast('Error comparing files', 'error');
    }
    return;
  }
  
  if (action === 'save') {
    // Save with (1), (2), etc.
    await performExport(_pendingExportData.fileName, _pendingExportData.content, true);
    closeFileExistsModal();
  }
}

async function performExport(fileName, content, forceSave = false) {
  // ── TRY 1: POST to remote_control_server ──
  try {
    const resp = await fetch('http://127.0.0.1:8788/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: fileName, content, forceSave })
    });
    const result = await resp.json();
    
    if (result.fileExists) {
      // Show conflict modal
      _pendingExportData = {
        fileName,
        content,
        existingContent: result.existingContent
      };
      document.getElementById('file-exists-info').textContent = 
        `The file "${result.filename}" already exists in Church Backup folder. What would you like to do?`;
      document.getElementById('file-exists-modal').style.display = 'flex';
      closeExportModal();
      return;
    }
    
    if (result.ok) {
      showToast(`✓ Saved to Church Backup/${result.filename || fileName}`, 'success');
      closeExportModal();
      return;
    }
  } catch (err) {
    // Server not running — continue to next method
  }

  // ── TRY 2: File System Access API ──
  if (window.showSaveFilePicker) {
    try {
      let dirHandle = window._exportDirHandle;
      if (!dirHandle) {
        showToast('📁 Please navigate to and select the "Church Backup" folder', 'info');
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        window._exportDirHandle = dirHandle;
      }
      const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') await dirHandle.requestPermission({ mode: 'readwrite' });
      
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable   = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      
      showToast(`✓ Saved to ${dirHandle.name}/${fileName}`, 'success');
      closeExportModal();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      window._exportDirHandle = null;
    }
  }

  // ── FALLBACK: browser download ──
  const blob = new Blob([content], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast(`✓ Downloaded to browser's download folder`, 'info');
  closeExportModal();
}

async function doExport() {
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

  const bookmarks = [];
  subset.forEach((s, i) => { if (s && s.bookmarked) bookmarks.push(i + 1); });
  const content = JSON.stringify({ version: 1, slides: subset, bookmarks }, null, 2);

  const now      = new Date();
  const dd       = String(now.getDate()).padStart(2, '0');
  const mm       = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy     = now.getFullYear();
  const fileName = `presentation_${dd}_${mm}_${yyyy}.prsn`;

  await performExport(fileName, content, false);
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
    const applyBookmarks = (slidesArr, bookmarksArr) => {
      if (!Array.isArray(bookmarksArr)) return;
      slidesArr.forEach(s => { if (s) s.bookmarked = false; });
      bookmarksArr.forEach(raw => {
        const idx = parseInt(raw, 10);
        if (!Number.isNaN(idx) && idx >= 1 && idx <= slidesArr.length) {
          slidesArr[idx - 1].bookmarked = true;
        }
      });
    };
    if (Array.isArray(data)) {
      imported = normalizeSlides(data);
    } else if (data && Array.isArray(data.slides)) {
      imported = normalizeSlides(data.slides);
      applyBookmarks(imported, data.bookmarks);
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
function createVasanamHtml(verseText, verseRef, bgColor, textColor, fontSize, startFlipped = false) {
  // fontSize param kept for compatibility but auto-fit handles sizing dynamically
  const bg  = bgColor   || '#3c096c';
  const col = textColor || '#ffd700';
  const flippedClass = startFlipped ? ' flipped' : '';
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
<div class="flip-card${flippedClass}" id="flip-card" onclick="this.classList.toggle('flipped')">
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

function createGoldenVasanamHtml(verseText, verseRef) {
  const refHtml = verseRef ? `<div class="gold-ref">— ${verseRef}</div>` : '';
  return `<!DOCTYPE html><html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Golden Elegance</title>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      width: 100%; height: 100%;
    }

    body {
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(ellipse 120% 120% at 50% 50%, #2a1f0a 0%, #1a1208 40%, #0d0a05 100%);
      min-height: 100vh;
      font-family: 'Cinzel', serif;
    }

    h1 {
      font-family: 'Cinzel', serif;
      font-weight: 900;
      font-size: clamp(2.5rem, 8vw, 5.5rem);
      letter-spacing: .06em;
      background: linear-gradient(
        160deg,
        #fff8c0 0%,
        #f5d060 18%,
        #d4a017 45%,
        #9b6f00 72%,
        #c89a20 100%
      );
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      -webkit-text-stroke: 0.5px #d4a01722;
      filter: drop-shadow(0 0 22px #b8860b66);
      animation: glow 4s ease-in-out infinite;
      user-select: none;
      text-align: center;
      padding: 0 6vw;
      line-height: 1.2;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .gold-ref {
      margin-top: 1.6vh;
      font-size: clamp(1rem, 2.2vw, 1.6rem);
      letter-spacing: .08em;
      color: #f5d060;
      text-shadow: 0 0 16px rgba(212,160,23,0.55);
    }

    @keyframes glow {
      0%, 100% { filter: drop-shadow(0 0 14px #b8860b55); }
      50%       { filter: drop-shadow(0 0 36px #d4a017aa); }
    }
  </style>
</head>
<body>
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
    <h1>${verseText}</h1>
    ${refHtml}
  </div>
</body>
</html>`;
}

// ── ANIME (Static dark navy gradient) version of Vasanam slide ──
function createAnimeVasanamHtml(verseText, verseRef, startFlipped = false) {
  const flippedClass = startFlipped ? ' flipped' : '';
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
<div class="flip-card${flippedClass}" id="flip-card" onclick="this.classList.toggle('flipped')">
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
    return { id, type: 'html', name: 'HTML Slide', html: '', bookmarked: false, _rev: 0 };
  } else if (type === 'media') {
    return {
      id,
      type: 'media',
      name: 'Media Slide',
      mediaKind: 'image',
      mediaSrc: '',
      bookmarked: false,
      _rev: 0
    };
  } else {
    return {
      id, type: 'simple', name: 'New Slide', bookmarked: false, _rev: 0,
      title: 'Slide Title', body: '• Point one\n• Point two\n• Point three',
      bg: '#3c096c', color: '#ffd700', layout: 'center', font: 'Noto Serif Tamil'
    };
  }
}

function bumpSlideRevision(slide) {
  if (!slide) return;
  slide._rev = Number.isInteger(slide._rev) ? (slide._rev + 1) : 1;
  delete slide._thumbHtml;
}

// Offline font stacks — no CDN needed
const GOOGLE_FONT_URLS = {};

function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function mediaToHtml(s) {
  const kind = s.mediaKind === 'video' ? 'video' : 'image';
  const src = String(s.mediaSrc || '').trim();
  const safeSrc = escapeHtmlAttr(src);
  const mediaNode = !src
    ? `<div class="media-empty">Choose a ${kind} file path or use Browse in the Media tab.<\/div>`
    : (kind === 'video'
      ? `<div class="media-stage"><video id="media-video" src="${safeSrc}" autoplay muted loop playsinline preload="auto"><\/video><\/div>`
      : `<div class="media-stage"><img src="${safeSrc}" alt="Slide media" loading="eager"><\/div>`);

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:100%;height:100%;overflow:hidden;background:#000;}
body{display:grid;place-items:center;font-family:'Noto Sans Tamil','Nirmala UI',sans-serif;}
.media-stage{width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;background:#000;overflow:hidden;}
.media-stage img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;background:#000;}
.media-stage video{display:block;width:100%;height:100%;max-width:none;max-height:none;object-fit:cover;object-position:center center;background:#000;}
.media-empty{max-width:80vw;padding:24px 28px;border:1px solid rgba(255,255,255,0.2);border-radius:12px;color:#e5e7eb;font-size:22px;line-height:1.55;text-align:center;background:rgba(17,24,39,0.45);}
<\/style><\/head><body>
${mediaNode}
<script>
(function(){
  var v = document.getElementById('media-video');
  if (!v) return;
  function keepPlaying() {
    var p = v.play();
    if (p && p.catch) p.catch(function(){});
  }
  v.muted = true;
  v.loop = true;
  v.autoplay = true;
  v.playsInline = true;
  v.addEventListener('loadedmetadata', keepPlaying);
  v.addEventListener('canplay', keepPlaying);
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) keepPlaying();
  });
  keepPlaying();
})();
<\/script>
<\/body><\/html>`;
}

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
  if (slide.type === 'simple') return simpleToHtml(slide);
  if (slide.type === 'media') return mediaToHtml(slide);
  if (slide.type !== 'html') return simpleToHtml(slide);
  var html = slide.html || '';

  // Remove legacy helper prompt from imported slide templates.
  html = html.replace(/press\s*c\s*to\s*clap/gi, '');

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
  buildVoiceIndex();
}

function buildVoiceIndex() {
  _voiceIndex = slides.map((s, idx) => {
    return { idx, text: normalizeVoiceText(extractSlideText(s)) };
  });
}

function extractSlideText(slide) {
  if (!slide) return '';
  if (slide.type === 'simple') {
    const t = slide.title || '';
    const b = slide.body || '';
    return `${t}\n${b}`;
  }
  if (slide.type === 'media') {
    return slide.name || '';
  }
  const html = slide.html || '';
  return html.replace(/<[^>]*>/g, ' ');
}

function normalizeVoiceText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\u200c\u200d]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function voiceMatchSlide(transcript) {
  const norm = normalizeVoiceText(transcript);
  if (!norm) return null;
  const tokens = norm.split(' ').filter(Boolean);
  let best = null;
  let bestScore = 0;
  _voiceIndex.forEach(entry => {
    if (!entry.text) return;
    const score = voiceSimilarity(tokens, entry.text);
    if (score > bestScore) {
      bestScore = score;
      best = entry.idx;
    }
  });
  if (best === null) return null;
  return { idx: best, score: bestScore };
}

function voiceSimilarity(tokens, slideText) {
  const slideTokens = slideText.split(' ').filter(Boolean);
  if (slideTokens.length === 0) return 0;
  let hits = 0;
  const slideSet = new Set(slideTokens);
  tokens.forEach(t => { if (slideSet.has(t)) hits++; });
  return hits / Math.max(tokens.length, 1);
}

async function toggleVoiceControl() {
  if (_voiceActive) {
    stopVoiceControl();
  } else {
    await startVoiceControl();
  }
}

async function startVoiceControl() {
  if (_voiceActive) return;
  if (location.protocol === 'file:') {
    showToast('Open app via http://localhost (mic blocked on file://)', 'error');
    return;
  }
  try {
    await fetch(_voiceServerUrl + '?ping=1', { method: 'GET' });
  } catch (_) {
    showToast('Voice server not running (start start_voice_control.bat)', 'error');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _voiceAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: _voiceSampleRate });
    if (_voiceAudioCtx.state === 'suspended') {
      await _voiceAudioCtx.resume();
    }
    _voiceSource = _voiceAudioCtx.createMediaStreamSource(stream);
    _voiceProcessor = _voiceAudioCtx.createScriptProcessor(4096, 1, 1);
    _voiceSamples = [];
    _voiceProcessor.onaudioprocess = (ev) => {
      if (!_voiceActive) return;
      const input = ev.inputBuffer.getChannelData(0);
      _voiceSamples.push(new Float32Array(input));
    };
    _voiceSource.connect(_voiceProcessor);
    _voiceProcessor.connect(_voiceAudioCtx.destination);
    _voiceActive = true;
    document.getElementById('voice-btn')?.classList.add('active');
    
    // Show status bar
    const statusBar = document.getElementById('voice-status-bar');
    if(statusBar) statusBar.style.display = 'block';
    const transcriptEl = document.getElementById('voice-transcript-text');
    if(transcriptEl) transcriptEl.innerText = 'Listening...';

    scheduleVoiceChunk();
    showToast('Voice control started', 'success');
  } catch (e) {
    showToast('Microphone permission denied', 'error');
  }
}

function stopVoiceControl() {
  _voiceActive = false;
  if (_voiceTimer) { clearTimeout(_voiceTimer); _voiceTimer = null; }
  if (_voiceProcessor) { _voiceProcessor.disconnect(); _voiceProcessor = null; }
  if (_voiceSource) { _voiceSource.disconnect(); _voiceSource = null; }
  if (_voiceAudioCtx) { _voiceAudioCtx.close(); _voiceAudioCtx = null; }
  _voiceSamples = [];
  document.getElementById('voice-btn')?.classList.remove('active');
  const statusBar = document.getElementById('voice-status-bar');
  if(statusBar) statusBar.style.display = 'none';
  showToast('Voice control stopped', 'info');
}

function scheduleVoiceChunk() {
  if (!_voiceActive) return;
  _voiceTimer = setTimeout(async () => {
    if (!_voiceActive || _voiceBusy) { scheduleVoiceChunk(); return; }
    const wav = buildVoiceWav(_voiceSamples, _voiceSampleRate);
    _voiceSamples = [];
    if (wav && wav.size > 1024) {
      _voiceBusy = true;
      try {
        const res = await fetch(_voiceServerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'audio/wav' },
          body: wav
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error('Voice server error:', res.status, errText);
          const transcriptEl = document.getElementById('voice-transcript-text');
          if (transcriptEl) transcriptEl.innerText = 'Server Error: ' + errText;
          return;
        }
        const data = await res.json();
        
        const transcriptEl = document.getElementById('voice-transcript-text');
        
        if (data && data.text) {
          const transcript = String(data.text).trim();
          if (transcript) {
            console.log('Voice transcript:', transcript);
            if(transcriptEl) transcriptEl.innerText = transcript;
            
            showToast('🎤 ' + transcript, 'info', 1200);
          } else {
            console.log('Voice processed but empty (silence or background noise)');
            if(transcriptEl && transcriptEl.innerText.startsWith('Listening')) {
               transcriptEl.innerText = '(Hearing silence...)';
            }
          }
          const match = voiceMatchSlide(transcript);
          if (match && match.score >= 0.2) {
            const overlay = document.getElementById('present-overlay');
            if (overlay && overlay.classList.contains('active') && !overlay.classList.contains('panel-fs')) {
              presentJumpTo(match.idx);
            } else {
              selectSlide(match.idx);
              document.querySelector(`#slide-list .thumb[data-idx="${match.idx}"]`)?.scrollIntoView({ block: 'nearest' });
            }
          }
        }
      } catch (err) {
        console.error('Voice loop error:', err);
        const transcriptEl = document.getElementById('voice-transcript-text');
        if (transcriptEl) transcriptEl.innerText = 'Network Error: Check Python server';
      } finally {
        _voiceBusy = false;
      }
    }
    scheduleVoiceChunk();
  }, _voiceChunkMs);
}

function buildVoiceWav(chunks, sampleRate) {
  const length = chunks.reduce((sum, c) => sum + c.length, 0);
  if (length === 0) return null;
  const buffer = new Float32Array(length);
  let offset = 0;
  chunks.forEach(c => { buffer.set(c, offset); offset += c.length; });
  const wavBuffer = encodeWav(buffer, sampleRate);
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
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

function suspendPreviewFrame() {
  const pf = document.getElementById('preview-frame');
  if (!pf || pf._suspendedByPresent) return;
  pf._suspendedByPresent = true;
  pf.srcdoc = '<body style="margin:0;background:#000"></body>';
}

function resumePreviewFrame() {
  const pf = document.getElementById('preview-frame');
  if (!pf || !pf._suspendedByPresent) return;
  pf._suspendedByPresent = false;
  pf._lastSrcdoc = '';
  renderPreview();
}

function renderPreview() {
  const pf = document.getElementById('preview-frame');
  const loadingEl = document.getElementById('preview-loading');

  if (pf._suspendedByPresent) {
    if (loadingEl) loadingEl.classList.remove('visible');
    return;
  }

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
  const mediaNameEl = document.getElementById('media-slide-name');
  if (mediaNameEl) mediaNameEl.value = s.name;

  if (s.type === 'html') {
    document.getElementById('html-editor').value = s.html;
  } else if (s.type === 'media') {
    document.getElementById('media-kind').value = s.mediaKind === 'video' ? 'video' : 'image';
    document.getElementById('media-src').value = s.mediaSrc || '';
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
  if (s.type === 'media' && activeTab !== 'media') switchTab('media');
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
  
  // Show max slide count
  const maxInfo = document.getElementById('delete-range-max-info');
  if (maxInfo) {
    maxInfo.textContent = `(Max: ${slides.length})`;
  }
  
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
  bumpSlideRevision(slides[currentIdx]);
  updateThumb(currentIdx);               // refresh the one changed thumbnail
  renderPreview();
  scheduleSave();
}

function applyMedia() {
  if (!slides.length) return;
  const s = slides[currentIdx];
  const kind = document.getElementById('media-kind').value === 'video' ? 'video' : 'image';
  const src = document.getElementById('media-src').value.trim();
  if (!src) {
    showToast('Choose a media path/URL or browse a file first.', 'error');
    return;
  }

  s.type = 'media';
  s.mediaKind = kind;
  s.mediaSrc = src;

  if (src.startsWith('data:') && src.length > 3_000_000) {
    showToast('Large embedded media may exceed browser storage limits.', 'error', 4200);
  }

  bumpSlideRevision(s);
  updateThumb(currentIdx);
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
  bumpSlideRevision(s);
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
  document.getElementById('tab-media').className = 'etab' + (tab === 'media' ? ' active' : '');
  document.getElementById('tab-simple').className = 'etab' + (tab === 'simple' ? ' active' : '');
  document.getElementById('panel-html').style.display = tab === 'html' ? 'flex' : 'none';
  document.getElementById('panel-media').style.display = tab === 'media' ? 'flex' : 'none';
  document.getElementById('panel-simple').style.display = tab === 'simple' ? 'flex' : 'none';
}

function chooseMediaFile() {
  const picker = document.getElementById('media-file-input');
  if (picker) picker.click();
}

document.getElementById('media-file-input').addEventListener('change', function() {
  const file = this.files && this.files[0];
  if (!file) return;

  const kind = (file.type || '').startsWith('video/') ? 'video' : 'image';
  const kindEl = document.getElementById('media-kind');
  const srcEl = document.getElementById('media-src');
  if (kindEl) kindEl.value = kind;

  if (file.size > MEDIA_EMBED_MAX_BYTES) {
    const blobUrl = URL.createObjectURL(file);
    srcEl.value = blobUrl;
    showToast('File is large; using temporary blob URL for this session.', 'error', 3800);
    this.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    srcEl.value = String(e.target.result || '');
    showToast('Media file selected. Click Apply to save it on this slide.', 'success', 2600);
  };
  reader.onerror = () => {
    showToast('Could not read selected media file.', 'error');
  };
  reader.readAsDataURL(file);
  this.value = '';
});

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
  if (!text) { alert('வசன உரை தேவை!'); return; }
  const id = Date.now() + Math.random();
  const slide = { id, type: 'html', name: ref || 'வசனம்', html: createAnimeVasanamHtml(text, ref, false), _rev: 0 };
  slides.splice(currentIdx + 1, 0, slide);
  currentIdx = currentIdx + 1;
  closeVasanamModal();
  renderAll(); renderPreview(); renderEditor();
  scheduleSave();
}

function addGoldenVasanamSlide() {
  const text = document.getElementById('vs-text').value.trim();
  const ref  = document.getElementById('vs-ref').value.trim();
  if (!text) { alert('வசன உரை தேவை!'); return; }
  const id = Date.now() + Math.random();
  const slide = { id, type: 'html', name: ref || 'வசனம்', html: createAnimeVasanamHtml(text, ref, false), _rev: 0 };
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

function _bpBuildSlideHtml(startFlipped = false) {
  const text = document.getElementById('bp-preview-text').textContent;
  const ref  = document.getElementById('bp-preview-ref').textContent;
  if (!text || text.includes('இன்னும் சேர்க்கப்படவில்லை')) return null;
  return createAnimeVasanamHtml(text, ref, startFlipped);
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
  bpShowFullscreen(true); // Start flipped when sequentially scrolling
}

function bpShowFullscreen(startFlipped = false) {
  if (!_bpBook || !_bpChapter) { showToast('வசனம் தேர்ந்தெடுக்கவும்', 'error'); return; }
  const html = _bpBuildSlideHtml(startFlipped);
  if (!html) { showToast('Bible content not loaded yet — add verses first', 'error'); return; }
  const ref = document.getElementById('bp-preview-ref').textContent;
  
  if (_bpOpen) toggleBiblePanel();
  
  // Show overlay FIRST so the iframe has real dimensions when autoFit runs
  document.getElementById('bp-fs-prev').style.display = 'block';
  document.getElementById('bp-fs-next').style.display = 'block';
  document.getElementById('present-overlay').classList.add('active', 'bible-fs');
  document.body.style.overflow = 'hidden';
  const pif = document.getElementById('present-iframe');
  injectAutoFit(pif);
  setPresentFrameHtml(html, true);
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
    bookmarked: true, // ✅ Auto-bookmark Bible verses
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

function bpAddAsGoldenSlide() {
  if (!_bpBook || !_bpChapter) { showToast('வசனம் தேர்ந்தெடுக்கவும்', 'error'); return; }
  const textEl = document.getElementById('bp-preview-text');
  const refEl = document.getElementById('bp-preview-ref');
  const verseText = textEl ? textEl.textContent.trim() : '';
  const ref = refEl ? refEl.textContent.trim() : '';
  if (!verseText) { showToast('Bible content not loaded yet — add verses first', 'error'); return; }
  const html = createAnimeVasanamHtml(verseText, ref, false);
  const slide = {
    id: Date.now() + Math.random(),
    type: 'html',
    name: ref || 'வசனம்',
    html,
    bookmarked: true, // ✅ Auto-bookmark Bible verses
    bibleBook: _bpBook,
    bibleChapter: _bpChapter,
    bibleVerse: _bpVerse
  };
  if (!slides.length) {
    slides.push(slide);
    currentIdx = 0;
    renderAll(); renderPreview(); renderEditor();
    scheduleSave();
    showToast(`✓ Slide added: ${ref || 'வசனம்'}`, 'success');
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
let _spLyricsEditTimer = null;
const SP_HISTORY_STORAGE_KEY = 'bp_song_queue_history_v1';
const SP_HISTORY_LIMIT_PER_SONG = 20;
let _spHistoryBySong = null;
let _spHistoryServerChecked = false;

// Build the song list on load
(function spInit() {
  if (typeof songContent === 'undefined') return;
  _spSongKeys = Object.keys(songContent).map(Number).sort((a, b) => a - b);
  _spFilteredKeys = _spSongKeys.slice();
  spPopulateList(_spFilteredKeys);
  spRenderTamilKeys();

  // Try to sync song queue history from shared project file via SongSaver.
  spTryLoadHistoryFromServer();

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

function spRenderTamilKeys() {
  const wrap = document.getElementById('sp-tamil-keys');
  if (!wrap) return;
  const combosWrap = document.getElementById('sp-tamil-combos');
  const vowels = ['அ','ஆ','இ','ஈ','உ','ஊ','எ','ஏ','ஐ','ஒ','ஓ','ஔ','ஃ'];
  const consonants = ['க','ங','ச','ஞ','ட','ண','த','ந','ப','ம','ய','ர','ல','வ','ழ','ள','ற','ன'];
  const vowelMarks = ['','ா','ி','ீ','ு','ூ','ெ','ே','ை','ொ','ோ','ௌ','்'];
  if (combosWrap) combosWrap.style.display = 'none';
  const rows = [vowels, consonants];
  wrap.innerHTML = '';
  if (combosWrap) wrap.appendChild(combosWrap);
  rows.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'sp-tamil-row';
    row.forEach((ch) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sp-tamil-key';
      btn.textContent = ch;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (consonants.includes(ch)) {
          spShowTamilCombos(ch, vowelMarks);
        } else {
          spHideTamilCombos();
          spInsertTamilChar(ch);
        }
      });
      rowEl.appendChild(btn);
    });
    wrap.appendChild(rowEl);
  });
}

function spToggleTamilKeys() {
  const wrap = document.getElementById('sp-tamil-keys');
  if (!wrap) return;
  const willShow = wrap.style.display === 'none' || wrap.style.display === '';
  wrap.style.display = willShow ? 'block' : 'none';
  if (!willShow) spHideTamilCombos();
  if (willShow) {
    const input = document.getElementById('sp-search');
    if (input) input.focus();
  }
}

function spShowTamilCombos(base, marks) {
  const wrap = document.getElementById('sp-tamil-combos');
  if (!wrap) return;
  wrap.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'sp-tamil-row sp-tamil-combo-row';
  marks.forEach((mark) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sp-tamil-key';
    const combo = base + mark;
    btn.textContent = combo;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      spInsertTamilChar(combo);
      spHideTamilCombos();
    });
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  wrap.style.display = 'block';
}

function spHideTamilCombos() {
  const wrap = document.getElementById('sp-tamil-combos');
  if (!wrap) return;
  wrap.style.display = 'none';
  wrap.innerHTML = '';
}

function spInsertTamilChar(ch) {
  const input = document.getElementById('sp-search');
  if (!input) return;
  const start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
  const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : input.value.length;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  input.value = before + ch + after;
  const pos = start + ch.length;
  input.selectionStart = pos;
  input.selectionEnd = pos;
  input.focus();
  spOnSearch();
}

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
  spRenderHistoryForCurrentSong();
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
  return createSongLyricSlideHtml(text, ref, songSlideBg, '#f8fafc');
}

function createSongLyricSlideHtml(lyricsText, refText, bgColor, textColor) {
  const bg = bgColor || 'linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%)';
  const col = textColor || '#f8fafc';
  return `<!DOCTYPE html><html lang="ta"><head><meta charset="UTF-8">
<style>
@font-face{font-family:'Noto Serif Tamil';src:local('Noto Serif Tamil'),local('Nirmala UI'),local('Vijaya'),local('Latha'),local('Tamil Sangam MN');font-weight:400 900;}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:100%;height:100%;overflow:hidden;}
body{background:${bg};font-family:'Noto Serif Tamil',serif;color:${col};}
.wrap{width:100%;height:100%;padding:2.4vw 2.6vw 1.6vw;display:flex;flex-direction:column;gap:0.8vh;}
.lyrics-wrap{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;}
.lyrics{
  width:100%;text-align:center;line-height:1.2;white-space:pre-wrap;word-break:break-word;
  text-shadow:0 3px 12px rgba(0,0,0,0.62);font-weight:900;-webkit-text-stroke:0.04em currentColor;
}
.ref{font-size:1.9vh;opacity:0.78;text-align:right;letter-spacing:0.03em;}
</style></head><body>
  <div class="wrap" id="wrap">
    <div class="lyrics-wrap" id="lyricsWrap"><div class="lyrics" id="lyrics">${lyricsText}</div></div>
    <div class="ref" id="ref">${refText}</div>
  </div>
<script>
var MAX_FONT = 148;
function autoFit() {
  var lyricsWrap = document.getElementById('lyricsWrap');
  var lyrics = document.getElementById('lyrics');
  var ref = document.getElementById('ref');
  if (!lyricsWrap || !lyrics) return;
  var availW = lyricsWrap.clientWidth || window.innerWidth;
  var availH = lyricsWrap.clientHeight || window.innerHeight;
  if (availH < 10 || availW < 10) { setTimeout(autoFit, 100); return; }
  var lo = 8, hi = Math.min(availH * 0.98, MAX_FONT);
  for (var i = 0; i < 28; i++) {
    var mid = (lo + hi) / 2;
    lyrics.style.fontSize = mid + 'px';
    if (ref) ref.style.fontSize = Math.max(12, mid * 0.18) + 'px';
    if (lyrics.scrollHeight > availH || lyrics.scrollWidth > availW) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  lyrics.style.fontSize = lo + 'px';
  if (ref) ref.style.fontSize = Math.max(12, lo * 0.18) + 'px';
}
document.fonts ? document.fonts.ready.then(autoFit) : window.addEventListener('load', autoFit);
window.addEventListener('resize', autoFit);
</script>
</body></html>`;
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
  const artistLine = song.artist ? `<div style="font-size:10px;color:#6b6b75;margin-bottom:8px;">Artist: ${song.artist.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>` : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+Tamil&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%); color: #f8fafc;
      font-family: 'Noto Serif Tamil', serif;
      padding: 20px 30px 30px;
      line-height: 1.5;
      overflow-y: auto;
    }
    body::-webkit-scrollbar { width: 6px; }
    body::-webkit-scrollbar-thumb { background: rgba(52,211,153,0.3); border-radius: 3px; }
    h1 { color: #34d399; font-size: 14px; margin-bottom: 6px; line-height: 1.3; }
    .content { font-size: 11px; }
    .ref { text-align: right; color: #34d399; font-size: 9px; margin-top: 15px; padding-top: 8px; border-top: 1px solid rgba(52,211,153,0.25); font-family: monospace; }
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
  
  if (_spOpen) toggleSongPanel();
  
  const song = songContent[_spSongId];
  document.getElementById('bp-fs-prev').style.display = 'none';
  document.getElementById('bp-fs-next').style.display = 'none';
  const overlay = document.getElementById('present-overlay');
  overlay.classList.remove('bible-fs');
  overlay.classList.add('active', 'panel-fs');
  document.body.style.overflow = 'hidden';
  const pif = document.getElementById('present-iframe');
  setPresentFrameHtml(html, true);
  document.getElementById('present-indicator').textContent = song.title;
  spSetFsEditorMode('edit');
  spSyncFsEditorFromCurrentSong();
  spBindFsEditorLiveRefresh();
  _spPopulateVerses(song);
  spRenderHistoryForCurrentSong();
  spSetFsDefaultCollapsed(true);
}

function spOpenQuickSlideModal() {
  const modal = document.getElementById('sp-quick-modal');
  if (!modal) return;
  const titleEl = document.getElementById('sp-quick-title');
  const lyricsEl = document.getElementById('sp-quick-lyrics');
  if (titleEl) titleEl.value = '';
  if (lyricsEl) lyricsEl.value = '';
  modal.style.display = 'flex';
  if (lyricsEl) lyricsEl.focus();
}

function spCloseQuickSlideModal() {
  const modal = document.getElementById('sp-quick-modal');
  if (modal) modal.style.display = 'none';
}

function spRunQuickSlideModal() {
  const lyricsEl = document.getElementById('sp-quick-lyrics');
  if (!lyricsEl) { showToast('Lyrics not available', 'error'); return; }
  const raw = String(lyricsEl.value || '').replace(/\r\n/g, '\n');
  const verses = raw
    .split(/\n\s*\n+/)
    .map(v => v.trim())
    .filter(v => v.length > 0);
  if (verses.length === 0) {
    showToast('No verses found. Separate verses with a blank line.', 'error');
    return;
  }
  const titleEl = document.getElementById('sp-quick-title');
  const songName = titleEl && titleEl.value ? String(titleEl.value).trim() : '';
  spCloseQuickSlideModal();
  spShowTempSlidesFromText(verses, songName || 'Quick Song');
}

function spToggleFsSection(rowId, btnEl) {
  const row = document.getElementById(rowId);
  if (!row) return;
  const willCollapse = !row.classList.contains('sp-fs-collapsed');
  spSetFsSectionCollapsed(row, willCollapse);
  if (btnEl) btnEl.blur();
}

function spSetFsSectionCollapsed(rowEl, collapsed) {
  if (!rowEl) return;
  rowEl.classList.toggle('sp-fs-collapsed', collapsed);
  const btn = rowEl.querySelector('.sp-fs-collapse-btn');
  if (btn) btn.textContent = collapsed ? '+' : '-';
}

function spSetFsDefaultCollapsed(collapsed) {
  ['sp-db-content-row', 'sp-chorus-main-row', 'sp-chorus-sub-row'].forEach(id => {
    const row = document.getElementById(id);
    if (row) spSetFsSectionCollapsed(row, collapsed);
  });
}

function spBindFsEditorLiveRefresh() {
  const contentEl = document.getElementById('sp-db-content');
  const titleEl = document.getElementById('sp-db-title');
  if (contentEl && !contentEl.dataset.spLiveBound) {
    contentEl.addEventListener('input', () => {
      clearTimeout(_spLyricsEditTimer);
      _spLyricsEditTimer = setTimeout(() => spRefreshVersesFromEditor(), 180);
    });
    contentEl.dataset.spLiveBound = '1';
  }
  if (titleEl && !titleEl.dataset.spLiveBound) {
    titleEl.addEventListener('input', () => {
      const t = (titleEl.value || '').trim();
      if (document.getElementById('present-overlay').classList.contains('panel-fs')) {
        document.getElementById('sp-fs-title-text').textContent = (t || 'Song') + (_spSongId !== null ? (' (#' + _spSongId + ')') : '');
      }
    });
    titleEl.dataset.spLiveBound = '1';
  }
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

  setPresentFrameHtml(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;overflow:hidden}
    body{display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%);color:#f8fafc;font-family:'Noto Serif Tamil','Nirmala UI',serif;padding:4vw}
    .box{text-align:center;max-width:900px}
    h1{font-size:48px;line-height:1.25;color:#7dd3fc;margin-bottom:12px}
    p{font-size:26px;line-height:1.7;opacity:0.92}
  <\/style></head><body><div class="box"><h1>➕ New Song</h1><p>Use the editor on the right panel and click <b>Save Song to Database</b>.</p></div></body></html>`, true);

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
  spClearHistoryUi('History is available after selecting a saved song');
  spSetFsDefaultCollapsed(true);
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
    if (html) setPresentFrameHtml(html, true);
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
  const slide = { 
    id: Date.now() + Math.random(), 
    type: 'html', 
    name, 
    html,
    bookmarked: true  // Auto-bookmark song slide
  };
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

function spEnsureHistoryLoaded() {
  if (_spHistoryBySong) return;
  try {
    const raw = localStorage.getItem(SP_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    _spHistoryBySong = (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (_) {
    _spHistoryBySong = {};
  }
}

function spNormalizeHistoryMap(mapObj) {
  const src = (mapObj && typeof mapObj === 'object') ? mapObj : {};
  const out = {};
  Object.keys(src).forEach(songKey => {
    const arr = Array.isArray(src[songKey]) ? src[songKey] : [];
    const cleaned = arr
      .filter(entry => entry && Array.isArray(entry.queue))
      .map(entry => ({
        id: String(entry.id || (Date.now() + '-' + Math.random().toString(36).slice(2, 7))),
        createdAt: Number(entry.createdAt || Date.now()),
        queue: spCloneQueueItems(entry.queue)
      }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (cleaned.length) out[songKey] = cleaned.slice(0, SP_HISTORY_LIMIT_PER_SONG);
  });
  return out;
}

function spMergeHistoryMaps(localMap, remoteMap) {
  const localNorm = spNormalizeHistoryMap(localMap);
  const remoteNorm = spNormalizeHistoryMap(remoteMap);
  const merged = {};
  const keys = new Set([...Object.keys(localNorm), ...Object.keys(remoteNorm)]);
  keys.forEach(songKey => {
    const combined = [...(localNorm[songKey] || []), ...(remoteNorm[songKey] || [])];
    const uniqByFp = new Map();
    combined.forEach(entry => {
      const fp = spBuildQueueFingerprint(entry.queue);
      const prev = uniqByFp.get(fp);
      if (!prev || (entry.createdAt || 0) > (prev.createdAt || 0)) {
        uniqByFp.set(fp, entry);
      }
    });
    const arr = Array.from(uniqByFp.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (arr.length) merged[songKey] = arr.slice(0, SP_HISTORY_LIMIT_PER_SONG);
  });
  return merged;
}

async function spTryLoadHistoryFromServer() {
  if (_spHistoryServerChecked) return;
  _spHistoryServerChecked = true;
  spEnsureHistoryLoaded();
  try {
    const res = await fetch('http://localhost:7777/history');
    if (!res.ok) return;
    const remote = await res.json();
    _spHistoryBySong = spMergeHistoryMaps(_spHistoryBySong, remote);
    localStorage.setItem(SP_HISTORY_STORAGE_KEY, JSON.stringify(_spHistoryBySong));
    spRenderHistoryForCurrentSong();
  } catch (_) {
    // SongSaver not running: keep local-only history fallback.
  }
}

async function spTrySaveHistoryToServer() {
  try {
    await fetch('http://localhost:7777/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spNormalizeHistoryMap(_spHistoryBySong), null, 2)
    });
  } catch (_) {
    // Ignore network/server failure; localStorage still has data.
  }
}

function spPersistHistory() {
  try {
    localStorage.setItem(SP_HISTORY_STORAGE_KEY, JSON.stringify(_spHistoryBySong || {}));
  } catch (_) {}
  spTrySaveHistoryToServer();
}

function spCloneQueueItems(items) {
  return (items || []).map(item => ({ text: String(item.text || ''), name: String(item.name || '') }));
}

function spGetSongHistory(songId) {
  spEnsureHistoryLoaded();
  const key = String(songId ?? '');
  if (!key) return [];
  const arr = _spHistoryBySong[key];
  if (!Array.isArray(arr)) return [];
  return arr.filter(entry => entry && Array.isArray(entry.queue));
}

function spBuildQueueFingerprint(items) {
  const normalized = spCloneQueueItems(items).map(item => ({
    text: item.text.replace(/\r\n/g, '\n').trim(),
    name: item.name.trim()
  }));
  return JSON.stringify(normalized);
}

function spFormatHistoryLabel(entry) {
  const dt = new Date(entry.createdAt || Date.now());
  const isValidDt = !Number.isNaN(dt.getTime());
  const dateText = isValidDt ? dt.toLocaleString() : 'Saved';
  const count = Array.isArray(entry.queue) ? entry.queue.length : 0;
  return `${dateText} • ${count} slide${count === 1 ? '' : 's'}`;
}

function spClearHistoryUi(placeholderText) {
  const sel = document.getElementById('sp-history-select');
  if (!sel) return;
  const msg = placeholderText || 'No log found for this song';
  sel.innerHTML = `<option value="">${msg}</option>`;
  sel.value = '';
}

function spRenderHistoryForCurrentSong() {
  const sel = document.getElementById('sp-history-select');
  if (!sel) return;
  if (_spSongId === null || !songContent[_spSongId]) {
    spClearHistoryUi('No log found for this song');
    return;
  }
  const history = spGetSongHistory(_spSongId);
  if (!history.length) {
    spClearHistoryUi('No log found for this song');
    return;
  }
  sel.innerHTML = '';
  history.forEach(entry => {
    const opt = document.createElement('option');
    opt.value = entry.id;
    opt.textContent = spFormatHistoryLabel(entry);
    sel.appendChild(opt);
  });
  sel.value = String(history[0].id || '');
}

function spGetSelectedHistoryEntry() {
  if (_spSongId === null) return null;
  const sel = document.getElementById('sp-history-select');
  if (!sel || !sel.value) return null;
  const history = spGetSongHistory(_spSongId);
  return history.find(entry => String(entry.id) === String(sel.value)) || null;
}

function spHistoryPreview() {
  const entry = spGetSelectedHistoryEntry();
  if (!entry) return;
  const count = Array.isArray(entry.queue) ? entry.queue.length : 0;
  showToast(`History selected: ${count} slide${count === 1 ? '' : 's'}`, 'info', 1200);
}

function spLogQueueSnapshot(queueItems, opts) {
  const options = opts && typeof opts === 'object' ? opts : {};
  const silent = options.silent === true;
  if (_spFsEditorMode === 'new') {
    if (!silent) showToast('History log works only for saved songs', 'error');
    return false;
  }
  if (_spSongId === null || !songContent[_spSongId]) {
    if (!silent) showToast('Select a saved song first', 'error');
    return false;
  }
  const sourceQueue = Array.isArray(queueItems) ? queueItems : [];
  if (sourceQueue.length === 0) {
    if (!silent) showToast('Queue is empty', 'error');
    return false;
  }

  spEnsureHistoryLoaded();
  const key = String(_spSongId);
  const history = spGetSongHistory(_spSongId);
  const now = Date.now();
  const newQueue = spCloneQueueItems(sourceQueue);
  const fp = spBuildQueueFingerprint(newQueue);
  const existingIdx = history.findIndex(entry => spBuildQueueFingerprint(entry.queue) === fp);

  if (existingIdx >= 0) {
    if (silent) return true;
    const existing = history[existingIdx];
    history.splice(existingIdx, 1);
    history.unshift({
      id: existing.id,
      createdAt: now,
      queue: newQueue
    });
    _spHistoryBySong[key] = history;
    spPersistHistory();
    spRenderHistoryForCurrentSong();
    if (!silent) {
      document.getElementById('sp-history-select').value = existing.id;
      showToast('Updated existing queue history', 'success');
    }
    return true;
  }

  const entry = {
    id: String(now) + '-' + Math.random().toString(36).slice(2, 7),
    createdAt: now,
    queue: newQueue
  };
  history.unshift(entry);
  if (history.length > SP_HISTORY_LIMIT_PER_SONG) history.length = SP_HISTORY_LIMIT_PER_SONG;
  _spHistoryBySong[key] = history;
  spPersistHistory();
  spRenderHistoryForCurrentSong();
  if (!silent) {
    document.getElementById('sp-history-select').value = entry.id;
    showToast('Queue history logged', 'success');
  }
  return true;
}

function spLogCurrentQueue() {
  spLogQueueSnapshot(_spQueue, { silent: false });
}

function spApplySelectedHistory() {
  const entry = spGetSelectedHistoryEntry();
  if (!entry) {
    showToast('Select a logged history first', 'error');
    return;
  }
  _spQueue = spCloneQueueItems(entry.queue);
  _spRenderQueue();
  showToast('Logged history loaded to queue', 'success');
}

function spAddSelectedHistoryToMain() {
  if (_spSongId === null || !songContent[_spSongId]) {
    showToast('Select a saved song first', 'error');
    return;
  }
  const entry = spGetSelectedHistoryEntry();
  if (!entry) {
    showToast('Select a logged history first', 'error');
    return;
  }
  spCommitQueueToMain(entry.queue, false);
}

function spDeleteSelectedHistory() {
  if (_spSongId === null || !songContent[_spSongId]) {
    showToast('Select a saved song first', 'error');
    return;
  }

  const sel = document.getElementById('sp-history-select');
  if (!sel || !sel.value) {
    showToast('Select a logged history first', 'error');
    return;
  }

  const key = String(_spSongId);
  const history = spGetSongHistory(_spSongId);
  const before = history.length;
  const kept = history.filter(entry => String(entry.id) !== String(sel.value));
  if (kept.length === before) {
    showToast('Selected history not found', 'error');
    return;
  }

  if (kept.length > 0) {
    _spHistoryBySong[key] = kept;
  } else {
    delete _spHistoryBySong[key];
  }

  spPersistHistory();
  spRenderHistoryForCurrentSong();
  showToast('History deleted', 'success');
}

function _spGetCustomChorusText(kind) {
  const id = kind === 'sub' ? 'sp-custom-sub' : 'sp-custom-main';
  const el = document.getElementById(id);
  if (!el) return '';
  return String(el.value || '').replace(/\r\n/g, '\n').trim();
}

function _spSplitVerses(content) {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .split(/\n\s*\n/)
    .map(v => v.trim())
    .filter(v => v.length > 0);
}

function _spRenderVerseList(verses) {
  const container = document.getElementById('sp-fs-verses');
  if (!container) return;
  container.innerHTML = '';
  verses.forEach((v, i) => {
    const div = document.createElement('div');
    div.className = 'sp-fs-verse';
    const preview = v.length > 250 ? v.slice(0, 250) + '…' : v;
    div.innerHTML =
      '<div style="flex:1;"><span class="sp-fs-verse-text">' + _esc(preview).replace(/\n/g, '<br>') + '</span></div>' +
      '<div class="sp-fs-verse-ctrls">' +
        '<div class="sp-tag-group"><input type="checkbox" id="sp-m-'+i+'" name="sp-auto-main" value="'+i+'" onclick="spToggleExclusiveTag(\'sp-auto-main\', this)"><label for="sp-m-'+i+'" class="lbl-m" title="Set as Main Chorus">M</label></div>' +
        '<div class="sp-tag-group"><input type="checkbox" id="sp-s-'+i+'" name="sp-auto-sub" value="'+i+'" onclick="spToggleExclusiveTag(\'sp-auto-sub\', this)"><label for="sp-s-'+i+'" class="lbl-s" title="Set as Mid/Sub Chorus">m</label></div>' +
        '<input type="number" id="sp-stz-'+i+'" class="sp-ord-in" min="1" placeholder="#" title="Stanza Order" onwheel="event.preventDefault(); this.blur();">' +
        '<button class="sp-fs-verse-add" onclick="spQueueAdd(' + i + ')" title="Add to queue manually">➕</button>' +
      '</div>';
    container.appendChild(div);
  });
}

function spToggleExclusiveTag(groupName, clickedEl) {
  if (!clickedEl || !clickedEl.checked) return;
  document.querySelectorAll('input[name="' + groupName + '"]').forEach(el => {
    if (el !== clickedEl) el.checked = false;
  });
}

function spRefreshVersesFromEditor() {
  const overlay = document.getElementById('present-overlay');
  const contentEl = document.getElementById('sp-db-content');
  if (!overlay || !overlay.classList.contains('panel-fs') || !contentEl) return;

  const editedContent = String(contentEl.value || '');
  _spVerses = _spSplitVerses(editedContent);
  _spQueue = [];
  _spRenderVerseList(_spVerses);
  _spRenderQueue();
}

function _spPopulateVerses(song) {
  _spVerses = _spSplitVerses(song.content);
  _spQueue = [];
  const customMain = document.getElementById('sp-custom-main');
  const customSub = document.getElementById('sp-custom-sub');
  if (customMain) customMain.value = '';
  if (customSub) customSub.value = '';
  document.getElementById('sp-fs-title-text').textContent = song.title + ' (#' + _spSongId + ')';
  _spRenderVerseList(_spVerses);
  _spRenderQueue();
}

function spAutoGenerateQueue() {
  const mainInput = document.querySelector('input[name="sp-auto-main"]:checked');
  const subInput = document.querySelector('input[name="sp-auto-sub"]:checked');
  
  const mainIdx = mainInput ? parseInt(mainInput.value, 10) : -1;
  const subIdx = subInput ? parseInt(subInput.value, 10) : -1;
  const customMainText = _spGetCustomChorusText('main');
  const customSubText = _spGetCustomChorusText('sub');
  const mainText = customMainText || (mainIdx !== -1 ? _spVerses[mainIdx] : '');
  const subText = customSubText || (subIdx !== -1 ? _spVerses[subIdx] : '');

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
      if ((mainIdx === -1 || i !== mainIdx) && (subIdx === -1 || i !== subIdx)) {
        stanzas.push({ idx: i, order: stanzas.length + 1 });
      }
    }
  }

  // Sort stanzas by their given order
  stanzas.sort((a, b) => a.order - b.order);

  if (!mainText && stanzas.length === 0) {
    showToast("Select/type Main Chorus or type Stanza orders (#) to generate.", "error");
    return;
  }

  _spQueue = [];

  // Always start with Main Chorus if it exists
  if (mainText) {
    _spQueue.push({ text: mainText, name: 'Main Chorus' });
  }

  stanzas.forEach((stz, i) => {
    // Add the specific Stanza
    _spQueue.push({ text: _spVerses[stz.idx], name: 'Stanza ' + stz.order });
    
    // Add Sub Chorus after stanza (but NOT after the last stanza)
    if (subText && i < stanzas.length - 1) {
      _spQueue.push({ text: subText, name: 'Sub Chorus' });
    }
    
    // If there's no sub chorus, we interleave the main chorus between stanzas
    if (!subText && mainText && i < stanzas.length - 1) {
      _spQueue.push({ text: mainText, name: 'Main Chorus' });
    }
  });

  // End the sequence with Main Chorus only (no sub chorus before it)
  if (mainText) {
    _spQueue.push({ text: mainText, name: 'Main Chorus' });
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
  const ta = document.createElement('textarea');
  ta.className = 'sp-fs-ta';
  ta.value = _spQueue[idx] && _spQueue[idx].text ? _spQueue[idx].text : '';
  ta.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      spQueueSave(idx);
    }
  });
  const saveBtn = document.createElement('button');
  saveBtn.className = 'sp-fs-save-btn';
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    spQueueSave(idx);
  });
  editor.appendChild(ta);
  editor.appendChild(saveBtn);
  el.appendChild(editor);
  ta.focus();
}

function spQueueSave(idx) {
  const el = document.getElementById('sp-fs-item-' + idx);
  if (!el) return;
  const ta = el.querySelector('.sp-fs-ta');
  if (ta && _spQueue[idx]) {
    _spQueue[idx].text = ta.value.replace(/\r\n/g, '\n');
  }
  _spRenderQueue();
}

function spCommitQueueToMain(queueItems, clearCurrentQueue = true) {
  const sourceQueue = Array.isArray(queueItems) ? queueItems : [];
  if (sourceQueue.length === 0) { showToast('Queue is empty', 'error'); return; }
  const song = songContent[_spSongId];
  const songName = song ? song.title : 'Song';
  const songSlideBg = 'linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%)';
  
  // Generate unique song group ID for this batch of slides
  const songGroupId = 'song_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  sourceQueue.forEach((item, i) => {
    const ref = songName + '  (Song #' + _spSongId + ')';
    const html = createSongLyricSlideHtml(item.text, ref, songSlideBg, '#f8fafc');
    const slide = { 
      id: Date.now() + Math.random(), 
      type: 'html', 
      name: songName + ' - ' + (i + 1), 
      html,
      bookmarked: i === 0,  // Auto-bookmark first slide only
      songGroupId: songGroupId,  // Link all slides in this song together
      songGroupIndex: i,  // Track position within the song
      songGroupTotal: sourceQueue.length,  // Total slides in this song
      songGroupName: songName  // Store song name for display
    };
    slides.push(slide);
  });
  currentIdx = slides.length - 1;
  renderAll(); renderPreview(); renderEditor();
  scheduleSave();
  spLogQueueSnapshot(sourceQueue, { silent: true });
  const count = sourceQueue.length;
  if (clearCurrentQueue) {
    _spQueue = [];
    _spRenderQueue();
  }
  exitPresent();
  showToast('✓ ' + count + ' slides added from ' + songName, 'success');
}

function spCommitAllToMain() {
  spCommitQueueToMain(_spQueue, true);
}

// ══════════════════════════════════════════════════
//  PRESENT MODE
// ══════════════════════════════════════════════════
let _wakeLock = null;
let _remoteUrlCache = '';
let _remoteModalShown = false;

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
  document.body.classList.add('presenting');
  suspendPreviewFrame();
  renderPresentBookmarks();
  acquireWakeLock();
  showRemoteModalOnce();
}

async function fetchRemoteUrl() {
  if (_remoteUrlCache) return _remoteUrlCache;
  try {
    const res = await fetch(_remoteBaseUrl + '/ip', { cache: 'no-store' });
    if (!res.ok) throw new Error('bad');
    const data = await res.json();
    const ip = data && data.ip ? String(data.ip) : '';
    if (ip) {
      _remoteUrlCache = 'http://' + ip + ':5500/remote.html';
      return _remoteUrlCache;
    }
  } catch (_) {
    // Ignore and fall back to hostname.
  }
  const host = location.hostname || '127.0.0.1';
  _remoteUrlCache = 'http://' + host + ':5500/remote.html';
  return _remoteUrlCache;
}

async function showRemoteModalOnce() {
  // Check if Phone Remote feature is enabled in config
  if (typeof AI_CONFIG !== 'undefined' && AI_CONFIG.enablePhoneRemote === false) {
    return; // Feature disabled, don't show QR modal
  }
  
  if (_remoteModalShown) return;
  _remoteModalShown = true;
  const modal = document.getElementById('remote-modal');
  const urlEl = document.getElementById('remote-modal-url');
  const qrEl = document.getElementById('remote-modal-qr');
  const statusEl = document.getElementById('remote-modal-status');
  if (!modal || !urlEl) return;
  const url = await fetchRemoteUrl();
  urlEl.textContent = url;
  if (qrEl) {
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(url);
    qrEl.src = qrUrl;
    qrEl.alt = 'Remote QR';
  }
  if (statusEl) statusEl.textContent = 'Scan QR or open URL on phone';
  modal.style.display = 'flex';
}

function closeRemoteModal() {
  const modal = document.getElementById('remote-modal');
  if (modal) modal.style.display = 'none';
}

async function copyRemoteUrl() {
  const url = _remoteUrlCache || await fetchRemoteUrl();
  try {
    await navigator.clipboard.writeText(url);
    showToast('Remote URL copied', 'success', 1500);
  } catch (_) {
    showToast('Copy failed. Long-press to copy.', 'error', 1600);
  }
}

function getPresentHtml(idx) {
  const s = slides[idx];
  if (!s) return '';
  const rev = Number.isInteger(s._rev) ? s._rev : 0;
  const key = String(s.id) + '|' + rev;
  if (s._presentCacheKey !== key) {
    s._presentCacheKey = key;
    s._presentHtml = getHtml(s);
  }
  return s._presentHtml;
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

function setPresentFrameHtml(html, force = false) {
  const pif = document.getElementById('present-iframe');
  if (!pif) return;
  if (!force && pif._lastSrcdoc === html) return;
  pif._lastSrcdoc = html;
  pif.srcdoc = html;
}

function showPresentSlide() {
  const pif = document.getElementById('present-iframe');
  injectAutoFit(pif);
  const html = getPresentHtml(presentIdx);
  setPresentFrameHtml(html);
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
  renderSongNavBar(); // New: Show song group navigation if applicable
  markRemoteStateDirty();
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
  markRemoteStateDirty();
}

function renderSongNavBar() {
  const navBar = document.getElementById('song-nav-bar');
  const titleEl = document.getElementById('song-nav-title');
  const slidesEl = document.getElementById('song-nav-slides');
  
  if (!navBar || !titleEl || !slidesEl) return;
  
  const currentSlide = slides[presentIdx];
  
  // Hide nav bar if current slide is not part of a song group
  if (!currentSlide || !currentSlide.songGroupId) {
    navBar.style.display = 'none';
    return;
  }
  
  // Show nav bar and populate with song group slides
  navBar.style.display = 'block';
  const groupId = currentSlide.songGroupId;
  const groupName = currentSlide.songGroupName || 'Song';
  
  // Find all slides in this song group
  const groupSlides = [];
  slides.forEach((s, idx) => {
    if (s && s.songGroupId === groupId) {
      groupSlides.push({ slide: s, index: idx });
    }
  });
  
  // Sort by songGroupIndex to maintain correct order
  groupSlides.sort((a, b) => {
    const aIdx = typeof a.slide.songGroupIndex === 'number' ? a.slide.songGroupIndex : 0;
    const bIdx = typeof b.slide.songGroupIndex === 'number' ? b.slide.songGroupIndex : 0;
    return aIdx - bIdx;
  });
  
  // Update title
  titleEl.textContent = `🎵 ${groupName} (${groupSlides.length} slides)`;
  
  // Render slide thumbnails
  slidesEl.innerHTML = '';
  groupSlides.forEach(({ slide, index }) => {
    const item = document.createElement('div');
    item.className = 'song-nav-slide' + (index === presentIdx ? ' active' : '');
    
    const num = document.createElement('div');
    num.className = 'song-nav-slide-num';
    const groupPos = typeof slide.songGroupIndex === 'number' ? slide.songGroupIndex + 1 : '?';
    num.textContent = `${groupPos}. ${slide.name || 'Slide ' + (index + 1)}`;
    
    const preview = document.createElement('div');
    preview.className = 'song-nav-slide-preview';
    // Extract actual lyrics from the HTML content
    const lyricsPreview = extractLyricsFromSongHtml(slide.html);
    preview.textContent = lyricsPreview || slide.name || 'Song Slide';
    
    item.appendChild(num);
    item.appendChild(preview);
    item.addEventListener('click', () => {
      presentJumpTo(index);
    });
    
    slidesEl.appendChild(item);
  });
}

// Helper function to extract lyrics preview from song slide HTML
function extractLyricsFromSongHtml(html) {
  if (!html || typeof html !== 'string') return '';
  
  // Create a temporary div to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Try to find the lyrics element (common ID in song slides)
  let lyricsEl = temp.querySelector('#lyrics') || temp.querySelector('.verse-text') || temp.querySelector('.lyrics');
  
  if (lyricsEl) {
    return lyricsEl.textContent.trim().substring(0, 150);
  }
  
  // Fallback: extract all text and clean it up
  const allText = temp.textContent || '';
  const cleaned = allText
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 150);
  
  return cleaned;
}

function presentJumpTo(idx) {
  if (idx < 0 || idx >= slides.length) return;
  if (presentIdx === idx) return;
  
  applySlideTransition(() => {
    _presentPrevIdx = presentIdx;
    presentIdx = idx;
    showPresentSlide();
    updateBackBtn();
  });
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
  
  applySlideTransition(() => {
    _presentPrevIdx = presentIdx;
    presentIdx = num - 1;
    showPresentSlide();
    updateBackBtn();
    document.getElementById('present-indicator').onclick = showGotoInput;
  });
}

function presentGoBack() {
  if (_presentPrevIdx === null) return;
  
  applySlideTransition(() => {
    const tmp = presentIdx;
    presentIdx = _presentPrevIdx;
    _presentPrevIdx = tmp;
    showPresentSlide();
    updateBackBtn();
  });
}

function updateBackBtn() {
  const btn = document.getElementById('present-back-btn');
  if (!btn) return;
  btn.style.display = _presentPrevIdx !== null ? '' : 'none';
}

// ══════════════════════════════════════════════════
//  SLIDE TRANSITION ANIMATIONS
// ══════════════════════════════════════════════════
const TRANSITION_TYPES = ['fade', 'slide-left', 'slide-right', 'zoom', 'flip', 'rotate'];
let _lastTransition = null;

function getRandomTransition() {
  // Get a random transition different from the last one for variety
  let transition;
  do {
    transition = TRANSITION_TYPES[Math.floor(Math.random() * TRANSITION_TYPES.length)];
  } while (transition === _lastTransition && TRANSITION_TYPES.length > 1);
  _lastTransition = transition;
  return transition;
}

function applySlideTransition(callback) {
  const pif = document.getElementById('present-iframe');
  if (!pif) {
    if (callback) callback();
    return;
  }

  const transition = getRandomTransition();
  
  // Remove any existing transition classes
  pif.className = '';
  
  // Apply exit animation
  pif.classList.add(`transition-${transition}-out`);
  
  // Wait for exit animation to complete, then load new slide
  setTimeout(() => {
    if (callback) callback();
    
    // Apply enter animation
    pif.className = '';
    pif.classList.add(`transition-${transition}-in`);
    
    // Clean up after enter animation
    setTimeout(() => {
      pif.className = '';
    }, 350);
  }, transition === 'fade' || transition === 'zoom' ? 250 : 300);
}

function ensurePresentIndex() {
  if (!slides.length) {
    presentIdx = null;
    return false;
  }
  if (typeof presentIdx !== 'number' || Number.isNaN(presentIdx)) {
    presentIdx = Number.isInteger(currentIdx) ? currentIdx : 0;
  }
  presentIdx = Math.max(0, Math.min(presentIdx, slides.length - 1));
  return true;
}

function presentNavImmediate(dir) {
  if (!ensurePresentIndex()) return;
  const target = presentIdx + dir;
  if (target < 0 || target >= slides.length) return;
  
  applySlideTransition(() => {
    presentIdx = target;
    _presentNavQueued = null;
    clearTimeout(_presentNavTimer);
    showPresentSlide();
    updateBackBtn();
  });
}

function presentNav(dir) {
  if (!ensurePresentIndex()) return;
  // Coalesce rapid arrow-key repeats: only commit the final target index
  const base = (_presentNavQueued !== null ? _presentNavQueued : presentIdx);
  const target = base + dir;
  if (target < 0 || target >= slides.length) return;
  _presentNavQueued = target;

  const veil = document.getElementById('transition-veil');
  veil.classList.add('flash');

  clearTimeout(_presentNavTimer);
  _presentNavTimer = setTimeout(() => {
    applySlideTransition(() => {
      presentIdx = _presentNavQueued;
      _presentNavQueued = null;
      showPresentSlide();
    });
    setTimeout(() => veil.classList.remove('flash'), 200);
  }, 80); // wait 80 ms for burst key-presses to settle before loading iframe
}

function spShowTempSlides() {
  if (_spQueue.length === 0) { showToast('Queue is empty', 'error'); return; }
  const song = songContent[_spSongId];
  const songName = song ? song.title : 'Song';
  const queueText = _spQueue.map(item => item.text);
  spShowTempSlidesFromText(queueText, songName);
}

function spQuickTempSlides() {
  const contentEl = document.getElementById('sp-db-content');
  if (!contentEl) { showToast('Lyrics not available', 'error'); return; }
  const raw = String(contentEl.value || '').replace(/\r\n/g, '\n');
  const verses = _spSplitVerses(raw);
  if (verses.length === 0) {
    showToast('No verses found. Separate verses with a blank line.', 'error');
    return;
  }
  const titleEl = document.getElementById('sp-db-title');
  const song = songContent[_spSongId];
  const songName = (titleEl && titleEl.value ? String(titleEl.value).trim() : '') || (song ? song.title : 'Song');
  spShowTempSlidesFromText(verses, songName || 'Song');
}

function spShowTempSlidesFromText(textItems, songName) {
  const source = Array.isArray(textItems) ? textItems : [];
  if (source.length === 0) { showToast('No verses found', 'error'); return; }
  const songSlideBg = 'linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%)';
  const refBase = _spSongId !== null ? (songName + '  (Song #' + _spSongId + ')') : (songName + '  (Quick Song)');

  const tempSlides = source.map((text, i) => {
    const html = createSongLyricSlideHtml(text, refBase, songSlideBg, '#f8fafc');
    return { id: Date.now() + Math.random(), type: 'html', name: songName + ' - ' + (i + 1), html };
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
        setPresentFrameHtml(html, true);
        const song = songContent[_spSongId];
        if (song) document.getElementById('present-indicator').textContent = song.title;
      }
    } else {
      setPresentFrameHtml(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden}body{display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%);color:#f8fafc;font-family:'Noto Serif Tamil','Nirmala UI',serif;padding:4vw}.box{text-align:center;max-width:900px}h1{font-size:48px;line-height:1.25;color:#7dd3fc;margin-bottom:12px}p{font-size:26px;line-height:1.7;opacity:0.92}<\/style></head><body><div class="box"><h1>➕ New Song</h1><p>Use the editor on the right panel.</p></div></body></html>`, true);
      document.getElementById('present-indicator').textContent = 'New Song';
    }
    
    releaseWakeLock();
    return;
  }

  // Full exit
  overlay.classList.remove('active', 'panel-fs', 'bible-fs');
  document.body.style.overflow = '';
  document.body.classList.remove('presenting');
  resumePreviewFrame();
  document.getElementById('bp-fs-prev').style.display = 'none';
  document.getElementById('bp-fs-next').style.display = 'none';
  renderPresentBookmarks();
  presentIdx = null; // Clear presentIdx when fully pushed out
  releaseWakeLock();
  
  // Turn off floating church name if active
  if (_floatingChurchActive) {
    toggleFloatingChurchName();
  }
}

function _isEditableTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

let _hotkeyDetectorTimer = null;
function showHotkeyDetector(label) {
  const overlay = document.getElementById('present-overlay');
  if (!overlay) return;

  let el = document.getElementById('hotkey-detector');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hotkey-detector';
    el.style.cssText = [
      'position:fixed',
      'right:18px',
      'top:18px',
      'z-index:1000001',
      'padding:8px 12px',
      'border-radius:10px',
      'border:1px solid rgba(255,255,255,0.35)',
      'background:rgba(10,14,30,0.55)',
      'backdrop-filter:blur(6px)',
      '-webkit-backdrop-filter:blur(6px)',
      'color:#ffffff',
      'font:700 13px/1.2 "Segoe UI", "Nirmala UI", sans-serif',
      'letter-spacing:0.04em',
      'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
      'opacity:0',
      'transform:translateY(-8px) scale(0.96)',
      'transition:opacity .16s ease, transform .16s ease',
      'pointer-events:none'
    ].join(';');
    overlay.appendChild(el);
  }

  el.textContent = 'Shortcut Detected: ' + label;
  el.style.opacity = '1';
  el.style.transform = 'translateY(0) scale(1)';

  clearTimeout(_hotkeyDetectorTimer);
  _hotkeyDetectorTimer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px) scale(0.96)';
  }, 700);
}

// Keyboard nav in present mode (bound to main doc + present iframe docs)
function handlePresentHotkeys(e) {
  const overlay = document.getElementById('present-overlay');
  if (!overlay.classList.contains('active')) return;

  // Do not block typing in editable fields, but allow Escape to blur.
  const target = e.target || document.activeElement;
  if (_isEditableTarget(target)) {
    if (e.key === 'Escape') {
       if (typeof target.blur === 'function') target.blur();
       return;
    }
    return;
  }

  // Automatically close bible/song panels on escape before exiting presentation
  if (e.key === 'Escape') {
    if (_bpOpen) {
      toggleBiblePanel();
      e.preventDefault();
      return;
    }
    if (_spOpen) {
      toggleSongPanel();
      e.preventDefault();
      return;
    }
  }

  const isForward = (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.code === 'Space');
  const isBackward = (e.key === 'ArrowLeft' || e.key === 'ArrowUp');
  if (isForward || isBackward || e.key === 'Backspace' || e.key === 'Escape') {
    e.preventDefault();
  }

  if (overlay.classList.contains('bible-fs')) {
    if (isForward) bpFsNav(1);
    if (isBackward) bpFsNav(-1);
    if (e.key === 'Escape') exitPresent();
    return;
  }

  if (isForward) presentNav(1);
  if (isBackward) presentNav(-1);
  if (e.key === 'Backspace') presentGoBack();
  if (e.key === 'Escape') exitPresent();
  if (!e.repeat && e.key.toLowerCase() === 'c') {
    showHotkeyDetector('C - Clap');
    showClapGraphics();
  }
  if (!e.repeat && e.key.toLowerCase() === 'a') {
    showHotkeyDetector('A - Amen');
    showAmenGraphics();
  }
  if (!e.repeat && e.key.toLowerCase() === 's') {
    showHotkeyDetector('S - Fireworks');
    showFireworksGraphics();
  }
  // Handle F key - trigger fireworks
  if (!e.repeat && e.key.toLowerCase() === 'f') {
    showHotkeyDetector('F - Fireworks');
    showFireworksGraphics();
  }
  // L key for floating church name
  if (!e.repeat && e.key.toLowerCase() === 'l') {
    showHotkeyDetector('L - Floating Church');
    toggleFloatingChurchName();
  }
}

let _lastHotkeyWasF = false;

document.addEventListener('keydown', handlePresentHotkeys, true);

(function bindPresentIframeHotkeys() {
  const presentFrame = document.getElementById('present-iframe');
  if (!presentFrame || presentFrame._hotkeyBridgeAdded) return;

  presentFrame.addEventListener('load', () => {
    try {
      const doc = presentFrame.contentDocument;
      if (!doc || doc._presentHotkeysBound) return;
      doc.addEventListener('keydown', handlePresentHotkeys, true);
      doc._presentHotkeysBound = true;
    } catch (err) {
      // Ignore cross-context access issues and keep main document hotkeys active.
    }
  });

  presentFrame._hotkeyBridgeAdded = true;
})();

let _remotePollTimer = null;
let _remotePollBusy = false;
const _remoteBaseUrl = 'http://' + (location.hostname || '127.0.0.1') + ':8788';
let _remoteStateTimer = null;
let _remoteStateBusy = false;
let _remoteStateDirty = true;
let _remoteStateLastSent = 0;

function handleRemoteCommand(cmd, arg) {
  const clean = String(cmd || '').toLowerCase();
  const overlay = document.getElementById('present-overlay');
  const isPresenting = overlay && overlay.classList.contains('active');
  const needsPresent = (clean === 'next' || clean === 'prev' || clean === 'back' || clean === 'goto');

  if (clean === 'start') { startPresent(); return; }
  if (clean === 'exit') { exitPresent(); return; }
  if (clean === 'open_bible') { openCurrentSlideInBible(); return; }
  if (clean === 'clap') { showClapGraphics(); return; }
  if (clean === 'amen') { showAmenGraphics(); return; }
  if (clean === 'fireworks') { showFireworksGraphics(); return; }
  if (needsPresent && !isPresenting) { startPresent(); }
  if (clean === 'next') { presentNavImmediate(1); return; }
  if (clean === 'prev') { presentNavImmediate(-1); return; }
  if (clean === 'back') { presentGoBack(); return; }
  if (clean === 'goto') { goToSlide(String(arg || '')); return; }
  if (clean === 'import_new_song') {
    if (arg && arg.title && Array.isArray(arg.queue)) {
      const songName = arg.title || 'Imported Song';
      const songSlideBg = 'linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%)';
      const tempSlides = arg.queue.map((item, i) => {
        const refName = (item.name ? (songName + ' - ' + item.name) : songName);
        const html = createSongLyricSlideHtml(item.text, refName, songSlideBg, '#f8fafc');
        return { 
          id: Date.now() + Math.random(), 
          type: 'html', 
          name: songName + ' - ' + (i + 1), 
          html,
          bookmarked: i === 0 // Bookmark first slide
        };
      });
      slides.push(...tempSlides);
      currentIdx = slides.length - tempSlides.length;
      renderAll(); renderPreview(); renderEditor();
      scheduleSave();
      showToast('✓ ' + tempSlides.length + ' slides imported from ' + songName, 'success', 3000);
      if (!isPresenting) startPresent(); // Auto start presentation for imported song
    }
    return;
  }
}

async function pollRemoteOnce() {
  if (_remotePollBusy) return;
  _remotePollBusy = true;
  try {
    const res = await fetch(_remoteBaseUrl + '/poll', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data && Array.isArray(data.cmds)) {
      data.cmds.forEach(item => {
        if (item && item.cmd) handleRemoteCommand(item.cmd, item.arg);
      });
    } else if (data && data.cmd) {
      handleRemoteCommand(data.cmd, data.arg);
    }
  } catch (_) {
    // Ignore if remote server is not running.
  } finally {
    _remotePollBusy = false;
  }
}

function startRemotePolling() {
  if (_remotePollTimer) return;
  _remotePollTimer = setInterval(pollRemoteOnce, 150);
  pollRemoteOnce();
}

startRemotePolling();

setInterval(() => {
  if (slides.length) markRemoteStateDirty();
}, 1500);

function buildRemoteState() {
  const htmlToText = (html) => {
    const raw = String(html || '');
    const noScript = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    const noStyle = noScript.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const noTags = noStyle.replace(/<[^>]+>/g, ' ');
    return noTags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  };
  const makeSummary = (slide, index) => {
    if (!slide) return null;
    const baseName = slide.name || '';
    const label = baseName || (slide.title || ('Slide ' + index));
    let snippet = '';
    if (slide.type === 'simple') {
      const body = String(slide.body || '').replace(/\s+/g, ' ').trim();
      snippet = body.slice(0, 120);
    }
    return {
      index,
      name: label,
      snippet
    };
  };

  const activeIndex = Number.isInteger(presentIdx) ? (presentIdx + 1) : (currentIdx + 1);
  const prevSlide = makeSummary(slides[activeIndex - 2], activeIndex - 1);
  const currSlide = makeSummary(slides[activeIndex - 1], activeIndex);
  const nextSlide = makeSummary(slides[activeIndex], activeIndex + 1);

  const list = [];
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    if (s && s.bookmarked) {
      list.push({
        index: i + 1,
        name: s.name || ('Slide ' + (i + 1))
      });
    }
  }
  const slidesList = slides.map((s, i) => {
    const name = (s && s.name) ? s.name : '';
    const title = (s && s.type === 'simple' && s.title) ? s.title : '';
    const label = name || title || ('Slide ' + (i + 1));
    let snippet = '';
    if (s && s.type === 'simple') {
      const body = String(s.body || '').replace(/\s+/g, ' ').trim();
      snippet = body.slice(0, 120);
    } else if (s && s.type === 'html') {
      const text = htmlToText(s.html || '');
      snippet = text.slice(0, 120);
    }
    return { index: i + 1, name: label, snippet };
  });
  return {
    bookmarks: list,
    slides: slidesList,
    current: activeIndex,
    total: slides.length,
    prev: prevSlide,
    now: currSlide,
    next: nextSlide,
    updatedAt: Date.now()
  };
}

async function pushRemoteState() {
  if (_remoteStateBusy) return;
  const now = Date.now();
  if (!_remoteStateDirty && now - _remoteStateLastSent < 800) return;
  _remoteStateBusy = true;
  _remoteStateDirty = false;
  try {
    const payload = buildRemoteState();
    await fetch(_remoteBaseUrl + '/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    _remoteStateLastSent = Date.now();
  } catch (_) {
    // Ignore if remote server is not running.
  } finally {
    _remoteStateBusy = false;
  }
}

function markRemoteStateDirty() {
  _remoteStateDirty = true;
  if (!_remoteStateTimer) {
    _remoteStateTimer = setInterval(pushRemoteState, 700);
  }
  pushRemoteState();
}

// ══════════════════════════════════════════════════
//  MOTIVATIONAL AMEN GRAPHICS (HOLY FIRE EFFECT)
// ══════════════════════════════════════════════════
let _amenGraphicTimeout = null;

function showAmenGraphics() {
  const container = document.getElementById('amen-graphic');
  if (!container) return;
  
  if (_amenGraphicTimeout) clearTimeout(_amenGraphicTimeout);
  container.style.display = 'block';

  // Constructing a cinematic, hollywood-style effect for Hallelujah / Amen
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    margin: 0; padding: 0; overflow: hidden; background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    display: flex; align-items: center; justify-content: center;
    height: 100vh; font-family: 'Playfair Display', serif;
  }
  .cinematic-container {
    position: relative;
    text-align: center;
    perspective: 1200px;
    z-index: 5;
  }
  .hallelujah-text, .amen-text {
    font-size: min(100px, 12vw);
    font-weight: 900;
    text-transform: uppercase;
    color: #fff;
    margin: 0;
    line-height: 1.1;
    letter-spacing: 0.1em;
    opacity: 0;
    /* Heavenly Greenery Gold / White Text Effects */
    background: linear-gradient(to bottom, #ffffff 10%, #f0fff0 30%, #a8ffb2 50%, #20b2aa 80%, #006400 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: cinematicIn 5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  }
  .amen-text {
    font-size: min(140px, 18vw);
    animation-delay: 1.2s;
  }
  @keyframes cinematicIn {
    0% { 
      transform: scale(3) translateZ(-500px) rotateX(40deg); 
      opacity: 0; 
      filter: blur(20px) drop-shadow(0 0 0 transparent); 
    }
    15% { 
      transform: scale(1.1) translateZ(0) rotateX(0deg); 
      opacity: 1; 
      /* Deep Emerald / Forest Green 3D Shadows */
      filter: blur(0px) drop-shadow(0px 4px 0px #1e5631) drop-shadow(0px 8px 0px #0a2918) drop-shadow(0px 15px 15px rgba(0,0,0,0.9)) drop-shadow(0 0 30px rgba(152, 251, 152, 0.6)); 
    }
    50% { 
      transform: scale(1.35) translateZ(100px) rotateX(10deg); 
      opacity: 1; 
      filter: blur(0px) drop-shadow(0px 10px 0px #1e5631) drop-shadow(0px 20px 0px #0a2918) drop-shadow(0px 30px 30px rgba(0,0,0,1)) drop-shadow(0 0 60px rgba(74, 222, 128, 0.8)); 
    }
    85% { 
      transform: scale(1.05) translateZ(0px) rotateX(-5deg); 
      opacity: 1; 
      filter: blur(0px) drop-shadow(0px 2px 0px #1e5631) drop-shadow(0px 4px 0px #0a2918) drop-shadow(0px 8px 10px rgba(0,0,0,0.9)) drop-shadow(0 0 20px rgba(74, 222, 128, 0.5)); 
    }
    100% { 
      transform: scale(2) translateZ(300px) rotateX(-20deg); 
      opacity: 0; 
      filter: blur(15px) drop-shadow(0 0 0 transparent); 
    }
  }
  
  /* Natural Greenery/Motivational Leaf Particles instead of fire balls */
  .particles {
    position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 1;
  }
  .particle {
    position: absolute;
    bottom: -10%;
    width: 25px; height: 25px;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234ade80"><path d="M17.5,1.5c-4,0-8.5,1.5-12,5.5C3,9.5,1.5,13.5,1.5,17.5c0,2.5,1.5,4,4,4c4,0,8.5-1.5,12-5.5 c2.5-2.5,4-6.5,4-10.5C21.5,3,20,1.5,17.5,1.5z M16.5,8c-1.5,2.5-4,4.5-7.5,5.5c0,0-0.5,0-0.5-0.5c0-0.5,2-3.5,5.5-5.5 c0.5,0,0.5-0.5,0-1C11.5,6,9,6,7.5,7C7,7,6.5,6.5,7,6c1.5-1,4.5-1,7.5,0C15,6.5,17,7,16.5,8z"/></svg>');
    background-size: contain;
    background-repeat: no-repeat;
    opacity: 0;
    filter: drop-shadow(0 0 5px rgba(74, 222, 128, 0.8));
    animation: rise 4s ease-in infinite, sway 3s ease-in-out infinite alternate;
  }
  @keyframes rise {
    0% { transform: translateY(0) scale(0.5); opacity: 0; }
    20% { opacity: 1; }
    80% { opacity: 0.8; }
    100% { transform: translateY(-110vh) scale(1.5); opacity: 0; }
  }
  @keyframes sway {
    0% { margin-left: 0px; transform: rotate(0deg); }
    100% { margin-left: 50px; transform: rotate(45deg); }
  }
  /* Screen Flash */
  .flash {
    position: absolute; inset: 0; background: radial-gradient(circle, rgba(144, 238, 144, 0.4) 0%, transparent 70%);
    opacity: 0; z-index: 2; mix-blend-mode: overlay;
    animation: pulseFlash 4s ease-out;
  }
  @keyframes pulseFlash {
    0% { opacity: 0; transform: scale(0.5); }
    25% { opacity: 1; transform: scale(1.5); }
    100% { opacity: 0; transform: scale(2); }
  }
</style>
</head>
<body>
  <div class="flash"></div>
  <div class="particles" id="ptc"></div>
  <div class="cinematic-container">
    <div class="hallelujah-text">அல்லேலூயா</div>
    <div class="amen-text">ஆமென்</div>
  </div>
  <script>
    // Generate motivational greenery leaf particles
    const ptc = document.getElementById('ptc');
    for(let i=0; i<60; i++) {
      let p = document.createElement('div');
      p.className = 'particle';
      p.style.left = (Math.random() * 100) + 'vw';
      p.style.animationDuration = (3 + Math.random() * 4) + 's, ' + (2 + Math.random() * 3) + 's';
      p.style.animationDelay = (Math.random() * 2) + 's, ' + (Math.random() * 2) + 's';
      let size = (15 + Math.random() * 30) + 'px';
      p.style.width = size;
      p.style.height = size;
      ptc.appendChild(p);
    }
  </script>
</body>
</html>`;

  container.innerHTML = '<iframe style="width:100%;height:100%;border:none;display:block;background:transparent;position:absolute;inset:0;" srcdoc="' + html.replace(/"/g, '&quot;') + '" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>';

  _amenGraphicTimeout = setTimeout(() => {
    container.style.display = 'none';
    container.innerHTML = '';
  }, 6500);
}

// ══════════════════════════════════════════════════
//  MOTIVATIONAL FIREWORKS GRAPHICS
// ══════════════════════════════════════════════════
let _fireworkGraphicTimeout = null;

function showFireworksGraphics() {
  const container = document.getElementById('fireworks-graphic');
  if (!container) return;
  
  if (_fireworkGraphicTimeout) clearTimeout(_fireworkGraphicTimeout);
  container.style.display = 'block';
  container.style.backdropFilter = 'blur(4px) saturate(1.15)';
  container.style.webkitBackdropFilter = 'blur(4px) saturate(1.15)';
  container.style.background = 'rgba(255,255,255,0.04)';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    margin: 0; padding: 0; overflow: hidden; background: transparent;
  }
  canvas {
    display: block; width: 100vw; height: 100vh;
  }
</style>
</head>
<body>
  <canvas id="fw"></canvas>
  <script>
    const canvas = document.getElementById('fw');
    const ctx = canvas.getContext('2d');
    const DPR = Math.min(1.35, window.devicePixelRatio || 1);
    const colors = ['#FFD84D', '#FF7A66', '#61E8FF', '#74FF8A', '#FFB347', '#FDFDFD', '#7EE8FA', '#F9F871'];
    const cheerWords = ['ஸ்தோத்திரம்', 'அல்லேலூயா', 'ஆமென்', 'துதியுங்கள்'];
    const MAX_PARTICLES = 760;
    const MAX_RINGS = 10;
    const MAX_FLASHES = 8;

    const rockets = [];
    const particles = [];
    const rings = [];
    const textPops = [];
    const flashes = [];
    let lastWordAt = 0;
    let lastSlotIdx = -1;
    let quality = 1;
    let lastFrameTs = 0;
    const WORD_SLOTS = [
      { x: 0.24, y: 0.28 },
      { x: 0.50, y: 0.26 },
      { x: 0.76, y: 0.29 },
      { x: 0.28, y: 0.52 },
      { x: 0.52, y: 0.50 },
      { x: 0.74, y: 0.53 }
    ];

    function pushParticle(p) {
      if (particles.length >= (MAX_PARTICLES * quality) | 0) return;
      particles.push(p);
    }

    function pushRing(r) {
      if (rings.length >= MAX_RINGS) return;
      rings.push(r);
    }

    function pushFlash(f) {
      if (flashes.length >= MAX_FLASHES) return;
      flashes.push(f);
    }

    function approxWordBox(text, size, scale, x, y) {
      const width = Math.max(140, text.length * size * 0.72 * scale);
      const height = Math.max(40, size * 1.25 * scale);
      return {
        left: x - width / 2,
        right: x + width / 2,
        top: y - height,
        bottom: y + height * 0.25,
        width,
        height
      };
    }

    function overlap(a, b) {
      return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    }

    function pickWordPosition(text, size, scale, targetMaxScale) {
      const order = WORD_SLOTS.map((_, i) => i).sort(() => Math.random() - 0.5);
      const margin = 34;

      for (let i = 0; i < order.length; i++) {
        const slotIdx = order[i];
        if (slotIdx === lastSlotIdx && textPops.length > 0) continue;

        const slot = WORD_SLOTS[slotIdx];
        const x = slot.x * window.innerWidth;
        const y = slot.y * window.innerHeight;
        const box = approxWordBox(text, size, targetMaxScale, x, y);

        if (box.left < margin || box.right > window.innerWidth - margin || box.top < margin || box.bottom > window.innerHeight - margin) {
          continue;
        }

        let blocked = false;
        for (let j = 0; j < textPops.length; j++) {
          const t = textPops[j];
          const tScale = t.maxScale ? Math.min(t.maxScale, Math.max(1, t.scale)) : Math.max(1, t.scale);
          const tBox = approxWordBox(t.text, t.size, tScale, t.x, t.y);
          if (overlap(box, tBox)) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          lastSlotIdx = slotIdx;
          return { x, y, slotIdx };
        }
      }

      const fallback = {
        x: Math.max(window.innerWidth * 0.2, Math.min(window.innerWidth * 0.8, window.innerWidth * (0.3 + Math.random() * 0.4))),
        y: Math.max(window.innerHeight * 0.28, Math.min(window.innerHeight * 0.62, window.innerHeight * (0.34 + Math.random() * 0.2))),
        slotIdx: -1
      };
      return fallback;
    }

    function resize() {
      canvas.width = Math.floor(window.innerWidth * DPR);
      canvas.height = Math.floor(window.innerHeight * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function launchRocket() {
      const x = window.innerWidth * 0.16 + Math.random() * window.innerWidth * 0.68;
      rockets.push({
        x,
        y: window.innerHeight + 8,
        vx: (Math.random() - 0.5) * 2.4,
        vy: -(12 + Math.random() * 4),
        color: colors[(Math.random() * colors.length) | 0],
        explodeAt: window.innerHeight * (0.18 + Math.random() * 0.22),
        life: 1
      });
    }

    function createBurst(x, y, color) {
      const total = ((92 + (Math.random() * 34)) * quality) | 0;
      for (let i = 0; i < total; i++) {
        const angle = (Math.PI * 2 * i) / total + Math.random() * 0.07;
        const speed = 3.2 + Math.random() * 8.5;
        pushParticle({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: Math.random() < 0.75 ? color : colors[(Math.random() * colors.length) | 0],
          alpha: 1,
          decay: 0.008 + Math.random() * 0.015,
          size: 2.1 + Math.random() * 2.8,
          drag: 0.97
        });
      }

      // White crackle at center for a stronger pop effect.
      const crackleCount = ((20 + Math.random() * 10) * quality) | 0;
      for (let k = 0; k < crackleCount; k++) {
        const a = Math.random() * Math.PI * 2;
        const s = 1.2 + Math.random() * 4.5;
        pushParticle({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          color: '#FFFFFF',
          alpha: 1,
          decay: 0.02 + Math.random() * 0.03,
          size: 1.6 + Math.random() * 1.8,
          drag: 0.95
        });
      }

      pushRing({ x, y, r: 8, alpha: 1, color });
      pushFlash({ x, y, r: 30, alpha: 0.55, color: '#FFF7CC' });

      // Diwali circle-cracker ring that expands as a clear circular burst.
      setTimeout(() => {
        const count = ((34 + Math.random() * 12) * quality) | 0;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 * i) / count;
          const speed = 6.8 + Math.random() * 2.4;
          pushParticle({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: colors[(Math.random() * colors.length) | 0],
            alpha: 1,
            decay: 0.015 + Math.random() * 0.012,
            size: 2.2 + Math.random() * 2.2,
            drag: 0.975
          });
        }
        pushRing({ x, y, r: 12, alpha: 0.95, color: '#FFFFFF' });
      }, 90);

      if (Math.random() < 0.72 && textPops.length < 2 && Date.now() - lastWordAt > 1000) {
        const text = cheerWords[(Math.random() * cheerWords.length) | 0];
        const size = 34 + Math.random() * 10;
        const scale = 0.84;
        const margin = 36;
        const widthBase = Math.max(140, text.length * size * 0.72);
        const heightBase = Math.max(40, size * 1.25);
        const pos = pickWordPosition(text, size, scale, 1.6);
        const roomLeft = Math.max(1, pos.x - margin);
        const roomRight = Math.max(1, window.innerWidth - margin - pos.x);
        const roomTop = Math.max(1, pos.y - margin);
        const roomBottom = Math.max(1, window.innerHeight - margin - pos.y);
        const maxScaleX = (Math.min(roomLeft, roomRight) * 2) / widthBase;
        const maxScaleYTop = roomTop / heightBase;
        const maxScaleYBottom = roomBottom / (heightBase * 0.25);
        const maxScale = Math.max(1.08, Math.min(1.42, maxScaleX, maxScaleYTop, maxScaleYBottom));
        lastWordAt = Date.now();
        textPops.push({
          x: pos.x,
          y: pos.y,
          text,
          alpha: 1,
          vy: -0.08,
          size,
          scale,
          popSpeed: 0.012 + Math.random() * 0.01,
          depth: 6 + Math.random() * 4,
          wobble: Math.random() * Math.PI * 2,
          maxScale,
          slotIdx: pos.slotIdx
        });
      }
    }

    const launchPlan = [0, 360, 820, 1380, 2080, 2920, 3820, 4780];
    launchPlan.forEach((ms) => setTimeout(launchRocket, ms));

    function drawRocket(r) {
      ctx.save();
      ctx.globalAlpha = r.life;
      ctx.shadowBlur = 22;
      ctx.shadowColor = r.color;
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 3.8, 0, Math.PI * 2);
      ctx.fill();

      for (let t = 0; t < 3; t++) {
        pushParticle({
          x: r.x + (Math.random() - 0.5) * 2,
          y: r.y + 3 + Math.random() * 5,
          vx: (Math.random() - 0.5) * 1.4,
          vy: 1.8 + Math.random() * 1.8,
          color: '#FFB347',
          alpha: 0.75,
          decay: 0.05 + Math.random() * 0.02,
          size: 1.4 + Math.random() * 1.4,
          drag: 0.92
        });
      }
      ctx.restore();
    }

    function animate(ts) {
      if (!lastFrameTs) lastFrameTs = ts;
      const delta = ts - lastFrameTs;
      if (delta < 16) {
        requestAnimationFrame(animate);
        return;
      }
      lastFrameTs = ts;

      // Adaptive quality for slower machines.
      if (delta > 28 && quality > 0.72) quality -= 0.04;
      if (delta < 19 && quality < 1) quality += 0.02;
      if (quality < 0.58) quality = 0.58;
      if (quality > 1) quality = 1;

      ctx.globalCompositeOperation = 'source-over';
      // Keep the presenter visible: only a very light fade for sparkle trails.
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      ctx.globalCompositeOperation = 'lighter';

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.vy += 0.035;
        r.x += r.vx;
        r.y += r.vy;
        drawRocket(r);

        if (r.y <= r.explodeAt || r.vy > -2.1) {
          rockets.splice(i, 1);
          createBurst(r.x, r.y, r.color);
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.vy += 0.055;
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.globalAlpha = p.alpha;
        ctx.shadowBlur = p.size > 2 ? 10 : 0;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        ring.r += 7.8;
        ring.alpha -= 0.04;
        if (ring.alpha <= 0) {
          rings.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = ring.alpha;
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = 3.2;
        ctx.shadowBlur = 18;
        ctx.shadowColor = ring.color;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.r += 12;
        f.alpha -= 0.07;
        if (f.alpha <= 0) {
          flashes.splice(i, 1);
          continue;
        }
        ctx.save();
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, 'rgba(255,255,255,' + (f.alpha * 0.95) + ')');
        g.addColorStop(0.35, 'rgba(255,245,190,' + (f.alpha * 0.7) + ')');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (let i = textPops.length - 1; i >= 0; i--) {
        const t = textPops[i];
        t.y += t.vy;
        t.scale += t.popSpeed;
        t.wobble += 0.09;
        t.alpha -= 0.006;
        if (t.alpha <= 0) {
          textPops.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = Math.max(0, t.alpha);
        let animX = t.x + Math.sin(t.wobble) * 0.65;
        let animY = t.y + Math.cos(t.wobble * 0.8) * 0.55;
        const dynamicScale = Math.min(t.maxScale || 1.7, t.scale);
        const keepMargin = 30;
        const box = approxWordBox(t.text, t.size, dynamicScale, animX, animY);
        if (box.left < keepMargin) animX += (keepMargin - box.left);
        if (box.right > window.innerWidth - keepMargin) animX -= (box.right - (window.innerWidth - keepMargin));
        if (box.top < keepMargin) animY += (keepMargin - box.top);
        if (box.bottom > window.innerHeight - keepMargin) animY -= (box.bottom - (window.innerHeight - keepMargin));
        t.x = animX;
        t.y = animY;

        ctx.translate(animX, animY);
        ctx.scale(dynamicScale, dynamicScale);
        ctx.font = '800 ' + t.size + 'px "Noto Sans Tamil", "Nirmala UI", "Latha", sans-serif';
        ctx.textAlign = 'center';

        // Soft depth shadow for a cleaner natural text look.
        for (let z = t.depth; z >= 2; z -= 3) {
          const zAlpha = 0.09 + (z / t.depth) * 0.1;
          ctx.fillStyle = 'rgba(14, 20, 40, ' + zAlpha + ')';
          ctx.fillText(t.text, z * 0.32, z * 0.48);
        }
        ctx.fillStyle = 'rgba(10, 18, 34, 0.45)';
        ctx.fillText(t.text, t.depth * 0.12, t.depth * 0.2);

        const wordGrad = ctx.createLinearGradient(0, -t.size * 0.95, 0, t.size * 0.4);
        wordGrad.addColorStop(0, '#FFFFFF');
        wordGrad.addColorStop(0.38, '#FFF2B8');
        wordGrad.addColorStop(0.75, '#FFD37B');
        wordGrad.addColorStop(1, '#FFC46A');
        ctx.fillStyle = wordGrad;
        ctx.shadowBlur = 18;
        ctx.shadowColor = 'rgba(255, 190, 95, 0.75)';
        ctx.fillText(t.text, 0, 0);

        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.1;
        ctx.strokeText(t.text, 0, 0);

        // Gentle highlight pass.
        ctx.globalCompositeOperation = 'screen';
        const hiGrad = ctx.createLinearGradient(0, -t.size * 0.9, 0, 0);
        hiGrad.addColorStop(0, 'rgba(255,255,255,0.75)');
        hiGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hiGrad;
        ctx.fillText(t.text, 0, -t.size * 0.02);
        ctx.restore();
      }

      requestAnimationFrame(animate);
    }
    animate();
  </script>
</body>
</html>`;

  container.innerHTML = '<iframe style="width:100%;height:100%;border:none;display:block;background:transparent;position:absolute;inset:0;" srcdoc="' + html.replace(/"/g, '&quot;') + '" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>';

  _fireworkGraphicTimeout = setTimeout(() => {
    container.style.display = 'none';
    container.innerHTML = '';
    container.style.backdropFilter = '';
    container.style.webkitBackdropFilter = '';
    container.style.background = '';
  }, 7600);
}

// ══════════════════════════════════════════════════
//  MOTIVATIONAL CLAP GRAPHICS
// ══════════════════════════════════════════════════
let _clapGraphicTimeout = null;
let _clapGraphicInterval = null;

function showClapGraphics() {
  const container = document.getElementById('clap-graphic');
  if (!container) return;
  const clapGifUrl = new URL('Html Untouched/dynamicclap.gif', window.location.href).href;
  const clapStickerUrl = new URL('Html Untouched/clapgif_white_eyes.gif', window.location.href).href;
  
  if (_clapGraphicTimeout) clearTimeout(_clapGraphicTimeout);
  if (_clapGraphicInterval) clearInterval(_clapGraphicInterval);

  container.style.display = 'block';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<base href="${window.location.href}">
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Clap</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body {
  width:100%; height:100%;
  overflow:hidden;
  background:transparent;
}
canvas { position:fixed; inset:0; width:100%; height:100%; }
.glow {
  position:fixed; inset:0; pointer-events:none;
  background: radial-gradient(ellipse 100% 55% at 50% 100%,
    rgba(255,200,60,0.20) 0%, rgba(255,160,40,0.08) 45%, transparent 70%);
  animation: glowPulse 0.44s ease-in-out infinite;
}
.clap-row {
  position: fixed;
  left: 4vw;
  right: 4vw;
  bottom: 6vh;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  pointer-events: none;
  z-index: 3;
}
.clap-hand {
  width: clamp(88px, 9.2vw, 152px);
  aspect-ratio: 1 / 1;
  object-fit: contain;
  filter: drop-shadow(0 8px 16px rgba(0,0,0,0.33));
  animation: handFloat 1.3s ease-in-out infinite;
  transform-origin: 50% 80%;
}
@keyframes handFloat {
  0%, 100% { transform: translateY(0px) scale(1); }
  50% { transform: translateY(-12px) scale(1.03); }
}
@keyframes glowPulse { 0%,100%{opacity:0.55} 50%{opacity:1} }
</style>
</head>
<body>
<div class="glow"></div>
<canvas id="c"></canvas>
<div class="clap-row" id="clap-row"></div>
<script>
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
const clapRow = document.getElementById('clap-row');
const CLAP_GIF_URL = ${JSON.stringify(clapGifUrl)};

let hands  = [];
let notes  = [];
let sparks = [];

const NOTE_EMOJIS = ['🎵','🎶','🎼','🎉','✨','⭐','🌟','💛','🙏','🎊'];

function resize() {
  canvas.width  = innerWidth;
  canvas.height = innerHeight;
  buildHands();
}
addEventListener('resize', resize);

function makeHandPair(x, y, fontSize, phaseOffset) {
  return {
    x, y, fontSize,
    phase:     phaseOffset,
    speed:     0.10 + Math.random() * 0.04,
    noteTimer: 0,
    alpha:     0,
    bob:       Math.random() * Math.PI * 2,
    bobAmp:    4 + Math.random() * 5,
  };
}

function makeNote(x, y) {
  return {
    x: x + (Math.random()-0.5)*60, y,
    vx: (Math.random()-0.5)*1.2,
    vy: -(1.8 + Math.random()*2.2),
    alpha: 1,
    scale: 0.7 + Math.random()*0.7,
    rot:  (Math.random()-0.5)*0.4,
    rotV: (Math.random()-0.5)*0.035,
    emoji: NOTE_EMOJIS[Math.floor(Math.random()*NOTE_EMOJIS.length)],
    size:  20 + Math.random()*18,
  };
}

function makeSparks(x, y, n) {
  for (let i=0; i<n; i++) {
    const a = Math.random()*Math.PI*2;
    const s = 2 + Math.random()*5;
    sparks.push({
      x, y,
      vx: Math.cos(a)*s, vy: Math.sin(a)*s - 2,
      alpha: 1, r: 2 + Math.random()*3,
      col: 'hsl(' + (38+Math.random()*28) + ',100%,' + (62+Math.random()*22) + '%)',
    });
  }
}

function buildHands() {
  hands = [];
  if (clapRow) clapRow.innerHTML = '';

  const W = canvas.width, H = canvas.height;
  const count  = 7;
  const margin = W * 0.06;
  const span   = W - margin * 2;

  for (let i=0; i<count; i++) {
    const t     = i / (count-1);
    const x     = margin + t * span;
    const yOff  = Math.sin(t * Math.PI) * H * 0.05;
    const y     = H * 0.78 - yOff;
    const fSize = 64 + Math.random() * 26;
    const phase = (i / count) * Math.PI * 2;
    const h = makeHandPair(x, y, fSize, phase);
    hands.push(h);

    if (clapRow) {
      const img = document.createElement('img');
      img.className = 'clap-hand';
      img.src = CLAP_GIF_URL;
      img.alt = 'clap hand';
      img.style.animationDelay = (i * 0.12) + 's';
      img.style.width = Math.round(fSize * 1.5) + 'px';
      clapRow.appendChild(img);
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  hands.forEach(h => {
    h.phase += h.speed;

    const clap = Math.sin(h.phase);
    const bobY = Math.sin(h.phase * 0.5 + h.bob) * h.bobAmp;

    if (clap > 0.88 && h.noteTimer <= 0) {
      makeSparks(h.x, h.y + bobY - h.fontSize * 0.5, 9);
      if (Math.random() > 0.30) notes.push(makeNote(h.x, h.y + bobY - h.fontSize));
      h.noteTimer = 14;
    }
    if (h.noteTimer > 0) h.noteTimer--;
  });

  sparks = sparks.filter(s => s.alpha > 0.02);
  sparks.forEach(s => {
    s.x += s.vx; s.y += s.vy; s.vy += 0.15; s.alpha -= 0.028;
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fillStyle = s.col; ctx.fill();
    ctx.restore();
  });

  notes = notes.filter(n => n.alpha > 0.02);
  notes.forEach(n => {
    n.x += n.vx; n.y += n.vy; n.rot += n.rotV; n.alpha -= 0.007;
    ctx.save();
    ctx.globalAlpha = Math.min(1, n.alpha * 4);
    ctx.translate(n.x, n.y); ctx.rotate(n.rot); ctx.scale(n.scale, n.scale);
    ctx.font = n.size + 'px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(n.emoji, 0, 0);
    ctx.restore();
  });

  requestAnimationFrame(draw);
}

resize();
draw();
<\/script>
</body>
</html>`;

  container.innerHTML = `<iframe id="clap-graphic-frame" style="width:100%;height:100%;border:none;display:block;background:transparent;position:absolute;inset:0;" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe>
    <img id="clap-sticker-overlay" src="${clapStickerUrl}" alt="clap sticker" style="position:absolute;left:50%;top:27%;transform:translate(-50%, -50%);width:min(340px,42vw);aspect-ratio:1/1;object-fit:contain;pointer-events:none;z-index:4;filter:drop-shadow(0 8px 26px rgba(0,0,0,0.45)); animation: clapPulse 0.95s infinite alternate;" />`;
  const frame = document.getElementById('clap-graphic-frame');
  if (frame) frame.srcdoc = html;
  
  // Add animation style if not exists
  if (!document.getElementById('clap-pulse-style')) {
    const style = document.createElement('style');
    style.id = 'clap-pulse-style';
    style.innerHTML = `@keyframes clapPulse { 0% { transform: translate(-50%, -50%) scale(1); } 100% { transform: translate(-50%, -50%) scale(1.1); } }`;
    document.head.appendChild(style);
  }

  _clapGraphicTimeout = setTimeout(() => {
    container.style.display = 'none';
    container.innerHTML = '';
  }, 5000);
}

function synthesizeClap() {
    try {
        if (!window._audioCtx) window._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (window._audioCtx.state === 'suspended') window._audioCtx.resume();
        const time = window._audioCtx.currentTime;
        
        const bufferSize = window._audioCtx.sampleRate * 0.15; // 150ms buffer
        const buffer = window._audioCtx.createBuffer(1, bufferSize, window._audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1; // white noise
        }
        
        const noise = window._audioCtx.createBufferSource();
        noise.buffer = buffer;
        
        // Bandpass to make it sound like a clap instead of pure static
        const filter = window._audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1000;
        filter.Q.value = 1.2;

        // Fast attack, exponential decay
        const envelope = window._audioCtx.createGain();
        envelope.gain.setValueAtTime(0, time);
        envelope.gain.exponentialRampToValueAtTime(1, time + 0.01);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        
        noise.connect(filter);
        filter.connect(envelope);
        envelope.connect(window._audioCtx.destination);
        
        noise.start(time);
    } catch (e) {
        console.log('Clap audio synthesis failed:', e);
    }
}

// ══════════════════════════════════════════════════
//  SHORTCUTS MODAL
// ══════════════════════════════════════════════════
function openShortcutsModal() {
  document.getElementById('shortcuts-modal').style.display = 'flex';
}

function closeShortcutsModal() {
  document.getElementById('shortcuts-modal').style.display = 'none';
}

// ══════════════════════════════════════════════════
//  FLOATING CHURCH NAME (DVD Screensaver style)
// ══════════════════════════════════════════════════
let _floatingChurchActive = false;
let _floatingChurchAnimFrame = null;
let _floatingChurchX = 0;
let _floatingChurchY = 0;
let _floatingChurchVX = 1.5;  // velocity X - will be randomized on start
let _floatingChurchVY = 1.2;  // velocity Y - will be randomized on start

function toggleFloatingChurchName() {
  console.log('Toggle called, current state:', _floatingChurchActive);
  _floatingChurchActive = !_floatingChurchActive;
  const el = document.getElementById('floating-church-name');
  const backdrop = document.getElementById('floating-church-backdrop');
  
  if (!el || !backdrop) {
    console.error('Floating church elements not found');
    return;
  }
  
  if (_floatingChurchActive) {
    console.log('Activating floating church name');
    // Show backdrop and text
    backdrop.style.display = 'block';
    el.style.display = 'block';
    
    // Wait for layout to calculate size
    setTimeout(() => {
      // Random starting position
      const rect = el.getBoundingClientRect();
      const maxW = window.innerWidth - rect.width;
      const maxH = window.innerHeight - rect.height;
      _floatingChurchX = Math.random() * Math.max(100, maxW);
      _floatingChurchY = Math.random() * Math.max(100, maxH);
      
      // CRITICAL: Set BOTH velocities to non-zero values
      const speedX = 1.2 + Math.random() * 0.8; // 1.2 to 2.0
      const speedY = 1.0 + Math.random() * 0.6; // 1.0 to 1.6
      _floatingChurchVX = Math.random() > 0.5 ? speedX : -speedX;
      _floatingChurchVY = Math.random() > 0.5 ? speedY : -speedY;
      
      console.log('DVD Screensaver Started:', {
        startPos: {x: _floatingChurchX.toFixed(1), y: _floatingChurchY.toFixed(1)},
        velocity: {vx: _floatingChurchVX.toFixed(2), vy: _floatingChurchVY.toFixed(2)},
        bounds: {maxW: maxW.toFixed(0), maxH: maxH.toFixed(0)}
      });
      
      animateFloatingChurch();
    }, 50);
  } else {
    console.log('Deactivating floating church name');
    // Hide backdrop and text
    backdrop.style.display = 'none';
    el.style.display = 'none';
    if (_floatingChurchAnimFrame) {
      cancelAnimationFrame(_floatingChurchAnimFrame);
      _floatingChurchAnimFrame = null;
    }
  }
}

function animateFloatingChurch() {
  if (!_floatingChurchActive) return;
  
  const el = document.getElementById('floating-church-name');
  if (!el) return;
  
  // Get actual rendered dimensions every frame
  const rect = el.getBoundingClientRect();
  const maxW = window.innerWidth - rect.width;
  const maxH = window.innerHeight - rect.height;
  
  // CRITICAL: Update BOTH X and Y position every frame
  _floatingChurchX += _floatingChurchVX;
  _floatingChurchY += _floatingChurchVY;
  
  // DVD Screensaver bounce logic
  let bounced = false;
  
  // Hit LEFT wall
  if (_floatingChurchX < 0) {
    _floatingChurchX = 0;
    _floatingChurchVX = Math.abs(_floatingChurchVX); // Bounce right
    bounced = true;
  }
  // Hit RIGHT wall
  if (_floatingChurchX > maxW) {
    _floatingChurchX = maxW;
    _floatingChurchVX = -Math.abs(_floatingChurchVX); // Bounce left
    bounced = true;
  }
  // Hit TOP wall
  if (_floatingChurchY < 0) {
    _floatingChurchY = 0;
    _floatingChurchVY = Math.abs(_floatingChurchVY); // Bounce down
    bounced = true;
  }
  // Hit BOTTOM wall
  if (_floatingChurchY > maxH) {
    _floatingChurchY = maxH;
    _floatingChurchVY = -Math.abs(_floatingChurchVY); // Bounce up
    bounced = true;
  }
  
  if (bounced) {
    console.log('BOUNCE! New velocity:', {vx: _floatingChurchVX.toFixed(2), vy: _floatingChurchVY.toFixed(2)});
  }
  
  // Apply position to DOM
  el.style.left = Math.round(_floatingChurchX) + 'px';
  el.style.top = Math.round(_floatingChurchY) + 'px';
  
  _floatingChurchAnimFrame = requestAnimationFrame(animateFloatingChurch);
}

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
