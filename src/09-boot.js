"use strict";
/* ---------------- boot ----------------
   Lives in its own file (and so its own <script>, loaded last) because
   build.mjs gives each source file a separate <script> tag: a function
   declared in 06 doesn't exist yet while 05's top level runs. */
(async function init() {
  loadLocal();
  await restoreLocalFile();
  sealPastDays(true);
  /* one-time (per save) migration: materialize every event that was sitting
     "unpulled" under the old manual-pull system into a real event-block, and
     persist it immediately so this isn't just an in-memory patch that has to
     be recomputed every boot. */
  if (syncAllEventBlocks() | adoptDirty) save();   // `|` not `||`: always sync
  adoptDirty = false;
  refreshStreak();
  cur = todayStr();
  bind();
  renderAll();
  scrollToNow(false);
  checkAlerts();
  setInterval(checkAlerts, 30000);
  setInterval(() => { if (!$('#viewDay').hidden && cur === todayStr()) renderDay(); }, 30000);
  /* midnight rollover: seal yesterday, then refresh everything */
  setInterval(() => { if (sealPastDays()) renderAll(); refreshStreak(); renderRail(); renderAgenda(); }, 60000);
  startCloud();
  /* installable app (PWA) — only over http(s); file:// just runs as a page */
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('sw', e));
  }
  if (!localStorage.getItem('baron.seen')) {
    try { localStorage.setItem('baron.seen', '1'); } catch (e) {}
    if (!cloudOn()) setTimeout(openHelp, 500);
  }
})();
