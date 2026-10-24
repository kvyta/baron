"use strict";
/* ===================================================================
   BARON — plan the day, do it, grade it
   =================================================================== */

const ROWH = 22, SLOTS = 96;
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const pad = n => (n < 10 ? '0' : '') + n;
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* Grades you choose. The percentages are the share of a block's time that
   counts toward the day's score. */
const GRADES = [
  { g: 'A', pts: 100, color: '#35bd86', label: 'superbly done' },
  { g: 'B', pts: 90,  color: '#0093ff', label: 'solid' },
  { g: 'C', pts: 50,  color: '#ffc93d', label: 'half of it' },
  { g: 'D', pts: 30,  color: '#ff8c33', label: 'barely' },
  { g: 'F', pts: 20,  color: '#fe5f55', label: "didn't do it" }
];
/* U is never chosen — it is stamped on anything still ungraded once the day
   is over. It scores below F on purpose: an honest F beats walking away. */
const AUTO = { g: 'U', pts: 10, color: '#8fa0a8', label: 'never graded' };
const ALL_GRADES = GRADES.concat([AUTO]);
const ptsOf = g => { const x = ALL_GRADES.find(v => v.g === g); return x ? x.pts : 0; };
const colOf = g => { const x = ALL_GRADES.find(v => v.g === g); return x ? x.color : '#888'; };
const gradeOf = g => ALL_GRADES.find(v => v.g === g) || AUTO;

/* Two kinds of block. A TASK block is an instance of one of your tasks — blue,
   graded, and it drives the score. An EVENT block is a calendar event — red,
   never graded, counts toward booked time and rank only. Every event
   occurrence is always an event block on its date, kept in sync by
   syncEventsOn(); there is no manual "pull" step. */
const C_BLOCK = '#0093ff';
const C_EVENT = '#e2564c';
/* one-off events go green in the CALENDAR month grid only, so a genuine
   appointment stands out from the wall of recurring commitments */
const C_ONEOFF = '#35bd86';
const isEvent = b => !!b.evId;

/* Anything before today is sealed: no creating, editing, regrading or
   deleting. Today stays fully editable even for hours already gone. */
const isPastDay = ds => ds < todayStr();

/* ---------- date helpers ---------- */
const fmtD = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseD = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const todayStr = () => fmtD(new Date());
function shiftD(s, n) { const d = parseD(s); d.setDate(d.getDate() + n); return fmtD(d); }
const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function prettyD(s) { const d = parseD(s); return DOW[d.getDay()].slice(0,3).toUpperCase() + ' ' + MON[d.getMonth()].slice(0,3).toUpperCase() + ' ' + d.getDate(); }
function slotLabel(i) {
  const h = Math.floor(i / 4) % 24, m = (i % 4) * 15;
  const ap = h < 12 ? 'a' : 'p'; let hh = h % 12; if (hh === 0) hh = 12;
  return hh + ':' + pad(m) + ap;
}
const rangeLabel = (s, l) => slotLabel(s) + '–' + slotLabel((s + l) % 96 === 0 && s + l === 96 ? 0 : s + l) + '  ·  ' + durLabel(l);
function durLabel(l) { const m = l * 15, h = Math.floor(m / 60), r = m % 60; return (h ? h + 'h' : '') + (r ? (h ? ' ' : '') + r + 'm' : (h ? '' : '0m')); }

/* ---------- state ---------- */
const BLANK = () => ({
  v: 2,
  tasks: [],           // {id,name,hidden,created}
  days: {},            // 'YYYY-MM-DD' -> {blocks:[]}  block = {id,start,len,taskId|evId,note,done,grade}
  events: [],          // {id,date,s,e,title,note,rep,until,skip}   s/e = minutes from midnight
  templates: [],       // {id,name,blocks:[]}
  quotas: [],          // {id,date,text,note,done,created} — QUOTAS tab only, never a Task/Block
  stats: {},
  settings: { sound: true }
});
let S = BLANK();
let cur = todayStr();          // date shown in THE DAY
let calM = new Date();         // month shown in CALENDAR
let quotaAnchor = todayStr();  // first day of the 7-day window shown in QUOTAS
let undoStack = [];

const getDay = ds => (S.days[ds] || (S.days[ds] = { blocks: [] }));
const dayOf = ds => S.days[ds] || { blocks: [] };

/* ---------- scoring ----------
   Score is 0–100: how well you used the time you booked.
   Every block is weighted by its length, ungraded time counts as 0. */
const taskBlocks = d => d.blocks.filter(b => !isEvent(b));
const bookedSlots = d => d.blocks.reduce((t, b) => t + effLen(b), 0);     // events included, graded down
const rawBooked = d => d.blocks.reduce((t, b) => t + b.len, 0);           // what is on the timeline
/* Score still weights by the full booked length — an F has to drag the score
   down, so it cannot also vanish from the denominator. */
const scoreWeight = d => taskBlocks(d).reduce((t, b) => t + b.len, 0);     // events excluded
const gradedSlots = d => taskBlocks(d).reduce((t, b) => t + (b.done ? b.len : 0), 0);
function dayScore(d) {
  const tot = scoreWeight(d);
  if (!tot) return 0;
  const got = taskBlocks(d).reduce((t, b) => t + (b.done ? ptsOf(b.grade) * b.len : 0), 0);
  return Math.round(got / tot);
}
/* score of only the blocks you actually graded — "how you did on what you closed out" */
function gradedScore(d) {
  const g = gradedSlots(d);
  if (!g) return 0;
  return Math.round(taskBlocks(d).reduce((t, b) => t + (b.done ? ptsOf(b.grade) * b.len : 0), 0) / g);
}
/* How much of a block's time actually counts once it is graded.
   F and U hand the time back entirely — you did not spend it on this.
   D gives half. C and up count in full, as does anything not yet graded. */
const GRADE_TIME = { A: 1, B: 1, C: 1, D: 0.5, F: 0, U: 0 };
const effLen = b => (b.done && GRADE_TIME[b.grade] != null) ? b.len * GRADE_TIME[b.grade] : b.len;

/* The day's working window. 9:00a–10:00p unless blocks reach past either
   edge, in which case the window stretches to hold them. */
const SOD_DEF = 36, EOD_DEF = 88;
function dayEdges(d) {
  let sod = SOD_DEF, eod = EOD_DEF;
  (d.blocks || []).forEach(b => {
    if (b.start < sod) sod = b.start;
    if (b.start + b.len > eod) eod = b.start + b.len;
  });
  return { sod: clamp(sod, 0, 95), eod: clamp(eod, 1, SLOTS) };
}
const windowSlots = d => { const e = dayEdges(d); return Math.max(4, e.eod - e.sod); };

/* RANK 0–10: how full the working window is, counting only time that stuck. */
function dayRank(d) {
  return Math.min(10, Math.round(bookedSlots(d) / windowSlots(d) * 100) / 10);
}
/* GOLD 0–1000 = SCORE × RANK */
const dayGold = d => Math.round(dayScore(d) * dayRank(d));
const METRICS = {
  score: { key: 'score', label: 'SCORE', max: 100,  color: '#0093ff', fmt: v => Math.round(v) },
  rank:  { key: 'rank',  label: 'RANK',  max: 10,   color: '#e2564c', fmt: v => (Math.round(v * 10) / 10).toFixed(1) },
  gold:  { key: 'gold',  label: 'GOLD',  max: 1000, color: '#ffc93d', fmt: v => Math.round(v).toLocaleString() }
};

/* A day only counts toward the streak if you graded something yourself —
   an auto-U day means you planned and then never came back. */
const hasActivity = ds => (S.days[ds] ? S.days[ds].blocks : []).some(b => b.done && !isEvent(b) && !b.auto);

/* Stamp U on every block left ungraded on a day that has ended. */
let lastSeal = '';
function sealPastDays(force) {
  const t = todayStr();
  if (!force && lastSeal === t) return false;
  lastSeal = t;
  let changed = false;
  Object.keys(S.days).forEach(ds => {
    if (!isPastDay(ds)) return;
    S.days[ds].blocks.forEach(b => {
      if (isEvent(b) || b.done) return;
      b.done = true; b.grade = 'U'; b.auto = true;
      changed = true;
    });
  });
  if (changed) save();
  return changed;
}
function computeStreak() {
  let ds = todayStr();
  if (!hasActivity(ds)) ds = shiftD(ds, -1);   // today isn't over yet — doesn't break it
  let n = 0;
  while (hasActivity(ds)) { n++; ds = shiftD(ds, -1); }
  return n;
}
/* best day is measured in gold */
function bestDay() {
  let best = 0, date = null, score = 0, rank = 0;
  Object.keys(S.days).forEach(k => {
    const d = S.days[k];
    if (!d.blocks || !d.blocks.length || !gradedSlots(d)) return;
    const g = dayGold(d);
    if (g > best) { best = g; date = k; score = dayScore(d); rank = dayRank(d); }
  });
  return { gold: best, score: score, rank: rank, date: date };
}

/* ---------- persistence ---------- */
const LS_KEY = 'baron.save';
const LS_LEGACY = 'daylatro.v2';        // pre-Baron key, read once then retired
let fileHandle = null, fsStatus = 'off', saveTimer = null;

function snapshot() { return JSON.stringify({ v: 4, tasks: S.tasks, days: S.days, events: S.events, templates: S.templates, quotas: S.quotas, stats: S.stats, settings: S.settings }); }

function save() {
  try { localStorage.setItem(LS_KEY, snapshot()); } catch (e) { /* private mode */ }
  queueFileSave();
  if (typeof cloudQueue === 'function') cloudQueue();   // 06-sync.js — no-op unless signed in
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY) || localStorage.getItem(LS_LEGACY);
    if (raw) adopt(JSON.parse(raw));
  } catch (e) { console.warn('load failed', e); }
}
function adopt(o) {
  if (!o || typeof o !== 'object') return false;
  const b = BLANK();
  S = {
    v: 4,
    tasks: o.tasks || [],
    days: o.days || {},
    events: o.events || [],
    templates: o.templates || [],
    /* v4 saves had two separate features here: S.deadlines (a per-day
       checklist, array) and S.quotas (per-day-per-task time apportioning,
       object keyed by date). The quota feature was removed outright — its
       name is what the checklist now goes by. o.quotas from an old save is
       the old per-task object shape, not an array, so it's discarded rather
       than migrated; o.deadlines (if present) becomes the new S.quotas. */
    quotas: Array.isArray(o.quotas) ? o.quotas : (Array.isArray(o.deadlines) ? o.deadlines : []),
    stats: Object.assign(b.stats, o.stats || {}),
    settings: Object.assign(b.settings, o.settings || {})
  };
  stripCats();
  if (o.v !== 4) migrateToTasks();
  migrateGrades();
  return true;
}
/* the fail grade is F. A build in between briefly called it E — undo that. */
function migrateGrades() {
  Object.keys(S.days).forEach(k => (S.days[k].blocks || []).forEach(b => {
    if (b.grade === 'E') b.grade = 'F';
  }));
}
/* categories are gone — drop any left over in an older save file */
function stripCats() {
  Object.keys(S.days).forEach(k => (S.days[k].blocks || []).forEach(b => { delete b.cat; }));
  S.events.forEach(e => { delete e.cat; });
  S.templates.forEach(t => (t.blocks || []).forEach(b => { delete b.cat; }));
  delete S.settings.lastCat;
}
/* older saves stored a free-text title on every block. Turn each distinct
   title into a task so no history is lost. */
function migrateToTasks() {
  const byName = {};
  S.tasks.forEach(t => byName[t.name.toLowerCase()] = t);
  const get = nm => {
    const clean = String(nm || 'Untitled').trim() || 'Untitled';
    const k = clean.toLowerCase();
    if (!byName[k]) byName[k] = addTask(clean);
    return byName[k].id;
  };
  Object.keys(S.days).forEach(k => (S.days[k].blocks || []).forEach(b => {
    if (!isEvent(b) && !b.taskId) b.taskId = get(b.title);
    delete b.title;
  }));
  S.templates.forEach(t => (t.blocks || []).forEach(b => {
    if (!b.taskId) b.taskId = get(b.title);
    delete b.title;
  }));
}

/* ---- File System Access API: keep a real .json file on disk in sync ---- */
const IDB_NAME = 'baron', IDB_LEGACY = 'daylatro', IDB_STORE = 'fs';
function idb(name) {
  return new Promise((res, rej) => {
    const r = indexedDB.open(name || IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(k, v) { try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction(IDB_STORE, 'readwrite'); t.objectStore(IDB_STORE).put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) {} }
async function idbGet(k, name) { try { const db = await idb(name); return await new Promise((res, rej) => { const t = db.transaction(IDB_STORE, 'readonly'); const q = t.objectStore(IDB_STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return null; } }

const fsSupported = () => typeof window.showSaveFilePicker === 'function';

async function linkFile(existing) {
  if (!fsSupported()) { toast('Browser can’t link files — use EXPORT'); return; }
  try {
    let h;
    if (existing) {
      const arr = await window.showOpenFilePicker({ types: [{ description: 'Baron save', accept: { 'application/json': ['.json'] } }] });
      h = arr[0];
      const txt = await (await h.getFile()).text();
      if (txt.trim()) { adopt(JSON.parse(txt)); refreshStreak(); }
    } else {
      h = await window.showSaveFilePicker({
        suggestedName: 'baron-save.json',
        types: [{ description: 'Baron save', accept: { 'application/json': ['.json'] } }]
      });
    }
    fileHandle = h; fsStatus = 'on';
    await idbSet('handle', h);
    await writeFile();
    save(); renderAll();
    toast('Auto-saving to ' + h.name);
  } catch (e) { if (e && e.name !== 'AbortError') toast('Could not link file'); }
}
async function restoreHandle() {
  if (!fsSupported()) { fsStatus = 'unsupported'; return; }
  const h = (await idbGet('handle')) || (await idbGet('handle', IDB_LEGACY));
  if (!h) return;
  try {
    let p = await h.queryPermission({ mode: 'readwrite' });
    if (p === 'granted') {
      fileHandle = h; fsStatus = 'on';
      // prefer the newer of (file, localStorage)
      try {
        const txt = await (await h.getFile()).text();
        if (txt.trim()) { const o = JSON.parse(txt); if (!localStorage.getItem(LS_KEY)) adopt(o); }
      } catch (e) {}
    } else { fileHandle = h; fsStatus = 'need'; }
  } catch (e) { fsStatus = 'off'; }
}
async function grantHandle() {
  if (!fileHandle) return linkFile(false);
  try {
    const p = await fileHandle.requestPermission({ mode: 'readwrite' });
    if (p === 'granted') { fsStatus = 'on'; await writeFile(); toast('Auto-save resumed'); renderRail(); }
  } catch (e) {}
}
function queueFileSave() {
  if (!fileHandle || fsStatus !== 'on') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeFile, 700);
}
async function writeFile() {
  if (!fileHandle || fsStatus !== 'on') return;
  try {
    const w = await fileHandle.createWritable();
    await w.write(snapshot()); await w.close();
    const el = $('#fsDot'); if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 400); }
  } catch (e) { fsStatus = 'need'; renderRail(); }
}
function exportJSON() {
  const blob = new Blob([snapshot()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'baron-' + todayStr() + '.json';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast('Backup downloaded');
}
function importJSON() {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json';
  i.onchange = () => {
    const f = i.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { adopt(JSON.parse(r.result)); refreshStreak(); save(); renderAll(); closeModal(); toast('Save loaded'); }
      catch (e) { toast('That file isn’t a Baron save'); }
    };
    r.readAsText(f);
  };
  i.click();
}

/* ---------- undo ---------- */
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 40) undoStack.shift(); }
function undo() {
  if (!undoStack.length) { toast('Nothing to undo'); return; }
  adopt(JSON.parse(undoStack.pop()));
  save(); renderAll(); sfx('back'); toast('Undone');
}

/* streak and best day are derived from the days themselves — nothing to keep in sync */
function refreshStreak() { /* no-op, kept so old saves load cleanly */ }

/* ---------- sound (synth, no assets) ---------- */
let AC = null;
function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return AC; }
function tone(f, d, type, vol, slide) {
  if (!S.settings.sound) return;
  const c = ac(); if (!c) return;
  if (c.state === 'suspended') c.resume();
  const o = c.createOscillator(), g = c.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(f, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), c.currentTime + d);
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(vol || .07, c.currentTime + .008);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + d);
  o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + d + .02);
}
function sfx(kind, n) {
  switch (kind) {
    case 'click': tone(520, .05, 'square', .05); break;
    case 'place': tone(300, .07, 'square', .06, 620); break;
    case 'back':  tone(300, .08, 'square', .05, 150); break;
    case 'tick':  tone(700 + (n || 0) * 22, .04, 'square', .04); break;
    case 'chip':  tone(440 + (n || 0) * 34, .05, 'triangle', .05); break;
    case 'score': tone(392, .10, 'square', .07, 784); setTimeout(() => tone(587, .16, 'square', .07, 880), 90); break;
    case 'fail':  tone(200, .22, 'sawtooth', .05, 90); break;
    case 'win':   [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .18, 'square', .07), i * 95)); break;
  }
}

/* ---------- toast ---------- */
let toastT = null;
function toast(msg) {
  const old = $('.toast'); if (old) old.remove();
  const d = document.createElement('div'); d.className = 'toast outline'; d.textContent = msg;
  document.body.appendChild(d);
  clearTimeout(toastT); toastT = setTimeout(() => d.remove(), 2200);
}


/* ---------- tasks ---------- */
let taskSeq = 0;
const taskOf = id => S.tasks.find(t => t.id === id);
function taskLabel(b) {
  if (isEvent(b)) return b.evTitle || 'Event';
  const t = taskOf(b.taskId);
  /* taskName is stamped onto blocks when a task is deleted, so the archive
     never turns into a wall of "Deleted task" */
  return t ? t.name : (b.taskName || 'Deleted task');
}
/* called before a task is removed, so its history keeps a readable label */
function stampTaskName(id, name) {
  Object.keys(S.days).forEach(k => (S.days[k].blocks || []).forEach(b => {
    if (b.taskId === id) b.taskName = name;
  }));
  S.templates.forEach(t => (t.blocks || []).forEach(b => { if (b.taskId === id) b.taskName = name; }));
}
function addTask(name) {
  const t = { id: 'tk' + uid() + (taskSeq++), name: String(name || 'New task').trim() || 'New task', hidden: false, created: Date.now() + taskSeq };
  S.tasks.push(t);
  return t;
}
/* done  = graded blocks — the record, which can never be erased
   ahead = blocks still waiting for a grade, which can */
function taskStats(id) {
  let slots = 0, count = 0, done = 0, ahead = 0;
  Object.keys(S.days).forEach(k => {
    (S.days[k].blocks || []).forEach(b => {
      if (b.taskId !== id) return;
      slots += effLen(b); count++;
      if (b.done) done++; else ahead++;
    });
  });
  return { slots: slots, count: count, done: done, ahead: ahead };
}
/* wipe a task's ungraded blocks on days that are still editable */
function dropTaskBlocks(id) {
  let n = 0;
  Object.keys(S.days).forEach(k => {
    if (isPastDay(k)) return;
    const d = S.days[k], before = d.blocks.length;
    d.blocks = d.blocks.filter(b => !(b.taskId === id && !b.done));
    n += before - d.blocks.length;
  });
  return n;
}
const visibleTasks = () => S.tasks.filter(t => !t.hidden);

/* ---------- block geometry ---------- */
function occupancy(d, alsoEvents, ds) {
  const a = new Array(SLOTS).fill(null);
  d.blocks.forEach(b => { for (let i = b.start; i < b.start + b.len && i < SLOTS; i++) a[i] = b.id; });
  if (alsoEvents) eventsOn(ds).forEach(ev => { for (let i = Math.floor(ev.s / 15); i < Math.ceil(ev.e / 15) && i < SLOTS; i++) if (!a[i]) a[i] = 'EV'; });
  return a;
}
function carve(d, start, end, keepEvents) {
  const out = [];
  d.blocks.forEach(b => {
    if (keepEvents && isEvent(b)) { out.push(b); return; }   // event blocks never cannibalize each other
    const bs = b.start, be = b.start + b.len;
    if (be <= start || bs >= end) { out.push(b); return; }
    if (bs < start) out.push(Object.assign({}, b, { id: uid(), len: start - bs }));
    if (be > end)   out.push(Object.assign({}, b, { id: uid(), start: end, len: be - end }));
  });
  d.blocks = out;
}
function addBlock(ds, start, len, taskId, note) {
  const d = getDay(ds);
  carve(d, start, start + len);
  const b = { id: uid(), start, len, taskId: taskId, note: note || '', done: false, grade: null };
  d.blocks.push(b);
  d.blocks.sort((x, y) => x.start - y.start);
  return b;
}
/* Events are never "pulled" — every occurrence of an event IS an event block,
   always. syncEventsOn(ds) is the one place that keeps a date's event blocks
   true to S.events: it adds any occurrence missing a block, carving room for
   it against TASK blocks only (an event owns the calendar, so it wins a
   conflict with a plain block same as a manual block always could) — it
   never carves into an existing EVENT block, so two genuinely overlapping
   calendar events (a real double-booking) both keep their own block instead
   of the second one silently truncating/deleting the first — and drops any
   event block whose event no longer happens there (covers cancelling,
   skipping, ending a series, and moving an event's date/time/repeat — all in
   one place). Sealed past days are never rewritten. Cheap and idempotent —
   safe to call on every render of a date. */
function syncEventsOn(ds) {
  if (isPastDay(ds)) return false;
  const occ = eventsOn(ds);
  const d = S.days[ds];
  if (!occ.length) {
    if (!d || !d.blocks.some(isEvent)) return false;
    const before = d.blocks.length;
    d.blocks = d.blocks.filter(b => !isEvent(b));
    return d.blocks.length !== before;
  }
  const day = getDay(ds);
  let changed = false;
  occ.forEach(ev => {
    const start = clamp(Math.floor(ev.s / 15), 0, 95);
    const end = clamp(Math.max(start + 1, Math.ceil(ev.e / 15)), 1, 96);
    const evNote = ev.note || '';
    /* an existing block only counts as "synced" if it still matches the
       event's CURRENT time/title/note — a retime/rename/renote leaves the
       old block sitting there stale otherwise, since a presence-only check
       (just "does a block with this evId exist") never notices the event
       moved out from under it. `matches.length !== 1` also mops up any
       leftover duplicate event-blocks from earlier bugs. */
    const matches = day.blocks.filter(b => b.evId === ev.id);
    const stale = matches.length !== 1 || matches[0].id !== 'ev_' + ev.id + '_' + ds || matches[0].start !== start || matches[0].len !== (end - start) ||
      matches[0].evTitle !== ev.title || matches[0].note !== evNote;
    if (!stale) return;
    if (matches.length) day.blocks = day.blocks.filter(b => b.evId !== ev.id);
    carve(day, start, end, true);
    /* deterministic id: two synced devices materializing the same occurrence
       must produce the same block, or a merge would double it */
    day.blocks.push({ id: 'ev_' + ev.id + '_' + ds, start: start, len: end - start, evId: ev.id, evTitle: ev.title, note: evNote, done: false, grade: null });
    changed = true;
  });
  const before = day.blocks.length;
  day.blocks = day.blocks.filter(b => !isEvent(b) || occ.some(ev => ev.id === b.evId));
  if (day.blocks.length !== before) changed = true;
  if (changed) day.blocks.sort((a, b) => a.start - b.start);
  return changed;
}
/* sweep every date that already has an S.days entry — call after any edit to
   S.events so already-touched days (past renders of WEEKLY/MONTHLY/DAILY)
   don't go stale until next visited */
function syncAllEventBlocks() {
  let changed = false;
  /* Every date that already has a day entry, PLUS every event's own anchor
     date (`ev.date`) — this is what actually finds and materializes an old
     "sitting there unpulled" event, which by definition has no S.days entry
     yet (nothing was ever placed on that date). A recurring event's *other*
     occurrences are intentionally not pre-materialized here — they can't be,
     recurrence can be infinite — they sync lazily the moment their date is
     ever rendered (DAILY/MONTHLY/WEEKLY all call syncEventsOn per date). */
  const dates = new Set(Object.keys(S.days));
  S.events.forEach(ev => { if (ev.date) dates.add(ev.date); });
  dates.forEach(ds => { if (syncEventsOn(ds)) changed = true; });
  return changed;
}
const findBlock = (ds, id) => dayOf(ds).blocks.find(b => b.id === id);

/* ---------- events & recurrence ---------- */
const REPEATS = [
  { id: 'none',     name: 'Does not repeat' },
  { id: 'daily',    name: 'Every day' },
  { id: 'weekdays', name: 'Every weekday (Mon–Fri)' },
  { id: 'weekly',   name: 'Every week' },
  { id: 'biweekly', name: 'Every 2 weeks' },
  { id: 'monthly',  name: 'Every month, same date' }
];
const repName = id => (REPEATS.find(r => r.id === id) || REPEATS[0]).name;
function daysBetween(a, b) {
  const x = a.split('-').map(Number), y = b.split('-').map(Number);
  return Math.round((Date.UTC(y[0], y[1] - 1, y[2]) - Date.UTC(x[0], x[1] - 1, x[2])) / 86400000);
}
function occursOn(ev, ds) {
  if (ds < ev.date) return false;
  if (ev.skip && ev.skip.indexOf(ds) >= 0) return false;
  if (ev.until && ds > ev.until) return false;
  const rep = ev.rep || 'none';
  if (rep === 'none') return ds === ev.date;
  const dd = daysBetween(ev.date, ds);
  switch (rep) {
    case 'daily': return true;
    case 'weekdays': { const w = parseD(ds).getDay(); return w >= 1 && w <= 5; }
    case 'weekly': return dd % 7 === 0;
    case 'biweekly': return dd % 14 === 0;
    case 'monthly': return parseD(ev.date).getDate() === parseD(ds).getDate();
    default: return ds === ev.date;
  }
}
/* returns occurrences (copies) for a date, each carrying the date it lands on */
function eventsOn(ds) {
  const out = [];
  S.events.forEach(ev => { if (occursOn(ev, ds)) out.push(Object.assign({}, ev, { date: ds, on: ds })); });
  return out.sort((a, b) => a.s - b.s || a.e - b.e);
}
function upcoming(fromDs, nDays, limit) {
  const out = [];
  for (let i = 0; i < nDays && out.length < limit; i++) {
    const ds = shiftD(fromDs, i);
    eventsOn(ds).forEach(e => { if (out.length < limit) out.push(e); });
  }
  return out;
}
/* the single nearest event that has not started yet — skips anything on
   `fromDs` that is already in progress or already over (s <= now), so a
   meeting that started 10 minutes ago never shows as "upcoming". Every day
   after `fromDs` has no such filter — nothing there could have started yet. */
function nextUpcomingEvent(fromDs) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < 60; i++) {
    const ds = shiftD(fromDs, i);
    const evs = eventsOn(ds).filter(e => i > 0 || e.s > nowMin);
    if (evs.length) return evs[0];
  }
  return null;
}
const isRepeating = ev => ev && ev.rep && ev.rep !== 'none';
/* one-offs first, then repeats, each by start time */
const calOrder = evs => evs.slice().sort((a, b) =>
  (isRepeating(a) ? 1 : 0) - (isRepeating(b) ? 1 : 0) || a.s - b.s || a.e - b.e);
const minLabel = m => { const h = Math.floor(m / 60) % 24, mm = m % 60; const ap = h < 12 ? 'a' : 'p'; const hh = h % 12 || 12; return hh + ':' + pad(mm) + ap; };

/* ---------- quotas ----------
   A quota is a homework/milestone checklist item pinned to one date. It is
   deliberately not a Task (no taskId, never instantiated into a block) and is
   never shown outside the QUOTAS tab (and its mirror in the rail's own
   "today" list). This used to be called a "deadline"; the old "quota" name
   (per-task, per-day time apportioning) belonged to a different feature that
   has been removed outright — see §8/§13 in CONTEXT.md for the history. */
let quotaSeq = 0;
const quotasOn = ds => S.quotas.filter(x => x.date === ds).sort((a, b) => a.created - b.created);
function addQuota(ds, text) {
  const t = String(text || '').trim(); if (!t) return null;
  const item = { id: uid(), date: ds, text: t, note: '', done: false, created: Date.now() + (quotaSeq++) };
  S.quotas.push(item);
  return item;
}
function toggleQuota(id) { const it = S.quotas.find(x => x.id === id); if (it) it.done = !it.done; }
function deleteQuota(id) { S.quotas = S.quotas.filter(x => x.id !== id); }
/* label for the QUOTAS tab's 7-day window, e.g. "AUG 21 – 27" or, when the
   window crosses a month, "AUG 29 – SEP 4" */
function quotaRangeLabel(days) {
  const a = parseD(days[0]), b = parseD(days[days.length - 1]);
  const mA = MON[a.getMonth()].slice(0, 3).toUpperCase(), mB = MON[b.getMonth()].slice(0, 3).toUpperCase();
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? mA + ' ' + a.getDate() + ' – ' + b.getDate()
    : mA + ' ' + a.getDate() + ' – ' + mB + ' ' + b.getDate();
}

/* the calendar week (Sunday..Saturday) containing `ds` — distinct from the
   QUOTAS tab's "THIS WEEK", which means the 7 days starting today, not a
   Sunday-anchored calendar week. Kept private to this readout. */
function sundayOf(ds) {
  const d = parseD(ds);
  const start = new Date(d); start.setDate(d.getDate() - d.getDay());
  return fmtD(start);
}
/* DAILY's side panel (`.dayinfo`): per-task DONE (graded) time, TODAY and
   THIS (Sunday–Saturday) WEEK — sorted most time first, only tasks with at
   least one done block in the period. Time is *effective* time, not raw
   block length: it runs every done block through `effLen`, the same
   grade-weighting the score/rank arithmetic uses everywhere else — F/U hand
   the whole block back (0%), D half (50%), C/B/A count in full (100%). This
   matters here specifically: without it, a 2-hour block graded D would
   still read as 2 hours of "time done" on this task, which both
   overstates the task's tracked time and removes any cost to grading it
   low — the same block a moment ago cost you rank/score for exactly that
   half. Events never appear here (`taskBlocks` already excludes them) — see
   doneEventBreakdownOn/Week below for their own, separate readout; ungraded
   blocks aren't "done" yet, so they don't count either. */
function doneTaskBreakdownOn(ds) {
  const per = {};
  taskBlocks(dayOf(ds)).filter(b => b.done).forEach(b => { per[b.taskId] = (per[b.taskId] || 0) + effLen(b); });
  return Object.keys(per)
    .map(tid => ({ task: taskOf(tid), slots: per[tid] }))
    .filter(x => x.task)
    .sort((a, b) => b.slots - a.slots || a.task.name.localeCompare(b.task.name));
}
function doneTaskBreakdownWeek(ds) {
  const sun = sundayOf(ds);
  const per = {};
  for (let i = 0; i < 7; i++) {
    taskBlocks(dayOf(shiftD(sun, i))).filter(b => b.done).forEach(b => { per[b.taskId] = (per[b.taskId] || 0) + effLen(b); });
  }
  return Object.keys(per)
    .map(tid => ({ task: taskOf(tid), slots: per[tid] }))
    .filter(x => x.task)
    .sort((a, b) => b.slots - a.slots || a.task.name.localeCompare(b.task.name));
}
/* same idea, for events — grouped by `evId` (an event's identity survives a
   mid-series retitle; `evTitle` on any one block is only that block's
   point-in-time label, so the most recently-seen title wins). Events are
   never "done" — sealPastDays explicitly skips them (`if (isEvent(b) ||
   b.done) return;`) and there is no grading UI for them at all — so there is
   no done-filter here, every event block that exists on the day counts.
   `effLen(b)` still resolves correctly: it only discounts when `b.done` is
   true, which for an event block is never, so it always returns the block's
   raw length — same call as the task breakdown, for one shared code path,
   even though the discount never actually fires here. */
function doneEventBreakdownOn(ds) {
  const per = {}, name = {};
  dayOf(ds).blocks.filter(isEvent).forEach(b => {
    per[b.evId] = (per[b.evId] || 0) + effLen(b);
    name[b.evId] = b.evTitle || 'Event';
  });
  return Object.keys(per)
    .map(id => ({ title: name[id], slots: per[id] }))
    .sort((a, b) => b.slots - a.slots || a.title.localeCompare(b.title));
}
function doneEventBreakdownWeek(ds) {
  const sun = sundayOf(ds);
  const per = {}, name = {};
  for (let i = 0; i < 7; i++) {
    dayOf(shiftD(sun, i)).blocks.filter(isEvent).forEach(b => {
      per[b.evId] = (per[b.evId] || 0) + effLen(b);
      name[b.evId] = b.evTitle || 'Event';
    });
  }
  return Object.keys(per)
    .map(id => ({ title: name[id], slots: per[id] }))
    .sort((a, b) => b.slots - a.slots || a.title.localeCompare(b.title));
}
