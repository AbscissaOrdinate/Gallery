# Gallery — Hull editor: reference study and checkpoint-3 plan (2026-09-19)
 
Status: hull editor at **checkpoint 2**. This doc sets the design targets from the reference set, then specifies checkpoint 3 (foundations) so the spline editor at checkpoint 4 is a pure editing-tool addition, not a schema rewrite.
 
Decisions taken 2026-09-19:
- **Geometry = 2.5D, mixed.** The fuselage is a half-profile revolved about the thrust axis. Everything else in the silhouette — radiators, weapons, trusses, sponsons, antennae, strap-on tanks — is a flat 2D part in the silhouette plane, mirrored **vertically** (top/bottom), never revolved.
- **Geometry is advisory.** Modules own the numbers; geometry produces fit warnings, not hard caps.
- **National coherence = style kit + shared bus standards + doctrinal advisories + variant inheritance**, all four.
- **Checkpoint 3 = foundations; spline editor after.**
---
 
## 1. Reference study
 
### 1.1 The band we're targeting
Lower bound **For All Mankind** — hardware with visible Apollo/Shuttle/ISS lineage, chemical and early NTR, everything sized by what a real launcher lofts. Upper bound **late-game Terra Invicta** — fusion torches, spinal coilguns, kilometre-scale dreadnoughts. The 50–100 year band sits nearer the bottom: NTR/GCNR baseline (matches Heliaris LAG-NTR canon), fission-electric and early fusion at the top end, a handful of NSWR outliers. No torch drives, no reactionless anything, Δv budgets in the single-to-tens of km/s.
 
### 1.2 What the reference artists actually share
Across Bouvier's *Lunar War*, *SAD: Frontier*, FR0S7's *SAVAGES*, *MARE IGNIS*, *Deep Space Force* and Terra Invicta's hull art, the same eight rules recur. These are the rules the editor should make easy to obey and hard to break:
 
1. **Axial architecture.** One thrust axis. Drive aft, crew forward, everything strung between. Thrust is "down"; decks stack perpendicular to the axis. Nothing reads as hard sci-fi faster than getting this right, and nothing reads as soft faster than breaking it.
2. **Hazard separation.** Reactor and drive isolated at the stern behind a shadow shield; a truss or boom of standoff; propellant in between as bulk shielding; habitat at the far end, often on a spin arm or a drum. The distance *is* the design.
3. **Tankage dominates volume.** Hydrogen is enormous and nearly massless. Correct hard-sci-fi ships read as "a tank farm with an engine bolted on and a small pressurised bit up front." Bouvier's NISO/Altair frigates and the *SAVAGES* TYPE-11xx cruisers are both mostly tank.
4. **Radiators are the loudest visual signature** and the biggest combat liability — deployed panel wings, droplet sheets, or armoured fin wedges, retracted or edge-on when shot at. Radiator family alone will distinguish nations at a glance.
5. **Everything is a bus.** The oiler, the missile carrier, the laser frigate and the tug share a spine, a tank diameter and a docking ring. FR0S7's numbering (TYPE-1120 / 1120.2 / 1124 / 1140) is explicitly a family tree of one bus. This is the single most useful idea for the editor.
6. **Greebling is functional, not decorative.** MLI blanket quilting, Whipple shielding, umbilical runs, RCS quads at the extremities (max moment arm), standard docking rings, EVA handrails and translation paths, radiator hinge lines. Random panel-lining reads fake; a handrail run reads real.
7. **Armour is thin, local and directional.** Whipple/ablative layers and a thick nose, not battleship belts. Silhouette management (narrow nose-on profile) substitutes for armour.
8. **No aero forms without atmosphere.** Fairings, wings and heat shields appear only on landers, aerobrakes and launch stages. Everything else is a naked truss-and-tank machine.
### 1.3 Where national identity actually comes from
The references don't distinguish nations by decoration — they distinguish them by **manufacturing and doctrine**, which then shows up as shape:
 
| Driver | Visual consequence |
|---|---|
| Tank/core diameter the shipyard can make | Overall slenderness (L/D), whether modules look stacked or strapped |
| Truss-and-tank vs. monocoque construction | Skeletal vs. solid silhouette |
| Radiator family | Wing panels vs. droplet vs. armoured fins |
| Drive family (LAG-NTR vs. fission-electric vs. NSWR) | Stern bulk, shield cone angle, nozzle count |
| Doctrine (spinal-first, missile-heavy, carrier) | Mount layout, nose-on vs. broadside proportions |
| Bureaucratic convention | Hull code format, pennant placement, name lists, paint/marking system |
 
Terra Invicta deliberately does *not* do this — its 14 hulls are shared across all factions, so its fleets look factionally identical. That is the gap Gallery should close, and it's the reason the style kit is worth building.
 
### 1.4 Takeaways → editor features
 
| Takeaway | Feature it becomes |
|---|---|
| Axial architecture | Station-based spine; all geometry authored against station numbers (naval frame numbering, matches your USN-style hull conventions) |
| Hazard separation | Shadow-cone advisory: reactor station + half-angle, flags habitat sections inside the cone and hab too close to the drive |
| Tank dominance | Section volume roll-up vs. required propellant from the budget panel |
| Radiators as signature | Radiator appendages are first-class parts with drawn area → advisory against required rejection area |
| Everything is a bus | `.bus` standard records; modules and hulls declare interfaces; mismatch = warning |
| Functional greebling | Style-kit greeble layer: handrail runs, MLI zones, RCS quad auto-placement at extremities, docking rings snapped to bus diameters |
| Thin directional armour | Armour applied per facing to drawn surface area, advisory only |
| No aero without atmosphere | Aero parts gated behind a hull `environment` flag (orbital / aerobrake / lander) |
| Identity from manufacturing | Style kit = proportions + allowed part library + radiator family + palette + code format |
| Identity from doctrine | Doctrine block checked against mount mix and drive family |
 
---
 
## 2. Hull model (schema v2)
 
```yaml
# hulls/<slug>.hull.yaml — fields{}
axis:
  length_m: 184.0
  datum: nose            # station 0 at the nose, +x aft (naval frame convention)
  station_pitch_m: 2.0   # snap grid; also the frame spacing quoted in-universe
bus: uesc-standard-b     # ref .bus record
style: uesc              # ref .style record (or polity default)
parent: null             # ref hull; variants inherit geometry
sections:                # revolved about the axis, ordered fore→aft
  - id: s10
    kind: nose           # nose|core|tank|truss|bay|adapter|drive
    from: 0
    to: 12
    profile:             # half-profile, (station_m, radius_m) — polyline now, spline later
      mode: polyline     # polyline|spline  (checkpoint 4 flips this flag)
      pts: [[0,0.4],[4,1.8],[12,2.6]]
    pressurised: true
appendages:              # flat parts in the silhouette plane, mirrored top/bottom
  - id: a10
    kind: radiator       # radiator|pylon|sponson|boom|antenna|tank_strap|greeble
    station: 96
    attach_r: 2.6
    mirror: vertical
    outline: [[0,0],[42,0],[42,9],[0,9]]
    part: uesc-panel-rad-2   # style-kit part reference
mounts:
  - id: m01
    class: spinal        # spinal|turret|pod|internal|surface|dock
    size: 3
    station: 18
    facing: fore
    arc_deg: 0
    iface: ring-b
```
 
Notes:
- `profile.pts` is the same array the spline editor will edit at checkpoint 4; `mode: spline` adds control handles and renders as SVG `C` segments. No migration needed later.
- v1 hulls (single `silhouette` polygon) migrate to one `core` section with `mode: polyline` and the polygon's upper half as the profile — lossless enough, flagged for review.
### Derived geometry (pure functions, no CAD kernel)
- **Enclosed volume**: sum of conical frusta between profile points (exact for polyline, Pappus for spline). Per section and total.
- **Wetted / projected areas**: revolved lateral area per section; silhouette-plane area for appendages; nose-on and broadside projected areas.
- **Mass properties**: CG along the axis from section + module + appendage masses; off-axis moment from unmirrored appendages.
- **Shadow cone**: from the drive/reactor station and shield half-angle.
All advisory. They feed a warnings list next to the existing budget panel — never a hard block.
 
---
 
## 3. National coherence: the four mechanisms
 
### 3.1 Style kit — `.style` record (new type)
```yaml
proportions: { ld_ratio: [7, 12], max_beam_m: 12 }
construction: truss        # truss|monocoque|mixed
parts:                     # the kit of parts this nation may draw from
  nose: [ogive-b, blunt-a]
  tank: [barrel-b-24, barrel-b-36]
  radiator: [panel-rad-2, panel-rad-4]
  drive: [lagntr-bay-2]
palette: { hull: '#d8d4c8', blanket: '#c9a227', trim: '#2b3a55' }
markings: { code_format: '{PREFIX}-{TYPE}-{NUM}', pennant_station: 0.15 }
greeble: { density: medium, handrails: true, mli_zones: [tank, hab] }
doctrine:
  mount_mix: { spinal: [1,1], turret: [2,6], pod: [0,4] }
  drives: [lagntr, ntr]
  crewed: true
  armour: nose_heavy
```
New hulls for a polity start from its kit. Anything off-kit is listed in a **Style conformance** panel as a deviation with a one-click "conform" — never blocked, since a captured or export hull *should* be able to violate it.
 
### 3.2 Bus standards — `.bus` record (new type)
Core diameters, tank barrel lengths, truss pitch, docking-ring sizes, mount interface sizes. Modules gain a `bus_iface` field; a module on a hull with a different standard raises a fit warning. This is what makes a nation's tug, oiler and frigate visibly share parts, and it gives you an in-universe lever (an ally adopting your ring standard, a captured hull that won't take your missile pods).
 
### 3.3 Variant inheritance
`parent` + deltas. Supported operations, in order of how often real programs use them:
1. **Stretch plug** — insert *n* × station_pitch of a core/tank section at a flex station; everything aft shifts. This is the Flight I/II/III mechanism.
2. **Section swap** — replace a section with another from the same kit family.
3. **Mount refit** — change the loadout without touching geometry.
4. **Appendage refit** — new radiator or sensor family.
The editor shows the parent as a ghost silhouette behind the child and flags any edit that isn't one of the four (a "clean-sheet fork" prompt).
 
### 3.4 Doctrine advisories
The existing constraint-set machinery (`_constraints/*.yaml`) already does tech ceilings. Extend it with the per-polity doctrine block above, evaluated against the mount list and drive family. Warnings only.
 
### 3.5 The coherence feature that actually pays for itself
**Fleet sheet view**: every hull owned by a polity rendered as a silhouette at a common scale, on one page, sorted by displacement — the classic Jane's recognition plate. Nothing else exposes an incoherent fleet as fast, and it's ~a day of work once the SVG renderer exists. It doubles as a fleet-portrait export.
 
---
 
## 4. Editor UI (checkpoint 3)
 
```
┌──────────┬──────────────────────────────────────────┬────────────────┐
│ Outliner │  Profile canvas                          │ Inspector      │
│ sections │   · station ruler along the axis         │ + Advisories   │
│ appendgs │   · mirror line, revolve preview toggle  │   fit          │
│ mounts   │   · parent ghost, human-scale figure     │   thermal      │
│          │   · snap to station_pitch / bus diameter │   shadow cone  │
│          │                                          │   style        │
├──────────┴──────────────────────────────────────────┴────────────────┤
│ Fleet strip — sibling hulls of this polity at common scale           │
└──────────────────────────────────────────────────────────────────────┘
```
- Reuse the system map's pan/zoom and the existing SVG export path.
- Two render modes: **silhouette** (fleet-sheet plate) and **schematic** (sections tinted by kind, mounts and stations labelled).
- Human-scale figure and a docking ring at true size, always available — the single best guard against scale drift.
---
 
## 5. Checkpoint 3 work breakdown
 
1. **Schema v2 + migration** — hull v2, module `bus_iface`, new `.bus` and `.style` types; v1 silhouette → single core section; `.schema.v1.json` backups per existing convention.
2. **Geometry kernel** (`hull/geometry.ts`) — pure TS: frustum volume/area, appendage mirroring, station math, CG, shadow cone, projected areas. Unit-tested against hand-computed cases. No library.
3. **Renderer** (`hull/render.ts`) — sections + appendages → SVG path strings; silhouette and schematic modes; reuse asset export.
4. **Editor UI** — outliner + canvas + inspector; numeric entry first, drag handles on segment endpoints; snapping. No spline handles yet.
5. **Mounts + fit** — mount placement, module assignment, fit/volume/interface advisories wired into the existing budget panel.
6. **Variants** — parent ghost, four delta operations, stretch-plug.
7. **Style kit + conformance panel + fleet sheet.**
8. **Presets** — one bus standard and one style kit per polity for UJCN, LDF, AMN, CDN (from the fleet extraction), plus ~12 section and ~8 appendage parts.
9. **Verification** — vitest on the geometry kernel and migration; headless Chromium smoke on the editor; rebuild 3–4 real classes (Sword-of-State, a CDN destroyer, an oiler) from the extracted Trojan War data and eyeball the fleet sheet.
**Checkpoint 4 (spline editor)** then only has to: flip `mode: spline`, add Bézier handles to the same point array, add insert/delete/smooth, and render `C` segments. Nothing above changes.
 
### Deliberately not built
3D meshes, boolean geometry, deck/internal-arrangement layout, structural FEA, true armour ray-casting, combat sim. All out of scope and none of them are needed to make a fleet look coherent.
 
---
 
## Sources
- [Theo Bouvier — *The Lunar War*: Ships of the Line](https://www.artstation.com/artwork/1xN352) · [Altair-class NEMM European Frigate](https://theobouvier.xyz/projects/xD3rmr) · [Various renders](https://www.artstation.com/artwork/Xg1y3y)
- [FR0S7 — *SAVAGES* portfolio](https://fr0s7.artstation.com/) · [Cruiser Type-1120.2](https://www.artstation.com/artwork/n0BWGr) · [Battleship TYPE-1140](https://fr0s7.artstation.com/projects/NGWqwg)
- [SAD: Frontier — YouTube](https://www.youtube.com/@SADFrontier) · [Patreon](https://www.patreon.com/cw/SADFrontier)
- [MARE IGNIS wiki](https://mareignis.wiki.gg/wiki/Mare_Ignis)
- [Terra Invicta — Spaceships (official wiki)](https://wiki.hoodedhorse.com/Terra_Invicta/Spaceships) · [Ship Hull List](https://wiki.hoodedhorse.com/Terra_Invicta/Ship_Hull_List) · [Dev Diary #14: Ship design](https://www.pavonisinteractive.com/phpBB3/viewtopic.php?t=28995)
 