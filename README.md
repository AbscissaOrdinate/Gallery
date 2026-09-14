# Gallery
One-stop shop for interstellar worldbuilding

A file-first worldbuilding workbench. The vault is a plain folder (put it in OneDrive or Google Drive and it syncs like anything else):

| What | Where | Format |
|---|---|---|
| Typed records (polity, location, body, system, character, module, hull, craft, …) | `<type folder>/<slug>.<type>.yaml` | YAML (or JSON — a setting) with a shared envelope + schema-driven `fields` |
| Notes / outlines | `notes/<slug>.opml` | OPML 2.0, Dynalist-compatible; envelope in `<head><galleryMeta>` |
| Sheets | `_index.csv`, `_exports/<type>.csv` | regenerated on every save; open in Excel / Sheets |
| Portraits, silhouettes, maps | `assets/*.svg` (any file) | referenced from records' `assets[]` |
| Type definitions | `_schemas/<type>.schema.json` | JSON-Schema subset + `x-ref`, `x-unit`, `x-group` |
| Presets | `_presets/<type>/<name>.yaml` | starting values for new records |
| Vault config | `gallery.config.yaml` | name, record format, CSV toggle |

Built-in schemas and presets are written to the vault on first open and never
overwritten, so everything is editable; add a new type by dropping a schema
file in `_schemas/`.

## Run

Desktop app (Windows/macOS/Linux) — Tauri 2 shell, everything else TypeScript:

```bash
npm ci
npm run app:dev        # dev window with hot reload
npm run app:build      # installer in src-tauri/target/release/bundle/
```

Prerequisites for a local build: Node 22+, Rust stable (rustup), and on
Windows the WebView2 runtime (already on Windows 10/11) plus the MSVC build
tools. Or skip all that: push to GitHub and `.github/workflows/build.yml`
produces the `.exe`/`.msi` as workflow artifacts (and a Release on `v*` tags).

Browser mode (no file access, in-memory demo vault): `npm run dev`.

## Import from Dynalist

Document menu → Export → OPML, then either **Import** in the app or:

```bash
npm run import:dynalist -- --out "C:/Users/you/OneDrive/Documents/Worldbuilding/gallery" \
  --split top-level --tag heliaris  Fleets_and_Strikecraft.opml Astro_Polities.opml
```

Outline structure, item notes, collapsed state and `#tags` are preserved and
the resulting files still open in Dynalist.

## Layout

```
src/core/      types, codecs (record YAML/JSON, OPML, CSV), schema registry + built-ins,
               repository (load/save/index/backlinks), importers, designer/budgets
src/core/storage/  StorageAdapter: tauri (desktop), memory (browser/tests), node (CLI)
src/ui/        React UI: sidebar, list, schema-driven form, outliner, budget panel, assets, import, settings
src/theme.css  design tokens (Nocturne-style dark, navy neutrals + rust accent)
src-tauri/     Rust shell: fs commands (fsops.rs) + settings; capabilities; icons
scripts/       import-dynalist.ts (CLI), ui-smoke.mjs (headless UI check)
tests/         vitest — codecs, importer, repository, budgets
```

## Tests

```bash
npm test                      # core (TypeScript)
node scripts/ui-smoke.mjs     # after `npm run build && npx vite preview`; needs Chromium
cd src-tauri && cargo test    # Rust fs ops (needs the Tauri Linux deps on Linux)
```

## Bodies, Worldsmith and EWoCS

`src/core/astro/` ports Artifexian's *WorldSmith 8.0* formulas (`worldsmith.ts`:
star luminosity/radius/temperature/class, habitable zone, frost line, inner
limit, Titius–Bode spacing, debris disk, density→radius→gravity→escape
velocity, surface temperature, atmosphere density and gas retention, moon
zones, sidereal/synodic periods, tidal locking, tides) and the Orion's Arm
*Extended World Classification System* (`ewocs.ts`: mass classes, composition,
aerosol bands, terrestrial types, fluids, misc; `classify()` builds shorthands
like "Marine Tundral AquaGaian"). `derive.ts` applies both to a body record in
the context of its parent chain; `glyph.ts` draws the low-fi portrait; the
tests in `tests/astro.test.ts` reproduce the spreadsheet's Earth/Moon defaults.

The body schema follows the EWoCS order — orbit → mass → composition →
terrestrial type → fluid → aerosols → misc — and every derivable quantity is
computed live in the record's Derived panel (overrides pin a value by hand).
41 body presets cover stars, terrestrials, giants, moons, dwarfs, small bodies,
belts and artificial bodies.

## System maps

A `system` record is a schematic orbital map (`src/core/astro/layout.ts` +
`src/ui/SystemMap.tsx`): non-physical radius mapping (log / sqrt / linear /
manual) so the inner and outer system share one sheet, eccentric orbits as
ellipses with the star at the focus, moons and orbital stations at a separate
"moon system" scale, Lagrange points (L1/L2 beside each body, L4/L5 on the
orbit, L3 when occupied) that bodies and locations can be parked at, belts as
bands, cyclers on their own dashed orbits, and map-only annotations (orbital
rings, transit arcs, Trojan swarms). Click to inspect, drag along the orbit,
"Skeleton…" generates a Worldsmith classical system, "Export SVG" writes
`assets/<system>.map.svg`.

Reading the map:

- **Semantic zoom.** Zoomed out, planets keep a readable glyph with their general
  type underneath (Jovian, Neptunian, Arean, Gaian…); moons, orbital stations
  and minor bodies appear as you zoom in, and only once a planet's moon system
  fits in the clear space around its orbit, so moons never reach the next
  planet. Lagrange objects stay visible (hugging their body when its moon system
  is hidden); heliocentric stations are always visible. Hover anything for the
  full EWoCS classification, distance and period; artificial orbits are drawn
  only for the hovered or selected object. Station labels are small until hovered.
- **Lagrange pairs.** `lagrange_of` on a body or location names the *secondary*
  of the pair: Luna for Earth–Moon points, Earth for Earth–Sun points. Drop a
  station on any L-point dot to park it there.
- **Schematic / True scale.** True scale is proportional to AU; bodies shrink
  towards points so the inner system does not pile onto the star, and grow back
  as you zoom in.
- **Modes** (HOI4-style): Plain, Political (body `controller`, else derived from
  the owners of its locations — a split ring marks contested bodies), Economic
  (industry + population), Habitability (estimate from class, temperature,
  gravity and pressure; override with the body's `habitability` field),
  Military (bases, shipyards, garrisons, craft based there).
- **Units.** Distances display in light-time by default (light-seconds through
  light-days), switchable to AU/km or Mkm; measured from the orbited body, and
  for Lagrange objects from the major body unless the minor one is selected.
  Records keep AU and km on disk; the form shows the light-time equivalent
  beside every distance input.

Built-in schemas carry a `version`; a newer built-in replaces the on-disk copy
(backed up as `<type>.schema.v<N>.json`). Add `"custom": true` to a schema
file to keep your edits.

## Roadmap (see the Gallery project docs)

1. ✅ Records, schemas, presets, notes, CSV, SVG assets, Dynalist import, budgets
2. ✅ Body physics/classification (Worldsmith + EWoCS), schematic system map editor, semantic zoom, display modes, light-time units
3. Planet surface editor in the body tab (Mollweide heightmap, territories → polities, plates, Köppen, Worldsmith population); portraits from surface maps
4. Module / hull / craft designer with constraint sets; silhouette sketcher
5. Local web server + mobile layout (quick notes, module/ship building)
