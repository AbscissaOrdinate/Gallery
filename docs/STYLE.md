# Gallery — Visual system (STYLE.md)

Source: Claude Design book **"Gallery"** (built 2026-09-22). Tokens are in `src/theme.css`,
generated from `docs/design-book/tokens.json`. The detailed per-component spec is
`docs/design-book/README.md` plus `docs/design-book/components/<Name>/README.md`; each
`preview.html` beside it is the reference plate, written against the same CSS variables, so it
renders correctly with `src/theme.css` loaded.

**Precedence:** this file → component READMEs → book README → preview plates. Where this file
says "override", the book is wrong for Gallery and this wins.

---

## 1. Rules for Code (add to `CLAUDE.md`)

- Every colour, size, radius, border, shadow and type style comes from a `var(--…)` in
  `src/theme.css`. No hex, px font sizes or ad-hoc spacing in components or SVG renderers. If a
  value is missing, add a token to `theme.css` and note it here.
- The only colours not from the palette are **record data**: body tints (`body` records) and
  polity colours (`polity.color`). Renderers read them from the record, never invent them.
- Uppercase is written in the copy, never `text-transform`.
- Mono (`--text-data-*`, `banner`, `stamp`, `ascii`, `code`) for every value, code, timestamp,
  coordinate and log line; sans for every label, control, heading and sentence.
- Units always shown, right-aligned in columns. Unknown = `—` in `ink-300`. Missing required
  value = redaction bar (§4.2).
- Radius is `0` everywhere except the classification badge (`radius-2`) and tag chips
  (`radius-pill`). No gradients, glows, neon, panel shadows, or coloured-left-edge cards.
- Nothing animates except the ASCII spinner, the indeterminate ASCII bar and the boot orbital
  idle; all three stop under `prefers-reduced-motion`.
- Hull/craft SVGs stay generated from the record at render time (existing rule) — theming them is
  a renderer change, never an edited asset.

---

## 2. Overrides — where the book conflicts with Gallery decisions

| Book says | Gallery rule | Why |
|---|---|---|
| VIOLATION "blocks the operation"; hull budget bar blocks `COMMIT` when a budget is violated | **Nothing blocks save.** VIOLATION is the top severity only. The budget bar states the violation in words and shows `SAVED WITH 2 VIOLATIONS`-style commit state; `COMMIT` stays enabled. | Locked decision (`gallery/07` §4): advisories never block; captured, export and deliberately bad designs must be saveable. |
| Boot screen with smartcard/PIN `AUTHORIZE` prompt; "unattended terminals lock after 90 s" | Boot is **cosmetic and non-gating.** It runs while the vault actually loads, log lines are the real load steps (with in-world phrasing), and any key or click dismisses it once loading finishes. The auth panel is display-only (operator/clearance from `gallery.config.yaml`, PIN field accepts anything or is skippable). No lock timer. Setting `boot: full | brief | off`. | Single-user desktop app; a fake login must never delay or block work. |
| Boot orbital idle: three canned ASCII frames | Generate frames from the vault's active `system` record (primary, up to ~5 orbits, bodies at their `map_angle_deg` advanced per frame). The book's three frames are the style reference and the fallback when no system exists. | Canned art drifts from canon. |
| Bodies at working zoom are "a filled disc in a single flat tint", "do not texture a body" | **Keep the existing 22 `glyph.ts` motifs** (bands, craters, cracks, haze, rings). Restyle only: flat fills, no gradients, strokes from tokens, tints from the record, desaturated enough to sit under `ink-100` labels. | Motifs encode EWoCS classification; decided 2026-09-22. |
| Far zoom replaces everything with tactical symbols | Adopted as specified (threshold, not blend; symbols don't scale with zoom). Threshold is a config value, not the book's "0.2×", since Gallery's zoom scale differs. | — |
| `display` type 34px; boot wordmark 46px | `--display-boot` token added for the boot wordmark only. | Book is internally inconsistent. |
| Inspector is `inspector-w` (320px) on record/map; 380px in the hull editor; catalog 340px; log detail 420px | All four added as size tokens (`--inspector-w`, `--inspector-wide-w`, `--catalog-w`, `--detail-w`). | Values taken from the plates. |
| Mono face ships as `fonts/consola.ttf` | **Do not commit the TTF.** Consolas is a Microsoft font; `theme.css` resolves it with `local()` and falls back to Cascadia Mono. | Licensing; repo is on GitHub. |
| Sans is the system stack | Adopted. Drop the self-hosted Inter files and their `@font-face`. | Book specifies system-ui (Segoe UI on Windows). |

---

## 3. Core rules (summary — full text in the book README)

**Surface ramp.** `surface-100` app ground → `surface-200` outer panel → `surface-300` group /
panel header → `surface-400` field inset / hovered row. Never skip a step. Canvases (map, hull
profile) on `map-void`. `surface-sunk` for troughs: log stream, ruler strip, scroll wells.
Three nesting levels maximum; a fourth means split the pane.

**Ink.** `ink-100` values, `ink-200` labels, `ink-300` meta/units/timestamps, `ink-400` disabled
only (fails contrast by design).

**Accent (attention).** One `accent-500` fill per pane (active tab, primary button, selection
handle), text on it is `on-accent`. `accent-300` = accent text/icon and the focus ring.
`accent-700` = selected-row wash. `accent-600` = pressed border / dimension lines. Accent is never
a severity and never an affiliation.

**Status (state).** red = violation, amber = caution, green = nominal; `-mark` for bars/pips/
tracks, `-wash` for advisory rows. Every severity is also a word and a glyph.

**Navy (the system's own colour).** `glyph-navy` for icons/glyphs and friendly tracks;
`glyph-navy-wash` behind catalog tiles.

**Borders.** Every box has `border-1 line-200`; `line-100` hairlines inside groups; `line-300`
hover/focus boundary. `border-3` appears only as the left severity rule on log/advisory rows and
the active primary-tab underline.

**States.** Rest `line-200` → hover `line-300` (+ `surface-400` ground on buttons) → focus
2px `focus` ring at 1px offset → pressed keeps fill + `accent-600` border → disabled
`opacity-disabled` on the whole element, no colour change. Selection = `accent-700` wash +
`border-3 accent-500` left rule + `accent-300` label (log rows: `border-2` outline instead, so the
severity wash survives).

**Voice.** Operator labels (`HULL CLASS`), commands say what they do (`MOUNT`, `EXPORT SVG`),
empty states are one line of fact + remedy, no "you", no emoji, no exclamation.

---

## 4. Record document layer (new behaviour, needs data)

### 4.1 `handling` block — add to the record envelope (all types, optional)
```yaml
handling:
  level: secret          # top-secret | secret | confidential | unclassified (default)
  caveats: [SI, REL TO CMW]
  code: ONI-TECH-0412    # record code; blank → derived from type + slug
  programme: uesc        # ref polity id → rendered as its acronym (UJCN, LDF, AMN, PDN, CDN, JSSF)
  badge:                 # ClassificationBadge rows, max 5, clearance first
    clearance: LEVEL 4
    disruption: —        # closed vocabulary per vault config
    risk: —
  originator: —
  declassify_on: —
  derived_from: []
```
Banner string, top and bottom, identical: `LEVEL//CAVEATS — CODE — PROGRAMME`. Ground token by
level (`class-top-secret` text `on-accent`; others `ink-100`). A record with no `handling` shows
UNCLASSIFIED — never no banner. Banners appear only on record pages, never on panels/dialogs/lists.
Vocabularies for caveats, disruption and risk live in `gallery.config.yaml` so they stay closed.

### 4.2 Redaction = incompleteness, computed
A field is redacted when its schema marks it `required` and the record has no value. No manual
flag. Keep the label, draw a `redact` bar (border `line-200`) at roughly the value's natural
width, reveal `DATA PENDING` (`stamp`, `ink-300`) on hover; no reflow. A group that is wholly
empty says so once in `stamp` instead of barring every row. Completeness % = filled required ÷
required, shown in the badge block and footer; group headers show the pending count in
`stamp`/`status-amber`. Never used as a loading skeleton.

### 4.3 Severity mapping (kernel → UI)
| Kernel `Advisory.severity` | UI word | Row treatment |
|---|---|---|
| `violation` | VIOLATION | `status-red-wash`, `border-3 status-red-mark` |
| `caution` | CAUTION | `status-amber-wash`, `border-3 status-amber-mark` |
| `info` | INFO | no wash, `border-3 line-200` (log only) |
| *(domain evaluated, no advisories)* | NOMINAL | green pip/badge |
| *(not yet evaluated)* | PENDING | `ink-300` |

Editors group advisories by severity (violation → caution → nominal); only the AdvisoryLog orders
by time. `Advisory.domain` renders in the log's SOURCE column.

---

## 5. Component inventory

| Component (book) | Where it lands |
|---|---|
| PanelNesting, Button, Input, Tabs, StatusBadge, AsciiIndicators | Shared primitives in `src/ui/` — every screen |
| ClassificationBanner, ClassificationBadge, RedactionBar, RecordPage | Record editor (all types) |
| AdvisoryLog | New session log pane; subsumes the current warnings list as its detail source |
| SystemMap | `SystemMap.tsx` / `layout.ts` restyle |
| SystemMapFarZoom, TacticalSymbols | New far-zoom LOD in the system map |
| HullEditor | Editor 1 shell (`gallery/07` §2) — the book's plate is the target layout |
| BootSequence | New startup screen |
| Cover | Not implemented (book cover only) |

**Deferred until the data exists** (render nothing rather than placeholders): far-zoom order of
battle and task-force echelon grouping (no formation record type yet), threat envelopes (need
engagement/sensor radius on craft/locations), commander field on formations.

---

## 6. Implementation order (one PR each)

1. **Tokens.** Replace `src/theme.css`; add `docs/STYLE.md` and `docs/design-book/`; drop Inter;
   map every legacy variable (`--navy-*`, `--rust-*`, Nocturne surface/text/accent names) to a new
   token, then delete the legacy names in the same PR. Grep must find zero old names. No
   component changes. Screenshot diff of the existing screens.
2. **Renderer audit.** Route hardcoded colours in `glyph.ts`, `SystemMap.tsx`, `layout.ts`,
   `modes.ts` legends and `hull/render.ts` through tokens (body/polity tints stay record data).
3. **Primitives.** PanelNesting, Button, Input, Tabs, StatusBadge, AsciiIndicators; convert
   existing panels to the three-level nesting.
4. **Document layer.** `handling` envelope field + schema bump with backups per convention;
   banners, badge, computed redaction, completeness; RecordPage layout (rail, side column with
   backlinks/handling/revisions, footer).
5. **Map.** SystemMap restyle, then far-zoom tactical LOD + TacticalSymbols.
6. **AdvisoryLog + BootSequence.**

Each PR: `tsc` clean, vitest green, headless-Chromium smoke with screenshots compared against the
matching `preview.html` plate.

---

## 7. Not in the book, not to be invented
Reference screenshots of third-party games were used only for comparison and are **not** in
`docs/design-book/`; nothing from them is reproduced. If a screen needs a pattern the book does
not cover, compose it from the primitives above and add a note here rather than inventing new
visual language.

### 7.1 Notes — composed from the primitives during implementation

- **Tokens added** (theme.css, "Added in implementation"): `--list-w`, `--doc-max-w`, `--dialog-w`,
  `--label-col-narrow-w`, `--menu-max-h`, `--pip-size`, `--check-size`, `--tile-size`, `--ruler-h`,
  `--station-mark`, `--text-control-sm` (Button label at control-sm), `--dur-spinner`; for the map
  (step 5) `--tac-frame-w` / `--tac-frame-h` (TacticalSymbols' 30×20 frame), `--opacity-halo` (the
  12% selection halo) and `--scale-bar-w` (the plate's 120px bar); for boot (step 6) `--dur-idle-frame`
  (900 ms).
- **Schema-driven labels** (field titles, x-group names, table columns) are uppercased when rendered
  (`caps()`), so the DOM text itself is uppercase; schema titles carry no units, so nothing
  case-sensitive is touched. Authored UI copy is written uppercase directly.
- **Nested schema objects** are flattened into rows labelled `PARENT · CHILD` rather than nested a
  fourth level deep. Arrays of objects are a full-width row holding a table.
- **App bar commands**: Import and Settings are navigation, so they moved into the rail as a TOOLS
  section; the bar keeps one command (Reload).
- **Hull editor**: view (PROFILE / PLAN) and rendering (SCHEMATIC / SILHOUETTE) are segmented switches;
  the independent overlays are checkboxes in the canvas toolbar. The outline pane uses the catalog row
  (tile, name, footprint; the severity word replaces the footprint when a row has a violation or
  caution). The station ruler is a strip under the canvas whose tick and label geometry is a
  fraction of `--ruler-h`.
- **Inspector columns** (map side, hull side) use `--label-col-narrow-w` for the label column.
- **Toast**: a floating confirmation at `elev-2` on `surface-300` with a `line-300` border.
- **Map zone rings** (habitable band, frost line) take no pointer events; they are not selectable
  and must not swallow clicks meant for what lies under them.
- **Record glyph colours** (`glyph_color`, `star_color`) are accepted as hex only, because they land
  inside SVG markup; anything else falls back to the vault palette.
- **Redaction in an editor**: clicking a redaction bar reveals its field so the gap can be filled; a bar
  stands only where the value was missing when the record opened (clearing a field mid-edit keeps
  its input). The map's inspector uses the compact editor — no banners, no side column — because a
  banner marks a record page, never a panel.
- **Handling is edited** in the record page's side column (HANDLING panel: marking, badge, provenance),
  from the closed vocabularies in `gallery.config.yaml`; a value off the list is kept and shown.
- **Record code**: `handling.code`, else the type schema's `handling.code_prefix` and the slug
  (`HULL-SWORD-HULL`). **Programme**: the polity's new `acronym` field, else its name, uppercase.
- **Map geometry from tokens**: SVG text is set with `style="font: var(--text-…)"`, never a numeric size;
  strokes in screen space are `var(--border-1/2)`. Geometry that needs arithmetic (label boxes, marks,
  hit areas, dash lengths) reads the token px once (`src/ui/tokenPx.ts`) and is a fraction of
  `--station-mark`, as the hull ruler is of `--ruler-h`.
- **Map labels** follow the SystemMap README's two tiers: a major body in `title-sm` `ink-100` over its
  classification in `data-xs` `ink-300`; minor bodies, moons, stations and Trojans one `data-xs` line
  in `ink-200`; belts and the HABITABLE ZONE / FROST LINE labels `data-xs` `ink-300`. A hovered label
  that the placer had dropped is shown on a `map-void` scrim at `opacity-scrim` (radius 0).
- **Map selection** is drawn the same for every object, sized from its half-size and the station mark:
  halo, frame (a circle round a body, a square round a station), dashed bracket, leader and the
  uppercased name in `data-sm` `accent-300`, the second line in `data-xs` `ink-300`. The selected
  object's ordinary label gives way to it. A selected object's orbit is drawn in `accent-500` too.
- **Scale bar** shows only in TRUE SCALE: a schematic's log spacing is not a distance, so a bar there
  would be false. It is a 1-2-5 step near `--scale-bar-w`, in AU plus the toolbar's unit.
- **Map inspector** puts the selected record's name on the `sel-head` (accent-700), with
  `SELECTED · <record code>` beneath, above the compact editor.
- **Far zoom draws** the primary and major bodies (framed by their `controller`'s affiliation, else
  bare) and heliocentric locations, including star–planet Lagrange stations (framed by `owner`).
  Moons, minor bodies, Trojans and stations orbiting a planet are dropped, as the book drops moons and
  berthed hulls. Labels are the uppercased name only. The affiliation key sits bottom-right on a
  `surface-200` plate, above the scale bar when both show. Symbols select on click and raise the
  inspector; they do not drag.
- **Reference pickers** wrap: in a narrow inspector the CHANGE / CLEAR commands drop below the value.
- **Session log** (AdvisoryLog) is in memory, one per opened vault; the session number counts opens on
  this install. Codes are the source's prefix and its own line count (`HUL-0002`): the kernel has no
  stable check ids, so a code names a line, not a kind of check. Sources: vault, schema, tables,
  record, map, hull, craft, export; an advisory's kernel domain shows beside its source in the detail
  pane, and `source:` matches either. The query also takes `severity:>=caution`, `since:HH:MM` and
  free text; a term it cannot read is shown back in the bar, never dropped silently.
- **What is logged**: the boot's load steps (vault mounted with its elapsed time, each load problem,
  schema and table problems, in-memory upgrades); record pages opened (with a CAUTION for withheld
  fields), created and deleted; the map opened (a CAUTION per layout warning, else NOMINAL), parking
  and SVG export; the hull editor opened. Advisories in the hull editor and craft budget are logged
  when raised, once edits settle; one that stops being raised is marked CLEARED (its line stays);
  a domain that comes clean logs one NOMINAL line. Nothing is ever merged into a count.
- **Log chrome**: the plate's EXPORT and CLEAR VIEW sit in the log's own toolbar (the app bar keeps
  one command). EXPORT saves the lines in view as tab-separated text. CLEAR VIEW starts the view from
  now; the earlier lines stay in the log and the bar counts them. The detail pane's STATE is OPEN,
  CLEARED or —, never "blocks commit" (§2). The evaluation trace is not drawn: the kernel produces
  none yet (render nothing rather than a placeholder). The overview's LOAD PROBLEMS panel is now one
  row pointing at the log. The rail's TOOLS section gains SESSION LOG with the open violation and
  caution count.
- **Boot modes** (`gallery.config.yaml` `boot`): `full` — log, orbital idle and the authorisation
  panel; once loaded, any key or click goes on (typing in the PIN field does not; Enter does); ABORT
  returns to the welcome screen; AUTHORIZE is enabled once loaded. `brief` (the default when unset) —
  banners, log and progress only, gone the moment loading finishes. `off` — nothing; the mode is read
  before loading so it never flashes. Settings → BOOT edits the mode and the operator
  (`operator: {name, clearance, level, caveats, programme}`, display only); Settings → SESSION →
  REOPEN VAULT loads the vault again through the boot.
- **Boot banners** read `LEVEL//CAVEATS — GALLERY WORKBENCH — PROGRAMME` at the operator's level.
  The footnote is node, system and time; there is no lock notice because there is no lock (§2).
- **Boot progress** is the one ASCII bar, 32 cells, in the pending ink with the percentage in
  `accent-300`. The orbital idle is one frame at a time (900 ms, static under reduced motion) in
  `--text-ascii`, which is 12px in theme.css against the book's 13px; the token governs.

---

## 8. Rulings recorded during implementation (2026-09-23)

Owner decisions on conflicts §2 did not cover. They carry the same weight as §2.

| Conflict | Ruling |
|---|---|
| BootSequence frames boot with session banners; §4.1 says banners only on record pages | **Boot is the one exception.** Boot shows top and bottom banners at the operator's clearance (`gallery.config.yaml`). No other non-record surface carries a banner. |
| SystemMap: "`accent-500` for nothing but the selection"; its own plate, Tabs and Input use `accent-500` for the segmented switch, checkboxes and rail selection | **Scoped to the canvas.** Inside the map canvas `accent-500` is only the selection. Toolbar, rail and inspector chrome follow Tabs / Input / RecordPage as the plate does. |
| StatusBadge pip at `radius-1` vs §1 (radius 0 except badge and chips) | **§1 wins.** Pips are square, `radius-0`. `radius-1` is unused. |
| §4.3 names kernel severities `violation / caution / info`; the kernel's `Severity` is `error / warn / info` | UI mapping only, kernel unchanged: `error` → VIOLATION, `warn` → CAUTION, `info` → INFO. |
| Body glyph colours: §2 keeps the motifs with "tints from the record", but most records set no `glyph_color` and glyph.ts carried its own palette | **Palette as vault data.** Default colours per motif (base, detail, cloud, cap, bands), per star class and for planetary rings live in `<vault>/_tables/body-tints.yaml`, seeded once if missing from `src/core/schema/builtin/bodyTints.ts` (the old palette flattened and desaturated 25%). The record's own colour wins. Anything neither supplies falls back to an ink token. No shading gradients or star glow. |
| Polities with no `color` were auto-assigned from a hardcoded palette | **Palette in `gallery.config.yaml`** (`polityPalette`), seeded once if absent. No palette and no record colour → `ink-300`, as is unclaimed. |
| Map overlays (economic, habitability, military) are not in the book | Composed from the palette, no new language: sequential ramp `glyph-navy-deep → glyph-navy → ink-100` (`color-mix`), habitability `map-zone → ink-100`. The legend is five discrete steps, not a gradient. Not accent (selection only on the canvas), not status (severity only). |
| Exports of token-drawn SVG | Map and hull **Export SVG** resolve every `var(--…)` and `color-mix` to a literal colour from the live theme at export time (`src/ui/themeColors.ts`), so the file renders outside the app. |
| `info` advisories: editors group violation → caution → nominal; §4.3 marks INFO "log only"; the book allows no fifth severity | **Editors show INFO** as a third group after CAUTION (before NOMINAL), with the §4.3 INFO row (no wash, `line-200` rule, the word INFO). It stays there once the log exists. |
| RecordPage REVISIONS panel; the vault kept no history | **Logged on save**: the repository appends `{at, change}` to an optional envelope `revisions` list (e.g. `fields: length_m, beam_m`), widening the last entry within a 30-minute editing session, capped at 20. Records from before start with their creation date. |
| RecordPage has no list pane | **The list pane hides on a record page**; the record takes the width between the rail and the edge. The list is one rail click away. |
| Closed vocabularies for handling | **Seeded from the plates** into `gallery.config.yaml` (`handling`): clearance LEVEL 1–6; caveats SI, TK, NOFORN, ORCON, REL TO CMW; ACS disruption (DARK, VLAM, KENEQ, EKHI, AMIDA) and risk (NOTICE, CAUTION, WARNING, DANGER, CRITICAL) classes, each with a severity. |
| SystemMap: "Stations are 9px `glyph-navy` squares" vs the existing per-kind station symbols | **Keep the kind symbols** (depot, shipyard, skyhook, elevator, ring, telescope, base, city, beacon, station) as a motif, like the body glyphs: `glyph-navy` (or the overlay colour), drawn on a 9-unit square scaled to `--station-mark`. The plain station is the plate's square. |
| TacticalSymbols needs an affiliation; nothing in the vault said which side a polity is on | **A polity field**: `affiliation` (friend / hostile / neutral / unknown) on the polity schema (v4, backed up per convention), from the vault operator's point of view. A body takes its `controller`'s, a location its `owner`'s. Blank or no owner draws the object bare; an unrecognised value is unknown. The demo sets UESC friend, UJCN hostile, LDF neutral. |
| Far-zoom threshold "roughly 0.2×" (§2: a config value) | **`map.far_zoom_ratio` in `gallery.config.yaml`**, a fraction of the fit-to-system zoom; default 0.75 (two wheel steps out from Fit). Not seeded: absent means the default. |
| Redaction and completeness need `required` fields | **Core fields marked required** in the built-in schemas (bumped, backed up per convention): polity kind, government; location kind, owner; character role, affiliation; hull hull_class; bus core_diameter_m, station_pitch_m; style construction; craft kind, hull_class, role, hull, operator, status; body kind, system; system primary; module unchanged. A type with none shows completeness as `—`. |

## 9. Verification

`scripts/ui-smoke-screens.mjs [base] [out]` screenshots the main screens of the demo vault and fails
on any page error; `scripts/ui-plates.mjs [out]` renders every `preview.html` with `src/theme.css`
injected. Both take `SMOKE_CHROME=<path>` to use an installed Chromium (e.g. Edge) when the
Playwright browser is not downloaded. `tests/theme-tokens.test.ts` fails on any `var(--…)` in
`src/` that `theme.css` does not define.
