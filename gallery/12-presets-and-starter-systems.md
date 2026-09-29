# Gallery — 12 · Star types, orbital configurations, starter systems (2026-09-29)

Status: spec for Code (S4, S5a, S5b). Written by Cowork session C2; research retrieved
2026-09-29. Data drafts live beside this file in `gallery/12-data/` — this doc says **what to
build**; the YAML says **with which numbers**. Authority order is unchanged
(`UNITS.md` → `CLAUDE.md` → `STYLE.md` → numbered docs → `ROADMAP.md`).

**Owner rulings, 2026-09-29** (answers to C2's questions):

| # | Question | Ruling |
|---|---|---|
| 1 | v1 orbital-configuration set | **Core set**: tadpole, horseshoe/exchange, quasi-satellite, barycentric pair (incl. nested triples), rosette circular + elliptical, resonance-chain labels, S/P-type stability advisory |
| 2 | Showcase assignment across the five | **Accepted as proposed** (§4.2) |
| 3 | Sixth system for nebulae | **Yes** — a generic fictional showcase ("Nursery"); nebula overlay and e ≥ 1 orbits move into S5a |
| 4 | Candidate / disputed planets | **Include, flagged** (`status: candidate \| disputed`, provisional, one recipe toggle) |

Decided by C2 without asking (reversible; owner may overturn): main-sequence presets **pin
L and R from Mamajek** rather than use Worldsmith's mass relations (§2.3); starter locations
carry **no owner** (generic starters; the empty required field renders as pending/redacted).

---

## 1. Rules that bind every number here

1. **No invented physical figures** (`UNITS.md` rule 6). Every figure in `12-data/` carries a
   `src` id resolving in `12-data/sources.yaml`, or sits under `prov:` with a one-line
   rationale. Speculative bodies are `status: speculative` and wholly provisional.
2. **Derived values say how.** A value computed here from sourced inputs is `src: derived`
   with the formula in `derive_note` (e.g. barycentric a, M⊕ from GM).
3. **Secondary sources are marked.** Many figures were read off Wikipedia pages that cite a
   primary. `sources.yaml` gives `via:` for those and `verify: true` where the page did not
   attribute the figure. S4/S5b confirm `verify: true` rows against the primary before merge
   or leave them provisional.
4. **Midpoints are provisional.** Where a source gives a range, the seed is the midpoint and
   the field is listed under `prov:`.

---

## 2. Part A — Star types (→ S4)

### 2.1 What is wrong today (verified in code)

- `worldsmith.ts` derives L and R from mass with main-sequence relations only
  (`starLuminosity`, `starRadius`); `spectralClass()` always appends `V`; `deriveStar()`
  computes HZ, frost line, inner limit, MS lifetime and `earthlikeLife` unconditionally.
- The white-dwarf and brown-dwarf presets escape this only by pinning
  `luminosity_sol`/`radius_sol`. Their figures carry no source.
- Worldsmith's relations diverge from the Mamajek table by up to ~2× in L (table in
  `star-types.yaml → worldsmith_divergence`): O5V ×2.11, A0V ×0.56, M0V ×1.53.

### 2.2 Model change: `stage`

Body schema **v5** adds (S4):

| Field | Type | Meaning |
|---|---|---|
| `stage` | enum | `pre-ms · ms · subgiant · rgb · red-clump · agb · blue-supergiant · red-supergiant · wolf-rayet · hot-subdwarf · white-dwarf · neutron-star · black-hole · brown-dwarf`. Absent ⇒ `ms` for `kind: star`, `brown-dwarf` for `kind: brown-dwarf`. **No migration**: existing records keep today's behaviour. |
| `spectral_type` | string | Free-text override (e.g. `K1.5 III`, `DA2`). Wins over the derived label. |
| `stage_duration_myr` | number | Optional; how long the stage lasts. Replaces the MS-lifetime check for non-MS stages. |
| `status` | enum | `confirmed · candidate · disputed · refuted · speculative` — used by recipes (§4) and shown as a chip. Any body. |
| `provenance` | object | `{ src: id, fsrc: {field: id}, prov: {field: reason} }` written by recipes; read by the doc 10 provenance badges later. Any body. |

`kind` stays `star` for every stellar stage (and `brown-dwarf` for substellar) — the map,
modes and `hostStar()` already key on kind; `stage` only changes what is derived.

**Derivation validity per stage** (S4 implements; ✓ valid, ⚑ valid but flagged, ✗ suppressed
with the reason shown):

| Derived quantity | ms | pre-ms | subgiant · rgb · clump · agb · supergiants · WR · sdB | white-dwarf | neutron-star · black-hole | brown-dwarf |
|---|---|---|---|---|---|---|
| L, R from mass relation | ✓ (or pinned) | ✗ needs L, R | ✗ needs L, R | ✗ needs L, R | ✗ needs R; L = 0 | ✗ needs L, R |
| T_eff from L, R | ✓ | ✓ | ✓ | ✓ | ✗ (no photosphere modelled) | ✓ |
| Spectral label | letter+sub+`V` | +`V` ⚑ "PMS" | letter+sub + `IV`/`III`/`I`; WR → `WR`; sdB → `sdB` | `D` | `NS` / `BH` | `L`/`T`/`Y` by T (below) |
| HZ, frost line | ✓ | ⚑ "moves as the star contracts" | ⚑ "instantaneous — the stage is brief" | ⚑ "shrinks as it cools" | ✗ "no stellar HZ" | ⚑ as WD |
| Inner limit | ✓ | ✓ | ✓, plus **engulfment**: any orbit with periapsis < R★ warns | ✓ | ✗ | ✓ |
| MS lifetime `10·M/L` and "age exceeds MS lifetime" | ✓ | ✗ | ✗ → `stage_duration_myr` if set | ✗ | ✗ | ✗ |
| `earthlikeLife` | ✓ | "Star too young" | "No (post-MS)" | "No (remnant)" | "No (remnant)" | "No" |
| Colour (`tints.starTint` from T) | ✓ | ✓ | ✓ | ✓ | glyph variant | ✓ |
| Skeleton… generator | ✓ | ✗ message | ✗ message | ✗ message | ✗ message | ✗ message |

Brown-dwarf letter bands, from Mamajek's own rows (L0V 2,270 K, T0V 1,255 K, Y0V 450 K):
**L** 1,255 < T ≤ 2,270 · **T** 450 < T ≤ 1,255 · **Y** ≤ 450. Above 2,270 K the existing M band applies.

### 2.3 Catalogue (full rows in `12-data/star-types.yaml`)

Main sequence — **Mamajek 2022.04.16**, L and R pinned, Teff derived by the kernel lands within
2% of the table (oracle test):

| id | SpT | M☉ | R☉ | L☉ | T_eff (table) | replaces |
|---|---|---|---|---|---|---|
| `star-ms-o5v` | O5V | 43 | 11.45 | 3.47e5 | 41,400 | new |
| `star-ms-b0v` | B0V | 17.7 | 7.16 | 4.47e4 | 31,400 | new |
| `star-b` | B5V | 4.7 | 3.36 | 589 | 15,700 | same id |
| `star-a` | A0V | 2.18 | 2.193 | 38.0 | 9,700 | same id |
| `star-ms-a5v` | A5V | 1.88 | 1.785 | 12.3 | 8,100 | new |
| `star-ms-f0v` | F0V | 1.61 | 1.728 | 7.24 | 7,220 | new |
| `star-f-dwarf` | F5V | 1.33 | 1.473 | 3.63 | 6,550 | same id |
| `star-g-dwarf` | G2V | 1.00 | 1.012 | 1.023 | 5,770 | same id |
| `star-ms-k0v` | K0V | 0.88 | 0.813 | 0.457 | 5,270 | new |
| `star-k-dwarf` | K5V | 0.70 | 0.701 | 0.174 | 4,440 | same id |
| `star-ms-m0v` | M0V | 0.57 | 0.588 | 0.0692 | 3,850 | new |
| `star-m-dwarf` | M4V | 0.23 | 0.274 | 0.00724 | 3,210 | same id |
| `star-ms-m8v` | M8V | 0.085 | 0.114 | 5.25e-4 | 2,570 | new |

Evolved, pre-MS, compact and substellar — **each anchored to a named exemplar** so no
"typical" figure is invented:

| id | stage | Exemplar | M☉ | R☉ | L☉ | Standing |
|---|---|---|---|---|---|---|
| `star-pre-ms-ttauri` | pre-ms | TW Hya | 0.8 | 1.11 | 0.28 | ⚑ page unattributed — verify |
| `star-subgiant` | subgiant | β Hydri | 1.107 | 1.831 | 3.45 | Metcalfe 2024 |
| `star-red-giant` | rgb | Arcturus | 1.08 | 25.4 | 196 (derived) | Ramírez & Allende Prieto 2011 |
| `star-red-clump` | red-clump | Capella Aa | 2.5687 | 11.98 | 78.7 | Torres 2015 |
| `star-agb` | agb | Mira A | 1.0 ⚑ | 367 ⚑ | 8,880 ⚑ | Woodruff 2004 ranges; midpoints |
| `star-red-supergiant` | red-supergiant | Betelgeuse | 17.75 ⚑ | 764 | 87,100 | Joyce 2020 |
| `star-blue-supergiant` | blue-supergiant | Rigel A | 21 | 74.1 | 120,000 | Przybilla 2006 · Baines · Moravveji 2012 |
| `star-wolf-rayet` | wolf-rayet | γ² Vel (WC8) | 8.3 | 3.4 | 110,000 | ⚑ secondary table — verify |
| `star-hot-subdwarf` | hot-subdwarf | class (Heber 2009) | 0.5 | 0.2 ⚑ | 29.2 ⚑ | ranges; midpoints |
| `white-dwarf` | white-dwarf | Sirius B | 1.018 | 0.008098 | 0.02448 | Bond 2017 — replaces the unsourced 0.6 M☉ preset |
| `star-neutron` | neutron-star | PSR J0030+0451 | 1.34 | 1.83e-5 | 0 | Riley 2019 (NICER) |
| `star-black-hole` | black-hole | Gaia BH1 | 9.27 | 3.93e-5 (r_s) | 0 | El-Badry 2023 |
| `brown-dwarf` | brown-dwarf (L) | Luhman 16 A | 0.0338 | 0.102 | 2.2e-5 | Bedin 2024 — replaces the unsourced preset |
| `brown-dwarf-t` | brown-dwarf (T) | Mamajek T5V | 0.028 ⚑ | 0.101 | 1.12e-5 | mass borrowed from Luhman 16 B; the row's own L, R and Teff disagree by 9% (re-read verbatim) — oracle exempt |
| `brown-dwarf-y` | brown-dwarf (Y) | WISE 0855−0714 | 0.00413 | 0.1074 | 6.03e-8 | Luhman 2024 · Rowland 2024 |

Stage durations are sourced only on the solar track (Schröder & Smith 2008: ~1 Gyr subgiant,
~1 Gyr RGB, ~100 Myr core-He, ~20 Myr early AGB), for T Tauri (< ~10 Myr) and sdB (~100 Myr);
everything else is `null`, not guessed.

**Cut** (and why): separate carbon-star preset (no sourced exemplar; AGB + note), blue
horizontal branch, LBVs/magnetars/Thorne–Żytkow/quark stars (no honest static L/R),
accreting compact objects (accretion luminosity not modelled). Cool "red subdwarfs" are
metal-poor MS stars — use an MS preset; `star-hot-subdwarf` is the sdB class only.

### 2.4 Glyphs

`star_color` stays unseeded; `starTint()` derives it from T_eff for every stage with a
photosphere. Two new glyph motifs: **`neutron-star`** (small bright point with two short
beam ticks) and **`black-hole`** (dark disc with a thin bright ring). Glyph radius stays 20 px
for all stellar kinds (schematic map); size tiers are doc 10's job.

### 2.5 Body presets S4 adds (needed by recipes)

| id | Needed by | Standing |
|---|---|---|
| `eyeball` | Proxima b | Earth-like fields + `tidally_locked: true`; descriptor term "eyeball". No EWoCS term exists; glyph = Gaian with a sub-stellar ocean cap. All non-sourced fields provisional. |
| `hycean`, `super-puff`, `iron-world` | none yet (stretch) | Provisional presets only if S4 has room; EWoCS has no hycean term (nearest: Neptunian gas fraction + Aquatic). |

---

## 3. Part B — Orbital configurations (→ S5a)

### 3.1 What the code does today (verified)

| # | Finding | Where | Consequence |
|---|---|---|---|
| B1 | `hostStar()` stops at the **first** star, brown dwarf **or barycenter** up the parent chain | `derive.ts` `hostStar` | A planetary barycentre (Pluto–Charon) becomes Pluto's "host star": M ≈ 7e-9 M☉, L from the MS relation ≈ 0 → flux, temperatures, HZ all wrong |
| B2 | `isStar` is true for barycentres | `derive.ts` `deriveBody` | A planetary barycentre gets a star Derived panel (spectral "—", HZ) |
| B3 | A barycentre is drawn specially only as the **primary**; a non-primary barycentre is an ordinary heliocentric body, its members become "moons" with independent `map_angle_deg` | `layout.ts` `isPrimaryLike`, `moonsOf` | Phases of a pair are not locked; nothing says "barycentre" |
| B4 | Neighbourhood L1/L2 use `hostD.massEarth ?? 1` | `layout.ts` `buildNeighbourhood` | Planets of a **non-primary star** (α Cen A's planets) get L1/L2 distances computed as if the star were 1 M⊕ |
| B5 | Planets of a non-primary star live in that star's neighbourhood and inherit moon gating (zoom ≥ 1.8×) | `layout.ts` | S-type planets vanish at overview |
| B6 | Zones (HZ/frost) are drawn only for the primary | `layout.ts` zones | With a binary primary the drawn HZ is the circumbinary one; S-type HZs never show |
| B7 | `co-orbital-with` rel and EWoCS `Janusian`/`Circumbinary`/`Dioscuran` terms exist but nothing reads them | `body.ts`, `ewocs.ts` | Hooks already there |
| B8 | `eccentricity` max 0.99; `pointOnOrbit` assumes an ellipse | `body.ts`, `layout.ts` | No hyperbolic paths |

### 3.2 Data model: one `configuration` record type

New schema **`configuration` v1** (folder `configurations/`, code prefix `CFG`, icon `⟲`):

| Field | Type | Notes |
|---|---|---|
| `kind` | enum | `tadpole · horseshoe · quasi-satellite · barycentric-pair · rosette · resonance-chain` |
| `system` | ref system | required |
| `host` | ref body | tadpole, horseshoe, quasi-satellite |
| `center` | ref body (`kind: barycenter` or star) | barycentric-pair, rosette |
| `members` | ref body[] | ordered; rel `member-of` so each member's backlinks show the configuration |
| `params` | object | per-kind (below); schema uses `x-show-if: kind` so the form shows only the relevant ones |
| `maintained` | boolean | artificial station-keeping: an instability advisory becomes a "maintained" note |
| `notes` | text | |

Members keep their own records and orbital fields. A configuration **derives** geometry at
layout time; it never writes members' fields (view-never-writes holds). The one write is the
existing drag exception: dragging any phase-locked member writes `map_angle_deg` on the
**configuration's** `params.phase_deg`, so all members move together. While a configuration
exists, its members' own `sma_*`/`map_angle_deg` are ignored for drawing and badged
"derived by ⟨config⟩"; they remain as seeds if the configuration is deleted.

Existing `lagrange`/`lagrange_of` stay authoritative for L-point placement — **no migration**.

### 3.3 Kinds (params · derived · advisories · drawing)

| Kind | Params | Derived | Advisory | Schematic | True scale | Strip (doc 10 §4 hook) |
|---|---|---|---|---|---|---|
| tadpole | `point` L4/L5, `libration_deg` | parent/host mass ratio; arc | unstable if M_parent/M_host ≤ 24.96 | arc band on the host's orbit (or host's moon orbit) centred on the point ± libration | same, thinner | tick at host, "L4" |
| horseshoe | `delta_a_km`, `swap_period_yr`, `exchange` auto/true/false | exchange = mass ratio > 0.1 when auto (display rule, provisional) | — | member drawn on the host's orbit with a dashed horseshoe arc from L4 via L3 to L5; exchange: both on one orbit with a ⇄ mark and "Δa 50 km" | same | both in one slot, ⇄ |
| quasi-satellite | `loop_scale` | a_member = a_host (warn > 1% off); loop ≈ 2·e·a (drawing approximation, provisional) | loop inside host Hill radius ⇒ "that's a satellite" | small dashed **retrograde** loop around the host, member on it, label "QS" | loop in map units | tick at host, "QS" |
| barycentric-pair | `separation_au`/`_km`, `eccentricity`, `periapsis_deg`, `phase_deg` | a_i = a·m_j/(m_i+m_j); phases 180° apart; P (Kepler, m_i+m_j); "barycentre outside primary" when a_1 > R_1; **for star pairs**: S-type a_c per member, P-type a_c for the pair | §3.4; contact (separation < R_1+R_2) ⇒ label, no orbit | barycentre glyph (cross) on its orbit, members opposite each other in its neighbourhood; primary pair: two ellipses sharing the focus at origin | same, proportional | shared spine start (close pair) or own row (wide) — doc 10 §4 rule 1 |
| rosette | `n` 3–9, `mass_pattern`, `shape` circular/elliptical, `sma_au`/`_km`, `e`, `phase_deg` | member k at phase φ₀ + k·360/n; elliptical: same a and e for all, periapsis rotated 360/n per member, common focus at the centre (homographic motion — S5a hand-checks one case) | Klemperer 1962: every rosette is vulnerable ⇒ "unstable" unless `maintained`; star-centred ring ⇒ "stability unverified" | members on the shared circle/ellipses with a faint polygon joining them | same | one slot, "×n" |
| resonance-chain | `ratios` ("1:2:4"), `tolerance_pct` (2) | periods; actual ratios | off by > tolerance ⇒ "near-resonant, not in resonance" | ratio chip beside the innermost member's orbit, thin bracket across the chain | same | bracket + label |

Configurations are listed in the system record's editor ("Configurations" panel) and get the
usual record page. The S3 ASCII 2:1 loop may take any two-member chain as its source.

### 3.4 Binary stability advisory (Holman & Wiegert 1999)

With μ = m₂/(m₁+m₂), e = binary eccentricity, a = binary semi-major axis:

```
S-type (around one star):  a_c/a = 0.464 − 0.380μ − 0.631e + 0.586μe + 0.150e² − 0.198μe²
P-type (around both):      a_c/a = 1.60 + 5.10e − 2.22e² + 4.12μ − 4.27eμ − 5.09μ² + 4.61e²μ²
```

Valid for 0 ≤ e ≤ 0.7–0.8 and 0.1 ≤ μ ≤ 0.9; outside that the advisory says "outside the fit's
range" instead of a number. For S-type, μ is the **companion's** fraction. Oracle values for
the unit test (computed from the recipes' sourced inputs):

| Pair | S-type about primary | S-type about secondary | P-type |
|---|---|---|---|
| α Cen AB (a 23.299 AU, e 0.51947) | 2.74 AU | 2.49 AU | 86.6 AU |
| Sirius AB (a 19.8 AU, e 0.59142) | 2.17 AU | 1.48 AU | 78.9 AU |

Drawn as a dashed caution-tone circle at a_c in each member's neighbourhood (S-type) and
around the pair's barycentre (P-type). A body outside its S-type limit or inside the P-type
limit gets a warning. Sirius's showcase is exactly this: A's HZ (4.74–6.83 AU from L 24.74) lies
wholly outside its 2.17 AU limit ⇒ "no stable orbits in this star's habitable zone".

### 3.5 Barycentre fixes (part of S5a)

1. **B1:** `hostStar()` skips a barycentre unless it is the system primary **or** has a star /
   brown-dwarf child; it walks on to the next ancestor.
2. **B2:** a non-stellar barycentre derives mass (sum of members) and the pair values only.
3. **B3:** a non-primary barycentre draws the cross glyph; its members are placed by the pair
   configuration (phase-locked). Without a configuration, today's behaviour stands.
4. **B4:** neighbourhood host mass = `mass_sol × M_SUN_KG` when the host is a star.
5. **B5:** `kind: planet` bodies in a **star's** neighbourhood are exempt from moon gating.
6. **B6:** each star member of a pair draws its own HZ ring in its neighbourhood (S-type HZ);
   the primary's zones stay the circumbinary ones.

### 3.6 Nebula overlay and hyperbolic paths (owner ruling 3)

- **System v5**: `nebula: { kind: emission | reflection | planetary | dark | diffuse, label,
  radius_au, color, opacity, falloff }`. Drawn as a radial-gradient disc behind everything,
  radius via `mapAU` clamped to 1.2 × extent (a nebula is usually larger than the map);
  strip: a background tint. Region-level nebulae are out of scope (no starmap).
- **Body v6**: allow `eccentricity ≥ 1` when `periapsis_au` is set (hyperbolic / parabolic);
  `pointOnOrbit` draws the branch for |ν| < arccos(−1/e) out to the map extent; the Derived
  panel shows v∞ and "unbound". An unbound body with no parent may carry `map_x_au`/`map_y_au`
  for where it is drawn (rogue planet). Existing records are unaffected.

### 3.7 Ranking (full list with reasons in `12-data/configurations.yaml`)

| v1 (S5a) | later | never | already possible |
|---|---|---|---|
| tadpole arc + advisory · horseshoe/exchange · quasi-satellite · barycentric pair (double planets, binary stars, binary asteroids, nested triples) · rosette circular + elliptical · resonance labels · S/P-type advisory · nebula overlay · hyperbolic paths | peri/apoapsis + retrograde markers · Hill/Roche overlays · submoons · shepherd moons + ring gaps · belt/disc `gaps_au` · Oort shell · rogue planets as first-class · triple stability (Mardling–Aarseth) · companion flux on S-type planets · statites · hycean/super-puff/iron presets | ringworld as a free orbit (a rigid ring is not in orbit — megastructure location + advisory only) · live N-body | cyclers · orbital rings/skyhooks · halo/sunshade stations at L1/L2 · Dyson band (annotation ring) · multiple debris belts |

---

## 4. Part C — Starter systems (→ S5b)

### 4.1 Recipe file shape (doc 10 §7.4 "recipes")

Built-ins ship as data in `src/core/schema/builtin/recipes/*.ts` (same array-of-objects style
as `bodyPresets.ts`), loaded into the registry beside presets. A vault's own recipes (later,
doc 10e) live in `_recipes/<id>.yaml` with the identical shape. **Name clash:** the designer
already uses "recipe" for a module's `derive` expressions; these are `kind: record-set`
recipes, and the UI calls them **Starters** / "Record sets".

```yaml
recipe: 1                       # format version
id: starter-alpha-centauri
kind: record-set
title: "Alpha Centauri (starter)"
summary: "..."
options:                        # checkboxes on the install dialog
  candidates:  { default: true, label: "Include candidate and disputed planets" }
  speculative: { default: true, label: "Include speculative showcase bodies" }
showcases: [hierarchical-triple, s-type-stability, ...]   # chips on the picker card
records:
  - key: a                      # local key; `$a` anywhere else resolves to its new id
    type: body                  # any registered type, or `patch` (below)
    name: "α Centauri A"
    preset: star-g-dwarf        # optional; preset fields first, then `fields` over them
    gate: speculative           # optional; skipped unless that option is on
    status: confirmed           # → body.status (§2.2)
    src: akeson2021             # default source for every figure in this record
    fsrc: { sma_au: derived }   # per-field source override
    prov: { age_gyr: "midpoint of 7.2–7.8 Gyr" }   # provisional fields + reason ("*" = all)
    fields: { parent: $ab, sma_au: 10.656, sma_km: null, ... }   # null clears a preset field
    derive_note: "a_A = 23.299 · 0.9092 / 1.988"   # kept in provenance, shown on hover
  - { key: ann, type: patch, target: $sys, gate: speculative, fields: { annotations: [...] } }
```

**Install semantics.** (1) Resolve options → drop gated records. (2) Assign ids; resolve every
`$key` (order-free). (3) Preset fields, then `fields`, then `provenance = {src, fsrc, prov,
derive_note}` and `status`. (4) `patch` records merge `fields` into their target (arrays
append). (5) Name clashes in the vault get " (2)". (6) Everything is written as **one
history step** ("Install Alpha Centauri starter") through the S1 history layer, after a
snapshot (ROADMAP §4: bulk writes only after a snapshot). (7) Open the new system's map.
Recipes are never re-applied over an existing system; installing twice makes a second copy.
`sources.yaml` ships as `_tables/sources-astro.yaml` in the vault on first install so `src`
ids resolve for the provenance tooltip.

### 4.2 Showcase matrix (ruled)

| Feature | Sol | α Cen | Barnard's | Sirius | ε Eri | Nursery |
|---|---|---|---|---|---|---|
| Tadpole / trojans | **R** Jupiter swarms, 2010 TK7, Telesto/Calypso | | | | S b's L4 swarm | |
| Horseshoe / exchange | **R** Janus–Epimetheus | | | | | |
| Quasi-satellite | **R** Kamoʻoalewa | | | | | |
| Double planet (barycentric pair) | **R** Pluto–Charon | S Toliman pair in B's HZ | | | S twin planetesimal | |
| Binary / triple stars | | **R** AB pair + Proxima | | **R** A + white dwarf B | | |
| Stability advisory | | **R** limits 2.74 / 2.49 / 86.6 AU | | **R** HZ outside 2.17 AU limit | | |
| Resonance chain | **R** Laplace 1:2:4, Neptune–Pluto 2:3 | | **R** near 4:3 · 4:3 · 5:3 (labelled *not* resonant) | | | |
| Rosette | | | S Hexad, circular, maintained | | | F Rhomb, elliptical, maintained |
| Candidate / disputed | | **R** A candidate; Proxima c | note: refuted 2018 planet | | **R** mass contested; S hypothesised c | |
| Cycler | S Aldrin (real orbit family) | | | | | |
| Lagrange fleetyards, ecliptic station, orbital ring | S generic | | | | | |
| Megastructure | S orbital ring | | S Hexad | S collector swarm (Dyson band) | | F Rhomb |
| Multiple debris belts | main + Kuiper (derived edges) | | | S circumbinary belt | **R** three belts | F gapped disc |
| Compact / evolved star | | | | **R** white dwarf | | pre-MS star |
| Nebula · rogue · hyperbolic | | | | (honest: none) | | F all three |

R = real and sourced · S = speculative on a real system · F = fictional.

### 4.3 Per-system summary (records and figures in `12-data/systems/*.yaml`)

**Sol** — 8 planets (NASA fact sheet), Pluto–Charon as a barycentric pair (Pluto sits 2,415 km
from the barycentre, outside its 1,188 km radius), 11 moons (JPL mean elements; masses from
GM), main belt 2.065–3.278 AU (Jupiter 4:1/2:1, derived), classical Kuiper belt 39.55–47.91 AU
(Neptune 3:2/2:1, derived), 2010 TK7, Kamoʻoalewa, Jupiter swarms, 10 configurations; 7
speculative locations (fleetyards at Earth–Sun L4/L5, L1 halo observatory, Earth–Moon L5
station, Venus ecliptic station, one orbital ring, Aldrin cycler on a 1.598 AU / e 0.396 orbit,
derived from P 2.02 yr and aphelion 2.23 AU). Sun: definitional units, age 4.5682 Gyr.

**α Centauri** — primary = AB barycentre (1.988 M☉, L 2.004 summed); A and B on barycentric
ellipses (10.656 / 12.643 AU, e 0.51947, opposite phases); Proxima orbits the AB barycentre at
a = 8,200 AU, e 0.5 (Akeson 2021 periastron/apastron). Planets: Proxima d, b (confirmed; b uses
the new `eyeball` preset), c (disputed, gated); A candidate 120 M⊕ at ~1.1 AU (gated);
speculative Toliman double planet (0.8 + 0.6 M⊕, 150,000 km apart) at 0.85 AU in B's HZ.

**Barnard's Star** — M4V, 0.162 M☉ (Pineda 2021), ~10 Gyr, metal-poor, flaring. Four confirmed
sub-Earths d/b/c/e at 0.0188–0.0381 AU (minimum masses 0.19–0.34 M⊕); resonance chain labelled
"near-resonant, not in resonance". Speculative: the Hexad — six habitats in a maintained
star-centred hexagon at 0.07 AU (inside the HZ). A note records the refuted 2018 super-Earth.

**Sirius** — primary = AB barycentre (3.081 M☉); A (2.063 M☉, 24.74 L☉) and B (white dwarf,
1.018 M☉, 25,000 K) at 6.542 / 13.258 AU barycentric, e 0.59142. System age 230–242 Myr; B
became a WD ~120 Myr ago, so its planetary nebula (~10 kyr lifetime) is gone — stated in B's
notes. Speculative: a lava world at 0.8 AU around A, a 1.5 AU collector swarm (Dyson band
annotation + megastructure location), a circumbinary belt at 95–130 AU beyond the P-type limit.

**ε Eridani** — K2V, 0.82 M☉, age contested (1.1 Gyr vs older 200–800 Myr). Planet b at
3.53 AU, e 0.06, mass contested (~1.0 vs 0.63–0.78 M_J) — provisional. Belts: warm 1.5–2 AU
(Su 2017's other option, 3–4 AU, would overlap b), intermediate 8–20 AU, outer ring 65–75 AU
(Booth 2023). Speculative: hypothesised planet c at 45 AU, b's L4 swarm (M★/M_b ≈ 860 ≫ 24.96),
a binary planetesimal in the outer ring.

**Nursery (fictional)** — a T Tauri star (TW Hya-like preset) inside an emission nebula lit by
an off-map O star (low-mass stars do not ionise H II regions themselves); gapped disc 3–120 AU;
a forming giant in the inner gap (`Chaotian`); the Rhomb, an elliptical heavy-light Klemperer
rosette about its own barycentre at 9 AU (maintained); a Y-dwarf-mass rogue; a hyperbolic
interloper (e 1.8, q 2 AU).

### 4.4 Honesty flags (surface these in the UI, not just here)

- **Minimum masses.** Every RV planet (Proxima, Barnard's) is m sin i; provenance says so.
- **Placeholder classification.** Exoplanet surface/EWoCS fields come from the nearest preset
  and are provisional — nothing is known about Proxima b's surface.
- **Sirius has no nebula** and no known planets; its speculative bodies avoid the zones the
  advisory marks unstable, except where showing that instability is the point.
- **Contested figures** (ε Eri age and planet mass; Proxima c; α Cen A candidate) carry
  `status` and the competing values in `prov`.
- **Kamoʻoalewa** is real and currently visited (Tianwen-2 arrived 2026-07-04) — no fictional
  infrastructure attaches to it.

---

## 5. Work breakdown

One PR per session, in order S4 → S5a → S5b; each branches from current `main`. Scores use
ROADMAP §3.1 (Blast / Ambiguity / Physics / UI-verification / Reversibility / Context).

### S4 — Star types · `feat/star-types`

Scope: body v5 (`stage`, `spectral_type`, `stage_duration_myr`, `status`, `provenance`);
stage-aware `deriveStar`/`spectralClass`/warnings per §2.2; MS presets repointed and new ones
added from `star-types.yaml`; 15 exemplar presets; NS/BH glyphs; `eyeball` preset.

Acceptance:
- Kernel Teff from each preset's pinned L, R within 2% of `teff_k` (4% for Rigel; AGB and
  T5V exempt; 10% other brown dwarfs) — one vitest per row, generated from the YAML.
- A `stage: rgb` star shows no MS-lifetime warning; an orbit with periapsis < R★ warns
  "engulfed"; NS/BH show "no stellar HZ" and no HZ band on the map.
- Spectral labels: Arcturus preset → `K… III`; Sirius B preset → `D…`; WISE 0855 preset → `Y`.
- Body v5 round-trips; a v4 record with no `stage` derives identically to today (snapshot test
  on the Heliaris demo's derived CSV — byte-identical).
- Smoke: body editor shows the stage selector and the stage-dependent Derived panel.

Route: **1/1/3/1/2/1 = 9** → per ROADMAP §3.4 this is the **A/B calibration** run (Sonnet @
medium vs Opus @ medium).

### S5a — Orbital configurations · split in two

The v1 set plus the owner's nebula/hyperbolic additions scores 3/2/3/3/2/3 = 16 as one
session. Split at the natural seam:

**S5a-1 · `feat/orbital-configs`** — `configuration` v1 type; barycentric pair + fixes B1–B6;
S/P-type advisory; tadpole arc; horseshoe/exchange; quasi-satellite.
Acceptance:
- Pluto–Charon: Pluto's host star is the Sun (flux ≈ 1/39.48² of Earth's), Pluto drawn 180°
  from Charon about a cross glyph; barycentre-outside-primary flag set.
- α Cen fixture: A and B opposite about the origin; oracle limits 2.74 / 2.49 / 86.6 AU and
  Sirius 2.17 / 1.48 / 78.9 AU to 0.01 AU; a planet placed at 3 AU around A warns.
- Planets of a non-primary star are visible at overview (B5) and their L1/L2 use the star's
  mass (B4) — hand-computed test.
- Tadpole advisory fires for a host with M_parent/M_host ≤ 24.96 (hand-built case).
- Janus–Epimetheus draws as exchange; Kamoʻoalewa draws a retrograde loop about Earth.
- View-never-writes test passes; dragging a pair member writes only `params.phase_deg`,
  undoable as one step.
Route: **3/2/3/3/2/2 = 15** → **Opus 5.5 @ high**; Fable reserve (#3) if stuck.

**S5a-2 · `feat/orbital-configs-2`** — rosette (circular + elliptical, maintained), resonance
labels, system v5 `nebula`, body v6 hyperbolic + unbound placement.
Acceptance:
- Hexad: six members 60° apart on one circle; Rhomb: four ellipses, periapses 90° apart,
  common focus; advisory reads "maintained" for both and "unstable" when `maintained` is off.
- Elliptical rosette geometry checked once against a short 3-body integration in a test
  script (tolerance stated in the test).
- Laplace chain labels "1:2:4" with no warning; Barnard's chain warns "near-resonant".
- Nebula disc renders behind the map and in the SVG export; hyperbolic branch drawn with the
  star at the focus and correct asymptote angle arccos(−1/e) (unit test on the geometry).
- Schema bumps with `.v<N>.json` backups and migration round-trip tests.
Route: **2/2/2/3/2/2 = 13** → **Opus 5.5 @ high** (or Sonnet @ high if S4's A/B says Sonnet
holds at 13).

### S5b — Starter systems · `feat/starter-systems`

Scope: record-set recipe loader + install dialog (options, showcase chips) + installer
(§4.1); six recipes from `12-data/systems/`; `_tables/sources-astro.yaml`; provenance tooltip
on recipe-created fields (minimal: `src` title + `prov` reason; doc 10a badges come later).
Acceptance:
- Each recipe installs as one undoable step after a snapshot; undo removes every record.
- With `candidates` off, Proxima c and α Cen Ab are absent; with `speculative` off, no
  `status: speculative` record exists.
- Every installed numeric field has a provenance entry (`src`, `fsrc` or `prov`) — test walks
  all six recipes and fails on a bare number.
- Sol installs with no warnings except expected advisories; α Cen matches doc 10 §10's strip
  fixture description; Sirius shows the HZ-outside-stable-zone advisory.
- A **Cowork data review** (C-session) signs off the six recipes against `sources.yaml`
  before merge, especially `verify: true` rows.
Route: **3/1/2/2/2/2 = 12** → **Sonnet 5.5 @ high**. Higher than ROADMAP's 8 because the
installer is a new bulk write path (blast radius 3) that must go through the history layer.

---

## 6. Open — owner decides (batch)

1. **S5a split** (S5a-1 / S5a-2) replaces one S5a row in ROADMAP §2 — confirm.
2. **Routing changes:** S5b 8 → 12 (Sonnet @ high); S5a-1 at 15 is one point under the Fable
   line — keep Opus @ high with the Fable reserve as fallback, as planned?
3. **`white-dwarf` and `brown-dwarf` preset ids** change their figures to Sirius B and Luhman
   16 A. Existing records are untouched (presets are copied at creation) — acceptable?
4. **Name for record-set recipes in the UI:** "Starters" (proposed) vs "Recipes" (doc 10
   wording, collides with designer recipes).

## 7. Sources

`12-data/sources.yaml` holds every citation with URL and retrieval date; the main ones:
Mamajek 2022 MS table; Holman & Wiegert 1999; Klemperer 1962; Akeson 2021; Bond 2017;
Pineda 2021; González Hernández 2024 / Basant 2025; Beichman 2025; NASA planetary fact sheet;
JPL SSD satellite elements and physical parameters; Riley 2019; El-Badry 2023; Bedin 2024;
Luhman 2024; Torres 2015; Ramírez & Allende Prieto 2011; Joyce 2020; Przybilla 2006.
