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

**Roll rate is not computed.** A thruster mounted radially fires radially, and a radial
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
