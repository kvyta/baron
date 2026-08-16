# Baron

A single-file day planner that makes you grade yourself.

Plan the day in 15-minute blocks, and when a block's time has passed, give it a
letter grade from **A** to **F**. That grade is the whole point: it turns a plan
into a record, and the record is what tells you whether the plan was ever real.

Baron is one HTML file. No install, no account, no server, no tracking, and not
a single network request — fonts and all are embedded. Open it and it works,
offline, forever.

**Try it:** [kvyta.github.io/baron](https://kvyta.github.io/baron)

---

## The three numbers

| | | |
|---|---|---|
| **SCORE** | 0–100 | How well you did the time you booked, weighted by block length. Ungraded time counts as zero, so it stays honest. |
| **RANK** | 0–10 | How full the day was. Booked hours ÷ 12 × 10, capped at 10. |
| **GOLD** | 0–1000 | `SCORE × RANK`. Only goes up if you booked a real day **and** did it well. |

A short, perfect day scores well but ranks low. A packed day you ignored ranks
high but scores nothing. Gold needs both.

Two things carry across days: your **best gold** ever, and your **streak** of
consecutive days where you graded something.

## Tasks, blocks and events

- A **task** is a thing you do repeatedly — *Deep work*, *Thesis draft*.
  Tasks live in the TASKS tab, where you can rename, hide, or sort them by how
  many hours you've put in. Hiding keeps the history and drops the task out of
  the pickers.
- A **block** is one instance of a task on one day, with an optional note. Blocks
  are blue, and blocks are what get graded.
- An **event** is a calendar meeting. Events are red, are created only in the
  CALENDAR tab, and can repeat (daily / weekdays / weekly / fortnightly /
  monthly). Pull one into today and it fills your day — it counts toward booked
  time and rank, but is never graded and never affects your score.

## The tabs

**TODAY** — the day itself, as a 96-slot timeline you drag on to paint blocks,
or as a flat list of `start – end | task`. A block whose time has passed starts
glowing until you grade it.

**CALENDAR** — a month grid with each day's score and coverage, plus events and
what's coming up.

**TASKS** — the editable task list, filterable by visible/hidden and sortable by
newest, A–Z, or total hours.

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

## Where your data lives

Everything is stored in your **browser's local storage**, per browser and per
machine. Nothing in this repository contains any planner data — clone it and you
start from an empty planner.

Because browser storage can be cleared by accident, `☰ Menu → SAVE TO DISK`
links Baron to a real `.json` file on your computer and writes every change
straight into it. Put that file in Dropbox or iCloud and your planner follows
you between machines. `EXPORT .JSON` / `IMPORT .JSON` do the same thing manually.

> Save files are gitignored. Keep yours outside the repo folder.

The disk link needs the File System Access API — Chrome, Edge or Brave. Firefox
and Safari fall back to browser storage plus manual export.

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
  05-views.js       calendar, tasks, stats, menu, boot
```

The three JS files share one global scope and load in numeric order, so `03`
must come before `04` before `05`. That order lives in `build.mjs`.

## Keyboard

`T` `C` `K` `S` today / calendar / tasks / stats · `V` timeline or list ·
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
