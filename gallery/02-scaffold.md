# Gallery — Phase 1 scaffold (2026-09-14)
 
## What exists
Repo `gallery/` (zip: `Worldbuilding/gallery-app-src.zip`). Tauri 2 desktop shell (Rust: 9 fs/settings commands, no plugin scopes) + React/TypeScript app. All logic is TypeScript; the Rust side is glue.
 
- **Vault = plain folder.** Desktop reads/writes it directly, so OneDrive/Google Drive sync clients carry it. Atomic writes (temp + rename) so sync never sees half a file.
- **Records**: `<folder>/<slug>.<type>.yaml` (JSON switchable). Envelope: id, type, name, slug, tags, aliases, summary, body (Markdown), links[{rel,to,note}], assets[{role,path}], fields{}, created/updated, preset.
- **Notes**: `notes/<slug>.opml`, Dynalist-compatible; envelope in `<head><galleryMeta>`; `_note`, `collapsed`, `complete`, `heading` preserved. Keyboard outliner (Enter / Tab / Shift+Tab / Shift+Enter note / Alt+↑↓ / collapse).
- **Sheets**: `_index.csv` (all records) + `_exports/<type>.csv` (flattened fields; refs as name + `_id`), regenerated on save.
- **Assets**: `assets/*.svg` attached via `assets[]`, inline preview (sanitized).
- **Schemas & presets**: `_schemas/<type>.schema.json`, `_presets/<type>/<id>.yaml`; built-ins seeded once, disk copies win. Nine types: note, polity, location, body, system, character, module, hull, craft. ~45 presets (NSWR/NTR/chemical drives, fission & D-He3 reactors, droplet/panel radiators, spinal railgun, CLGG, laser turret, PD laser/flak, missile pod, torpedo tube, sensors, EW, armor, habitat, hangar; destroyer/cruiser/corvette/missile hulls; destroyer/cruiser/frigate/monitor/carrier/station/strikecraft/missile craft; polity/location/body/character presets).
- **Budgets (CoaDE-lite v0)**: craft = hull + loadout → dry/wet mass, Δv (thrust-weighted Isp, rocket equation), accel, power balance, heat vs radiator capacity, cost, crew, slot usage vs hull slots, warnings. Constraint sets come next phase.
- **Dynalist importer** (UI + CLI): split per document or per top-level node; #tags → note tags; markdown stripped from names. Run on the three exports → 23 notes (`Worldbuilding/gallery-vault.zip`, extract to `Worldbuilding/gallery/`).
- **Theme**: `src/theme.css` — Nocturne-style (dark, compact, Inter self-hosted, outlined primary actions, faded rules) with navy neutral ramp (`--navy-100..950`) and rust accent ramp (`--rust-100..900`). Nocturne reference values were reconstructed secondhand (surface #232532, text #e9e9ed, muted #b2b6ca, accent #9184d9); paste the real token export from Claude Design to tighten.
## Verified here
`tsc` clean · vitest 9/9 (codecs, importer incl. lossless round-trip of the real 1,460-node Fleets export, repository, backlinks, budgets) · Rust `fsops` 3/3 · headless Chromium smoke: demo vault, craft editor, budget panel, outliner editing, new-record flow — no page errors.
Not verified here: the Tauri build itself (Linux container lacks webkit2gtk; Windows target std not downloadable). CI workflow `.github/workflows/build.yml` builds `.exe`/`.msi` on windows-latest.
 
## Decisions (2026-09-14)
- Shell: Tauri 2 (not Electron/PWA-first); same frontend reused for mobile later.
- Formats: YAML default for records, OPML for notes, CSV sheets, SVG portraits.
- Desktop file access = local synced folder; cloud APIs only for the mobile phase.
- OneDrive personal account; import Dynalist only.
## To run on Windows
1. Extract `gallery-app-src.zip`; `npm ci`; install Rust (rustup) + VS Build Tools (Desktop C++); `npm run app:dev` (or `app:build` for the installer).
   Or push the repo to GitHub → Actions → download `gallery-windows` artifact.
2. Extract `gallery-vault.zip` into `Worldbuilding/gallery/`; open it from the app's welcome screen.
## Next (phase 2/3)
- System map editor (SVG canvas: schematic orbits, log radius mapping, L1–L5, record-linked assets, export SVG/PNG).
- Constraint sets (`_constraints/*.yaml`: tech ceilings, mass fractions) wired into the budget panel; variant inheritance.
- Silhouette sketcher (polygon editor writing `assets/*.svg`, hull slot placement).
- File watcher (`notify`) so external/OneDrive edits refresh without ↻.
 