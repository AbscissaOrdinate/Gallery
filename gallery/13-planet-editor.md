# Gallery — 13 · Planet surface editor: HEALPix layers, Mollweide + globe, territories, tectonics, climate (2026-09-29)

Status: spec for Code, round **R4** (sessions R4a–R4k, §11). Revised the same day with the
Worldbuilding Pasta climate findings and spreadsheet (§7.5, §8). Written by Cowork session C5 against
`main` @ `b130080`. Authority: `UNITS.md` → `CLAUDE.md` → `STYLE.md` → docs 10–12 → this doc;
`ROADMAP.md` §5 rulings are binding on it. Doc 11 §1 (history) and doc 10 (record views) are
prerequisites and are assumed merged. Anything this doc does not settle is a **stop-and-ask**.

## 0. Decisions

**Owner answers (2026-09-29)**

| Question | Answer |
|---|---|
| Storage format (ROADMAP §5 open item) | **HEALPix equal-area grid** (Górski et al. 2005), NESTED order, stored as tiled text sidecar files (§3). |
| v1 scope | **Edit core + globe**: data model, projections, Mollweide **and** orthographic globe, height painting, territory polygons with polity links, undo. v2: tectonics, Köppen, population. v3: seeding/presets, export, doc 10 figures. |
| Tectonics / Köppen depth | **Light physics**: raster plates + Euler poles, boundary classes from relative velocity, suggestions only; Köppen from insolation + Budyko energy balance + zonal-cell precipitation, Peel 2007 rules, Earth-like water worlds only; paint-over wins. |
| Starter surfaces | **Procedural + real Earth**: seeded rerollable generator; a downsampled NOAA ETOPO 2022 heightmap for Sol's Earth (also the climate calibration fixture). |
| Worldbuilding Pasta findings (follow-up) | **Fold in** (§7.5, §8): per-pixel insolation with Kepler timing, tilt phase and slow/locked rotators; W&K transport scaling; Held circulation edge; gravity-scaled lapse; heat-flow tectonics advisory; GCM import (v3). The Pasta spreadsheet stays **local, not in the repo**; this doc carries its formulas. |

**Taken by C5** (reason inline in each section): one new record type `planetmap`, not body fields
(§2.1) · layers keyed by map **id**, so renames never move them (§3.1) · plates are a **raster**
layer, not polygons — they must tile the sphere with no gaps or overlaps, which a painted raster
guarantees and polygon editing does not (§7.1) · territories stay **polygons** (owner ruling
2026-09-14) but their **fills render as a raster**, so no spherical polygon clipping is written
(§5.4) · rendering is Canvas 2D through an intermediate equirectangular index table; no WebGL,
no geo library (§5.1) · **one dependency**: `@hscmap/healpix` (§4.1) · relief colours come from
existing tokens + the body's own tints, so v1 adds no palette; Köppen's categorical colours are
vault table data like `body-tints.yaml` (§5.3, §8.5) · tectonic suggestions carry **no invented
relief figures**: the kernel decides where and what kind, the user sets the amplitude (§7.3) ·
recentring, rotation, mode and layer toggles are view state and never write (§6.4).

**Corrections to the C5 brief's premises** (checked):

- WorldSmith 8 **does** have a POPULATION sheet (doc 03 lists it among the sheets not ported), but its
  formulas are not in the repo or in `Documents/Worldbuilding`; C5 could not read it. §8.6 uses a
  sourced density table instead and leaves a port as a stop-and-ask. (The spreadsheet the owner
  supplied later is Worldbuilding Pasta's, not WorldSmith; it has no population model.)
- The Pasta spreadsheet's *Heat Model* tab has an operator-precedence slip in the tidal term (§7.5);
  its fast-rotator irradiance tab linearises declination (`δ = ε sin …`). Gallery uses the correct
  forms.
- Caelum (MPL-2.0) ships a population model `K = A_prod × ρ_era`; its era densities cite Boserup 1965
  and Cohen 1995 but the numbers are Caelum's own. Not reused (unsourced figures), not copied.
- `StorageAdapter` is **text-only** (`readText`/`writeText`); nothing binary is added. PNG export uses
  canvas `toBlob` + the existing dialog plugin (§9.2).
- `sanitizeSvg` drops `<image>`, so a stored raster SVG could not be a portrait. The body's surface
  figure is therefore **generated at render time** from the map, like hull SVGs (§9.3).
- `@hscmap/healpix` disagrees with healpy on **exact** face-boundary ties (θ = 45°, φ = 90° at
  Nside 128: 16383 vs 27370); 0 mismatches over 20,000 random points at Nside 32/128/256. Tests
  must not use exact-boundary inputs as oracles.

**ROADMAP changes to apply** (coordinator): §5 add ruling 11 = the four owner answers above; strike
"planet-map storage format (R4)" from the open list; replace the R4 row with R4a–R4k from §11;
drop Fable ledger row #2 (Pro plan; every session ≤ 15).

## 1. Scope by version

| Version | Sessions | Delivers |
|---|---|---|
| **v1** | R4a–R4e | `planetmap` type, HEALPix layer store, history `LayerEntry`, projections, Mollweide + globe view with recentre/oblique, height brushes, continent lasso, sea level, territory polygons → polities, control derivation from territories, location pins |
| **v2** | R4f–R4h | Plate layer + Euler poles + boundary classes + suggestion overlay + heat-flow plausibility advisory; climate estimate (per-pixel insolation incl. eccentric, high-tilt and tidally locked orbits; T, P, Köppen) + climate paint layer; population from territory land area × density class; Geopolitics feed |
| **v3** | R4i–R4k | Seeded generator + preset hooks + ETOPO Earth; body figure (wikibox, banner, lightbox, glyph); SVG / PNG / GeoJSON export; equirect PNG heightmap import; ExoPlaSim GCM import |

Mobile: the SURFACE tab renders **view-only** (no tool rail), per the standing rule.

## 2. Data model

### 2.1 New type `planetmap` (schema v1)

Folder `maps/`, file `<slug>.planetmap.yaml` (doc 01 §2 already names it). Why a record and not
body fields: the body schema is already the largest; a map can be deleted, snapshotted and undone
as a unit; and several maps per body (eras, alternate histories) come free.

```yaml
id: pm-7f3a…          # layers live under maps/_layers/<id>/, never under the slug
type: planetmap
name: Earth — present
fields:
  body: body-earth    # x-ref body, rel "surface-of"; required
  primary: true       # the body's figure and control source; at most one per body (advisory)
  era: ""             # free text label
  nside: 128          # enum 32 | 64 | 128 | 256; default 128
  sea_level_m: 0      # datum offset; land = height > sea_level_m
  layers: [height]    # which sidecars exist: height (v1), plates, climate (v2)
  view: { projection: mollweide, center_lon_deg: 0, center_lat_deg: 0, oblique: false }
  territories:        # v1
    - { id: t1, name: Aurelia, polity: pol-uesc, rings: [[[-3.25, 41.5], [2.1, 43.0], …]] }
  plates: []          # v2, §7.1
  climate: { model: estimate }   # v2, §8; "off" = paint only
  generator: {}       # v3, §9.1
```

- `rings[0]` is the outer ring, later rings are holes; points are `[lon_deg, lat_deg]`, 0.01°
  precision, YAML flow style (diffable, compact). Edges are **great-circle arcs**.
- `view` is the *default* view, written only by the explicit **SET DEFAULT VIEW** command (§6.4).
- Polity refs inside `territories[]`: if the S2 link index does not read `x-ref` inside array
  items, `save` syncs the envelope `links[]` with `{rel: "claims", to: <polity>}` per distinct polity
  (derived, never hand-edited). R4e checks which and does the minimum.
- `handling.code_prefix: "PMAP"`; `required: [body]`; `x-views`: none (it renders inside the body page).

### 2.2 Other schema touches

| Schema | Change | Session |
|---|---|---|
| body | v1: none. The SURFACE tab appears for `kind ∈ {planet, dwarf, moon}` with a solid or Gaian surface, or any body with a `planetmap` backlink | R4c |
| body (next version after S5a's v6) | add `obliquity_phase_deg` (0–360, default 0 = periapsis at northern summer solstice; §8.2). No migration: absent = 0 | R4g1 |
| location | none — `body`, `lat`, `lon` already exist; pins read them | R4c |
| body `x-views` (doc 10 §3) | append `surface` for bodies only; the tab is greyed (not hidden) until a map exists, per doc 10's empty-tab rule | R4c |
| `_tables/` | `heat-model.yaml`, `koppen.yaml`, `climate-model.yaml`, optional `gases.yaml` (c_p), `population-density.yaml` (all v2), each row with `source` / `provisional` | R4f, R4g1–2, R4h |

No record migration anywhere in R4. Schema bumps follow the `.v<N>.json` backup convention.

## 3. Storage and history

### 3.1 Layer sidecar files

Path `maps/_layers/<map id>/<kind>.layer` (not a record filename, so `load()` skips it; keyed by
id so a rename never moves it). One header line, then **one line per tile**, in tile order:

```
#gallery-layer 1 kind=height enc=i16le nside=128 order=nested tile=1024 unit=m nodata=-32768
0 c:-3800
1 b:<base64 of 1024 little-endian int16>
…
191 c:-3800
```

- **Tile** = 1024 consecutive NESTED indices = a 32 × 32 sub-square of one base face (NESTED order
  is a quadtree, so a contiguous range is a compact patch). Tile `t` holds pixels `1024t … 1024t+1023`.
- `c:<int>` = constant tile; `b:` = raw values. Encoders emit `c:` whenever a tile is uniform.
- `enc`: `i16le` (height, metres, nodata −32768) or `u8` (plates: 0 = unassigned; climate: 0 = no
  override, 255 = "no climate"). Base64 via `btoa`/`atob` on byte strings (platform; Node 22 has both).
- **Unchanged lines are written back verbatim**; only dirty tiles are re-encoded (no diff noise).
- Minimum Nside is 32 (12 tiles = one per base face).

| Nside | Pixels | Pixel area on Earth (R 6371 km) | Mean spacing | Tiles | `i16` file (all `b:`) |
|---|---|---|---|---|---|
| 32 | 12,288 | 41,509 km² | 204 km | 12 | 33 KB |
| 64 | 49,152 | 10,377 km² | 102 km | 48 | 131 KB |
| **128 (default)** | 196,608 | 2,594 km² | 51 km | 192 | 525 KB |
| 256 (max) | 786,432 | 649 km² | 25 km | 768 | 2.1 MB |

Pixel area `Ω = π / (3·Nside²)` sr; spacing = `√Ω · R` (Górski 2005 §4). **Resolution change** is
exact in NESTED order: down = mean of the 4 children (`p >> 2`), up = replicate (`p << 2 | k`). It
is a whole-file step with a snapshot first (§3.4).

### 3.2 Write path (R4b)

```ts
// core — Repository additions
readLayer(mapId: string, kind: LayerKind): Promise<LayerText>            // {header, lines[], hash}
saveLayer(mapId, kind, next: { lines: Map<number, string> }, opts: { label: string; tx?: Tx }): Promise<void>
createLayer / deleteLayer(mapId, kind, opts)                             // whole-file entries
```

- A **stroke** (pointer-down → pointer-up), a lasso fill, or an Apply of suggestions is **one step** and **one write**, at the end. Strokes never coalesce.
- Writes go through the Tauri atomic temp+rename path already in `fsops.rs`.
- `planetmap` record edits (territories, plates, sea level) are ordinary record saves (doc 11 §1).
- Delete of a `planetmap` = one transaction: record delete + every layer file (whole-file entries).
- CSV: `planetmap` appears in `_index.csv`; layers never do.

### 3.3 History extension — `LayerEntry` (R4b, extends doc 11 §1.2)

A doc 11 step stores whole file text; 525 KB–2.1 MB per stroke would exhaust memory in 200 steps. A
layer entry stores **only the changed tile lines** plus hashes of both whole files.

```ts
type LayerEntry =
  | { kind: "layer-patch"; path: string; beforeHash: string; afterHash: string;
      tiles: { i: number; before: string; after: string }[] }
  | { kind: "layer-whole"; path: string; before: string | null; after: string | null }  // create/delete/resample
// Entry = RecordEntry (doc 11) | LayerEntry; a Step may mix them (e.g. delete map = record + layers)
```

| Rule | Detail |
|---|---|
| Hash | SHA-256 of the file text via `crypto.subtle.digest` (platform; WebView2 and Node 22) |
| Undo preflight | `sha256(readText(path)) === afterHash`, else refuse the whole step (doc 11 §1.5 wording, source `history`) |
| Undo apply | replace listed tile lines with `before`, check the result hashes to `beforeHash`, write; redo mirrors |
| Memory cap | History tracks `bytes` (sum of stored strings); beyond **64 MB** the oldest steps drop, in addition to depth 200 |
| Typical cost | a 300 km brush at Nside 128 touches ≈ 110 pixels, 1–4 tiles → ≤ 22 KB per step |
| Editor sync | after undo/redo of a layer entry, `repo.version(mapId)` bumps; the open editor reloads the touched tiles only |

### 3.4 Snapshots (S1 service)

Snapshot first, cause named: resolution change, **Generate** / **Import heightmap** over a non-empty
layer, **Apply suggestions** over > 10 % of pixels, plate **Re-seed**, map delete. Snapshots copy the
layer files with the record.

### 3.5 Sync size

OneDrive re-uploads the whole layer on each stroke: 525 KB default, 2.1 MB at max. Accepted; a
per-tile file split is the fallback if the owner reports sync lag (stop-and-ask, do not pre-build).

## 4. Core kernels — `src/core/planet/` (framework-free)

### 4.1 HEALPix facade — `healpix.ts`

Dependency **`@hscmap/healpix@1.4.12`** (MIT, 21 KB, zero runtime dependencies; implemented from
Górski 2005, upstream tests against healpy). Justification: NESTED index maths and face-boundary
logic are ~400 lines that are easy to get subtly wrong; this package is small, typed and verified.
Pin the exact version; list it in `docs/THIRD_PARTY.md`. Everything else in Gallery calls the facade,
so the package can be replaced.

```ts
nside2npix, nside2pixarea, nside2resol                      // re-exports
lonLatToPix(nside, lonDeg, latDeg): number                  // vec2pix_nest; lon any range
pixToLonLat(nside, p): [lonDeg, latDeg]; pixToVec(nside, p): V3
queryDisc(nside, v: V3, radiusRad, cb)                      // query_disc_inclusive_nest (brush candidates)
neighbours(nside): Int32Array                               // 8·npix, −1 where only 7 exist; cached per nside
neighbourAngles(nside): Float32Array                        // 8·npix, angle (rad) between centres; NaN where −1
ringOf(nside, p): number                                    // iso-latitude ring (via nest2ring), for zonal marches
ringPixels(nside, i): Int32Array                            // NESTED ids of ring i in longitude order (nest2ring inverse)
spacingRad(nside): number                                   // mean pixel spacing √Ω — the one length scale
```

**Neighbour table** (the package has none): interior pixels from the in-face `(x ± 1, y ± 1)` of
`bit_decombine`; face-edge pixels (≈ 48·Nside) by `queryDisc` at 1.6 × resolution, keeping the 8
nearest by angle. Built once per Nside (≈ 0.1–0.2 s at 128).

**Neighbour rule for every kernel.** HEALPix pixels are diamonds with 8 (sometimes 7) neighbours at
unequal distances, so no kernel may count hops as distance or treat neighbours as equal:
distances come from `neighbourAngles`; neighbour averages are inverse-distance weighted; any
length a user or table gives (brush radius, profile width, coast distance) is in **km** and
converted with `R_body` and, where a pixel count is needed, `spacingRad`. Because every HEALPix
pixel has the same area, one spacing serves the whole sphere (unlike equirectangular, where pixel
width shrinks with cos φ). Area means and quantiles are **plain, unweighted** over pixels.

### 4.2 Projections — `project.ts`

Unit sphere, radians inside, degrees at the API edge. Map units: Mollweide `x ∈ [−2√2, 2√2]`,
`y ∈ [−√2, √2]`; orthographic `x, y ∈ [−1, 1]`.

| Function | Formula (Snyder 1987, USGS PP 1395, pp. 249–252 and 145–153) |
|---|---|
| `mollweide(φ, λ)` | solve `2θ + sin 2θ = π sin φ` by Newton on `t = 2θ`: `t ← t − (t + sin t − π sin φ)/(1 + cos t)`, start `t = φ`, stop `|Δ| < 1e−12` or 60 iterations; bypass at `|φ| = π/2` (`θ = ±π/2`). `x = (2√2/π) λ cos θ`, `y = √2 sin θ` |
| `mollweideInv(x, y)` | `θ = asin(y/√2)`, `φ = asin((2θ + sin 2θ)/π)`, `λ = πx / (2√2 cos θ)`; outside the ellipse (`|λ| > π`) → null |
| `ortho(φ, λ; φ0)` | `x = cos φ sin λ`, `y = cos φ0 sin φ − sin φ0 cos φ cos λ`; visible iff `cos c = sin φ0 sin φ + cos φ0 cos φ cos λ ≥ 0` |
| `orthoInv(x, y; φ0)` | `ρ = √(x²+y²)`, `c = asin ρ` (ρ > 1 → null), `φ = asin(cos c sin φ0 + y sin c cos φ0 / ρ)`, `λ = atan2(x sin c, ρ cos φ0 cos c − y sin φ0 sin c)` |
| `rotate(v, {lon0, lat0, roll})` / `unrotate` | 3-D rotation applied before the normal-aspect projection. Recentre = `lon0`; oblique Mollweide and the globe use `lat0` (and `roll` for the globe). |

The Newton step converges in 4–7 iterations below 80° and 22 at 89.999° (checked); the pole bypass
handles the singular case.

### 4.3 Sphere utilities — `sphere.ts`

`toVec/toLonLat`, `angDist` (atan2 form), `densify(ring, maxDeg = 1)` along great circles,
`pointInRing(v, ring)` by **azimuth winding**: sum the wrapped azimuth changes from `v` to consecutive
vertices; |sum| ≈ 2π ⇒ inside (valid while the ring does not contain `−v`; territories larger than a
hemisphere get an advisory), `ringArea` by spherical excess (signed angle sum, Girard), `ringsArea`
(outer − holes).

### 4.4 Layer ops — `layer.ts`, `brush.ts`

`Layer = { kind, nside, data: Int16Array | Uint8Array, dirty: Set<tile> }`; `decode(text)`,
`encodeDirty(layer, prevLines)` (verbatim for clean tiles), `resample(layer, nside)`.
Brushes act on `queryDisc` candidates with a smoothstep falloff on angular distance (radius in km
at the API, `/R_body`):

| Tool | Effect per pixel (w = falloff 0–1, s = strength) |
|---|---|
| Raise / Lower | `h ± s·w·step_m` |
| Set / Flatten | `h → lerp(h, target, w)`; target = typed value or sampled on pointer-down |
| Smooth | `h → lerp(h, h̄, w·s)`, `h̄` = inverse-distance-weighted neighbour mean (`neighbourAngles`) |
| Land / Sea | pushes `h` across sea level to `sea_level ± step_m` (continent drawing) |
| Lasso fill | rasterise a drawn ring (pixel centres, §4.3) → Set or Raise inside |

`step_m` and brush radius are tool settings (per install), not record data.

### 4.5 Test oracles (R4a; hand-computed, checked by C5 in Python)

| Case | Expected |
|---|---|
| `mollweide(0°, 180°)` | (2.828427, 0) |
| `mollweide(90°, 0°)` | (0, 1.414214) |
| `mollweide(45°, 0°)` | (0, 0.837273), θ = 36.302031° |
| `mollweide(45°, 90°)` | (1.139725, 0.837273) |
| `mollweide(−30°, −120°)` | (−1.724909, −0.571304) |
| `mollweideInv ∘ mollweide` | identity to 1e−9 on a 5° lattice, poles excluded |
| `ortho(0°, 90°; 0°)` | (1, 0), `cos c` = 0 (limb) |
| `ortho(90°, 0°; 45°)` | (0, 0.707107) |
| `lonLatToPix` (healpy, NESTED) | Nside 1 (0°, 0°) → 4; Nside 1 (θ 0.1, φ 0.1 rad) → 0; Nside 1 (θ π−0.1, φ 4.0) → 10; Nside 128 (0°, 0°) → 77824; Nside 128 (lat −30°, lon 200°) → 175706; Nside 256 (lat 80°, lon 359°) → 259543 |
| `neighbours(128)` of 77824 | set {75093, 75095, 77826, 77827, 77825, 72363, 72362, 69631} (healpy) |
| `neighbourAngles(128)` | every finite entry within [0.75, 2.1] × `spacingRad(128)` (0.458°; healpy gives 0.80–2.08); table symmetric (q ∈ N(p) ⇔ p ∈ N(q)) |
| `ringPixels(128, i)` | 511 rings; 4i pixels in the caps, 512 in the belt; total = 196,608 |
| `nside2pixarea(128)` | 6.391587e−5 sr (× 6371² = 2,594.3 km²) |
| octant ring (0,0)→(90,0)→(0,90) | area π/2 sr = 63,758,059 km² at R 6371 km; contains (30°, 30°); excludes (−10°, 30°) |
| ring crossing the antimeridian (170°E → −170°E) | contains (180°, 0°) |
| ring around the north pole (lat 80°, 4 vertices) | contains the pole |
| resample 128 → 64 → 128 | equals the 4-child mean replicated |
| codec | uniform tile → `c:`; round trip byte-identical; unchanged lines verbatim |

## 5. Rendering (R4c)

### 5.1 Pipeline — Canvas 2D, no WebGL, no geo library

| Stage | Built when | Cost target |
|---|---|---|
| **Colour table** `Uint32Array(npix)` from layer + mode | load, mode change; strokes update touched pixels only | ≤ 5 ms full at Nside 128 |
| **Equirect index table** `E`: `(8·Nside × 4·Nside)`, capped at 2048 × 1024, cell → HEALPix pixel | once per Nside per session, idle, ASCII bar | ≈ 0.3 s at 128 (measured 0.24 s for 405 k lookups in Node) |
| **Hillshade** `Float32` on the `E` grid (Lambert, light from NW, gradient from `E` neighbours — trivial on a regular grid) | load; dirty rows after a stroke | ≤ 10 ms |
| **Screen LUT** `L`: screen px → `E` cell (or −1 outside ellipse/disc), via inverse projection + unrotate | view change (resize, recentre, rotate, projection) | ≤ 16 ms at 900 × 450 — arithmetic only, no HEALPix call |
| **Composite** `px[i] = shade(colour[E[L[i]]], H[L[i]])` → `putImageData` | every frame that changed | ≤ 4 ms |

Why the intermediate `E` table: a direct screen → HEALPix lookup costs a `vec2pix` per pixel per
frame (≈ 0.2 s at 900 × 450), too slow for dragging; `E` moves that cost to once per session and
makes recentring pure arithmetic. The double nearest-neighbour step is invisible at `E` = 8·Nside
(0.35° cells vs 0.46° pixels at 128). While dragging, `L` may be built at half resolution and
refined on release.

**Vectors** (territory edges, plate boundaries, graticule, selection, vertex handles, pins, labels)
are an SVG overlay: rings densified to ≤ 1°, forward-projected; a polyline breaks where the rotated
longitude crosses ±180° (interpolated crossing) and, on the globe, where `cos c` changes sign
(interpolated to the limb). Only polylines are clipped — **never polygons**, because fills are raster.

### 5.2 Views

- **Mollweide** (default) and **Globe** (orthographic), toggle in the canvas toolbar.
- Horizontal drag = recentre (`lon0`); with **OBLIQUE** on, vertical drag tilts (`lat0`). Globe: drag
  rotates (`lon0`, `lat0`), Shift-drag rolls. Wheel zooms; double-click resets to the default view.
- Graticule every 30° (15° past 2× zoom), `line-300`; equator and prime meridian one step brighter.
- Cursor readout (mono): `LAT 41.52°N LON 3.25°W · H +412 m · PIX 77824 · <territory> · <climate>`.

### 5.3 Modes and colour (STYLE §1)

| Mode | Fill | Legend |
|---|---|---|
| Relief (default) | sea: `map-void` → `glyph-navy-deep` → `glyph-navy` by depth; land: the body's own tint (`glyph_color`, else its motif's `base` → `detail` in `body-tints.yaml`) → `ink-100` at the top; hillshade on | five discrete steps (STYLE §8 map-overlay ruling), labelled in metres |
| Political | relief greyed to `ink` ramp; territory fill = `polity.color` at a fill-opacity token (add `--opacity-territory` if none fits; note it in STYLE.md); unclaimed land bare; overlap hatched | polities by land area |
| Plates (v2) | plate index → ink ramp; boundaries by line style (§7.2) | plate list with rates |
| Climate (v2) | Köppen class → `_tables/koppen.yaml` colour | classes present |
| Population (v2) | territory density class → sequential ramp (STYLE overlay ramp) | five steps |

No other new tokens are expected; if one is needed, add it to `theme.css` and note it in STYLE.md.

### 5.4 Territory raster

`owner: Uint16Array(npix)` (0 = none; index into `territories`, 65535 = contested) computed from
pixel centres with `pointInRing`, per territory restricted to the pixels of a bounding cap
(`queryDisc` around the ring's centroid). Recomputed for the edited territory only, on edit end.

### 5.5 Placement

- **SURFACE** tab on body pages (doc 10 §3 `x-views`, body only). Canvas fills the tab; tool rail
  left, inspector right (`--inspector-w`): LAYERS (visibility, per-layer opacity — view state),
  TERRITORIES list, SELECTION. **FULL FRAME** hides the wikibox (view state).
- No map yet → greyed tab with **CREATE SURFACE MAP** (Nside picker, Blank or Generate in v3). Creating
  is a user action and one step.
- Location pins: every `location` with `body` = this body and `lat`/`lon` set, drawn with its
  `map_symbol` glyph; hover card = doc 10 `RecordCard`; drag writes `lat`/`lon` (one step, label
  `MOVE <NAME>`); context menu **NEW LOCATION HERE** creates one at the cursor.

## 6. Editing (R4d, R4e)

### 6.1 Tools and keys

| Key | Tool | Notes |
|---|---|---|
| V | Select / pan | click territory or pin to inspect |
| B | Raise/Lower (Alt inverts) | radius `[` `]`, strength `-` `=` |
| F | Flatten / Set | Alt-click samples target |
| S | Smooth | |
| L | Land / Sea (Alt = sea) | continent drawing |
| Shift+L | Lasso fill | closes on double-click |
| T | Territory pen | click vertices, double-click closes; Alt-click deletes a vertex; drag edge midpoint inserts |
| E | Territory edit | move vertices; Shift snaps to another territory's vertex within 8 px (shared borders) |
| — | Sea level | inspector number; moves the datum only (a record edit, no layer write) |

Sea level is a record field; changing it re-colours, never rewrites heights. Coastline snapping of
territory edges is **optional, not v1** (stop-and-ask if wanted).

### 6.2 Territories → control (R4e)

Body political control (`modes.ts` `bodyModes`) becomes:

1. `controller` field → share 1 (unchanged, `controlSource: "field"`).
2. Else, if the body has a **primary** planetmap with ≥ 1 territory: each polity's share = its
   **land** area (pixels above sea level inside its territories × pixel area) ÷ total claimed land; a
   pixel inside *k* territories of different polities counts 1/k to each (contested → split ring
   by the existing `< 0.75` rule). `controlSource: "territories"`.
3. Else the existing location-owner tally.

Doc 10 Geopolitics (balance-of-power bar, holdings) reads the same tally, so it follows automatically.
Inspector shows per territory: exact area (`ringsArea`), land area, share. Equal-area pixels make
land area a count × Ω × R² — no latitude weighting.

### 6.3 Advisories (never block)

Territory ring self-intersects · ring spans more than a hemisphere · two territories of the **same**
polity overlap · `primary` set on two maps of one body · pin outside every territory of its `owner` ·
map `body` is a gas giant or star (info: surface meaningless).

### 6.4 View never writes

Recentre, rotate, zoom, projection, mode, layer visibility/opacity, FULL FRAME, brush settings: no
vault write (the S1 guard test covers the SURFACE tab). Only **SET DEFAULT VIEW** writes
`fields.view` (one step).

## 7. Tectonics (v2, R4f)

### 7.1 Model

- Layer `plates` (`u8`). **SEED PLATES** (count, default 12; RNG seed stored): seed points by jittered
  Fibonacci lattice; each pixel takes the nearest seed by great-circle distance (dot product over
  pixel centres; spherical Voronoi) → one whole-layer step, snapshot if non-empty. The brush tools
  repaint membership.
- `plates[]` in the record: `{ id (1–254), name, pole_lat_deg, pole_lon_deg, rate_deg_myr, crust: auto | oceanic | continental }`.
- Velocity at unit position `p̂`: `v = (ω_rad_per_Myr · ê_pole) × p̂ · R_km` in km/Myr, which is
  **mm/yr** exactly; shown in mm/yr.

### 7.2 Boundary classification

For each pixel `p` on plate A with a neighbour `q` on plate B: raw normal = tangent-plane component
of `q̂ − p̂`, normalised (points A → B). Diamond pixel edges make raw normals jagged, so `n̂` is the
raw normal **averaged over the boundary pixels of the same A–B pair within 1.5 × `spacingRad`** of `p`
(≈ 3–5 pixels), projected back onto `p`'s tangent plane and renormalised. Then
`v_rel = v_B(p) − v_A(p)`; `v_n = v_rel · n̂`, `v_t = |v_rel − v_n n̂|`.

| Condition | Class | Drawn |
|---|---|---|
| `|v_rel| < v_min` | inactive | thin `line-300` |
| `atan2(v_t, |v_n|) > β_transform` | transform | single line, paired half-arrows |
| `v_n < 0` | convergent | line with sawteeth on the overriding side |
| `v_n > 0` | divergent | double line |

`v_min` (default 5 mm/yr) and `β_transform` (default 60°) are **display conventions set by C5**, stored
in the record's `tectonics` block and rendered with the provisional marker. Crust per side: plate
`crust`, else `auto` = pixel above sea level → continental.

### 7.3 Suggestions — never auto-applied

| Boundary × crust | Suggested feature (sides) |
|---|---|
| Convergent C–C | collision range, both sides |
| Convergent O–C | trench on the oceanic side; volcanic range inland on the continental side |
| Convergent O–O | trench on the subducting side (lower mean height; **FLIP** swaps); island arc on the other |
| Divergent O–O | mid-ocean ridge (raise) |
| Divergent C–C | rift valley (narrow lower) with raised flanks |
| Transform, inactive | none (fault line only) |

The kernel emits a **mask + sign + profile**: offset and width from the boundary in **km** (editable;
defaults 1 × and 2 × the pixel spacing, i.e. ≈ 51 / 102 km at Nside 128), distance measured by the
same weighted shortest path as §8.3.
**Amplitude is the user's**: the Apply dialog defaults to the map's own 90th-percentile land height
(ranges) and 10th-percentile ocean depth (trenches), never a baked-in figure. Overlay previews in
place; **APPLY** writes heights as one layer step (snapshot if > 10 % of pixels). Concepts per Cox &
Hart 1986 (*Plate Tectonics: How It Works*); no figures taken from it.

### 7.4 Tests

Plate B pole at the north pole, 1°/Myr; A fixed; R 6371 km. Pixel near (0°, 0°): `|v_rel|` =
111.19 mm/yr eastward. B east of A across a meridian → divergent (`v_n = +111.19`); B west → convergent;
B north across the equator → transform (`v_n ≈ 0`). Voronoi: every pixel assigned; 2 seeds at the
poles split at the equator. Suggestion masks never touch pixels farther than `offset + width` (km).
A straight boundary along a meridian classifies every boundary pixel the same way (smoothed normals
remove diamond jitter); the same map at Nside 64 and 128 gives the same class per boundary segment.

### 7.5 Tectonic plausibility advisory (R4f)

An info/caution advisory on the Plates layer, never a block: surface heat flow at the body's age
(host star `age_gyr`) = radiogenic + primordial + tidal, compared with Hersfeldt's bands —
conservative 0.067–0.19 W m⁻², optimistic 0.04–2 W m⁻² — as "plate tectonics plausible / unlikely at
this age (rough heat model — provisional)". Formulas (Pasta spreadsheet, *Heat Model* tab and *Blog
Formulae* rows 417–439; the author calls it "a very rough model I assembled myself"):

- radiogenic `q_r = (1 − CMF − f_fluid)·M / (4πR²) · Σ hᵢ·cᵢ·exp(−λᵢ t)` with (W/kg, initial kg/kg,
  1/Gyr): ⁴⁰K 2.92e−5, 4.64e−7, 0.495 · ²³²Th 2.64e−5, 1.55e−7, 0.0499 · ²³⁵U 5.69e−4, 1.64e−8, 0.99 ·
  ²³⁸U 9.46e−5, 6.24e−8, 0.154 (the sheet's source: Frank et al. 2014, *Icarus* 243:274 —
  R4f confirms the values against the paper and stops if they disagree)
- primordial `q_p = M · 1.2e−11 · exp(−0.3391 t) / (4πR²)` (sheet: modified from a 2013 *PSS* paper)
- tidal `q_t = 63/(16π)·G^1.5·M★^2.5·R³·e² / (Q·a^7.5)`, `Q = 500` (sheet: after Jackson et al.
  2008, *MNRAS* 391:237). **Use the *Blog Formulae* form** (G437, `63/(16*PI())`); the
  *Heat Model* tab (L8) writes `(63/16*PI())`, which Excel evaluates as (63/16)·π — a factor π² ≈ 9.9
  too large. It is the per-area form of the total tidal power (63/4)(GM★)^1.5 M★ R⁵ e² / (Q a^7.5).

All inputs already exist (`mass_earth`, derived radius, `cmf_pct`, star mass, `sma_au`,
`eccentricity`). Constants go in `_tables/heat-model.yaml`, `provisional: true` on the bands and the
primordial term. Oracle (checked by C5): Earth, CMF 0.325, 4.5 Gyr → 0.0615 + 0.0305 = 0.0921 W m⁻²
(47.0 TW), inside the conservative band.

## 8. Climate and Köppen (v2, R4g1–R4g2) and population (v2, R4h)

Revised 2026-09-29 (C5 follow-up) with the Worldbuilding Pasta *Climate Explorations* results and
the Pasta worldbuilding spreadsheet (§8.0). Net effect: one code path per pixel instead of a zonal
special case, one fewer step function, and eccentric, high-tilt and tidally locked water worlds
move from "not defined" to "provisional".

### 8.0 Reference material

- **Worldbuilding Pasta spreadsheet** (N. Hersfeldt, v1.3.3, 2024). Its Info sheet: *"Modify and
  redistribute at will, but please keep the links to the original source"*
  (https://worldbuildingpasta.blogspot.com/). Kept **out of the repo** by owner choice (not ours,
  2 MB binary, maintained upstream); the owner keeps a local copy with the vault references. Cloud
  Code cannot see it, so **this section carries every formula a session needs**; sheet/cell refs are
  given for cross-checking only. Code that ports a formula keeps the link in a comment and in
  `docs/THIRD_PARTY.md`.
- **Climate Explorations** posts (ExoPlaSim GCM runs by the same author): used only as **qualitative
  acceptance checks** (§8.8), never as model inputs — they are secondary, unlicensed outputs.
- ExoPlaSim (GPL-2) and koppenpasta (GPL-3) are **not vendored** (Gallery is CC BY-NC-SA 4.0);
  ExoPlaSim output can be imported (§8.9), which the GPL does not reach.

### 8.1 Validity gate

The estimate runs when **all** hold; otherwise the Climate mode shows "No Köppen estimate: <reason>"
and the paint layer still works: `surface_type` Gaian family · `fluid` = Aquatic · `rotation_h` set
(or `tidally_locked`) · derived stellar flux and surface temperature available. Outside Earth's
envelope (C5's bounds: tilt > 35°, e > 0.1, tidally locked or resonant, pressure outside 0.5–2 atm, gravity
outside 0.5–2 g, rotation outside 12–48 h) it still runs but every output carries the extra
qualifier "outside the calibrated range". Everything is badge **A**, qualifier *"Budyko energy
balance (North et al. 1981) + Held (2000) circulation scaling — provisional"*. Non-water fluids and
airless bodies stay undefined.

### 8.2 Insolation — one function, `Q(pixel, t)` (R4g1)

- **Orbit timing** (Kepler, exact): time `t` → mean anomaly → eccentric anomaly by Newton (50
  iterations, as the Pasta sheet does) → true anomaly ν; distance `r = a(1−e²)/(1+e cos ν)`; flux
  `S(t) = fluxRelEarth · 1360.8 · (a/r)²` (Kopp & Lean 2011). Mean over the orbit = `(1−e²)^(−1/2)`
  × the circular value.
- **Season phase**: new body field `obliquity_phase_deg` (Pasta's "argument of obliquity": 0 =
  periapsis at the northern summer solstice, 90 = northern autumn equinox). Solar longitude
  `L = ν + 90° + obliquity_phase_deg`; `sin δ = sin ε sin L` (exact; the Pasta sheet's linear `δ = ε sin(…)`
  is not used).
- **Fast rotators** (synodic day < year/20): daily-mean formula
  `Q = (S(t)/π)(h₀ sin φ sin δ + cos φ cos δ sin h₀)`, `cos h₀ = −tan φ tan δ` clamped — computed
  once per HEALPix ring.
- **Slow and resonant rotators** (synodic day ≥ year/20, including 1:1): instantaneous
  `Q = S(t)·max(0, cos z)` from the substellar point's track, sampled at 72 steps over two orbital
  periods per pixel (the Pasta sheet's "Irradiance Slow Rot" method; valid while the synodic day is
  < 2 years). 1:1 and e = 0 degenerate to a fixed day side.
- **Months** = 12 equal **time** slices of the orbital period (not of ν), whatever the year length;
  years < 0.25 or > 4 Earth years add the qualifier "month binning stretched".

### 8.3 Temperature (R4g1)

1. **Local Budyko balance, per pixel** (no zonal special case):
   `T̄_pix = T̄ + [(1−α)·Q̄_pix − ⟨(1−α)Q̄⟩] / (B + γ)`, area mean over equal-area pixels. `T̄` =
   Worldsmith derived surface temperature, or (option `t_mean: co2`) the Kadoya & Tajika 2019
   fit from flux, surface albedo and `pCO₂ = pressure_atm × CO₂ %` (valid 150–350 K; coefficients
   from the paper, cross-check the Pasta "Hab Planet Temp" sheet). `B = 2.09 W m⁻² °C⁻¹`,
   `γ = 6D`, `D₀ = 0.649` (North et al. 1981 pp. 93, 96–97). Ice albedo 0.62 where
   `T̄_pix < −10 °C` (Budyko via North 1981 pp. 94, 104); start with ice poleward of 60°, iterate
   ≤ 50 passes.
2. **Transport scaling** (Williams & Kasting 1997, Eq. 9):
   `D/D₀ = (p/p₀)(c_p/c_p₀)(m₀/m)² · f_rot`, `m` = derived mean molar mass; `c_p/c_p₀ = m₀/m` unless
   R4g1 sources per-gas `c_p` (NIST) into `_tables/gases.yaml`. Rotation: W&K's `(Ω₀/Ω)²` is
   **clamped**, `f_rot = clamp((Ω₀/Ω)², 0.25, f_max)`, because unclamped it flattens slow rotators far
   more than GCMs do (Pasta's 240 h run keeps ~⅔ of Earth's contrast; W&K would give ~2 %).
   `f_max` is fitted in R4g1 to that ratio — C5's estimate ≈ 1.8 — and stored `provisional: true`.
   Consequence (stated in the qualifier): every rotation slower than ~1.35 × Earth's gets the same
   transport; the day-length effect then comes only through `φ_H` (§8.4) and the response period.
3. **Seasonal / diurnal response**: periodic steady state of `C dΔT/dt = (1−α)ΔQ(t) − (B+γ)ΔT`
   over the forcing period (the year for fast rotators; the two-orbit window for slow ones), 48
   steps per period, `C_L = 0.16 B·yr`, `C_W = 4.7 B·yr` (North 1981 p. 100). Land blends
   `k·ΔT_L + (1−k)·ΔT_W`, `k = 1 − exp(−d_coast/L_c)`. `d_coast` = multi-source **Dijkstra** from all
   ocean pixels over the neighbour table with edge weights from `neighbourAngles` × R (not hop
   counts: diamond pixels make hop distance direction-dependent). ≈ 1.6 M edges at Nside 128.
   Driving it with the planet's own period is what gives long-year worlds deep seasons.
4. **Elevation**: `Γ = 6.5 K/km × (g/g⊕)(c_p⊕/c_p)` — the U.S. Standard Atmosphere 1976 rate scaled
   by the dry adiabat `g/c_p` (so low-g worlds lose highland tundra, as Pasta's planet-size runs
   show).

### 8.4 Precipitation (R4g2)

- **Circulation edge** replaces the Worldsmith cell count: `φ_H = min(90°, 30° · √(Ω⊕a⊕/(Ωa)))`,
  from Held's (2000) scaling `φ_H ∝ (gHΔ_v)^¼ /(Ωa)^½` (the ¼ power confirmed in Frierson et al.
  2007; the Ω^−½ exponent must be confirmed from the paper in R4g2 — stop and ask if it differs),
  with the static-stability factor held at Earth's. Earth's 30° is the anchor.
- **Bands**: rising (wet) at the ITCZ, sinking (dry) at `±φ_H`, then alternating every `φ_H`
  poleward (Earth: dry 30°, wet 60°, dry 90°; fast rotators get more, narrower bands, as in Pasta's
  12 h and 6 h runs; slow ones one wide cell). Cosine interpolation between `P_wet` and `P_dry`.
- **ITCZ** follows the latitude of maximum monthly insolation-driven temperature but **no farther
  than φ_H** (Guendelman & Kaspi 2018: rotation limits how far the ascending branch tracks the sun).
  This replaces the fixed follow factor `s` and reproduces the high-tilt pattern: one cell flipping
  with the seasons and dry equatorial interiors.
- **Tidally locked (1:1)**: bands are measured by angular distance ψ from the substellar point —
  wet for ψ < ψ_c, drying to the terminator, dry night side; `ψ_c` provisional (C5 default 30°).
- **Moisture march**, wind direction alternating by band; ocean relaxes `M` to
  `M_sat ∝ exp(0.07·(T − T_ref))` (Held & Soden 2006); land `P = M·(r + o·max(0, Δh)/Δx)`,
  `M −= P`. Two path types:
  - *Zonal* (all non-locked worlds): walk each HEALPix ring in longitude order (`ringPixels`), with
    `Δx = 2πR cos φ_ring / n_ring`. Rings hold fewer pixels toward the poles (4i in the caps, 4·Nside
    in the belt), so the march is coarser there but distances stay correct.
  - *Path-sampled* (tidally locked, and any future non-zonal wind): step along the path (great circle
    from the substellar point) at `spacingRad`, looking up the pixel at each step with
    `lonLatToPix`; `Δx` = the step length. Pixels a path does not visit take the mean of the paths
    that do within one spacing. Prior for `L_c`: ~2000 km interior-drying scale (Pasta Part VIc, qualitative).
- `P_wet`, `P_dry` from a cited zonal climatology (GPCP, Adler et al. 2018) — **stop and ask if
  none can be sourced**; `r`, `o`, `L_c`, `T_ref`, `ψ_c`, `f_max` are `provisional: true` in
  `_tables/climate-model.yaml` ("C5 heuristic — tune on the Earth fixture").

Known gaps (GAP rows in `docs/VERIFICATION.md`): no meridional moisture transport, monsoon
dynamics, ocean currents, sea ice, clouds, **planet-radius effect on transport** (Pasta's size runs
show it; no sourced scaling), **day–night temperature range** (needs a skin-layer heat capacity we
do not have; a qualitative "night frost likely" flag for synodic days > 100 h is allowed).

### 8.5 Köppen classes (R4g2)

Peel, Finlayson & McMahon 2007 (HESS 11:1633, CC BY), Table 1, on the 12 monthly T and P: B first
(`MAP < 10·P_th`; `P_th = 2·MAT`, `+14`, or `+28` by the 70 % winter/summer rule; BW if
`MAP < 5·P_th`; h/k at MAT 18 °C); then A (`T_cold ≥ 18`: Af `P_dry ≥ 60`, Am `P_dry ≥ 100 − MAP/25`,
else Aw), C (`T_hot > 10`, `0 < T_cold < 18`), D (`T_hot > 10`, `T_cold ≤ 0`) with s/w/f
(`Ps_dry < 40 ∧ Ps_dry < Pw_wet/3`; `Pw_dry < Ps_wet/10`) and a/b/c/d (`T_hot ≥ 22`;
`T_mon10 ≥ 4`; `1 ≤ T_mon10 < 4`; `T_cold < −38`), E (`T_hot < 10`: ET `> 0`, else EF). Summer =
the warmer six-month half. Colours: `_tables/koppen.yaml`, seeded from the legend of Beck et al.
2018 (*Sci. Data* 5:180214, CC BY 4.0), with `source` per row. **Paint-over wins**: the `climate`
layer's non-zero value replaces the estimate for display and every consumer. Köppen's blind spots
on exotic worlds (nothing above 22 °C, double summers at high tilt) are why a second scheme
(Holdridge, or Pasta's bioclimate system reimplemented from its description) is a v3 stop-and-ask.

### 8.6 Population (R4h)

- `_tables/population-density.yaml`, one row per class, anchored to real averages. Seed values
  (people per km², UN WPP 2024 via Wikipedia's *List of countries and dependencies by population
  density*, retrieved 2026-09-29 — secondary source; R4h re-checks against UN WPP/World Bank and keeps
  the row `source`): frontier 2.2 (Mongolia) · sparse 8.6 (Russia) · rural 25 (Brazil) ·
  mixed 37 (United States) · world average 55 · settled 122 (France) · dense 242 (Germany) ·
  very dense 340 (Japan) · urbanised 541 (Netherlands) · extreme 1,333 (Bangladesh).
- Territory fields (v2): `density_class` (row id) and `population_m` (override). Estimate =
  land area × density ÷ 10⁶ M, badge **A**, qualifier "area × density class (UN WPP 2024 anchor)".
- Body `population_m` fallback order: override → Σ territories (override or estimate) of the primary
  map → Σ locations (today's rule). With territories present, locations show "of which in named
  locations", never added on top.
- No carrying-capacity or growth model: nothing sourced was available. Porting WorldSmith 8's
  POPULATION sheet is a **stop-and-ask** — it needs the owner to supply the spreadsheet.

### 8.7 Tests (R4g1, R4g2, R4h)

| Case | Expected |
|---|---|
| `Q` equator, equinox, e = 0, S = 1360.8 | 433.16 W m⁻² (= S/π) |
| `Q` pole, solstice, ε 23.44° | 541.31 W m⁻² (= S sin ε) |
| annual `Q̄` (72 steps), ε 23.44°, e = 0 | equator 415.48; 89° 172.38; area-weighted global 340.20 (= S/4) |
| same on the grid, Nside 128 | **plain (unweighted)** mean of `Q̄` over all 196,608 pixels = S/4 within 0.1 % |
| `d_coast` | ocean = one pole cap; land pixel distances match great-circle distance to the cap edge within one spacing, independent of longitude |
| zonal march | ring Δx sums to 2πR cos φ on every ring |
| obliquity where polar annual `Q̄` = equatorial | 53.9° (Pasta reports ~54°) |
| orbit-mean flux factor, e = 0.3 | 1.04828 (= (1−e²)^−½); periapsis 2.0408, apoapsis 0.5917 |
| season lengths, e = 0.5, `obliquity_phase_deg` 0 | northern summer (equinox → equinox) 71.40 d, winter 293.84 d of 365.24 (Pasta reports 71 / 294) |
| 1:1 lock, e = 0 | substellar pixel `Q̄` = S; antistellar 0; area mean S/4 |
| Budyko, uniform surface, α 0.29, T̄ 15 °C, ε 23.44°, e = 0, W&K factors 1 | zonal means 0° 25.1 · 30° 19.1 · 45° 12.2 · 60° 3.8 · 70° −11.7 · 89° −13.3 (±0.1; 1° bands) |
| W&K scaling | p × 2 → D × 2; m = 44 g/mol vs 28.97 → D × (28.97/44)³ = 0.285 (m² term × default c_p ratio); rotation period × 2 → f_rot 4 → clamped to `f_max` |
| seasonal gain, pure annual sinusoid, P = 1 yr | land 0.9435, lag 0.645 months; ocean 0.0965, lag 2.82 months |
| `φ_H` | 24 h, Earth radius → 30°; 48 h → 42.43°; 12 h → 21.21°; 120 h → 67.08° |
| lapse | g = 0.5 g⊕, same air → 3.25 K/km |
| Köppen rule rows | synthetic monthly series hitting each of the 30 classes and each boundary (e.g. `T_cold` = 18.0 → A; `T_hot` = 10.0 → E) |
| validity gate | Titanian fluid, airless → no estimate; tilt 60° → runs with "outside the calibrated range" |
| population | octant, all land, 122 /km² → 7,778,483,197 (7,778.5 M) |

### 8.8 Qualitative acceptance (eyeball, Earth fixture + variants; screenshots in the PR)

Secondary checks against the Pasta ExoPlaSim runs — directional, never tolerances:

| Variant (Earth fixture) | Expect |
|---|---|
| baseline | A band at the equator; B belts near 30° on west sides and interiors; C/D mid-latitudes; E at the poles and high ground |
| day 48 h / 120 h | dry belts move poleward (Pasta: Hadley edge ~45° / ~60°) |
| day 12 h | narrower tropics, extra alternating bands |
| tilt 0° | no seasons; sharp zone edges |
| tilt 60° | poles warmer than the equator in the annual mean; E band near the equator |
| e 0.3, phase 0 | north has hotter summers and colder winters than the south |
| 1:1 lock | wet substellar region, dry terminator ring, frozen night side |

### 8.9 GCM import (v3, R4k)

For hero worlds the owner can run ExoPlaSim (free, desktop, handles locking, tilt, eccentricity and
pressure) outside Gallery. `scripts/import-gcm.*` reads its monthly surface-temperature and
precipitation fields (lat/lon grid) and writes two Gallery layers resampled to HEALPix (bilinear at
pixel centres): `climate-t` (0.1 °C) and `climate-p` (mm/month), both `enc=i16le` with a new header
field `bands=12` and lines keyed `<band>:<tile>` (§3.1 otherwise unchanged). When those layers exist, §8.3–8.4 are skipped and §8.5
classifies them; badge **T**-style provenance reads "imported GCM output — <file>, <date>". The
script is a stand-alone tool and imports nothing from ExoPlaSim; its format support is limited to
what the owner's runs produce (stop and ask for a sample file first).

## 9. Seeding, export, figures (v3)

### 9.1 Generator (R4i)

- Heights = fBm of 3-D gradient noise (Perlin 2002 "improved noise", reimplemented) sampled at pixel
  **unit vectors** — seamless, no pole pinch; continent count via k low-frequency blobs; seeded PRNG
  (mulberry32, public domain). Params stored in `generator` so **REROLL** is reproducible.
- **Sea level from `liquid_pct`**: HEALPix pixels are equal-area, so the level is simply the
  `liquid_pct` quantile of the sorted heights — exact coverage.
- Height range: user-set in the dialog; defaults = 1st/99th percentile of the ETOPO Earth fixture
  (computed, not typed).
- Never silent: runs only from **GENERATE** / **REROLL**, previews, then writes one whole-layer step
  with a snapshot when the layer is non-empty.
- Presets: body presets with a surface (`bodyPresets.ts`) gain an optional `surface` hint (continent
  count, ruggedness); the ocean fraction always comes from the body's `liquid_pct`.
- **Earth fixture**: NOAA ETOPO 2022, 60 arc-second (DOI 10.25921/fd45-gt74), averaged into Nside 128
  by a one-off script (`scripts/build-earth-surface.*`) and committed as
  `gallery/12-data/surfaces/earth.nside128.layer` (~525 KB) with a source note. **Confirm the use
  constraints in the ETOPO ISO metadata before committing** (U.S. federal data; licence not stated
  on the product page). Used by the Sol recipe (doc 12) and as the climate eyeball fixture.

### 9.2 Export and import (R4j)

- **Export SVG** (assets/, via `putTextAsset`): Mollweide at the current mode, raster embedded as a
  PNG data URI from the canvas, vector territories/graticule/labels on top, `var(--…)` resolved per
  STYLE (`themeColors.ts`). For use outside the app.
- **PNG** (current view) and **equirect heightmap PNG** (16-bit not available in canvas: 8-bit grey
  with the metre range in the file name) via `toBlob` + the dialog plugin.
- **GeoJSON** of territories (RFC 7946 lon/lat) — a text asset, cheap and interoperable.
- **Import equirect heightmap** (PNG/JPEG, greyscale, user gives min/max metres): decode via
  `createImageBitmap`, bilinear sample at pixel centres; whole-layer step + snapshot.

### 9.3 Doc 10 figures (R4j)

- Body wikibox image precedence (doc 10 §2 "Figures by type"): `assets[role=infobox]` → **primary
  planetmap, rendered** (Mollweide, Political if territories exist, else Relief) → glyph. Generated at
  render time, never stored (the hull rule).
- Lightbox: the same map, interactive, view-only.
- Map glyph: new motif `surface` — a small orthographic disc from the primary map (lon0 = 0), drawn
  by `glyph.ts` as app-built markup; `auto` picks it when a primary map exists.

## 10. Performance budget (measure on the owner's desktop; log in ROADMAP §7)

| Operation | Nside 128 | Nside 256 |
|---|---|---|
| Open map (read + decode + colour table) | ≤ 150 ms | ≤ 500 ms |
| `E` table + neighbour table (first open per session, idle, ASCII bar) | ≤ 0.6 s | ≤ 2.5 s |
| Recentre / rotate frame | ≥ 30 fps | ≥ 30 fps |
| Brush dab → pixels on screen | ≤ 16 ms | ≤ 16 ms |
| Stroke end → file written + step pushed | ≤ 150 ms | ≤ 400 ms |
| Territory edit end → raster refill | ≤ 50 ms | ≤ 150 ms |
| Climate estimate full run (v2) | ≤ 1 s (ASCII bar) | ≤ 4 s |
| Memory, all tables | ≤ 40 MB | ≤ 120 MB |

A Web Worker is **not** built unless a budget line fails; if one fails, stop and report the figure.

## 11. Work breakdown

Every session: branch from `main`, one PR per checkpoint, the ROADMAP §4 check plan, one review
subagent on the opposite model, and a `docs/sessions/<ID>-handoff.md` if stopping early. Scores are
ROADMAP §3.1 (Blast / Ambiguity / Physics / UI burden / Reversibility / Context).

| ID | Work | Scores | Total | Route | Needs |
|---|---|---|---|---|---|
| **R4a** | Core kernels: healpix facade + neighbour table, projections + rotation, sphere utils, layer codec, brush maths; dependency add | 1/1/2/1/1/2 | 8 | Sonnet 5.5 @ medium | R3 |
| **R4b** | `planetmap` schema v1, layer read/write in `Repository`, history `LayerEntry` + byte cap, transactions, snapshots, guard coverage | 3/2/1/1/2/2 | 11 | Sonnet 5.5 @ high | R4a |
| **R4c** | Renderer (colour, `E`, hillshade, LUT, composite), Mollweide + globe, recentre/oblique/rotate, picking, readout, Relief + Plain modes, SURFACE tab, pins (view), mobile view-only | 2/2/1/3/1/2 | 11 | Sonnet 5.5 @ high | R4b |
| **R4d** | Height tools (raise/lower/set/smooth/land-sea, lasso), sea level, stroke = step, dirty-tile encode, pin drag + NEW LOCATION HERE | 3/2/1/3/1/2 | 12 | Sonnet 5.5 @ high | R4c |
| **R4e** | Territory pen/edit/snap, territory raster, Political mode, areas, control derivation (`modes.ts`), links sync, advisories | 3/2/2/3/1/3 | 14 | Opus 5.5 @ high | R4d |
| **R4f** | Plates layer, seed/Voronoi, Euler poles, boundary classes, overlay, suggestions + Apply, heat-flow advisory (§7.5) | 2/2/3/3/1/2 | 13 | Opus 5.5 @ high | R4e |
| **R4g1** | Climate temperature: Kepler timing, `Q(pixel, t)` fast/slow paths, Budyko per pixel + ice, W&K scaling + `f_max` fit, periodic response, scaled lapse, optional CO₂ anchor, body `obliquity_phase_deg`, validity gate | 1/2/3/1/2/2 | 11 | Sonnet 5.5 @ high (Opus review mandatory) | R4e |
| **R4g2** | Climate precipitation + classes: `φ_H`, bands, capped ITCZ, locked-world rule, moisture march, Köppen, climate paint layer, `koppen.yaml`, §8.8 screenshots | 1/2/3/2/1/2 | 11 | Sonnet 5.5 @ high (Opus review mandatory) | R4g1 |
| **R4h** | Population table, territory estimates, body fallback order, Population mode, Geopolitics feed | 2/1/2/2/1/2 | 10 | Sonnet 5.5 @ high | R4g2 |
| **R4i** | Generator + reroll + presets hook + ETOPO fixture script + Sol wiring | 2/2/2/2/2/2 | 12 | Sonnet 5.5 @ high | R4h |
| **R4j** | Exports (SVG/PNG/GeoJSON), heightmap import, wikibox/lightbox figure, `surface` glyph motif | 2/1/1/3/1/2 | 10 | Sonnet 5.5 @ high | R4i |
| **R4k** | GCM import script + multi-band layers + provenance (§8.9); needs an owner-supplied ExoPlaSim sample | 2/2/2/2/1/2 | 11 | Sonnet 5.5 @ high | R4j |

R4f and R4g1 are independent after R4e; run them serially unless the owner asks for parallel.

### 11.1 PRs and acceptance

| Session | PRs | Files (main) | Acceptance |
|---|---|---|---|
| R4a | 1 | `src/core/planet/{healpix,project,sphere,layer,brush}.ts`, `tests/planet-*.test.ts`, `package.json`, `docs/THIRD_PARTY.md` | every §4.5 oracle; no React/DOM import under `src/core/planet`; core-purity check green |
| R4b | 2: (1) schema + layer IO + codec wiring, (2) `LayerEntry` + cap + snapshots | `schema/builtin/planetmap.ts`, `repo.ts`, `history.ts`, `tests/repo-layer*.test.ts` | stroke → undo byte-identical file; redo byte-identical; external edit → refused, stacks unchanged; map delete undoes record + layers as one step; 64 MB cap drops oldest; resample snapshots first; view-never-writes passes |
| R4c | 2: (1) renderer + Mollweide, (2) globe + tab + pins | `src/ui/planet/{SurfaceTab,PlanetCanvas,render}.ts(x)`, `scripts/ui-smoke-surface.mjs` | smoke: tab renders for Earth demo, recentre drag changes pixels and writes nothing, globe toggle, pick readout matches a known pixel; screenshots in `screenshots/surface`; budget lines 1–3 measured |
| R4d | 1 | `src/ui/planet/tools/*`, `brush.ts` | smoke: raise stroke → Ctrl+Z restores file; lasso fill one step; sea-level change writes the record only; pin drag undoable |
| R4e | 2: (1) territory tools + raster, (2) control + Geopolitics hook | `tools/territory.ts`, `modes.ts`, `tests/modes-territories.test.ts` | contested overlap → split ring; `controller` still wins; octant territory area oracle; advisories fire, never block |
| R4f | 1 | `src/core/planet/{tectonics,heatflow}.ts`, overlay UI, `heat-model.yaml` | §7.4 tests; heat-flow Earth oracle (§7.5); Apply = one step; no height change without Apply |
| R4g1 | 1 | `src/core/planet/climate/{orbit,insolation,temperature}.ts`, body schema bump, `_tables` seeds | §8.7 insolation, orbit, Budyko, W&K, gain and lapse oracles; `f_max` fit logged with its source run; gate cases |
| R4g2 | 2: (1) precipitation, (2) Köppen + paint layer | `climate/{precip,koppen}.ts`, `koppen.yaml` | §8.7 `φ_H` and Köppen oracles; §8.8 screenshots attached; paint overrides estimate; every output carries badge A + qualifier |
| R4h | 1 | `population.ts`, `modes.ts`, Geopolitics | population oracle; fallback order test; every table row has `source` |
| R4i | 1 | `generate.ts`, `bodyPresets.ts`, `scripts/build-earth-surface.*`, fixture | same seed → identical layer; ocean fraction = `liquid_pct` ± one pixel; never writes without confirm; licence note recorded |
| R4j | 1 | `export.ts`, doc 10 figure hook, `glyph.ts` | exported SVG renders standalone; GeoJSON validates; wikibox shows the map for Earth; glyph motif `surface` in the glyph gallery |
| R4k | 1 | `scripts/import-gcm.*`, layer codec `bands` | sample run imports; T/P round-trip within resampling error; Köppen from imported layers; nothing from ExoPlaSim vendored |

## 12. Provenance and IP

| Item | Source | Licence / status | Use |
|---|---|---|---|
| HEALPix scheme | Górski et al. 2005, ApJ 622:759 | paper | method |
| `@hscmap/healpix` 1.4.12 | npm, M. Koike | MIT | dependency |
| Mollweide, orthographic | Snyder 1987, USGS PP 1395 | U.S. public domain | formulas |
| Köppen rules | Peel et al. 2007, HESS 11:1633 | CC BY | rules |
| Köppen colours | Beck et al. 2018, Sci. Data 5:180214 | CC BY 4.0 | table data, cited per row |
| EBM constants | North, Cahalan & Coakley 1981, Rev. Geophys. 19:91 | paper | B, D, γ = 6D, C_L, C_W, Budyko ice albedo |
| Solar constant | Kopp & Lean 2011, GRL 38:L01706 | paper | 1360.8 W m⁻² |
| Lapse rate | U.S. Standard Atmosphere 1976 | U.S. public domain | 6.5 K/km, scaled by g/c_p |
| Transport scaling | Williams & Kasting 1997, *Icarus* 129:254, Eq. 9 | paper | D ∝ p·c_p/m²·Ω⁻² (rotation clamped) |
| Circulation edge | Held 2000 (via Frierson, Lu & Chen 2007, *GRL*); Guendelman & Kaspi 2018, *GRL* | papers | `φ_H`, ITCZ cap |
| Mean-T option | Kadoya & Tajika 2019, ApJ 875:7 | paper | CO₂ fit coefficients |
| Heat model | Pasta spreadsheet v1.3.3 (Hersfeldt; Frank et al. 2014; Jackson et al. 2008) | "modify and redistribute at will, keep the links" | §7.5 formulas and bands |
| Pasta spreadsheet (orbit, irradiance tabs) | N. Hersfeldt, worldbuildingpasta.blogspot.com | same; consulted, **not vendored** | method cross-checks |
| Climate Explorations posts | worldbuildingpasta.blogspot.com (ExoPlaSim runs) | blog; no data licence | qualitative acceptance only (§8.8) |
| ExoPlaSim, koppenpasta | GitHub | GPL-2, GPL-3 | external tools only; output imported (§8.9) |
| CC scaling | Held & Soden 2006, J. Climate 19:5686 | paper | ~7 %/K |
| Precipitation climatology | GPCP (Adler et al. 2018) | to confirm in R4g2 | `P_wet`, `P_dry` |
| Population anchors | UN WPP 2024 (via Wikipedia list, retrieved 2026-09-29) | facts | table rows |
| Earth relief | NOAA NCEI ETOPO 2022, DOI 10.25921/fd45-gt74 | U.S. federal; confirm constraints | fixture |
| Improved noise | Perlin 2002 (SIGGRAPH) | algorithm; reimplemented | generator |
| mulberry32 | T. Ettinger | public domain | PRNG |
| Caelum, World Orogen (GPL-3.0) | reviewed for scope only | not copied | — |

## 13. Stop-and-ask list

WorldSmith POPULATION port (needs the sheet) · coastline snapping of territory edges · per-tile
layer files if OneDrive lags · a Web Worker if a budget line fails · any tectonic or climate figure
that cannot be sourced · Köppen for non-water fluids (currently "not defined") · more than one
`primary` map per body · Held (2000) Ω exponent if the paper differs from ½ · a second climate
scheme (Holdridge or Pasta bioclimate) · a planet-radius term in transport · day–night temperature
range beyond the frost flag · GCM import format (needs a sample run).
