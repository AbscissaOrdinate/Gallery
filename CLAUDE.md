# Gallery

Tauri 2 + React/TypeScript worldbuilding workbench. All logic is TypeScript; the Rust
side is filesystem glue. Phase 3 (the module/hull/craft designer) is in progress on
branch `phase3-designer`.

## Commands

npm ci              # install
npm run typecheck   # tsc, must be clean before any commit
npm test            # vitest, must be green before any commit
npm run build       # vite build
npm run app:dev     # Tauri dev shell (needs Rust + VS Build Tools)
cargo test          # Rust fsops tests, in src-tauri/

## Read before touching src/core/

gallery/03-phase2-bodies-and-maps.md   what exists and how it is structured
gallery/04-map-polish.md               UI conventions: hover-for-detail, declutter,
                                       label placement, display modes, units
gallery/05-designer-prompt.md          the phase 3 specification

## Layout

src/core/        pure TypeScript. No React imports here, ever. astro/ (Worldsmith +
                 EWoCS body physics), designer/ (budgets), codecs/, repository.
src/ui/          React. demo.ts holds demoVault(), the canonical test fixture.
src-tauri/       Rust: 9 fs/settings commands. Atomic writes (temp + rename) so a
                 sync client never sees half a file.
tests/           vitest, environment: node, tests/**/*.test.ts
scripts/         Playwright UI smoke tests live here, not in vitest.

## The vault

The vault is a plain folder of records, separate from this repo, synced by OneDrive:
  %USERPROFILE%\OneDrive\Documents\Worldbuilding\Gallery Fleet Builder\gallery\
Records are <folder>/<slug>.<type>.yaml. Notes are OPML. Sheets are CSV, regenerated
on save. Never commit vault data into this repo.

_tables/ exists twice on purpose: a built-in seed copy in this repo, and an editable
copy in the vault. The disk copy wins, matching how Registry.seed() handles schemas
and presets.

## Conventions

- Core logic is pure and framework-free, and is unit-tested against hand-computed
  fixtures with the arithmetic shown in comments.
- No eval, no new Function, no dynamic code execution anywhere in the expression layer.
- Schema versioning: built-ins carry `version`; a newer built-in replaces the on-disk
  schema with a `.v<N>.json` backup; `"custom": true` opts out. Note that this migrates
  SCHEMA FILES ONLY — record migration does not exist yet and is being added in phase 3.
- Physical figures come from _tables/ with a `source` field. Never invent one. Rows
  flagged `provisional: true` must render with a visible marker wherever they surface.

## Do not touch

The system map, body physics, and the OPML outliner, except where the phase 3 spec
explicitly requires it (fleet and vessel records feeding the military display mode).
