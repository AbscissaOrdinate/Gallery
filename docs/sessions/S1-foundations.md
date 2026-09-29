# S1 — Foundations: audit, snapshots, view-never-writes guard, undo/history layer

**Surface:** Cloud Code · **Model:** Fable 5.1 (Fable #1 in ROADMAP §6), default effort
· **Readers/subagents:** Sonnet 5.5 @ low · **Branch:** `feat/foundations` from `main`
· **Three PRs, in order.** **Budget:** target ≤ $35 — set a usage-credit spend cap before
starting, and stop at a PR boundary if you pass $30.

Blocked until: S0 merged, and `gallery/11-qol-foundations.md` §1 (undo) is in the repo.

Read first: `docs/ROADMAP.md`, `docs/CLAUDE.md`, `docs/UNITS.md` (skim), `docs/STYLE.md` §1,
`gallery/08-deviations.md`, `gallery/10-record-views-overhaul.md` §7.7 and §8,
`gallery/11-qol-foundations.md` §1 and §5 (S1 part).

## PR 1 — Invariant audit (read-heavy, findings only)

Fan out ≤ 6 reader subagents (Sonnet @ low; ultracode is fine) and synthesise yourself:

| Reader | Question |
|---|---|
| core purity | any React / DOM / `window` import under `src/core/**`? |
| write paths | every call to `repo.save/delete/saveConfig/putTextAsset/writeCsv` and `fs.rename`: caller, trigger, whether it can fire from pure viewing |
| deviations | does the code still match each entry in `gallery/08`? any undocumented departures? |
| conventions | `CLAUDE.md`/`STYLE.md` rules: tokens-only styling, no `eval`, provisional markers reaching the UI, generated (never stored) hull SVGs |
| units | spot-check `UNITS.md` conformance in schemas and kernels (field-name units, SI on disk) |
| coverage | map of vitest + smoke coverage per subsystem; untested areas |

Output `docs/AUDIT.md`: findings table (severity · location · rule · evidence · suggested
fix · owner-decision needed?). Fix nothing in this PR except typos in docs. The write-path
inventory is the input to PR 2 and PR 3 — make it exact.

## PR 2 — Snapshots + view-never-writes guard

- **Snapshots** (doc 10 §7.7): a core service that copies affected files to
  `_snapshots/<ISO-timestamp>/` with a manifest (cause, file list, record ids) via the
  `StorageAdapter`, plus restore (which itself snapshots first). Wire it before: import,
  Skeleton regenerate, schema migration, bulk delete, restore — and expose it for S2's
  rename rewrite. Minimal Settings list: snapshots with cause/time/size and a Restore button.
  The storage-health card stays in doc 10e.
- **Guard** (doc 10 §8): a test that mounts every view/tab/lightbox/toggle against a
  repository spy and fails on any write except `map_angle_deg` on drag. Use
  `// @vitest-environment jsdom` per file (jsdom and Testing Library are already installed);
  for any view that cannot mount in jsdom, cover it in a smoke script via a dev-only write
  counter. Add the core-purity lint rule (`src/core/**` may not import React) to CI.
- Tests: snapshot → restore round-trip is byte-identical on the demo vault.

## PR 3 — Undo / history layer

Implement `gallery/11` §1 exactly. If the spec is ambiguous or looks architecturally wrong
once you are in the code, **stop and ask** — do not improvise the design. Expected shape
(the spec governs): a history stack in `src/core/` wrapping the write paths from PR 1's
inventory; UI drafts (`RecordEditor`, `HullEditor`, map drag) flush then record one step;
transactions group multi-record writes; Ctrl/Cmd+Z and redo routed per the keymap; the
external-change rule refuses rather than clobbers; exempt writes are listed in code with a
reason. Core stack tests in node; one jsdom or smoke test per editor (record form, hull
editor, map drag).

## Hygiene

- Split rule: if context passes ~50% before PR 3 starts, write
  `docs/sessions/S1-handoff.md` and stop — PR 3 continues as S1b on Opus 5.5 @ high.
- Before each PR: `npm run typecheck && npm test`, relevant smoke scripts, and a review
  subagent (Opus 5.5 @ medium) over the diff.
- At the end: record actual spend and context use in ROADMAP §6; mark S1 done/partial in §2.

## Acceptance

- `docs/AUDIT.md` exists with a complete write-path inventory.
- Snapshot round-trip test green; snapshots appear before each listed destructive operation.
- View-never-writes test green across all views; core-purity lint in CI.
- Undo/redo works across record form, hull editor and map drag in one session history; a
  multi-record transaction undoes as one step; externally modified files are never
  overwritten by undo.
