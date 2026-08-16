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

const GRADES = [
  { g: 'A', pts: 100, color: '#35bd86', label: 'superbly done' },
  { g: 'B', pts: 80,  color: '#0093ff', label: 'solid' },
  { g: 'C', pts: 60,  color: '#ffc93d', label: 'partial' },
  { g: 'D', pts: 35,  color: '#ff8c33', label: 'barely' },
  { g: 'F', pts: 0,   color: '#fe5f55', label: "didn't do it" }
];
const ptsOf = g => { const x = GRADES.find(v => v.g === g); return x ? x.pts : 0; };
const colOf = g => { const x = GRADES.find(v => v.g === g); return x ? x.color : '#888'; };
const gradeOf = g => GRADES.find(v => v.g === g) || GRADES[GRADES.length - 1];

/* Two kinds of block. A TASK block is an instance of one of your tasks — blue,
   graded, and it drives the score. An EVENT block is a calendar event pulled
   into the day — red, never graded, counts toward booked time and rank only. */
const C_BLOCK = '#0093ff';
const C_EVENT = '#e2564c';
const isEvent = b => !!b.evId;

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
  stats: {},
  settings: { sound: true, dayView: 'timeline' }
});
let S = BLANK();
let cur = todayStr();          // date shown in THE DAY
let calM = new Date();         // month shown in CALENDAR
let undoStack = [];

const getDay = ds => (S.days[ds] || (S.days[ds] = { blocks: [] }));
const dayOf = ds => S.days[ds] || { blocks: [] };

/* ---------- scoring ----------
   Score is 0–100: how well you used the time you booked.
   Every block is weighted by its length, ungraded time counts as 0. */
const taskBlocks = d => d.blocks.filter(b => !isEvent(b));
const bookedSlots = d => d.blocks.reduce((t, b) => t + b.len, 0);          // events included
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
/* RANK 0–10: how full the day is. A full 12h of booked blocks = 10. */
const DAY_HOURS = 12;
function dayRank(d) {
  const hrs = bookedSlots(d) / 4;
  return Math.min(10, Math.round(hrs / DAY_HOURS * 100) / 10);
}
/* GOLD 0–1000 = SCORE × RANK */
const dayGold = d => Math.round(dayScore(d) * dayRank(d));
const METRICS = {
  score: { key: 'score', label: 'SCORE', max: 100,  color: '#0093ff', fmt: v => Math.round(v) },
  rank:  { key: 'rank',  label: 'RANK',  max: 10,   color: '#e2564c', fmt: v => (Math.round(v * 10) / 10).toFixed(1) },
  gold:  { key: 'gold',  label: 'GOLD',  max: 1000, color: '#ffc93d', fmt: v => Math.round(v).toLocaleString() }
};

const hasActivity = ds => (S.days[ds] ? S.days[ds].blocks : []).some(b => b.done && !isEvent(b));
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

function snapshot() { return JSON.stringify({ v: 4, tasks: S.tasks, days: S.days, events: S.events, templates: S.templates, stats: S.stats, settings: S.settings }); }

function save() {
  try { localStorage.setItem(LS_KEY, snapshot()); } catch (e) { /* private mode */ }
  queueFileSave();
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
    stats: Object.assign(b.stats, o.stats || {}),
    settings: Object.assign(b.settings, o.settings || {})
  };
  stripCats();
  if (o.v !== 4) migrateToTasks();
  return true;
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
  return t ? t.name : 'Deleted task';
}
function addTask(name) {
  const t = { id: 'tk' + uid() + (taskSeq++), name: String(name || 'New task').trim() || 'New task', hidden: false, created: Date.now() + taskSeq };
  S.tasks.push(t);
  return t;
}
function taskStats(id) {
  let slots = 0, count = 0;
  Object.keys(S.days).forEach(k => (S.days[k].blocks || []).forEach(b => {
    if (b.taskId === id) { slots += b.len; count++; }
  }));
  return { slots: slots, count: count };
}
const visibleTasks = () => S.tasks.filter(t => !t.hidden);

/* ---------- block geometry ---------- */
function occupancy(d, alsoEvents, ds) {
  const a = new Array(SLOTS).fill(null);
  d.blocks.forEach(b => { for (let i = b.start; i < b.start + b.len && i < SLOTS; i++) a[i] = b.id; });
  if (alsoEvents) eventsOn(ds).forEach(ev => { for (let i = Math.floor(ev.s / 15); i < Math.ceil(ev.e / 15) && i < SLOTS; i++) if (!a[i]) a[i] = 'EV'; });
  return a;
}
function carve(d, start, end) {
  const out = [];
  d.blocks.forEach(b => {
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
/* pull a calendar event into the day as a red, ungradeable block */
function addEventBlock(ds, ev) {
  const start = clamp(Math.floor(ev.s / 15), 0, 95);
  const end = clamp(Math.max(start + 1, Math.ceil(ev.e / 15)), 1, 96);
  const d = getDay(ds);
  carve(d, start, end);
  const b = { id: uid(), start: start, len: end - start, evId: ev.id, evTitle: ev.title, note: ev.note || '', done: false, grade: null };
  d.blocks.push(b);
  d.blocks.sort((x, y) => x.start - y.start);
  return b;
}
const isPulled = (ds, evId) => dayOf(ds).blocks.some(b => b.evId === evId);
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
const isRepeating = ev => ev && ev.rep && ev.rep !== 'none';
const minLabel = m => { const h = Math.floor(m / 60) % 24, mm = m % 60; const ap = h < 12 ? 'a' : 'p'; const hh = h % 12 || 12; return hh + ':' + pad(mm) + ap; };
