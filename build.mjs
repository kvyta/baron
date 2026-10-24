#!/usr/bin/env node
/* Baron build — concatenates src/ into a single self-contained baron.html.
 *
 *   node build.mjs            build once
 *   node build.mjs --watch    rebuild whenever a source file changes
 *
 * Order matters: the JS files share one global scope, so 03 must load before
 * 04 before 05. Everything is inlined so the output stays double-clickable.
 */
import { readFileSync, writeFileSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = (f) => join(here, 'src', f);
const out = join(here, 'baron.html');

const HTML = ['01-head.html', '02-body.html'];
const JS = ['03-core.js', '04-day.js', '05-views.js', '06-sync.js', '08-qr.js', '09-boot.js'];

function build() {
  const parts = [];
  for (const f of HTML) parts.push(readFileSync(src(f), 'utf8').trimEnd());
  for (const f of JS) {
    parts.push('<script>\n/* ---- ' + f + ' ---- */\n' + readFileSync(src(f), 'utf8').trimEnd() + '\n</script>');
  }
  parts.push('</body>\n</html>\n');
  const html = parts.join('\n');
  writeFileSync(out, html);
  const kb = (html.length / 1024).toFixed(1);
  console.log(new Date().toLocaleTimeString() + '  built baron.html  (' + kb + ' KB)');
}

build();

if (process.argv.includes('--watch')) {
  console.log('watching src/ …');
  let t = null;
  for (const f of [...HTML, ...JS]) {
    watch(src(f), () => { clearTimeout(t); t = setTimeout(build, 80); });
  }
}
