# Gallery — Invariant audit (S1a / PR 1)

Audited at `main` @ `210f5dc`, 2026-09-29. Findings only — nothing was fixed in this PR.
Input to S1b (snapshots + view-never-writes guard) and S1c/S1d (history layer).

Method: four Sonnet @ low reader subagents (write paths, core purity, conventions, coverage);
the lead re-verified the write-path inventory, the two highest-impact findings, and the
`locColor` question against the source. Grep was the main tool; unusual forms may be missed.

## Not audited

- **Deviations** — whether the code still matches each entry in `gallery/08-deviations.md`,
  and any undocumented departures. Skipped by instruction (Pro plan budget).
- **Units** — `UNITS.md` conformance in schemas and kernels. Skipped by instruction.

Both remain open for a later session.

## 1. Write-path inventory (exact)

"Viewing" = mount, selection, navigation, tab/toggle, lightbox, or effect-on-load.

### 1.1 Adapter surface

`StorageAdapter` (`src/core/storage/adapter.ts:17-27`) mutating methods: `writeText`,
`mkdirAll`, `remove`, `rename`. Implementations: `TauriFsAdapter` (`storage/tauri.ts:29-43`,
Rust `fs_write_text`, `fs_mkdir_all`, `fs_remove`, `fs_rename`), `MemoryAdapter`
(`memory.ts:52-73`), `NodeFsAdapter` (`node.ts:26-42`, used only by
`scripts/import-dynalist.ts:35`). Other write-capable Tauri command: `settings_write`
(`src-tauri/src/lib.rs:65`) via `writeAppSettings` (`tauri.ts:60-62`).

`fs.rename` has exactly one call site: `repo.ts:324`. `fs.remove`: `repo.ts:327` (rename
fallback), `repo.ts:347` (delete).

### 1.2 Repository internals (`src/core/repo.ts`)

| Location | Operation | Reached from | Fires from viewing? |
|---|---|---|---|
| `repo.ts:88` | `init` writes fresh `gallery.config.yaml` | `state.openVault`, `demoVault`, importer | No (create only) |
| `repo.ts:97` | `init` rewrites config if `polityPalette`/`handling` missing | every `openVault` | **Yes, conditional** (older vaults) |
| `repo.ts:104-110` | `init` `mkdirAll` type folders, assets, constraints, tables, exports | every open | Yes (dirs only, idempotent) |
| `repo.ts:322-340` | `save`: `mkdirAll`, `rename`, `remove` fallback, `writeText`, then `writeCsv` | see §1.3 | as caller |
| `repo.ts:347-351` | `delete`: `remove`, then `writeCsv` | `RecordEditor.tsx:136` | No |
| `repo.ts:356` | `saveConfig`: `writeText` config | see §1.4 | as caller |
| `repo.ts:362-364` | `putTextAsset`: `mkdirAll`, `writeText` under `assets/` | see §1.5 | as caller |
| `repo.ts:375-382` | `writeCsv`: `_index.csv`, `_exports/<type>.csv` | `save`, `delete`, `Settings.tsx:41`, `demo.ts:408`, importer | as caller |
| `schema/registry.ts:95,99` | `seed`: `mkdirAll`; write missing built-in schema | `init` | Yes, only if file missing |
| `schema/registry.ts:108-109` | `seed`: write `*.schema.v<N>.json` backup **and overwrite schema** when built-in version is higher and not `custom` | `init` | **Yes, conditional** (after an app upgrade) |
| `schema/registry.ts:118-121` | `seed`: `mkdirAll`, write missing preset yaml | `init` | Yes, only if missing |
| `astro/tints.ts:78,87` | `seedBodyTints`: write if missing | `init` | Yes, only if missing |
| `designer/constraints.ts:386,399` | `seedConstraints`: write if missing | `init` | Yes, only if missing |

`load()` (`repo.ts:118-186`) writes nothing; record migration happens in memory and is
persisted only by the next `save`.

### 1.3 `repo.save` call sites

| Location | Function | Trigger | Fires from viewing? |
|---|---|---|---|
| `ui/RecordEditor.tsx:62` | `flush` | 900 ms debounce effect (`:71-78`), unmount flush (`:79`), SAVE button (`:123`); gated on `dirty`, set only by `edit()` (`:98-101`) | **Maybe — see F1** |
| `ui/hull/HullEditor.tsx:80` | `flush` | 900 ms debounce, unmount flush; `dirty` set only by `commit` (`:152`) and `ClassPicker.onPick` (`:276`) | No (nothing calls `commit` on mount) |
| `ui/NewRecordMenu.tsx:23` | `create` | click | No |
| `ui/SystemMap.tsx:361` | `onPointerUp` | drag, only if `drag.moved`; mutates `rec.fields` in place before saving | No (click without movement does not save) |
| `ui/SystemMap.tsx:572` | `exportSvg` | Export button; also adds `map` asset to `system.assets` | No |
| `ui/SystemMap.tsx:1118` | `SystemSettings` `SchemaForm.onChange` in 400 ms `setTimeout` | user edit | No |
| `ui/SystemMap.tsx:1175` | `AddOnMap.create` | click | No |
| `ui/SystemBuilder.tsx:87,89,92,107,120,129` | `create` | Generate button (multi-record: system, primary, bodies, belt, Kuiper) | No |
| `ui/ImportDialog.tsx:50` | `commit` | Import button (`touch: false`) | No |
| `ui/demo.ts:21` | `save` helper | demo open | No (fresh `MemoryAdapter`) |
| `scripts/import-dynalist.ts:45` | top level | CLI | No |

### 1.4 `repo.saveConfig`

`ui/Settings.tsx:12` (`setOp`, called at `:84,87,90,100,103`), `:22,25,34,61,67,75`;
`ui/SystemMap.tsx:855` (distance-unit toggle); `ui/RecordEditor.tsx:301` (add caveat);
`ui/demo.ts:54` (memory only). All are user-input handlers — none fire from viewing.

### 1.5 `repo.putTextAsset` and direct `writeCsv`

`putTextAsset`: `ui/AssetsPanel.tsx:18` (file input), `ui/hull/HullEditor.tsx:170` (Export),
`ui/SystemMap.tsx:568` (Export), `ui/demo.ts:349` (memory only). Direct `writeCsv`:
`ui/Settings.tsx:41` (button), `ui/demo.ts:408`, `scripts/import-dynalist.ts:51`.
Other raw adapter writes: `ui/demo.ts:169,193,406` (memory only).

### 1.6 Non-vault writes

| Location | Operation | Fires from viewing? |
|---|---|---|
| `ui/state.ts:178` | `writeAppSettings` (`settings.json`, Tauri only) | Yes — every vault open; app config, not vault data |
| `ui/log.ts:47` | `localStorage["gallery.session"]` counter | Yes — every vault open |
| `ui/Sidebar.tsx:33` | `localStorage["gallery.rail.folded"]` | Yes — fold toggle; UI state |

### 1.7 Scripts (manual, outside the app)

`import-dynalist.ts:35-51` (vault via `NodeFsAdapter`), `capture-budget-baseline.ts:78-79`
(`tests/fixtures/`), `hull-style-probe.mts:397`, `glyph-gallery.ts:24`, smoke/plate scripts
(screenshots only).

## 2. Findings

Severity: **high** breaks an invariant a later PR depends on; **med** real gap; **low** minor.
"Owner?" = needs an owner decision before fixing.

| ID | Sev | Location | Rule | Evidence | Suggested fix | Owner? |
|---|---|---|---|---|---|---|
| F1 | **high** | `ui/RecordEditor.tsx:158-161` | View never writes (ROADMAP §4) | Title `onBlur` calls `edit({slug})` whenever `draft.slug === slugify(loaded.record.name)` (the normal case), and `edit()` sets `dirty` unconditionally. Focus + blur with no typing → 900 ms later `repo.save` rewrites the file, bumps `updated`, persists pending in-memory migrations, and regenerates CSV. Unmount flush does the same. | Only call `edit` when the computed slug differs from `draft.slug`; make `edit` a no-op when the patch changes nothing. S1b's guard test should cover this. | No |
| F2 | **high** | `repo.ts:97`, `registry.ts:108-109`, `:99,121`, `tints.ts:87`, `constraints.ts:399` | View never writes; snapshots before migration | Opening a vault runs `Repository.init`, which can rewrite `gallery.config.yaml` and **overwrite schema files** (with backup) after an app upgrade, and create missing seed files. No snapshot exists. | Snapshot before any conditional overwrite in `init` (S1b). Decide whether open-time seeding counts as "viewing" for the guard. | **Yes** — exempt vs snapshot-gated |
| F3 | med | `ui/RecordEditor.tsx:81-83` | History layer | External-change pickup resets `draft` from `loaded.record` when not dirty, keyed on `loaded.record.updated`. Undo (S1c) must not race this or it will be overwritten/re-flushed. | Note as a constraint for S1c/S1d design. | No |
| F4 | med | `ui/SystemMap.tsx:361` | History layer | Drag mutates `rec.fields` in place before `save`; there is no pre-image, so a drag step cannot be undone without capturing the prior value first. | S1c: capture before-state before the in-place mutation. | No |
| F5 | med | `ui/SystemBuilder.tsx:87-129`, `repo.ts:340,351` | History layer | Multi-record write (up to 6 saves) plus `writeCsv` per save. Needs a transaction to undo as one step; `writeCsv` runs after every `save`. | S1c transaction grouping; batch CSV. | No |
| F6 | med | `repo.ts:322-327` | Snapshots | `save` renames/removes the old file when the slug or type changes; this is the rename path S2 will build on. | Snapshot before rename rewrite (S2). | No |
| F7 | med | no lint/CI rule | Core purity | `src/core/**` is currently clean (0 violations, 62 files, no `.tsx`), but nothing enforces it: no ESLint, no test, CI runs only typecheck + test; `tsconfig` has `lib: DOM`. | Add `no-restricted-imports` (react, react-dom, `**/ui/**`, `@tauri-apps/*`; exceptions `storage/tauri.ts`, `storage/node.ts`) or a vitest scan (S1b). | No |
| F8 | med | `ui/BudgetPanel.tsx:52-80` vs `designer/ship/budget.ts:452-467,700` | Provisional markers reach the UI, including derived values | Dry/wet mass, structure, armour, propellant, ΔV, acceleration and cost carry no inline marker; `b.provisional` names them only in the footer line. Only RATED FULL LOAD is marked. | Pass `mark` per figure from `b.provisional`. | No |
| F9 | med | `ui/hull/HullEditor.tsx:316` (`STRUCTURE`), `:134` | Provisional markers | `structure_density_kg_m3` / `structure_cost_per_t` provisional flags are computed by `provisionalParams` but only `design_density_t_m3` is tested. | Mark STRUCTURE from the constraint flag. | No |
| F10 | med | `core/designer/expr/derive.ts:138,233-254` | Provisional markers | `deriveStats` carries `provisional` sets but has no caller in `src/ui` or elsewhere in `src` (tests only). Latent: derived stat fields would lose the marker once wired in. | Consume the set when the derive layer is surfaced. | No |
| F11 | med | `core/designer/hull/render.ts:100-106` | Tokens only (STYLE §1) | `LABEL_PX` hard-codes px font sizes (`section 13, slot 11, cg 12, rulerTick 10, fallback 11`); `rulerTick: 10` is off the `--fs-*` ramp the comment cites. | Read from tokens (as `SystemMap` does via `tokenPx.ts`). | No |
| F12 | low | `hull/render.ts:248-438`, `astro/glyph.ts:75-203`, `ui/SystemMap.tsx:1042-1059,500,603,690,725` | Tokens only | Literal `strokeWidth`/`opacity` values; `render.ts:418` `opacity: 0.12` duplicates `--opacity-halo`. Not covered by `theme-tokens.test.ts`. | Route through `--border-*` / `--opacity-*`; extend the test. | No |
| F13 | low | `styles.css:179-187,334,493,498` | STYLE §1 "no coloured-left-edge cards" | Severity-coloured `border-left` on `.srow` / `.sev-row-*`, `.term-cmd:hover`, `.log-row`. Rows, not cards — may be an intended pattern. | Confirm against STYLE.md before touching. | **Yes** |
| F14 | low | `styles.css:297,301,363`, `theme.css:127-128` | STYLE §1 "no panel shadows" | `--elev-2` on `.toast`, `.picker .menu`, `.maptip`. STYLE §1 wording is absolute; a later section may carve out floating elements (not checked). | Confirm the exception or remove. | **Yes** |
| F15 | low | `theme.css:115` | STYLE §1 radius rule | `--radius-1: 1px` is defined and unused in `src/`. | Delete if STYLE agrees. | No |
| F16 | low | `ui/demo.ts:348-351,379` | Hull SVG generated, never stored | Demo vault ships a hand-authored `assets/sword-hull.svg` as a `portrait` asset. Seed data, displayed via `sanitizeSvg`. | Confirm intended. | **Yes** |
| F17 | low | `ui/Boot.tsx:48-55` | Nothing animates except spinner/bar/orbital | Paced boot-log line replay; respects `prefers-reduced-motion`. Not one of the three permitted animations. | Confirm or add to STYLE/doc 11 motion tiers. | **Yes** |
| F18 | low | `designer/ship/advisories.ts:487` | Provisional markers | Propellant `density_kg_m3` lookup with no `provisional` handling in the file; block not opened. | Check how the value is used. | No |
| F19 | low | `ui/state.ts:178`, `ui/log.ts:47` | Guard scope | App-config and localStorage writes on every open. Not vault data, but a guard that spies only on `repo` will not see them. | Decide guard scope (vault only). | **Yes** |

### Status after S1b

| ID | Now |
|---|---|
| F1 | Fixed: the title's blur edits only when the slug changes; `edit()` ignores a patch that changes nothing (this also closes the same write from any field that reports its value on blur; the tag and alias inputs do). Covered by the guard. |
| F2 | Ruled (ROADMAP §5.12): seeding missing files needs no snapshot; overwriting an existing file snapshots first ("Before vault upgrade"), writes only on a difference, logs once. Tested, including open-twice-writes-nothing. |
| F6 | Snapshot service exists (`src/core/snapshots.ts`); S2 calls `repo.snapshot(cause, ids)` before the rename rewrite. |
| F7 | Done: `tests/core-purity.test.ts`, run by `npm test` and so by CI. |
| F13, F14, F16 | Ruled; `STYLE.md` §1 and `docs/CLAUDE.md` amended. No code change. |
| F19 | Ruled: adapter writes under the vault root only. |
| F8, F9, F11, F12, F15 | Scheduled as H1 (ROADMAP §2). |
| F3, F4, F5 | Still constraints for S1c/S1d. |
| F10, F17, F18 | Untouched. F17 is in ROADMAP §5's open list. |

### Status after S1c

| ID | Now |
|---|---|
| F3 | Core side done: `repo.version(id)` bumps on every write, apply and changed-file reload. The draft hook that uses it is S1d. |
| F4 | Core side done: a step's `before` comes from `saved` + `lastText`, never from the in-place-mutated `byId` record. |
| F5 | Core side done: `repo.transaction` (one step, CSV once). Wrapping `SystemBuilder` in it is S1d. |
| F6 | Unchanged: a rename is an edit entry whose paths differ and undoes as one; S2's rewrite snapshots through `transaction(…, { snapshot })`. |

### Status after S1d

| ID | Now |
|---|---|
| F3 | Done: `useRecordDraft` reloads a clean draft when `repo.version(id)` moves (undo, redo, a map drag, Reload), replacing the `loaded.record.updated` effect; `actions.undo()` flushes pending drafts first. |
| F4 | Done end to end: the map drag and park save through `repo.save(rec, { origin, label })`; the step's `before` is the pre-image, never the in-place-mutated record. Covered by `tests/undo-record.test.tsx` and the park test in the guard. |
| F5 | Done: `SystemBuilder` and `ImportDialog` each write in one `repo.transaction` — one undo step, the CSV once. |

The guard has one named exemption: the map's **distance-unit
switch**, which calls `saveConfig({ distanceUnit })`. It is exempted by name in the guard (a vault
preference, `saveConfig` is "view config" in doc 11 §1.6) and tested to write only
`gallery.config.yaml`. It is a candidate for the owner to move out of the vault config.

### Verified compliant

- **Core purity:** no React/DOM imports in `src/core`. Acceptable exceptions:
  `storage/tauri.ts:1,47` (Tauri adapter), `storage/node.ts:2-3` (Node built-ins),
  `codec/svg.ts:113` (injectable `DOMParser`), `ids.ts:8` (feature-detected `crypto`).
- **No `eval` / `new Function`**; no `text-transform`; no `alert/confirm/prompt`, no modal
  dialogs; nothing blocks a save on advisories.
- **Animation:** only the ASCII spinner and indeterminate bar, plus boot; global
  `prefers-reduced-motion` reset at `theme.css:190-193`.
- **Vault SVG:** the only vault-SVG inline site (`AssetsPanel.tsx:70-77`) goes through
  `sanitizeSvg`. App-built markup takes hex-validated colours (`glyph.ts:258` `hexColor`;
  `modes.ts:29-38` `polityColor` allows `#rrggbb` only) or tokens. `locColor`
  (`SystemMap.tsx:545`) resolves to those, so an earlier reader concern is closed.
- **Hull SVG** is generated at render time; the Export path writes a render, not a master.
- **Colours:** no hex/rgb/hsl outside `theme.css` except record-data seed files.

## 3. Coverage map

Config: vitest `environment: node`, `include: ["tests/**/*.test.ts"]`; jsdom and
`@testing-library/react` are declared devDependencies but unused; no `*.test.tsx` exists
(and the include glob would not run one). CI (`.github/workflows/build.yml`): `npm ci`,
`typecheck`, `test` only. Smoke scripts and `cargo test` are manual.

| Subsystem | Vitest | Smoke |
|---|---|---|
| `core/astro` (asciiOrbits, ewocs, worldsmith, derive, glyph, layout, modes, units, tactical, tints) | yes (`ascii-orbits`, `astro`, `layout`, `modes-units`, `tactical`, `tints`) | via SystemMap |
| `core/codec` opml, record, svg | yes | — |
| `core/codec/csv.ts` | transitive only | — |
| `core/schema` schemas, presets, migrate, handlingVocab, tints, polity | yes | — |
| `schema/registry.ts`, `builtin/body`, `bodyPresets`, `system` | transitive only | — |
| `core/designer` constraints, expr, tables, violations, hull, ship | yes (many) | via HullEditor, BudgetPanel |
| `core/storage/memory.ts` | yes | all smokes |
| `core/storage/tauri.ts`, `adapter.ts` | transitive only | — |
| `core/storage/node.ts` | none | none (`import-dynalist` only) |
| `repo.ts`, `sessionLog.ts`, `handling.ts`, `importers/dynalist` | yes | — |
| `ui/demo.ts`, `ui/runtime.ts`, `ui/sections.ts`, `ui/kit/severity.ts` | yes | — |
| `ui/*.tsx` (all components) | **none** | partial (below) |
| `ui/state.ts`, `ui/log.ts` | none | boot/log smoke |
| `src-tauri/fsops.rs` | inline `#[cfg(test)]` (3 tests, not in CI) | — |

`theme-tokens.test.ts` reads sources as text: it checks `var(--x)` existence, no
hex/rgb/hsl outside `theme.css` and seed files, and hull `Token` names. It does **not**
check px font sizes, stroke/opacity literals, gradients, shadows, radius, transitions,
8-digit hex, or literals inside seed files.

Smoked: `App`, `Welcome`, `Boot`, `AdvisoryLog`, `Sidebar`, `RecordList`, `RecordEditor`,
`SchemaForm`, `Outliner`, `BudgetPanel`, `SystemMap`, `HullEditor`, `HullCanvas`,
`kit/Document`, `kit/Panel`. Only incidental: `BodyPanel`, `SystemBuilder`, `NewRecordMenu`.

**Untested and unsmoked:** `ImportDialog`, `Settings`, `AssetsPanel`, `CaveatAdder`,
`RefPicker`, `kit/{Ascii,Controls,Status,Tabs,cx,index}`, `ui/tokenPx.ts`,
`ui/themeColors.ts`, `core/designer/expr/index.ts` (orphan barrel), `src-tauri/{lib,main}.rs`.

**Implications for S1b:** `Settings`, `ImportDialog` and `AssetsPanel` are write surfaces
with no coverage; the jsdom guard needs the include glob widened to `.test.tsx`; the
smoke-only dev write counter should cover `SystemMap` and `HullEditor` if they cannot
mount in jsdom.
