"use strict";
/* =============== rendering =============== */
function div(cls, txt) { const d = document.createElement('div'); if (cls) d.className = cls; if (txt != null) d.textContent = txt; return d; }

function renderAll() {
  syncEventsOn(cur);
  renderRail(); renderDateNav(); renderAgenda();
  if (!$('#viewDay').hidden) renderDay();
  else if (!$('#viewCal').hidden) renderCal();
  else if (!$('#viewTasks').hidden) renderTasks();
  else renderStats();
}

function renderRail() {
  const d = dayOf(cur), sc = dayScore(d);
  $('#scoreVal').textContent = sc;
  const mt = $('#meter');
  mt.querySelector('i').style.width = sc + '%';
  mt.classList.toggle('win', sc >= 80);
  $('#scoreLbl').textContent = cur === todayStr() ? "TODAY'S SCORE" : prettyD(cur) + ' SCORE';
  const tb = taskBlocks(d);
  const done = tb.filter(b => b.done).length;
  $('#stBlocks').textContent = done + '/' + tb.length;
  const eff = bookedSlots(d), raw = rawBooked(d);
  $('#stBooked').textContent = eff ? durLabel(eff) : '0h';
  $('#stBooked').parentNode.title = raw !== eff
    ? durLabel(raw) + ' on the timeline, ' + durLabel(eff) + ' after F/U/D adjustments'
    : 'time that counts';
  const rk = dayRank(d);
  const ed = dayEdges(d);
  $('#stRank').textContent = rk ? rk.toFixed(1) : '0';
  $('#stRank').parentNode.title = durLabel(eff) + ' of the ' + durLabel(windowSlots(d)) +
    ' window (' + slotLabel(ed.sod) + '–' + slotLabel(ed.eod % SLOTS) + ')';
  $('#stGold').textContent = dayGold(d).toLocaleString();
  $('#stGold').parentNode.title = 'score ' + sc + ' × rank ' + rk.toFixed(1);
  $('#stStreak').textContent = computeStreak();
  /* phone bar mirrors the rail's headline numbers */
  $('#mScore').textContent = sc; $('#mRank').textContent = rk ? rk.toFixed(1) : '0';
  $('#mGold').textContent = dayGold(d).toLocaleString(); $('#mStreak').textContent = computeStreak();
  const bd = bestDay();
  $('#stBest').textContent = bd.gold ? bd.gold.toLocaleString() : '0';
  $('#stBest').parentNode.title = bd.date ? 'best gold: ' + bd.gold + ' on ' + prettyD(bd.date) : 'best gold so far';
  const left = tb.length - done;
  $('#scoreSub').textContent = !tb.length ? (d.blocks.length ? 'only events booked' : 'nothing planned yet')
    : !done ? tb.length + ' block' + (tb.length === 1 ? '' : 's') + ' waiting on a grade'
      : left ? gradedScore(d) + ' on what you graded · ' + left + ' left'
        : 'whole day graded';
  $('#btnSound').textContent = S.settings.sound ? '♪' : '✕';
  const past = isPastDay(cur);
  $('#btnQuick').disabled = past;
  $('#btnQuick').title = past ? 'past days are archived' : '';

  const pend = pendingBlocks();
  const gb = $('#btnGrade');
  gb.hidden = pend.length === 0;
  gb.textContent = '⚑ GRADE ' + pend.length + ' BLOCK' + (pend.length === 1 ? '' : 'S');

  const mb = $('#btnMenu');
  mb.title = 'Menu';
}

/* blocks whose time has passed but that are still ungraded (today only) */
function pendingBlocks() {
  if (cur !== todayStr()) return [];
  const n = nowSlotFloat();
  return taskBlocks(dayOf(cur)).filter(b => !b.done && b.start + b.len <= n).sort((a, b) => a.start - b.start);
}

function renderDateNav() {
  const t = todayStr();
  const lbl = cur === t ? 'TODAY' : cur === shiftD(t, -1) ? 'YESTERDAY' : cur === shiftD(t, 1) ? 'TOMORROW' : prettyD(cur);
  $('#dLabel').innerHTML = lbl + '<span>' + prettyD(cur) + '</span>';
  fitDateNav();
}

/* Every date-nav-style bar (DAILY's today bar, QUOTAS' date-range bar,
   CALENDAR's month bar) ends exactly where some tab button above it ends —
   measured rather than hard-coded, so it still lines up whatever the font
   does. `el` is always the first item in its toolbar, so its own left edge
   already coincides with the tab row's left edge; only the right edge needs
   fitting. */
function fitNavBar(el, tab, view) {
  if (!el || !tab || !view || view.hidden) return;
  el.style.width = '';
  if (isPhone()) return;   // phone layout: the bar just takes the whole row
  const w = Math.round(tab.getBoundingClientRect().right - el.getBoundingClientRect().left);
  if (w > 140) el.style.width = w + 'px';
}
function fitDateNav() { fitNavBar($('#viewDay .datenav'), $('.tab[data-view="cal"]'), $('#viewDay')); }
function fitAllNavBars() { fitDateNav(); }
const isPhone = () => window.matchMedia('(max-width:700px)').matches;

/* ---------------- THE DAY ----------------
   Rows are no longer a uniform height: everything outside the day's working
   window is collapsed to 0px by default (hidden, not squeezed) and only
   opens to full height when its SOD/EOD marker is clicked. That kills the
   old "y / 22" arithmetic, so the grid publishes its geometry here and every
   pixel calculation goes through slotY / slotAtY. */
let GEO = { tops: [], h: [], sod: SOD_DEF, eod: EOD_DEF, total: 0 };
let sodOpen = false, eodOpen = false;   // click a marker to reveal the hours beyond it

function buildGeo(d) {
  const e = dayEdges(d);
  const h = new Array(SLOTS), tops = new Array(SLOTS + 1);
  tops[0] = 0;
  for (let i = 0; i < SLOTS; i++) {
    h[i] = i < e.sod ? (sodOpen ? ROWH : 0) : i >= e.eod ? (eodOpen ? ROWH : 0) : ROWH;
    tops[i + 1] = tops[i] + h[i];
  }
  GEO = { tops: tops, h: h, sod: e.sod, eod: e.eod, total: tops[SLOTS] };
  return GEO;
}
function toggleEdge(which) {
  if (which === 'sod') sodOpen = !sodOpen; else eodOpen = !eodOpen;
  renderDay(); sfx('click');
}
/* pixel top of a (possibly fractional) slot */
function slotY(f) {
  const i = clamp(Math.floor(f), 0, SLOTS - 1);
  return GEO.tops[i] + (f - i) * GEO.h[i];
}
/* which slot a pixel offset lands in */
function slotAtY(y) {
  const t = GEO.tops;
  if (y <= 0) return 0;
  for (let i = 0; i < SLOTS; i++) if (y < t[i + 1]) return i;
  return SLOTS - 1;
}

function nowSlotFloat() { const n = new Date(); return (n.getHours() * 60 + n.getMinutes()) / 15; }

function renderDay() {
  renderTimeline();
  renderDayStats();
}

/* ---- side panel: per-event + per-task DONE time, TODAY / WEEK split,
   always for the real "today" (not whatever day `cur` is currently
   viewing) — see the QUOTAS tab's own "THIS WEEK" for the deliberately-
   different rolling-7-day reading. WEEK here is the Sunday–Saturday
   calendar week containing today. Events (red) are their own group, sorted
   most time first, always above tasks (blue, also sorted most time first)
   — two bands, not one interleaved-by-time list (see doneEventBreakdownOn/
   Week and doneTaskBreakdownOn/Week in 03-core.js for the grade-weighting
   and inclusion rules, which differ slightly: events have no "done"
   concept, so every existing event block counts). A period with nothing to
   show gets a small empty-state line instead of an empty box. Display-only
   — nothing here is clickable/editable. */
function renderDayStats() {
  const t = todayStr();
  renderDnList('dnTodayList', doneEventBreakdownOn(t), doneTaskBreakdownOn(t), eventsOn(t).filter(isAllDay));
  renderDnList('dnWeekList', doneEventBreakdownWeek(t), doneTaskBreakdownWeek(t));
}
function renderDnList(id, evRows, taskRows, allDay) {
  const L = $('#' + id); L.innerHTML = '';
  allDay = allDay || [];
  if (!allDay.length && !evRows.length && !taskRows.length) { L.appendChild(div('dnempty', 'nothing here yet')); return; }
  /* whole-day events (gold) sit above everything, title only — no time,
     since they book none and count toward nothing */
  allDay.forEach(ev => {
    const row = div('ttrow allday');
    row.innerHTML = '<span class="nm">' + esc(ev.title) + '</span>';
    L.appendChild(row);
  });
  evRows.forEach(r => {
    const row = div('ttrow evt');
    row.innerHTML = '<span class="nm">' + esc(r.title) + '</span><span class="amt">' + durLabel(r.slots) + '</span>';
    L.appendChild(row);
  });
  taskRows.forEach(r => {
    const row = div('ttrow');
    row.innerHTML = '<span class="nm">' + esc(r.task.name) + '</span><span class="amt">' + durLabel(r.slots) + '</span>';
    L.appendChild(row);
  });
}

function renderTimeline() {
  const g = $('#grid'); g.innerHTML = '';
  const d = dayOf(cur);
  const f = document.createDocumentFragment();
  const G = buildGeo(d);
  g.style.gridTemplateRows = G.h.map(x => x + 'px').join(' ');

  /* rules and the dimmed out-of-hours bands, all drawn from the geometry */
  const lines = div('lines');
  if (G.sod > 0) {
    const z = div('zone'); z.style.top = '0px'; z.style.height = G.tops[G.sod] + 'px'; lines.appendChild(z);
  }
  if (G.eod < SLOTS) {
    const z = div('zone'); z.style.top = G.tops[G.eod] + 'px'; z.style.height = (G.total - G.tops[G.eod]) + 'px'; lines.appendChild(z);
  }
  for (let i = 0; i <= SLOTS; i++) {
    if ((i < G.sod && !sodOpen) || (i >= G.eod && !eodOpen)) continue;   // collapsed — 0px, nothing to draw
    const ln = div(i % 4 === 0 ? 'hline' : 'qline');
    ln.style.top = G.tops[i] + 'px';
    lines.appendChild(ln);
  }
  f.appendChild(lines);

  for (let h = 0; h < 24; h++) {
    const tl = div('tl' + (h === 12 ? ' noon' : '') + (h * 4 < G.sod || h * 4 >= G.eod ? ' dim' : ''));
    tl.style.gridRow = (h * 4 + 1) + ' / span 4';
    tl.textContent = slotLabel(h * 4);
    f.appendChild(tl);
  }

  const sealed = isPastDay(cur);
  g.classList.toggle('sealed', sealed);
  if (!sealed) {
    const occ = occupancy(d, false);
    for (let i = 0; i < SLOTS; i++) {
      if (occ[i]) continue;
      const c = div('cell'); c.style.gridRow = String(i + 1);
      c.dataset.slot = String(i); c.dataset.t = slotLabel(i);
      f.appendChild(c);
    }
  }

  const nowF = nowSlotFloat(), isToday = cur === todayStr();
  d.blocks.slice().sort((a, b) => a.start - b.start).forEach(b => {
    const el = blockEl(b, isToday && nowF >= b.start && nowF < b.start + b.len);
    if (isToday && !isEvent(b) && !b.done && b.start + b.len <= nowF) el.classList.add('pending');
    f.appendChild(el);
  });

  if (!d.blocks.length) {
    const e = div('emptyday', sealed ? 'nothing was booked on this day' : 'empty deck — drag anywhere to deal a block');
    e.style.top = slotY(G.sod + 8) + 'px';
    f.appendChild(e);
  }

  /* the working window's edges — click either badge to reveal (or re-hide)
     the hours beyond it. Icon sits at the left of the line, like the now-line's. */
  [['SOD', G.sod, 'sod', sodOpen], ['EOD', G.eod, 'eod', eodOpen]].forEach(pair => {
    const m = div('edge');
    m.dataset.edge = pair[2];
    m.style.top = slotY(pair[1]) + 'px';
    m.innerHTML = '<b class="outline" data-act="toggle">' + pair[0] + (pair[3] ? ' ▾' : ' ▸') + '</b><i></i>';
    m.title = (pair[0] === 'SOD' ? 'start of day — ' + slotLabel(G.sod) : 'end of day — ' + slotLabel(G.eod % SLOTS)) +
      '  ·  click to ' + (pair[3] ? 'hide' : 'show') + ' the hours ' + (pair[0] === 'SOD' ? 'before' : 'after') + ' it';
    f.appendChild(m);
  });

  if (isToday) {
    const nl = div('nowline'); nl.style.top = slotY(nowF) + 'px';
    nl.innerHTML = '<i></i><b class="outline">' + esc(minLabel(new Date().getHours() * 60 + new Date().getMinutes())) + '</b>';
    f.appendChild(nl);
  }

  g.appendChild(f);
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function blockEl(b, isNow) {
  const ev = isEvent(b);
  const sealed = isPastDay(cur);
  const el = div('blk' + (b.len < 2 ? ' tiny' : '') + (!ev && b.done ? ' done' : '') + (isNow ? ' now' : '') + (ev ? ' evt' : '') + (isNeg(b) ? ' neg' : '') + (sealed ? ' locked' : ''));
  el.style.gridRow = (b.start + 1) + ' / span ' + b.len;
  el.style.setProperty('--c', ev ? C_EVENT : C_BLOCK);
  el.dataset.id = b.id;
  el.appendChild(div('t', taskLabel(b)));
  el.appendChild(div('s', slotLabel(b.start) + '–' + slotLabel(b.start + b.len)));
  if (ev) {
    el.appendChild(div('evtagt', 'EVENT'));
  } else if (b.done) {
    const gr = div('grade outline', b.grade);
    if (!isNeg(b)) gr.style.background = colOf(b.grade);   // N styles itself (.blk.neg .grade)
    if (!sealed) gr.dataset.act = 'tick';
    el.appendChild(gr);
  } else {
    const tk = div('tick', '✓'); tk.dataset.act = 'tick'; tk.title = 'grade this block';
    el.appendChild(tk);
  }
  if (!sealed) { const rz = div('rz'); rz.dataset.act = 'rz'; el.appendChild(rz); }
  return el;
}

/* ---------------- painting & dragging ---------------- */
let paint = null, resizing = null;
function slotFromEvent(e) { const r = $('#grid').getBoundingClientRect(); return slotAtY(e.clientY - r.top); }
function preview(a, b) {
  let p = $('#pv');
  if (!p) { p = div('paintpv'); p.id = 'pv'; p.innerHTML = '<b></b>'; $('#grid').appendChild(p); }
  const s = Math.min(a, b), e = Math.max(a, b) + 1;
  p.style.top = slotY(s) + 'px'; p.style.height = (slotY(e) - slotY(s)) + 'px';
  p.querySelector('b').textContent = slotLabel(s) + ' – ' + slotLabel(e) + '  (' + durLabel(e - s) + ')';
  return [s, e];
}
function killPreview() { const p = $('#pv'); if (p) p.remove(); }

/* Touch (phones, tablets): the timeline belongs to scrolling. A finger only
   acts on a TAP — down and up without moving — and then does what a mouse
   click would: open the block, grade it, open the event, toggle SOD/EOD, or
   add a 1-hour block on empty time. Dragging never paints or resizes; times
   change in the block editor instead. The browser fires pointercancel the
   moment it takes a drag over for scrolling, which drops the pending tap. */
let tap = null;
function tapAct(target) {
  const edgeB = target.closest('.edge b[data-act="toggle"]');
  if (edgeB) { toggleEdge(edgeB.closest('.edge').dataset.edge); return; }
  const bEl = target.closest('.blk');
  if (bEl) {
    const bb = findBlock(cur, bEl.dataset.id);
    if (bb && isEvent(bb)) { openTodayEvent(bb); return; }
    if (target.dataset.act === 'tick') { openGrade(bEl.dataset.id); return; }
    openBlockEditor(bEl.dataset.id); return;
  }
  if (isPastDay(cur)) return;
  const cell = target.closest('.cell'); if (!cell) return;
  const slot = +cell.dataset.slot;
  openBlockEditor(null, slot, Math.min(4, SLOTS - slot));
}
function bindGrid() {
  const g = $('#grid');
  g.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') { tap = { id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target }; return; }
    if (e.button !== 0) return;
    const edgeB = e.target.closest('.edge b[data-act="toggle"]');
    if (edgeB) { e.preventDefault(); toggleEdge(edgeB.closest('.edge').dataset.edge); return; }
    const bEl = e.target.closest('.blk');
    if (bEl) {
      const bb = findBlock(cur, bEl.dataset.id);
      const act = e.target.dataset.act;
      if (bb && isEvent(bb) && act !== 'rz') { e.preventDefault(); openTodayEvent(bb); return; }
      if (act === 'tick') { e.preventDefault(); openGrade(bEl.dataset.id); return; }
      if (act === 'rz') {
        if (isPastDay(cur)) return;
        e.preventDefault();
        const b = findBlock(cur, bEl.dataset.id);
        if (b) { resizing = { id: b.id, start: b.start, len: b.len }; g.setPointerCapture(e.pointerId); preview(b.start, b.start + b.len - 1); }
        return;
      }
      openBlockEditor(bEl.dataset.id); return;
    }
    if (isPastDay(cur)) return;
    const cell = e.target.closest('.cell'); if (!cell) return;
    const slot = +cell.dataset.slot;
    e.preventDefault();
    paint = { a: slot, b: slot }; g.setPointerCapture(e.pointerId);
    preview(slot, slot); sfx('tick');
  });
  g.addEventListener('pointermove', e => {
    if (tap && e.pointerId === tap.id && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap = null;   // it's a drag: let it scroll
    if (paint) { const s = slotFromEvent(e); if (s !== paint.b) { paint.b = s; preview(paint.a, paint.b); sfx('tick', Math.abs(paint.b - paint.a)); } }
    else if (resizing) { const s = Math.max(resizing.start, slotFromEvent(e)); preview(resizing.start, s); resizing.cur = s; }
  });
  g.addEventListener('pointerup', e => {
    if (tap && e.pointerId === tap.id) {
      const t = tap; tap = null;
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) <= 10) tapAct(t.target);
      return;
    }
    if (paint) {
      const s = Math.min(paint.a, paint.b), en = Math.max(paint.a, paint.b) + 1;
      paint = null; killPreview();
      openBlockEditor(null, s, en - s);
    } else if (resizing) {
      const newLen = (resizing.cur == null ? resizing.len : resizing.cur - resizing.start + 1);
      const r = resizing; resizing = null; killPreview();
      if (newLen !== r.len) commitResize(r.id, newLen); else renderDay();
    }
  });
  g.addEventListener('pointercancel', () => { tap = null; paint = null; resizing = null; killPreview(); });
}
function commitResize(id, newLen) {
  const d = getDay(cur), b = d.blocks.find(x => x.id === id); if (!b) return;
  pushUndo();
  d.blocks = d.blocks.filter(x => x.id !== id);
  carve(d, b.start, b.start + newLen);
  b.len = clamp(newLen, 1, SLOTS - b.start);
  d.blocks.push(b); d.blocks.sort((x, y) => x.start - y.start);
  save(); renderAll(); sfx('place');
}

/* ---------------- modals ---------------- */
function openModal(html, cls) {
  /* Replace the modal node outright. Handlers attached to #modal itself (the
     grade cards, the category keys) would otherwise survive closeModal and
     stack up — a second grade click would fire the previous modal's handler
     too and grade the wrong block as well. */
  const old = $('#modal');
  const fresh = old.cloneNode(false);
  old.parentNode.replaceChild(fresh, old);
  fresh.className = 'modal' + (cls ? ' ' + cls : '');
  fresh.innerHTML = html;
  $('#scrim').hidden = false;
  const fi = fresh.querySelector('[data-autofocus]');
  if (fi) setTimeout(() => { fi.focus(); if (fi.select) fi.select(); }, 40);
  sfx('click');
}
function closeModal() { $('#scrim').hidden = true; $('#modal').innerHTML = ''; gradeKeys = null; }

function timeOptions(sel, from, to) {
  let o = '';
  for (let i = from; i <= to; i++) o += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + slotLabel(i) + '</option>';
  return o;
}

function taskOptions(sel) {
  const list = S.tasks.filter(t => !t.hidden || t.id === sel);
  let o = '';
  /* leaving this alone is a choice: no task = a NEGATIVE block */
  o += '<option value=""' + (!sel ? ' selected' : '') + '>— No task —</option>';
  o += list.map(t => '<option value="' + t.id + '"' + (t.id === sel ? ' selected' : '') + '>' + esc(t.name) + (t.hidden ? '  (hidden)' : '') + '</option>').join('');
  o += '<option value="__new">＋ Create new task…</option>';
  return o;
}

function openBlockEditor(id, start, len) {
  const b = id ? findBlock(cur, id) : null;
  if (b && isEvent(b)) { openTodayEvent(b); return; }
  if (isPastDay(cur)) { if (b) openArchivedBlock(b); else toast('Past days are archived'); return; }
  const st = b ? b.start : start, ln = b ? b.len : (len || 4);
  /* nothing is preselected for a new block — never picking a task is how a
     NEGATIVE block is made, so a lone task can't be filled in for you */
  const sel = b && !isNeg(b) ? b.taskId : '';
  openModal(
    '<h3>' + (b ? '✎ EDIT BLOCK' : '★ NEW BLOCK') + '<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="field"><label>TASK</label><select class="inp" id="fT">' + taskOptions(sel) + '</select></div>' +
    '<div class="field" id="newWrap" hidden><label>NEW TASK NAME</label><input class="inp" id="fNew" placeholder="e.g. Deep work"></div>' +
    '<div class="hint neghint" id="negHint" hidden>Selecting this creates a <b>NEGATIVE</b> block, stamped <b>N</b>, which is worse than an F.</div>' +
    '<div class="two"><div class="field"><label>START</label><select class="inp" id="fS">' + timeOptions(st, 0, 95) + '</select></div>' +
    '<div class="field"><label>END</label><select class="inp" id="fE">' + timeOptions(st + ln, 1, 96) + '</select></div></div>' +
    '<div class="modrow">' + (b ? '<button class="btn red" data-del>DELETE</button>' : '') +
    (b && b.done && !isNeg(b) ? '<button class="btn" data-undone>UNGRADE</button>' : '') +
    '<div class="spacer"></div><button class="btn green" data-save>' + (b ? 'SAVE' : 'ADD BLOCK') + '</button></div>'
  );
  const M = $('#modal');
  const selEl = M.querySelector('#fT'), newWrap = M.querySelector('#newWrap'), newEl = M.querySelector('#fNew');
  const syncNew = () => {
    const isNew = selEl.value === '__new';
    newWrap.hidden = !isNew;
    M.querySelector('#negHint').hidden = selEl.value !== '';
    M.querySelector('[data-save]').classList.toggle('negbtn', selEl.value === '');
    if (isNew) setTimeout(() => newEl.focus(), 30);
  };
  selEl.onchange = syncNew;
  syncNew();
  M.querySelector('#fS').addEventListener('change', () => {
    const s2 = +M.querySelector('#fS').value, e2 = +M.querySelector('#fE').value;
    if (e2 <= s2) M.querySelector('#fE').value = String(Math.min(96, s2 + 1));
  });
  const commit = () => {
    let taskId = selEl.value;
    if (taskId === '__new') {
      const nm = newEl.value.trim();
      if (!nm) { toast('Give the new task a name'); newEl.focus(); return; }
      pushUndo();
      taskId = addTask(nm).id;
    } else pushUndo();
    const neg = !taskId;
    const s2 = +M.querySelector('#fS').value;
    let e2 = +M.querySelector('#fE').value;
    if (e2 <= s2) e2 = s2 + 1;
    const d = getDay(cur);
    if (b) {
      d.blocks = d.blocks.filter(x => x.id !== b.id);
      carve(d, s2, e2);
      Object.assign(b, { start: s2, len: e2 - s2 });
      if (neg) { delete b.taskId; delete b.auto; Object.assign(b, { neg: true, done: true, grade: 'N' }); }
      else if (isNeg(b)) { delete b.neg; Object.assign(b, { taskId: taskId, done: false, grade: null }); }   // turned back into a real task block — needs a real grade
      else b.taskId = taskId;
      d.blocks.push(b); d.blocks.sort((x, y) => x.start - y.start);
    } else {
      addBlock(cur, s2, e2 - s2, taskId);
    }
    save(); closeModal(); renderAll(); sfx(neg ? 'fail' : 'place');
  };
  M.querySelector('[data-save]').onclick = commit;
  if (newEl) newEl.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
  const del = M.querySelector('[data-del]');
  if (del) del.onclick = () => { pushUndo(); const d = getDay(cur); d.blocks = d.blocks.filter(x => x.id !== b.id); save(); closeModal(); renderAll(); sfx('back'); };
  const un = M.querySelector('[data-undone]');
  if (un) un.onclick = () => { pushUndo(); b.done = false; b.grade = null; save(); closeModal(); renderAll(); sfx('back'); };
  M.querySelector('[data-x]').onclick = closeModal;
}

/* A block on a day that has already ended: look, don't touch. */
function openArchivedBlock(b) {
  const g = gradeOf(b.grade);
  openModal(
    '<h3>🔒 ARCHIVED<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="field"><label>TASK</label><input class="inp ro" value="' + esc(taskLabel(b)) + '" readonly></div>' +
    '<div class="field"><label>WHEN</label><input class="inp ro" value="' + esc(rangeLabel(b.start, b.len)) + '" readonly></div>' +
    '<div class="li"><span>Grade</span><span class="amt" style="color:' + g.color + '">' + g.g + ' — ' + g.label + '</span></div>' +
    '<div class="li" style="margin-top:6px"><span>Counts toward the day at</span><span class="amt">' + g.pts + '%</span></div>' +
    '<div class="hint" style="margin-top:10px">' + prettyD(cur) + ' is over, so this is a record now — grades, times and notes are fixed. Today is still fully editable, even hours that have already passed.</div>' +
    '<div class="modrow"><div class="spacer"></div><button class="btn gold" data-x>CLOSE</button></div>'
  );
  $('#modal').querySelectorAll('[data-x]').forEach(x => x.onclick = closeModal);
}

/* An event block seen from DAILY. Every event is always a block now — no more
   "pull" step — so this is purely read-only: rename/retime/repeat happen in
   CALENDAR, the only thing DAILY can do is cancel it. */
function openTodayEvent(b) {
  const base = S.events.find(e => e.id === b.evId);
  const timeTxt = slotLabel(b.start) + ' – ' + slotLabel(b.start + b.len);
  openModal(
    '<h3>EVENT<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="field"><label>EVENT</label><input class="inp ro" value="' + esc(b.evTitle || 'Event') + '" readonly></div>' +
    '<div class="field"><label>NOTE</label><textarea class="inp ro" readonly>' + esc(b.note || '') + '</textarea></div>' +
    '<div class="hint" style="margin-bottom:6px">' + timeTxt + ' · ' + prettyD(cur) +
    '<br>Events are owned by CALENDAR — rename, retime or change the repeat over there.</div>' +
    '<div class="modrow"><button class="btn red" data-cancel>CANCEL</button>' +
    '<div class="spacer"></div><button class="btn" data-x>CLOSE</button></div>'
  );
  const M = $('#modal');
  M.querySelectorAll('[data-x]').forEach(x => x.onclick = closeModal);
  M.querySelector('[data-cancel]').onclick = () => {
    if (isPastDay(cur)) { toast('Past days are archived'); return; }
    pushUndo();
    if (base) {
      if (isRepeating(base)) base.skip = (base.skip || []).concat([cur]);
      else S.events = S.events.filter(e => e.id !== b.evId);
    }
    syncAllEventBlocks();
    save(); closeModal(); renderAll(); sfx('back');
    toast(base && isRepeating(base) ? 'Cancelled just today' : 'Event cancelled');
  };
}

/* ---------------- grading ---------------- */
function openGrade(id) {
  const b = findBlock(cur, id); if (!b) return;
  if (isEvent(b)) { openTodayEvent(b); return; }
  if (isPastDay(cur)) { openArchivedBlock(b); return; }
  if (b.done) { openBlockEditor(id); return; }
  openModal(
    '<h3>HOW DID IT GO?<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="li" style="margin-bottom:10px"><span>' + esc(taskLabel(b)) + '</span><span class="amt" style="font-size:14px;color:#9fb0ad">' + rangeLabel(b.start, b.len) + '</span></div>' +
    '<div class="grades">' + GRADES.map((g, i) =>
      '<div class="gcard" data-g="' + g.g + '" style="--c:' + g.color + '"><div class="k">' + (i + 1) + '</div><div class="g">' + g.g + '</div><div class="l">' + g.label + '</div></div>'
    ).join('') + '</div>' +
    '<div class="hint" style="margin-top:10px">F is honest, not a punishment. Grading is the whole point — it turns a plan into a record.</div>',
    'wide'
  );
  $('#modal').addEventListener('click', e => {
    const c = e.target.closest('[data-g]'); if (!c) return;
    applyGrade(b, c.dataset.g);
  });
  $('#modal').querySelector('[data-x]').onclick = closeModal;
  gradeKeys = b;
}
let gradeKeys = null;

function applyGrade(b, g) {
  if (isNeg(b)) return;   // N is permanent
  pushUndo();
  b.done = true; b.grade = g;
  save(); closeModal(); gradeKeys = null;
  renderAll();
  playScore(b);
  const d = dayOf(cur);
  if (taskBlocks(d).length && taskBlocks(d).every(x => x.done)) {
    setTimeout(() => { sfx('win'); burst('#ffc93d', 42); toast('Whole day graded — open DAY RECAP'); }, 950);
  }
}

function playScore(b) {
  const g = gradeOf(b.grade);
  const fx = $('#fx'); fx.hidden = false;
  fx.innerHTML = '<div style="text-align:center">' +
    '<div class="fxgrade" style="--c:' + g.color + '">' + g.g + '</div>' +
    '<div class="fxlabel">' + esc(taskLabel(b)) + ' — ' + g.label + '</div></div>';
  if (g.g === 'A') { document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 400); }
  sfx(g.pts ? 'score' : 'fail');
  burst(g.color, g.g === 'A' ? 34 : g.g === 'F' ? 8 : 18);
  const sb = $('.scorebox'); sb.classList.add('pop'); setTimeout(() => sb.classList.remove('pop'), 220);
  setTimeout(() => { fx.hidden = true; fx.innerHTML = ''; }, 900);
}

function burst(color, n) {
  const host = $('#parts');
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  for (let i = 0; i < n; i++) {
    const p = div('pt');
    const a = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 340;
    p.style.left = cx + 'px'; p.style.top = cy + 'px';
    p.style.background = color;
    p.style.setProperty('--dx', Math.cos(a) * dist + 'px');
    p.style.setProperty('--dy', (Math.sin(a) * dist + 180) + 'px');
    p.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg');
    p.style.animationDelay = (Math.random() * .12) + 's';
    host.appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }
}
