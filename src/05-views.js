"use strict";
/* ---------------- QUOTAS ----------------
   A flat list over a 7-day sliding window anchored at `quotaAnchor` (default:
   today), one horizontal separator per day. `‹`/`›` shift the window ±7 days;
   THIS WEEK resets it back to today..today+6. A quota is a homework/milestone
   checklist item pinned to one date — never a Task, never instantiated into a
   block. This tab used to be called WEEKLY and show a 7-day grid with a
   DEADLINES/QUOTAS selector; that grid and the old per-task-per-day quota
   feature are gone for good — see CONTEXT.md §8/§13 for the history. What was
   called a "deadline" is what this tab now calls a quota. */
function quotaDays() { return Array.from({ length: 7 }, (_, i) => shiftD(quotaAnchor, i)); }
function renderQuotasList() {
  const t = todayStr();
  const days = quotaDays();
  $('#qLabel').textContent = quotaRangeLabel(days);
  const wrap = $('#quotaList'); wrap.innerHTML = '';
  days.forEach(ds => {
    const sep = div('qsep');
    sep.dataset.d = ds;
    const label = ds === t ? 'TODAY' : ds === shiftD(t, 1) ? 'TOMORROW' : prettyD(ds);
    sep.innerHTML = '<span class="ln"></span><span class="lbl">' + label + '</span><span class="ln"></span><span class="plus">+</span>';
    wrap.appendChild(sep);
    quotasOn(ds).forEach(it => {
      const row = div('qrow' + (it.done ? ' done' : ''));
      row.dataset.id = it.id;
      row.innerHTML = '<span class="tx">' + esc(it.text) + '</span>';
      wrap.appendChild(row);
    });
  });
}

/* naming a new quota — a minimal prompt, not the full editor. Called with a
   fixed date from clicking a day's separator, or with no date (the +QUOTA
   toolbar button) in which case a day picker is shown, defaulting to the
   first day of the window currently on screen. */
function openNewQuota(ds) {
  const t = todayStr();
  const days = ds ? null : quotaDays();
  const dayLabel = d => d === t ? 'TODAY' : d === shiftD(t, 1) ? 'TOMORROW' : prettyD(d);
  openModal(
    '<h3>NEW QUOTA<button class="btn sm x" data-x>✕</button></h3>' +
    (ds
      ? '<div class="field"><label>' + esc(prettyD(ds)) + '</label></div>'
      : '<div class="field"><label>DAY</label><select class="inp" id="qDay">' +
        days.map(d => '<option value="' + d + '">' + dayLabel(d) + '</option>').join('') + '</select></div>') +
    '<div class="field"><label>QUOTA</label><input class="inp" id="qName" data-autofocus placeholder="e.g. Problem set 4 due"></div>' +
    '<div class="modrow"><div class="spacer"></div><button class="btn green" data-add>ADD</button></div>'
  );
  const M = $('#modal');
  M.querySelector('[data-x]').onclick = closeModal;
  const commit = () => {
    const el = M.querySelector('#qName'), v = el.value.trim();
    if (!v) { el.focus(); return; }
    const day = ds || M.querySelector('#qDay').value;
    pushUndo(); addQuota(day, v); save(); closeModal();
    renderQuotasList(); renderRailQuotas();
    sfx('place');
  };
  M.querySelector('[data-add]').onclick = commit;
  M.querySelector('#qName').addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
}

/* the full editor for an EXISTING quota: rename, note, complete/uncomplete, delete */
function openQuotaEditor(id) {
  const it = S.quotas.find(x => x.id === id); if (!it) return;
  openModal(
    '<h3>' + esc(prettyD(it.date)) + '<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="field"><label>QUOTA</label><input class="inp" id="qT" data-autofocus value="' + esc(it.text) + '"></div>' +
    '<div class="field"><label>NOTE</label><textarea class="inp" id="qN" placeholder="details…">' + esc(it.note || '') + '</textarea></div>' +
    '<div class="modrow"><button class="btn red" data-del title="delete">🗑</button><div class="spacer"></div>' +
    '<button class="btn ' + (it.done ? '' : 'green') + '" data-toggle>' + (it.done ? 'UNCOMPLETE' : 'COMPLETE') + '</button></div>'
  );
  const M = $('#modal');
  const commitEdits = () => {
    const v = M.querySelector('#qT').value.trim();
    if (v) it.text = v;
    it.note = M.querySelector('#qN').value;
  };
  const refresh = () => { renderQuotasList(); renderRailQuotas(); };
  M.querySelector('[data-x]').onclick = () => { pushUndo(); commitEdits(); save(); closeModal(); refresh(); };
  M.querySelector('[data-del]').onclick = () => { pushUndo(); deleteQuota(it.id); save(); closeModal(); refresh(); sfx('back'); };
  M.querySelector('[data-toggle]').onclick = () => {
    pushUndo(); commitEdits(); toggleQuota(it.id); save(); closeModal(); refresh(); sfx(it.done ? 'score' : 'back');
  };
}

/* ---------------- CALENDAR ---------------- */
function renderCal() {
  $('#mLabel').textContent = MON[calM.getMonth()].toUpperCase() + ' ' + calM.getFullYear();
  const g = $('#calgrid'); g.innerHTML = '';
  const first = new Date(calM.getFullYear(), calM.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const t = todayStr();
  for (let i = 0; i < 42; i++) {
    const dt = new Date(start); dt.setDate(start.getDate() + i);
    const ds = fmtD(dt);
    syncEventsOn(ds);
    const d = dayOf(ds), evs = eventsOn(ds);
    const cell = div('day' + (dt.getMonth() !== calM.getMonth() ? ' out' : '') + (ds === t ? ' today' : '') + (ds === cur ? ' sel' : ''));
    cell.dataset.d = ds;
    const planned = d.blocks.reduce((a, b) => a + b.len, 0);
    const qs = quotasOn(ds), doneQ = qs.filter(x => x.done).length;
    cell.title = durLabel(bookedSlots(d)) + ' of a ' + durLabel(windowSlots(d)) + ' day  ·  rank ' + dayRank(d).toFixed(1) + ' / 10' +
      (qs.length ? '  ·  ' + doneQ + '/' + qs.length + ' quotas done' : '');
    const n = div('n');
    const scv = gradedSlots(d) ? dayScore(d) : null;
    n.innerHTML = '<span>' + dt.getDate() + '</span>' + (scv != null ? '<em>' + scv + '</em>' : (d.blocks.length ? '<em style="opacity:.45;color:#9fb0ad">' + d.blocks.length + ' blk</em>' : ''));
    cell.appendChild(n);
    const ordered = calOrder(evs);
    ordered.slice(0, 3).forEach(ev => {
      const e = div('ev', minLabel(ev.s) + ' ' + ev.title);
      e.style.background = isRepeating(ev) ? C_EVENT : C_ONEOFF;
      cell.appendChild(e);
    });
    if (ordered.length > 3) cell.appendChild(div('more', '+' + (ordered.length - 3) + ' more'));
    if (scv != null && scv >= 80) { const w = div('won', '♠'); w.style.color = '#ffc93d'; cell.appendChild(w); }
    const fill = div('fill'); const fi = document.createElement('i');
    /* this bar is QUOTA COMPLETION: fraction of that day's quotas marked done.
       No quotas at all → empty track (just the neutral grey .fill shows).
       Quotas exist but none done yet → a small visible sliver, so the day
       still reads as "something is due here". Fully done → green. */
    fi.style.width = (qs.length ? Math.max(doneQ / qs.length * 100, 8) : 0) + '%';
    fi.style.background = (qs.length && doneQ === qs.length) ? 'var(--green)' : 'var(--chip)';
    fill.appendChild(fi); cell.appendChild(fill);
    g.appendChild(cell);
  }
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
    const dot = div('dot'); dot.style.background = isRepeating(ev) ? C_EVENT : C_ONEOFF;
    const w = div('w');
    const when = ev.date === t ? 'TODAY' : ev.date === shiftD(t, 1) ? 'TOMORROW' : prettyD(ev.date);
    w.innerHTML = '<b>' + esc(ev.title) + (isRepeating(ev) ? ' <span style="opacity:.5;font-size:10px">↻</span>' : '') + '</b>' +
      '<span>' + when + '  ·  ' + minLabel(ev.s) + '–' + minLabel(ev.e) + '</span>';
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
  const rep = ev ? (ev.rep || 'none') : 'none';
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
      '<div class="two"><div class="field"><label>START</label><select class="inp" id="eS">' + minOptions(ev ? ev.s : 540) + '</select></div>' +
      '<div class="field"><label>END</label><select class="inp" id="eE">' + minOptions(ev ? ev.e : 600) + '</select></div></div>' +
      '<div class="field"><label>REPEAT</label><select class="inp" id="eR">' +
      REPEATS.map(r => '<option value="' + r.id + '"' + (r.id === rep ? ' selected' : '') + '>' + r.name + '</option>').join('') +
      '</select></div>' +
      '<div class="field" id="untilWrap"' + (rep === 'none' ? ' hidden' : '') + '><label>REPEAT UNTIL  (blank = forever)</label>' +
      '<input class="inp" type="date" id="eU" value="' + (ev && ev.until ? ev.until : '') + '"></div>') +
    (sealed ? '<div class="field"><label>WHEN</label><input class="inp ro" value="' + esc(prettyD(occ) + '  ·  ' + minLabel(ev.s) + '–' + minLabel(ev.e)) + '" readonly></div>' : '') +
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
  if (rsel) rsel.onchange = () => { M.querySelector('#untilWrap').hidden = rsel.value === 'none'; };

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
    let s = +M.querySelector('#eS').value, e = +M.querySelector('#eE').value;
    if (e <= s) e = Math.min(1440, s + 15);
    const repv = M.querySelector('#eR').value;
    const until = repv === 'none' ? null : (M.querySelector('#eU').value || null);
    /* A time or title change on a repeating event is ambiguous — every
       occurrence, or just this one going forward? Ask, unless occ is the
       series' own anchor date, where "and every occurrence after" already
       means "all of them" and there's nothing to disambiguate. A note-only
       change (nothing else different) keeps applying to the whole series
       without asking — that's the one deliberate simplification kept from
       before, and it's called out in the hint above the NOTE field. */
    if (ev && isRepeating(ev) && occ !== ev.date && (title !== ev.title || s !== ev.s || e !== ev.e)) {
      closeModal();
      openScopeChoice(ev, occ, { title, s, e, note, repv, until });
      return;
    }
    pushUndo();
    if (ev) Object.assign(ev, { title, date, s, e, note: note, rep: repv, until: until });
    else S.events.push({ id: uid(), title, date, s, e, note: note, rep: repv, until: until, skip: [] });
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
    S.events.push({ id: uid(), title: edits.title, date: occ, s: edits.s, e: edits.e, note: edits.note, rep: 'none', until: null, skip: [] });
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
    S.events.push({ id: uid(), title: edits.title, date: occ, s: edits.s, e: edits.e, note: edits.note, rep: edits.repv, until: edits.until, skip: carriedSkips });
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
    (evs.length ? calOrder(evs).map(e => '<div class="trow click" data-ev="' + e.id + '"><span class="dot" style="width:12px;height:12px;border-radius:4px;border:2px solid #000;background:' + (isRepeating(e) ? C_EVENT : C_ONEOFF) + '"></span><span class="w">' + esc(e.title) + (isRepeating(e) ? ' ↻' : '') + '</span><small>' + minLabel(e.s) + '–' + minLabel(e.e) + '</small></div>').join('') : '<div class="hint">No events this day.</div>') +
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
   Shared by copyInto (CALENDAR) and autofillDay (DAILY): only TASK blocks
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
  taskBlocks(src).slice().sort((a, b) => a.start - b.start).forEach(b => {
    let run = null;
    const flush = () => { if (run) { dst.blocks.push({ id: uid(), start: run.s, len: run.l, taskId: b.taskId, note: b.note, done: false, grade: null }); n++; run = null; } };
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

/* ---------------- AUTOFILL (DAILY toolbar) ----------------
   Copies just the TASK blocks (never events, never quotas) from another day
   into `cur`, either merged around whatever is already booked (mode 'keep',
   the default — same free-space-only carving copyInto uses) or after
   wiping cur's existing blocks first (mode 'wipe' — events included in the
   wipe, since syncEventsOn/renderAll rebuild them fresh regardless, same as
   ☰ Menu's CLEAR EVERY BLOCK). */
function autofillDay(srcDs, dstDs, wipe) {
  if (isPastDay(dstDs)) { toast('Past days are archived'); return; }
  if (!taskBlocks(dayOf(srcDs)).length) { toast('Nothing to copy from ' + prettyD(srcDs)); return; }
  pushUndo();
  if (wipe) getDay(dstDs).blocks = [];
  const n = mergeBlocksFreeSpace(srcDs, dstDs);
  save(); closeModal(); renderAll(); sfx('place');
  toast(n ? n + ' block' + (n === 1 ? '' : 's') + ' autofilled from ' + prettyD(srcDs) : 'No free space to autofill into');
}

function openAutofill() {
  if (isPastDay(cur)) { toast('Past days are archived'); return; }
  const yestDs = shiftD(cur, -1), lastWkDs = shiftD(cur, -7);
  const label = cur === todayStr() ? 'TODAY' : prettyD(cur);
  let src = null, mode = 'keep';
  openModal(
    '<h3>AUTOFILL ' + esc(label) + '<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="field"><label>COPY BLOCKS FROM</label>' +
    '<div class="modrow" style="flex-wrap:wrap;gap:7px;margin-top:2px">' +
    '<button class="btn sm" data-src="yest">YESTERDAY<br><small style="font-weight:600;opacity:.7">' + esc(prettyD(yestDs)) + '</small></button>' +
    '<button class="btn sm" data-src="lastweek">SAME DAY LAST WEEK<br><small style="font-weight:600;opacity:.7">' + esc(prettyD(lastWkDs)) + '</small></button>' +
    '<button class="btn sm" data-src="pick">CHOOSE A DAY</button>' +
    '</div>' +
    '<input class="inp" type="date" id="afDate" value="' + yestDs + '" style="margin-top:8px" hidden></div>' +
    '<div class="field"><label>IF ' + esc(label) + ' ALREADY HAS BLOCKS</label>' +
    '<div class="modrow" style="flex-direction:column;gap:8px;align-items:stretch;margin-top:2px">' +
    '<button class="btn gold" data-mode="keep">KEEP MINE — autofill only fills the empty time</button>' +
    '<button class="btn" data-mode="wipe">DELETE MINE FIRST — autofill replaces everything</button>' +
    '</div></div>' +
    '<div class="modrow"><div class="spacer"></div><button class="btn green" data-go>AUTOFILL</button></div>'
  );
  const M = $('#modal');
  M.querySelector('[data-x]').onclick = closeModal;
  const srcBtns = M.querySelectorAll('[data-src]'), modeBtns = M.querySelectorAll('[data-mode]');
  const dateInp = M.querySelector('#afDate');
  srcBtns.forEach(b => b.onclick = () => {
    src = b.dataset.src;
    srcBtns.forEach(x => x.classList.toggle('gold', x === b));
    dateInp.hidden = src !== 'pick';
    if (src === 'pick') dateInp.focus();
  });
  modeBtns.forEach(b => b.onclick = () => {
    mode = b.dataset.mode;
    modeBtns.forEach(x => x.classList.toggle('gold', x === b));
  });
  M.querySelector('[data-go]').onclick = () => {
    const srcDs = src === 'yest' ? yestDs : src === 'lastweek' ? lastWkDs : src === 'pick' ? dateInp.value : null;
    if (!srcDs) { toast('Pick a day to copy from'); return; }
    if (srcDs === cur) { toast('Pick a different day'); return; }
    autofillDay(srcDs, cur, mode === 'wipe');
  };
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
  const svg = box.querySelector('svg'), tip = $('#ctip');
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
    tip.style.left = (x(i) * r.width / W) + 'px';
    tip.style.top = (y(val(p)) * r.height / H) + 'px';
    tip.innerHTML = '<b style="color:' + M.color + '">' + M.fmt(val(p)) + (statMetric === 'score' ? ' / 100' : statMetric === 'rank' ? ' / 10' : '') + '</b>' +
      '<span>' + prettyD(p.ds) + '  ·  ' + p.graded + '/' + p.total + ' graded  ·  ' + durLabel(p.slots) + '</span>' +
      '<span style="display:block;margin-top:2px">score ' + p.score + '  ·  rank ' + p.rank.toFixed(1) + '  ·  <b style="display:inline;font-family:inherit;font-size:inherit" class="goldtxt">' + p.gold.toLocaleString() + ' gold</b></span>';
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
  const fsLine = fsStatus === 'on'
    ? '<div class="li"><span id="fsDot">● auto-saving to <b>' + esc(fileHandle ? fileHandle.name : 'file') + '</b></span></div>'
    : fsStatus === 'need'
      ? '<div class="li"><span>File link paused — the browser needs permission again</span></div>'
      : fsStatus === 'unsupported'
        ? '<div class="hint">This browser can’t auto-save to a file. Chrome, Edge or Brave can. Use EXPORT for manual backups.</div>'
        : '<div class="hint">Right now everything lives in this browser only. Link a real file and every change writes straight to your disk — survives restarts, cache clears, and you can put it in Dropbox/iCloud.</div>';
  openModal(
    '<h3>☰ MENU<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="field"><label>SAVE TO DISK</label>' + fsLine +
    '<div class="modrow" style="margin-top:9px">' +
    (fsStatus === 'need' ? '<button class="btn green" data-grant>RESUME AUTO-SAVE</button>' : '') +
    '<button class="btn ' + (fsStatus === 'on' ? '' : 'green') + '" data-link>' + (fsStatus === 'on' ? 'CHANGE FILE' : 'SAVE TO A FILE…') + '</button>' +
    '<button class="btn blue" data-open>OPEN A SAVE FILE…</button>' +
    '</div></div>' +
    '<div class="field"><label>ALERTS</label>' +
    '<div class="li"><span>' + (typeof Notification === 'undefined' ? 'This browser has no desktop notifications'
      : Notification.permission === 'granted' ? '● desktop alerts on'
      : Notification.permission === 'denied' ? 'Desktop alerts blocked — Baron pops its own card instead'
      : 'Desktop alerts not enabled yet — Baron pops its own card instead') + '</span></div>' +
    '<div class="hint" style="margin-top:8px">Every block and event gets a chime ' + ALERT_LEAD + ' minutes before it starts. This ignores the ♪ mute, and only works while Baron is open in a tab.</div>' +
    (typeof Notification !== 'undefined' && Notification.permission === 'default'
      ? '<div class="modrow" style="margin-top:9px"><button class="btn sm green" data-notify>ENABLE DESKTOP ALERTS</button></div>' : '') +
    '</div>' +
    '<div class="field"><label>BACKUPS</label><div class="modrow" style="margin-top:0"><button class="btn sm" data-exp>EXPORT .JSON</button><button class="btn sm" data-imp>IMPORT .JSON</button></div></div>' +
    '<div class="field"><label>THIS DAY  ·  ' + prettyD(cur) + '</label><div class="modrow" style="margin-top:0">' +
    '<button class="btn sm red" data-clear>CLEAR EVERY BLOCK</button></div></div>' +
    '<div class="field"><label>ALL TIME</label><div class="li"><span>Days with something graded</span><span class="amt">' + Object.keys(S.days).filter(k => hasActivity(k)).length + '</span></div>' +
    '<div class="li" style="margin-top:6px"><span class="goldtxt">Best gold</span><span class="amt">' + (bestDay().gold || '—') + '</span></div></div>' +
    '<div class="modrow"><button class="btn sm red" data-reset>RESET EVERYTHING</button><div class="spacer"></div><button class="btn gold" data-x>DONE</button></div>'
  );
  const M = $('#modal');
  M.querySelectorAll('[data-x]').forEach(b => b.onclick = closeModal);
  M.querySelector('[data-link]').onclick = () => linkFile(false);
  M.querySelector('[data-open]').onclick = () => linkFile(true);
  const gr = M.querySelector('[data-grant]'); if (gr) gr.onclick = () => { grantHandle(); closeModal(); };
  const nb = M.querySelector('[data-notify]');
  if (nb) nb.onclick = () => { askNotify(); closeModal(); };
  M.querySelector('[data-exp]').onclick = exportJSON;
  M.querySelector('[data-imp]').onclick = importJSON;
  M.querySelector('[data-clear]').onclick = () => {
    if (isPastDay(cur)) { toast('Past days are archived'); return; }
    const d = getDay(cur);
    if (!d.blocks.length) { toast('That day is already empty'); return; }
    pushUndo(); d.blocks = [];
    save(); closeModal(); renderAll(); sfx('back'); toast('Day cleared — Ctrl+Z undoes it');
  };
  let armed = false;
  const rb = M.querySelector('[data-reset]');
  rb.onclick = () => {
    if (!armed) { armed = true; rb.textContent = 'REALLY? CLICK AGAIN'; setTimeout(() => { armed = false; rb.textContent = 'RESET EVERYTHING'; }, 3500); return; }
    pushUndo(); S = BLANK(); cur = todayStr(); save(); closeModal(); renderAll(); toast('Wiped clean');
  };
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
    ['B', 'new block'], ['N', 'jump to now'], ['T / Q / K / C', 'daily / quotas / tasks / calendar'], ['S', 'recap today (→ SEE ALL STATS)'],
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
    'Three numbers come out of that:<br>' +
    '<b style="color:#0093ff">SCORE / 100</b> — how well you did what you booked, weighted by block length. Ungraded time counts as zero, so it stays honest.<br>' +
    '<b style="color:#e2564c">RANK / 10</b> — how full your working day was. Time that counted ÷ the window between <b style="color:#9a5bd6">SOD</b> and <b style="color:#9a5bd6">EOD</b>, × 10. That window is 9:00a–10:00p unless blocks reach past either edge. <b>F</b> and <b>U</b> hand all their time back, <b>D</b> hands back half — so a day you slept through ranks near zero however much you booked.<br>' +
    '<b class="goldtxt">GOLD / 1000</b> — score × rank. It only goes up if you both booked a real day <i>and</i> did it well.' +
    '</div>' +
    rows.map(r => '<div class="helprow"><span class="kbd">' + r[0] + '</span><b>' + r[1] + '</b></div>').join('') +
    '<div class="hint" style="font-size:12.5px;line-height:1.6;margin-top:12px">Your run saves in this browser automatically. Open <b>☰ Menu → SAVE TO DISK</b> once and it also writes every change straight into a real <b>.json</b> file on your computer — so a restart, a cache clear, or a new browser can’t lose it. Put that file in Dropbox/iCloud and it follows you.</div>' +
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
  if (typeof Notification === 'undefined') { toast('This browser has no notifications — Baron will pop its own'); return; }
  if (Notification.permission === 'granted') { toast('Alerts are already on'); return; }
  Notification.requestPermission().then(p => {
    toast(p === 'granted' ? 'Desktop alerts on' : 'Desktop alerts blocked — Baron will pop its own instead');
    renderAll();
  }).catch(() => toast('Desktop alerts unavailable here'));
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
function switchView(v) {
  $('#viewDay').hidden = v !== 'day';
  $('#viewWeek').hidden = v !== 'week';
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
  $('#btnAutofill').onclick = openAutofill;
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
  $('#mPrev').onclick = () => { calM = new Date(calM.getFullYear(), calM.getMonth() - 1, 1); renderCal(); sfx('click'); };
  $('#mNext').onclick = () => { calM = new Date(calM.getFullYear(), calM.getMonth() + 1, 1); renderCal(); sfx('click'); };
  $('#btnMToday').onclick = () => { calM = new Date(); renderCal(); };
  $('#btnNewEvt').onclick = () => openEventEditor(null, cur);
  $('#calgrid').addEventListener('click', e => { const c = e.target.closest('[data-d]'); if (c) openDayPanel(c.dataset.d); });

  $('#qPrev').onclick = () => { quotaAnchor = shiftD(quotaAnchor, -7); renderQuotasList(); fitQuotaNav(); sfx('click'); };
  $('#qNext').onclick = () => { quotaAnchor = shiftD(quotaAnchor, 7); renderQuotasList(); fitQuotaNav(); sfx('click'); };
  $('#btnQThis').onclick = () => { quotaAnchor = todayStr(); renderQuotasList(); fitQuotaNav(); sfx('click'); };
  $('#btnNewQuota').onclick = () => openNewQuota();
  $('#quotaList').addEventListener('click', e => {
    const sep = e.target.closest('.qsep'); if (sep) { openNewQuota(sep.dataset.d); return; }
    const row = e.target.closest('.qrow'); if (row) { openQuotaEditor(row.dataset.id); return; }
  });
  $('#railQuotas').addEventListener('click', e => {
    const row = e.target.closest('.qrow'); if (!row) return;
    pushUndo(); toggleQuota(row.dataset.id); save();
    renderRailQuotas(); if (!$('#viewWeek').hidden) renderQuotasList();
    sfx('tick');
  });
  $('#agenda').addEventListener('click', e => { const r = e.target.closest('[data-ev]'); if (r) openEventEditor(r.dataset.ev, null, r.dataset.on); });
  $('#scrim').addEventListener('pointerdown', e => { if (e.target.id === 'scrim') closeModal(); });
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
    if (k === 't') switchView('day');
    else if (k === 'q') switchView('week');
    else if (k === 'c') switchView('cal');
    else if (k === 's') showRecap();
    else if (k === 'k') switchView('tasks');
    else if (k === 'n') { goDay(todayStr()); scrollToNow(true); }
    else if (k === 'b') { const s = cur === todayStr() ? Math.floor(nowSlotFloat()) : 36; openBlockEditor(null, clamp(s, 0, 92), 4); }
    else if (k === '?') openHelp();
    else if (e.key === 'ArrowLeft' && !$('#viewDay').hidden) goDay(shiftD(cur, -1));
    else if (e.key === 'ArrowRight' && !$('#viewDay').hidden) goDay(shiftD(cur, 1));
  });

  window.addEventListener('beforeunload', () => { try { localStorage.setItem(LS_KEY, snapshot()); } catch (e) {} });
}

/* ---------------- boot ---------------- */
(async function init() {
  loadLocal();
  await restoreHandle();
  sealPastDays(true);
  /* one-time (per save) migration: materialize every event that was sitting
     "unpulled" under the old manual-pull system into a real event-block, and
     persist it immediately so this isn't just an in-memory patch that has to
     be recomputed every boot. */
  if (syncAllEventBlocks()) save();
  refreshStreak();
  cur = todayStr();
  calM = new Date();
  quotaAnchor = todayStr();
  bind();
  renderAll();
  scrollToNow(false);
  checkAlerts();
  setInterval(checkAlerts, 30000);
  setInterval(() => { if (!$('#viewDay').hidden && cur === todayStr()) renderDay(); }, 30000);
  /* midnight rollover: seal yesterday, then refresh everything */
  setInterval(() => { if (sealPastDays()) renderAll(); refreshStreak(); renderRail(); renderAgenda(); }, 60000);
  if (!localStorage.getItem('baron.seen')) {
    try { localStorage.setItem('baron.seen', '1'); } catch (e) {}
    setTimeout(openHelp, 500);
  } else if (fsStatus === 'need') {
    setTimeout(() => toast('Open ☰ to resume auto-saving to your file'), 700);
  }
})();
