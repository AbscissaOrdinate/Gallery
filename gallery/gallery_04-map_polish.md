# Gallery — 04 · System map polish (phase 2.5)

Status: delivered 2026-09-14 (commit `2d8fd9a`, `gallery-app-src.zip` / `gallery-vault.zip` / `heliaris-system.map.svg` in the OneDrive Worldbuilding folder). 37 tests green; tsc + vite build clean.

## What changed on the map

**Declutter.** Labels are placed greedily in screen space (every glyph is reserved first, then right/left/above/below, snug then pushed out; hidden if nothing fits — a hidden label still appears on hover). Station labels are 6.4 px until hovered, then 1.35× bold with a backing plate. Artificial orbits draw only for the hovered/selected object. Bodies show a general type under the name (Jovian, Neptunian, Arean, Gaian, G2.8V…); the full EWoCS string, distance and period live in the hover tooltip. Lagrange points are unlabeled dots (label on hover), snap targets for drag-and-drop.

**Semantic zoom.** Orbits scale with zoom; planets keep their glyph size. A planet's moon system appears only when (a) zoom ≥ 1.8× and (b) the clear space around its orbit (gap to neighbouring orbits/belts, or to the star) exceeds ~0.8× the neighbourhood radius — so moons never reach the next planet, in either scale mode. Minor bodies appear past 1.3×. Lagrange objects stay visible and hug their body (host radius + 11 px) while its neighbourhood is hidden; heliocentric stations always visible; orbits drawn smaller than 36 px on screen are treated as a cluster and hide their L-points/L-objects until zoomed.

**Lagrange semantics.** `lagrange_of` = the *secondary* of the pair (Luna for Earth–Moon points, Earth for Earth–Sun points). L1/L2 live in the body's neighbourhood; L4/L5 on the orbit; L3 only when occupied. Moons get their own L-points automatically.

**Schematic / True scale toggle.** True scale = proportional mapping; bodies shrink toward points (planet r ≤ 0.32× screen distance to orbit centre, star r ≤ 0.5× distance to nearest planet, floors 2.5/4 px) and regrow on zoom.

**Display modes** (`src/core/astro/modes.ts`): Plain · Political (body `controller` field, else weighted tally of location owners; split ring when top share < 0.75) · Economic (industry 0–10 + population) · Habitability (weighted geometric estimate from surface class, temperature, gravity, pressure, life; `habitability` field overrides) · Military (garrison + kind weights + craft `based-at`). Legend per mode.

**Units** (`src/core/astro/units.ts`): light-time default (light-ms/ls/lm/lh/ld/ly auto-scaled), AU/km, Mkm — a vault setting (`gallery.config.yaml: distanceUnit`). Distances measured from the orbited body; Lagrange objects use the major body unless the minor is selected. Records keep AU/km on disk; distance inputs (`x-distance` fields) show the equivalent beside the box.

**Schemas bumped**: body v3, location v3 (`industry`, `garrison`, `lagrange`, `lagrange_of`), polity v2 (`color`), system v2 (`moon_scale_px`, `annotations`). Older on-disk copies are backed up as `<type>.schema.v<N>.json`.

## Demo vault corrections (Sean's canon)
Hyperion, Theia = Earth–Moon L4/L5 castles. Phoebe Solar Research = Earth–Sun L1, Asteria Deep Space Telescope = Earth–Sun L2, Pallas Fleetyard = Earth–Sun L4 (leading), Styx Fleetyard = Earth–Sun L5 (trailing) — the L4/L5 assignment of Pallas/Styx is an assumption from the drawing (Pallas on the leading side). Fixable in the record's Position fields or by dragging onto an L-point dot.

## Next
Planet surface editor in the body tab (painted low-res heightmap + sea level, Mollweide with draggable central meridian, polygon territories → polities, plate layer with convergent/divergent/transform boundaries, Köppen rough estimate + paint-over, Worldsmith population), then the module/hull/craft designer.