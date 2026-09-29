# S0 — Prep: docs, renames, reconciliation, cloud environment check

**Surface:** Cloud Code · **Model:** Sonnet 5.5 @ medium · **Branch:** `chore/s0-prep` from `main`
· **One PR.** No changes under `src/`, `tests/`, `scripts/` or `src-tauri/`.

Read first: `docs/ROADMAP.md` (all), `docs/CLAUDE.md` (Layout, Conventions), `docs/STYLE.md` §1.

## Tasks

1. **Confirm the drop landed.** These must exist on `main` (the owner uploads them before this
   session): `docs/ROADMAP.md`, `docs/sessions/{S0-prep,S1-foundations,C1-spec-qol,C2-spec-presets}.md`,
   `gallery/reviews/caelum-review.md`, `gallery/10-record-views-overhaul.md`. If any is
   missing, stop and say which.

2. **Normalise doc names** with `git mv` (keep history), then update every reference
   (`grep -rn "gallery/0[347]"` across `*.md`, `*.ts`, `*.tsx`, `*.mjs`; ~13 hits today):
   - `gallery/03-system_map_and_astral_bodies.md` → `gallery/03-system-map-and-bodies.md`
   - `gallery/04-map_polish.md` → `gallery/04-map-polish.md`
   - `gallery/07-editor-suit-spec.md` → `gallery/07-editor-suite-spec.md`
   Leave `05-designer-prompt.md` as is. Output the rename map in the PR description.

3. **Reconcile doc 10** (`gallery/10-record-views-overhaul.md`). Add a `## Revisions
   (2026-09-29)` block under the status line listing each change, then apply:
   - Every `gallery/05-caelum-review.md` / `05-caelum-review.md` → `gallery/reviews/caelum-review.md`.
   - Every `trust: placeholder` → `provisional: true`; §7.1's **T** badge tooltip shows
     `source`/`provisional` (doc 08 dropped `trust`).
   - §4: `src/render/strip-svg.ts` → `src/core/astro/strip-svg.ts`; §8 import-boundary rule
     reads `src/core/**` only (there is no `src/render/`).
   - §7.7 and §8: note that snapshots and the view-never-writes test are delivered by S1
     (`feat/foundations`), before 10a's migration.
   - §7.8: note that motion moves into `docs/STYLE.md` behind a Settings toggle, specified in
     `gallery/11` (C1), and delivered by S3.
   - §9: note that `RecordCard`, redaction rendering and the classification header move from
     10a into S2 (wiki hover previews need them); the rest of 10a is unchanged.
   Do not otherwise edit doc 10's substance.

4. **`docs/CLAUDE.md`:**
   - Layout: `gallery/` holds project docs 00–13 plus `reviews/`; add `docs/ROADMAP.md` and
     `docs/sessions/` (briefs and handoffs).
   - New section **"Sessions and routing"** (≤ 15 lines): start every session by reading
     `docs/ROADMAP.md` and its brief; routing and check plan live in ROADMAP §3–4; write
     `docs/sessions/<ID>-handoff.md` before stopping mid-task; owner decisions in ROADMAP §5
     are binding and the open list is never guessed.
   - `STYLE.md` §1's "nothing animates except…" line: add "— until the motion section from
     `gallery/11` lands (S3)". Do not write the motion section yourself.

5. **`gallery/HANDOFF.md`:** add a one-line header: superseded by `docs/ROADMAP.md`
   (2026-09-29); keep the file.

6. **Cloud environment check.** Run and record in ROADMAP §7 (commands, pass/fail, wall
   time, test count):
   `npm ci` · `npm run typecheck` · `npm test` · `npm run build` ·
   `npx vite preview` (background) then `node scripts/ui-smoke.mjs` and
   `node scripts/ui-smoke-hull.mjs`. If Playwright's browser is missing, try
   `SMOKE_CHROME=/opt/pw-browsers/chromium` (or whatever `find / -name chrome -type f`
   yields) and record the working value. `cargo test` / Tauri are expected to be unavailable
   in the cloud — record that, don't fix it. Do not fix failing tests; record them.
   Also record the Claude Code version (`claude --version`) and whether `/model` lists
   Fable 5.1.

## Acceptance

- `npm run typecheck && npm test` green (nothing under `src/` changed).
- `git diff -M --stat main` shows three renames at ~100% similarity plus doc edits only.
- `grep -rn "07-editor-suit-spec\|04-map_polish\|03-system_map_and\|src/render/\|trust: placeholder"`
  returns nothing outside the doc 10 revisions block.
- ROADMAP §7 filled; S0 row marked done with the PR link.

## Report back (PR description)

Rename map · doc 10 revision list · env table · anything surprising.
