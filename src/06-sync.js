"use strict";
/* ===================================================================
   CLOUD SYNC — optional, off until you sign in.

   Baron still works with no account, no server and no network at all. Sign
   in from ☰ Menu → CLOUD SYNC and the whole save (the same JSON that SAVE
   TO DISK writes) is mirrored to your own Supabase project, so your phone
   and your computer edit one planner.

   Talks to Supabase over plain fetch (auth + PostgREST), no SDK, so the app
   stays one self-contained file. Tables and the push_state() function live
   in supabase/schema.sql.

   How a sync works:
   - Every save() bumps an edit counter and queues a push ~1.2s later.
   - push_state(data, base_rev) is compare-and-swap: it only writes if the
     cloud is still at the rev this device last saw. If another device got
     there first it returns the cloud copy instead, and we three-way merge
     (last synced copy = base, ours, theirs) by id — tasks, events, quotas
     and each day's blocks — then push the merge.
   - On focus, every 45s while visible, and on reconnect, we pull and merge
   =================================================================== */
const CLOUD_CFG = 'baron.cloud', CLOUD_AUTH = 'baron.auth', CLOUD_META = 'baron.sync', CLOUD_DEV = 'baron.device';
/* the online copy: where Google sign-in and device links go when this file is opened from disk */
const PUBLIC_URL = 'https://kvyta.github.io/baron/baron.html';
/* Baron's built-in cloud. It is private: the database refuses every account
   except OWNER, so anyone else who signs in is asked to connect their own
   Supabase project instead (supabase/schema.sql). The key is a publishable
   key — safe in public, row-level security does the guarding. */
const DEFAULT_CLOUD = {
  url: 'https://hrngqseuscutashgprsq.supabase.co',
  key: 'sb_publishable_I4n19E25dNudYHsakwFmbw_AasTkviS',
  owner: '2011kevintan@gmail.com'
};

const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

const cloud = {
  cfg: lsGet(CLOUD_CFG, null) || DEFAULT_CLOUD,   // {url, key}; only a custom project is stored
  auth: lsGet(CLOUD_AUTH, null),    // {access_token, refresh_token, expires_at, user:{id,email}}
  meta: lsGet(CLOUD_META, null),    // {uid, rev, base, dirty, last}
  status: 'off',                    // off | idle | syncing | offline | error
  err: '', timer: null, busy: false, again: false, applying: false, seq: 0, lastPull: 0
};
function freshMeta() { return { uid: cloud.auth && cloud.auth.user ? cloud.auth.user.id : null, rev: 0, base: null, dirty: true, last: 0 }; }
if (!cloud.meta || (cloud.auth && cloud.meta.uid !== cloud.auth.user.id)) cloud.meta = freshMeta();
const isDefaultCloud = () => !!cloud.cfg && cloud.cfg.url === DEFAULT_CLOUD.url;
const cloudOn = () => !!(cloud.cfg && cloud.cfg.url && cloud.cfg.key && cloud.auth && cloud.auth.access_token);
const saveMeta = () => lsSet(CLOUD_META, cloud.meta);

function deviceName() {
  let d = lsGet(CLOUD_DEV, null);
  if (!d) {
    const ua = navigator.userAgent || '';
    const kind = /iPhone|iPad|Android|Mobile/i.test(ua) ? 'phone' : 'computer';
    d = kind + '-' + uid().slice(0, 4);
    lsSet(CLOUD_DEV, d);
  }
  return d;
}

/* ---------- canonical JSON: Postgres jsonb reorders keys, so any "did this
   change" comparison has to be key-order independent ---------- */
function canon(v) {
  if (v === undefined) return 'u';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}

/* ---------- three-way merge ----------
   For each key: unchanged locally → take theirs; unchanged remotely → take
   ours; changed on both → ours wins (this device is the one in your hand),
   except a local delete never beats a remote edit. */
function pick3(b, l, r) {
  const cb = canon(b), cl = canon(l), cr = canon(r);
  if (cl === cr) return l;
  if (cl === cb) return r;
  if (cr === cb) return l;
  return l === undefined ? r : l;
}
function mergeById(B, L, R, key) {
  key = key || 'id';
  const mb = {}, ml = {}, mr = {}, order = [];
  (B || []).forEach(x => { if (x) mb[x[key]] = x; });
  (L || []).forEach(x => { if (x) { ml[x[key]] = x; order.push(x[key]); } });
  (R || []).forEach(x => { if (x && !(x[key] in ml)) { mr[x[key]] = x; order.push(x[key]); } else if (x) mr[x[key]] = x; });
  const seen = {}, out = [];
  order.forEach(id => {
    if (seen[id]) return; seen[id] = 1;
    const v = pick3(mb[id], ml[id], mr[id]);
    if (v !== undefined) out.push(v);
  });
  return out;
}
function mergeObj(B, L, R) {
  B = B || {}; L = L || {}; R = R || {};
  const out = {};
  new Set(Object.keys(L).concat(Object.keys(R))).forEach(k => {
    const v = pick3(B[k], L[k], R[k]);
    if (v !== undefined) out[k] = v;
  });
  return out;
}
/* two devices can each drop a block into the same free hour — after a merge,
   any task block that overlaps something with a better claim is trimmed to
   its longest free run (or dropped). Claim order: events, graded blocks,
   blocks this device had, then the rest. */
function fixOverlaps(blocks, localIds) {
  const rank = b => isEvent(b) ? 0 : b.done ? 1 : localIds[b.id] ? 2 : 3;
  const sorted = blocks.map((b, i) => ({ b, i })).sort((x, y) => rank(x.b) - rank(y.b) || x.i - y.i);
  const occ = new Array(SLOTS).fill(false), out = [];
  sorted.forEach(({ b }) => {
    if (isEvent(b)) { out.push(b); for (let i = b.start; i < b.start + b.len && i < SLOTS; i++) occ[i] = true; return; }
    let best = null, run = null;
    for (let i = b.start; i <= b.start + b.len; i++) {
      const free = i < b.start + b.len && i < SLOTS && !occ[i];
      if (free) { if (!run) run = { s: i, l: 0 }; run.l++; }
      else if (run) { if (!best || run.l > best.l) best = run; run = null; }
    }
    if (!best) return;
    const nb = best.l === b.len ? b : Object.assign({}, b, { start: best.s, len: best.l });
    for (let i = nb.start; i < nb.start + nb.len; i++) occ[i] = true;
    out.push(nb);
  });
  return out.sort((a, b) => a.start - b.start);
}
function mergeStates(B, L, R) {
  B = B || {};
  const out = {
    v: 4,
    tasks: mergeById(B.tasks, L.tasks, R.tasks),
    events: mergeById(B.events, L.events, R.events),
    quotas: mergeById(B.quotas, L.quotas, R.quotas),
    templates: L.templates || R.templates || [],
    stats: mergeObj(B.stats, L.stats, R.stats),
    settings: mergeObj(B.settings, L.settings, R.settings),
    days: {}
  };
  const Bd = B.days || {}, Ld = L.days || {}, Rd = R.days || {};
  new Set(Object.keys(Ld).concat(Object.keys(Rd))).forEach(ds => {
    const bb = Bd[ds] && Bd[ds].blocks, lb = Ld[ds] && Ld[ds].blocks, rb = Rd[ds] && Rd[ds].blocks;
    let blocks = mergeById(bb, lb, rb);
    const lid = {}; (lb || []).forEach(b => lid[b.id] = 1);
    blocks = fixOverlaps(blocks, lid);
    out.days[ds] = { blocks };
  });
  return out;
}
/* ---------- transport ---------- */
const sbUrl = p => cloud.cfg.url.replace(/\/+$/, '') + p;
async function sbFetch(path, opts, authed) {
  opts = opts || {};
  const go = async () => {
    const h = Object.assign({ apikey: cloud.cfg.key, 'Content-Type': 'application/json' }, opts.headers || {});
    if (authed !== false) h.Authorization = 'Bearer ' + cloud.auth.access_token;
    return fetch(sbUrl(path), Object.assign({}, opts, { headers: h }));
  };
  if (authed !== false) await ensureToken();
  let r = await go();
  if (r.status === 401 && authed !== false && await refreshToken()) r = await go();
  return r;
}
async function sbJson(r) {
  const txt = await r.text();
  let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
  if (!r.ok) {
    const msg = j && (j.msg || j.message || j.error_description || j.error) || ('HTTP ' + r.status);
    const err = new Error(msg); err.status = r.status; throw err;
  }
  return j;
}
function keepSession(j) {
  cloud.auth = {
    access_token: j.access_token, refresh_token: j.refresh_token,
    expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    user: { id: j.user.id, email: j.user.email }
  };
  lsSet(CLOUD_AUTH, cloud.auth);
  if (!cloud.meta || cloud.meta.uid !== cloud.auth.user.id) { cloud.meta = freshMeta(); saveMeta(); }
}
async function ensureToken() {
  if (!cloud.auth) throw new Error('not signed in');
  if (cloud.auth.expires_at - 90 < Date.now() / 1000) { if (!await refreshToken()) throw new Error('session expired — sign in again'); }
}
let refreshing = null;
function refreshToken() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const r = await fetch(sbUrl('/auth/v1/token?grant_type=refresh_token'), {
        method: 'POST', headers: { apikey: cloud.cfg.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: cloud.auth.refresh_token })
      });
      if (!r.ok) {
        if (r.status === 400 || r.status === 401) { cloud.auth = null; lsSet(CLOUD_AUTH, null); setCloudStatus('off'); toast('Cloud sign-in expired — sign in again'); }
        return false;
      }
      keepSession(await r.json());
      return true;
    } catch (e) { return false; } finally { refreshing = null; }
  })();
  return refreshing;
}
async function cloudSignIn(email, password) {
  const r = await fetch(sbUrl('/auth/v1/token?grant_type=password'), {
    method: 'POST', headers: { apikey: cloud.cfg.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  keepSession(await sbJson(r));
}
async function cloudSignUp(email, password) {
  const r = await fetch(sbUrl('/auth/v1/signup'), {
    method: 'POST', headers: { apikey: cloud.cfg.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const j = await sbJson(r);
  if (j && j.access_token) { keepSession(j); return 'in'; }
  return 'confirm';
}
async function cloudSignOut() {
  try { await sbFetch('/auth/v1/logout', { method: 'POST' }); } catch (e) {}
  cloud.auth = null; lsSet(CLOUD_AUTH, null);
  cloud.meta = freshMeta(); saveMeta();
  setCloudStatus('off');
}

/* ---------- status pill (rail + menu) ---------- */
function setCloudStatus(s, err) {
  cloud.status = s; if (err != null) cloud.err = err;
  const els = $$('.clouddot'); if (!els.length) return;
  const title = s === 'idle' ? 'Synced' + (cloud.meta.last ? ' · ' + new Date(cloud.meta.last).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '')
    : s === 'syncing' ? 'Syncing…' : s === 'offline' ? 'Offline — changes will sync when you reconnect'
      : s === 'error' ? 'Sync problem: ' + cloud.err : 'Cloud sync off';
  els.forEach(el => { el.hidden = !cloudOn() && s === 'off'; el.dataset.s = s; el.title = title; });
}

/* ---------- the sync loop ---------- */
function cloudQueue() {
  if (cloud.applying) return;
  cloud.seq++;
  if (!cloudOn()) return;
  cloud.meta.dirty = true; saveMeta();
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(() => cloudSync('push'), 1200);
}
async function rpcPush(data, baseRev) {
  const r = await sbFetch('/rest/v1/rpc/push_state', { method: 'POST', body: JSON.stringify({ p_data: data, p_base_rev: baseRev, p_device: deviceName() }) });
  const j = await sbJson(r);
  return Array.isArray(j) ? j[0] : j;
}
async function pullRow() {
  const r = await sbFetch('/rest/v1/baron_state?select=data,rev,device,updated_at');
  const j = await sbJson(r);
  return j && j.length ? j[0] : null;
}
const blankState = o => !o || (!(o.tasks || []).length && !(o.events || []).length && !Object.keys(o.days || {}).some(k => (o.days[k].blocks || []).length) && !(o.quotas || []).length);

/* fold the cloud copy (at rev) into this device's state */
function integrateRemote(remote, rev) {
  const local = JSON.parse(snapshot());
  const base = cloud.meta.base ? JSON.parse(cloud.meta.base) : null;
  let merged;
  if (!cloud.meta.dirty && base) merged = remote;                 // nothing of ours to keep
  else if (!base && blankState(local)) merged = remote;           // fresh device
  else merged = mergeStates(base, local, remote);
  cloud.applying = true;
  try {
    adopt(merged);
    sealPastDays(true);
    syncAllEventBlocks();
    try { localStorage.setItem(LS_KEY, snapshot()); } catch (e) {}
    queueFileSave();
  } finally { cloud.applying = false; }
  cloud.meta.rev = rev;
  cloud.meta.base = canon(remote);
  cloud.meta.dirty = canon(JSON.parse(snapshot())) !== cloud.meta.base;
  saveMeta();
  renderAll();
}
async function cloudSync(reason) {
  if (!cloudOn()) { setCloudStatus('off'); return; }
  if (cloud.busy) { cloud.again = true; return; }
  if (!navigator.onLine) { setCloudStatus('offline'); return; }
  /* never swap state out from under an open editor — try again shortly */
  if (!$('#scrim').hidden) { clearTimeout(cloud.timer); cloud.timer = setTimeout(() => cloudSync(reason), 2500); return; }
  cloud.busy = true; setCloudStatus('syncing');
  try {
    for (let round = 0; round < 3; round++) {
      if (cloud.meta.dirty || !cloud.meta.rev) {
        const seq = cloud.seq, data = JSON.parse(snapshot());
        const res = await rpcPush(data, cloud.meta.rev || 0);
        if (res && res.ok) {
          cloud.meta.rev = res.rev; cloud.meta.base = canon(data);
          cloud.meta.dirty = cloud.seq !== seq;          // edited again mid-flight?
          cloud.meta.last = Date.now(); saveMeta();
          if (!cloud.meta.dirty) break;
        } else if (res && res.data) {
          integrateRemote(res.data, res.rev);
          if (!cloud.meta.dirty) break;
        } else break;
      } else {
        const row = await pullRow();
        if (row && row.rev !== cloud.meta.rev) { integrateRemote(row.data, row.rev); if (cloud.meta.dirty) continue; }
        else if (!row) { cloud.meta.dirty = true; continue; }
        cloud.meta.last = Date.now(); saveMeta();
        break;
      }
    }
    cloud.lastPull = Date.now();
    setCloudStatus('idle', '');
  } catch (e) {
    console.warn('sync', e);
    setCloudStatus(navigator.onLine ? 'error' : 'offline', e.message);
  } finally {
    cloud.busy = false;
  }
  if (cloud.again) { cloud.again = false; setTimeout(() => cloudSync('again'), 60); }
}

/* ---------- device link: Baron's own cloud needs nothing but the page;
   a custom project rides along as #cloud=<url+publishable key>, never a password ---------- */
const b64u = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
const onlineHere = () => /^https?:/.test(location.protocol);
function deviceLink() {
  const here = onlineHere() ? location.origin + location.pathname : PUBLIC_URL;
  return isDefaultCloud() ? here : here + '#cloud=' + b64u(JSON.stringify({ u: cloud.cfg.url, k: cloud.cfg.key }));
}
function setCustomCloud(u, k) {
  if (!cloud.cfg || cloud.cfg.url !== u) { cloud.auth = null; lsSet(CLOUD_AUTH, null); cloud.meta = freshMeta(); saveMeta(); }
  cloud.cfg = { url: u, key: k };
  lsSet(CLOUD_CFG, u === DEFAULT_CLOUD.url ? null : cloud.cfg);
  if (u === DEFAULT_CLOUD.url) cloud.cfg = DEFAULT_CLOUD;
}
function readCloudHash() {
  const m = /[#&]cloud=([^&]+)/.exec(location.hash || '');
  if (!m) return false;
  try { const o = JSON.parse(unb64u(m[1])); if (o.u && o.k) setCustomCloud(o.u, o.k); } catch (e) { console.warn('bad cloud link'); }
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  return true;
}
function qrSvg(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 2;
  let p = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
  return '<svg viewBox="0 0 ' + (n + 2 * m) + ' ' + (n + 2 * m) + '" shape-rendering="crispEdges" style="width:100%;height:auto;display:block;background:#fff;border-radius:8px"><path d="' + p + '" fill="#0a0d10"/></svg>';
}

/* ---------- Google sign-in (Supabase OAuth, redirect flow) ----------
   Leaves the page for Google and comes back with the session in the URL
   fragment. A file opened from disk can't be returned to, so there it sends
   you to the online copy instead. */
function startGoogle() {
  if (!onlineHere()) { openOnlineOnly(); return; }
  try { sessionStorage.setItem('baron.oauth', JSON.stringify(cloud.cfg)); } catch (e) {}
  location.href = sbUrl('/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(location.origin + location.pathname));
}
async function readOAuthReturn() {
  const h = new URLSearchParams((location.hash || '').replace(/^#/, '')), q = new URLSearchParams(location.search);
  const at = h.get('access_token');
  const err = h.get('error_description') || q.get('error_description') || h.get('error') || q.get('error');
  if (!at && !err) return null;
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
  try { const sv = JSON.parse(sessionStorage.getItem('baron.oauth') || 'null'); sessionStorage.removeItem('baron.oauth'); if (sv && sv.url) cloud.cfg = sv.url === DEFAULT_CLOUD.url ? DEFAULT_CLOUD : sv; } catch (e) {}
  if (err) return { err: String(err).replace(/\+/g, ' ') };
  const r = await fetch(sbUrl('/auth/v1/user'), { headers: { apikey: cloud.cfg.key, Authorization: 'Bearer ' + at } });
  const user = await sbJson(r);
  keepSession({ access_token: at, refresh_token: h.get('refresh_token'), expires_at: +h.get('expires_at') || 0, expires_in: +h.get('expires_in') || 3600, user: user });
  return { ok: true };
}
function signedInOK() {
  closeModal(); setCloudStatus('syncing');
  cloudSync('signin').then(() => { toast(cloud.status === 'idle' ? 'Synced as ' + cloud.auth.user.email : 'Signed in — sync: ' + (cloud.err || cloud.status)); renderAll(); });
}

/* ---------- UI ---------- */
const googleBtn = (cls) => '<button class="btn ' + (cls || '') + ' gbtn" data-cloud="google"><b>G</b> SIGN IN WITH GOOGLE</button>';
/* one compact row in ☰ Menu → SAVING (see openMenu in 05-views.js) */
function cloudRowHtml() {
  const row = (st, btns, title) => '<div class="svrow" title="' + esc(title) + '"><span class="svk">CLOUD</span><span class="svs">' + st + '</span><span class="svb">' + btns + '</span></div>';
  const tip = 'Cloud sync keeps your phone and computer on the same planner.';
  if (!cloudOn()) return isDefaultCloud()
    ? row('Not signed in', googleBtn('sm green') + '<button class="btn sm" data-cloud="setup">OWN PROJECT</button>', tip)
    : row('Your project · not signed in', '<button class="btn sm green" data-cloud="signin">SIGN IN</button><button class="btn sm" data-cloud="setup">PROJECT</button>', tip);
  const when = cloud.meta.last ? ' ' + new Date(cloud.meta.last).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const st = cloud.status === 'idle' ? '<i class="ok">●</i> synced' + when
    : cloud.status === 'syncing' ? '<i class="wait">●</i> syncing…' : cloud.status === 'offline' ? '<i>●</i> offline' : cloud.status === 'error' ? '<i class="bad">●</i> ' + esc(cloud.err) : '<i>●</i> waiting';
  return row(st + ' · ' + esc(cloud.auth.user.email),
    '<button class="btn sm blue" data-cloud="now">SYNC</button><button class="btn sm gold" data-cloud="link">LINK PHONE</button><button class="btn sm red" data-cloud="out">SIGN OUT</button>',
    tip + ' Signed in as ' + cloud.auth.user.email + '.');
}
function bindCloudMenu(M) {
  M.querySelectorAll('[data-cloud]').forEach(b => b.onclick = () => {
    const a = b.dataset.cloud;
    if (a === 'google') startGoogle();
    else if (a === 'setup') openCloudSetup();
    else if (a === 'signin') openCloudSignIn();
    else if (a === 'now') { closeModal(); cloudSync('manual').then(() => toast(cloud.status === 'idle' ? 'Synced' : 'Sync: ' + (cloud.err || cloud.status))); }
    else if (a === 'link') openDeviceLink();
    else if (a === 'out') { cloudSignOut(); closeModal(); toast('Signed out — this device keeps its copy'); }
  });
}
/* someone other than the owner tried Baron's built-in cloud */
function openNotOwner(email) {
  openCloudSetup('<b>' + (email ? esc(email) + ' can’t' : 'That account can’t') + ' use Baron’s built-in cloud</b> — it’s private to its owner. ' +
    'To sync your own planner between devices, connect your own free Supabase project (it takes a few minutes).');
}
function openOnlineOnly() {
  openModal(
    '<h3>SIGN IN ONLINE<button class="btn sm x" data-x>✕</button></h3>' +
    '<div class="hint" style="font-size:13px;margin-bottom:12px">Google can’t send you back to a file opened from your disk. Open Baron online and sign in there — everything else, saving to a file included, works the same. ' +
    'In Chrome or Edge you can then install it as an app from the address bar.</div>' +
    '<div class="modrow"><a class="btn gold" href="' + PUBLIC_URL + '" target="_blank" rel="noopener" style="text-decoration:none">OPEN BARON ONLINE</a><div class="spacer"></div><button class="btn" data-x>CLOSE</button></div>'
  );
  $('#modal').querySelectorAll('[data-x]').forEach(b => b.onclick = closeModal);
}
function openCloudSetup(intro) {
  const custom = cloud.cfg && !isDefaultCloud() ? cloud.cfg : null;
  openModal(
    '<h3>YOUR OWN CLOUD<button class="btn sm x" data-x>✕</button></h3>' +
    (intro ? '<div class="hint" style="font-size:13px;margin-bottom:10px">' + intro + '</div>' : '') +
    '<div class="hint" style="margin-bottom:10px">1. Create a free project at supabase.com. 2. In its SQL editor, run <b>supabase/schema.sql</b> from Baron’s repository. 3. Paste the project URL and its <b>publishable</b> key (Project Settings → API keys) here.</div>' +
    '<div class="field"><label>PROJECT URL</label><input class="inp" id="cfU" data-autofocus placeholder="https://xxxx.supabase.co" value="' + esc(custom ? custom.url : '') + '"></div>' +
    '<div class="field"><label>PUBLISHABLE KEY</label><input class="inp" id="cfK" placeholder="sb_publishable_…" value="' + esc(custom ? custom.key : '') + '"></div>' +
    '<div class="modrow">' + (custom ? '<button class="btn sm red" data-forget>DISCONNECT</button>' : '') + '<div class="spacer"></div><button class="btn green" data-ok>NEXT</button></div>'
  );
  const M = $('#modal');
  M.querySelector('[data-x]').onclick = closeModal;
  const fg = M.querySelector('[data-forget]');
  if (fg) fg.onclick = () => { cloudSignOut(); setCustomCloud(DEFAULT_CLOUD.url, DEFAULT_CLOUD.key); closeModal(); toast('Your project is disconnected'); };
  M.querySelector('[data-ok]').onclick = () => {
    const u = M.querySelector('#cfU').value.trim().replace(/\/+$/, ''), k = M.querySelector('#cfK').value.trim();
    if (!/^https:\/\/.+/.test(u) || k.length < 20) { toast('Need the https:// URL and the key'); return; }
    if (u === DEFAULT_CLOUD.url) { toast('That’s Baron’s built-in cloud — use your own project'); return; }
    setCustomCloud(u, k);
    openCloudSignIn();
  };
}
/* sign-in for a custom project: Google if that project turned it on, or email + password */
function openCloudSignIn(first) {
  openModal(
    '<h3>' + (first ? 'LINK THIS DEVICE' : 'SIGN IN') + '<button class="btn sm x" data-x>✕</button></h3>' +
    (first ? '<div class="hint" style="margin-bottom:10px">This link connected Baron to your cloud project. Sign in and this device picks up your planner.</div>' : '') +
    '<div class="modrow" style="margin:0 0 12px">' + googleBtn('blue') + '</div>' +
    '<div class="hint" style="margin-bottom:8px">Google works if your project has the Google provider turned on. Otherwise use an email and password:</div>' +
    '<div class="field"><label>EMAIL</label><input class="inp" id="cfE" type="email" autocomplete="username"></div>' +
    '<div class="field"><label>PASSWORD</label><input class="inp" id="cfP" type="password" autocomplete="current-password"></div>' +
    '<div class="hint" id="cfMsg" style="min-height:16px"></div>' +
    '<div class="modrow"><button class="btn sm" data-up>CREATE ACCOUNT</button><div class="spacer"></div><button class="btn green" data-in>SIGN IN</button></div>'
  );
  const M = $('#modal'), msg = M.querySelector('#cfMsg');
  M.querySelector('[data-x]').onclick = closeModal;
  M.querySelector('[data-cloud="google"]').onclick = startGoogle;
  const vals = () => [M.querySelector('#cfE').value.trim(), M.querySelector('#cfP').value];
  const busy = on => M.querySelectorAll('button').forEach(b => b.disabled = on);
  M.querySelector('[data-in]').onclick = async () => {
    const [e, p] = vals(); if (!e || !p) { msg.textContent = 'Email and password, please.'; return; }
    busy(true); msg.textContent = 'Signing in…';
    try { await cloudSignIn(e, p); signedInOK(); }
    catch (err) { busy(false); msg.textContent = /confirm/i.test(err.message) ? 'Confirm your email first (check your inbox), then sign in.' : err.message; }
  };
  M.querySelector('[data-up]').onclick = async () => {
    const [e, p] = vals(); if (!e || p.length < 6) { msg.textContent = 'Email, and a password of 6+ characters.'; return; }
    busy(true); msg.textContent = 'Creating account…';
    try {
      const res = await cloudSignUp(e, p);
      if (res === 'in') signedInOK();
      else { busy(false); msg.innerHTML = 'Account created. <b>Check your email</b> and click the confirmation link, then come back and SIGN IN.'; }
    } catch (err) { busy(false); msg.textContent = err.message; }
  };
  M.querySelector('#cfP').addEventListener('keydown', ev => { if (ev.key === 'Enter') M.querySelector('[data-in]').click(); });
}
function openDeviceLink() {
  const link = deviceLink();
  openModal(
    '<h3>LINK YOUR PHONE<button class="btn sm x" data-x>✕</button></h3>' +
    '<div style="max-width:240px;margin:0 auto 12px">' + qrSvg(link) + '</div>' +
    '<div class="hint" style="margin-bottom:10px">Scan this with your phone’s camera (or send yourself the link), open ☰ and sign in' + (isDefaultCloud() ? ' with Google' : '') + '. ' +
    'Then use your browser’s <b>Add to Home Screen</b> and Baron runs like an app.</div>' +
    '<input class="inp ro" id="dlUrl" readonly value="' + esc(link) + '">' +
    '<div class="modrow"><button class="btn sm" data-copy>COPY LINK</button>' + (navigator.share ? '<button class="btn sm blue" data-share>SHARE…</button>' : '') +
    '<div class="spacer"></div><button class="btn gold" data-x>DONE</button></div>'
  );
  const M = $('#modal');
  M.querySelectorAll('[data-x]').forEach(b => b.onclick = closeModal);
  M.querySelector('[data-copy]').onclick = () => {
    const i = M.querySelector('#dlUrl'); i.select();
    (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Link copied'), () => { document.execCommand('copy'); toast('Link copied'); });
  };
  const sh = M.querySelector('[data-share]');
  if (sh) sh.onclick = () => navigator.share({ title: 'Baron', url: link }).catch(() => {});
}

async function startCloud() {
  const linked = readCloudHash();
  let back = null;
  try { back = await readOAuthReturn(); } catch (e) { back = { err: e.message }; }
  if (back && back.err) {
    /* the owner-only lock surfaces as a failed account creation */
    if (isDefaultCloud() && /database|private|saving new user/i.test(back.err)) setTimeout(() => openNotOwner(), 300);
    else toast('Sign-in failed: ' + back.err);
  } else if (back && back.ok && isDefaultCloud() && String(cloud.auth.user.email || '').toLowerCase() !== DEFAULT_CLOUD.owner) {
    const em = cloud.auth.user.email;
    await cloudSignOut();
    setTimeout(() => openNotOwner(em), 300);
  } else if (back && back.ok) {
    toast('Signed in as ' + cloud.auth.user.email);
  }
  setCloudStatus(cloudOn() ? 'idle' : 'off');
  if (linked && !isDefaultCloud() && !cloudOn()) setTimeout(() => openCloudSignIn(true), 400);
  if (cloudOn()) cloudSync('boot').then(() => { if (back && back.ok) renderAll(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - cloud.lastPull > 5000) cloudSync('focus'); });
  window.addEventListener('online', () => cloudSync('online'));
  window.addEventListener('offline', () => setCloudStatus(cloudOn() ? 'offline' : 'off'));
  setInterval(() => { if (document.visibilityState === 'visible' && cloudOn()) cloudSync('poll'); }, 45000);
}
