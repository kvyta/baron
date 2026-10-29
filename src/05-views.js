"use strict";
/* ---------------- CALENDAR (events + quotas) ----------------
   One scrolling calendar, week rows from the past into the future, that
   grows another CAL_CHUNK weeks whenever you scroll near either end — no
   month selector. EVENTS | QUOTAS picks what the day cards show: events
   (with times), or the quotas due that day (a quota has a due date, never a
   time). The QUOTAS tab this replaces is gone; quotas still also show in the
   rail's own today/tomorrow list. Nothing here writes to S.days: it reads
   eventsOn(ds) directly instead of materializing event blocks, so scrolling
   far ahead doesn't fill the save with empty future days. */
let calMode = 'events';               // 'events' | 'quotas'
let calFrom = null, calTo = null;     // Sunday of the first / last week drawn
let calScrolled = false;              // scrolled to today yet this visit?
const CAL_CHUNK = 8;
function calInitRange() { const sun = sundayOf(todayStr()); calFrom = shiftD(sun, -7 * 8); calTo = shiftD(sun, 7 * 20); }
function renderCal() {
  if (!calFrom) calInitRange();
  $$('#calModeSeg .seg').forEach(x => x.classList.toggle('on', x.dataset.cm === calMode));
  $('#btnCalAdd').textContent = calMode === 'events' ? '+ EVENT' : '+ QUOTA';
  const g = $('#calgrid'), f = document.createDocumentFragment();
  const t = todayStr(), max = calMode === 'events' ? 5 : 6;
  for (let w = calFrom; w <= calTo; w = shiftD(w, 7)) {
    /* a month's title row goes above the week holding its 1st (and above the very first week drawn) */
    let title = null;
    for (let k = 0; k < 7; k++) { const dt = parseD(shiftD(w, k)); if (dt.getDate() === 1) title = dt; }
    if (!title && w === calFrom) title = parseD(w);
    if (title) f.appendChild(div('calmon outline', MON[title.getMonth()].toUpperCase() + ' ' + title.getFullYear()));
    for (let k = 0; k < 7; k++) {
      const ds = shiftD(w, k), dt = parseD(ds);
      const d = dayOf(ds), qs = quotasOn(ds), doneQ = qs.filter(x => x.done).length;
      const cell = div('day' + (ds < t ? ' past' : '') + (ds === t ? ' today' : '') + (ds === cur ? ' sel' : '') + (dt.getMonth() % 2 ? ' alt' : ''));
      cell.dataset.d = ds;
      cell.title = durLabel(bookedSlots(d)) + ' of a ' + durLabel(windowSlots(d)) + ' day  ·  rank ' + dayRank(d).toFixed(1) + ' / 10' +
        (qs.length ? '  ·  ' + doneQ + '/' + qs.length + ' quotas done' : '');
      const n = div('n');
      const scv = gradedSlots(d) ? dayScore(d) : null;
      n.innerHTML = '<span>' + (dt.getDate() === 1 ? MON[dt.getMonth()].slice(0, 3).toUpperCase() + ' ' : '') + dt.getDate() + '</span>' +
        (scv != null ? '<em>' + scv + '</em>' : '');
      cell.appendChild(n);
      if (calMode === 'events') {
        const ordered = calOrder(eventsOn(ds));
        ordered.slice(0, max).forEach(ev => {
          const e = div('ev');
          e.innerHTML = (isAllDay(ev) ? '' : '<span class="tm">' + minLabel(ev.s) + ' </span>') + esc(ev.title);   // phones hide the time — the title matters more
          e.style.background = evColor(ev);
          e.style.color = evInk(ev);
          e.dataset.ev = ev.id;
          cell.appendChild(e);
        });
        if (ordered.length > max) cell.appendChild(div('more', '+' + (ordered.length - max) + ' more'));
      } else {
        qs.slice(0, max).forEach(q => {
          const e = div('cq' + (q.done ? ' done' : ''), q.text);
          e.dataset.q = q.id;
          cell.appendChild(e);
        });
        if (qs.length > max) cell.appendChild(div('more', '+' + (qs.length - max) + ' more'));
      }
      if (scv != null && scv >= 80) { const wn = div('won', '♠'); wn.style.color = '#ffc93d'; cell.appendChild(wn); }
      /* bottom bar = quota completion for the day (empty track: none due) */
      const fill = div('fill'); const fi = document.createElement('i');
      fi.style.width = (qs.length ? Math.max(doneQ / qs.length * 100, 8) : 0) + '%';
      fi.style.background = (qs.length && doneQ === qs.length) ? 'var(--green)' : 'var(--chip)';
      fill.appendChild(fi); cell.appendChild(fill);
      f.appendChild(cell);
    }
  }
  g.innerHTML = ''; g.appendChild(f);
  if (!calScrolled) { calScrolled = true; requestAnimationFrame(() => scrollCalTo(t, false)); }
}
/* bring a day's week near the top of the scroller */
function scrollCalTo(ds, smooth) {
  const w = $('#calwrap'), c = $('#calgrid [data-d="' + ds + '"]');
  if (!w || !c) return;
  const top = c.getBoundingClientRect().top - w.getBoundingClientRect().top + w.scrollTop - 46;
  w.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
}
/* reaching either end draws CAL_CHUNK more weeks there; growing the top
   keeps what you were looking at in place */
function calOnScroll() {
  const w = $('#calwrap');
  if (w.scrollTop < 240) {
    const h = w.scrollHeight;
    calFrom = shiftD(calFrom, -7 * CAL_CHUNK); renderCal();
    w.scrollTop += w.scrollHeight - h;
  } else if (w.scrollTop + w.clientHeight > w.scrollHeight - 240) {
    calTo = shiftD(calTo, 7 * CAL_CHUNK); renderCal();
  }
}
function setCalMode(m) { calMode = m; renderCal(); sfx('click'); }
function refreshQuotaViews() { renderRailQuotas(); if (!$('#viewCal').hidden) renderCal(); }

/* a day's quotas (QUOTAS mode, clicking a day card) */
function openQuotaDay(ds) {
  const qs = quotasOn(ds);
  openModal(
    '<h3>' + esc(prettyD(ds)) + '<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="field"><label>QUOTAS DUE</label><div class="tlist" id="qdList">' +
    (qs.length ? qs.map(q => '<div class="qrow' + (q.done ? ' done' : '') + '" data-id="' + q.id + '"><span class="tx">' + esc(q.text) + '</span></div>').join('')
      : '<div class="hint">Nothing due this day.</div>') +
    '</div></div>' +
    '<div class="modrow"><button class="btn sm gold" data-add>+ QUOTA</button><div class="spacer"></div><button class="btn" data-x>CLOSE</button></div>'
  );
  const M = $('#modal');
  M.querySelectorAll('[data-x]').forEach(b => b.onclick = closeModal);
  M.querySelector('[data-add]').onclick = () => openNewQuota(ds);
  M.querySelector('#qdList').addEventListener('click', e => { const r = e.target.closest('[data-id]'); if (r) openQuotaEditor(r.dataset.id); });
}

/* naming a new quota. With a day (clicked from a card) the day is fixed;
   from the + QUOTA button you pick the due date. */
function openNewQuota(ds) {
  openModal(
    '<h3>NEW QUOTA<button class="btn sm x" data-x>✕</button></h3>' +
    (ds
      ? '<div class="field"><label>DUE ' + esc(prettyD(ds)) + '</label></div>'
      : '<div class="field"><label>DUE DATE</label><input class="inp" type="date" id="qDay" value="' + todayStr() + '"></div>') +
    '<div class="field"><label>QUOTA</label><input class="inp" id="qName" data-autofocus placeholder="e.g. Problem set 4 due"></div>' +
    '<div class="modrow"><div class="spacer"></div><button class="btn green" data-add>ADD</button></div>'
  );
  const M = $('#modal');
  M.querySelector('[data-x]').onclick = closeModal;
  const commit = () => {
    const el = M.querySelector('#qName'), v = el.value.trim();
    if (!v) { el.focus(); return; }
    const day = ds || M.querySelector('#qDay').value || todayStr();
    pushUndo(); addQuota(day, v); save(); closeModal();
    refreshQuotaViews();
    sfx('place');
  };
  M.querySelector('[data-add]').onclick = commit;
  M.querySelector('#qName').addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
}

/* the full editor for an EXISTING quota: rename, due date, note, complete/uncomplete, delete */
function openQuotaEditor(id) {
  const it = S.quotas.find(x => x.id === id); if (!it) return;
  openModal(
    '<h3>QUOTA<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="field"><label>QUOTA</label><input class="inp" id="qT" data-autofocus value="' + esc(it.text) + '"></div>' +
    '<div class="field"><label>DUE DATE</label><input class="inp" type="date" id="qD" value="' + it.date + '"></div>' +
    '<div class="field"><label>NOTE</label><textarea class="inp" id="qN" placeholder="details…">' + esc(it.note || '') + '</textarea></div>' +
    '<div class="modrow"><button class="btn red" data-del title="delete">🗑</button><div class="spacer"></div>' +
    '<button class="btn ' + (it.done ? '' : 'green') + '" data-toggle>' + (it.done ? 'UNCOMPLETE' : 'COMPLETE') + '</button></div>'
  );
  const M = $('#modal');
  const commitEdits = () => {
    const v = M.querySelector('#qT').value.trim();
    if (v) it.text = v;
    const dd = M.querySelector('#qD').value; if (dd) it.date = dd;
    it.note = M.querySelector('#qN').value;
  };
  M.querySelector('[data-x]').onclick = () => { pushUndo(); commitEdits(); save(); closeModal(); refreshQuotaViews(); };
  M.querySelector('[data-del]').onclick = () => { pushUndo(); deleteQuota(it.id); save(); closeModal(); refreshQuotaViews(); sfx('back'); };
  M.querySelector('[data-toggle]').onclick = () => {
    pushUndo(); commitEdits(); toggleQuota(it.id); save(); closeModal(); refreshQuotaViews(); sfx(it.done ? 'score' : 'back');
  };
}

/* UPCOMING lives in the rail so it is visible from every tab. Just the one
   nearest event that hasn't started yet (see nextUpcomingEvent) — one-offs
   are green here too, matching the calendar grid. */
function renderAgenda() {
  const a = $('#agenda'); a.innerHTML = '';
  const t = todayStr();
  const ev = nextUpcomingEvent(t);
  if (!ev) { a.appendChild(div('hint', 'Nothing coming up.')); }
  else {
    const r = div('agrow'); r.dataset.ev = ev.id; r.dataset.on = ev.on;
    const dot = div('dot'); dot.style.background = evColor(ev);
    const w = div('w');
    const when = ev.date === t ? 'TODAY' : ev.date === shiftD(t, 1) ? 'TOMORROW' : prettyD(ev.date);
    w.innerHTML = '<b>' + esc(ev.title) + (isRepeating(ev) ? ' <span style="opacity:.5;font-size:10px">↻</span>' : '') + '</b>' +
      '<span>' + when + '  ·  ' + evTimeLabel(ev) + '</span>';
    r.appendChild(dot); r.appendChild(w);
    a.appendChild(r);
  }
  renderRailQuotas();
  fitAgenda();
}

/* QUOTAS lives just below UPCOMING in the rail, today's items only. */
/* Today's and tomorrow's quotas both show here — a quota pinned to a date is
   due BY that date, so seeing tomorrow's a day early is the point (same
   reasoning as a deadline: you want the heads-up before it's due, not on
   the morning of). Each day gets its own small label only when there's
   something under it, so a quiet tomorrow doesn't print an empty header. */
function renderRailQuotas() {
  const q = $('#railQuotas'); if (!q) return;
  q.innerHTML = '';
  const t = todayStr(), tmrw = shiftD(t, 1);
  const today = quotasOn(t), tomorrow = quotasOn(tmrw);
  if (!today.length && !tomorrow.length) { q.appendChild(div('hint', 'Nothing due today or tomorrow.')); return; }
  const addGroup = (label, items) => {
    if (!items.length) return;
    q.appendChild(div('railqlbl', label));
    items.forEach(it => {
      const row = div('qrow' + (it.done ? ' done' : ''));
      row.dataset.id = it.id;
      row.innerHTML = '<span class="tx">' + esc(it.text) + '</span>';
      q.appendChild(row);
    });
  };
  addGroup('TODAY', today);
  addGroup('TOMORROW', tomorrow);
}

/* UPCOMING's one row is fixed; QUOTAS can be any length, so it's the one
   that gives ground — drop rows off its bottom until the rail fits its
   column exactly, then drop any group label left with nothing under it
   (TOMORROW's label if every one of its rows got trimmed away). Same
   "must never scroll" rule as before. */
function fitAgenda() {
  const rail = $('.rail'), q = $('#railQuotas');
  if (!rail || !q) return;
  let rows = q.querySelectorAll('.qrow');
  while (rows.length > 0 && rail.scrollHeight > rail.clientHeight + 1) {
    rows[rows.length - 1].remove();
    rows = q.querySelectorAll('.qrow');
  }
  q.querySelectorAll('.railqlbl').forEach(l => {
    const n = l.nextElementSibling;
    if (!n || n.classList.contains('railqlbl')) l.remove();
  });
}

function minOptions(sel) {
  let o = '';
  for (let m = 0; m <= 1440; m += 15) o += '<option value="' + m + '"' + (m === sel ? ' selected' : '') + '>' + minLabel(m === 1440 ? 1439 : m) + (m === 1440 ? '⁺' : '') + '</option>';
  return o;
}
function openEventEditor(id, dateDefault, onDate) {
  const ev = id ? S.events.find(e => e.id === id) : null;
  const ds = ev ? ev.date : (dateDefault || cur);
  const occ = onDate || ds;   // which occurrence was clicked, for repeating events
  const rep = ev ? (isAllDay(ev) ? 'allday' : (ev.rep || 'none')) : 'none';
  /* An occurrence that has already happened is part of the record. Only the
     note stays editable — and a note is one field shared by the whole series,
     which is a deliberate simplification. */
  const sealed = !!ev && isPastDay(occ);
  const ro = sealed ? ' readonly disabled' : '';
  const cls = sealed ? ' ro' : '';
  openModal(
    '<h3>' + (sealed ? '🔒 PAST EVENT' : ev ? '✎ EDIT EVENT' : '＋ NEW EVENT') + '<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="field"><label>TITLE</label><input class="inp' + cls + '" id="eT" ' + (sealed ? '' : 'data-autofocus ') + 'value="' + esc(ev ? ev.title : '') + '" placeholder="Standup / 1:1 / dentist…"' + ro + '></div>' +
    (sealed ? '' :
      '<div class="field"><label>' + (isRepeating(ev) ? 'FIRST DATE' : 'DATE') + '</label><input class="inp" type="date" id="eD" value="' + ds + '"></div>' +
      '<div class="two"><div class="field"><label>START</label><select class="inp" id="eS"' + (rep === 'allday' ? ' disabled' : '') + '>' + minOptions(ev && !isAllDay(ev) ? ev.s : 540) + '</select></div>' +
      '<div class="field"><label>END</label><select class="inp" id="eE"' + (rep === 'allday' ? ' disabled' : '') + '>' + minOptions(ev && !isAllDay(ev) ? ev.e : 600) + '</select></div></div>' +
      '<div class="field"><label>REPEAT</label><select class="inp" id="eR">' +
      REPEATS.map(r => '<option value="' + r.id + '"' + (r.id === rep ? ' selected' : '') + '>' + r.name + '</option>').join('') +
      '<option value="allday"' + (rep === 'allday' ? ' selected' : '') + '>Whole day</option>' +
      '</select></div>' +
      '<div class="field" id="untilWrap"' + (rep === 'none' || rep === 'allday' ? ' hidden' : '') + '><label>REPEAT UNTIL  (blank = forever)</label>' +
      '<input class="inp" type="date" id="eU" value="' + (ev && ev.until ? ev.until : '') + '"></div>') +
    (sealed ? '<div class="field"><label>WHEN</label><input class="inp ro" value="' + esc(prettyD(occ) + '  ·  ' + evTimeLabel(ev)) + '" readonly></div>' : '') +
    '<div class="field"><label>NOTE' + (sealed ? '  (the one field you can still change)' : '') + '</label>' +
    '<textarea class="inp" id="eN" placeholder="link, room, agenda…">' + esc(ev ? ev.note : '') + '</textarea></div>' +
    (sealed ? '<div class="hint" style="margin-bottom:8px">' + prettyD(occ) + ' has passed, so the time and title are fixed. Editing the note changes it on every occurrence of this event.</div>'
      : isRepeating(ev) ? '<div class="hint" style="margin-bottom:8px">Changing the time or title will ask whether that applies to just ' + prettyD(occ) + ' or to it and every occurrence after — nothing before ' + prettyD(occ) + ' is ever touched. A note-only change still applies to the whole series.</div>' : '') +
    '<div class="modrow">' +
    (sealed ? ''
      : ev && isRepeating(ev)
        ? '<button class="btn sm red" data-skip>SKIP ' + prettyD(occ) + '</button>' +
          '<button class="btn sm red" data-end>END AFTER THIS DAY</button>'
        : ev ? '<button class="btn red" data-del>DELETE</button>' : '') +
    '<div class="spacer"></div><button class="btn green" data-save>' + (sealed ? 'SAVE NOTE' : ev ? 'SAVE' : 'ADD EVENT') + '</button></div>'
  );
  const M = $('#modal');
  const rsel = M.querySelector('#eR');
  /* "Whole day" greys out START/END — the event has no times */
  const syncRep = () => {
    M.querySelector('#untilWrap').hidden = rsel.value === 'none' || rsel.value === 'allday';
    M.querySelector('#eS').disabled = M.querySelector('#eE').disabled = rsel.value === 'allday';
  };
  if (rsel) rsel.onchange = syncRep;

  const sk = M.querySelector('[data-skip]');
  if (sk) sk.onclick = () => {
    pushUndo();
    ev.skip = (ev.skip || []).concat([occ]);
    syncAllEventBlocks();
    save(); closeModal(); renderAll(); sfx('back');
    toast('Skipped just that day — its block is gone too');
  };
  /* stop the series here: this occurrence survives, everything later goes */
  const en = M.querySelector('[data-end]');
  if (en) en.onclick = () => {
    pushUndo();
    ev.until = occ;
    syncAllEventBlocks();
    save(); closeModal(); renderAll(); sfx('back');
    toast('Series ends ' + prettyD(occ) + ' — earlier days kept');
  };

  const commit = () => {
    const note = M.querySelector('#eN').value;
    if (sealed) { pushUndo(); ev.note = note; save(); closeModal(); renderAll(); sfx('place'); return; }
    const title = M.querySelector('#eT').value.trim() || 'Event';
    const date = M.querySelector('#eD').value || ds;
    const allDay = M.querySelector('#eR').value === 'allday';
    let s = allDay ? 0 : +M.querySelector('#eS').value, e = allDay ? 1440 : +M.querySelector('#eE').value;
    if (e <= s) e = Math.min(1440, s + 15);
    const repv = allDay ? 'none' : M.querySelector('#eR').value;
    const until = repv === 'none' ? null : (M.querySelector('#eU').value || null);
    /* A time or title change on a repeating event is ambiguous — every
       occurrence, or just this one going forward? Ask, unless occ is the
       series' own anchor date, where "and every occurrence after" already
       means "all of them" and there's nothing to disambiguate. A note-only
       change (nothing else different) keeps applying to the whole series
       without asking — that's the one deliberate simplification kept from
       before, and it's called out in the hint above the NOTE field. */
    if (ev && isRepeating(ev) && occ !== ev.date && (title !== ev.title || s !== ev.s || e !== ev.e || allDay)) {
      closeModal();
      openScopeChoice(ev, occ, { title, s, e, note, repv, until, allDay });
      return;
    }
    pushUndo();
    if (ev) Object.assign(ev, { title, date, s, e, note: note, rep: repv, until: until, allDay: allDay });
    else S.events.push({ id: uid(), title, date, s, e, note: note, rep: repv, until: until, skip: [], allDay: allDay });
    syncAllEventBlocks();
    save(); closeModal(); renderAll(); sfx('place');
  };
  M.querySelector('[data-save]').onclick = commit;
  const tEl = M.querySelector('#eT');
  if (tEl && !sealed) tEl.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
  const del = M.querySelector('[data-del]');
  if (del) del.onclick = () => {
    pushUndo();
    S.events = S.events.filter(x => x.id !== ev.id);
    syncAllEventBlocks();
    save(); closeModal(); renderAll(); sfx('back');
    toast('Event deleted');
  };
  M.querySelector('[data-x]').onclick = closeModal;
}

/* Asks which occurrences a time/title change on a repeating event applies
   to, then carries it out by splitting the series — never by touching a
   sealed day. Both branches lean entirely on syncAllEventBlocks() to
   reconcile blocks afterward, same as any other event edit: restructure
   S.events correctly and the existing sync machinery (which already refuses
   to rewrite a past day, see §6a) does the rest. */
function openScopeChoice(ev, occ, edits) {
  openModal(
    '<h3>APPLY TO<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="hint" style="margin-bottom:12px">"' + esc(ev.title) + '" repeats. Nothing before ' + prettyD(occ) + ' will change either way.</div>' +
    '<div class="modrow" style="flex-direction:column;gap:8px;align-items:stretch">' +
    '<button class="btn" data-scope="one">JUST ' + prettyD(occ) + '</button>' +
    '<button class="btn gold" data-scope="following">' + prettyD(occ) + ' AND EVERY OCCURRENCE AFTER</button>' +
    '</div>' +
    '<div class="modrow" style="margin-top:10px"><div class="spacer"></div><button class="btn sm red" data-cancel>CANCEL</button></div>'
  );
  const M = $('#modal');
  M.querySelector('[data-x]').onclick = closeModal;
  M.querySelector('[data-cancel]').onclick = closeModal;
  M.querySelector('[data-scope="one"]').onclick = () => {
    pushUndo();
    ev.skip = (ev.skip || []).concat([occ]);
    S.events.push({ id: uid(), title: edits.title, date: occ, s: edits.s, e: edits.e, note: edits.note, rep: 'none', until: null, skip: [], allDay: !!edits.allDay });
    syncAllEventBlocks();
    save(); closeModal(); renderAll(); sfx('place');
    toast('Changed just ' + prettyD(occ));
  };
  M.querySelector('[data-scope="following"]').onclick = () => {
    pushUndo();
    const cutoff = shiftD(occ, -1);
    const carriedSkips = (ev.skip || []).filter(d => d >= occ);
    ev.skip = (ev.skip || []).filter(d => d < occ);
    ev.until = (ev.until && ev.until < cutoff) ? ev.until : cutoff;
    S.events.push({ id: uid(), title: edits.title, date: occ, s: edits.s, e: edits.e, note: edits.note, rep: edits.repv, until: edits.until, skip: edits.allDay ? [] : carriedSkips, allDay: !!edits.allDay });
    syncAllEventBlocks();
    save(); closeModal(); renderAll(); sfx('place');
    toast('Changed ' + prettyD(occ) + ' onward — earlier days kept');
  };
}

function openDayPanel(ds) {
  const d = dayOf(ds), evs = eventsOn(ds), sc = dayScore(d);
  openModal(
    '<h3>' + prettyD(ds) + '<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="li"><span>Score</span><span class="amt" style="color:var(--chip)">' + (gradedSlots(d) ? sc + ' / 100' : '—') + '</span></div>' +
    '<div class="li" style="margin-top:6px"><span>Rank</span><span class="amt" style="color:var(--mult)">' + dayRank(d).toFixed(1) + ' / 10</span></div>' +
    '<div class="li" style="margin-top:6px"><span class="goldtxt">Gold</span><span class="amt">' + (gradedSlots(d) ? dayGold(d).toLocaleString() : '—') + '</span></div>' +
    '<div class="field" style="margin-top:14px"><label>EVENTS</label><div class="tlist" id="evList">' +
    (evs.length ? calOrder(evs).map(e => '<div class="trow click" data-ev="' + e.id + '"><span class="dot" style="width:12px;height:12px;border-radius:4px;border:2px solid #000;background:' + evColor(e) + '"></span><span class="w">' + esc(e.title) + (isRepeating(e) ? ' ↻' : '') + '</span><small>' + evTimeLabel(e) + '</small></div>').join('') : '<div class="hint">No events this day.</div>') +
    '</div></div>' +
    '<div class="modrow"><button class="btn sm gold" data-add>+ EVENT</button>' +
    '<button class="btn sm blue" data-open>OPEN IN DAY VIEW</button>' +
    (d.blocks.length && ds !== cur ? '<button class="btn sm green" data-copy>COPY BLOCKS → ' + (cur === todayStr() ? 'TODAY' : prettyD(cur)) + '</button>' : '') +
    '<div class="spacer"></div></div>'
  );
  const M = $('#modal');
  M.querySelector('[data-x]').onclick = closeModal;
  M.querySelector('[data-add]').onclick = () => openEventEditor(null, ds);
  M.querySelector('[data-open]').onclick = () => { cur = ds; closeModal(); switchView('day'); };
  const cp = M.querySelector('[data-copy]');
  if (cp) cp.onclick = () => { const n = copyInto(ds, cur); closeModal(); toast(n ? n + ' block' + (n > 1 ? 's' : '') + ' copied' : 'No free space'); };
  M.querySelector('#evList').addEventListener('click', e => {
    const r = e.target.closest('[data-ev]'); if (r) openEventEditor(r.dataset.ev, null, ds);
  });
}

/* ---------------- copy blocks (CALENDAR's day panel + DAILY's AUTOFILL) ----------------
   Used by copyInto (CALENDAR's day panel): only TASK blocks
   ever move (events are never touched — they're always re-derived by
   syncEventsOn, not something to copy) and only into currently-free time —
   an existing block in `dstDs`, or an event, always wins; the incoming block
   is carved down to whatever free slots remain around it, and any run of
   zero free slots is simply dropped. No pushUndo/save/render here — callers
   own the transaction. */
function mergeBlocksFreeSpace(srcDs, dstDs) {
  const src = dayOf(srcDs);
  const dst = getDay(dstDs);
  const occ = occupancy(dst, true, dstDs);
  let n = 0;
  /* NEGATIVE blocks are a record of time wasted, not a plan — never copied */
  taskBlocks(src).filter(b => !isNeg(b)).sort((a, b) => a.start - b.start).forEach(b => {
    let run = null;
    const flush = () => { if (run) { dst.blocks.push({ id: uid(), start: run.s, len: run.l, taskId: b.taskId, done: false, grade: null }); n++; run = null; } };
    for (let i = b.start; i < b.start + b.len && i < SLOTS; i++) {
      if (!occ[i]) { if (!run) run = { s: i, l: 0 }; run.l++; occ[i] = 'new'; }
      else flush();
    }
    flush();
  });
  dst.blocks.sort((a, b) => a.start - b.start);
  return n;
}
function copyInto(srcDs, dstDs) {
  if (isPastDay(dstDs)) { toast('Past days are archived'); return 0; }
  const src = dayOf(srcDs);
  if (!src.blocks.length) { toast('Nothing to copy from ' + prettyD(srcDs)); return 0; }
  pushUndo();
  const n = mergeBlocksFreeSpace(srcDs, dstDs);
  save(); renderAll(); sfx('place');
  return n;
}

/* ---------------- day recap ---------------- */
const FEEDBACK = [
  [95, 'Near-perfect use of the time you booked.'],
  [85, 'Strong day. This is the one to repeat.'],
  [70, 'Good day. A couple of blocks slipped, nothing more.'],
  [50, 'Half-decent. The plan was bigger than the day.'],
  [30, 'Rough one. Try booking fewer, shorter blocks tomorrow.'],
  [1, 'Mostly a miss — but you showed up and graded it honestly. That is the habit.'],
  [0, 'Nothing landed today. Tomorrow: three small blocks, that is all.']
];
function showRecap() {
  const d = dayOf(cur), sc = dayScore(d);
  const tb = taskBlocks(d);
  const doneN = tb.filter(b => b.done).length;
  const seeStats = '<button class="btn" id="btnSeeStats">SEE ALL STATS</button>';
  if (!d.blocks.length) {
    openModal(
      '<div class="recap"><div class="head"><div class="big outline">NOTHING PLANNED</div>' +
      '<div class="sub">' + prettyD(cur) + '</div></div>' +
      '<div class="hint" style="font-size:12.5px;margin-top:10px;opacity:.85">Nothing planned on this day yet — book a block to start racking up score.</div>' +
      '<div class="modrow">' + seeStats + '<div class="spacer"></div><button class="btn gold" data-x>DONE</button></div></div>',
      'wide'
    );
    $('#modal').querySelectorAll('[data-x]').forEach(b => b.onclick = closeModal);
    $('#btnSeeStats').onclick = () => { closeModal(); switchView('stats'); };
    return;
  }
  const fb = (FEEDBACK.find(f => sc >= f[0]) || FEEDBACK[FEEDBACK.length - 1])[1];
  const per = {};
  tb.forEach(b => { if (!b.done) return; per[b.grade] = (per[b.grade] || 0) + b.len; });
  const maxV = Math.max(1, ...Object.values(per));
  const gradeCount = ALL_GRADES.map(g => [g, tb.filter(b => b.grade === g.g).length]).filter(x => x[1]);
  const bd = bestDay();
  const rk = dayRank(d), gold = dayGold(d);
  openModal(
    '<div class="recap"><div class="head"><div class="big outline">' + (doneN ? gold.toLocaleString() + ' GOLD' : 'NOT GRADED YET') + '</div>' +
    '<div class="sub">' + prettyD(cur) + '  ·  SCORE ' + sc + '  ×  RANK ' + rk.toFixed(1) + '</div></div>' +
    '<div class="lines2">' +
    '<div class="li"><span>Score — how well you did it</span><span class="amt" style="color:var(--chip)">' + sc + ' / 100</span></div>' +
    '<div class="li"><span>Rank — how full the day was</span><span class="amt" style="color:var(--mult)">' + rk.toFixed(1) + ' / 10</span></div>' +
    '<div class="li"><span class="goldtxt">Gold — score × rank</span><span class="amt">' + gold.toLocaleString() + '</span></div>' +
    '<div class="li"><span>Blocks graded</span><span class="amt">' + doneN + '/' + tb.length + '</span></div>' +
    '<div class="li"><span>Time that counted</span><span class="amt">' + durLabel(bookedSlots(d)) + ' of ' + durLabel(windowSlots(d)) + '</span></div>' +
    (rawBooked(d) !== bookedSlots(d) ? '<div class="li"><span>Handed back by F / U / D</span><span class="amt" style="color:var(--mult)">' + durLabel(rawBooked(d) - bookedSlots(d)) + '</span></div>' : '') +
    (bookedSlots(d) !== scoreWeight(d) ? '<div class="li"><span>Of that, events (not scored)</span><span class="amt" style="color:var(--event)">' + durLabel(bookedSlots(d) - scoreWeight(d)) + '</span></div>' : '') +
    (doneN ? '<div class="li"><span>Score on graded time only</span><span class="amt">' + gradedScore(d) + '</span></div>' : '') +
    (gradeCount.length ? '<div class="li"><span>Report card</span><span class="amt">' + gradeCount.map(x => x[1] + '×' + x[0].g).join('  ') + '</span></div>' : '') +
    '<div class="li"><span>Streak of graded days</span><span class="amt">' + computeStreak() + '</span></div>' +
    '<div class="li"><span class="goldtxt">Best gold so far</span><span class="amt">' + (bd.gold ? bd.gold.toLocaleString() + (bd.date === cur ? ' ← today' : '') : '—') + '</span></div>' +
    '</div>' +
    (Object.keys(per).length ? '<div class="field"><label>HOURS BY GRADE</label><div class="bars">' +
      ALL_GRADES.filter(g => per[g.g]).map(g =>
        '<div class="bar" style="--c:' + g.color + '"><span class="nm">' + g.g + ' — ' + g.label + '</span><span class="tr"><i style="width:' + (per[g.g] / maxV * 100) + '%"></i></span><span class="vv">' + durLabel(per[g.g]) + '</span></div>'
      ).join('') + '</div></div>' : '') +
    '<div class="hint" style="font-size:12.5px;margin-top:10px;opacity:.85">' + fb + '</div>' +
    '<div class="modrow">' + seeStats + '<div class="spacer"></div><button class="btn gold" data-x>DONE</button></div></div>',
    'wide'
  );
  requestAnimationFrame(() => $$('#modal .bar .tr i').forEach(i => { const w = i.style.width; i.style.width = '0'; requestAnimationFrame(() => i.style.width = w); }));
  $('#modal').querySelectorAll('[data-x]').forEach(b => b.onclick = closeModal);
  $('#btnSeeStats').onclick = () => { closeModal(); switchView('stats'); };
}

/* ---------------- TASKS ---------------- */
let tkVis = 'visible', tkSort = 'az';

/* Deleting and hiding are one button now, and which one you get is decided by
   the task's history: a task that has already been done is a record, so it can
   only be hidden. Anything that never happened can be erased outright. */
function renderTasks() {
  const L = $('#tklist'); L.innerHTML = '';
  const stats = {};
  S.tasks.forEach(t => stats[t.id] = taskStats(t.id));
  const list = S.tasks.filter(t => tkVis === 'all' ? true : !t.hidden);
  if (tkSort === 'freq') list.sort((a, b) => stats[b.id].slots - stats[a.id].slots || a.name.localeCompare(b.name));
  else list.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  const hid = S.tasks.filter(t => t.hidden).length;
  $('#tkHdr').innerHTML = '<span>' + list.length + ' TASK' + (list.length === 1 ? '' : 'S') + '  ·  ' +
    (tkVis === 'all' ? 'ALL' : 'VISIBLE') + '  ·  ' + (tkSort === 'freq' ? 'BY FREQUENCY' : 'A–Z') +
    (tkVis === 'visible' && hid ? '  ·  ' + hid + ' HIDDEN' : '') +
    '</span><span>HOURS  ·  BLOCKS</span>';

  if (!list.length) {
    L.appendChild(div('tkempty', S.tasks.length ? 'nothing here — try ALL' : 'no tasks yet — add one above'));
    return;
  }

  list.forEach(t => {
    const st = stats[t.id];
    const r = div('tkrow' + (t.hidden ? ' hid' : ''));
    const nm = div('nmtxt', t.name);
    nm.title = t.name;
    r.appendChild(nm);
    if (t.hidden) r.appendChild(div('hidtag', 'HIDDEN'));

    r.appendChild(div('hrs', st.slots ? durLabel(st.slots) : '—'));
    r.appendChild(div('cnt', st.count + ' blk'));

    const ren = document.createElement('button');
    ren.className = 'btn sm';
    ren.textContent = 'RENAME';
    ren.title = 'rename this task';
    ren.onclick = () => openRenameTask(t);
    r.appendChild(ren);

    const act = document.createElement('button');
    if (t.hidden) {
      act.className = 'btn sm green';
      act.textContent = 'RESTORE';
      act.title = 'put this task back in the pickers';
      act.onclick = () => {
        pushUndo(); t.hidden = false;
        save(); renderTasks(); renderAll(); sfx('place'); toast('“' + t.name + '” is back');
      };
    } else {
      act.className = 'btn sm red';
      act.textContent = '✕';
      act.title = st.done ? 'this task has graded blocks — it can only be hidden'
        : st.ahead ? 'delete — its ' + st.ahead + ' upcoming block' + (st.ahead === 1 ? '' : 's') + ' go too'
        : 'delete this task';
      act.onclick = () => {
        if (st.done) {           /* history exists: hide, never erase */
          pushUndo(); t.hidden = true;
          save(); renderTasks(); renderAll(); sfx('back');
          toast('“' + t.name + '” has graded blocks — hidden instead');
          return;
        }
        if (st.ahead) { openDeleteTask(t, st); return; }
        eraseTask(t);
      };
    }
    r.appendChild(act);
    L.appendChild(r);
  });
}

/* only ever reached for tasks with no finished blocks */
function eraseTask(t) {
  pushUndo();
  stampTaskName(t.id, t.name);
  const n = dropTaskBlocks(t.id);
  S.tasks = S.tasks.filter(x => x.id !== t.id);
  save(); closeModal(); renderTasks(); renderAll(); sfx('back');
  toast(n ? '“' + t.name + '” and ' + n + ' block' + (n === 1 ? '' : 's') + ' erased' : '“' + t.name + '” erased');
}

function openDeleteTask(t, st) {
  openModal(
    '<h3>DELETE THIS TASK?<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="li" style="margin-bottom:10px"><span>' + esc(t.name) + '</span>' +
    '<span class="amt" style="font-size:14px;color:#9fb0ad">' + st.ahead + ' upcoming block' + (st.ahead === 1 ? '' : 's') + '</span></div>' +
    '<div class="hint">Nothing of this task has been finished yet, so it can go for good. ' +
    'Hitting DELETE erases the task <b>and</b> its ' + st.ahead + ' upcoming block' + (st.ahead === 1 ? '' : 's') + '. ' +
    'This cannot be undone from the archive — only with <b>Ctrl+Z</b>.</div>' +
    '<div class="modrow"><button class="btn" data-x2>CANCEL</button><div class="spacer"></div>' +
    '<button class="btn red" data-del>DELETE</button></div>'
  );
  const M = $('#modal');
  M.querySelector('[data-x]').onclick = closeModal;
  M.querySelector('[data-x2]').onclick = closeModal;
  M.querySelector('[data-del]').onclick = () => eraseTask(t);
}

function openRenameTask(t) {
  const st = taskStats(t.id);
  openModal(
    '<h3>RENAME TASK<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="field"><label>NAME</label><input class="inp" id="rnName" data-autofocus value="' + esc(t.name) + '"></div>' +
    (st.count
      ? '<div class="hint">This task already has <b>' + st.count + ' block' + (st.count === 1 ? '' : 's') + '</b> — every one of them, past days included, will show the new name.</div>'
      : '<div class="hint">No blocks use this task yet.</div>') +
    '<div class="modrow"><button class="btn" data-x2>CANCEL</button><div class="spacer"></div>' +
    '<button class="btn gold" data-ok>RENAME</button></div>'
  );
  const M = $('#modal');
  const inp = M.querySelector('#rnName');
  const go = () => {
    const v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    if (v === t.name) { closeModal(); return; }
    if (S.tasks.some(x => x.id !== t.id && x.name.toLowerCase() === v.toLowerCase())) { toast('You already have a task called that'); inp.select(); return; }
    pushUndo();
    t.name = v;
    stampTaskName(t.id, v);
    save(); closeModal(); renderTasks(); renderAll(); sfx('place'); toast('Renamed to “' + v + '”');
  };
  inp.onkeydown = e => { if (e.key === 'Enter') go(); };
  M.querySelector('[data-ok]').onclick = go;
  M.querySelector('[data-x]').onclick = closeModal;
  M.querySelector('[data-x2]').onclick = closeModal;
}

function newTaskFromInput() {
  const el = $('#tkNew');
  const v = el.value.trim();
  if (!v) { el.focus(); return; }
  if (S.tasks.some(t => t.name.toLowerCase() === v.toLowerCase())) { toast('You already have that task'); el.select(); return; }
  pushUndo();
  addTask(v);
  el.value = '';
  save(); renderTasks(); sfx('place'); toast('Task added');
}

/* ---------------- STATS ---------------- */
let statRange = 30;
let statMetric = 'score';
let statSeries = [];
const C_MA = '#8fa0a8';

function statDays() {
  const t = todayStr();
  /* today only joins the line once something on it is graded — otherwise it
     would plot as a 0 and drag the whole chart down before the day is over */
  const keys = Object.keys(S.days)
    .filter(k => (S.days[k].blocks || []).length && (k !== t || gradedSlots(S.days[k])))
    .sort();
  if (!keys.length) return [];
  let from = keys[0];
  if (statRange) {
    const cutoff = shiftD(todayStr(), -(statRange - 1));
    from = cutoff > from ? cutoff : from;
  }
  return keys.filter(k => k >= from && k <= todayStr()).map(k => {
    const d = S.days[k];
    return {
      ds: k, score: dayScore(d), rank: dayRank(d), gold: dayGold(d),
      graded: d.blocks.filter(b => b.done).length, total: d.blocks.length,
      slots: bookedSlots(d), rslots: rawBooked(d), gslots: gradedSlots(d)
    };
  });
}

function renderStats() {
  const pts = statSeries = statDays();
  const M = METRICS[statMetric] || METRICS.score;
  const val = p => p[M.key];
  const box = $('#chart');
  const W = Math.max(320, $('#chartbox').clientWidth || 700);
  const H = 260, PL = 46, PR = 16, PT = 14, PB = 26;
  const iw = W - PL - PR, ih = H - PT - PB;

  $('#chartTitle').textContent = 'DAY ' + M.label;
  $('#chartTitle').style.color = statMetric === 'gold' ? 'var(--gold)' : '';
  $('#legendMain').style.background = M.color;
  $('#legendMainTxt').textContent = 'DAY ' + M.label;

  $('#chartSub').textContent = pts.length
    ? pts.length + ' DAY' + (pts.length === 1 ? '' : 'S') + '  ·  ' + prettyD(pts[0].ds) + ' → ' + prettyD(pts[pts.length - 1].ds)
    : 'NO DATA YET';

  if (pts.length < 2) {
    box.innerHTML = '<div class="emptychart">' + (pts.length ? 'one day so far — the line needs two' : 'plan and grade a couple of days,<br>then the line shows up here') + '</div>';
    $('#ctip').hidden = true;
    renderStatCards(pts); renderTaskBars(); renderCatBars(); renderTable(pts);
    return;
  }

  const n = pts.length;
  const x = i => PL + (n === 1 ? iw / 2 : i * iw / (n - 1));
  const y = v => PT + ih - (clamp(v, 0, M.max) / M.max) * ih;

  /* 7-day trailing average */
  const ma = pts.map((p, i) => {
    const from = Math.max(0, i - 6);
    let s = 0; for (let j = from; j <= i; j++) s += val(pts[j]);
    return s / (i - from + 1);
  });

  const line = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(val(p)).toFixed(1)).join(' ');
  const area = line + ' L' + x(n - 1).toFixed(1) + ' ' + (PT + ih) + ' L' + x(0).toFixed(1) + ' ' + (PT + ih) + ' Z';
  const maLine = ma.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');

  let best = 0; pts.forEach((p, i) => { if (val(p) > val(pts[best])) best = i; });
  const lastI = n - 1;
  const showDots = n <= 62;

  /* x tick dates, ~6 of them, never overlapping */
  const step = Math.max(1, Math.ceil(n / 6));
  let xt = '';
  for (let i = 0; i < n; i += step) {
    const d = parseD(pts[i].ds);
    xt += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" fill="#8fa0a8" font-size="10" font-weight="700" opacity=".75">' +
      (d.getMonth() + 1) + '/' + d.getDate() + '</text>';
  }

  let grid = '';
  for (let t = 0; t <= 4; t++) {
    const v = M.max * t / 4;
    grid += '<line x1="' + PL + '" x2="' + (W - PR) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="rgba(255,255,255,' + (t === 0 ? '.16' : '.07') + ')" stroke-width="1"/>' +
      '<text x="' + (PL - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end" fill="#8fa0a8" font-size="10" font-weight="700" opacity=".75">' + M.fmt(v) + '</text>';
  }

  let dots = '';
  if (showDots) pts.forEach((p, i) => {
    dots += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(val(p)).toFixed(1) + '" r="4" fill="' + M.color + '" stroke="#0f1519" stroke-width="2"/>';
  });

  const bestC = statMetric === 'gold' ? '#ffffff' : '#ffc93d';
  const labels =
    '<circle cx="' + x(best) + '" cy="' + y(val(pts[best])) + '" r="6" fill="none" stroke="' + bestC + '" stroke-width="2.5"/>' +
    '<text x="' + x(best) + '" y="' + (y(val(pts[best])) - 13) + '" text-anchor="middle" fill="' + bestC + '" font-size="11" font-weight="900">BEST ' + M.fmt(val(pts[best])) + '</text>' +
    '<text x="' + (x(lastI) - 6) + '" y="' + (y(val(pts[lastI])) - 13) + '" text-anchor="end" fill="#dfe6ea" font-size="12" font-weight="900">' + M.fmt(val(pts[lastI])) + '</text>';

  box.innerHTML =
    '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Day score over time">' +
    '<defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="' + M.color + '" stop-opacity=".38"/><stop offset="100%" stop-color="' + M.color + '" stop-opacity="0"/>' +
    '</linearGradient></defs>' +
    grid + xt +
    '<path d="' + area + '" fill="url(#ag)"/>' +
    '<path d="' + maLine + '" fill="none" stroke="' + C_MA + '" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" opacity=".9"/>' +
    '<path d="' + line + '" fill="none" stroke="' + M.color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
    dots + labels +
    '<line id="cross" x1="0" x2="0" y1="' + PT + '" y2="' + (PT + ih) + '" stroke="#ffffff" stroke-width="1.5" opacity="0"/>' +
    '<circle id="crossd" r="6" fill="#ffffff" stroke="#0f1519" stroke-width="2" opacity="0"/>' +
    '</svg>';

  /* hover crosshair + tooltip */
  const svg = box.querySelector('svg'), tip = $('#ctip'), tipWrap = $('#chartbox');
  const cross = svg.querySelector('#cross'), crossd = svg.querySelector('#crossd');
  const move = e => {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * (W / r.width);
    let i = Math.round((px - PL) / (iw / (n - 1)));
    i = clamp(i, 0, n - 1);
    const p = pts[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', '.55');
    crossd.setAttribute('cx', x(i)); crossd.setAttribute('cy', y(val(p))); crossd.setAttribute('opacity', '1');
    tip.hidden = false;
    tip.innerHTML = '<b style="color:' + M.color + '">' + M.fmt(val(p)) + (statMetric === 'score' ? ' / 100' : statMetric === 'rank' ? ' / 10' : '') + '</b>' +
      '<span>' + prettyD(p.ds) + '  ·  ' + p.graded + '/' + p.total + ' graded  ·  ' + durLabel(p.slots) + '</span>' +
      '<span style="display:block;margin-top:2px">score ' + p.score + '  ·  rank ' + p.rank.toFixed(1) + '  ·  <b style="display:inline;font-family:inherit;font-size:inherit" class="goldtxt">' + p.gold.toLocaleString() + ' gold</b></span>';
    const left = x(i) * r.width / W;
    tip.style.left = left + 'px';
    tip.style.top = (y(val(p)) * r.height / H) + 'px';
    /* clamp so the tooltip (rendered nowrap, centered on `left`) never spills
       past the chart box and forces a scrollbar on the stats panel */
    const wrapRect = tipWrap.getBoundingClientRect(), tipRect = tip.getBoundingClientRect();
    const margin = 6;
    let dx = 0;
    if (tipRect.left < wrapRect.left + margin) dx = (wrapRect.left + margin) - tipRect.left;
    else if (tipRect.right > wrapRect.right - margin) dx = (wrapRect.right - margin) - tipRect.right;
    if (dx) tip.style.left = (left + dx) + 'px';
  };
  svg.addEventListener('mousemove', move);
  svg.addEventListener('mouseleave', () => { tip.hidden = true; cross.setAttribute('opacity', '0'); crossd.setAttribute('opacity', '0'); });

  renderStatCards(pts); renderTaskBars(); renderCatBars(); renderTable(pts);
}

function renderStatCards(pts) {
  const M = METRICS[statMetric] || METRICS.score;
  const val = p => p[M.key];
  const graded = pts.filter(p => p.gslots);
  const mean = arr => arr.length ? arr.reduce((t, p) => t + val(p), 0) / arr.length : 0;
  const avg = mean(graded);
  const bd = bestDay();
  /* booked is raw here — it is the time you put on the calendar. The time that
     survived its grades is the sub-line, and rank is what really uses it. */
  const hrs = pts.reduce((t, p) => t + p.rslots, 0);
  const eff = pts.reduce((t, p) => t + p.slots, 0);
  const gh = pts.reduce((t, p) => t + p.gslots, 0);
  const last7 = pts.slice(-7).filter(p => p.gslots);
  const avg7 = mean(last7);
  const trend = avg7 - avg;
  const tsign = trend > 0.05 ? '▲ +' : trend < -0.05 ? '▼ ' : '– ';
  const mcol = statMetric === 'gold' ? 'cashv' : statMetric === 'rank' ? 'rankv' : 'blue';
  const cards = [
    { k: 'AVERAGE ' + M.label, v: graded.length ? M.fmt(avg) : '—', s: graded.length + ' graded day' + (graded.length === 1 ? '' : 's'), c: mcol },
    { k: 'LAST 7 DAYS', v: last7.length ? M.fmt(avg7) : '—', s: tsign + M.fmt(Math.abs(trend)) + ' vs average', c: trend >= 0 ? 'good' : '' },
    { k: 'BEST GOLD', v: bd.gold ? bd.gold.toLocaleString() : '—', s: bd.date ? prettyD(bd.date) + '  ·  ' + bd.score + ' × ' + bd.rank.toFixed(1) : 'nothing graded yet', c: 'cashv' },
    { k: 'STREAK', v: computeStreak(), s: 'days in a row graded', c: 'hot' },
    { k: 'TIME BOOKED', v: Math.round(hrs / 4) + 'h', s: Math.round(eff / 4) + 'h counted after grades', c: '' },
    { k: 'TIME GRADED', v: Math.round(gh / 4) + 'h', s: hrs ? Math.round(gh / hrs * 100) + '% of booked' : '—', c: '' }
  ];
  $('#scards').innerHTML = cards.map(c =>
    '<div class="scard ' + c.c + '"><div class="k">' + c.k + '</div><div class="v">' + c.v + '</div><div class="s">' + c.s + '</div></div>'
  ).join('');
}

/* Top tasks by hours in range. One measure, one hue — a ranked bar chart, not
   a categorical palette, so every bar is the same block blue. Hidden tasks are
   left out entirely. */
function renderTaskBars() {
  const per = {};
  statSeries.forEach(p => (S.days[p.ds].blocks || []).forEach(b => {
    if (isEvent(b) || !b.taskId) return;
    const t = taskOf(b.taskId);
    if (!t || t.hidden) return;
    per[b.taskId] = (per[b.taskId] || 0) + effLen(b);   /* F and U hand their time back */
  }));
  const keys = Object.keys(per).filter(k => per[k] > 0).sort((a, b) => per[b] - per[a]).slice(0, 10);
  const max = Math.max(1, ...keys.map(k => per[k]));
  $('#taskPanel').hidden = !keys.length;
  $('#taskBars').innerHTML = keys.map(k =>
    '<div class="bar" style="--c:' + C_BLOCK + '"><span class="nm" title="' + esc(taskOf(k).name) + '">' + esc(taskOf(k).name) + '</span>' +
    '<span class="tr"><i style="width:' + (per[k] / max * 100) + '%"></i></span>' +
    '<span class="vv">' + durLabel(per[k]) + '</span></div>'
  ).join('');
}

function renderCatBars() {
  const pts = statSeries, per = {};
  /* raw hours here on purpose: this is the shape of the time you spent, not the time that counted */
  pts.forEach(p => (S.days[p.ds].blocks || []).forEach(b => { if (b.done && !isEvent(b)) per[b.grade] = (per[b.grade] || 0) + b.len; }));
  const used = ALL_GRADES.filter(g => per[g.g]);
  const max = Math.max(1, ...used.map(g => per[g.g]));
  $('#catPanel').hidden = !used.length;
  $('#catBars').innerHTML = used.map(g =>
    '<div class="bar" style="--c:' + g.color + '"><span class="nm">' + g.g + ' — ' + g.label + '</span>' +
    '<span class="tr"><i style="width:' + (per[g.g] / max * 100) + '%"></i></span>' +
    '<span class="vv">' + durLabel(per[g.g]) + '</span></div>'
  ).join('');
}

function renderTable(pts) {
  $('#stable').innerHTML =
    '<tr><th>DAY</th><th>SCORE</th><th>RANK</th><th class="goldtxt">GOLD</th><th>GRADED</th><th>BOOKED</th></tr>' +
    pts.slice().reverse().map(p =>
      '<tr><td>' + prettyD(p.ds) + '</td>' +
      '<td class="sc" style="color:#0093ff">' + (p.gslots ? p.score : '—') + '</td>' +
      '<td class="sc" style="color:#e2564c">' + p.rank.toFixed(1) + '</td>' +
      '<td class="sc goldtxt">' + (p.gslots ? p.gold.toLocaleString() : '—') + '</td>' +
      '<td>' + p.graded + '/' + p.total + '</td><td>' + durLabel(p.slots) + '</td></tr>'
    ).join('');
}

/* ---------------- menu / help / categories ---------------- */
function openMenu() {
  openModal(
    '<h3>☰ MENU<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="field"><label>SAVING</label><div class="saving">' + cloudRowHtml() +
    localRowHtml() +
    '</div></div>' +
    '<div class="field"><label>ALERTS</label>' +
    '<div class="li"><span>' + (typeof Notification === 'undefined' ? 'This browser has no desktop notifications'
      : Notification.permission === 'granted' ? '● desktop alerts on'
      : Notification.permission === 'denied' ? 'Desktop alerts blocked'
      : 'Desktop alerts not enabled yet') + '</span></div>' +
    '<div class="hint" style="margin-top:8px">Every block and event gets a chime ' + ALERT_LEAD + ' minutes before it starts. This ignores the ♪ mute, and only works while Baron is open in a tab.</div>' +
    (typeof Notification !== 'undefined' && Notification.permission === 'default'
      ? '<div class="modrow" style="margin-top:9px"><button class="btn sm green" data-notify>ENABLE DESKTOP ALERTS</button></div>' : '') +
    '</div>' +
    '<div class="field"><label>ALL TIME</label><div class="li"><span>Days with something graded</span><span class="amt">' + Object.keys(S.days).filter(k => hasActivity(k)).length + '</span></div>' +
    '<div class="li" style="margin-top:6px"><span class="goldtxt">Best gold</span><span class="amt">' + (bestDay().gold || '—') + '</span></div></div>' +
    '<div class="modrow"><div class="spacer"></div><button class="btn gold" data-x>DONE</button></div>'
  );
  const M = $('#modal');
  M.querySelectorAll('[data-x]').forEach(b => b.onclick = closeModal);
  bindCloudMenu(M);
  bindLocalMenu(M);
  const nb = M.querySelector('[data-notify]');
  if (nb) nb.onclick = () => { askNotify(); closeModal(); };
}
function openHelp() {
  const rows = [
    ['Drag on empty time', 'paint a block'],
    ['Click a block', 'edit it'],
    ['Click the ✓', 'grade it F → A'],
    ['Drag a block’s bottom edge', 'resize'],
    ['Click SOD / EOD', 'reveal the hours beyond it'],
    ['1 – 5 in the grade card', 'pick a grade'],
    ['TODAY button', 'jump back to today'],
    ['past days', 'read-only archive'],
    ['B', 'new block'], ['N', 'jump to now'], ['D / C / T', 'daily / calendar / tasks'], ['Q', 'calendar, showing quotas'], ['S', 'recap today (→ SEE ALL STATS)'],
    ['← →', 'previous / next day'], ['Ctrl+Z', 'undo'], ['Esc', 'close']
  ];
  openModal(
    '<h3>HOW IT WORKS<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="hint" style="font-size:13px;line-height:1.6;margin-bottom:12px">' +
    'Every block is an instance of a <b>task</b> you keep in the TASKS tab. Red blocks are <b>events</b> — created in CALENDAR, they always sit on the day they occur, and they fill your day but are never graded and never count toward the score.<br>' +
    'When a block’s time has passed it starts glowing — grade it ' +
    GRADES.map(g => '<b style="color:' + g.color + '">' + g.g + '</b> ' + g.pts + '%').join(' · ') +
    '. Anything still ungraded when the day ends is stamped <b style="color:' + AUTO.color + '">U</b> ' + AUTO.pts +
    '% and the day is sealed — past blocks and events can no longer be added, changed or deleted. ' +
    'Save a block without picking a task and it becomes a <b>NEGATIVE</b> block, stamped <b style="color:' + NEG.color + '">N</b> ' + NEG.pts + '% for good — for time you actively wasted. ' +
    'Three numbers come out of that:<br>' +
    '<b style="color:#0093ff">SCORE / 100</b> — how well you did what you booked, weighted by block length. Ungraded time counts as zero, so it stays honest.<br>' +
    '<b style="color:#e2564c">RANK / 10</b> — how full your working day was. Time that counted ÷ the window between <b style="color:#9a5bd6">SOD</b> and <b style="color:#9a5bd6">EOD</b>, × 10. That window is 9:00a–10:00p unless blocks reach past either edge. <b>F</b> and <b>U</b> hand all their time back, <b>D</b> hands back half — so a day you slept through ranks near zero however much you booked.<br>' +
    '<b class="goldtxt">GOLD / 1000</b> — score × rank. It only goes up if you both booked a real day <i>and</i> did it well.' +
    '</div>' +
    rows.map(r => '<div class="helprow"><span class="kbd">' + r[0] + '</span><b>' + r[1] + '</b></div>').join('') +
    '<div class="hint" style="font-size:12.5px;line-height:1.6;margin-top:12px">Sign in (☰ Menu → SAVING → CLOUD) and your planner lives in your account: every change saves to the cloud, and any phone or computer you sign in on shows the same planner. LOCAL keeps a .json file on this computer identical to it as well.</div>' +
    '<div class="modrow"><div class="spacer"></div><button class="btn gold" data-x>GOT IT</button></div>'
  );
  $('#modal').querySelectorAll('[data-x]').forEach(b => b.onclick = closeModal);
}

/* ---------------- the 10-minute heads-up ----------------
   Fires for the next block or event of the day, 10 minutes before it starts.
   Deliberately independent of the ♪ mute: that button is for the little
   interface clicks, this is the one thing that should always get through. */
const ALERT_LEAD = 10;              // minutes
let alerted = {};                   // key -> true, cleared each day
let alertDay = '';

function notifyReady() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}
function askNotify() {
  if (typeof Notification === 'undefined') { toast('This browser has no notifications'); return; }
  if (Notification.permission === 'granted') { toast('Alerts are already on'); return; }
  Notification.requestPermission().then(p => {
    toast(p === 'granted' ? 'Desktop alerts on' : 'Desktop alerts blocked');
    renderAll();
  }).catch(() => toast('Desktop alerts unavailable'));
}

/* a chime that ignores the mute toggle */
function chime() {
  const c = ac(); if (!c) return;
  if (c.state === 'suspended') c.resume();
  [880, 1174, 1568].forEach((f, i) => setTimeout(() => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(.16, c.currentTime + .01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + .5);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + .55);
  }, i * 150));
}

function popAlert(title, whenTxt) {
  chime();
  if (notifyReady()) {
    try {
      const n = new Notification('Baron — starting in ' + ALERT_LEAD + ' min', { body: title + '\n' + whenTxt, tag: 'baron-' + title + whenTxt, requireInteraction: false });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (e) { /* fall through to the in-page card */ }
  }
  const old = $('.alert'); if (old) old.remove();
  const el = div('alert');
  el.innerHTML = '<div class="x">✕</div><div class="k">STARTING IN ' + ALERT_LEAD + ' MIN</div>' +
    '<div class="t">' + esc(title) + '</div><div class="w">' + esc(whenTxt) + '</div>';
  el.onclick = () => el.remove();
  document.body.appendChild(el);
  setTimeout(() => { if (el.isConnected) el.remove(); }, 60000);
}

function checkAlerts() {
  const t = todayStr();
  if (alertDay !== t) { alertDay = t; alerted = {}; }
  syncEventsOn(t);   // every event is a block now — make sure today's are current before scanning
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const d = dayOf(t);
  const items = d.blocks.map(b => ({ key: 'b' + b.id, s: b.start * 15, e: (b.start + b.len) * 15, title: taskLabel(b) }));
  items.forEach(it => {
    const lead = it.s - now;
    if (lead <= ALERT_LEAD && lead > 0 && !alerted[it.key]) {
      alerted[it.key] = true;
      popAlert(it.title, minLabel(it.s) + ' – ' + minLabel(it.e));
    }
  });
}

/* ---------------- view switching ---------------- */
let calScrollT = null;
function switchView(v) {
  if (v === 'cal' && $('#viewCal').hidden) calScrolled = false;   // each visit opens on this week
  $('#viewDay').hidden = v !== 'day';
  $('#viewCal').hidden = v !== 'cal';
  $('#viewTasks').hidden = v !== 'tasks';
  $('#viewStats').hidden = v !== 'stats';
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.view === v));
  renderAll();
  fitAllNavBars();
  if (v === 'day') scrollToNow(false);
  sfx('click');
}
function scrollToNow(smooth) {
  const w = $('#gridwrap');
  if (w.hidden) return;
  const target = cur === todayStr() ? nowSlotFloat() : GEO.sod;
  w.scrollTo({ top: Math.max(0, slotY(target) - w.clientHeight * 0.38), behavior: smooth ? 'smooth' : 'auto' });
}
function goDay(ds) { cur = ds; renderAll(); }

/* ---------------- wiring ---------------- */
function bind() {
  $$('.tab').forEach(t => t.onclick = () => switchView(t.dataset.view));
  $('#dPrev').onclick = () => { goDay(shiftD(cur, -1)); sfx('click'); };
  $('#dNext').onclick = () => { goDay(shiftD(cur, 1)); sfx('click'); };
  $('#btnToday').onclick = () => { goDay(todayStr()); scrollToNow(true); sfx('click'); };
  $('#btnQuick').onclick = () => { const s = cur === todayStr() ? Math.floor(nowSlotFloat()) : 36; openBlockEditor(null, clamp(s, 0, 92), 4); };
  $('#btnRecap').onclick = showRecap;
  $('#tkAdd').onclick = newTaskFromInput;
  $('#tkNew').addEventListener('keydown', e => { if (e.key === 'Enter') newTaskFromInput(); });
  $$('#tkVisSeg .seg').forEach(x => x.onclick = () => { tkVis = x.dataset.tv; $$('#tkVisSeg .seg').forEach(y => y.classList.toggle('on', y === x)); renderTasks(); sfx('click'); });
  $$('#tkSortSeg .seg').forEach(x => x.onclick = () => { tkSort = x.dataset.ts; $$('#tkSortSeg .seg').forEach(y => y.classList.toggle('on', y === x)); renderTasks(); sfx('click'); });
  $$('#rangeSeg .seg').forEach(s => s.onclick = () => { statRange = +s.dataset.r; $$('#rangeSeg .seg').forEach(x => x.classList.toggle('on', x === s)); renderStats(); sfx('click'); });
  $$('#metricSeg .seg').forEach(s => s.onclick = () => { statMetric = s.dataset.m; $$('#metricSeg .seg').forEach(x => x.classList.toggle('on', x === s)); renderStats(); sfx('click'); });
  $('#btnTable').onclick = () => { const t = $('#tablePanel'); t.hidden = !t.hidden; $('#btnTable').textContent = t.hidden ? 'TABLE VIEW' : 'HIDE TABLE'; sfx('click'); };
  window.addEventListener('resize', () => { fitAllNavBars(); renderAgenda(); if (!$('#viewStats').hidden) renderStats(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAllNavBars);
  $('#btnGrade').onclick = () => { const p = pendingBlocks(); if (p.length) openGrade(p[0].id); else toast('Nothing waiting on a grade'); };
  $('#btnHelp').onclick = openHelp;
  $('#btnMenu').onclick = openMenu;
  $('#btnSound').onclick = () => { S.settings.sound = !S.settings.sound; save(); renderRail(); if (S.settings.sound) sfx('score'); };
  $$('#calModeSeg .seg').forEach(x => x.onclick = () => setCalMode(x.dataset.cm));
  $('#btnCalAdd').onclick = () => { if (calMode === 'events') openEventEditor(null, cur); else openNewQuota(); };
  $('#btnCalToday').onclick = () => { scrollCalTo(todayStr(), true); sfx('click'); };
  $('#calwrap').addEventListener('scroll', () => { clearTimeout(calScrollT); calScrollT = setTimeout(calOnScroll, 60); });
  $('#calgrid').addEventListener('click', e => {
    const ev = e.target.closest('[data-ev]'), q = e.target.closest('[data-q]'), c = e.target.closest('[data-d]');
    if (ev && c) { openEventEditor(ev.dataset.ev, null, c.dataset.d); return; }
    if (q) { openQuotaEditor(q.dataset.q); return; }
    if (c) { if (calMode === 'events') openDayPanel(c.dataset.d); else openQuotaDay(c.dataset.d); }
  });

  $('#railQuotas').addEventListener('click', e => {
    const row = e.target.closest('.qrow'); if (!row) return;
    pushUndo(); toggleQuota(row.dataset.id); save();
    refreshQuotaViews();
    sfx('tick');
  });
  $('#agenda').addEventListener('click', e => { const r = e.target.closest('[data-ev]'); if (r) openEventEditor(r.dataset.ev, null, r.dataset.on); });
  $('#scrim').addEventListener('pointerdown', e => { if (e.target.id === 'scrim') closeModal(); });
  /* phone: the rail is a drawer behind the score bar */
  $('#mbar').onclick = e => { if (e.target.closest('#mMenu')) return; document.body.classList.toggle('railopen'); };
  $('#mMenu').onclick = openMenu;
  $('#railShade').onclick = () => document.body.classList.remove('railopen');
  $('.rail').addEventListener('click', e => { if (e.target.closest('button, .agrow')) setTimeout(() => document.body.classList.remove('railopen'), 120); });
  bindGrid();

  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === 'Escape') { closeModal(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (typing) return;
    if (gradeKeys && !$('#scrim').hidden) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 5) { applyGrade(gradeKeys, GRADES[n - 1].g); return; }
    }
    if (!$('#scrim').hidden) return;
    const k = e.key.toLowerCase();
    if (k === 'd') switchView('day');
    else if (k === 'q') { calMode = 'quotas'; switchView('cal'); }
    else if (k === 'c') { calMode = 'events'; switchView('cal'); }
    else if (k === 's') showRecap();
    else if (k === 't') switchView('tasks');
    else if (k === 'n') { goDay(todayStr()); scrollToNow(true); }
    else if (k === 'b') { const s = cur === todayStr() ? Math.floor(nowSlotFloat()) : 36; openBlockEditor(null, clamp(s, 0, 92), 4); }
    else if (k === '?') openHelp();
    else if (e.key === 'ArrowLeft' && !$('#viewDay').hidden) goDay(shiftD(cur, -1));
    else if (e.key === 'ArrowRight' && !$('#viewDay').hidden) goDay(shiftD(cur, 1));
  });

  window.addEventListener('beforeunload', () => { try { localStorage.setItem(LS_KEY, snapshot()); } catch (e) {} });
}
