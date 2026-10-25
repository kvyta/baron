"use strict";
/* ===================================================================
   LOCAL — keep a .json file on this computer in step with the cloud.

   ☰ Menu → SAVING → LOCAL → SYNC asks which side wins, then:
   1. reads the file you pick,
   2. merges it with what Baron has now (your cloud copy when signed in)
      using mergePriority() — everything from both sides is kept; where the
      two disagree, the side you chose wins,
   3. puts the result in Baron (which pushes it to the cloud) AND writes it
      back into the file, so both end up identical,
   4. from then on every change is written to the file as well, including
      changes that arrive from your other devices.
   UNSYNC forgets the file. Needs the File System Access API (Chrome, Edge,
   Brave on a computer); elsewhere the row says it isn't available.
   =================================================================== */
const IDB_NAME = 'baron', IDB_STORE = 'fs';
let fileHandle = null, fsStatus = 'off', saveTimer = null;   // off | on | need | unsupported
const fsSupported = () => typeof window.showOpenFilePicker === 'function';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(k, v) { try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction(IDB_STORE, 'readwrite'); if (v == null) t.objectStore(IDB_STORE).delete(k); else t.objectStore(IDB_STORE).put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) {} }
async function idbGet(k) { try { const db = await idb(); return await new Promise((res, rej) => { const t = db.transaction(IDB_STORE, 'readonly'); const q = t.objectStore(IDB_STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return null; } }

/* ---------- merging two whole planners, one side winning ties ----------
   Pri wins every disagreement; nothing from Oth is lost unless it collides
   with something Pri has:
   - tasks: same id, or same name (two devices each made "Homework") → one
     task; Oth's blocks are re-pointed at Pri's task
   - events: same id, or same title + date + time + repeat → one event (Pri's);
     each side's skipped dates are combined
   - quotas: same id, or same day + text → Pri's version (done-ness included)
   - blocks, per day: same id → Pri's version (its grade, note, times);
     Oth's other blocks keep only the time Pri leaves free — overlap is
     trimmed away (to the longest free stretch), so where the two timelines
     disagree, Pri's timeline wins. Two graded copies of the same session
     are the same case: Pri's grade stands.
   - settings/stats: Pri's values over Oth's. */
function mergePriority(Pri, Oth) {
  Pri = Pri || {}; Oth = Oth || {};
  const key = s => String(s || '').trim().toLowerCase();
  const out = {
    v: 4, templates: Pri.templates || Oth.templates || [],
    stats: Object.assign({}, Oth.stats || {}, Pri.stats || {}),
    settings: Object.assign({}, Oth.settings || {}, Pri.settings || {}),
    tasks: [], events: [], quotas: [], days: {}
  };
  /* tasks */
  const tRemap = {}, tId = {}, tName = {};
  (Pri.tasks || []).forEach(t => { out.tasks.push(t); tId[t.id] = t; tName[key(t.name)] = t; });
  (Oth.tasks || []).forEach(t => {
    if (tId[t.id]) return;
    const same = tName[key(t.name)];
    if (same) { tRemap[t.id] = same.id; if (!t.hidden && same.hidden) same.hidden = false; return; }
    out.tasks.push(t); tId[t.id] = t; tName[key(t.name)] = t;
  });
  /* events */
  const eRemap = {}, eId = {}, eSig = {};
  const sig = e => [key(e.title), e.date, e.s, e.e, e.rep || 'none'].join('|');
  const keepEv = e => { const c = Object.assign({}, e, { skip: (e.skip || []).slice() }); out.events.push(c); eId[c.id] = c; eSig[sig(c)] = c; return c; };
  (Pri.events || []).forEach(keepEv);
  (Oth.events || []).forEach(e => {
    const same = eId[e.id] || eSig[sig(e)];
    if (same) {
      if (same.id !== e.id) eRemap[e.id] = same.id;
      (e.skip || []).forEach(d => { if (same.skip.indexOf(d) < 0) same.skip.push(d); });
      return;
    }
    keepEv(e);
  });
  /* quotas */
  const qId = {}, qSig = {};
  (Pri.quotas || []).forEach(q => { out.quotas.push(q); qId[q.id] = 1; qSig[q.date + '|' + key(q.text)] = 1; });
  (Oth.quotas || []).forEach(q => { if (qId[q.id] || qSig[q.date + '|' + key(q.text)]) return; out.quotas.push(q); });
  /* days */
  const P = Pri.days || {}, O = Oth.days || {};
  new Set(Object.keys(P).concat(Object.keys(O))).forEach(ds => {
    const pb = ((P[ds] && P[ds].blocks) || []).map(b => Object.assign({}, b));
    const ids = {}, evs = {};
    pb.forEach(b => { ids[b.id] = 1; if (b.evId) evs[b.evId] = 1; });
    const occ = new Array(SLOTS).fill(false);
    pb.forEach(b => { for (let i = b.start; i < b.start + b.len && i < SLOTS; i++) occ[i] = true; });
    const blocks = pb.slice();
    ((O[ds] && O[ds].blocks) || []).map(b => {
      const c = Object.assign({}, b);
      if (c.taskId && tRemap[c.taskId]) c.taskId = tRemap[c.taskId];
      if (c.evId && eRemap[c.evId]) c.evId = eRemap[c.evId];
      return c;
    }).sort((a, b) => a.start - b.start).forEach(b => {
      if (ids[b.id] || (b.evId && evs[b.evId])) return;       // Pri already has this one
      let best = null, run = null;
      for (let i = b.start; i <= b.start + b.len; i++) {
        const free = i < b.start + b.len && i < SLOTS && !occ[i];
        if (free) { if (!run) run = { s: i, l: 0 }; run.l++; }
        else if (run) { if (!best || run.l > best.l) best = run; run = null; }
      }
      if (!best) return;
      const nb = best.l === b.len ? b : Object.assign({}, b, { id: uid(), start: best.s, len: best.l });
      for (let i = nb.start; i < nb.start + nb.len; i++) occ[i] = true;
      blocks.push(nb); ids[nb.id] = 1; if (nb.evId) evs[nb.evId] = 1;
    });
    out.days[ds] = { blocks: blocks.sort((a, b) => a.start - b.start) };
  });
  return out;
}

/* ---------- linking, writing, forgetting ---------- */
async function syncLocalFile(prefer) {
  if (!fsSupported()) { toast('This browser can’t sync to a file'); return; }
  let h;
  try {
    [h] = await window.showOpenFilePicker({ types: [{ description: 'Baron save', accept: { 'application/json': ['.json'] } }] });
    if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') { toast('Baron needs permission to write that file'); return; }
  } catch (e) { if (e && e.name !== 'AbortError') toast('Couldn’t open that file'); return; }
  let fileData = null;
  try { const txt = (await (await h.getFile()).text()).trim(); fileData = txt ? JSON.parse(txt) : null; }
  catch (e) { toast('That file isn’t a Baron save'); return; }
  /* make "cloud" mean the latest cloud copy, not whatever this tab last saw */
  closeModal();
  if (typeof cloudOn === 'function' && cloudOn()) await cloudSync('before-local');
  pushUndo();
  const mine = JSON.parse(snapshot());
  const merged = fileData ? (prefer === 'local' ? mergePriority(fileData, mine) : mergePriority(mine, fileData)) : mine;
  adopt(merged);
  sealPastDays(true);
  syncAllEventBlocks();
  fileHandle = h; fsStatus = 'on';
  await idbPut('handle', h);
  save();                    // → localStorage + cloud
  await writeFile();         // → the file, now identical
  closeModal(); renderAll();
  toast(fileData ? 'Merged (' + (prefer === 'local' ? 'local' : 'cloud') + ' first) — file and cloud match' : 'Syncing to ' + h.name);
}
async function unsyncLocalFile() {
  fileHandle = null; fsStatus = fsSupported() ? 'off' : 'unsupported';
  clearTimeout(saveTimer);
  await idbPut('handle', null);
  toast('Stopped syncing the local file');
}
async function resumeLocalFile() {
  if (!fileHandle) return;
  try {
    if ((await fileHandle.requestPermission({ mode: 'readwrite' })) === 'granted') { fsStatus = 'on'; await writeFile(); toast('Local file syncing again'); }
  } catch (e) {}
}
async function restoreLocalFile() {
  if (!fsSupported()) { fsStatus = 'unsupported'; return; }
  const h = await idbGet('handle');
  if (!h) return;
  fileHandle = h;
  try { fsStatus = (await h.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'on' : 'need'; }
  catch (e) { fsStatus = 'need'; }
}
function queueFileSave() {
  if (!fileHandle || fsStatus !== 'on') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeFile, 700);
}
async function writeFile() {
  if (!fileHandle || fsStatus !== 'on') return;
  try { const w = await fileHandle.createWritable(); await w.write(snapshot()); await w.close(); }
  catch (e) { fsStatus = 'need'; }
}

/* ---------- ☰ Menu → SAVING → LOCAL ---------- */
function localRowHtml() {
  const row = (st, btn, title) => '<div class="svrow" title="' + esc(title) + '"><span class="svk">LOCAL</span><span class="svs">' + st + '</span><span class="svb">' + btn + '</span></div>';
  if (fsStatus === 'unsupported' || !fsSupported()) return '';   // phones, Safari, Firefox: no row at all
  if (fsStatus === 'on') return row('On', '<button class="btn sm green" data-local="unsync">UNSYNC</button>', 'Syncing to ' + (fileHandle ? fileHandle.name : 'a file') + '.');
  if (fsStatus === 'need') return row('Paused', '<button class="btn sm green" data-local="resume">RESUME</button><button class="btn sm" data-local="unsync">UNSYNC</button>', 'The browser needs your permission again to write ' + (fileHandle ? fileHandle.name : 'the file') + '.');
  return row('Off', '<span class="svdropwrap"><button class="btn sm green" data-local="sync">SYNC</button>' +
    '<span class="svdrop" hidden>' +
    '<button data-local="local"><b>Prioritize local</b><small>the file wins where they disagree</small></button>' +
    '<button data-local="cloud"><b>Prioritize cloud</b><small>Baron’s copy wins where they disagree</small></button>' +
    '</span></span>', 'Keep a .json file on this computer identical to your planner.');
}
function bindLocalMenu(M) {
  M.querySelectorAll('[data-local]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const a = b.dataset.local;
    if (a === 'sync') { const d = b.parentNode.querySelector('.svdrop'); d.hidden = !d.hidden; }
    else if (a === 'local' || a === 'cloud') syncLocalFile(a);
    else if (a === 'unsync') { unsyncLocalFile().then(() => { closeModal(); openMenu(); }); }
    else if (a === 'resume') { resumeLocalFile().then(() => { closeModal(); openMenu(); }); }
  });
  M.addEventListener('click', e => { if (!e.target.closest('.svdropwrap')) M.querySelectorAll('.svdrop').forEach(d => d.hidden = true); });
}
