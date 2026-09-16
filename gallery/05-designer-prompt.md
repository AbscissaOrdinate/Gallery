# Gallery — Phase 3 prompt: module / hull / craft designer

**To the implementer.** This is the full specification for Gallery's ship designer. The repo is `AbscissaOrdinate/Gallery` (Tauri 2 + React/TypeScript, commit `2d8fd9a`); read `gallery/01`-`04` in the project docs for what exists. Phases 1, 2 and 2.5 are done: records, OPML notes, CSV exports, SVG assets, Dynalist import, Worldsmith/EWoCS body physics, the schematic system map with semantic zoom and display modes, and a v0 craft budget panel.

Design intent: **NEBULOUS: Fleet Command** and **Terra Invicta** for the feel of the designer (slots, archetypes, a loadout you assemble and immediately see graded), **Children of a Dead Earth** for the escape hatch (you can define a new module whose numbers fall out of physics rather than out of a table). The tool never resolves combat. It answers "is this ship physically coherent, and what can it do."

Preserve everything phase 1–2.5 built. Schemas bump with the existing versioning mechanism (`.v<N>.json` backups, `"custom": true` opts out). The ~45 existing module and craft presets must keep working untouched.

---

## 0. Sourcing rule — read this before writing any numbers

Do **not** seed physical constants, drive performance, reactor specific power, radiator figures, or armor properties from recall. Look each one up and record where it came from. Primary sources: **Atomic Rockets / Project Rho** (`projectrho.com/public_html/rocket/`) for drives, power, heat and structure; **Terra Invicta**'s published component data for game-balanced equivalents; standard references for material properties. Every row in every table carries a `source` string (URL or citation) and, where the figure is a guess, `provisional: true`. A provisional figure renders with a marker in the UI. If a source cannot be found, leave the row provisional rather than inventing a plausible number — a wrong seed silently propagates into every ship built on it.

---

## 1. Scope

**In:** module archetypes and the expression layer; hull spine geometry; the external-slot / internal-volume split; the budget engine (mass, volume, Δv, thrust, power, heat, armor, crew, endurance, signature); constraint sets; ordnance and strikecraft as their own archetype; fleet records with tender-supported Δv; hull classification taxonomy; the three-pane designer UI; reconciliation of legacy authored ships; imperial unit toggle.

**Out:** combat resolution, damage models, tech trees, 3D rendering, multiplayer, the planet surface editor (separate phase), mobile hull drawing (mobile edits loadouts and modules only, per the existing decision).

---

## 2. Data model

### 2.1 Module record (schema v2)

Keeps the existing envelope. The stat block is authored by default; a recipe is optional and per-field.

```yaml
type: module
archetype: radiator          # see §2.2
stats:                       # the authored block — what the budget engine reads
  mass_t: 42
  volume_m3: 310
  length_m: 28
  power_in_mw: 0.4
  power_out_mw: 0
  heat_rejected_mw: 180
  crew_per_watch: 2
  mount: external            # external | internal
  slot_type: radiator        # external only
  slot_size: L               # external only; S|M|L|XL or numeric
recipe:                      # optional
  params:
    area_m2: 2400
    temp_k: 900
    emissivity: 0.92
    material: graphite-droplet     # → _tables/radiators.yaml
  derive:
    heat_rejected_mw: "emissivity * SIGMA * area_m2 * (temp_k^4 - T_ENV^4) / 1e6"
    mass_t: "area_m2 * table('radiators', material, 'areal_mass_kg_m2') / 1000"
locks: [mass_t]              # locked fields keep the authored value; the rest derive
```

Rules: if `recipe` is absent the module behaves exactly as today. If present, derived fields overwrite `stats` on every evaluation unless listed in `locks`. The UI shows a derived field with a small badge and the expression on hover, and a locked field with a lock icon plus the delta from what the recipe would have produced.

### 2.2 Archetypes

Each archetype is a TypeScript module exporting: its parameter schema, its derivation functions, its validation rules, its silhouette glyph, and its unit test fixtures. Ship them for: `drive`, `reactor`, `radiator`, `tank`, `kinetic_weapon`, `beam_weapon`, `launcher` (VLS/tube/rail), `magazine`, `hangar`, `berthing`, `life_support`, `cic`, `damage_control`, `troops`, `docking_clamp`, `cargo`, `structure`, `ordnance` (§5), and the sensor/EW families in §3.5: `sensor_optical`, `sensor_ir`, `sensor_radar`, `sensor_lidar`, `sensor_rf` (ESM/SIGINT), `sensor_particle`, `warning_receiver`, `comms`, `ew_suite`, `ew_emitter`, `decoy_launcher`, `fusion_processor`.

An archetype supplies the formulas for the 95% case. The expression layer (§2.3) is the escape hatch for the other 5% and for wholly new module kinds: a module may declare `archetype: custom` and derive every stat from expressions.

### 2.3 Expression layer

Implement a small, pure evaluator. **No `eval`, no `Function`, no JS sandbox.** Tokenizer → shunting-yard → AST → interpreter.

- Operators `+ - * / ^ %`, parentheses, comparison and ternary.
- Functions: `min max abs sqrt pow log ln exp floor ceil round clamp if`.
- Identifiers resolve to, in order: recipe `params`, other `stats` fields on the same module, constants (`SIGMA`, `G0`, `T_ENV`, `PI`), constraint-set parameters, and `table(file, row, column)`.
- Every value carries a dimension tag; the evaluator checks dimensional consistency and reports a readable error (`heat_rejected_mw expects power, expression yields power·length²`). Dimension checking is a warning, not a hard failure, since users will write shortcuts.
- Cycle detection across fields; deterministic evaluation order; a failed expression leaves the authored value in place and raises an `info`-severity violation.

### 2.4 Hull record (schema v2) — the spine

The hull is a side profile, mirrored about the long axis (vertically symmetric, as specified), with an independent beam giving an elliptical cross-section.

```yaml
type: hull
spine:
  length_m: 180
  stations:                      # x from bow (0) to stern (length)
    - { x: 0,   half_height_m: 2.0 }
    - { x: 40,  half_height_m: 9.5 }
    - { x: 150, half_height_m: 9.5 }
    - { x: 180, half_height_m: 6.0 }
  beam_m: 16                     # average; per-station override allowed
  beam_overrides:
    - { x: 150, beam_m: 24 }
structure_mass_fraction: 0.22
packing_efficiency: 0.78         # usable fraction of gross internal volume
sections:                        # internal volumetric budgets
  - { id: fore,  x0: 0,   x1: 60,  allowed: [magazine, vls, sensor_radar, cic] }
  - { id: mid,   x0: 60,  x1: 130, allowed: [berthing, hangar, damage_control, troops, cargo] }
  - { id: aft,   x0: 130, x1: 180, allowed: [drive, reactor, tank] }
armor_zones:
  - { id: bow, x0: 0, x1: 60, material: whipple-steel, thickness_cm: 4 }
external_slots:
  - { id: t1, x: 72, theta_deg: 0, type: turret, size: M }
  - { id: r1, x: 140, theta_deg: 90, type: radiator, size: L }
```

Geometry (implement in `src/core/hull/geometry.ts`, pure functions):

- Cross-section at station x is an ellipse with semi-axes `half_height(x)` and `beam(x)/2`, both linearly interpolated between stations.
- Gross internal volume `V = ∫ π · half_height(x) · (beam(x)/2) dx`, integrated numerically (Simpson, ≥200 panels).
- Usable internal volume = `V × packing_efficiency`.
- Wetted area from the elliptical sweep (Ramanujan perimeter approximation per station × dx). Feeds armor zone areas, radiator-blockage checks, and RCS.
- Presented cross-section (for RCS and for armor-zone area allocation) computed for bow-on and beam-on separately.

### 2.5 Placement: external slots vs internal volume

**External** — spinal mounts, turrets, radiators, comms, drop tanks, thruster arrangement, docking clamps, radar and antenna arrays. Sized, typed slots authored on the hull at `(x, theta_deg)`, drawn on the silhouette. A module fits if type matches and its `slot_size` ≤ slot size. External modules add mass and wetted area but consume no internal volume. Spinal mounts are a special external slot whose *length* must not exceed the hull's available axial run; exceeding it is an error-severity violation with the required length shown.

**Internal** — crew berthing, damage control, hangars, magazines, VLS body, drives, reactors, radar backends, CIC, intelligence, marines, cargo, tanks. Assigned to a hull `section`, constrained by that section's usable volume and its `allowed` list. Show per-section volume used / available as a bar. No bin-packing solver: volume totals only.

### 2.6 Craft, variant, vessel, fleet, taxonomy

- `craft` = a **class design**: hull ref, external placements, internal manifest, armor zone overrides, constraint-set ref, watch factor, lore body. `craft_class: ship | station | strikecraft | missile`.
- **Variants** via `extends: <craft id>` plus a sparse override of placements/manifest. Resolution is deep-merge; the UI shows inherited vs overridden.
- `vessel` (new type, v1) = an *instance*: name, pennant, class ref, commissioning date, status, `based-at` location ref, lore. Only a handful will exist; do not require one per ship. The map's military display mode reads vessels and fleets.
- `fleet` (new type, v1): entries `{ craft ref, count, vessel refs?, basing location ref }`, plus a `role` and lore. Feeds §6.
- **Taxonomy** `_taxonomy/hull-classes.yaml`: symbol (DD, CA, SSBN…), name, mass band per era, typical roles. A craft whose computed dry mass falls outside its declared classification's band raises a warn. The designer groups saved craft by classification.
- **Templates** reuse the existing preset mechanism: "Save as template" writes `_presets/craft/<id>.yaml` or `_presets/module/<id>.yaml`. No parallel system.

### 2.7 Tables

`_tables/*.yaml`, editable in-app, seeded per §0: `drives.yaml`, `reactors.yaml`, `radiators.yaml`, `armor.yaml`, `structures.yaml`, `propellants.yaml`, `sensors.yaml` (detector sensitivities, antenna efficiencies, band definitions), `ew.yaml` (technique effectiveness factors), and `reference_targets.yaml` (the target and observer classes of §3.5.2, each with IR flux, RCS, emitted RF power and size). Each row: `id`, human name, the figures, `source`, `provisional?`, `era?`, `notes?`.

### 2.8 Constraint sets

`_constraints/*.yaml`. Composition by `extends`, and a craft's metadata carries **era**, **faction**, and **corporation / design bureau**; the effective set is the composition of all three, in that precedence order (bureau overrides faction overrides era). Rules have `severity: error | warn | info`. **Nothing is ever blocked from saving** — an experimental craft that violates its era's ceilings saves with a prominent warning banner and an `experimental: true` flag it can carry deliberately. Constraint sets also supply engine parameters: `T_ENV`, reference sensor thresholds, target-acceleration assumption, closing-speed assumption, automation factor, life-support consumption rate.

---

## 3. Budget engine

Pure functions in `src/core/design/`, no React imports, fully unit-tested. Recompute on every edit; the result object carries both values and the list of violations with severity, message, and the field each points at.

**Mass.** Dry = structure (`structure_mass_fraction` × gross internal volume × structural density from `structures.yaml`) + all module masses + armor mass + crew consumables. Wet = dry + propellant.

**Volume.** Internal manifest vs usable volume, per section and total.

**Δv — staged, in kps.** Drop tanks are external modules with a `jettison_order` integer (0 = never jettisoned / integral). Compute the rocket equation stage by stage: at each jettison event, recompute `m0/mf`, sum the Δv contributions, and report total plus a per-stage breakdown with the acceleration at each stage start. Mixed drives use thrust-weighted Isp (already implemented in v0 — keep and extend). Propellant type mismatches between tank and drive are an error.

**Thrust and acceleration.** Thrust from the drive modules (sum, respecting any drive that is inactive in a given stage). Acceleration in g at wet mass, at each stage start, and at dry mass.

**Power.** Reported per operating mode (§3.5), each mode with two columns: **peak** and **sustained**. Every consumer declares both (a laser's peak draw and its duty-cycled average). Generation from reactors and any solar/RTG module. Deficit in either column is an error; a sustained surplus below 5% is a warn.

**Heat.** Two regimes: **steady-state** (sustained heat load vs radiator rejection at declared radiator temperature) and **burst** (peak load minus rejection, divided into the heat-sink capacity of any thermal-storage module plus the sensible capacity of coolant mass, yielding **minutes to thermal limit**). Show both. A ship with no burst capacity and a peak load above rejection reports "0.0 min" rather than an error, because that is a legitimate design.

**Armor.** Per zone (§2.4): user enters **thickness first**, areal density derives as `thickness × material density`, mass as `zone area × areal density`. Zone areas come from the wetted-area sweep, split by the zone's x-range and, for the bow zone, using presented cross-section. Armor consumes no internal volume but adds to the effective beam for drawing purposes.

**Crew.** Modules declare `crew_per_watch`. Total crew = `Σ crew_per_watch × watch_factor × automation_factor`, where watch factor is 1–3 per craft (default 3 for warships, 1 for stations and small craft) and automation factor comes from the constraint set. Berthing modules supply capacity; a shortfall is an error. Consumables mass = `crew × endurance_days × kg_per_crew_day` (constraint set). Endurance is reported in **crew-days** and in days at full complement.

**Signature — radar and EO/IR reported separately.**
- *EO/IR*: radiated power = radiator rejection + hull re-radiation; detection range against the constraint set's reference IR sensor by inverse-square against a stated minimum detectable flux. Report the range in the vault's distance unit (light-time default).
- *Radar*: RCS estimated from presented cross-section (bow-on and beam-on separately) with a material/geometry factor; detection range from the standard radar equation against the constraint set's reference emitter. Report both aspects.
- *RF*: the ship's own emissions — radar, comms, jammers — summed as radiated power per band, giving a passive-detection range against the reference ESM receiver. A ship that is quiet in IR and small in RCS can still be the loudest thing in the system.
Signature is computed **per operating mode** (§3.5) and all three figures are advisory, displayed with the assumption parameters visible on hover.

**Weapons.** Kinetic and beam modules declare: mass, volume/length, peak and sustained power, heat, crew, plus muzzle velocity, projectile mass, rate of fire, magazine or feed rate, traverse arc; beams additionally aperture, wavelength, pulse energy. Derived and shown: throw weight per minute, energy delivered on target at a reference range, and **effective range** against the constraint set's target-acceleration assumption (the "how far can you hit something pulling 0.1 g" figure) using flight time × target acceleration vs. target size. Beam effective range from diffraction spot growth vs. required fluence.

**Sizing helpers.** Authoring is hull-first (you set length, beam, tank fill; the tool reports Δv), with two buttons: **Solve for Δv** — bisection on total tank fill to hit a target Δv, reporting the required volume and whether it fits; **Fit hull** — grow length, then beam, to the minimum spine that contains the internal manifest at the current packing efficiency, preserving the profile's shape.

---

## 3.5 Sensors, electronic warfare, and emission control

This is a first-class subsystem, not a stat line. Space combat is a detection problem before it is a weapons problem, and the designer's job is to show the tradeoff: every sensor that looks further draws more power and sheds more heat, and every emitter that helps you see also tells everyone where you are.

### 3.5.1 Operating modes

Define **operating modes** as a craft-level concept, replacing the ad-hoc peak/sustained split with something the whole engine reads. Default modes, editable per craft: **Cruise**, **EMCON (passive only)**, **Combat (full emission)**, plus user-defined modes. Each mode holds a per-module duty setting: `off | standby | duty(fraction) | full`. The budget rail computes power, heat, burst minutes, and all three signature figures **per mode**, with a mode selector at the top and a compare view showing the columns side by side. A module whose mode setting exceeds available power in that mode raises an error scoped to that mode only.

This unifies three things that would otherwise be separate machinery: peak vs sustained power, burst thermal capacity, and emission control. Build it first; the rest of §3.5 hangs off it.

### 3.5.2 Sensors — external

All sensors mount externally (apertures need to see out). Each declares aperture or array area, band, power draw, heat, crew, and mass; each derives a **detection range against the constraint set's reference target classes** — capital ship burning, capital ship coasting cold, strikecraft, missile, decoy — reported as a small table in the ship's distance unit. Where the physics is aperture-limited, also derive **resolution** (Rayleigh criterion, λ/D) and the range at which the target goes from *detected* to *resolved* to *identified*, which is the distinction that actually matters operationally.

- **`sensor_optical`** — visible/panchromatic telescope. Detection by reflected light and by occultation against starfield; params aperture, focal ratio, sensor quantum efficiency. Derives angular resolution and detection range vs target albedo and phase angle. The NRO analogue: this is the imaging bird.
- **`sensor_ir`** — MWIR/LWIR thermal. The workhorse in vacuum: it sees radiators, drive plumes, and hull re-radiation. Params aperture, band, detector noise-equivalent flux, cryocooler power (which itself adds heat — make this explicit, it is a nice trap). Derives detection range vs each reference target's IR flux, with a separate, far longer range against a target under thrust.
- **`sensor_radar`** — active, banded (S/X/Ku). Params transmit power, antenna gain and area, wavelength, PRF, integration time. Derives detection range by the radar equation vs reference RCS, plus range resolution. Flag whether the array is also taskable by the EW suite (§3.5.3) and whether it supports **LPI** waveforms, which trade detection range for a reduced counter-detection range against the reference ESM receiver. An imaging (ISAR-equivalent) mode derives a cross-range resolution and a corresponding *identification* range.
- **`sensor_lidar`** — laser ranging and fine track. Short-ranged, precise; this is what produces a fire-control-quality track. Params aperture, pulse energy, wavelength. Derives ranging accuracy and maximum track range. Highly detectable when active.
- **`sensor_rf`** — passive ESM/SIGINT, the NSA/NRO analogue, split by intent into ELINT (emitter detection and classification) and COMINT (communications intercept). Params effective aperture, band coverage, sensitivity, channels. Derives detection range against the reference emitter (long — passive detection beats active detection by orders of magnitude, which the designer should make obvious), classification confidence, and **direction-finding accuracy in microradians**. DF gives bearing only: derive the cross-fix position error from the fleet's baseline (§6 supplies the geometry; a single ship gets bearing and no range). This asymmetry is the single most interesting thing in the whole subsystem — make sure the UI shows it.
- **`sensor_particle`** — gamma/neutron/neutrino detection. The Space Force NUDET analogue: detects nuclear detonations at long range and operating fission reactors at short range. Params detector mass, shielding. Derives detonation-detection range and reactor-detection range. Niche but cheap, and it gives a reason to run cold.
- **`warning_receiver`** — wide-FOV fast-response threat warning (missile-approach and laser-illumination warning). Low power, always on even in EMCON. Derives warning time against a reference missile closing at the constraint set's closing speed.
- **`fusion_processor`** — **internal**. The NGA analogue: turns detections into tracks. Declares maximum simultaneous tracks, track quality, and fusion latency; requires crew and power. A ship with more sensor throughput than processing capacity raises a warn stating the deficit. Also gates how much benefit the ship draws from fleet-shared tracks (§6).
- **`comms`** — external. Params aperture or antenna gain, transmit power, band, whether laser or RF. Derives link range at a stated data rate and, crucially, its own **counter-detection range**. Directional laser comms have a narrow interception cone; omnidirectional RF does not. A `COMSEC` flag (encryption/TRANSEC strength) sets resistance to the reference COMINT receiver.

### 3.5.3 Electronic warfare

- **`ew_suite`** — **internal**. The brain. Declares technique channels, technique library (noise barrage, spot jamming, DRFM false-target generation, meaconing, datalink disruption against missile guidance), processing power, crew. It **tasks the ship's own emitters**: it references specific `sensor_radar` and `comms` modules as its apertures. Validation: the tasked emitters must exist on the craft, must be available in the selected operating mode, and their combined power must be within budget for that mode. An EW suite with no tasked emitters is an error; more channels than tasked apertures is a warn.
- **`ew_emitter`** — **external**, dedicated high-power jammer with its own aperture. Params transmit power, gain, band coverage. Derives **burn-through range** against the constraint set's reference radar (the range at which the target's radar sees through the jamming), effective jamming radius, and the emitter's own contribution to the ship's RF signature — which should be enormous, and should be displayed as such. Jamming is a beacon; the designer must make that legible rather than let it be a free win.
- **`decoy_launcher`** — external, expendable. Reuses the ordnance mechanism of §5: decoys are `craft` records with `craft_class: missile` and an `ordnance_role: decoy`, carrying a declared spoof signature (IR, RCS, RF) and endurance rather than a warhead. The launcher declares capacity and reload. This gets you chaff, thermal decoys, active repeaters and towed decoys from one mechanism.
- **Hard-kill and soft-kill counterspace:** high-power microwave and optical dazzlers are `beam_weapon` modules with an `effect: disrupt | dazzle` flag and an effective range derived against the reference sensor rather than against armor. No damage model; the range figure is the output.
- **Protective measures** are module or hull properties, not modules of their own: frequency agility and ECCM rating on `sensor_radar`; radar-absorbent coating as an `armor.yaml` material property reducing RCS; radiator shrouding or directional radiator aspect as a `radiator` parameter that cuts IR signature in the shrouded aspect at a cost in rejection capacity. All three feed the §3 signature calculation.

### 3.5.4 The sensor/EW panel

Give this its own view in the designer, not just rows in the budget rail. For the selected operating mode, draw a one-dimensional range ruler on the ship's distance unit showing, as stacked bars: what this ship detects each reference target class at, per sensor; and what each reference observer class detects *this ship* at, per signature channel. The crossover points — where you see them before they see you, and where that reverses — are the design's actual verdict. Everything needed for this is already computed; it is a presentation layer over §3 and §3.5, and it is what will make the subsystem feel like NEBULOUS rather than a spreadsheet.



Dynalist-imported classes (Sword-of-State and the rest) carry authored numbers predating the engine. Import them as `craft` records with an `authored` block, and give the designer a **Reconcile** tab: a two-column table of authored vs computed (mass, Δv, thrust, accel, crew, power, heat), with the delta and a per-field "accept computed" / "keep authored" control. Authored values that are kept display with a marker everywhere they appear. No back-solving.

---

## 5. Ordnance and strikecraft

A distinct archetype, not a scaled-down ship. Modules may be composed of modules: a magazine or launcher declares a capacity and references an ordnance craft record; the parent's mass and volume budgets pull the child's *computed* mass and dimensions, and a change to the missile propagates to every ship carrying it. Guard against reference cycles.

**Shared fields:** total mass, length and diameter (these drive magazine, VLS and hangar volume consumption), **uniform** armor as a single areal density over swept area, initial and burnout acceleration in g, Δv in kps. Multi-stage ordnance uses the same jettison mechanism as §3.

**Missiles:** warhead — mass, and either yield in kt or penetrator mass × impact velocity; seeker type with acquisition range against a reference target signature; **reach** derived from Δv under a boost / coast / terminal profile using the constraint set's target-acceleration and closing-speed parameters, displayed in light-seconds and km beside the raw Δv.

**Strikecraft:** **sortie radius** from a Δv split, default 40% outbound / 20% maneuver / 40% return, adjustable per craft, displayed as radius plus loiter Δv. Refuelling extends radius only when a tender is present in the fleet (§6).

---

## 6. Fleet Δv and tenders

A `fleet` record reports:

- **Unsupported Δv** = the minimum Δv across combatant members (the fleet moves at its worst ship). Fleet acceleration = minimum across members at wet mass.
- **Supported Δv** = the distribution of tender propellant that maximizes the fleet minimum. Solve by bisection on a target Δv: for each candidate target, compute each ship's required propellant mass, subtract what it already carries, sum the shortfalls, and test against tender capacity — subject to each receiver's tank volume and a maximum top-off count per ship (constraint-set parameter). Report the achieved supported Δv, tender propellant remaining, and **the binding constraint by name**: which ship, and whether it was tank volume, top-off count, or tender exhaustion.

Auxiliaries are ordinary craft flagged `tender: true` with their transferable propellant declared separately from their own reserve.

---

## 7. UI

Three panes, matching the map's conventions (hover for detail, declutter by default, Nocturne theme with the navy→rust ramp already in `src/theme.css`).

- **Left — budgets and general information.** Class name, classification symbol, era/faction/bureau, constraint set. Then the budget rail: mass, volume by section, Δv with per-stage breakdown, thrust and accel, power (peak/sustained), heat (steady / burst minutes), armor by zone, crew and endurance, signature (radar, EO/IR and RF). An operating-mode selector sits above the rail (§3.5.1) and every power, heat and signature figure follows it. Each is a compact row with a bar; violations appear inline on the row they concern, colour-coded by severity. No modal error dialogs.
- **Centre — silhouette.** The spine rendered as the mirrored profile with the beam indicated. Drag station handles to reshape; drag external slots onto the hull; drop modules onto slots. External modules draw from an archetype glyph library (turret, radiator panel and droplet, thruster bell, dish, VLS block, clamp, tank), scaled by size class and mirrored with the hull; a module may override with a custom SVG. Internal sections shown as translucent bands with fill level. Export SVG into `assets/`, reusing the map's export path.
- **Right — module palette.** Grouped by archetype with search and a filter for "fits the selected slot / section". Shows the module's key stats inline. A "new module" button opens the archetype's parameter form with the recipe editor beneath it.
- **Tabs:** Design · Sensors & EW (the range-ruler view, §3.5.4) · Reconcile · Variants · Lore (the record's Markdown `body`, full-width editor) · Fleet (when opened from a fleet record).
- **Mobile:** loadout and module editing only — list-based assignment, budget rail, no spine editing, no drag-drop.

---

## 8. Units

Metric default: Δv kps, mass tonnes, thrust kN, power MW, heat MW, acceleration g (m/s² secondary), volume m³, length m, armor cm and kg/m², endurance crew-days, distance per the existing vault `distanceUnit` setting (light-time default).

**Imperial toggle** (vault setting, beside `distanceUnit`): length ft/in, mass short tons and lb, **thrust short tons**, armor in and lb/ft², volume ft³, velocity and Δv show kft/s beside kps. Power and heat stay MW in both modes. Endurance stays crew-days. Records always store metric on disk; conversion is display-only, as with `x-distance` fields today.

---

## 9. Migration, exports, versioning

Bump module→v2, hull→v2, craft→v2; add vessel v1, fleet v1. Use the existing upgrade path (`.v<N>.json` backups, `"custom": true` opt-out). Every existing preset must load and produce the same budget numbers as before the change — write a regression test that asserts this against the current demo vault. Extend `_exports/craft.csv` with the derived columns (dry/wet mass, Δv, accel, peak/sustained power, steady/burst heat, crew, endurance, IR and radar detection ranges) and add `_exports/module.csv` and `_exports/fleet.csv`.

---

## 10. Tests

Vitest, in the existing suite. Required:

1. Expression evaluator: precedence, functions, dimension checking, cycle detection, failure fallback.
2. Each archetype's derivations against hand-computed fixtures with the arithmetic shown in comments.
3. Hull geometry: volume and wetted area of a spine describing a cylinder and an ellipsoid, checked against closed-form values within 0.1%.
4. Staged Δv against an analytic two-stage case; thrust-weighted Isp against a hand case.
5. Heat: steady-state balance, and burst minutes against a hand-computed sink.
6. Crew, consumables, endurance round trip.
7. Signature: inverse-square IR, the radar equation, and passive RF detection against hand values, each evaluated in two operating modes to prove mode scoping.
7b. Sensors and EW: aperture-limited resolution and the detected/resolved/identified thresholds; ESM detection range exceeding the same target's active-radar detection range for a matched pair; DF cross-fix error from a two-ship baseline; jammer burn-through range; an EW suite tasking a radar that is off in the selected mode raises the scoped error; a decoy launcher pulls its decoy record's mass.
8. Fleet solver: a three-ship fleet with a tender, asserting the achieved supported Δv and the identity of the binding constraint, plus each of the three binding cases.
9. Ordnance composition: changing a missile's mass propagates to the carrier's wet mass; cycle detection rejects a self-referencing magazine.
10. Schema migration and preset regression (§9).
11. Headless Chromium smoke: open demo vault → craft editor → reshape spine → place external module → assign internal module → budgets update → export SVG → no page errors.

---

## 11. Deliverables

Working tree on a branch, `tsc` clean, vite build clean, all tests green, updated `gallery-app-src.zip` and `gallery-vault.zip` in the OneDrive Worldbuilding folder, plus a `gallery/05-designer.md` following the format of docs 00–04: what was built, what was verified, what the known limits are, and what comes next. Note explicitly in that doc which seeded table figures are `provisional` and what each sourced figure came from.

## 12. If something here is wrong

The specification above fixes the architecture, not the physics details. If a formula as written is dimensionally wrong, double-counts, or contradicts the source you find, implement what the source supports and record the deviation in `gallery/05-designer.md` rather than silently following the spec. Flag anything where the spec forces a design you believe is a mistake.
