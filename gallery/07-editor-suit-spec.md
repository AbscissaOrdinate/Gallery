# Gallery — Design suite: five editors, handoff spec for Code (2026-09-19)
 
Companion to `gallery/06-hull-editor.md`, which holds the reference study, the hull geometry model and the national-coherence mechanisms. This doc specifies the **five-editor split**, the **shared advisory kernel**, and everything a Claude Code session needs beyond the markdown itself.
 
Decisions taken 2026-09-19:
- Internal components: **free placement within a per-section volume budget** (no fixed slot inventory).
- Missiles and strikecraft: **physics core with NFC-style presets and tuning on top** — one unit system, familiar UI.
- `_tables` exists in the repo, **populated but inconsistent** — rows sourced variously from NEBULOUS, Terra Invicta and Atomic Rockets. Reconciling it is task 0.
- Build order: **strictly 1 → 2 → 3 → 4 → 5**, each finished before the next.
---
 
## 0. What to hand Code besides this markdown
 
| Item | Why it matters |
|---|---|
| **Repo + branch** (`AbscissaOrdinate/Gallery`), work on `feat/design-suite`, one PR per editor | Five sequential editors = five reviewable units |
| **`CLAUDE.md` at repo root** | The lazy-senior-dev rule, the "advisory never blocks" rule, SI-internal/display-converted units, no new dependencies without justification, vitest + headless-Chromium smoke before any checkpoint is called done |
| **`docs/UNITS.md`** | Non-negotiable given the mixed-source tables. SI on disk (kg, m, m³, W, N, s, K, Pa); display conversion at the UI edge only; every table row carries the unit in its column name |
| **`_tables` provenance pass** (task 0 below) | The tables mix three balance philosophies. Without normalisation the advisory engine gives nonsense and you'll never know which number to trust |
| **Existing budget engine contract** (`craft` budgets from phase 1) | The new kernel must subsume it, not fork it — one code path for Δv, power, heat |
| **Demo vault + `gallery-vault.zip`** | Round-trip fixtures |
| **Trojan War extraction** (`gallery/05`, 77 classes, 6 polities) | The acceptance fixtures — rebuild real classes, not toy ones |
| **Nocturne theme tokens** (`src/theme.css`) | Five editors must look like one app; no per-editor styling |
| **Reference screenshots** — drop NFC ship editor, NFC missile designer, CoaDE ship view into `docs/refs/` | Code cannot browse; UI intent transfers far better as images than prose |
| **The eight hard-sci-fi rules** from `gallery/06` §1.2 | They are the acceptance criteria for "does this look right" |
 
**Note on the free-placement choice.** Two consequences worth accepting deliberately: (a) it forecloses a spatial damage model later without a rework, and (b) since the ship editor adds external mounts that must appear in the silhouette, **the hull SVG has to be generated from the record at render time, never stored as a hand-authored asset**. Point (b) is the one that will bite if Code takes a shortcut early — call it out in `CLAUDE.md`.
 
---
 
## Task 0 — `_tables` reconciliation (before editor 1)
 
The rows came from three incompatible balance systems. NEBULOUS numbers are gameplay-tuned abstractions; Terra Invicta numbers are internally consistent but assume a different tech ceiling; Atomic Rockets numbers are real physics with no game balance at all. Mixing them silently is the single largest correctness risk in the suite.
 
Add to every row:
```
source: nfc | terra-invicta | atomic-rockets | original | derived
trust:  canon | reference | placeholder     # canon = Heliaris-authoritative
units_checked: true|false
notes: free text (what was converted, what was invented)
```
Then: normalise all units to SI, flag rows where two sources disagree by >2× on the same quantity, and write `_tables/RECONCILIATION.md` listing every conflict for your adjudication. **Do not let Code silently pick a winner** — it should surface conflicts and stop.
 
---
 
## 1. Shared advisory kernel (`src/design/kernel/`)
 
One module, consumed by all five editors. Pure functions, no React, fully unit-tested. Everything it emits is a **warning with a severity and a source**, never a hard block.
 
```ts
type Advisory = {
  id: string
  severity: 'info' | 'caution' | 'violation'
  domain: 'fit' | 'mass' | 'power' | 'thermal' | 'radiation' | 'deltav'
        | 'structure' | 'style' | 'doctrine'
  message: string
  anchor?: { station?: number; componentId?: string }  // click → highlight in canvas
}
```
 
Computations, all advisory:
 
- **Fit** — Σ component volume vs. section volume budget; component max dimension vs. section clear diameter; external mount vs. hull mount interface.
- **Mass & CG** — dry/wet mass, CG station, off-axis moment from unmirrored appendages, thrust-axis offset.
- **Power** — generation vs. draw, by combat/cruise/silent state.
- **Thermal** — rejection required vs. drawn radiator area × emissivity × T⁴; plus the **thermal shadow**: panel-to-panel and panel-to-hull view-factor blocking computed in the silhouette plane, and drive-plume impingement on aft-mounted panels. Flags radiators that see each other or the plume.
- **Radiation shadow** — reactor station + shield half-angle → a cone. Any crewed compartment or hab ring outside the cone gets a dose advisory scaling as leakage/r². This is the geometric check that makes the hazard-separation rule enforceable.
- **Δv** — rocket equation over the loaded tank set, thrust-weighted Isp; per-propellant-load curve.
- **Structure** — L/D vs. style kit range, unsupported truss spans, appendage root loads under max accel.
- **Style / doctrine** — conformance against the polity `.style` kit and doctrine block (`gallery/06` §3).
**Rendering is also shared** (`src/design/render/`): one renderer, two modes — **silhouette** (solid fleet-sheet plate) and **schematic** (sections tinted by kind, stations and mounts labelled, advisory anchors as markers) — with overlay layers for the radiation cone, the thermal view-factor blocking, and the CG marker. Every editor mounts the same canvas with a different overlay set.
 
---
 
## 2. Shared UI shell
 
All five editors use one frame, so the suite reads as one tool:
 
```
┌───────────────┬────────────────────────────────┬──────────────────┐
│ Catalog /     │  Canvas                        │ Inspector        │
│ Outliner      │   · station ruler, mirror line │ (selected item)  │
│  search       │   · silhouette ⇄ schematic     ├──────────────────┤
│  filter by    │   · overlays: rad cone,        │ Advisories       │
│   polity/bus  │     thermal blocking, CG       │  grouped by      │
│  drag to add  │   · human figure + docking     │  domain,         │
│               │     ring at true scale         │  click → anchor  │
├───────────────┴────────────────────────────────┴──────────────────┤
│ Budget bar — mass · Δv · power · heat · crew · cost · volume      │
├───────────────────────────────────────────────────────────────────┤
│ Fleet strip — sibling designs of this polity at common scale      │
└───────────────────────────────────────────────────────────────────┘
```
 
UI conventions worth lifting, by source:
- **NEBULOUS** — left catalog with live search and faction filter; hover tooltip cards carrying the full stat block; a persistent bottom budget bar; dry vs. loaded mass shown side by side; per-mount magazine/munition mix as a sub-panel of the mount, not a separate screen.
- **CoaDE** — cross-section view; per-component mass and heat tables you can sort; a plot panel (Δv vs. payload, accel vs. burn time) rather than a single scalar.
- **Terra Invicta** — the compact hardpoint summary chip row (n nose / n hull / n utility) as an at-a-glance hull identity.
- **Gallery-specific** — station ruler, parent-hull ghost, advisory panel with click-to-anchor, fleet strip, silhouette/schematic toggle.
---
 
## 3. The five editors
 
### Editor 1 — Hull / craft / bus geometry (checkpoint 3)
Authors the **frozen contract** every ship built on the hull inherits. Schema and geometry per `gallery/06` §2.
 
Owns, and the ship editor cannot change:
- Section stack and profiles (revolved fuselage), appendage structure (mirrored vertically), overall station scheme
- Mount inventory: position, class (spinal / turret / pod / surface / dock), size, facing, arc, bus interface
- Internal volume budget per section, and which sections are pressurised
- Armour density and per-facing scheme; docking points; habitat rings; structural greebles
- Hull classification and ship type; `.bus` standard; `.style` kit binding
- Variant lineage: import an existing hull or strikecraft as `parent`, then the four legal deltas (stretch plug, section swap, mount refit, appendage refit) with the parent drawn as a ghost
Acceptance: rebuild Sword-of-State, a CDN destroyer and an oiler from the `gallery/05` extraction; fleet sheet of one polity renders coherently; radiation cone flags a hab deliberately placed aft of the shield.
 
### Editor 2 — Ship
Fills a hull. Never changes geometry; **does** change the silhouette, because external mounts render into it.
 
- Assign modules to mounts; assign internal components by free placement into section volume budgets
- Fuel tank count and propellant selection; magazine contents and munition mix per launcher
- Crew complement, mission fit, power/thermal state presets (cruise / combat / silent)
- Live budget bar + full advisory set; generated silhouette updates as mounts are added
- Variants of a ship on the same hull (loadout variants, distinct from hull variants)
Acceptance: a hull carries three loadout variants with visibly different silhouettes; removing radiators trips the thermal advisory; overloading tanks trips volume and CG.
 
### Editor 3 — Module
Authors the parts the ship editor consumes, extending the reconciled `_tables`.
 
- External mounts (turrets, spinal weapons, radiators, strap-on tanks, sensors, EW) and internal components (compartments, drives, reactors, avionics)
- CoaDE-style physics advisories on the part itself: a drive's thrust/Isp vs. its propellant and power draw; a reactor's thermal output vs. mass; a radiator's W/m² vs. working fluid and temperature; a laser's aperture vs. range
- Each module declares its silhouette outline (so editor 2 can render it), its bus interface, and its `source`/`trust` provenance
- Style-kit membership: which polities' part libraries include it
Acceptance: a new LAG-NTR drive authored here appears in editor 2's catalog, renders in the silhouette, and its Δv contribution matches a hand calculation.
 
### Editor 4 — Missile
NFC layout, CoaDE numbers.
 
- Body size class 1–4 (from the bus standard's launcher interfaces), rendered as a stacked socket column
- Sections: seeker, payload/warhead, avionics, auxiliary, propulsion — each a module record
- Propulsion tuning triangle (speed / manoeuvre / turn rate) that moves **real underlying quantities** — propellant fraction, thrust level, fin authority — not abstract points
- Derived: Δv, burn profile, terminal speed, acceleration, turn rate, seeker acquisition range vs. a reference target RCS, missile RCS, cost
- Output is a `craft` record of kind `missile`, loadable into editor 2's magazines
Acceptance: a size-2 missile's Δv and range match a hand-computed rocket-equation case; it appears in a launcher's munition mix.
 
### Editor 5 — Strikecraft
Same machinery, different envelope: skiffs, shuttles, tugs, boats.
 
- Hull from editor 1 (small hulls are ordinary hulls); loadout from editor 2's mechanics with a reduced mount set
- Embarked-craft accounting: hangar/anchorage volume and deck cycle capacity on the parent ship, checked against the parent's `Embarked` field
- Endurance rather than Δv as the headline number; life support and consumables advisory
Acceptance: a carrier's embarked wing fits its hangar volume; exceeding it trips a fit advisory on the parent, not the strikecraft.
 
---
 
## 4. Cross-cutting requirements
 
- **Everything is a record.** All five editors read and write the existing envelope + JSON-Schema form machinery. No editor gets a bespoke store.
- **Advisories never block.** A captured hull, an export variant, or a deliberately bad design must be saveable.
- **One renderer, one kernel.** If an editor needs a new computation, it goes in the kernel.
- **Provenance travels.** `source` and `trust` from `_tables` propagate into derived records so you can always ask "why is this number what it is."
- **Tests per editor**: kernel unit tests with hand-computed cases; schema migration round-trip; headless-Chromium smoke on the editor UI. No checkpoint closes without all three green.
### Explicitly not built
3D meshes, boolean geometry, deck plans / internal arrangement drawings, spatial damage modelling, structural FEA, combat simulation, real-time flight. None are needed for coherent fleets, and free volume placement (§0) rules out the spatial damage model anyway.
 
---
 
## Sources
- [NEBULOUS: Fleet Command — Components (official wiki)](https://wiki.hoodedhorse.com/NEBULOUS_Fleet_Command/Components) · [Missiles](https://wiki.hoodedhorse.com/NEBULOUS_Fleet_Command/Missiles) · [Munitions & Missiles](https://wiki.hoodedhorse.com/NEBULOUS_Fleet_Command/Munitions_&_Missiles) · [Ships](https://wiki.hoodedhorse.com/NEBULOUS_Fleet_Command/Ships)
- [Creating a ship mod for NEBULOUS (Steam guide)](https://steamcommunity.com/sharedfiles/filedetails/?id=2815953082) · [Missiles: The Editor (tutorial)](https://www.youtube.com/watch?v=KrKGIb4tHrs)
- [Terra Invicta — Spaceships](https://wiki.hoodedhorse.com/Terra_Invicta/Spaceships) · [Ship Hull List](https://wiki.hoodedhorse.com/Terra_Invicta/Ship_Hull_List)
 