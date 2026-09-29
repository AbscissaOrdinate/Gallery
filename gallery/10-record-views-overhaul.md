# Gallery — 10 · Record views overhaul: Champlain + Caelum (2026-09-28)

Status: spec for Code. Runs **after the UI refresh lands** (miltech / naval-intelligence tokens) and deepens it; it does not re-theme. Companion to `gallery/reviews/caelum-review.md` (Caelum lessons, referenced by letter/number below) and `docs/refs/champlain/` (screenshots from `champlain-refs.zip`).

## Revisions (2026-09-29)

- Caelum review path: `gallery/05-caelum-review.md` → `gallery/reviews/caelum-review.md` everywhere.
- `trust: placeholder` → `provisional: true` (§1.3, §7.3); §7.1's **T** badge tooltip shows `source`/`provisional` (doc 08 dropped `trust`).
- §4: strip renderer is `src/core/astro/strip-svg.ts`; §8 import-boundary rule reads `src/core/**` only (there is no `src/render/`).
- §7.7 and §8: snapshots and the view-never-writes test are delivered by S1 (`feat/foundations`), before 10a's migration.
- §7.8: motion moves into `docs/STYLE.md` behind a Settings toggle, specified in `gallery/11` (C1), delivered by S3.
- §9: `RecordCard`, redaction rendering and the classification header move from 10a into S2; the rest of 10a is unchanged.

Decisions taken 2026-09-28:
- **World descriptor** = auto-generated from EWoCS/derived values, with a manual override.
- **All ratings** stored 0–1 on disk, displayed as a word from a per-axis ladder. Existing 0–10 fields migrate.
- **Tabs**: Champlain's two tab sets (Overview/System/Geopolitics and Guide/Bulletins/Factions) collapse into **five tabs**, with the two overviews merged. The wider frame carries it.
- **Topline page** = Champlain-style views + Wikipedia-style wikibox, above backlinks; the record's figure appears in the wikibox and as an in-page banner, click to expand, every body in the figure links to its record.
- Caelum lessons are merged in **except learning surfaces** (formula reference, "related app pages", CONTROLS / AFFECTS / START WITH triplets).

Assumption (not yet confirmed): containment is **derived per type** (location → host body, body → orbit host, system → region) with an optional `part_of` override. No interstellar starmap in this doc; a lightweight `region` record exists only for breadcrumbs and the index.

---

## 1. What was observed

### 1.1 Champlain Group starmap (five saved pages: Alpha Centauri ×3, Sol, Vega)
Verified from the saved DOM, the bundled app JS (~380 kB) and ~260 design comments in its CSS. `data.json` was not saved, so hover behaviour is inferred from code and comments, not seen live.

- **System chart is ordinal, not scaled.** Data per system is an ordered `bodies` list (`type, name, size 1–3, descriptor, inhabited, nations[], starClass`). Adjacent stars group; moons/asteroids attach to the preceding planet; an asteroid field attaches to the next planet. One parser, two orientations: horizontal (overview, wraps like text, is itself a button into the System tab) and vertical (System tab, larger, moons left of the spine with a `+ N` overflow, descriptor right, belts as panel-wide arcs with name + descriptor, claimant flags per world). Colonized = accent ring, else grey; filled satellite = has a POI.
- **Weakness:** multi-star hierarchy is flattened — Proxima appears mid-row with no relation to A/B. No stations, no L-points, no distance.
- **Panel header:** eyebrow (`REGISTRY` line), name, region breadcrumb `Solar Subcluster // Local Cluster // Local Supercluster`, emblem right (normalised to its painted extent), one-line summary, sovereignty flag(s) + name; divided systems show two flags and "DIVIDED".
- **Overview:** topology line ("Trinary Star System"), key-facts band (bodies · colonized · strings · population; Sol adds boundary AU · planets · satellites · belts · colonized planets/satellites · stations), chart, six-axis profile radar, history strip (Discovered → Charted → Colonized, lit between completed stages; discovered-by, also-known-as).
- **Rating ladders:** every rating is a 0–1 value mapped to a word by a threshold ladder (7 rungs per axis; bloc influence Minimal → Hegemonic). Condition ratings (safety, law, piracy, movement, traffic) are tone-coded chips; "hover for the scale".
- **Geopolitics:** population as a continuous log bar with milestone ticks; political blocs with HQ chip; balance of power as one stacked bar; per-bloc pixel-block meter with a "Level, trend" summary and a short trend bar.
- **Guide:** jurisdiction line, condition chips, languages, currency, **points of interest grouped by host body** (body glyph set into the divider, count, chevron); descriptions **click-only, never hover**; nested children on one continuous tether; type chip coloured by kind; character/services chip strips inside the folded note; **hazards never folded**, boxed red.
- **Factions tab:** faction-presence stacked bar, law enforcement list, violent non-state actors list (each with emblem + pixel meter + level word), and an estimative-caveat footer.
- **Map markers:** nation roundel replaces the system dot; split roundel for divided systems; diamond for unclaimed systems on a major route; restricted records switch to a red scheme with redaction blocks; special-use records gold.
- **Formatting:** two motion speeds (130 / 260 ms, one easing curve), sections rise 8 px with a 35 ms stagger; only the innermost hovered card lights; datasheet cells bottom-align so two-line labels grow upward and values share a baseline; mono for labels/annotations, proportional face for names and prose.

### 1.2 Caelum (from `gallery/reviews/caelum-review.md`, learning surfaces excluded)
Kept: science verification matrix with GAP rows (1); Auto/Guided/Manual provenance on derived values (2); summary-first progressive disclosure (3); label leader lines (4); seeded partial reroll with lock states and failure diagnostics (5, 6); destructive-action discipline with restore points (7); architecture guardrails in CI (8); third-party provenance (9); 1-D **System Poster** strip with AU ruler, log/linear, HZ/frost bands (F); deferred-content labels "4 moons · zoom in" (G); persistent **context strip** EDITING / TOPOLOGY / CLASSIFICATION / SOURCE (B); authoring depths (C); **Result Summary → KPI chips → filter pills** output shape (D); input micro-pattern slider + box + unit chip + endpoints + qualifier line (E); copy-ready **Report** (live finding); view state never writes world data (live finding; `map_angle_deg` on drag is the deliberate exception); storage-health card and pre-restore backup (L).

### 1.3 Where the two converge (build once)
| Champlain | Caelum | Gallery build |
|---|---|---|
| Ordinal chart | Scaled System Poster | **One strip renderer**, `axis: ordinal \| log \| linear` |
| `+ 91` moon overflow | "4 moons · zoom in" | One overflow/deferral label convention on strip and map |
| Registry eyebrow + region chain | Context strip | **Classification header** on every page and editor |
| Restricted red scheme + redaction | Provenance banner | `visibility` + redaction for incomplete fields + source badges |
| Estimative caveat footer | Derived-value qualifier lines | Caveat appears automatically when shown values are derived or `provisional: true` |
| Pixel-block meters | — | The refresh's terminal progress bars, one component |

---

## 2. Record page layout

```
┌─ CLASSIFICATION HEADER ─ GALLERY // UJCN REGISTRY // SYSTEM ── [RESTRICTED] ─ copy briefing ─┐
│ Name                                                            region // region // region    │
├──────────────────────────────────────────────────────────────┬────────────────────────────────┤
│ BANNER — generated figure (click → lightbox)                  │ WIKIBOX                        │
├──────────────────────────────────────────────────────────────┤  emblem · name · summary       │
│ TABS  Overview │ System │ Geopolitics │ Factions │ Bulletins(n)│  sovereignty flag(s)          │
│                                                               │  image (figure/portrait/glyph) │
│  tab content                                                  │  key-facts band                │
│                                                               │  x-card fields by section      │
│                                                               │  radar (compact) · history     │
├──────────────────────────────────────────────────────────────┴────────────────────────────────┤
│ BACKLINKS — grouped (§6)                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Classification header** = Champlain eyebrow + Caelum context strip. Left: `GALLERY // <owning polity registry> // <TYPE>`. Right: visibility level and the provenance summary (`SOURCE: authored + derived`). In editors it expands to EDITING / TOPOLOGY / CLASSIFICATION / SOURCE cards.
- **Region breadcrumb** = derived containment chain, each segment a link.
- **Banner**: only when the type has a figure (table below). Click opens a lightbox with the interactive version (pan/zoom, active display mode, overlays).
- **Wikibox**: floated right; the same `RecordCard` data at full size. Image precedence: `assets[role=infobox]` → type's generated figure → glyph.
- **Tabs**: from `x-views` in the schema; a tab with no content is shown greyed and inert, never hidden (tells you what's missing).
- Mobile: wikibox stacks above tabs; banner becomes a horizontally scrollable strip.

### Figures by type
| Type | Banner | Wikibox image |
|---|---|---|
| system, star | Horizontal strip (ordinal) | Star/barycenter glyph |
| body | Strip with this body highlighted, its moons expanded | Portrait (PNG) else glyph |
| location | Host body's strip, location tick highlighted | Asset else host glyph |
| polity | Holdings strip (§5.3) or fleet sheet | Flag/emblem asset |
| hull, craft | Silhouette (from the design-suite renderer) | Silhouette |
| region | Nested-box index of member systems | Region emblem |
| note, character, other | none | Asset if present |

---

## 3. Schema additions

All via annotations on existing JSON Schemas; bump each touched schema's `version` and keep the `.v<N>.json` backup convention.

```jsonc
// in <type>.schema.json
"x-views":  ["overview", "system", "geopolitics", "factions", "bulletins"],
"x-card":   ["topology", "population", "controller", "descriptor", "discovered"],   // wikibox + hover card order
"x-figure": { "banner": "strip", "infobox": "glyph" },
"properties": {
  "stability": { "type": "number", "minimum": 0, "maximum": 1, "x-rating": "stability" },
  "descriptor": { "type": "string", "x-derived": "descriptor" }                     // override slot
}
```

- **`x-rating: <ladder>`** → `_ladders/<id>.yaml`: ordered `[threshold, word, tone]` rows (tone = `good | caution | bad | neutral`, mapped to the refresh's status colours). Built-in ladders for: quality of life, economy, industry, innovation, integration, stability, influence, safety, law, piracy, movement, traffic, generic. **Write our own word lists**; do not copy Champlain's.
- **Migration**: every existing 0–10 rating (`industry`, and any other 0–10 field found) → value / 10; `habitability` override already 0–1. Migration logged and round-trip tested.
- **New fields**
  - system/location: `safety`, `law`, `piracy`, `movement`, `traffic` (ratings), `languages[]`, `currency`, `jurisdiction` (ref), `history{discovered, charted, colonized, discovered_by}`, `also_known_as[]`, `visibility`.
  - body: `descriptor` (override), `visibility`.
  - polity v3: `kind` (`state | bloc | alliance | org | law_enforcement | nsa | corporate`), `members[]`, `hq` (ref), `emblem` asset; influence entries `{polity, share 0–1, trend −1…+1}` on system/location.
  - new `region` type: `name, parent, tier, emblem` (breadcrumb and index only).
- **`visibility`**: `open | restricted | secret`. Restricted renders in the restricted scheme; secret content is hidden unless the **Declassify** view toggle is on. The toggle is view state and never writes.
- **Redaction = incompleteness** (refresh requirement): any `x-card` field with no value renders as a redaction bar, not a blank. A record's redaction count appears in the header ("4 fields unrecorded").

### Descriptor generator (`src/core/astro/descriptor.ts`)
- Up to three terms, Champlain-length: `[rotation/locking term], [atmosphere/surface term], [world noun]` — e.g. "Tidally Locked, Airless, Barren World"; belts get `[density], [composition]` + "Belt".
- Terms come from derived values already in the body panel (locking, pressure class, aerosol band, surface type, fluid, EWoCS class). Rules live in one table, unit-tested per preset.
- `fields.descriptor` set → used verbatim, badge **M**; unset → generated, badge **A**.
- **Size tier 1–3** derived from radius bins (rocky and giant bins separate, tunable in config); drives glyph radius on the strip only.

---

## 4. The strip (Champlain chart + Caelum poster)

`src/core/astro/strip.ts` (pure model) + `src/core/astro/strip-svg.ts` (renderer). No React in either.

**Model** — built from records, never stored:
1. Star branches from the barycenter tree. Close pairs (both stars orbit one barycenter, separation below a config threshold) share one spine start, drawn overlapping as Champlain does. Distant companions get their own spine/row, labelled with separation in the vault's distance unit.
2. Planets sorted by semi-major axis within their host; moons by sma under their planet; belts placed by inner edge between neighbours.
3. Per node: record id, type, size tier, descriptor, `inhabited` (population > 0 or any inhabited location backlink), `nations` (controller or owner tally from `modes.ts`), `poi` (located-at backlinks), stations and L-objects as ticks on their host (improvement over Champlain).
4. Overflow: per host, show the first *k* moons by mass; the rest collapse to `+ N` (click expands in the lightbox).

**Renderer options**: `orientation: h | v`, `axis: ordinal | log | linear`, `highlight: id`, `wrap: bool` (horizontal ordinal only), `overlays: [hz, frost, belts, labels, flags]` (HZ/frost only on scaled axes), `ruler` on scaled axes. Label placement reuses the map's greedy placer, plus **leader lines** (Caelum 4) where a label is pushed off its glyph.

**Interaction**: every glyph is `<g data-record-id tabindex=0>`. Click → navigate; hover/focus → `RecordCard`; keyboard arrows walk the spine. Exported SVG keeps `data-record-id`, so a re-imported export stays clickable. **Generated at render time, never saved as a hand-authored asset** (same rule as hull silhouettes).

The strip also becomes the system map's **third view mode** (beside Schematic and True scale).

---

## 5. The five tabs (system records; other types choose a subset via `x-views`)

### 5.1 Overview (merged)
Topology line → key-facts band (auto-counted from children/backlinks, never typed) → **Result Summary** prose (generated one paragraph from derived values + summary, Caelum D) → condition chips (safety/law/piracy/movement/traffic, tone-coded, hover shows the ladder) → languages · currency · jurisdiction → profile radar (six rating axes, word + value) → history strip (milestones from any `history.*` dates in the schema).

### 5.2 System
Vertical strip (ordinal default; axis toggle) → **points of interest** = containment children (locations whose chain resolves into this system), grouped by host body in strip order: body glyph in the divider, count, chevron; click-only descriptions; nested children on a tether; type chip coloured by record type; hazards (`kind: hazard`) always open, boxed in the bad tone. Chart POI markers deep-link to their entry here → hub-and-spoke **connections** diagram (any `links` with `rel: connects`, cycler routes, transit networks).

### 5.3 Geopolitics
Population log bar with milestone ticks → blocs present (polities with `kind: bloc | alliance`, HQ chip where `hq` resolves here) → balance-of-power stacked bar (influence shares) → per-polity pixel-block meter with "Level, trend" and a short trend bar. Shares come from explicit influence entries, else the Political-mode tally. For polity records this tab shows the polity's **holdings** as nested boxes (region → system → body → location) with its share in each.

### 5.4 Factions
Presence stacked bar → law enforcement (`kind: law_enforcement`) → corporate/org → violent non-state actors (`kind: nsa`, bad-tone header) — each row emblem + name + meter + level word → caveat footer (§7.3).

### 5.5 Bulletins (n)
Dated `note` records whose `links` point here (any rel), newest first. Index rail left (headline, date, type chip), reader right; "View on map" jumps to the linked body on the strip or system map. No unread tracking.

---

## 6. Backlinks (bottom of every page)

Distinct from the System tab's POI list: **containment children are shown in tabs; backlinks are every other reference.**
- Grouped by relation, then by record type; within a group, nested by containment (a craft `based-at` a station at Mars nests under Mars).
- Collapsed by default with counts; group headers carry the type chip colour; only the innermost hovered row highlights.
- Filter pills above the list (All · by type · by relation), Caelum D — pills, not tabs.

---

## 7. Cross-cutting UI (applies to every editor, including the design suite)

### 7.1 Provenance badges (Caelum 2, 9)
Every displayed value carries a one-letter badge: **A** derived by the kernel, **M** manual override, **T** from `_tables` (tooltip shows `source`/`provisional`), **P** from a preset. Derived numbers get a one-line qualifier beneath (e.g. "Worldsmith gas-retention model; pessimistic for cold worlds").

### 7.2 Inputs and outputs (Caelum D, E)
- Numeric input = slider + number box + unit chip + min/max endpoint labels; `x-distance` fields keep their unit-equivalent line.
- Output panels (body derived panel, budget panel, advisory panel) = Result Summary → KPI chips → filter pills (All · Key numbers · Classification · Orbit · Environment · Habitability · Derived). "All" is the long column.

### 7.3 Caveat footer
Appears automatically when any shown value is **A** or `provisional: true`: short estimative-assessment wording in the refresh's classification voice. One component, one wording template per tab.

### 7.4 Authoring depths (Caelum C)
Record forms get **Quick** (preset/archetype picker + name + host), **Advanced** (full schema form) and **Recipes** (saved multi-record presets, e.g. "Earth + Luna + L4/L5 castles"). Guided goal-fitting is deferred.

### 7.5 Copy briefing (Caelum Report)
Header button emits copy-ready Markdown: classification line, name, summary, wikibox fields, key facts, and the current tab's content as prose/lists. Also writes nothing.

### 7.6 Generation (Caelum 5, 6)
Skeleton… gains a **seed**, **per-slot locks**, **partial reroll** of unlocked slots, and a diagnostics list when a constraint can't be met ("no stable orbit between Jupiter-like and frost line at 2:1 spacing").

### 7.7 Destructive-action discipline (Caelum 7, L)
> Revised 2026-09-29: snapshots are delivered by S1 (`feat/foundations`), before 10a's migration.

Before import, Skeleton regenerate, schema migration, bulk delete or restore: snapshot the affected files to `_snapshots/<ISO-timestamp>/` and log it. Settings gains a **storage-health card** (vault size, record count, snapshot count/size, last sync-visible write) and **Start fresh, keep backups** distinct from a full wipe.

### 7.8 Motion and formatting (Champlain)
> Revised 2026-09-29: motion moves into `docs/STYLE.md` behind a Settings toggle, specified in `gallery/11` (C1) and delivered by S3.

Add to the refresh tokens: `--m-fast 130ms`, `--m-med 260ms`, one easing curve; section entrance = 8 px rise + 35 ms stagger (capped); tab-strip changes fade only. Datasheet grid: columns packed left, cells bottom-aligned on a shared value baseline. Emblems/flags normalised to painted extent in a fixed box; flags keep one height whether one or several.

### 7.9 Map markers
In Political mode the body glyph gains the controller's emblem ring; split ring for contested (already built) uses the same colours as the balance bar; `visibility: restricted` bodies/locations draw in the restricted scheme.

---

## 8. Guardrails and verification (Caelum 1, 8)

- **View state never writes** (delivered by S1, `feat/foundations`, before 10a's migration): a test renders every view/tab/lightbox/toggle against a repository spy and fails on any write, except `map_angle_deg` on drag.
- **Import boundaries**: `src/core/**` may not import React; enforced by a lint rule in CI.
- **Verification matrix**: `docs/VERIFICATION.md` generated from test metadata — each formula/derived quantity → source (Worldsmith sheet, EWoCS table, `_tables` row) → test → status; untested quantities appear as explicit **GAP** rows. Regenerated in CI; a new derived quantity without a row fails the build.
- **Third-party provenance**: `docs/THIRD_PARTY.md` lists every font, icon, dataset and preset source with license; nothing from Champlain or Caelum appears in it because nothing is copied.

---

## 9. Work breakdown (one PR each, strictly in order)

> Revised 2026-09-29: `RecordCard`, redaction rendering and the classification header move from 10a into S2 (wiki hover previews need them); the rest of 10a is unchanged.

| # | Scope | Depends on |
|---|---|---|
| 10a | Schema annotations (`x-views`, `x-card`, `x-figure`, `x-rating`), `_ladders`, 0–10 → 0–1 migration, polity v3, `region` type, `visibility`, descriptor generator + size tier, provenance badges, `RecordCard`, classification header, redaction rendering | UI refresh tokens |
| 10b | Strip model + renderer (ordinal/log/linear, h/v, multistar branches, overflow, ticks, leader lines), banner, lightbox, click/hover/keyboard, system-map third view mode | 10a |
| 10c | Record page shell: wikibox, five tabs + `x-views`, merged Overview (facts band, Result Summary, chips, radar, history), System tab POI list, grouped backlinks with filter pills | 10b |
| 10d | Geopolitics (population bar, blocs, balance bar, meters + trend), Factions (+ caveat footer), Bulletins, holdings nested boxes, connections diagram, Political-mode marker ring | 10c |
| 10e | Caelum operations: authoring depths + recipes, copy briefing, seeded reroll + locks + diagnostics, snapshots + storage card, input/output micro-patterns on body and budget panels, verification matrix, guardrail tests | 10d |

Each closes only with vitest (kernel/model cases), schema round trip, and headless-Chromium smoke green.

## 10. Acceptance fixtures and criteria

Fixtures: Heliaris demo vault; **Sol**; an **Alpha Centauri** triple (A/B close pair on one barycenter, Proxima distant — invented planets fine); UJCN/CDN/AMN polities from `gallery/05` with at least one bloc, one law-enforcement org and one NSA.

- Strip: Sol ordinal matches planet/moon order of the map; Alpha Centauri shows A/B sharing a spine and Proxima on its own row with separation; Jupiter shows `+ N`; clicking any glyph opens that record; exported SVG re-imports clickable.
- Descriptor: every body preset yields ≤ 3 terms; setting an override flips the badge A → M.
- Ladders: migrated `industry` values render the same tier as before migration.
- Page: a new schema declaring only `x-card` renders wikibox + hover card with no code change; an empty tab is greyed, not hidden; an empty `x-card` field renders redacted and increments the header count.
- Geopolitics: balance bar segments equal influence shares; a contested body's split ring uses the same colours.
- Backlinks: a craft `based-at` a Mars station nests under Mars; containment children never duplicate into backlinks.
- Guardrails: the no-write test passes across all views; Declassify toggle leaves the vault byte-identical.
- Snapshots: running Skeleton on a populated system creates a snapshot first; restore round-trips.

## 11. IP

Concepts and layout behaviour only, from both sources. No Champlain palette, TWK Everett (commercial font), roundels, flags, icons, word ladders or text; no Caelum code, prose, presets or data (MPL-2.0 and upstream licenses, see `gallery/reviews/caelum-review.md`). All ladders, descriptors and caveat wording are written fresh.

## 12. Deliberately not built

Interstellar starmap and Leaflet tiling; unread/bulletin tracking and pulses; newsletter, Most Wanted/bounty board, flashpoint cards and the conflict tracker (candidate for a later doc); Guided goal-fitting authoring; all learning surfaces (formula reference, related-page lists, CONTROLS/AFFECTS triplets).

## Handoff to Code
This doc; `docs/refs/champlain/` (unzip `champlain-refs.zip`); `gallery/reviews/caelum-review.md`; `gallery/06` and `07` (renderer and kernel conventions); the refreshed `theme.css`; the fixtures above.
