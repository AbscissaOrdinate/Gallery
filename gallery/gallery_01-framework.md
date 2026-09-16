# Gallery — Framework v0.2 (2026-09-09)
 
Decisions locked: **local files in OneDrive** as canonical store · **one bespoke app** · **derived-budget ship designer** · **schematic orbital maps**.
 
## 1. The one hard constraint: mobile + local files
A browser/PWA on a phone cannot open a OneDrive folder directly. Two workable paths:
 
- **A. Microsoft Graph API (recommended).** The app talks to OneDrive through Graph from every device (desktop browser, phone browser/PWA). The folder stays a plain folder on disk; Graph is just the transport. Needs a free Entra app registration set to the "personal Microsoft accounts" audience, SPA redirect + PKCE (MSAL.js), scope `Files.ReadWrite` (or `Files.ReadWrite.AppFolder` to confine the app to its own folder); sign in once per device. Offline edits queue in IndexedDB and sync on reconnect.
- **B. Desktop-only file access + phone as thin client.** Desktop uses the File System Access API on the local folder; phone only reads/edits via Graph anyway — so B collapses into A with extra code.
Assumption going forward: **A**, with the File System Access API as an optional fast path on desktop.
 
## 2. Data model — "everything is a record"
One folder tree, one file per record, JSON with a type-suffixed name:
 
```
Worldbuilding/
  gallery/
    _schemas/        ship.schema.json, module.schema.json, …  (editable in-app)
    _constraints/    default.json, "2130s-fission-only.json" … (tunable rule sets)
    polities/        uesc.polity.json
    locations/       ares-depot.location.json
    bodies/          mars.body.json            (planets, moons, asteroids)
    systems/         heliaris.system.json      (orbital map document)
    maps/            mars-surface.planetmap.json, ares-depot.sitemap.json
    modules/         nswr-mk3.module.json, pdl-40.module.json
    hulls/           sword-of-state.hull.json  (silhouette polygon + slot layout)
    craft/           sword-of-state.ship.json, hammerhead.missile.json, …
    characters/      …
    notes/           free-form.note.json (markdown body, tags, links)
    assets/          images, imported PNGs
```
 
Every record shares a **base envelope**: `id`, `type`, `name`, `tags[]`, `aliases[]`, `body` (Markdown), `links[]` (typed references `{rel, to}`), `created/updated`, `fields{}` (schema-driven). Schemas are JSON Schema documents the app renders into forms — adding a new type (`.station`, `.religion`) is a schema file, not a code change. This is the "feature-agnostic" requirement.
 
Cross-references are by `id`; the wiki UI resolves them to links and shows backlinks. Dynalist OPML imports as `note` records (one per top-level outline node, children preserved as nested Markdown lists, `_note` fields kept), to be promoted to typed records later. Docs/Drawings are not imported; the Heliaris PNG is kept as an `asset` for tracing the first system map.
 
## 3. Modules → hulls → craft (pillar 3, CoaDE-lite)
- **Module** = one component class with declared *contributions* and *demands*: `mass`, `volume`, `power_out / power_in`, `heat_out`, `thrust`, `isp`, `propellant_type`, `cost`, `crew`, `slots_required` (e.g. spinal, turret, internal), plus type-specific fields (missile: warhead, Δv, seeker; PD: rate, range).
- **Constraint set** = tunable rules the designer checks against: tech ceilings (max Isp per drive family, max radiator W/kg, armor density), slot compatibility, mass fraction limits. Swap sets to model eras or factions.
- **Hull** = silhouette polygon(s) + slot list (position, type, size) + structural mass fraction. Drawn once in the sketcher, reused across classes/variants.
- **Craft** (ship/station/strike craft/missile) = hull + module placements. The app computes: total mass (dry/wet), power balance, waste heat vs radiator capacity, Δv per propellant load, acceleration, cost, crew; flags every violated constraint. Variants inherit from a parent craft.
## 4. Maps (pillar 2)
- **System map** (schematic): star at origin; orbits as circles/ellipses with a nonlinear radius mapping (log or per-orbit override) so the inner system is readable — same visual language as `Heliaris Solar System.png`. Each orbit hosts bodies and **assets** (stations, depots, skyhooks, rings) at an angle; L1–L5 auto-placed geometrically for any body pair; moons as nested sub-maps. Every symbol is a record link → side-panel wiki.
- **Planet map**: equirectangular raster/vector base (draw or import), rendered as **Mollweide** and as a **globe** (both are just projections of the same lat/lon data). Territories are lat/lon polygons with a `polity` link; call-outs are point records.
- **Site map**: 2D vector canvas (walls/decks/rooms/labels) with the same record-link behaviour. Low priority.
## 5. App shape
Single-page app (TypeScript + React; SVG/Canvas for maps and the sketcher; JSON-Schema-driven forms; IndexedDB cache; Graph sync). Installable as a PWA on phone and desktop. No server of our own. Claude assistance (record generation, consistency checks, import cleanup) is a later add-on via the API, gated by a key you hold.
 
## 6. Triage
**Necessary (v1):** record envelope + schemas + forms + tags + links/backlinks + search; Markdown notes; OneDrive sync with offline queue; Dynalist/Docs import; system map editor with L-points and record-linked assets; module/hull/craft designer with budgets + constraint sets.
**Desired (v2):** planet map with Mollweide/globe + territories; polygon sketcher polish; site maps; timeline view; Claude assist; PNG/SVG export.
**Unneeded:** multi-user roles, publishing, tech trees, combat sim, 3D, true-scale/Keplerian time, real n-body.
 
## 7. Build phases
1. Schema + envelope + Graph sync + basic record editor (proves mobile path).
2. Dynalist OPML importer; existing PNG registered as an asset.
3. System map editor.
4. Module/hull/craft designer + constraint engine.
5. Planet map, site map, export, Claude assist.
## Resolved (2026-09-09)
- OneDrive is a **personal** Microsoft account → consumer-audience app registration; Graph paths use `/me/drive`.
- Import scope: **Dynalist only** (no Obsidian vault, no Docs).
## Next: Phase 1 scope
Repo scaffold (Vite + React + TS, PWA), record envelope + JSON-Schema forms, IndexedDB cache, Graph sign-in + two-way sync to `Worldbuilding/gallery/`, and the OPML importer run against the three current exports.