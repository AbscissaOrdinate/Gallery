# C5 — Research + spec doc 13: planet surface editor (Mollweide / globe)

**Surface:** Cowork (separate session, attached to the Gallery project, web search on)
· **Model:** Opus 5.5 @ high · **Output:** `gallery/13-planet-editor.md` in the project (the
owner uploads it to the repo). You do not edit the repo.

Doc 13 is the spec for round **R4** (ROADMAP §2). Fable is not available (Pro plan), so the
build must split into Code sessions that each score **≤ 15** on ROADMAP §3.1 — design the work
breakdown for Opus 5.5 @ high / Sonnet 5.5 @ high, not for one heroic session.

## Read first

- Project memory/overview and doc history: `gallery/01-framework.md` §4 (planet map),
  `gallery/03`/`04` (bodies, map polish), `gallery/10-record-views-overhaul.md` (wikibox image,
  banner, lightbox, display modes, provenance badges), `gallery/11` §1 (undo/history: a step
  stores whole file text — matters for large raster data), `gallery/12` (body v5/v6, stages,
  `status`/`provenance`), `docs/ROADMAP.md` §3–5, `docs/AUDIT.md`.
- Repo (clone `https://github.com/AbscissaOrdinate/Gallery`): `docs/CLAUDE.md`, `docs/STYLE.md`,
  `docs/UNITS.md`, `src/core/schema/builtin/body.ts` (`controller`, `population_m`,
  `habitability`, `surface_type`, `glyph`, portrait assets), `src/core/astro/{worldsmith,ewocs,derive,modes,glyph}.ts`,
  `src/core/storage/*`, `src/core/repo.ts`, `src/ui/BodyPanel.tsx`, `package.json` (current
  dependencies — the lazy-senior-dev rule applies: platform/stdlib first, a new dependency
  needs a one-line justification).

## Owner requirements (stated earlier; binding)

- A **Mollweide** projection inside the body tab for inhabited bodies — **editable**: draw/edit
  continents, drag (recentre) the projection, change altitudes, see tectonics, Köppen climates
  and population estimates; climates roughly estimated or manually selected.
- Ruled 2026-09-14: surface data = **painted low-res heightmap + polygon territories**;
  tectonics = a **plate layer with boundary types** that *suggests* mountains / rifts / trenches;
  Köppen = **rough estimate, then paint over**; political control = the body's `controller`
  field with derived fallback (contested → split).
- Doc 01: one lat/lon dataset rendered as **Mollweide and globe**; territories are lat/lon
  polygons with a `polity` link; call-outs are point records (locations).
- Body presets should carry **low-fidelity visual examples** that seed the editor for inhabited
  worlds. Mobile is not for map editing.
- Standing rules: advisories never block; nothing is invented as a physical figure (derived
  values state their model); view state never writes; snapshots before bulk/destructive writes;
  every edit goes through the history layer.

## Questions doc 13 must answer (research, then decide or put to the owner)

1. **Storage format** (open owner decision in ROADMAP §5): raster grid inside the record vs a
   separate asset file (PNG/binary/compact text) vs an equal-area grid (e.g. icosahedral/geodesic
   cells). Weigh: YAML diff-ability and OneDrive sync size, undo (a history step stores whole
   file text — a 1–4 MB heightmap per stroke is not acceptable; design stroke-level steps or a
   separate history granularity), polar distortion of equirectangular rasters, resolution
   (propose a default and a max), and round-trip through the existing `StorageAdapter`.
2. **Projections**: forward/inverse Mollweide (Newton iteration for θ), orthographic globe,
   recentring (central meridian and optionally oblique aspect), picking and painting through the
   inverse projection. Pure core functions with hand-computed tests.
3. **Rendering**: Canvas 2D vs WebGL vs SVG for raster + polygons at interactive rates, within
   `STYLE.md` (tokens only; body tints are record data). Justify any library (e.g. whether a geo
   library is worth a dependency versus ~200 lines of projection math).
4. **Tectonics (lightweight)**: plates as lat/lon polygons with Euler-pole motion; boundary
   classification (convergent / divergent / transform, oceanic vs continental) from relative
   velocity; suggestion overlay only — never auto-writes heights unless the user applies it.
5. **Köppen estimate**: the simplest defensible model from inputs Gallery already has or can
   paint (latitude, elevation, land/sea, surface temperature, axial tilt, rotation, maybe a
   prevailing-wind/continentality proxy). Cite the method; mark it provisional; paint-over wins.
   Say which planets it is valid for (Earth-like) and what it shows otherwise.
6. **Population**: check whether Worldsmith 8 actually has a population model (it is **not** in
   `worldsmith.ts` today). If not, propose a sourced carrying-capacity approach (land area ×
   habitability × density class) or leave population to `population_m` + territory sums —
   do not invent a model without a source.
7. **Territories and control**: polygon editing (vertex tools, snapping to coastlines optional),
   polity link, how territory area feeds `controller` derivation and doc 10 Geopolitics, and the
   display modes shared with the system map.
8. **Presets and seeding**: how body presets supply a low-res starter surface (procedural noise
   with a seed? a few hand-drawn archetypes?) — procedural generation must be seeded and
   rerollable, never silently overwrite painted data.
9. **Integration**: body tab placement, doc 10 wikibox image / banner / lightbox (the rendered
   map as the body's figure), provenance badges on derived layers, SVG/PNG export.

## Scope guidance

Propose a **v1 first cut** the owner can approve: the earlier handoff suggested "read-only
Mollweide + globe over a raster + territory polygons, painting/tectonics/Köppen later". The owner
wants editing, so a likely v1 is: data model + projections + view + height painting + territory
polygons + undo; v2: tectonics suggestions + Köppen estimate + population; v3: presets/seeding,
export polish. Confirm or reshape.

## Hand back

1. Ask the owner once (≤ 5 questions, each with a recommended default): storage format and
   resolution, v1 scope, globe in v1 or later, tectonics/Köppen depth, whether presets ship
   starter surfaces.
2. Write doc 13 (≤ ~600 lines; tables and acceptance lists over prose): data model and schema
   bumps, core kernels with test oracles, UI, history/snapshot integration, performance budget,
   IP/provenance notes for any method you cite, and a **§Work breakdown** — sessions ≤ 15 each
   with model @ effort, PR list, files, acceptance, and ROADMAP §3.1 scores.
3. Post a ≤ 10-line summary.
