# C1 — Spec doc 11: undo, wiki link layer, QoL shell, motion + ASCII

**Surface:** Cowork (separate session, attached to the Gallery project) · **Model:** Opus 5.5 @ high
· **Output:** `gallery/11-qol-foundations.md` written to the project (the owner uploads it to
the repo, or S1 commits it). You do not edit the repo.

You are writing the spec that three Code sessions build from: **S1** (undo/history layer),
**S2** (wiki core), **S3** (QoL shell, motion, ASCII). A Code session must be able to
implement each section cold, without asking you anything. Where a choice is the owner's,
put it to him (≤ 5 questions, one round, with a recommended default) before finalising.

## Read first

- Project: `ROADMAP.md` (§2 queue, §3 rubric, §5 rulings), `gallery/10-record-views-overhaul.md`
  (§2 page layout, §3 `x-card`, §7 cross-cutting UI), `gallery/reviews/caelum-review.md` (7, I, L).
- Repo (clone `https://github.com/AbscissaOrdinate/Gallery`, public): `docs/CLAUDE.md`,
  `docs/STYLE.md`, `src/core/repo.ts`, `src/core/ids.ts`, `src/core/types.ts`,
  `src/core/sessionLog.ts`, `src/ui/state.ts`, `src/ui/RecordEditor.tsx`,
  `src/ui/SchemaForm.tsx`, `src/ui/Settings.tsx`, `src/ui/kit/Ascii.tsx`, `src/ui/Boot.tsx`,
  `src/core/astro/asciiOrbits.ts`.

## Facts already established (verified 2026-09-29 — re-check, don't trust blindly)

- Write paths: `repo.save`, `repo.delete`, `repo.saveConfig`, `repo.putTextAsset`,
  `repo.writeCsv`. UI callers: AssetsPanel, Settings, NewRecordMenu, SystemMap,
  SystemBuilder, ImportDialog, RecordEditor, hull/HullEditor (+ demo.ts).
- `RecordEditor` and `HullEditor` each hold a local draft with a 900 ms autosave and flush on
  unmount (duplicated code; doc 09 §3.3 plans `useRecordDraft`).
- Record ids are stable random ids (`ids.ts`); **filenames are slugs of the name and are
  renamed on name change** (`repo.ts` ~l.324). Typed refs (`links[]`, schema ref fields) are
  by id, so they survive rename; free-text `[[Name]]` links would not.
- `repo.search` and `repo.backlinks` exist; `state.history` gives back navigation; each
  record keeps a per-session revision log.
- No undo, no `[[…]]` parsing, no global hotkeys today. Tests are `environment: node`;
  `jsdom` and `@testing-library/react` are already devDependencies.
- `STYLE.md` §1 currently forbids all animation except the ASCII spinner, the indeterminate
  ASCII bar and the boot orbital idle.

## Owner rulings (binding)

See ROADMAP §5 items 2–5. In short: app-wide undo/redo for the session, drags as single
steps, not persisted; all six wiki features with `[[link]]`, redlinks and rename rewrite
first; QoL is an open category; motion adopted into STYLE.md behind a Settings toggle; more
ASCII animation (more spinner frames, a full 2:1 resonance loop, more loading bars).

## Sections doc 11 must contain

### §1 Undo / history layer (→ S1)
Decide and specify, with reasons:
- Where it sits (a history layer wrapping the repository write API vs a command bus) and how
  UI drafts interact with it (flush-then-undo; what one "step" is for typed text vs autosave
  bursts vs a canvas drag vs a multi-record transaction).
- Step representation (whole-record before/after is the simple default; justify anything
  finer), transaction grouping API, stack depth, redo invalidation.
- Keyboard routing: Ctrl/Cmd+Z, Ctrl+Shift+Z / Ctrl+Y; native text undo inside a focused
  input vs app undo elsewhere.
- Which writes are undoable, which are exempt and why (derived CSV, assets?, config,
  `map_angle_deg`), and the **external-change rule** (file changed on disk by sync since the
  step → refuse with a message, never clobber).
- Delete and rename (file move) undo; interaction with S1's snapshots; session-log entries.
- Tests: core reducer/stack tests in node; one jsdom or smoke test per editor.

### §2 Wiki link layer (→ S2)
- Syntax (`[[Target]]`, `[[Target|label]]`, `![[Target]]` transclusion, heading/section
  anchors or not) and **storage form** — propose `[[Name]]` vs `[[id|Name]]` to the owner
  with the rename consequences of each.
- Resolution: name → alias → id; ambiguity rule; case/whitespace normalisation.
- Link index: derived at load, updated on save; merges with typed `links[]` for backlinks
  (backlinks section must show both, labelled).
- Autocomplete in Markdown body fields (trigger, ranking by recency + fuzzy match, type chip).
- **Redlinks:** rendering (use the redaction/`—` vocabulary from STYLE.md, not a new colour),
  click → create dialog (name prefilled, type picker, host/parent optional) → link resolves.
- **Rename rewrite:** one transaction = one undo step, preceded by a snapshot; preview list
  of affected records; alias option ("keep old name as alias").
- Hover preview = the `RecordCard` from doc 10 §2/§3 (`x-card`), with redaction for empty
  fields and the classification header — S2 builds these three primitives; specify the
  minimum so 10a later extends rather than replaces them.
- Tag pages; transclusion (read-only, depth limit, cycle guard).

### §3 QoL shell (→ S3)
Treat the owner's list as a category: command palette (Ctrl+K) and quick switcher,
shortcut sheet (`?`), duplicate record, recent and pinned records, multi-select + bulk
tag/delete (snapshot first), save/dirty indicator, find-in-page, Ctrl+S flush, back/forward
keys, plus anything else of the same kind you judge worth it — each with a one-line
rationale, priority (must/should/could), and acceptance line. One keymap table for the app.

### §4 Motion and ASCII (→ S3, also edits `STYLE.md`)
- Draft the **`STYLE.md` Motion section** verbatim: tokens (`--m-fast 130ms`, `--m-med
  260ms`, one easing), what may move (section entrance 8 px rise + 35 ms stagger capped,
  hover, tab/change fades), what never moves, and the Settings toggle (proposed: Full /
  Reduced / Off; default from `prefers-reduced-motion`; stored as view config, never in
  records).
- ASCII set: longer spinner cycle; the **2:1 resonance loop** (two bodies, inner completes two
  orbits per outer one, frame count and cadence, reuse `asciiOrbits.ts` conventions) and
  where it appears (boot, long operations); where new ASCII progress bars are needed (import,
  snapshot, migration, rename rewrite, CSV export). All stop or go static under Off/Reduced.

### §5 Work breakdown and acceptance
Per session (S1 / S2 / S3): PR list in order, files touched, acceptance criteria written as
checks a reviewer can run, smoke scripts to add or widen, and a routing score using ROADMAP
§3.1 (flag if any section scores ≥ 16).

## Constraints

Follow `docs/CLAUDE.md` and `STYLE.md` (tokens only, no new colours, mono for values).
`src/core/**` stays React-free — the history stack and link index belong in core. No new
runtime dependencies without a one-line justification. Keep doc 11 under ~600 lines; prefer
tables and acceptance lists over prose.

## Hand back

Write doc 11 to the project, then post a ≤ 10-line summary: decisions taken, owner answers,
anything that changes S1–S3 routing.
