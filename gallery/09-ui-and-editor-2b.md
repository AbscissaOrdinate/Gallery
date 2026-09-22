# Gallery — Editor 2b and the UI pass (plan, 2026-09-21)

## Context

Editors 1 and 2a are done and pushed on `feat/design-suite`: the hull geometry contract, the
hull editor UI, and the whole ship kernel (`src/core/designer/ship/` — budget, advisories,
modes, munitions, silhouette). 446 vitest tests, typecheck and build clean, hull and ship
smoke green.

What is **not** done is the half a person actually touches. There is no ship editor at all —
a craft is edited today as a generic schema form with a budget card stapled underneath, and
`shipSilhouette()` has zero UI consumers. The hull editor exists but its labels are
unreadable, its budget bar carries geometry instead of budgets, and clicking an armour belt
blanks the inspector.

This plan covers four strands, in the order they should land. It is written to be picked up
cold on a different machine: every figure, ruling and reference file it depends on is either
in this repo or named by path.

**Rulings this plan implements** (2026-09-20/21, from the vault owner):

- Part glyphs grow along a **principal axis**, with per-family exceptions — see §1.2.
- Radiators stay **taller than wide**, and the ratio is **editable in the style kit**.
- Parts must be drawable on the **port/starboard beam**, not just dorsal and ventral.
- Hull presets for eleven classes, **anchored on the existing 138 m destroyer**.
- One **shared editor shell**, mounted twice — hull view and ship view.

---

## 1. Part glyphs

### 1.1 Redraw six weapon families from the references

`docs/refs/Weapons/` (now in the repo) holds a side and top view for each of **bandit, beam,
CIWS, laser, plasma, rocket**, all pointing right. The current generators in
`src/core/designer/hull/parts.ts` were drawn before these existed and several are simply
wrong about the shape:

| family | what the reference shows | what `turret()` draws today |
|---|---|---|
| `laser` | a **ball/dome turret** on a short cylindrical pedestal, with a circular lens on the forward face | a vertical stack of three boxes |
| `plasma` | a body with a **long coil-wound barrel** running forward, banded along its length, with a muzzle assembly | three short coils stacked vertically, a cap on top |
| `particle` (= `beam`) | a **long, low wedge** lying along the hull, prominent tube, very flat | a segmented accelerator at `h = 0.45L`, too tall and too fussy |
| `ciws` | a compact **boxy body with a short barrel cluster** projecting forward | `pointDefence()` — pedestal, housing, vertical stub |
| `rocket` | a bundle of **long tubes** running fore-and-aft, open muzzles forward | short stubby boxes in one or two rows |
| `arm` (= `bandit`) | a squat **hammer-headed block on a narrow pedestal**, head wider than the base | a long rail raking aft and up to `1.76·L` |

Redraw each from the reference. Low fidelity, shape only — no paint scheme. The existing
`Part = Outline[]` convention (a part is a **list** of polygons, never one self-intersecting
ring) is load-bearing and stays.

### 1.2 Growth is per-family, not uniform

Today `makePart` multiplies the whole glyph by `span(size)` — S/M/L/XL → 2/4/8/14 m on both
axes, so an XL gun is as fat as it is long. The ruling is that size grows a **principal
axis**, with named exceptions:

| family | what a larger size class does | what it does *not* do |
|---|---|---|
| gun / turret | barrel **lengthens**, and the **gunhouse expands** with it | — (both grow; the barrel grows faster) |
| `cell` (VLS) | **more tubes**, each at a fixed size | tubes never get wider |
| `rocket` | **more tubes**, each at a fixed size | as above |
| `laser` | **uniform** — it is a sphere and stays a sphere | never elongates |
| tank, `spherical` | **uniform** — stays spherical | never elongates |
| tank, `barrel` / `conformal` | **lengthens** along the hull | barely thickens |
| radiator | **extends further outward** (taller) | does not get wider along the hull |
| antenna, radar, optics, dock, pd, thruster | principal axis (outward for masts, aft for nozzles) | — |

Implementation shape: give each generator an explicit `(along, out)` pair derived from the
size class rather than a single `L`, with a per-family growth exponent on each. A single
`GROWTH: Record<family, {along: number, out: number}>` table, documented in one place, is
enough — `gun` is `{along: 1, out: 0.55}`, `cell` is `{along: 0, out: 0}` with the count
driven instead, `laser` and spherical tank are `{along: 1, out: 1}`.

### 1.3 Radiator aspect, editable in the style kit

Current height:span ratios — `fin` 1.45, `panel` 1.25, `hoop` 1.2, `spine-array` 1.15,
`droplet-boom` 1.1, **`membrane` 0.75**. Only membrane breaks the rule.

- Add `radiator_aspect` to `STYLE_SCHEMA` (`src/core/schema/builtin/schemas.ts`), a number
  clamped to **≥ 1.0** so the constraint cannot be violated from the UI, default 1.35.
- `familiesOf()` reads it into `PartFamilies.radiator_aspect`; `radiator()` uses it in place
  of the per-family hard-coded multipliers, keeping each family's *relative* character by
  scaling its current ratio toward the requested one rather than replacing it outright.
- `membrane` is the one that changes shape: it becomes a tall slack sheet rather than a wide
  one.
- Surface it in the hull editor's Conformance card alongside `radiator_panels` and
  `radiator_sweep_deg`, which are already there.

Note this is the *drawn* aspect. It composes with the rejection-proportional scale added in
`ship/silhouette.ts` (a 12 MW loop beside a 120 MW loop draws at a tenth of the area); aspect
sets the shape, rejection sets the size.

### 1.4 A plan view, so parts can sit on the beam

`partsForHull()` currently does `if (isBeamOn(slot.theta_deg)) continue` — a slot between
45° and 135° (or 225°–315°) draws **nothing at all**. That is why side mounts are invisible.

The fix rests on one observation: the silhouette is a side elevation, so a part on the port
beam is being viewed **from directly outboard** — which in the part's own frame, where `+y`
is outward, means looking down its `+y` axis. That is its **plan view**. The reference images
being side/top pairs is the same fact from the other direction.

Two deliverables, sharing the same outlines:

**(a) Beam mounts in the side view.** Each generator gains a plan-view counterpart. A
beam-mounted slot draws its plan outline at the hull's mid-height, under a distinct role
(`fitted:beam:<kind>`) that the renderer styles as **outline-only or reduced-opacity**, so it
reads as a fitting on the far side rather than as hull structure. Drawing it filled would
obscure the hull.

**(b) A plan render mode.** `RenderMode` gains `"plan"` beside `silhouette` and `schematic`.
Half of this already exists: `outlinePath(hull, samples, useBeam = true)` in
`render.ts` already draws the plan hull outline from `beamAt()/2`. In plan mode,
port/starboard mounts draw their plan glyph properly placed and dorsal/ventral mounts draw
edge-on. This is the view in which a side-mounted battery actually reads.

Structural work this needs:

- `Outline`, `Part`, `SIZE_M`, `span`, `box`, `centre`, `centreY` and the generators are
  currently **module-private**. Export what a second view needs, or keep both views in
  `parts.ts` and export only the public surface. Prefer the latter — one file, two
  functions per family — so the two views cannot drift apart in separate modules.
- `Appendage` (`hull/types.ts`) carries one `outline` and a scalar `attach_r`, with no plane.
  Add `plane?: "profile" | "plan"` and have `placeAppendage()` use `beamAt(spine, x)/2` in
  place of `halfHeightAt` when the plane is `plan`.
- `tests/hull-parts.test.ts` pins exact piece counts and asserts all eight weapon shapes are
  pairwise distinct as JSON. Redrawing six of them will trip those; update the expectations
  deliberately, and **add the same distinctness assertion for the plan views**.

### 1.5 Spinal mounts

`SLOT_PART` maps `spinal` to `undefined`, so a spinal weapon draws nothing. Per the ruling,
**use the side profile for spinal for now** — map `spinal` to the fitted weapon's own family
so a spinal railgun reads as a long gun along the axis. Purpose-built spinal variants
(a gun that runs the length of the hull rather than sitting in a mounting) are deferred and
recorded as such in `08`.

### 1.6 Verify

Extend `scripts/hull-style-probe.mts`. It currently has swatch rows for weapons and
radiators only. Add: a row per non-weapon kind (antenna, tank, thruster, dock, radar, optics,
pd) which have **no swatch coverage at all** today; a row varying turret mount family
(box/barbette/cupola, currently never exercised); a **plan-view row mirroring every side-view
row**; and a size-ladder row (S→M→L→XL for one family) to make the principal-axis growth
visible. Compare each swatch against its reference in `docs/refs/Weapons/`.

---

## 2. Hull presets — eleven classes

Every new hull starts from scratch today. It should start from a class.

**Eleven presets**: BB, CV, CA, CG, CL, DD, DL, FF, MN, strikecraft, missile. Each with a
default spine profile, packing efficiency, armour scheme, sections, external slots and a
`hull_class` code — editable afterwards, but never blank.

**Scale anchor**: the existing `ujcn-destroyer-hull` at **138 m** is the DD. Everything else
scales from it. Starting ladder, to be corrected against measurement:

| class | length | character |
|---|---|---|
| missile | ~8 m | single stage, one warhead section |
| strikecraft | ~20 m | one section, no rotation, minimal armour |
| FF | ~110 m | thin, few slots |
| **DD** | **138 m** | **anchor — the existing Halberd preset** |
| DL | ~165 m | a stretched DD: more magazine, an extra pair of mounts |
| CL | ~185 m | |
| CG | ~200 m | missile-heavy, many cell slots |
| CA | ~225 m | armoured nose, main battery forward |
| MN | ~150 m | low L/D, very heavily armoured, static fire support |
| CV | ~260 m | fat, low L/D, hangar sections dominate |
| BB | ~300 m | longest, banded midsections, heavy belt |

**Correcting the ladder.** `docs/refs/SolarSystem_Fleet_Deployment.png` (3323 × 3458, now in
the repo) has the reference silhouettes. Measure rather than eyeball: the silhouettes are a
saturated blue, `rgb(19, 34, 225)` — threshold on `b > 150 and r < 120 and g < 120`, group
contiguous rows into bands, and take each band's horizontal run lengths. Beware that **labels
are the same blue as the silhouettes**; text bands are 12–14 px tall and silhouette bands are
24–103 px, so filter on band height. Scale so the destroyer row lands on 138 m, then sanity-
check the ladder above and adjust.

The screenshot's proportions matter as much as its lengths — CV and MN are notably *fat* for
their length, BB has banded midsections, DL is thin. Carry that into the spine profiles, not
just the `length_m`.

Also needed: a **"new hull from class"** entry point. `NewRecordMenu` already selects a preset
by id, so this is mostly presets plus labelling — but the hull editor should offer it too, so
a person starting a design never faces an empty spine.

---

## 3. The UI pass

### 3.1 The label bug — one line, two mistakes

`src/ui/hull/HullCanvas.tsx:325`:

```tsx
fontSize={scale(el.size ?? 11)}     // scale = (n) => n / perMetre
```

`scale()` converts **screen pixels → scene metres**. But `render.ts` authors `el.size` in
**metres** (section labels 3, slot labels 2.2, CG 2.5, ruler ticks 2.2). The round trip
cancels exactly, so every label renders at **2.2–3 CSS pixels at every zoom level** —
`perMetre` grows on zoom-in and `fontSize` shrinks by the identical factor. The label is the
only thing on the canvas that does not grow, which is precisely the reported symptom.

The same scene through `toSvg()` renders those labels at 12–18 px and is perfectly legible;
the export path and the on-screen path disagree about the unit. The `?? 11` default is the
tell — a pixel-shaped fallback on a field the renderer only ever fills with metres.

**Fix**: adopt `SystemMap`'s convention, which is the one the file's own header already
claims. `SystemMap` draws neighbourhoods inside a `scale(inv)` group so nested numbers are
plain screen pixels, at 6.4–12 px. For the hull canvas:

- Treat `el.size` as **screen pixels**, and give the scene sensible pixel sizes (section 13,
  slot 11, CG 12, ruler tick 10 — the `--fs-*` ramp is 11/12/13/15/20).
- Keep labels **screen-constant** rather than zoom-scaling: constant size is what a technical
  drawing wants, and it is what the rest of the app does.
- Keep `toSvg()` working: it needs the same reinterpretation, or an explicit
  `pxPerMetre`-aware conversion, or the export regresses in the opposite direction. **Check
  both consumers in the same change** — they have already drifted once.
- While here: hull labels use `--navy-200`/`--navy-300` (low contrast). Move them to
  `--text-muted` or `--text`, and add the hover-enlarge escape hatch `SystemMap` has
  (`pickable()` currently returns `undefined` for text, so labels are inert).
- Consider semantic zoom — `SystemMap` gates detail on zoom thresholds so labels appear as
  you zoom in. Worth it once there are more than a handful of slots.

### 3.2 Clicking an armour belt blanks the inspector

`HullCanvas.tsx:25` and `:346` make armour zones pickable as `kind: "zone"`, but `Inspector`
(`HullEditor.tsx:309-395`) has no `zone` branch — the flow falls through to the appendage
lookup at `:377` and returns `null`, so the whole inspector card goes empty. Add the branch:
from, to, material, thickness. Doc 07 §3 lists "armour density and per-facing scheme" among
the things editor 1 **owns**, and it is currently the only owned item with no editor at all.

### 3.3 Extract the shared shell

Doc 07 §2 mandates one frame for all five editors. `HullEditor.tsx` owns that frame, its
overlay state and its selection state locally, and the CSS classes are `hull*`-prefixed.
Building editor 2's UI by copying it produces two shells — exactly what §2 exists to prevent.

New `src/ui/design/`:

| file | contents |
|---|---|
| `DesignShell.tsx` | the frame: toolbar, 3-col body, rail, strip. Named `ReactNode` slots — not children, not render props |
| `DesignCanvas.tsx` | viewport + scene + picking, no editing |
| `AdvisoryList.tsx` | the `byDomain` card, lifted |
| `BudgetRail.tsx` | renders a `RailStat[]` descriptor list |
| `FleetStrip.tsx` | plates |
| `useRecordDraft.ts` | draft + 900 ms autosave + unmount flush, lifted |
| `useAnchor.ts`, `anchor.ts` | selection + focus; the reducer is **pure** so it can be tested under the existing `environment: node` config |
| `selection.ts` | `Selected<K>` plus the two per-editor kind unions |
| `fields.tsx` | `Num`, `Text`, `Toggle`, `OverlayBar`, `useOverlays` |

Key decisions:

- **Advisories and the rail are data, not slots.** Both editors render identical markup over
  different content; making them slots guarantees two copies that drift.
- **Overlays stay per-editor.** Hull's seven (`parts beam slots sections figures cone ghost`)
  and a ship's (`fittings empty tanks cg thrust cone figures`) share only three — and `cg`
  and `cone` are the two the renderer already supports that the *hull* editor cannot
  meaningfully use, because both need a loadout.
- **Selection is a per-editor union**, not a generic `{kind: string}`. Hull's kinds are
  `station|section|slot|appendage|zone`; a ship's are `fitting|manifest|tank|mode|unplaced`.
  The same slot id genuinely means different objects in the two editors. A widened `kind:
  string` would turn four compiler-checked inspector branches into four string comparisons.
- **`DesignCanvas` takes a built `scene`, not `hull` + `options`.** Today `HullCanvas:70`
  calls `renderHull` on every render including every `pointermove` during a drag. Hoisting it
  to the editor lets it be memoised, and means `ShipCanvas` needs **zero** new render
  options — its scene is `renderHull(hull, {...opts, fitted: silhouette.parts, cgStation:
  budget.cgStation_m})`, and both of those already exist and are tested.
- **`picks` replaces the hardcoded `pickable()` table** — an id-prefix → selection-kind list
  supplied per editor.
- **Rename `.hull*` CSS to `.design*`** — but in its own commit, *after* the extraction.
  29 lines in `styles.css`, 13 `className` sites, 7 selectors in `ui-smoke-hull.mjs`. Every
  failure mode is loud. A rename layered onto a move makes the diff unreviewable.

**A hard rule worth writing into `DesignShell.tsx`'s header**, the way every other module in
this repo carries its constraints: `DesignShell` may not import from `src/core/designer/`
except `Violation`/`Domain` and `HullScene`. If it needs to know which editor it is, the
answer is a new slot, never a flag. That is the check that stops it growing into what it
replaced.

### 3.4 The ship editor

`{kind: "ship", id}` on `View`; a case in `App.tsx`; an "Open ship editor" button on the
craft record beside the hull's existing one. **Leave `BudgetPanel` mounted on the craft
record** — `scripts/ui-smoke-ship.mjs` drives it and would otherwise fail.

Panes:

- **Catalog (left)** — module palette grouped by category, with search and a "fits the
  selected slot" filter. This is the catalog doc 07 §2 asks for and neither editor has.
- **Canvas (centre)** — `ShipCanvas`: the hull read-only, with fitted parts drawn from
  `shipSilhouette()`, empty slots as click targets, the CG marker, and the radiation cone
  driven from the **reactor's actual station** rather than the hull's hand-authored
  `shadow_cone` field (`HullEditor.tsx:531-535` already says this is editor 2's job).
- **Inspector (right)** — per selection: a fitting (module, magazine mix **as a sub-panel of
  the mount**, per doc 07's NEBULOUS convention), a manifest entry, a tank (propellant,
  count, jettison order), a mode (per-component duties).
- **Rail** — mass · Δv · power · heat · crew · cost · volume, the seven doc 07 names, with
  the **operating-mode selector above it** driving every power/heat figure (`gallery/05` §7).
- **Strip** — **loadout variants on the same hull**, each plate rendering *that craft's*
  silhouette. That is editor 2's acceptance criterion made visible rather than merely
  asserted in a test.

### 3.5 Closing the doc 07 §2 gaps in the hull editor

Extraction gives these to both editors at once:

| gap | fix |
|---|---|
| Budget bar carries geometry, not budgets | the rail becomes `RailStat[]`; the hull keeps geometry stats but gains mass/volume |
| No catalog search, no polity/bus filter, no drag-to-add | the catalog pane, shared |
| CG overlay never wired (`cgStation` implemented in `render.ts:337`, no caller) | the ship editor passes it; the hull editor gets it when a craft is selected |
| Fleet strip not polity-filtered, capped at 8, each plate self-scales | filter by operator, draw at common scale |
| Mount `facing`, `arc_deg`, `iface` have no inspector fields | add to the slot branch |
| Mount class/size are free text, not the spec enum | make them selects |
| Hover tooltip cards with the full stat block | on canvas parts and catalog rows |
| Terra Invicta hardpoint chip row (n turret / n cell / n utility) | a compact summary in the toolbar |

**Deliberately still not built**: thermal shadow (view-factor blocking and plume
impingement), the four variant deltas, the fleet sheet, CoaDE plot panels. All already
recorded in `08`.

---

## 4. Order of work

1. **Label fix + armour-zone inspector branch.** Small, self-contained, immediately visible.
   Fix `toSvg` in the same change.
2. **Glyphs**: per-family growth table, six weapon redraws, radiator aspect, plan views,
   spinal fallback. Probe-verified against `docs/refs/Weapons/`.
3. **Hull presets**: measure the reference, author eleven classes, wire "new hull from class".
4. **Shell extraction**, steps 1–5 as a pure refactor, then the CSS rename in its own commit.
5. **Ship editor** on the extracted shell.
6. **Doc 07 gap closure** across both editors.

1–3 are independent of 4–6 and can land in either order; 5 depends on 4.

## Verification

Per `docs/CLAUDE.md`, `npm run typecheck` and `npm test` must be clean before any commit.

- `npm run typecheck && npm test` — 446 tests today. Note they are **all core-only**
  (`vitest.config.ts` is `environment: node`, `tests/**/*.test.ts`), so they will stay green
  through a total UI rewrite. They are not the safety net for §3.
- `npm run build && npx vite preview`, then `node scripts/ui-smoke-hull.mjs` and
  `node scripts/ui-smoke-ship.mjs`. **These are the real regression surface for the UI work.**
- **Before touching anything in §3: widen `ui-smoke-hull.mjs` against the current code** to
  cover the `Cone`, `Ghost` and `Parts` toggles, an appendage drag, and `Conform all` —
  assertions written after a refactor only encode whatever the refactor did. Archive
  `screenshots/hull-*.png` and diff by eye afterwards; for a pure extraction the success
  criterion is *an identical picture*.
- `npx tsx scripts/hull-style-probe.mts` for §1 — compare each swatch against its reference.
- A new `scripts/ui-smoke-ship-editor.mjs` for §3.4, added to the command block in
  `docs/CLAUDE.md`. Leave `ui-smoke-ship.mjs` as the kernel-through-record-editor check.
- Treat `git diff -M --stat` as the review artefact for the extraction steps: they are
  *moves*, so near-zero net line change. A step that adds logic to `HullEditor.tsx` is a step
  that went wrong.

## Open questions

- **Hull ladder.** The table in §2 is a starting point anchored on the 138 m DD, not a
  measurement. Confirm or correct once the reference has been measured.
- **MN.** Read as "monitor". The existing monitor preset uses the code `BM`; say which code
  the hull class should carry.
- **Round mass above 450 mm.** The three ruled anchors stop there; a 600 mm shell
  extrapolates to 3.2 t and is flagged as extrapolated. A fourth anchor would remove the
  guesswork.
- **`max_gimbal_deg`** is still unsupplied, so the thrust-line check reports the angle a
  design needs and asserts nothing.
