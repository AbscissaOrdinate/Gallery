# Gallery — Units

Authoritative. Where `gallery/05-designer-prompt` §8, `gallery/06-hull-editor.md` or
`gallery/07-editor-suite-spec.md` disagree with this file, this file wins. (Docs 06 and 07
say "SI internally" in places — that is wrong; the canonical units below govern.)

## 1. Rules

1. **Metric on disk, always.** Every record and every table stores the canonical unit in
   §2. Imperial and light-time are display-only conversions at the UI edge, exactly the way
   `x-distance` fields already work.
2. **A field's name carries its unit.** `mass_t` is tonnes, `mass_kg` kilograms,
   `heat_rejected_mw` megawatts, `ev_kps` km/s. Name a new stat with the suffix for the unit
   it is actually in. The expression layer reads the suffix — an unsuffixed numeric stat is
   a bug, not a style choice.
3. **Never hand-roll a conversion inside an expression.** Declare what the expression
   produces and let the engine convert:

   ```yaml
   derive:
     heat_rejected_mw:
       expr: "emissivity * SIGMA * area_m2 * (temp_k^4 - T_ENV^4)"
       unit: W
   ```

   A bare `/ 1e6` hides the conversion in a literal, which carries no dimension, and the
   scale check then cannot see it. A plain-string entry means "already in the field's own
   unit". **This supersedes the `/ 1e6` shown in the designer prompt §2.3 example** — that
   example predates the rule.
4. **Dimensional mismatch is a warning, not a failure.** The evaluator reports
   `heat_rejected_mw expects power, expression yields power·length²` and leaves the authored
   value in place. Users write shortcuts; the tool says so and carries on.
5. **Provisional figures stay visibly provisional.** A `_tables` row with
   `provisional: true` renders with a marker everywhere it reaches the UI, including inside
   any derived value computed from it.
6. **Do not seed a constant or a physical figure from recall.** Look it up, record the
   `source`, or leave it `provisional`. A wrong seed propagates silently into every ship.

## 2. Canonical units

| Quantity | Unit on disk | Suffix | Notes |
|---|---|---|---|
| Mass | tonne (1000 kg) | `_t` | `_kg` where the natural magnitude is small |
| Length, beam, station | metre | `_m` | Stations are x from bow = 0 |
| Volume | cubic metre | `_m3` | |
| Area | square metre | `_m2` | |
| Thrust | kilonewton | `_kn` | |
| Δv, exhaust velocity | km/s | `_kps` | |
| Acceleration | g | `_g` | m/s² secondary in display only |
| Power, heat | megawatt | `_mw` | Thermal unless the name says electrical (`_mwe`) |
| Temperature | kelvin | `_k` | |
| Armour thickness | centimetre | `_cm` | |
| Areal density | kg/m² | `_kg_m2` | |
| Specific mass (reactors, radiators) | tonnes per GW | `_t_per_gw` | Terra Invicta convention, lower is better; kW/kg = 1000 ÷ this |
| Heat flux capacity | kW/m² | `_kw_m2` | Physical radiator rows |
| Crew | persons per watch | `crew_per_watch` | With `crew_basis: per_watch \| total`; see §4 |
| Cell pitch (NEBULOUS import) | metre | `cell_pitch_m` | Constraint-set parameter, provisional; §4 |
| Cell volume (NEBULOUS import) | cubic metre | `cell_volume_m3` | Constraint-set parameter, provisional; §4 |
| Endurance | crew-days | `_crew_days` | Also shown as days at full complement |
| Time to thermal limit | minutes | `_min` | |
| Distance (map, detection ranges) | per vault `distanceUnit` | — | light-time default; AU and MSK toggles |
| Cost | vault cost unit | `_cost` | |

Constants available to expressions are **SI**: `SIGMA` (5.670374e-8 W m⁻² K⁻⁴), `G0`
(9.80665 m/s²), `T_ENV` (K, from the constraint set; default 2.725), `PI`. Because they are
SI and most fields are not, rule 3 is what keeps the two from colliding.

## 3. Display conversion

- **Imperial toggle** (vault setting, beside `distanceUnit`): length ft/in, mass short tons
  and lb, thrust short tons, armour in and lb/ft², volume ft³, Δv kft/s beside kps. Power
  and heat stay MW in both modes. Endurance stays crew-days.
- **Distance** follows the existing vault `distanceUnit` (light-time default), measured as
  the map already measures it.
- Conversion happens in the UI layer only. Nothing under `src/core/` converts for display.

## 4. Two conventions, decided 2026-09-19

Both were open, both silently scaled whole budgets, and both were settled from evidence
rather than taste. They remain `provisional: true` because they are inferences about an
abstract game grid, not cited figures — so every volume derived from them renders with the
provisional marker (rule 5).

### Cells → metres: `cell_pitch_m = 3.0`, `cell_volume_m3 = 27`

Two separate constraint-set parameters, not one cube constant.

**2 m/cell is falsified by NEBULOUS's own data.** The NFC ship editor
(`docs/refs/NFC-Ship_Editor2 .png`) shows a Reinforced Magazine in a `4x1x8` compartment
reading **"Capacity: 280/320 m³"**. 4×1×8 = 32 cells, and 320 ÷ 32 = 10 m³ per cell —
exactly `reinforced-magazine.capacity_per_slot_size: 10` in `_tables/compartments.yaml`. So
that column is m³ per cell: the game publishes cell volume directly. `bulk-magazine` is
15 m³ per cell, so a cell cannot be smaller than 15 m³ gross. 2 m/cell is 8 m³.

(The 2 m note in `compartments.yaml` also miscomputed its own example: a 3×1×3 locker at
2 m/cell is 9 × 8 = 72 m³, not the 36 m³ quoted.)

**Upper bound ≈ 3 m.** The C90 600 mm casemate gun is 12 cells on its long axis; a 600 mm
L/50 barrel is ~30 m, ~36 m with breech and recoil. And the ubiquitous height-1 compartments
become 3 m decks, which is a normal warship deck height. Magazine floor, gun ceiling and
deck height converge on 3 m; bulk magazines then run at 15/27 ≈ 56% stowage efficiency,
which is right for a space with handling room and ready-use racks.

**Why two parameters.** The linear figure rests on the gun and the deck height; the
volumetric figure rests on the magazine capacities. They agree today (3³ = 27) but a later
correction to one should not drag the other. They are also not redundant in principle: the
cell triple's axis order is unreliable — the wiki table has `reinforced-cic [4,1,6]` where
the game UI shows `6x1x4` — so only the **product** of the triple is trustworthy. Use cell
count × `cell_volume_m3` for volume budgets and `cell_pitch_m` only for laying mounts out
along the spine. Never treat the triple as a bounding box: internal placement is volume
totals against an `allowed` list, with no bin-packing (`gallery/05` §2.5).

### Crew: NEBULOUS figures are **totals**, not per-watch

The NFC stats panel (`docs/refs/NFC_ship_editor_example.jpg`) reads **"Crew Complement
374/374"** broken down as Command 40 · Damage Control 3 Teams · DC Coordinators 1 ·
Engineering 30 · Gun Crew 100 · Gun Plotters 5. That **Command 40** is precisely
`citadel-cic.crew: 40`. Component crew figures sum into the ship's *total* complement.

The game's shape says the same: NEBULOUS has no berthing or quarters compartment anywhere
— nothing supplies crew capacity, only consumes it — because a battle has no watches. And
40 in a CIC is a full general-quarters complement for that space; tripling it to 120 for one
command compartment is not a real ship.

So a module carries `crew_basis`:

| `crew_basis` | Meaning | Watch multiplier |
|---|---|---|
| `per_watch` (default) | Persons on station in one watch | Applied |
| `total` | The whole complement for this module | **Not** applied |

```
crew = Σ (basis == "total" ? crew : crew_per_watch × watch_factor) × automation_factor
```

Every NEBULOUS-seeded module is `total`. This keeps the sourced figure intact instead of
dividing it by a watch factor at seed time, and lets NEBULOUS-derived and physics-derived
modules sit in one fleet without either being 3× wrong.

## 5. Table-specific conventions

- `_tables/*.yaml`: every row carries `source`; a figure that was not taken from a cited
  source carries `provisional: true`. There is no separate trust or units-checked field —
  `source` and `provisional` are the whole provenance vocabulary.
- **Reactors and radiators** carry Terra Invicta's `mass_t_per_gw`; physical radiator rows
  carry `heat_cap_kw_m2` and `mass_kg_m2` instead.
- **`radiators.yaml` holds two parallel systems** — `physical` (engineering figures, for
  first-principles recipes) and `game` (Terra Invicta balance figures). **Do not mix the two
  in one design.** A constraint set picks one.
- `GW`/`MW` are thermal unless suffixed `e`.
- `era` is an ordering hint for constraint sets, not a tech tree.
- Open-cycle drives carry propulsion waste heat away in the exhaust and need no radiator for
  it; closed-cycle drives do. Carry the `cycle` field through to the heat budget.
- Life-support heat (~300 K) and reactor/weapon heat (800–1500 K) need **separate arrays**;
  the low-temperature array is usually the larger. Never sum them into one rejection figure.

## 6. Module fields the ship budget reads (added 2026-09-20, editor 2)

Both rules above needed a field on the module record before the budget could honour them,
and three more were needed before a fitted weapon could reach the silhouette at its own
scale. All are optional; a module that omits one contributes nothing rather than a guess.

| Field | Unit | What it decides |
|---|---|---|
| `cycle` | `open` \| `closed` | An **open**-cycle drive's `heat_out_MW` is not a rejection load at all. Absent reads as `closed`, the conservative half. |
| `reject_temp_k` | K | Which array a radiator belongs to: below 400 K it serves the life-support loop, above it the reactor loop. A radiator that omits it is counted against whichever array still needs it, and the budget says so. |
| `power_standby_MW` | MW | What an operating mode's `standby` setting actually draws. Without it, `standby` is budgeted as **off** rather than as an invented fraction of full draw. |
| `radiated_power_kw` | kW | Anything above zero is an emitter, and the EMCON mode template shuts it down. This is what makes emission control mean something other than a category guess. |
| `bore_mm`, `barrels`, `launch_cells` | mm, count, count | Silhouette scale. These are `_tables/mounts.yaml`'s `ammo_mm` and `cells_capacity` under the names the part generator uses. |

A module's `propellant` is a **`_tables/propellants.yaml` row id**, not prose, so the tanks
that feed a drive can be identified. A drive naming its propellant in prose is reported as a
vocabulary gap, never as the wrong fuel.

A module's `slot` uses the same vocabulary as a hull's `external_slots[].type`, plus
`internal`. They were two different lists until editor 2, which meant a point-defence mount
could only call itself a turret.

`automation_factor` and `kg_per_crew_day` were delegated on 2026-09-20 and are now in the
base constraint set — 1.0 and 3.0 kg/crew-day, both provisional, both carrying a note saying
what they rest on. `max_gimbal_deg` is still unsupplied, so the thrust-line check reports the
angle a design needs and asserts nothing. See `missingParams()`.

## 7. Crew: the number on watch is two thirds of the complement (ruled 2026-09-20)

A warship's crew divides into **three sections with two of them manned** — one asleep, the
other two on station. Both numbers live on the craft record (`watch_sections`,
`watches_manned`) because that is how a watch bill is written, and because 3-and-2 says
something that 1.5 does not. A station or a small craft stands no rotation: 1 and 1.

```
complement   = Σ (basis == "total" ? crew : crew_per_watch × sections / manned) × automation_factor
on watch now = complement × manned / sections
```

This supersedes the single `watch_factor` an earlier pass used, which multiplied the
complement by three instead of by 3/2. It does **not** change §4's ruling that the NEBULOUS
and Terra Invicta crew columns are complements rather than watch stations; that still holds,
and those rows are still exempt from the rotation multiplier. The port-and-starboard example
in `_tables/radiators.yaml` is an illustration of one possible bill, not the ruled one.

## 8. Rounds have mass (ruled 2026-09-20)

`_tables/munitions.yaml` carries no mass or volume per round, so a magazine used to be a list
of counts that weighed nothing. Three anchors fix that:

| calibre | mass | volume | stowage density | taken from |
|---|---|---|---|---|
| 20 mm | 0.25 kg | 0.0025 m³ | 100 kg/m³ | autocannon round, complete |
| 120 mm | 22 kg | 0.05 m³ | 440 kg/m³ | tank round, complete |
| 450 mm | 1,315 kg | 0.8 m³ | 1,644 kg/m³ | naval AP shell |
| 600 mm | 2,170 kg | 1.46 m³ | 1,486 kg/m³ | siege mortar shell |

All four are historical naval-gun or artillery figures. Everything else is interpolated along
straight lines in **log-log** space — the simplest curve through all four that stays positive
and monotonic.

**The density knee is the point.** Stowage density climbs 100 → 440 → 1,644 and then *falls*
to 1,486. A belt of 20 mm is mostly links and air; a 450 mm AP shell is very nearly solid
steel; a 600 mm siege round is short, thin-walled and mostly filler, so it comes in at
2,170 kg where a cube-law scale from 450 mm would give 3,117. The mass exponent accordingly
runs 2.50 → 3.09 → **1.74**, and above 600 mm it extrapolates along that gentle slope: past
roughly 500 mm you are building siege ordnance, not naval rifles. Volume stays on effectively
one exponent from 120 mm up — it is mass that bends, not bulk.

The anchors live in that file's `meta.round_scale`; a row may override the result with its own
`mass_kg` / `volume_m3`. Magazine mass is attributed to the **mount**, because that is where
the ready rounds are and a full magazine under a dorsal turret pulls the centre of gravity
like anything else.

## 9. Structure has mass by law, and mounts point (ruled 2026-09-23)

### The structural-mass law

A hull's structural mass is no longer typed onto it. It follows from what the hull is
(`src/core/designer/hull/structure.ts`):

```
internal structure   M_s = (d / 100) · ρ_s · V        d  internal_density_cm_m
armour               M_a = Σ zones A · t · ρ_armour   `_tables/armor.yaml`
rated displacement   M_r = ρ_d · p · V                p  packing_efficiency
structure fraction   f   = (M_s + M_a) / M_r
structural cost      C   = c · (M_s + M_a)
```

`V` is gross volume. **`internal_density_cm_m`** is NEBULOUS's internal density: centimetres
of plate a straight path meets per metre of interior. Averaged over directions, the fraction
of a path lying in solid equals the solid's volume fraction (the stereological identity
L_L = V_V), so `d/100` is the share of the hull's volume that is deck and bulkhead, and the
law needs no other factor.

The three constants are base-set parameters:

| parameter | value | standing |
|---|---|---|
| `structure_density_kg_m3` (ρ_s) | 7,850 | sourced — `_tables/armor.yaml` steel |
| `design_density_t_m3` (ρ_d) | 0.715 | provisional — calibrated so the 138 m DD rates at 8,000 t |
| `structure_cost_per_t` (c) | 0.14 | provisional — calibrated so the DD costs its old 380 |

A `structural_mass_t` or `structural_cost` typed on a hull still wins, and the budget shows
the law's figure beside it. `structure_mass_fraction` on a hull is now a computed output, not
an input. A hull whose structure and armour outweigh its rating (f ≥ 1) is warned about;
everything derived from a provisional constant carries the marker.

A vault's copy of the base constraint set now wins **parameter by parameter**, so a vault
seeded before a parameter existed still receives it.

### Slot orientation and rings

Three optional fields on a hull's `external_slots[]`, read by the drawing and the budget
(`src/core/designer/hull/orientation.ts`):

| field | unit | meaning |
|---|---|---|
| `facing_deg` | ° | Turn about the mount's own outward axis. 0 as drawn (muzzle to the bow, exhaust aft), 180 reversed; positive turns toward increasing clock angle. |
| `tilt_deg` | ° | Thrusters and drives only: 0 fires along the hull, 90 straight outward. A `thruster` slot defaults to 90 — radial — which is what the attitude budget always assumed. |
| `count` | 1–8 | A ring: this many copies spaced evenly round the hull from `theta_deg`. A fitting in a ring slot is charged once per member, on the thrust line. |

The attitude budget takes each thruster's torque as `r × F` about the centre of gravity, so a
nozzle turned tangential produces **roll**, which is now reported whenever something can
produce it.
