# S1 handoff

Updated at the end of every S1 session (S1a → S1d). Newest first.

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
Not fixed: hull component selection and a lightbox are not reached by the guard (no lightbox
exists until doc 10b).

**Not done / deliberately deferred**
- **ROADMAP §2 S2–S5b row replacement.** `docs/sessions/S2-wiki.md`, `S3-qol-shell.md`,
  `S4-star-types.md` and `S5-orbits-and-starters.md` are not in the repository (checked every
  branch), so those rows were not rewritten; a "Pending" note in §2 says so. S4 was moved
  directly after S1d and H1 added after S4 (read as: S4 "directly after S1", H1 "after S1d").
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

**Open questions for the owner**
- The map's **distance-unit switch** persists to `gallery.config.yaml` from a view. The guard
  exempts it by name. Keep (vault preference) or move to app settings / session state?
- Import is create-only, so its snapshot holds `_index.csv` and any file already at a target name
  — nominal. Fine, or should import be a no-snapshot operation until S1c's transaction?
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
