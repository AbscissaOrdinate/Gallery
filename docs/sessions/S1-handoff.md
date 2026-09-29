# S1 handoff

Updated at the end of every S1 session (S1a → S1d). Newest first.

## S1d — history UI, PR 3b (Sonnet 5.5 @ high) — done, PR "S1d — history UI" open

Branch: the session's assigned `claude/adoring-hypatia-q970aa` (branch names are advisory, ROADMAP §2),
from `main` at `f12ab8e` — which holds #13 (history core) and #14 (rename-collision fix), confirmed
before starting. Doc 11 §1.8 and §5's 3b row govern. **This closes S1: the ROADMAP row is "in review"
until the PR merges.**

**Done**
- `src/ui/drafts.ts` (new, pure): `register`, `track`, `flushAll`, `dirtyCount`. `flushAll` also waits for a
  save an unmounted editor left in flight.
- `src/ui/useRecordDraft.ts` (new): `{ loaded, draft, edit, dirty, saving, flush, checkpoint }`. 900 ms
  autosave, flush on unmount, reload of a *clean* draft when `repo.version(id)` moves, `edit()` a no-op
  for a patch that changes nothing (F1). Every save carries an `origin` (`record:<id>:<n>.<k>`,
  `hull:…`); `checkpoint()` flushes and starts a new origin. Flushes are serialised (a second waits for the
  running save, then re-checks dirty), and a draft is marked clean only if it is still the object that was
  saved — edits made during a save stay owed. **A taken slug:** the draft adopts the slug the repository
  chose, a toast says `SLUG TAKEN — a → a-2`, and `RecordEditor` stops the filename following the name
  (else every title blur would retry the taken slug).
- `src/ui/keys.ts` (new): one router, installed once in `App.tsx` (replaces its listener; Ctrl+K and Alt+←
  keep working). `commandFor` is pure and tested: in a text entry (text/number/search input, textarea,
  contenteditable) Ctrl/Cmd+Z and redo are the browser's; on buttons, checkboxes, selects and canvases the
  app takes them; ignored while the boot screen shows or an element with `data-overlay` is open (S3's
  palette will set it).
- `state.ts`: `actions.undo()` / `redo()` (`flushAll` → `repo.undo()` → toast `UNDONE — <label>` /
  `REDONE — …`; `UNDO REFUSED — <file> CHANGED ON DISK`, `+N MORE` when several). **An empty
  `ApplyResult` (`ok: false`, no label, nothing refused) is nothing to undo: no toast, no log line** (owner
  ruling). After an undo of a create the page that showed the record goes to the list. `reload`,
  `reopenVault`, `closeVault` (now async) flush first. `repo.onLog = logEvent`, beside `onSnapshot`.
  `getApp()` and `historyToast()` exported.
- `RecordEditor` and `HullEditor` use the hook and hold no timers (grep: none). `HullCanvas` takes
  `onCheckpoint`, called at pointer-down on a handle and at the end of its drag: a drag is exactly one step.
  Deleting from the record page flushes first (else the unmount flush could bring the record back).
- `SystemMap`: a drag saves with `origin: map-drag:<n>` (module counter, so drags never coalesce) and label
  `MOVE <NAME>` / `PARK <NAME> AT <L-POINT>`; the settings panel saves with `origin: map-settings:<id>` and
  follows the record after an undo; the layout memo key now includes `repo.version(id)` (`updated` alone
  missed an undo that restores a timestamp already seen this second).
- `SystemBuilder`: one `repo.transaction("GENERATE SKELETON — <NAME>")`, snapshot through `opts.snapshot`
  (the old standalone `repo.snapshot` call is gone; the step records the snapshot id). `ImportDialog`: one
  transaction `IMPORT n NOTES`; passes `opts.snapshot` (ids) from 10 notes up, and keeps its own
  paths-snapshot before the transaction (ruling 12) — the ids are new notes, so `opts.snapshot` finds no
  file; it is there so the rule holds literally. `NewRecordMenu` toasts a collision.
- Tests: `tests/undo-record.test.tsx` (13: the §1.9 form case, redo by both chords, a pending edit flushed
  first, Ctrl+Z in a field left alone, empty stack, external edit refused + logged, `onLog`, slug adoption,
  hull drag = one step, map drag, two drags never coalesce, form+map+hull undone in reverse order, skeleton
  generate = one step with its snapshot), `tests/keys.test.tsx` (21), `tests/drafts.test.ts` (4), two in
  `import-dialog.test.tsx` (one step; `opts.snapshot` from 10), and **the L-point park guard test** in
  `view-never-writes.test.tsx` (writes only `lagrange_of`/`lagrange`, one step labelled `PARK ANTARES AT <L-POINT>`,
  undo restores the bytes). Mutation-checked: an empty result treated as a refusal, no flush before undo, and
  no hull checkpoint each fail a test. `tests/helpers/browserShims.ts` gained a `PointerEvent` (jsdom has none,
  so every `fireEvent.pointer*` dropped its coordinates — the old map-drag test wrote `NaN`).
- `scripts/ui-smoke-undo.mjs`: form edit + map drag + hull drag → three Ctrl+Z in reverse order (Reload
  re-reads the files to prove them), skeleton generate = one step, Ctrl+Z in a text field left alone. Against
  `npx vite` (SMOKE_URL=http://localhost:5173/) it also compares file bytes and edits a file behind the app's
  back for the UNDO REFUSED check; against `vite preview` those two are skipped and said so.
- Docs: ROADMAP §1, §2 (S1c done, S1d + S1 in review), AUDIT "Status after S1d", `docs/CLAUDE.md`.
- Checks: `npm run typecheck`; `npm test` (41 files, 797 tests); `npm run build`; every `ui-smoke*.mjs`
  (`ui-smoke`, `-map` 1–5, `-hull`, `-ship`, `-screens`, `-map-lod`, `-log-boot`) clean (the one known 404
  in `ui-smoke`); `ui-smoke-undo` clean on both the dev server and the preview build. `cargo test` not run
  (no GTK in the cloud, ROADMAP §7).

**Review (subagent, Opus 5.5 — the Agent tool takes a model, not an effort level, so "medium" was asked for in the
prompt)** — two real bugs found and reproduced, both fixed with a test that fails without the fix; one race fixed:
- The map settings panel's 400 ms debounce was not in `flushAll`: Ctrl+Z on a settings checkbox inside that window
  was silently overwritten when the timer fired. It now registers in `drafts.ts` (flush = save now, dirty = pending),
  saves on leaving the panel, and no longer fires after a vault closes.
- `SystemBuilder` saved the record page's *draft* without flushing it: an edit made just before CREATE was folded
  into the skeleton step and saved again on top. It now `await flushAll()`s before the transaction.
- A checkpoint's flush keeps the old origin; every other flush reads the origin after waiting for a running save,
  so early drag edits can no longer be filed under the step before the drag.
Not changed (recorded by the reviewer as older behaviour): a dirty compact inspector draft on the map still wins over
a drag of the same body, so the drag is lost when the draft autosaves. Confirmed correct: draft bookkeeping, no
re-save after undo, the owner rulings, key routing, no deadlocks.

**Not done / for later**
- Distance-unit switch stays `saveConfig` from the map (deferred to S3 by ruling); the guard still exempts it by name.
- S3 owns: the `DELETED — CTRL+Z TO UNDO` toast hint, SAVE ALL / the save indicator (`dirtyCount()` is there),
  the rest of the keymap.
- The L-point park guard exercises a location without `orbit_km` (Antares, a cycler); the `orbit_km` removal
  for a station parked from a moon orbit is not reached by it (that station only shows when zoomed in).
- A dirty compact record inspector on the map beats a map drag of the same body (older behaviour; see the review).

**Open questions for the owner**
- None blocking.

Context used: about 300k tokens.

## S1c — history core, PR 3a (Opus 5.5 @ high) — done, PR "S1c — history core" open

Branch: `feat/foundations-history-core`. Doc 11 §1 governs; no UI file changed.

**Done**
- `src/core/history.ts` (new, pure): `FileSide`, `Entry`, `Step`, `History` (push / coalesce per
  §1.3 / depth 200 / `peekUndo` `peekRedo` / `commitUndo(step?)` `commitRedo(step?)` / `clear` /
  `subscribe` / `version`), `entryLabel` (`EDIT` / `CREATE` / `DELETE` / `RENAME A → B`, name
  upper-cased, `describeChange` parts). `handling.ts` exports its part renderer as `renderChange`.
- `Repository` (`src/core/repo.ts`):
  - `lastText` (filled by `load()` from the text it reads, and by every write) is each step's
    `before.text`; `saved` is its `before.record` — never `byId` (F4: the map mutates that in place).
  - `save(r, { touch, history, origin, tx })` and `delete(id, { history, tx })` record one step, or
    one entry of `tx`. A save that writes the same bytes to the same path makes no step.
  - `transaction(label, fn, { snapshot })`: nesting throws; a finished handle throws; writes outside
    `tx` meanwhile are their own steps; CSV once at the end; a throw after writes keeps the partial
    step as `<label> — INCOMPLETE`, logs a violation, rethrows.
  - **Delete snapshots** (`Before delete`) unless it is inside a transaction whose snapshot holds
    that file. `delete`'s old `{ snapshot: false }` option is gone (folded in, as S1b asked).
  - `undo()` / `redo()` → `ApplyResult`; serialised. `apply` preflights every entry against the
    disk *as the earlier entries of the same step will have left it* (so a record saved twice or
    renamed twice in one transaction applies), refuses the whole step on any mismatch, writes
    nothing, stacks unchanged. I/O error part-way: violation naming the files written, rethrow, step
    stays. CSV once per apply.
  - `version(id)`: bumps on save, delete, apply, and on `load()` only for records whose file
    changed, appeared or went. `load()` keeps the history.
  - `restoreSnapshot` is now a transaction (`RESTORE SNAPSHOT <id>`, `Step.snapshot` = the
    "Before restore" safety snapshot): undo returns the *record* files to before the restore.
    Config/CSV a snapshot restores are not undoable (§1.6 exempts them); they are in the safety snapshot.
  - `onLog?: (line: LogInput) => void` — history's session-log lines (source `history`, prefix
    `HIS` added to `sessionLog.ts`): `UNDONE — <label>` / `REDONE — <label>` info;
    `UNDO REFUSED — <path> CHANGED ON DISK` caution per refused path with the remedy (and the
    snapshot id, when the step has one) in `detail.note`; violations for INCOMPLETE and part-way
    failures.
- Tests: `tests/history.test.ts` (21: pointers, redo cleared, depth, coalescing on and off each
  §1.3 condition, labels), `tests/repo-undo.test.ts` (35: every §1.9 core case, plus restore-undo,
  same-record-twice-in-tx, I/O failure + retry, version bumps, and the review follow-ups below). `snapshots.test.ts` updated for the
  folded delete option. Mutation-checked: disabling the refusal fails 5 tests; preflighting
  against the raw disk (no per-step view) fails 1.
- Checks: `npm run typecheck`, `npm test` (38 files, 744 tests). `grep -rn "history: false"` →
  one hit, in a test, commented `// history: exempt —`. No React under `src/core`
  (`core-purity.test.ts` green). No smoke run: nothing under `src/ui` changed.

**Review (subagent, Sonnet 5.5 @ high)** — no unconditional blockers. Fixed from its findings:
- **Write gate** (`enterWrite` / `exclusive`): a save, delete or transaction landing while an
  undo/redo was writing could be clobbered between preflight and write. Now an apply starts only
  when no write is in flight and holds new writes off until done; writes never wait for each
  other, a transaction's own writes pass freely. Consequence: `fn` of a transaction must never
  await `undo`/`redo` (documented; it would wait forever).
- A step an I/O error stopped part-way is resumed on retry (entries already applied are checked to
  still hold, not re-applied); before, it was refused for ever and blocked the stack.
- Coalescing also requires the new burst to start from exactly the file the previous one left
  (an external edit picked up by a reload no longer gets folded in and wiped by undo); a folded
  step keeps its identity and is relabelled for the whole span (a typed rename reads `RENAME OLD → NEWEST`).
- `restoreSnapshot` reloads first (its `before` is the real disk, not a stale `lastText`); a restore
  that fails part-way still becomes an `— INCOMPLETE` step with a violation, and memory follows disk.
- `save(r, { label })` added — §1.3 gives the map drag `MOVE <NAME>` / `PARK <NAME> AT <L-POINT>`
  on a plain `save`; ignored inside a transaction.
- The step is filed before `emit()`, so a throwing subscriber no longer loses it; a transaction
  without its own snapshot names its first delete's "Before delete" snapshot on the step.
- Tests added: F4 in-place edit, refusals (rename onto a taken path, create edited on disk, delete
  whose record is back), refused redo of a transaction, partial apply + resume, save during an
  undo, two quick undos, coalescing over an external edit, restore failing part-way. Mutation-checked:
  removing the gate or the resume each fails its test.

Not taken (recorded): a hard cap on a coalesced step's span (not in the spec); `ApplyResult` does not
carry the step's snapshot id (spec shape; the log note names it); a no-change `save` that only
bumps `updated` still makes an `EDIT X` step; a second *concurrent* (not nested) transaction also
throws "Nested transaction"; `adopt` drops `LoadedRecord.migrated`/`problems`. **Pre-existing, out of
scope:** `save` renaming onto a path another record holds overwrites it (undo makes it worse) —
queued as a separate task.

**Owner rulings on the interpretations (PR #13 review — keep both)**
- Coalescing window: after a burst folds in, the step's `at` becomes the new push time, so the
  4 s is measured from the *last* burst (steady typing with short pauses stays one step).
- `undo()`/`redo()` with nothing to apply return `{ ok: false, label: "", refused: [] }`.
- The step label is the record's name upper-cased with `toLocaleUpperCase("en")`.

**Not done (S1d — PR 3b, UI wiring)**
- Wire `repo.onLog` in `state.openVault` (next to `onSnapshot`) to the session log.
- **`ApplyResult` with `ok: false`, `label: ""` and an empty `refused` means "nothing to undo/redo"**
  (owner ruling): `actions.undo()`/`redo()` must **not** toast `UNDO REFUSED` for it — no refusal
  toast, no log line. Only a non-empty `refused` is a refusal.
- Everything in doc 11 §1.8: `useRecordDraft`, `drafts.ts`, `keys.ts`, `actions.undo/redo`
  (flushAll first; toast `UNDONE — <label>` / `UNDO REFUSED — <file> CHANGED ON DISK`), origins
  for the record/hull editors and map settings, hull `checkpoint()`.
- Wrap `SystemBuilder` (F5) and `ImportDialog` in `repo.transaction`. `ImportDialog` snapshots
  *paths* it could overwrite (ruling 12), not ids; keep that call before the transaction rather than
  moving it into `opts.snapshot`, which takes ids.
- Map drag: `repo.save(rec, { origin: "map-drag:<n>", label: "MOVE MARS" })` (or
  `PARK MARS AT L4`); a per-drag origin never coalesces.
- The L-point-park guard test (carried over from S1b).
- F3: after an undo, `RecordEditor`'s effect keyed on `loaded.record.updated` already re-syncs a
  clean draft (the undone record has the older `updated`); `useRecordDraft` replaces it with
  `repo.version(id)`.

**Open questions for the owner**
- None blocking. The three interpretations above stand unless the owner says otherwise.

Context used: about 270k tokens.

## S1b — snapshots + guard (Sonnet 5.5) — done, PR "S1b — snapshots + guard" open

Branch: the session's assigned `claude/confident-planck-4mlgh2` (branch names are advisory; the
PR title carries the session ID).

**Done**
- `src/core/snapshots.ts`: `_snapshots/<id>/manifest.json` + `files/<path>`; `SnapshotWriter`,
  `takeSnapshot`, `listSnapshots`, `restoreSnapshot`, `VaultUpgrade`. Id = ISO time with `:` and
  `.` turned into `-` (Windows-safe), `-2`… on a clash. Manifest paths are validated
  (`isSafeVaultPath`): a manifest is untrusted vault content.
- `Repository`: `snapshot(cause, ids, { paths? })` → `SnapshotManifest | undefined`,
  `snapshots()`, `restoreSnapshot(id)` (snapshots what it overwrites first, moves a record renamed
  since back instead of duplicating it, reloads, regenerates CSV), `onSnapshot` hook (the UI logs
  every snapshot from it). `delete(id, { snapshot?: false })` snapshots "Before delete" first.
  `load()` no longer walks into `_snapshots/`.
- Snapshots wired before: delete (RecordEditor), import (`ImportDialog`), skeleton generate
  (`SystemBuilder`), vault upgrade (`init`), restore. Settings → SNAPSHOTS lists cause / time /
  files / size with an inline-confirm RESTORE (`SnapshotsPanel.tsx`).
- F2: `init()` returns `{ snapshot, rewritten, skipped }`. Missing files are created without a
  snapshot; an existing file is overwritten only if the content differs, after one shared
  "Before vault upgrade" snapshot; if it cannot be snapshotted it is left alone and reported.
  `openVault` logs one info line (`Vault upgraded — N files rewritten…`).
- F1: title blur edits only when the slug changes; `edit()` ignores a patch that changes nothing
  (`src/core/equal.ts` `sameValue`). Also closes the tags/aliases blur write.
- Guard: `tests/view-never-writes.test.tsx` (jsdom, `SpyAdapter` in `tests/helpers/`). Mounts the
  app and every record's page (map for systems, hull editor for hulls; craft in the hull editor
  too), the list/settings/import/log views and the rail; presses every tab, segmented switch,
  pressed-button, overlay checkbox and display-mode option; focuses and leaves every field; runs
  timers past every debounce and unmounts. Also: open-twice-writes-nothing, a positive control (a
  real edit is seen), rename still moves the file, a map drag writes only `map_angle_deg`.
  Mutation-checked: with the F1 fix or the `edit()` no-op removed, it fails.
- `tests/snapshots.test.ts` (round trip byte-identical on the demo vault, renamed-record restore,
  damaged snapshot changes nothing, F2 cases, open-twice), `tests/import-dialog.test.tsx`
  (smoke: preview → import → snapshot precedes first write), `tests/core-purity.test.ts` (F7).
- `vitest.config.ts` includes `.test.tsx`; a file opts into jsdom with the docblock.
- Docs: STYLE §1, `docs/CLAUDE.md`, ROADMAP §2 (S4 after S1d, H1, branch note) and §5 (rulings
  11, 12; F17 in the open list), AUDIT "Status after S1b".
- Checks run: typecheck, `npm test` (686 tests), `npm run build`, and every `ui-smoke*.mjs`
  (`ui-smoke`, `-map` 1–5, `-hull`, `-ship`, `-screens`, `-map-lod`, `-log-boot`) — all clean
  (the single known 404 in `ui-smoke`). Settings → SNAPSHOTS checked in the browser
  (delete → snapshot → restore). `cargo test` not run (no GTK in the cloud, ROADMAP §7).

**Review (subagent, Opus)** — no data-loss bug in the snapshot/upgrade/delete/import/skeleton
ordering; the guard is not vacuous (fails with the F1 fix removed). Fixed from its findings:
restore refused when the old path now holds a *different* record (which record a file holds is
read from the snapshot copy, not the manifest); the distance-unit switch no longer writes when
the already-active unit is clicked (guard now presses the active option); a failed first copy no
longer leaves a snapshot id (`VaultUpgrade`); `_snapshots` path check is case-insensitive; the
guard now also selects map objects and sweeps the map inspector, cycles the list sort, and
asserts the unmount flush of the last view. One pre-existing bug fixed on the way: the title
blur never moved the file once the 900 ms autosave had fired (it compared against the
already-saved record); it now uses whether the slug followed the name when the page opened.
Not fixed: the L-point park path (see S1d above), hull component selection and a lightbox are not reached by the guard (no lightbox
exists until doc 10b).

**Not done / deliberately deferred**
- ~~ROADMAP §2 S2–S5b row replacement~~ — done once the four briefs landed on `main`
  (`S2-wiki`, `S3-qol-shell`, `S4-star-types`, `S5-orbits-and-starters`): rows are now S4-A / S4-B /
  S4-J, H1, S2a–c, S3a–b, S5a-1, S5a-2, S5b, C3; calibration table updated to match (ruling 11).
- No retention policy for snapshots: they accumulate (and sync). The storage-health card is 10e.
- Restore is not undoable yet — S1c makes it a transaction (doc 11 §1.6).

**For S1c — the API to call**
- `repo.snapshot(cause, ids, { paths? })` returns the manifest; `manifest.id` is
  `Step.snapshot`. Ids not loaded and files that do not exist are skipped; a copy that fails
  throws (do not proceed with the write). `transaction(…, { snapshot: { cause, ids } })` should
  call it before the first entry. Cause constants: `SNAPSHOT_CAUSE` in `snapshots.ts`
  (`bulkDelete` is there for S3).
- `delete(id, { snapshot?: false })` is for a caller that already took a covering snapshot; fold
  it into the `{ history, tx }` options doc 11 §1.4 plans. A `tx.delete` inside a transaction
  that already snapshotted must pass `snapshot: false`, and a bulk delete of fewer than 10 ids
  has no transaction snapshot — as it stands it would take N "Before delete" snapshots rather
  than one "Before bulk delete" (doc 11 §1.7). Give the transaction the snapshot for any
  delete.
- `restoreSnapshot` currently does its own `load()` + CSV; make it a transaction.
- `onSnapshot` is set in `state.openVault` and logs source `snapshot` (prefix `SNP`).

**Owner rulings applied after review (PR #12)**
- `docs/sessions/S1-foundations.md` restored to the S1a text (the upload on `main` had reverted it);
  Fable removed from the ROADMAP (ruling 13); rows L (local checkpoints) and C5 (done: `gallery/13-planet-editor.md`) added to §2; R4 replaced by R4a–R4j (doc 13 §11) and ruling 14 records doc 13's owner answers.
- Distance unit → a per-install preference (Settings + the map's quick switch), **deferred to S3**.
  Until then it stays `saveConfig` from the map and the guard exempts it by name (recorded in
  ROADMAP §5.12).
- Import keeps its snapshot but only of files it could overwrite: `_index.csv` is dropped
  (derived), so an import onto no existing file takes none. Tested both ways.
- View-never-writes exception is "map drag **or L-point park** writing `map_angle_deg`,
  `lagrange_of`, `lagrange`, `orbit_km`" (doc 11 §1.6): wording updated in `docs/CLAUDE.md`,
  ROADMAP §4 and the guard file header.
- Fix: `followsName` is cleared when the slug field is typed in, so a slug typed this visit is
  not overwritten by the next title blur (jsdom case: slug edit → focus/blur title → no writes,
  slug and path unchanged; also holds after a later name change).

**For S1d**
- **Add the L-point-park guard test.** The guard covers only a `map_angle_deg` drag today; a park
  (drop on an L-point → `lagrange_of` + `lagrange`, `orbit_km` removed for locations) is
  unexercised. It needs a body/location dropped near a `lpointDots` target in the jsdom map.

**Open questions for the owner**
- F17 (boot-log replay vs "nothing animates") is still open (ROADMAP §5).

## S1a — audit (Sonnet @ medium) — done, PR open

**Done**
- `docs/AUDIT.md`: exact write-path inventory, 19 findings, coverage map. Deviations and units
  readers were **not run** (listed under "Not audited" there).
- ROADMAP §2 split into S1a–d; §3.2, §6 updated for the Pro-plan Fable constraint; S1 brief
  header and split rule updated.
- Branch used: `claude/foundations-audit-roadmap-0og005` (the session's assigned branch), not
  `feat/foundations-audit`.

**Not done**
- No code changed (audit only). F1 and F2 are the two high findings; neither is fixed.

**Next step (S1b — snapshots + guard, Sonnet @ high)**
- Fix F1 (title `onBlur` dirties the record) so the guard test can pass; it is the one known
  view-time write.
- Snapshot service per doc 10 §7.7; wire it before `registry.seed` overwrites (F2), import,
  Skeleton regenerate, migration, bulk delete, restore.
- Guard test needs `.test.tsx` in the vitest include; add the core-purity check (F7).
- Widen the smoke write counter to `SystemMap` and `HullEditor` if they cannot mount in jsdom.

**Open questions for the owner**
- F2: is open-time seeding/schema overwrite "viewing" (must not write) or exempt-with-snapshot?
- F19: guard scope — vault writes only, or also `settings.json` / `localStorage`?
- F13, F14, F16, F17: STYLE.md exceptions (severity left-borders, floating-element shadows,
  demo hand-authored SVG, boot log replay).

**Constraints for S1c/S1d**
- F3: `RecordEditor` re-syncs `draft` from the loaded record when not dirty; undo must not race it.
- F4: map drag mutates `rec.fields` in place before saving — capture the pre-image first.
- F5: `SystemBuilder` does up to 6 saves + a CSV write per save; needs one transaction step.
