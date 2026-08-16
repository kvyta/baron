"use strict";
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
    const d = dayOf(ds), evs = eventsOn(ds);
    const cell = div('day' + (dt.getMonth() !== calM.getMonth() ? ' out' : '') + (ds === t ? ' today' : '') + (ds === cur ? ' sel' : ''));
    cell.dataset.d = ds;
    const planned = d.blocks.reduce((a, b) => a + b.len, 0);
    const n = div('n');
    const scv = gradedSlots(d) ? dayScore(d) : null;
    n.innerHTML = '<span>' + dt.getDate() + '</span>' + (scv != null ? '<em>' + scv + '</em>' : (d.blocks.length ? '<em style="opacity:.45;color:#9fb0ad">' + d.blocks.length + ' blk</em>' : ''));
    cell.appendChild(n);
    evs.slice(0, 3).forEach(ev => {
      const e = div('ev', minLabel(ev.s) + ' ' + ev.title);
      e.style.background = C_EVENT; cell.appendChild(e);
    });
    if (evs.length > 3) cell.appendChild(div('more', '+' + (evs.length - 3) + ' more'));
    if (scv != null && scv >= 80) { const w = div('won', '♠'); w.style.color = '#ffc93d'; cell.appendChild(w); }
    const fill = div('fill'); const fi = document.createElement('i');
    fi.style.width = clamp(planned / 64 * 100, 0, 100) + '%';
    fi.style.background = (scv != null && scv >= 80) ? 'var(--green)' : 'var(--chip)';
    fill.appendChild(fi); cell.appendChild(fill);
    g.appendChild(cell);
  }
  /* agenda */
  const a = $('#agenda'); a.innerHTML = '';
  const up = upcoming(t, 60, 8);
  const h = document.createElement('h4'); h.textContent = 'NEXT UP'; a.appendChild(h);
  if (!up.length) { const e = div('hint', 'No upcoming events. Hit + NEW EVENT.'); a.appendChild(e); }
  up.forEach(ev => {
    const r = div('agrow'); r.dataset.ev = ev.id; r.dataset.on = ev.on;
    const dot = div('dot'); dot.style.background = C_EVENT;
    const w = div('w');
    w.innerHTML = '<b>' + esc(ev.title) + (isRepeating(ev) ? ' <span style="opacity:.5;font-size:10px">↻</span>' : '') + '</b><span>' +
      prettyD(ev.date) + '  ·  ' + minLabel(ev.s) + '–' + minLabel(ev.e) + (isRepeating(ev) ? '  ·  ' + repName(ev.rep).toLowerCase() : '') + '</span>';
    r.appendChild(dot); r.appendChild(w);
    a.appendChild(r);
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
  openModal(
    '<h3>' + (ev ? '✎ EDIT EVENT' : '＋ NEW EVENT') + '<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="field"><label>TITLE</label><input class="inp" id="eT" data-autofocus value="' + esc(ev ? ev.title : '') + '" placeholder="Standup / 1:1 / dentist…"></div>' +
    '<div class="field"><label>' + (isRepeating(ev) ? 'FIRST DATE' : 'DATE') + '</label><input class="inp" type="date" id="eD" value="' + ds + '"></div>' +
    '<div class="two"><div class="field"><label>START</label><select class="inp" id="eS">' + minOptions(ev ? ev.s : 540) + '</select></div>' +
    '<div class="field"><label>END</label><select class="inp" id="eE">' + minOptions(ev ? ev.e : 600) + '</select></div></div>' +
    '<div class="field"><label>REPEAT</label><select class="inp" id="eR">' +
    REPEATS.map(r => '<option value="' + r.id + '"' + (r.id === rep ? ' selected' : '') + '>' + r.name + '</option>').join('') +
    '</select></div>' +
    '<div class="field" id="untilWrap"' + (rep === 'none' ? ' hidden' : '') + '><label>REPEAT UNTIL  (blank = forever)</label>' +
    '<input class="inp" type="date" id="eU" value="' + (ev && ev.until ? ev.until : '') + '"></div>' +
    '<div class="field"><label>NOTE</label><textarea class="inp" id="eN" placeholder="link, room, agenda…">' + esc(ev ? ev.note : '') + '</textarea></div>' +
    (isRepeating(ev) ? '<div class="hint" style="margin-bottom:8px">Editing changes every occurrence of this event.</div>' : '') +
    '<div class="modrow">' +
    (ev && isRepeating(ev) ? '<button class="btn sm red" data-skip>SKIP ' + prettyD(occ) + '</button><button class="btn sm red" data-del>DELETE ALL</button>'
      : ev ? '<button class="btn red" data-del>DELETE</button>' : '') +
    '<div class="spacer"></div><button class="btn green" data-save>' + (ev ? 'SAVE' : 'ADD EVENT') + '</button></div>'
  );
  const M = $('#modal');
  M.querySelector('#eR').onchange = () => { M.querySelector('#untilWrap').hidden = M.querySelector('#eR').value === 'none'; };
  const sk = M.querySelector('[data-skip]');
  if (sk) sk.onclick = () => {
    pushUndo();
    ev.skip = (ev.skip || []).concat([occ]);
    save(); closeModal(); renderAll(); sfx('back'); toast('Skipped just that day');
  };
  const commit = () => {
    const title = M.querySelector('#eT').value.trim() || 'Event';
    const date = M.querySelector('#eD').value || ds;
    let s = +M.querySelector('#eS').value, e = +M.querySelector('#eE').value;
    if (e <= s) e = Math.min(1440, s + 15);
    const repv = M.querySelector('#eR').value;
    const until = repv === 'none' ? null : (M.querySelector('#eU').value || null);
    pushUndo();
    if (ev) Object.assign(ev, { title, date, s, e, note: M.querySelector('#eN').value, rep: repv, until: until });
    else S.events.push({ id: uid(), title, date, s, e, note: M.querySelector('#eN').value, rep: repv, until: until, skip: [] });
    save(); closeModal(); renderAll(); sfx('place');
  };
  M.querySelector('[data-save]').onclick = commit;
  M.querySelector('#eT').addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
  const del = M.querySelector('[data-del]');
  if (del) del.onclick = () => { pushUndo(); S.events = S.events.filter(x => x.id !== ev.id); save(); closeModal(); renderAll(); sfx('back'); };
  M.querySelector('[data-x]').onclick = closeModal;
}

function openDayPanel(ds) {
  const d = dayOf(ds), evs = eventsOn(ds), sc = dayScore(d);
  openModal(
    '<h3>' + prettyD(ds) + '<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="li"><span>Score</span><span class="amt" style="color:var(--chip)">' + (gradedSlots(d) ? sc + ' / 100' : '—') + '</span></div>' +
    '<div class="li" style="margin-top:6px"><span>Rank</span><span class="amt" style="color:var(--mult)">' + dayRank(d).toFixed(1) + ' / 10</span></div>' +
    '<div class="li" style="margin-top:6px"><span class="goldtxt">Gold</span><span class="amt">' + (gradedSlots(d) ? dayGold(d).toLocaleString() : '—') + '</span></div>' +
    '<div class="li" style="margin-top:6px"><span>Blocks</span><span class="amt">' + taskBlocks(d).filter(b => b.done).length + '/' + taskBlocks(d).length + '</span></div>' +
    '<div class="field" style="margin-top:14px"><label>EVENTS</label><div class="tlist" id="evList">' +
    (evs.length ? evs.map(e => '<div class="trow" data-ev="' + e.id + '"><span class="dot" style="width:12px;height:12px;border-radius:4px;border:2px solid #000;background:' + C_EVENT + '"></span><span class="w">' + esc(e.title) + (isRepeating(e) ? ' ↻' : '') + '</span><small>' + minLabel(e.s) + '–' + minLabel(e.e) + '</small></div>').join('') : '<div class="hint">No events this day.</div>') +
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

/* ---------------- copy / templates ---------------- */
function copyInto(srcDs, dstDs) {
  const src = dayOf(srcDs);
  if (!src.blocks.length) { toast('Nothing to copy from ' + prettyD(srcDs)); return 0; }
  pushUndo();
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
  save(); renderAll(); sfx('place');
  return n;
}
function openTemplates() {
  openModal(
    '<h3>♦ TEMPLATES<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="hint" style="margin-bottom:8px">Anything you copy in fills only empty time — blocks and events already on <b>' + prettyD(cur) + '</b> win every conflict and stay put.</div>' +
    '<div class="tlist" id="tl">' +
    (S.templates.length ? S.templates.map(t => '<div class="trow"><span class="w">' + esc(t.name) + '</span><small>' + t.blocks.length + ' blocks</small><button class="btn sm green" data-load="' + t.id + '">LOAD</button><button class="btn sm red" data-del="' + t.id + '">✕</button></div>').join('') : '<div class="hint">No templates yet — build a good day, then save it below.</div>') +
    '</div>' +
    '<div class="modrow"><input class="inp" id="tName" placeholder="name this day…" value="' + esc(prettyD(cur)) + '"><button class="btn gold" data-save>SAVE CURRENT DAY</button></div>' +
    '<div class="field" style="margin-top:14px"><label>OR COPY FROM A REAL DAY</label>' +
    '<div class="modrow" style="margin-top:0"><button class="btn sm blue" data-yest>COPY YESTERDAY</button>' +
    '<button class="btn sm" data-pick>COPY A DAY…</button><div class="spacer"></div></div></div>'
  );
  const M = $('#modal');
  M.querySelector('[data-x]').onclick = closeModal;
  M.querySelector('[data-yest]').onclick = () => {
    const n = copyInto(shiftD(cur, -1), cur);
    closeModal();
    if (n) toast(n + ' block' + (n > 1 ? 's' : '') + ' copied from yesterday');
  };
  M.querySelector('[data-pick]').onclick = openCopyFrom;
  M.querySelector('[data-save]').onclick = () => {
    const d = dayOf(cur);
    if (!d.blocks.length) { toast('This day is empty'); return; }
    pushUndo();
    S.templates.push({ id: uid(), name: M.querySelector('#tName').value.trim() || 'Template', blocks: taskBlocks(d).map(b => ({ start: b.start, len: b.len, taskId: b.taskId, note: b.note })) });
    save(); openTemplates(); sfx('place'); toast('Template saved');
  };
  M.querySelector('#tl').addEventListener('click', e => {
    const l = e.target.closest('[data-load]'), x = e.target.closest('[data-del]');
    if (l) {
      const t = S.templates.find(v => v.id === l.dataset.load); if (!t) return;
      pushUndo();
      const dst = getDay(cur), occ = occupancy(dst, true, cur);
      let n = 0;
      t.blocks.forEach(b => {
        let run = null;
        const flush = () => { if (run) { dst.blocks.push({ id: uid(), start: run.s, len: run.l, taskId: b.taskId, note: b.note, done: false, grade: null }); n++; run = null; } };
        for (let i = b.start; i < b.start + b.len && i < SLOTS; i++) { if (!occ[i]) { if (!run) run = { s: i, l: 0 }; run.l++; occ[i] = 'n'; } else flush(); }
        flush();
      });
      dst.blocks.sort((a, b) => a.start - b.start);
      save(); closeModal(); renderAll(); sfx('place'); toast(n + ' blocks loaded');
    }
    if (x) { pushUndo(); S.templates = S.templates.filter(v => v.id !== x.dataset.del); save(); openTemplates(); }
  });
}
function openCopyFrom() {
  openModal(
    '<h3>COPY A DAY IN<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="hint" style="margin-bottom:10px">Copies every block from that day into <b>' + prettyD(cur) + '</b>. Anything already scheduled — blocks and calendar events — wins the conflict and stays put.</div>' +
    '<div class="field"><label>SOURCE DAY</label><input class="inp" type="date" id="cD" value="' + shiftD(cur, -1) + '"></div>' +
    '<div class="modrow"><button class="btn sm" data-quick="-1">YESTERDAY</button><button class="btn sm" data-quick="-7">LAST WEEK</button><div class="spacer"></div><button class="btn green" data-go>COPY IN</button></div>'
  );
  const M = $('#modal');
  M.querySelector('[data-x]').onclick = closeModal;
  M.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => { M.querySelector('#cD').value = shiftD(cur, +b.dataset.quick); });
  M.querySelector('[data-go]').onclick = () => {
    const src = M.querySelector('#cD').value; if (!src) return;
    const n = copyInto(src, cur); closeModal();
    if (n) toast(n + ' block' + (n > 1 ? 's' : '') + ' copied in');
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
  if (!d.blocks.length) { toast('Nothing planned on this day yet'); return; }
  const fb = (FEEDBACK.find(f => sc >= f[0]) || FEEDBACK[FEEDBACK.length - 1])[1];
  const per = {};
  tb.forEach(b => { if (!b.done) return; per[b.grade] = (per[b.grade] || 0) + b.len; });
  const maxV = Math.max(1, ...Object.values(per));
  const gradeCount = GRADES.map(g => [g, d.blocks.filter(b => b.grade === g.g).length]).filter(x => x[1]);
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
    '<div class="li"><span>Time booked</span><span class="amt">' + durLabel(bookedSlots(d)) + ' of ' + DAY_HOURS + 'h</span></div>' +
    (bookedSlots(d) !== scoreWeight(d) ? '<div class="li"><span>Of that, events (not scored)</span><span class="amt" style="color:var(--event)">' + durLabel(bookedSlots(d) - scoreWeight(d)) + '</span></div>' : '') +
    (doneN ? '<div class="li"><span>Score on graded time only</span><span class="amt">' + gradedScore(d) + '</span></div>' : '') +
    (gradeCount.length ? '<div class="li"><span>Report card</span><span class="amt">' + gradeCount.map(x => x[1] + '×' + x[0].g).join('  ') + '</span></div>' : '') +
    '<div class="li"><span>Streak of graded days</span><span class="amt">' + computeStreak() + '</span></div>' +
    '<div class="li"><span class="goldtxt">Best gold so far</span><span class="amt">' + (bd.gold ? bd.gold.toLocaleString() + (bd.date === cur ? ' ← today' : '') : '—') + '</span></div>' +
    '</div>' +
    (Object.keys(per).length ? '<div class="field"><label>HOURS BY GRADE</label><div class="bars">' +
      GRADES.filter(g => per[g.g]).map(g =>
        '<div class="bar" style="--c:' + g.color + '"><span class="nm">' + g.g + ' — ' + g.label + '</span><span class="tr"><i style="width:' + (per[g.g] / maxV * 100) + '%"></i></span><span class="vv">' + durLabel(per[g.g]) + '</span></div>'
      ).join('') + '</div></div>' : '') +
    '<div class="hint" style="font-size:12.5px;margin-top:10px;opacity:.85">' + fb + '</div>' +
    '<div class="modrow"><div class="spacer"></div><button class="btn gold" data-x>DONE</button></div></div>',
    'wide'
  );
  requestAnimationFrame(() => $$('#modal .bar .tr i').forEach(i => { const w = i.style.width; i.style.width = '0'; requestAnimationFrame(() => i.style.width = w); }));
  $('#modal').querySelectorAll('[data-x]').forEach(b => b.onclick = closeModal);
}

/* ---------------- TASKS ---------------- */
let tkVis = 'visible', tkSort = 'new';

function renderTasks() {
  const L = $('#tklist'); L.innerHTML = '';
  const stats = {};
  S.tasks.forEach(t => stats[t.id] = taskStats(t.id));
  let list = S.tasks.filter(t => tkVis === 'all' ? true : tkVis === 'hidden' ? t.hidden : !t.hidden);
  if (tkSort === 'az') list.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  else if (tkSort === 'freq') list.sort((a, b) => stats[b.id].slots - stats[a.id].slots || a.name.localeCompare(b.name));
  else list.sort((a, b) => (b.created || 0) - (a.created || 0));

  $('#tkHdr').innerHTML = '<span>' + list.length + ' TASK' + (list.length === 1 ? '' : 'S') + '  ·  ' +
    tkVis.toUpperCase() + '  ·  ' + (tkSort === 'az' ? 'A–Z' : tkSort === 'freq' ? 'BY FREQUENCY' : 'NEWEST FIRST') +
    '</span><span>HOURS  ·  BLOCKS</span>';

  if (!list.length) {
    L.appendChild(div('tkempty', S.tasks.length ? 'nothing here — try another filter' : 'no tasks yet — add one above'));
    return;
  }

  list.forEach(t => {
    const st = stats[t.id];
    const r = div('tkrow' + (t.hidden ? ' hid' : ''));
    const inp = document.createElement('input');
    inp.className = 'nm'; inp.value = t.name; inp.spellcheck = false;
    inp.onchange = () => {
      const v = inp.value.trim();
      if (!v) { inp.value = t.name; return; }
      pushUndo(); t.name = v; save(); renderTasks(); renderRail();
    };
    inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); };
    r.appendChild(inp);

    const hrs = div('hrs', st.slots ? durLabel(st.slots) : '—');
    const cnt = div('cnt', st.count + ' blk');
    const eye = document.createElement('button');
    eye.className = 'btn sm' + (t.hidden ? '' : ' green');
    eye.textContent = t.hidden ? 'SHOW' : 'HIDE';
    eye.title = t.hidden ? 'show this task in the block picker and stats' : 'hide it — old blocks are kept';
    eye.onclick = () => { pushUndo(); t.hidden = !t.hidden; save(); renderTasks(); sfx('click'); };

    const del = document.createElement('button');
    del.className = 'btn sm red';
    del.textContent = '✕';
    if (st.count) {
      del.disabled = true;
      del.title = 'used by ' + st.count + ' block' + (st.count === 1 ? '' : 's') + ' — hide it instead';
    } else {
      del.title = 'delete this task';
      del.onclick = () => { pushUndo(); S.tasks = S.tasks.filter(x => x.id !== t.id); save(); renderTasks(); sfx('back'); };
    }
    r.appendChild(hrs); r.appendChild(cnt); r.appendChild(eye); r.appendChild(del);
    L.appendChild(r);
  });
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
      slots: bookedSlots(d), gslots: gradedSlots(d)
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
  const hrs = pts.reduce((t, p) => t + p.slots, 0);
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
    { k: 'TIME BOOKED', v: Math.round(hrs / 4) + 'h', s: 'in this range', c: '' },
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
    per[b.taskId] = (per[b.taskId] || 0) + b.len;
  }));
  const keys = Object.keys(per).sort((a, b) => per[b] - per[a]).slice(0, 10);
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
  pts.forEach(p => (S.days[p.ds].blocks || []).forEach(b => { if (b.done && !isEvent(b)) per[b.grade] = (per[b.grade] || 0) + b.len; }));
  const used = GRADES.filter(g => per[g.g]);
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
  M.querySelector('[data-exp]').onclick = exportJSON;
  M.querySelector('[data-imp]').onclick = importJSON;
  M.querySelector('[data-clear]').onclick = () => {
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
    ['1 – 5 in the grade card', 'pick a grade'],
    ['V', 'switch timeline / list'],
    ['click the date', 'jump back to today'],
    ['B', 'new block'], ['N', 'jump to now'], ['T / C / K / S', 'today / calendar / tasks / stats'],
    ['← →', 'previous / next day'], ['Ctrl+Z', 'undo'], ['Esc', 'close']
  ];
  openModal(
    '<h3>HOW IT WORKS<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="hint" style="font-size:13px;line-height:1.6;margin-bottom:12px">' +
    'Every block is an instance of a <b>task</b> you keep in the TASKS tab. Red blocks are <b>events</b> pulled in from the calendar — they fill your day but are never graded and never count toward the score.<br>' +
    'When a block’s time has passed it starts glowing — grade it ' +
    GRADES.map(g => '<b style="color:' + g.color + '">' + g.g + '</b>').join(' · ') + '. ' +
    'Three numbers come out of that:<br>' +
    '<b style="color:#0093ff">SCORE / 100</b> — how well you did what you booked, weighted by block length. Ungraded time counts as zero, so it stays honest.<br>' +
    '<b style="color:#e2564c">RANK / 10</b> — how full the day was. Booked hours ÷ ' + DAY_HOURS + 'h × 10, capped at 10.<br>' +
    '<b class="goldtxt">GOLD / 1000</b> — score × rank. It only goes up if you both booked a real day <i>and</i> did it well.' +
    '</div>' +
    rows.map(r => '<div class="helprow"><span class="kbd">' + r[0] + '</span><b>' + r[1] + '</b></div>').join('') +
    '<div class="hint" style="font-size:12.5px;line-height:1.6;margin-top:12px">Your run saves in this browser automatically. Open <b>☰ Menu → SAVE TO DISK</b> once and it also writes every change straight into a real <b>.json</b> file on your computer — so a restart, a cache clear, or a new browser can’t lose it. Put that file in Dropbox/iCloud and it follows you.</div>' +
    '<div class="modrow"><div class="spacer"></div><button class="btn gold" data-x>GOT IT</button></div>'
  );
  $('#modal').querySelectorAll('[data-x]').forEach(b => b.onclick = closeModal);
}

/* ---------------- view switching ---------------- */
function switchView(v) {
  $('#viewDay').hidden = v !== 'day';
  $('#viewCal').hidden = v !== 'cal';
  $('#viewTasks').hidden = v !== 'tasks';
  $('#viewStats').hidden = v !== 'stats';
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.view === v));
  renderAll();
  if (v === 'day') scrollToNow(false);
  sfx('click');
}
function scrollToNow(smooth) {
  if (S.settings.dayView === 'list') return;
  const w = $('#gridwrap');
  if (w.hidden) return;
  const target = cur === todayStr() ? nowSlotFloat() : 32;
  w.scrollTo({ top: Math.max(0, target * ROWH - w.clientHeight * 0.38), behavior: smooth ? 'smooth' : 'auto' });
}
function goDay(ds) { cur = ds; renderAll(); }

/* ---------------- wiring ---------------- */
function bind() {
  $$('.tab').forEach(t => t.onclick = () => switchView(t.dataset.view));
  $('#dPrev').onclick = () => { goDay(shiftD(cur, -1)); sfx('click'); };
  $('#dNext').onclick = () => { goDay(shiftD(cur, 1)); sfx('click'); };
  $('#dLabel').onclick = () => { goDay(todayStr()); scrollToNow(true); };
  $('#btnQuick').onclick = () => { const s = cur === todayStr() ? Math.floor(nowSlotFloat()) : 36; openBlockEditor(null, clamp(s, 0, 92), 4); };
  $('#btnTemplates').onclick = openTemplates;
  $('#btnRecap').onclick = showRecap;
  $('#tkAdd').onclick = newTaskFromInput;
  $('#tkNew').addEventListener('keydown', e => { if (e.key === 'Enter') newTaskFromInput(); });
  $$('#tkVisSeg .seg').forEach(x => x.onclick = () => { tkVis = x.dataset.tv; $$('#tkVisSeg .seg').forEach(y => y.classList.toggle('on', y === x)); renderTasks(); sfx('click'); });
  $$('#tkSortSeg .seg').forEach(x => x.onclick = () => { tkSort = x.dataset.ts; $$('#tkSortSeg .seg').forEach(y => y.classList.toggle('on', y === x)); renderTasks(); sfx('click'); });
  $$('#viewDay .seg').forEach(s => s.onclick = () => { S.settings.dayView = s.dataset.dv; save(); renderDay(); sfx('click'); if (s.dataset.dv === 'timeline') scrollToNow(false); });
  $$('#rangeSeg .seg').forEach(s => s.onclick = () => { statRange = +s.dataset.r; $$('#rangeSeg .seg').forEach(x => x.classList.toggle('on', x === s)); renderStats(); sfx('click'); });
  $$('#metricSeg .seg').forEach(s => s.onclick = () => { statMetric = s.dataset.m; $$('#metricSeg .seg').forEach(x => x.classList.toggle('on', x === s)); renderStats(); sfx('click'); });
  $('#btnTable').onclick = () => { const t = $('#tablePanel'); t.hidden = !t.hidden; $('#btnTable').textContent = t.hidden ? 'TABLE VIEW' : 'HIDE TABLE'; sfx('click'); };
  window.addEventListener('resize', () => { fitDateNav(); if (!$('#viewStats').hidden) renderStats(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitDateNav);
  $('#btnGrade').onclick = () => { const p = pendingBlocks(); if (p.length) openGrade(p[0].id); else toast('Nothing waiting on a grade'); };
  $('#btnHelp').onclick = openHelp;
  $('#btnMenu').onclick = openMenu;
  $('#btnSound').onclick = () => { S.settings.sound = !S.settings.sound; save(); renderRail(); if (S.settings.sound) sfx('score'); };
  $('#mPrev').onclick = () => { calM = new Date(calM.getFullYear(), calM.getMonth() - 1, 1); renderCal(); sfx('click'); };
  $('#mNext').onclick = () => { calM = new Date(calM.getFullYear(), calM.getMonth() + 1, 1); renderCal(); sfx('click'); };
  $('#btnMToday').onclick = () => { calM = new Date(); renderCal(); };
  $('#btnNewEvt').onclick = () => openEventEditor(null, cur);
  $('#calgrid').addEventListener('click', e => { const c = e.target.closest('[data-d]'); if (c) openDayPanel(c.dataset.d); });
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
    else if (k === 'c') switchView('cal');
    else if (k === 's') switchView('stats');
    else if (k === 'k') switchView('tasks');
    else if (k === 'n') { goDay(todayStr()); scrollToNow(true); }
    else if (k === 'b') { const s = cur === todayStr() ? Math.floor(nowSlotFloat()) : 36; openBlockEditor(null, clamp(s, 0, 92), 4); }
    else if (k === 'v') { S.settings.dayView = S.settings.dayView === 'list' ? 'timeline' : 'list'; save(); if ($('#viewDay').hidden) switchView('day'); else renderDay(); sfx('click'); }
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
  refreshStreak();
  cur = todayStr();
  calM = new Date();
  bind();
  renderAll();
  scrollToNow(false);
  setInterval(() => { if (!$('#viewDay').hidden && cur === todayStr()) renderDay(); }, 30000);
  setInterval(() => { if (cur !== todayStr() && todayStr() !== cur) { /* keep date fresh at midnight */ } refreshStreak(); renderRail(); }, 60000);
  if (!localStorage.getItem('baron.seen')) {
    try { localStorage.setItem('baron.seen', '1'); } catch (e) {}
    setTimeout(openHelp, 500);
  } else if (fsStatus === 'need') {
    setTimeout(() => toast('Open ☰ to resume auto-saving to your file'), 700);
  }
})();
