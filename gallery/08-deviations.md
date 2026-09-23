# Gallery — Design suite: deviations from docs 05–07

Where the implementation departs from `gallery/05`, `06` or `07`, it is recorded here with
the reason. `docs/CLAUDE.md` §12 is the rule this file serves: *if a formula is
dimensionally wrong or contradicts a source, implement what the source supports and log the
deviation; if an architectural decision looks wrong, stop and ask instead.*

Authority order, for anything this file does not cover: `docs/UNITS.md` → `docs/CLAUDE.md`
→ `gallery/05` → `gallery/06`/`07`.

---

## Editor 1 — hull / craft / bus geometry

**Doc 06 §2's revolved fuselage becomes an elliptical section.** Doc 06 profiles a
`(station, radius)` revolve, giving circular cross-sections. `docs/CLAUDE.md` and
`gallery/05` §2.4 specify a side profile mirrored about the long axis with an *independent
beam*. CLAUDE.md governs: a station carries a half-height, the beam is separate, and
`V = ∫ π·a(x)·b(x) dx`. A hull with `beam_m = 2 × half_height` everywhere is the revolved
case as a special instance, so nothing is lost.

**Doc 06's `station_pitch_m: 2.0` becomes 3.0.** It has to match `cell_pitch_m` or imported
NEBULOUS mounts land between stations. The cell ruling is in `docs/UNITS.md` §4.

**Doc 07 §1's `Advisory` type is folded into `Violation`.** Doc 07 proposes a parallel type
carrying a severity, a domain and an anchor. That is a `Violation` with two more optional
fields, and two currencies mean two code paths and two renderers. `Violation` gained
`domain` and `anchor`; doc 07's `info | caution | violation` maps onto `info | warn |
error`.

**Doc 07 Task 0's `trust` and `units_checked` fields are dropped.** `docs/UNITS.md` §5 and
`docs/CLAUDE.md` both say `source` and `provisional` are the *whole* provenance vocabulary.
The useful half of Task 0 is kept: `npm run tables:conflicts` scans for >2× cross-source
disagreements and writes `_tables/RECONCILIATION.md`, which surfaces conflicts without
picking a winner.

**Docs 06 and 07 put designer code under `src/core/design/` and `src/core/hull/`.** It lives
in `src/core/designer/`, as `docs/CLAUDE.md`'s layout section says. Docs 06 and 07 also say
"SI internally"; `docs/UNITS.md` governs and it is metric-on-disk with the unit in the field
name.

**The v1 → v2 hull migration synthesises a barrel, not a ship.** v1 recorded no profile at
all. Rather than invent a silhouette, the migrator builds the constant section that
reproduces the authored volume *exactly* and sets `migration_review`. A wrong volume would
propagate into every budget; a boring shape will not.

---

## Editor 2 — ship

**v1's `loadout` is not converted into `fittings` and `manifest`.** v2 needs to know which
of six turrets carries the 450 mm gun. v1's `slot` was a *kind* — "turret", "internal" — and
the placement was never recorded, so converting would mean inventing one per line. A wrong
placement is worse than none: it draws a silhouette that is not the ship and passes a fit
check that means nothing. The lines are carried forward whole as **unplaced**, count in
every budget total exactly as before, and are reported once as waiting to be placed. Moving
them onto real slots needs the hull open in front of someone, which is the editor's job.

**`gallery/05` §3's berthing shortfall is not checked.** No module field supplies berthing
capacity, and NEBULOUS has no berthing compartment anywhere (`docs/UNITS.md` §4) — nothing
supplies crew capacity, only consumes it. Inventing a bunks-per-module figure would make the
check assert something untrue. It waits for editor 3.

**Magazines carry mass, since the anchors were ruled.** `_tables/munitions.yaml` still has
no mass per round, but three anchors were supplied on 2026-09-20 — 20 mm, 120 mm and 450 mm —
and everything else interpolates from them in log-log space (`docs/UNITS.md` §8). The one
thing still not done is charging the **stowage volume** to a section: which compartment holds
the rounds is not in the record, so the volume is reported and not spent.

**Spinal length is not checked.** `gallery/05` §2.5 makes a spinal mount's axial run an
error-severity check, but a module record carries a volume and no length. Editor 3 adds it.

**Signature is not computed.** `gallery/05` §3.5.2 needs `_tables/reference_targets.yaml`,
which is deliberately unfilled and must not be populated with invented signatures. The
per-mode `radiated_kw` figure — the half that needs no reference target — is computed, and
is what makes EMCON mean something.

**Peak vs sustained power is expressed through modes, not through two columns.**
`gallery/05` §3 asks every consumer to declare both. `gallery/05` §3.5.1 then says to build
operating modes *first* and hang the rest off them, which supersedes it: "peak" is the mode
where everything that can run is running, and "sustained" is the mode the ship cruises in.
A module declares one draw plus an optional `power_standby_MW`; duty fractions do the rest.

**Section `allowed` lists are module categories, not archetypes.** `gallery/05` §2.2
describes them in archetype vocabulary (`cic`, `magazine`, `weapon_support`), but no module
record carries an archetype — archetypes are authored by editor 3. A list in a vocabulary
the other side cannot speak checks nothing. The built-in hull presets use categories; a
hand-authored list in archetype vocabulary is reported as such, once per section, rather
than failing every module in it.

**One engine parameter still gates a check rather than being given a default.**
`automation_factor` and `kg_per_crew_day` were delegated and are now in the base set, both
provisional and both carrying their reasoning. `max_gimbal_deg` is not: the thrust-line check
needs to know how far a drive can vector, which is a design figure rather than a physical
constant, so the budget reports the angle a design requires and asserts nothing. The
geometric backstop — an arm longer than the hull's own half-height at the drive, which no
gimbal *inside the hull* could reach — needs no figure and always runs.

**Roll rate is not computed.** *(Superseded 2026-09-23: slots now carry a facing and tilt,
and a tangential nozzle rolls the ship — see "The owner's issue list" below.)* A thruster mounted radially fires radially, and a radial
thrust line through the axis produces exactly zero roll torque. Rolling needs a canted or
tangential nozzle, which the record has no way to describe, so reporting a roll rate would be
reporting a number that is structurally zero. Pitch and yaw are computed.

**Radiators are drawn in proportion to each other, not to a true area.** A real radiating
area needs a working temperature *and* an emissivity, and inventing either would put a
made-up constant into a drawing. What can be said without inventing anything is relative: a
12 MW loop beside a 120 MW loop is drawn at a tenth of the area, and the largest array on the
ship keeps its slot's own size class. When editor 3's radiator table gives true areas, the
proxy can be replaced without changing anything else.

**Two module fields were added ahead of editor 3 because the heat budget is wrong without
them.** `cycle` (`open` | `closed`) and `reject_temp_k` both implement rules `docs/UNITS.md`
§5 already states. Without `cycle`, an open-cycle torch's exhaust heat is counted as a
radiator load and every torch ship in the vault fails thermal; without `reject_temp_k`, the
life-support and reactor arrays are summed into one figure, which §5 forbids in as many
words. Four more — `power_standby_MW`, `radiated_power_kw`, and `bore_mm` / `barrels` /
`launch_cells` — are additive and are what editor 2 reads; they are listed in
`docs/UNITS.md` §6.

**A module's `propellant` and `slot` are now shared vocabularies.** `propellant` is a
`_tables/propellants.yaml` row id, so the tanks feeding a drive can be identified; a drive
naming its propellant in prose is reported as a vocabulary gap, never as the wrong fuel.
`slot` uses the same list as a hull's `external_slots[].type`, plus `internal` — they were
two different lists, which meant a point-defence mount could only call itself a turret.

**The regression gate's deliberate changes.** `tests/migration.test.ts` compares every
budget number against a baseline captured before the v2 schemas landed. Editor 2 changes
three of them on purpose, and each is asserted explicitly rather than excused:

| Figure | Before | Now | Why |
|---|---|---|---|
| `crew` | raw sum of module `crew` | watch model | `docs/UNITS.md` §4: `per_watch` figures are multiplied by the craft's watch factor. 23 on watch is a complement of 69; the old figure was the watch, mislabelled. |
| `heatOut_MW` | every module's waste heat | rejectable heat only | An open-cycle drive's exhaust heat is not a radiator load. The ships did not get cooler. |
| `warnings` | flat strings | `Violation[]` | One advisory currency. Both substantive warnings survive the move; the third counted v1 slot *kinds* and has no successor. |

The crew change is worth reading twice, because it is the one that looks like a
re-baseline and is not. The phase-1 engine's raw sum was the number of people **on
station**; under the ruled three-section, two-manned bill the complement is 3/2 of that, and
two thirds of the complement is on watch. The old figure comes back **exactly** as
`crewOnWatch`. The model did not move the number — it worked out which number it was, and the
gate asserts that identity rather than a new constant.

---

---

## Editor 2b and the UI pass — planned, not yet built

The plan is `gallery/09-ui-and-editor-2b.md`. Four departures it commits to, recorded here
because each is a deliberate reading of a spec rather than a straightforward implementation
of it.

**Doc 07 §2's "one frame" becomes a shell with per-editor slots, not one configured
component.** §2 asks that all five editors use one frame so the suite reads as one tool. The
literal reading — a single component that renders every editor — would need a discriminator
and would branch five ways by editor 5. Instead `DesignShell` takes named slots and each
editor supplies its own panes, while the *shared* parts (advisory list, budget rail, fleet
strip, canvas viewport) are shared code rather than shared markup. The constraint that keeps
this honest is written into the file: `DesignShell` may not import from
`src/core/designer/` beyond `Violation` and `HullScene`, so it cannot learn which editor it
is hosting.

**Selection is a per-editor union, not one shared type.** The same external-slot id denotes a
*mount* to the hull editor and a *fitting* to the ship editor; those are different objects
with different inspectors. A shared `{kind: string}` would blur exactly the distinction doc
07 §3 draws when it says the ship editor cannot change what the hull editor owns — and it
would turn four compiler-checked inspector branches into four string comparisons. Only the
cross-editor deep link is stringly typed, one field wide, because `src/ui/state.ts` must not
import its own leaves.

**Beam-mounted parts are drawn from a plan view, at reduced emphasis.** `gallery/05` §2.4 and
`docs/CLAUDE.md` both describe external modules as *silhouette-plane parts mirrored
vertically*, which is true of dorsal and ventral mounts and silent about the beam —
`partsForHull` consequently skipped port and starboard slots entirely, so a side battery drew
nothing. A part on the port beam, viewed from port, is seen down its own outward axis: that
is its plan view. It draws at the hull's mid-height under a distinct role so it reads as a
fitting on the far side rather than as hull structure. A `plan` render mode follows from the
same outlines, and half of it already exists — `outlinePath(hull, samples, useBeam = true)`
draws the plan hull outline from `beamAt()/2`.

**Part size grows a principal axis, with per-family exceptions.** Uniform scaling made an XL
gun as fat as it was long. Ruled 2026-09-20: a bigger gun lengthens its barrel *and* expands
its gunhouse; a bigger VLS gets more tubes at a fixed tube size; a laser and a spherical tank
are spheres and stay spheres; a radiator extends further outward and never wider. Radiators
additionally carry a `radiator_aspect` in the style kit, clamped at or above 1.0 so the
taller-than-wide rule cannot be violated from the UI. `membrane` is the one family that
changes shape as a result — it was the only one already wider than tall, at 0.75.

**Spinal mounts reuse the side profile.** `SLOT_PART` maps `spinal` to no part, so a spinal
weapon draws nothing. It will map to the fitted weapon's own family, so a spinal railgun
reads as a long gun along the axis. Purpose-built spinal shapes — a weapon that *is* the
hull's length rather than a mounting on it — are deferred.

### Step 2 — part glyphs, built 2026-09-22

What `gallery/09` §1 asked for is in `hull/parts.ts`, with the readings below. Each is a
place where the plan could be read two ways, or where building it turned something up.

**The view is its own axis, not a third `RenderMode`.** §1.4(b) adds `"plan"` beside
`silhouette` and `schematic`. But a plan *schematic* (sections, slots, labels, from above)
and a plan *silhouette* are both meaningful, and a third mode would forbid one of them. So
`RenderOptions.view` is `"profile" | "plan"`, the same vocabulary as the `plane` field the
plan specifies for `Appendage`, and it combines with either mode.

**§1.4(b)'s sentence is implemented as §1.4's geometry, which reads the other way.** §1.4
argues that a mount seen from directly outboard is seen down its own axis, i.e. its plan.
Applied to the view from above, that makes a **dorsal** mount the one seen down its axis
(plan glyph, over the centreline) and a **beam** mount the one seen side-on (profile glyph,
standing off the beam edge). §1.4(b) says the reverse — beam mounts draw their plan glyph,
dorsal ones edge-on — which contradicts the argument it follows from. The geometry won.

**`fitted:far:<kind>`, not `fitted:beam:<kind>`.** The outline-only, dashed treatment §1.4(a)
asks for a beam mount in the side view turned out to be needed three times: a beam mount
side-on (port and starboard project onto the same place, and which is nearer is not
something the drawing can know), a ventral mount from above (under the hull), and a spinal
mount in either view (inside it). It is one idea — a hidden line — so it is one role.

**A beam mount sits at `a·cos θ`, not at mid-height.** Equal at exactly 90°. At 75° it is
a quarter of the way up the side, which is where it is. The same projection now places the
renderer's slot markers and the canvas's drag handles, through one `slotAnchor()`; before,
a slot at 15° drew its marker on the axis and its handle on the skin.

**A mount at 345° was drawn upside down.** `partsForHull` took everything from 135° round to
360° as ventral, so the Sword hull's turrets at 315° and 345° hung under the keel. Dorsal
and ventral now go by the sign of `cos θ`.

**Radiator growth is read literally, and the result is slender.** *(Superseded 2026-09-23:
the width is fixed per panel, not per array — see below.)* §1.2: a radiator "extends
further outward and never wider". So the along-hull length is fixed at 4 m for every size,
the height grows with the size class, and an S radiator — which would otherwise come out
wider than tall — is floored to square. An XL fin array is therefore 4 m long and about
19 m tall, and a UJCN-style three-panel array fits three 1.3 m fins into those 4 m. That is
what the ruling says; it may not be what was meant, if "wider" meant *each panel* rather
than the array. It is one entry in `GROWTH` (`radiator: { along: 0, out: 1 }`) — **the
vault owner's call**.

**`radiator_aspect` keeps each family's character by meeting it halfway.** §1.3 asks each
family to scale "toward" the kit's aspect rather than be replaced by it. Implemented as: the
default family (`panel`) draws at exactly the kit's aspect, and every other family sits at
the kit's aspect times the square root of its old ratio relative to `panel` — halfway in log
terms — floored at 1. At the default 1.35 that gives fin 1.45, panel 1.35, hoop 1.32,
spine-array 1.29, droplet-boom 1.27, membrane 1.05. Membrane is now taller than wide, as
ruled, but only just; it is the squattest family by character. The style schema is at
version 2 for the new field.

**Growth rates the ruling did not state.** The table in §1.2 names the principal axis for
masts, nozzles and point defence but not the secondary one. They are set at half rate; the
arm (bandit) is `{ along: 1, out: 0.75 }`; plasma, particle beam and CIWS grow like a gun,
since each is a barrel with a body behind it. These are styling choices, not rulings, and
all of them are in the one `GROWTH` table.

**Launchers are a block, not a row.** More cells at a fixed pitch (§1.2) laid in one line
made a 16-cell VLS 16 m long. Cells and tubes are laid out as a bundle about twice as wide
as it is deep — which is exactly the rocket reference: 18 tubes, three rows side-on and six
abreast from above. Side-on only the row along the hull shows. When the module names no
count, the size class does: 2/4/8/14 cells, 3/6/12/21 tubes. A 256 cap guards against a
typo, not against a big launcher.

**Where the polity's mount family shows.** On a gun it *is* the gunhouse, as before. On the
reference-drawn laser, rocket, bandit and plasma it is the footing, where each reference has
its own base plate. CIWS, VLS and the particle beam have no mounting and ignore it. A
point-defence slot now draws as the CIWS — the reference is of the point-defence gun.

**An appendage draws only in the plane it was authored in.** A hand-drawn outline says
nothing about what the part looks like from elsewhere, so hull appendages (the greeble
collars, a hand-authored radiator wing) are absent from the plan view rather than guessed.
Fitted parts are generated in both views, so they always appear. The canvas also hides the
spine's drag handles in plan view: they set the half-height, and from above that is not
what is on screen.

**A second unit bug, strokes this time.** `toSvg()` wrote stroke widths and dash lengths —
screen pixels, as the canvas treats them — straight into a viewBox in metres, so every
outline in an export was `pxPerMetre` pixels thick: 7 px in the style probe, enough to drown
the new part detail. Same fix as the labels, same kind of test.

**The style probe uses the app's theme.** It carried its own hex stand-ins for the tokens,
which is a second palette. It now inlines `src/theme.css`.

### Step 3 — hull classes, built 2026-09-22

Eleven presets in `hull/classes.ts`, the reference measured by
`scripts/measure-fleet-reference.mjs`, and a class picker wherever a hull's spine is empty.

*(The CL length, the heights, the armour and the structural mass below were all revised on
2026-09-23 — see "The owner's issue list". What follows is the step as built.)*

**The measured ladder corrects the plan's in one place that matters: the CL is bigger than
the CA.** The reference draws every navy's ships with one icon per class at one common scale —
widths agree across all four fleet colours to within a pixel — so the measurement is clean.
Anchored on the destroyer icon at 138 m and snapped to the 3 m grid:

| class | plan's starting figure | measured | icon length |
|---|---|---|---|
| CG | ~200 m | **183 m** | 40.2 px |
| CA | ~225 m | **198 m** | 43.8 px |
| CL | ~185 m | **237 m** | 52.4 px |
| CV | ~260 m | **270 m** | 59.9 px |
| BB | ~300 m | **315 m** | 69.4 px |

CV and BB land within 5% of the plan; CG and CA come in shorter; the CL is the reversal. The
presets follow the measurement, as the plan asked. If the setting's CL really is the smaller
ship, the reference is the thing to correct, not the preset.

**Five classes cannot be measured, and say so.** The chart has no frigate, monitor,
strikecraft or missile, and it draws DD and DL with the *same* icon — each navy's smallest
escort. Their lengths are the plan's own (FF 111, MN 150, DL 165, SC 21, MSL 8; 110 and 20
moved onto the grid), and each shape is derived from a named source rather than drawn:
DL is the anchor with a 27 m magazine plug ("a stretched DD: more magazine"); FF and SC are
the anchor scaled uniformly; MN is the measured CV profile — the reference's lowest L/D —
at 150 m; MSL takes the L/D of 10 from the vault's existing `missile-body` preset. The plan
also calls the FF "thin". Uniform scaling keeps the DD's L/D, and anything thinner would need
a figure nobody has given.

**Heights are anchored on the destroyer too, not read straight off the icons.** The icons are
pictograms and draw hulls thick: at the length scale, the destroyer icon is about twice the
height of the 138 m destroyer it stands for. Read raw, every measured class would be twice
as fat as the anchor it is scaled from. So the destroyer icon's mean thickness is made the
anchor's mean height, and every class keeps its proportions *relative to the destroyer*
exactly as drawn — the CV and the monitor at L/D 5.6 against the DD's 10.1, the DL at 12.1.
That is a choice about what the icons mean; reading them literally is the alternative, and
would double every measured class's volume.

**The plan-view shape is the anchor's too.** The reference is side views only, so beam comes
from the anchor's own ratios: 0.96 of the greatest height, reached a fifth of the way aft of
a narrow bow.

**No class carries a structural mass or cost.** Both are absolute figures the budget reads
directly, and scaling the anchor's would need a law for how structure mass grows — with
volume, with wetted area — which is a physical claim nobody has made. Every class but the
anchor leaves them unset, and the budget's existing assumption line says so. **Armour** is
the anchor's own 6 cm of composite on every class; a class's character shows in its
*coverage* — the BB's belt between its bands, the monitor armoured end to end, the CA's nose
over its forward battery. Per-class thickness is the vault owner's to give. The missile is
unarmoured and carries no external slots (its motor is internal), deliberately.

**MN is the monitor's code.** The open question that asked whether it should be `BM`, as the
`monitor` craft preset still says, was withdrawn from `gallery/09` on 2026-09-22 without an
answer recorded; `MN` is what the plan's list of eleven uses. The two presets disagree until
someone picks.

**The reference draws radiators as blocks, and the step 2 ruling makes them spikes.** Every
measured radiator block is about 5 px (≈ 23 m) along the hull; under the literal "never
wider" reading a radiator is 4 m long at every size. The presets size radiators by how far
the reference's blocks reach (L for the CA and CG, XL for the rest) and put one slot per
block, where the reference has them; the *drawn* shape is the generator's. This is the
clearest evidence yet on the open radiator-growth question above.

**The class picker only fills an empty spine.** It appears in the hull editor while the hull
has no length or fewer than two stations, and fills the geometry fields (spine, sections,
armour, slots, appendages, packing) — never the author's links, style or bus. A class is a
starting point; replacing a drawn hull with one would be a destructive edit the editor has no
undo for, so it is not offered.

### The owner's issue list, resolved 2026-09-23

**Radiators are a fixed width per panel.** Three radiators in a set are three times as wide
as one, not one radiator cut into thirds. A panel is 4 m along the hull at every size; a
bigger size class makes it taller; `radiator_panels` sets how many stand side by side.
Every family repeats per panel (a spine-array's boom runs the whole set). This replaces step
2's literal reading, and the presets now draw the reference's wide radiator blocks.

**Mounts point.** Slots gained `facing_deg` (every mount) and `tilt_deg` (thrusters and
drives), set in the hull editor's slot inspector with a Flip button for a gun that has to
fire astern and Along/Radial for a nozzle. Drawing: where a mount is seen down its own axis
(beam mounts side-on, dorsal ones from above) its plan view is turned by exactly the facing;
side-on, a turned mount is drawn at whichever of fore or aft it is nearer, because an exact
3D rotation needs a 3D form the generators do not have. Nozzles are round, so they are drawn
exactly in every view, foreshortened, and as their bell mouth when they point at the eye.

The **`thruster` slot now draws radial by default** — the attitude budget always assumed
radial thrust, and the drawing showed an aft-pointing bell, which was the wrong half. The
attitude budget now takes `r × F` for every thruster and ring member, so pitch and yaw are
exactly as before for radial nozzles, and **roll is computed** once any nozzle is turned
tangential. Tilt is how a nozzle is mounted, not how far it gimbals: `max_gimbal_deg` is
still unsupplied.

**Rings.** A slot's `count` (1–8) makes it a ring spaced round the hull from its clock angle
— the radial tank placement, which the ship's tank collar already assumed for balance but
nothing drew. Every member is drawn, marked on the schematic and checked for fouling; a
click on any selects the slot; a fitting in a ring slot is charged once per member on the
thrust line; and a ship's tank collar draws at the ship's count.

**VLS cells** draw the fitted module's own `launch_cells`, cell for cell. With no module the
size class decides: S 8 (4 × 2), M 16 (6 × 3 less two), L 32 (8 × 4), XL 48 (10 × 5 less two)
— which the existing bundle layout already produced exactly.

**Plasma, bandit and rocket are weapon families, not module types.** A module's category
(`weapon-kinetic`, `weapon-missile`, …) drives the budget; its optional `weapon_family`
decides the silhouette. The field existed; no preset used it. Two presets now do, each from
its `_tables/mounts.yaml` row: the RL18 rocket launcher and the T81 plasma cannon (a
magazine-fed `weapon-kinetic`, drawn as `plasma`). The table has no bandit row, so there is
no `arm` preset — the family works on any module that sets it.

**The structural-mass law** (`docs/UNITS.md` §9) replaces typed structure mass and cost:
internals from the internal density, armour from the zones, a rated displacement from the
usable volume, and the structure fraction between them. Constants are base-set parameters,
the two calibrated ones provisional. The DD anchor was retooled to it: 0.5 cm/m, 22 cm of
composite end to end with the bow taper at 17.6 cm, and no typed figures. It rates at 8,000 t
with a third of that hull; the Burke's ~9,900 t would be a design density of 0.885. The base
set on disk now merges parameter by parameter — without that, the law's constants (and, as
it turned out, the crew parameters delegated on 2026-09-20) never reach a vault seeded before
they existed.

**The class presets were retooled to the NEBULOUS examples.** Each carries its internal
density and is armoured end to end at its thickness, the bow taper at four fifths (credit for
the slope, not overdone). Heights were left to the implementer; they are **solved so each
class rates at its example mass**, keeping its length and its profile's shape. Every class
then carries its own structure — 28% of the FF is hull, 34% of the DD, 83% of the BB and 86%
of the MN — and raises no warning. The price is that the big and heavily armoured classes
come out slender: BB L/D 19, CV 18, MN 15. The plan's "notably fat" CV and MN are not
compatible with 19,000 t and 5,000 t at those lengths and that armour; a fat CV needs a lower
density for its hangar volume, and a fat monitor at 48 cm and 5,000 t is about 75 m long,
not 150. Both are the vault owner's call.

**CL is the light cruiser**, so the chart's long CL icon is the chart being off: 186 m, the
plan's ~185 on the grid, with the icon's profile. **MN** is the monitor's code. The
strikecraft has no example row, so its nose zone carries no thickness rather than the
destroyer's.

## Still deferred

- **Variants** — the hull schema's `parent` ref and the ghost overlay exist; the four legal
  deltas (stretch plug, section swap, mount refit, appendage refit) and the clean-sheet-fork
  prompt do not. Deferred by the vault owner, 2026-09-20.
- **Fleet sheet** — every hull of a polity at common scale. Same deferral.
- **`gallery/05` §2.1's nested `stats` / `recipe` / `locks` block** and the `_MW` → `_mw`
  renames. Editor 3 is the first thing that reads them.
- **The `vessel` and `fleet` types**, and `_taxonomy/hull-classes.yaml` (§2.6).
- **Thermal shadow** — panel-to-panel view-factor blocking and drive-plume impingement
  (`gallery/07` §1). The *radiation* shadow is built; the thermal one is not.
- **Sizing helpers** — "Solve for Δv" and "Fit hull" (§3).
- **Purpose-built spinal glyphs** — distinct from the side-mount profile a spinal weapon will
  borrow. See above.
- **Magazine stowage volume charged to a section.** Round mass and volume both compute
  (`docs/UNITS.md` §8); which compartment holds the rounds is not in the record, so the
  volume is reported and not spent.
- ~~**Roll rate.**~~ Computed since 2026-09-23, from tangential nozzles. A radial thruster firing radially produces exactly zero roll torque, so the
  figure would be structurally zero. Needs a canted or tangential nozzle the record cannot
  describe.

## Known bugs — both fixed, 2026-09-22 (`gallery/09` §4 step 1)

Both were found by reading the code for `gallery/09`, and neither was caught by any existing
check — the vitest suite is core-only (`environment: node`), and the headless smoke scripts
did not touch either path. Both now have coverage, because "nothing asserted which consumer
was right" is what let the first one exist at all.

- **Hull-canvas labels rendered at 2.2–3 CSS pixels at every zoom level.** `render.ts`
  authored `el.size` in metres; `HullCanvas` read it as screen pixels. The round trip
  cancelled exactly, so the label was the one thing on the canvas that never grew.

  **Fixed by moving the authored unit to screen pixels**, not by changing the canvas — its
  `scale(size)` was already the right formula for a pixel-valued size, and screen-constant
  labels are what a technical drawing wants and what `SystemMap` already does. Sizes now come
  from an exported `LABEL_PX` (section 13, slot 11, CG 12, ruler tick 10) which both consumers
  read, so the default can no longer differ between them the way `?? 11` and `?? 3` did.
  `toSvg()` divides by `pxPerMetre`, its viewBox being in metres, and consequently renders
  every label at its authored pixel size at *any* export scale — it was 8.8–12 px at
  `pxPerMetre: 4` and 13–18 px at 6, i.e. legible by accident rather than by contract.

  Labels also moved off `--navy-200`/`--navy-300`, which are surface tints, onto
  `--text-muted`, and gained `SystemMap`'s hover-enlarge: a text element carries an `owner`
  naming the element whose hover enlarges it, since a label is never itself a pointer target.

  **Not done, and now visibly wanted:** label collision. Six turrets sharing a station draw six
  labels on top of each other. `SystemMap` has a `placeLabels()` collision placer; the hull
  canvas has nothing. `gallery/09` §3.1 lists this as "consider semantic zoom … worth it once
  there are more than a handful of slots", and the UJCN pattern hull is past that point.

- **Clicking an armour belt blanked the hull inspector.** Zones were pickable as
  `kind: "zone"`, `Inspector` had no `zone` branch, and the flow fell through to the appendage
  lookup and returned `null`.

  **Fixed with a `ZoneInspector`**: from, to, material, thickness, plus areal density, belt
  area and zone mass derived. Armour zones also gained an outliner group — the branch was
  otherwise reachable only by hitting a 2 px belt stroke, which is not an editor. The derived
  figures repeat `armorMass()` from `ship/budget.ts` rather than calling it, that function
  being private to the ship budget and taking a whole `ShipContext`; both read
  `density_kg_m3` from `_tables/armor.yaml` over `wettedArea`, so they agree by construction.
  If that stops being true the shared formula belongs in the kernel.

  A material the `armor` table does not carry still saves, is still listed in the select, and
  is reported as having no density rather than silently contributing zero. A provisional
  density carries the `⚠` marker onto the areal density and the zone mass both, per
  `docs/UNITS.md` §5 — no armour row is provisional today, so this is the rule honoured
  ahead of a row that needs it, not a live marker.
