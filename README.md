# Baron

A single-file day planner that makes you grade yourself.

Plan the day in 15-minute blocks, and when a block's time has passed, give it a
letter grade from **A** to **F**. That grade is the whole point: it turns a plan
into a record, and the record is what tells you whether the plan was ever real.

Baron is one HTML file. No install, no account, no server, no tracking — fonts
and all are embedded. Open it and it works, offline, forever. **Cloud sync is
optional**: connect your own free Supabase project, sign in on your phone and
your computer, and both show the same planner. Until you do, Baron makes no
network requests at all.

**Try it:** [kvyta.github.io/baron](https://kvyta.github.io/baron)

---

## The three numbers

| | | |
|---|---|---|
| **SCORE** | 0–100 | How well you did the time you booked, weighted by block length. `A` 100% · `B` 90% · `C` 50% · `D` 30% · `F` 20%. |
| **RANK** | 0–10 | How full your working day was. Time that counted ÷ the **SOD–EOD** window × 10, capped at 10. |
| **GOLD** | 0–1000 | `SCORE × RANK`. Only goes up if you booked a real day **and** did it well. |

A short, perfect day scores well but ranks low. A packed day you ignored ranks
high but scores nothing. Gold needs both.

**The day's window.** Every day has a start (`SOD`) and an end (`EOD`), drawn as
purple lines on the timeline. They sit at 9:00a and 10:00p unless a block reaches
past either edge, in which case that edge moves out to meet it. Everything
outside the window is tinted and drawn at half height, so twelve dead night hours
stop eating your scroll — and rank is measured against that window rather than a
flat twelve hours, so a genuinely long day isn't punished for being long.

**Time that counted.** A grade doesn't only move the score, it decides how much
of the block's time you get to keep. `A` `B` `C` keep all of it, `D` keeps half,
and `F` and `U` hand back every minute. An hour you graded `F` is an hour that
never happened: it drags rank down and adds nothing to the task's total.

Two things carry across days: your **best gold** ever, and your **streak** of
consecutive days where you graded something.

Once a day ends it is **sealed**: anything you never got round to grading is
stamped `U` and counts 10% — below an honest `F`, because grading always beats
walking away — and the day becomes a read-only record. Past blocks and events
can't be created, edited, regraded or deleted. Today stays fully editable, even
for hours that have already passed.

## Tasks, blocks and events

- A **task** is a thing you do repeatedly — *Deep work*, *Thesis draft*.
  Tasks live in the TASKS tab, where you can rename them or sort them by how
  many hours you've put in. Deleting is honest about history: a task with no
  blocks goes instantly, a task with only ungraded blocks asks once and then
  takes those blocks with it, and a task that has ever been graded can't be
  erased at all — it's hidden instead, which keeps the record and drops it out
  of the pickers. `ALL` shows hidden tasks, each with a RESTORE button.
- A **block** is one instance of a task on one day, with an optional note. Blocks
  are blue, and blocks are what get graded.
- An **event** is a calendar meeting. Events are red, are created only in the
  CALENDAR tab, and can repeat (daily / weekdays / weekly / fortnightly /
  monthly). Pull one into today and it fills your day — it counts toward booked
  time and rank, but is never graded and never affects your score.

## The tabs

**DAILY** — the day itself, as a 96-slot timeline you drag on to paint blocks,
or as a flat list of `start – end | task`. A block whose time has passed starts
glowing until you grade it.

**CALENDAR** — one scrolling calendar, week after week, with each day's score.
`EVENTS | QUOTAS` picks what the day cards show: events with their times
(one-off events are green and sort above recurring ones), or the quotas due
that day — a quota has a due date, never a time. `+ EVENT` / `+ QUOTA` follows
the selector; click a card for that day, or a chip to edit it. The bar along
each card's bottom is how many of that day's quotas are done.

**TASKS** — the task list, filtered by `VISIBLE` or `ALL` and sorted A–Z or by
total hours.

**STATS** — your score, rank or gold as a line over time with a 7-day average,
plus hours per task and hours per grade.

---

## Running it

Download or clone, then open `baron.html`. That's it.

```
git clone https://github.com/kvyta/baron.git
cd baron
start baron.html      # Windows   (open baron.html on macOS)
```

## Saving: sign in, everywhere

Baron saves to your account. Sign in (☰ Menu → SAVING, or the green
**SIGN IN** button) on any phone or computer and it shows the same planner:
every change saves about a second later, and other devices pick it up when you
switch back to them, or within 45 seconds. If two devices edited at once, the
changes are merged item by item — the device in your hand wins a true tie, and
a delete never beats an edit. Each device keeps a cached copy, so Baron still
opens and works offline and catches up when it reconnects.

Signed out, your planner lives only in that browser.

**LOCAL** (☰ Menu → SAVING; only shown in Chrome/Edge/Brave on a computer) keeps a `.json`
file on your computer identical to your planner. SYNC asks which side wins —
*Prioritize local* or *Prioritize cloud* — then merges the file with your
planner item by item: tasks with the same name become one, the same block
keeps the winning side's grade and times, overlapping blocks give way to the
winning side's timeline, and events and quotas from both sides are kept. The
result goes to both the cloud and the file, and every change after that is
written to both. UNSYNC stops writing the file.

> Save files are gitignored. Keep yours outside the repo folder.

On a phone, open [kvyta.github.io/baron](https://kvyta.github.io/baron), sign
in, then **Add to Home Screen** — it opens full-screen like an app. The score
sits in a bar at the top (tap it for the full rail), tabs scroll sideways, and
tapping empty time adds a one-hour block.

### Accounts

The built-in cloud (☰ → **SIGN IN WITH GOOGLE**) is private to the repo's
owner. Anyone else who signs in is asked to connect their own free project:

1. Create a project at [supabase.com](https://supabase.com).
2. In its SQL editor, run [`supabase/schema.sql`](supabase/schema.sql).
3. In Baron: `☰ Menu → OWN PROJECT`, paste the project URL and the
   **publishable** key (Project Settings → API keys), then sign in with an
   email and password (or Google, if you turn that provider on).

Row-level security locks each account to its own row, which is why a
publishable key is safe in public. Google sign-in needs the online copy: a
file opened from your disk can't be returned to after Google, so Baron sends
you there instead.

Nothing in this repository contains any planner data — clone it and you start
from an empty planner.

## Building

`baron.html` is generated. Edit the files in `src/`, then:

```
node build.mjs            # rebuild baron.html
node build.mjs --watch    # rebuild on every save
```

```
baron.html          built — this is the app
index.html          redirect, so the GitHub Pages URL works
build.mjs           concatenates src/ into baron.html
licenses/           font licences
src/
  01-head.html      embedded fonts, theme variables, all CSS
  02-body.html      markup: rail, tabs, the four views
  03-core.js        state, save/load, tasks, events, scoring
  04-day.js         rail, timeline, list, block and event editors
  05-views.js       calendar (events + quotas), tasks, stats, menu, alerts, wiring
  06-sync.js        cloud saving: Google / email sign-in, push/pull, 3-way merge
  07-local.js       LOCAL: keep a .json file in step with the cloud (priority merge)
  09-boot.js        boot
manifest.webmanifest, sw.js, icons/   installable app (PWA)
supabase/schema.sql                   table + push_state() for cloud sync
```

The JS files share one global scope and load in numeric order; each gets its
own `<script>` tag, so boot lives last, in `09`. That order lives in `build.mjs`.

## Keyboard

`T` `C` `K` daily / calendar / tasks · `Q` calendar showing quotas · `S` recap · `V` timeline or list ·
`B` new block · `N` jump to now · `1`–`5` pick a grade · `Ctrl+Z` undo ·
`Esc` close · `?` help

## Licence

The code is MIT — see [LICENSE](LICENSE).

Two typefaces are embedded in `baron.html`, both under the
**SIL Open Font License 1.1**, with their full licence texts in `licenses/`:

- **Pixelify Sans** — © 2021 The Pixelify Sans Project Authors
  ([source](https://github.com/eifetx/Pixelify-Sans))
- **Outfit** — © 2021 The Outfit Project Authors
  ([source](https://github.com/Outfitio/Outfit-Fonts))

The OFL permits bundling and redistribution, including inside a commercial
work, provided the fonts are not sold on their own and these notices travel
with them.
