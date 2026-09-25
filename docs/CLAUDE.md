# Gallery

A file-first worldbuilding workbench: Tauri 2 shell, TypeScript + React inside.
The vault is a plain folder of YAML/OPML records (see `README.md` for the layout).

## Commands

```bash
npm ci                 # install (Node 22+)
npm run typecheck      # tsc --noEmit
npm test               # vitest run  — tests/**/*.test.ts, environment: node
npm run build          # tsc --noEmit && vite build
npm run dev            # browser mode, in-memory demo vault
npm run app:dev        # Tauri dev window (needs Rust + WebView2)
```

Both `npm run typecheck` and `npm test` must be clean before any commit.

The headless-Chromium UI smoke checks are **not** part of vitest — they are
standalone scripts run against a preview server:

```bash
npm run build && npx vite preview     # then, in another shell:
node scripts/ui-smoke.mjs             # also ui-smoke-map{,2,3,4,5}, -hull, -ship
node scripts/ui-smoke-screens.mjs     # the redesign screens, screenshots to screenshots/screens
node scripts/ui-smoke-map-lod.mjs     # map restyle + far-zoom tactical symbols, to screenshots/map-lod
node scripts/ui-plates.mjs            # the design-book plates, rendered with src/theme.css
```

Set `SMOKE_CHROME` to an installed Chromium (Edge works) when the Playwright browser is not
downloaded. UI screens are compared against the matching `docs/design-book/components/*/preview.html`.

Two more checks by eye: `npx tsx scripts/hull-style-probe.mts [out.html]` draws every part
glyph beside its reference in `docs/refs/Weapons/` (no browser needed), and
`node scripts/measure-fleet-reference.mjs` reproduces the hull-class ladder in
`designer/hull/classes.ts` from the fleet reference (needs a browser, like the smoke
scripts; set `SMOKE_CHROME` to use an installed one).

## Layout

```
src/core/           pure logic, no React imports anywhere in here
  astro/            Worldsmith + EWoCS body physics, map layout, display modes, units
  codec/            record YAML/JSON, OPML, CSV
  schema/           type registry + built-in schemas and presets
  designer/         craft budget roll-up, expression layer, archetypes, hull geometry
                    (note: designer/, not design/ — the designer prompt §3 says
                     src/core/design/ and src/core/hull/; both are wrong, use designer/)
  storage/          StorageAdapter: tauri (desktop), memory (browser/tests), node (CLI)
  repo.ts           load/save/index/backlinks
src/ui/             React. `demo.ts` is pure and is imported by tests.
src-tauri/          Rust shell (fsops.rs)
scripts/            CLI importer, headless UI smoke scripts
tests/              vitest
docs/UNITS.md       canonical units — authoritative over every other doc
docs/refs/          NFC and CoaDE reference screenshots for UI intent
gallery/            project docs 01–07; each phase adds one
```

## Conventions

- **`src/core/` stays framework-free.** No React import may appear under it.
- **Units: read `docs/UNITS.md` before writing any number.** It is authoritative over
  `gallery/05-designer-prompt` §8 and over docs 06–07. Two rules bear repeating here:
  metric on disk always, and a field's name carries its unit (`mass_t`, `heat_rejected_mw`).
- **Never hand-roll a unit conversion in a recipe.** Declare the unit the expression
  produces and let the engine convert:

  ```yaml
  derive:
    heat_rejected_mw:
      expr: "emissivity * SIGMA * area_m2 * (temp_k^4 - T_ENV^4)"
      unit: W
  ```

  A bare `/ 1e6` hides the conversion inside a literal, which carries no unit, and the
  scale check then cannot see it. A plain-string entry means "already in the field's own
  unit". This supersedes the `/ 1e6` in the designer prompt §2.3 example.
- **No `eval`, no `new Function`, no dynamic code execution** in the expression layer or
  anywhere else. Tokenizer → shunting-yard → AST → interpreter.
- **Nothing is ever blocked from saving.** Every check is an advisory with a severity
  (`error | warn | info`), a message, and the field it points at. A captured hull, an export
  variant or a deliberately experimental craft must always save — with a banner, never a
  refusal. No modal error dialogs.
- Schemas carry a `version`; a newer built-in replaces the on-disk copy and backs the old
  one up as `<type>.schema.v<N>.json`. `"custom": true` opts a file out. This upgrades
  *schema files only* — it does not migrate record files.
- Reference tables in `<vault>/_tables/*.yaml` carry a `source` per row, and
  `provisional: true` where the figure is a guess. **A provisional value must render with a
  visible marker everywhere it reaches the UI**, including inside values derived from it.
  `source` and `provisional` are the whole provenance vocabulary — do not add parallel
  fields.
- Do not seed physical constants from recall. If a figure is missing, ask.
- **Theme: reuse `src/theme.css`.** The Nocturne-style navy→rust ramp is already there and
  the map and record editors already consume it. Add no new colours, no second palette, no
  per-editor styling — read the existing tokens and use them.

## The design suite (docs `gallery/06` and `gallery/07`)

Five editors, built **strictly in this order**, one PR each:

1. **Hull / craft / bus geometry** — the frozen contract: spine, sections, external slot
   inventory, internal volume budgets, armour zones, docking, habitat rings, classification,
   bus standard, style kit, variant lineage.
2. **Ship** — fills a hull: slot assignments, internal manifest, tank fill, magazines, crew,
   operating modes. Never changes geometry.
3. **Module** — authors the parts, extending `_tables` under the archetype + expression
   layer.
4. **Missile** — NFC layout, CoaDE numbers.
5. **Strikecraft** — same machinery, smaller envelope, embarked-volume accounting.

Do not start an editor until the previous one's tests are green.

Cross-cutting:

- **One advisory kernel and one renderer**, shared by all five. A new computation goes in
  the kernel, not in an editor.
- **The hull SVG is generated from the record at render time, never stored as a
  hand-authored asset** — editor 2 adds external modules that must appear in the silhouette.
- **Geometry**: side profile mirrored about the long axis, with an independent beam giving
  an elliptical cross-section. External modules (radiators, turrets, tanks) are silhouette-
  plane parts mirrored vertically, not swept. Internal placement is volume totals per
  section against an `allowed` list — no bin-packing solver.
- **Thermal shadow and radiation shadow are separate computations.** Radiation shadow is the
  reactor's shield cone with a dose advisory for crewed volume outside it; thermal shadow is
  panel-to-panel and panel-to-hull view-factor blocking plus drive-plume impingement.

## Open decisions — ask, do not assume

Both are named in `_tables/README.md`; each silently scales a whole budget.

- **Cells → metres.** `compartments.yaml` carries 2 m/cell as provisional. The entire
  internal-volume budget scales off it.
- **Crew: per-watch or total.** If the NEBULOUS crew figures are already totals, applying the
  watch multiplier makes every complement three times too big.

## Vault

The working vault is the OneDrive folder
`Documents/Worldbuilding/Gallery Fleet Builder/gallery-vault`.
Tests do not use it — they build vaults with `MemoryAdapter` plus `demoVault()`.

## Visual system

Read `docs/STYLE.md` before touching any UI. It governs; its §2 overrides the design book
in `docs/design-book/`. The rules below are its §1, repeated here so they are always loaded.

- Every colour, size, radius, border, shadow and type style comes from a `var(--…)` in
  `src/theme.css`. No hex, px font sizes or ad-hoc spacing in components or SVG renderers. If a
  value is missing, add a token to `theme.css` and note it in `docs/STYLE.md`.
- The only colours not from the palette are **record data**: body tints (`body` records) and
  polity colours (`polity.color`). Renderers read them from the record, never invent them.
- Uppercase is written in the copy, never `text-transform`.
- Mono (`--text-data-*`, `banner`, `stamp`, `ascii`, `code`) for every value, code, timestamp,
  coordinate and log line; sans for every label, control, heading and sentence.
- Units always shown, right-aligned in columns. Unknown = `—` in `ink-300`. Missing required
  value = redaction bar (STYLE.md §4.2).
- Radius is `0` everywhere except the classification badge (`radius-2`) and tag chips
  (`radius-pill`). No gradients, glows, neon, panel shadows, or coloured-left-edge cards.
- Nothing animates except the ASCII spinner, the indeterminate ASCII bar and the boot orbital
  idle; all three stop under `prefers-reduced-motion`.
- Hull/craft SVGs stay generated from the record at render time (existing rule) — theming them is
  a renderer change, never an edited asset.
