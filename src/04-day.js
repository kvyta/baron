"use strict";
/* =============== rendering =============== */
function div(cls, txt) { const d = document.createElement('div'); if (cls) d.className = cls; if (txt != null) d.textContent = txt; return d; }

function renderAll() {
  renderRail(); renderDateNav();
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
  $('#stBooked').textContent = bookedSlots(d) ? durLabel(bookedSlots(d)) : '0h';
  const rk = dayRank(d);
  $('#stRank').textContent = rk ? rk.toFixed(1) : '0';
  $('#stRank').parentNode.title = durLabel(bookedSlots(d)) + ' booked of ' + DAY_HOURS + 'h';
  $('#stGold').textContent = dayGold(d).toLocaleString();
  $('#stGold').parentNode.title = 'score ' + sc + ' × rank ' + rk.toFixed(1);
  $('#stStreak').textContent = computeStreak();
  const bd = bestDay();
  $('#stBest').textContent = bd.gold ? bd.gold.toLocaleString() : '0';
  $('#stBest').parentNode.title = bd.date ? 'best gold: ' + bd.gold + ' on ' + prettyD(bd.date) : 'best gold so far';
  const left = tb.length - done;
  $('#scoreSub').textContent = !tb.length ? (d.blocks.length ? 'only events booked' : 'nothing planned yet')
    : !done ? tb.length + ' block' + (tb.length === 1 ? '' : 's') + ' waiting on a grade'
      : left ? gradedScore(d) + ' on what you graded · ' + left + ' left'
        : 'whole day graded';
  $('#btnSound').textContent = S.settings.sound ? '♪' : '✕';

  const pend = pendingBlocks();
  const gb = $('#btnGrade');
  gb.hidden = pend.length === 0;
  gb.textContent = '⚑ GRADE ' + pend.length + ' BLOCK' + (pend.length === 1 ? '' : 'S');

  /* disk auto-save lives in the ☰ menu now — flag it here only if it needs you */
  const mb = $('#btnMenu');
  mb.classList.toggle('need', fsStatus === 'need');
  mb.title = fsStatus === 'on' ? 'Menu — auto-saving to ' + (fileHandle ? fileHandle.name : 'disk')
    : fsStatus === 'need' ? 'Menu — auto-save paused, click to resume' : 'Menu';
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

/* the date selector ends where the CALENDAR tab above it ends. measured rather
   than hard-coded, so it still lines up whatever the font does. */
function fitDateNav() {
  const cal = $('.tab[data-view="cal"]'), dn = $('#viewDay .datenav');
  if (!cal || !dn || $('#viewDay').hidden) return;
  dn.style.width = '';
  const w = Math.round(cal.getBoundingClientRect().right - dn.getBoundingClientRect().left);
  if (w > 140) dn.style.width = w + 'px';
}

/* ---------------- THE DAY ---------------- */
function nowSlotFloat() { const n = new Date(); return (n.getHours() * 60 + n.getMinutes()) / 15; }

function renderDay() {
  const isList = S.settings.dayView === 'list';
  $('#gridwrap').hidden = isList;
  $('#listwrap').hidden = !isList;
  $$('#viewDay .seg').forEach(s => s.classList.toggle('on', (s.dataset.dv === 'list') === isList));
  if (isList) renderList(); else renderTimeline();
}

/* ---- LIST: every booked block, top to bottom, nothing else ---- */
function renderList() {
  const L = $('#list'); L.innerHTML = '';
  const d = dayOf(cur);
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const isToday = cur === todayStr();

  const items = [];
  d.blocks.forEach(b => items.push({ k: 'b', s: b.start * 15, e: (b.start + b.len) * 15, b: b }));
  eventsOn(cur).filter(ev => !isPulled(cur, ev.id)).forEach(ev => items.push({ k: 'e', s: ev.s, e: ev.e, ev: ev }));
  items.sort((x, y) => x.s - y.s || x.e - y.e);

  const hdr = div('lhdr');
  hdr.innerHTML = '<b>' + prettyD(cur) + '</b><span>' + items.length + ' ITEM' + (items.length === 1 ? '' : 'S') + '  ·  ' + (bookedSlots(d) ? durLabel(bookedSlots(d)) : '0m') + ' BOOKED</span>';
  L.appendChild(hdr);

  if (!items.length) {
    const e = div('lempty', 'nothing booked — hit + BLOCK');
    e.style.cursor = 'pointer';
    e.onclick = () => openBlockEditor(null, isToday ? clamp(Math.floor(nowSlotFloat()), 0, 92) : 36, 4);
    L.appendChild(e);
    return;
  }

  let prevEnd = null;
  items.forEach(it => {
    if (prevEnd != null && it.s - prevEnd >= 15) {
      const gs = prevEnd, ge = it.s;
      const gap = div('lgap');
      gap.innerHTML = '<i></i><span>' + durLabel((ge - gs) / 15) + ' free</span><i></i>';
      gap.onclick = () => openBlockEditor(null, Math.floor(gs / 15), Math.max(1, (ge - gs) / 15));
      L.appendChild(gap);
    }
    if (it.e > (prevEnd || 0)) prevEnd = it.e;

    if (it.k === 'e') {
      const r = div('lrow evt');
      r.innerHTML = '<span class="tm">' + minLabel(it.s) + ' – ' + minLabel(it.e) + '</span>' +
        '<span class="ti">' + esc(it.ev.title) + '</span>' +
        '<span class="du">' + durLabel((it.e - it.s) / 15) + '</span>' +
        '<span class="evtag">NOT PULLED</span>';
      r.onclick = () => openTodayEvent(it.ev, false);
      L.appendChild(r);
      return;
    }

    const b = it.b;
    if (isEvent(b)) {
      const r = div('lrow evt');
      r.innerHTML = '<span class="tm">' + slotLabel(b.start) + ' – ' + slotLabel(b.start + b.len) + '</span>' +
        '<span class="ti">' + esc(taskLabel(b)) + (b.note ? '<em>' + esc(b.note) + '</em>' : '') + '</span>' +
        '<span class="du">' + durLabel(b.len) + '</span>' +
        '<span class="evtag">EVENT</span>';
      r.onclick = () => openTodayEvent(b, true);
      L.appendChild(r);
      return;
    }
    const pending = isToday && !b.done && it.e <= nowM;
    const nowRow = isToday && nowM >= it.s && nowM < it.e;
    const r = div('lrow' + (b.done ? ' done' : '') + (pending ? ' pending' : '') + (nowRow ? ' nowrow' : ''));
    r.style.setProperty('--c', C_BLOCK);
    r.dataset.id = b.id;
    r.innerHTML = '<span class="tm">' + slotLabel(b.start) + ' – ' + slotLabel(b.start + b.len) + '</span>' +
      '<span class="ti">' + esc(taskLabel(b)) + (b.note ? '<em>' + esc(b.note) + '</em>' : '') + '</span>' +
      '<span class="du">' + durLabel(b.len) + '</span>' +
      (b.done
        ? '<span class="gr outline" data-act="tick" style="background:' + colOf(b.grade) + '">' + b.grade + '</span>'
        : '<span class="tick" data-act="tick" title="grade this block">✓</span>');
    r.onclick = e => { if (e.target.dataset.act === 'tick') openGrade(b.id); else openBlockEditor(b.id); };
    L.appendChild(r);
  });
}

function renderTimeline() {
  const g = $('#grid'); g.innerHTML = '';
  const d = dayOf(cur);
  const f = document.createDocumentFragment();

  const lines = div('lines'); f.appendChild(lines);

  for (let h = 0; h < 24; h++) {
    const tl = div('tl' + (h === 12 ? ' noon' : ''));
    tl.style.gridRow = (h * 4 + 1) + ' / span 4';
    tl.textContent = slotLabel(h * 4);
    f.appendChild(tl);
  }

  const occ = occupancy(d, false);
  for (let i = 0; i < SLOTS; i++) {
    if (occ[i]) continue;
    const c = div('cell'); c.style.gridRow = String(i + 1);
    c.dataset.slot = String(i); c.dataset.t = slotLabel(i);
    f.appendChild(c);
  }

  const nowF = nowSlotFloat(), isToday = cur === todayStr();
  d.blocks.slice().sort((a, b) => a.start - b.start).forEach(b => {
    const el = blockEl(b, isToday && nowF >= b.start && nowF < b.start + b.len);
    if (isToday && !isEvent(b) && !b.done && b.start + b.len <= nowF) el.classList.add('pending');
    f.appendChild(el);
  });

  if (!d.blocks.length) { const e = div('emptyday', 'empty deck — drag anywhere to deal a block'); f.appendChild(e); }

  /* event rail */
  const rail = div('rail3'); rail.style.gridRow = '1 / -1';
  const evs = eventsOn(cur).filter(ev => !isPulled(cur, ev.id));
  const lanes = [];
  evs.forEach(ev => {
    let li = 0; while (lanes[li] != null && lanes[li] > ev.s) li++;
    lanes[li] = ev.e;
    const c = div('evc');
    c.style.setProperty('--c', C_EVENT);
    c.style.top = (ev.s / 15 * ROWH) + 'px';
    c.style.height = Math.max(20, (ev.e - ev.s) / 15 * ROWH - 2) + 'px';
    c.style.left = (8 + li * 10) + 'px';
    c.style.zIndex = String(5 + li);
    c.dataset.ev = ev.id;
    c.innerHTML = '<b>' + esc(minLabel(ev.s)) + '</b>' + esc(ev.title);
    rail.appendChild(c);
  });
  if (!evs.length) { const n = div('', 'no events to pull'); n.style.cssText = 'position:absolute;top:8px;left:10px;font-size:10px;opacity:.4;font-weight:800;letter-spacing:1px;line-height:1.3'; rail.appendChild(n); }
  f.appendChild(rail);

  if (isToday) {
    const nl = div('nowline'); nl.style.top = (nowF * ROWH) + 'px';
    nl.innerHTML = '<i></i><b class="outline">' + esc(minLabel(new Date().getHours() * 60 + new Date().getMinutes())) + '</b>';
    f.appendChild(nl);
  }

  g.appendChild(f);
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function blockEl(b, isNow) {
  const ev = isEvent(b);
  const el = div('blk' + (b.len < 2 ? ' tiny' : '') + (!ev && b.done ? ' done' : '') + (isNow ? ' now' : '') + (ev ? ' evt' : ''));
  el.style.gridRow = (b.start + 1) + ' / span ' + b.len;
  el.style.setProperty('--c', ev ? C_EVENT : C_BLOCK);
  el.dataset.id = b.id;
  el.appendChild(div('t', taskLabel(b)));
  el.appendChild(div('s', rangeLabel(b.start, b.len)));
  /* the note earns a line of its own once the block is tall enough to hold it */
  if (b.note && b.len >= 3) el.appendChild(div('note', b.note));
  if (ev) {
    const tag = div('evtagt', 'EVENT');
    el.appendChild(tag);
  } else if (b.done) {
    const gr = div('grade outline', b.grade);
    gr.style.background = colOf(b.grade);
    gr.dataset.act = 'tick';
    el.appendChild(gr);
  } else {
    const tk = div('tick', '✓'); tk.dataset.act = 'tick'; tk.title = 'grade this block';
    el.appendChild(tk);
  }
  const rz = div('rz'); rz.dataset.act = 'rz'; el.appendChild(rz);
  return el;
}

/* ---------------- painting & dragging ---------------- */
let paint = null, resizing = null;
function slotFromEvent(e) { const r = $('#grid').getBoundingClientRect(); return clamp(Math.floor((e.clientY - r.top) / ROWH), 0, SLOTS - 1); }
function preview(a, b) {
  let p = $('#pv');
  if (!p) { p = div('paintpv'); p.id = 'pv'; p.innerHTML = '<b></b>'; $('#grid').appendChild(p); }
  const s = Math.min(a, b), e = Math.max(a, b) + 1;
  p.style.top = (s * ROWH) + 'px'; p.style.height = (e - s) * ROWH + 'px';
  p.querySelector('b').textContent = slotLabel(s) + ' – ' + slotLabel(e) + '  (' + durLabel(e - s) + ')';
  return [s, e];
}
function killPreview() { const p = $('#pv'); if (p) p.remove(); }

function bindGrid() {
  const g = $('#grid');
  g.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const bEl = e.target.closest('.blk');
    if (bEl) {
      const bb = findBlock(cur, bEl.dataset.id);
      const act = e.target.dataset.act;
      if (bb && isEvent(bb) && act !== 'rz') { e.preventDefault(); openTodayEvent(bb, true); return; }
      if (act === 'tick') { e.preventDefault(); openGrade(bEl.dataset.id); return; }
      if (act === 'rz') {
        e.preventDefault();
        const b = findBlock(cur, bEl.dataset.id);
        if (b) { resizing = { id: b.id, start: b.start, len: b.len }; g.setPointerCapture(e.pointerId); preview(b.start, b.start + b.len - 1); }
        return;
      }
      openBlockEditor(bEl.dataset.id); return;
    }
    const evEl = e.target.closest('.evc');
    if (evEl) { const ev = eventsOn(cur).find(x => x.id === evEl.dataset.ev); if (ev) openTodayEvent(ev, false); return; }
    const cell = e.target.closest('.cell'); if (!cell) return;
    const slot = +cell.dataset.slot;
    if (e.pointerType !== 'mouse') { openBlockEditor(null, slot, Math.min(4, SLOTS - slot)); return; }
    e.preventDefault();
    paint = { a: slot, b: slot }; g.setPointerCapture(e.pointerId);
    preview(slot, slot); sfx('tick');
  });
  g.addEventListener('pointermove', e => {
    if (paint) { const s = slotFromEvent(e); if (s !== paint.b) { paint.b = s; preview(paint.a, paint.b); sfx('tick', Math.abs(paint.b - paint.a)); } }
    else if (resizing) { const s = Math.max(resizing.start, slotFromEvent(e)); preview(resizing.start, s); resizing.cur = s; }
  });
  g.addEventListener('pointerup', e => {
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
  g.addEventListener('pointercancel', () => { paint = null; resizing = null; killPreview(); });
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
  if (!sel) o += '<option value="" selected disabled>— pick a task —</option>';
  o += list.map(t => '<option value="' + t.id + '"' + (t.id === sel ? ' selected' : '') + '>' + esc(t.name) + (t.hidden ? '  (hidden)' : '') + '</option>').join('');
  o += '<option value="__new">＋ Create new task…</option>';
  return o;
}

function openBlockEditor(id, start, len) {
  const b = id ? findBlock(cur, id) : null;
  if (b && isEvent(b)) { openTodayEvent(b, true); return; }
  const st = b ? b.start : start, ln = b ? b.len : (len || 4);
  const sel = b ? b.taskId : (S.tasks.filter(t => !t.hidden).length === 1 ? S.tasks.filter(t => !t.hidden)[0].id : '');
  openModal(
    '<h3>' + (b ? '✎ EDIT BLOCK' : '★ NEW BLOCK') + '<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="field"><label>TASK</label><select class="inp" id="fT">' + taskOptions(sel) + '</select></div>' +
    '<div class="field" id="newWrap" hidden><label>NEW TASK NAME</label><input class="inp" id="fNew" placeholder="e.g. Deep work"></div>' +
    '<div class="two"><div class="field"><label>START</label><select class="inp" id="fS">' + timeOptions(st, 0, 95) + '</select></div>' +
    '<div class="field"><label>END</label><select class="inp" id="fE">' + timeOptions(st + ln, 1, 96) + '</select></div></div>' +
    '<div class="field"><label>NOTE  (shown on the block)</label><textarea class="inp" id="fN" placeholder="what exactly, this time">' + esc(b ? b.note : '') + '</textarea></div>' +
    '<div class="modrow">' + (b ? '<button class="btn red" data-del>DELETE</button>' : '') +
    (b && b.done ? '<button class="btn" data-undone>UNGRADE</button>' : '') +
    '<div class="spacer"></div><button class="btn green" data-save>' + (b ? 'SAVE' : 'ADD BLOCK') + '</button></div>'
  );
  const M = $('#modal');
  const selEl = M.querySelector('#fT'), newWrap = M.querySelector('#newWrap'), newEl = M.querySelector('#fNew');
  const syncNew = () => {
    const isNew = selEl.value === '__new';
    newWrap.hidden = !isNew;
    if (isNew) setTimeout(() => newEl.focus(), 30);
  };
  selEl.onchange = syncNew;
  if (!S.tasks.filter(t => !t.hidden).length) { selEl.value = '__new'; syncNew(); }
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
    } else if (!taskId) { toast('Pick a task first'); return; }
    else pushUndo();
    const s2 = +M.querySelector('#fS').value;
    let e2 = +M.querySelector('#fE').value;
    if (e2 <= s2) e2 = s2 + 1;
    const note = M.querySelector('#fN').value;
    const d = getDay(cur);
    if (b) {
      d.blocks = d.blocks.filter(x => x.id !== b.id);
      carve(d, s2, e2);
      Object.assign(b, { start: s2, len: e2 - s2, taskId: taskId, note: note });
      d.blocks.push(b); d.blocks.sort((x, y) => x.start - y.start);
    } else {
      addBlock(cur, s2, e2 - s2, taskId, note);
    }
    save(); closeModal(); renderAll(); sfx('place');
  };
  M.querySelector('[data-save]').onclick = commit;
  if (newEl) newEl.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
  const del = M.querySelector('[data-del]');
  if (del) del.onclick = () => { pushUndo(); const d = getDay(cur); d.blocks = d.blocks.filter(x => x.id !== b.id); save(); closeModal(); renderAll(); sfx('back'); };
  const un = M.querySelector('[data-undone]');
  if (un) un.onclick = () => { pushUndo(); b.done = false; b.grade = null; save(); closeModal(); renderAll(); sfx('back'); };
  M.querySelector('[data-x]').onclick = closeModal;
}

/* An event seen from TODAY. Everything about it is owned by the CALENDAR tab,
   so here it is read-only: you may only pull it into the day or cancel it.
   `pulled` = we are looking at an event block that is already on the timeline. */
function openTodayEvent(evOrBlock, pulled) {
  const isBlk = pulled;
  const title = isBlk ? (evOrBlock.evTitle || 'Event') : evOrBlock.title;
  const note = evOrBlock.note || '';
  const evId = isBlk ? evOrBlock.evId : evOrBlock.id;
  const base = S.events.find(e => e.id === evId);
  const timeTxt = isBlk
    ? slotLabel(evOrBlock.start) + ' – ' + slotLabel(evOrBlock.start + evOrBlock.len)
    : minLabel(evOrBlock.s) + ' – ' + minLabel(evOrBlock.e);
  openModal(
    '<h3>EVENT<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="field"><label>EVENT</label><input class="inp ro" value="' + esc(title) + '" readonly></div>' +
    '<div class="field"><label>NOTE</label><textarea class="inp ro" readonly>' + esc(note) + '</textarea></div>' +
    '<div class="hint" style="margin-bottom:6px">' + timeTxt + ' · ' + prettyD(cur) +
    '<br>Events are owned by the calendar — rename, retime or change the repeat over there.</div>' +
    '<div class="modrow"><button class="btn red" data-cancel>CANCEL</button>' +
    '<div class="spacer"></div>' +
    (isBlk ? '<button class="btn" data-x>CLOSE</button>' : '<button class="btn green" data-pull>PULL</button>') +
    '</div>'
  );
  const M = $('#modal');
  M.querySelectorAll('[data-x]').forEach(x => x.onclick = closeModal);
  const pl = M.querySelector('[data-pull]');
  if (pl) pl.onclick = () => {
    pushUndo();
    addEventBlock(cur, evOrBlock);
    save(); closeModal(); renderAll(); sfx('place'); toast('Pulled into the day');
  };
  M.querySelector('[data-cancel]').onclick = () => {
    pushUndo();
    const d = getDay(cur);
    d.blocks = d.blocks.filter(x => x.evId !== evId);      // drop the pulled block, if any
    if (base) {
      if (isRepeating(base)) base.skip = (base.skip || []).concat([cur]);
      else S.events = S.events.filter(e => e.id !== evId);
    }
    save(); closeModal(); renderAll(); sfx('back');
    toast(base && isRepeating(base) ? 'Cancelled just today' : 'Event cancelled');
  };
}

/* ---------------- grading ---------------- */
function openGrade(id) {
  const b = findBlock(cur, id); if (!b) return;
  if (isEvent(b)) { openTodayEvent(b, true); return; }
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
