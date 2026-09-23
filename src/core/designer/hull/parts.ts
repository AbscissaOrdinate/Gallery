/**
 * External fittings — the parts that hang off a hull and make a fleet look
 * like one navy.
 *
 * ## What is in here and what is not
 *
 * **External components only**: radiators, turrets, point defence, antennas
 * and radar, optics, tanks, thrusters, docking rings. Internal components — a
 * magazine, a CIC, a reactor — occupy section volume and do not appear in the
 * silhouette at all. Showing them as boxes is a later option, not a need.
 *
 * ## Parametric, not hand-drawn
 *
 * A part is generated from its kind, its size class and the polity's chosen
 * family. Nobody types polygons. That matters because it is the only way the
 * rhythm of a fleet — the same radiator family, the same turret face, across
 * twenty classes — survives contact with hand authoring, and because without
 * it a style kit is a list of names with no geometry behind it.
 *
 * The six weapon families with references in `docs/refs/Weapons/` (bandit,
 * beam, CIWS, laser, plasma, rocket; a side and a top view each, all pointing
 * forward) are drawn from them — shape only, low fidelity, no paint.
 *
 * ## Frame
 *
 * A part outline is built in **part-local metres**: `+x` runs aft along the
 * hull (so a barrel points toward `−x`), `+y` runs outward from the skin, and
 * the origin sits on the hull surface at the slot.
 *
 * ## Two views, one generator
 *
 * Every family draws **both** views from one function, so they cannot drift:
 *
 *  - **profile** — seen side-on to its outward axis. What a dorsal mount looks
 *    like in the side elevation.
 *  - **plan** — seen straight down its outward axis, the second axis being
 *    lateral and centred on zero. The reference `*_top.png` images.
 *
 * Which view a mount shows depends on where it is and where the eye is. In the
 * side elevation a dorsal or ventral mount shows its profile and a beam mount
 * is seen down its own axis, i.e. its plan. In the plan view the roles swap:
 * a dorsal mount is seen down its axis and a beam mount side-on.
 * `partsForHull` makes that choice; the generators only draw.
 *
 * ## Growth
 *
 * A bigger size class does not scale a part uniformly — an XL gun as fat as it
 * is long was the bug. Each family grows along two axes at its own rate, in the
 * one table `GROWTH` below (ruled 2026-09-20, `gallery/09` §1.2).
 */
import type { Appendage, ExternalSlot, HullGeometry } from "./types";
import { beamAt, halfHeightAt } from "./geometry";
import { exhaustLocal, slotOrientation, toShip, turn } from "./orientation";

/** The external fittings a silhouette shows. */
export type PartKind = "radiator" | "turret" | "pd" | "antenna" | "radar" | "optics" | "tank" | "thruster" | "dock";

export type SizeClass = "S" | "M" | "L" | "XL";

/** Which way a part is being looked at. The same vocabulary as `Appendage.plane`. */
export type View = "profile" | "plan";

/** Base scale in metres for each size class. */
const SIZE_M: Record<SizeClass, number> = { S: 2, M: 4, L: 8, XL: 14 };

/** The size every growth rate is measured from: an M part is drawn at its base dimensions. */
const BASE = SIZE_M.M;

/**
 * The visual families a style kit chooses between. These are the choice that
 * makes a polity recognisable, so they are a closed set rather than free text:
 * a name with no generator behind it draws nothing.
 */
export interface PartFamilies {
  radiator?: RadiatorFamily;
  /** Panels in a radiator array. A class differs from its sisters by this, not by family. */
  radiator_panels?: number;
  /** Radiator rake: positive forward, negative aft. */
  radiator_sweep_deg?: number;
  /**
   * Height over along-hull length for a radiator, at size M. Clamped to at
   * least 1: radiators stay taller than wide (ruled 2026-09-20).
   */
  radiator_aspect?: number;
  turret?: "box" | "barbette" | "cupola";
  tank?: "barrel" | "spherical" | "conformal";
  thruster?: "bell" | "block" | "cluster";
  antenna?: "dish" | "phased-panel" | "whip";
}

export type RadiatorFamily = "fin" | "panel" | "droplet-boom" | "spine-array" | "hoop" | "membrane";

/**
 * What a turret looks like depends on what is in it. A CIWS must not read as a
 * railgun and a VLS must not read as a particle beam.
 *
 * Weapons that work the same way share a shape and are told apart by scale
 * instead: every barrel weapon — cannon, railgun, coilgun, ETC, recoilless,
 * mass driver — is a gunhouse and barrels, sized by bore and barrel count.
 * Everything with a different mechanism gets its own silhouette.
 */
export type WeaponFamily =
  | "gun" // cannon, railgun, coilgun, ETC, recoilless, mass driver
  | "cell" // VLS, MLS, CLS, TLS — flush vertical cells
  | "rocket" // RL-series tube bundles
  | "arm" // one-armed bandit: a hammer head on a column
  | "laser" // a ball turret on a pedestal
  | "plasma" // a casemate with a long coil-wound barrel
  | "particle" // particle beam: a long, low wedge
  | "ciws"; // point defence fitted as a turret

export interface PartSpec {
  kind: PartKind;
  size?: SizeClass | number;
  families?: PartFamilies;
  weapon?: WeaponFamily;
  /** Bore in millimetres, from a mount's `ammo_mm`. Sets barrel length and thickness. */
  bore_mm?: number;
  /** Barrels in the mounting. Widens the gunhouse and draws one barrel each. */
  barrels?: number;
  /** Cells or tubes, from a launcher's `cells_capacity`. Sets how many are drawn. */
  cells?: number;
  /** Panels in a radiator array. */
  panels?: number;
  /** Radiator sweep: positive rakes forward, negative aft. */
  sweep_deg?: number;
  /**
   * Linear scale on the whole part, above whatever its size class gives.
   *
   * This is how a radiator ends up drawn in proportion to what it actually
   * rejects. It applies to **both** axes, whatever the family's growth rates,
   * so the drawn area goes as the square of this — a caller wanting area
   * proportional to rejection passes `√(reject / reference)`. Clamped at both
   * ends so a rounding error or a zero-rejection radiator cannot make a part
   * vanish or swallow the hull.
   */
  scale?: number;
}

type Outline = [number, number][];

/**
 * A part is a **list** of polygons, not one.
 *
 * A gun turret is a mounting plus a barrel; a cluster thruster is two nozzles
 * side by side. Concatenating those into a single point list makes a
 * self-intersecting polygon, and SVG fills it by the nonzero rule — so a
 * cluster came out as a bowtie and every barrel as a wedge. Separate pieces
 * are what they actually are.
 */
type Part = Outline[];

/** One part in both views, from one generator. */
type Views = Record<View, Part>;

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

/** What grows at its own rate: a weapon family, or a non-weapon kind. */
export type GrowthKey = WeaponFamily | "pd" | "radiator" | "tank-round" | "tank-long" | "antenna" | "radar" | "optics" | "dock" | "thruster";

/**
 * How each family grows with its size class — the whole of `gallery/09` §1.2
 * in one place.
 *
 * Each rate is an exponent on the size relative to M: a part's along-hull
 * dimension is `4 m × (size / M)^along` and its outward one
 * `4 m × (size / M)^out`. So an M part is drawn at its base size whatever the
 * rates, 1 means "grows in step with the size class" and 0 "never grows".
 *
 *  - **gun-like** (gun, plasma, particle, CIWS): the barrel lengthens at the
 *    full rate and the gunhouse expands more slowly — both grow, the barrel
 *    faster. A point-defence mount is a CIWS, so it grows like one.
 *  - **laser, spherical tank**: spheres, so both axes grow together.
 *  - **cell, rocket**: nothing grows. A bigger launcher has *more* tubes at a
 *    fixed size — see `DEFAULT_COUNT`.
 *  - **radiator**: each *panel* extends outward and never widens. An array of
 *    three panels is three panel-widths long — the array grows by panels,
 *    each panel by height.
 *  - **barrel / conformal tank**: lengthens, barely thickens.
 *  - **masts** (antenna, radar, optics, dock) grow outward; a **thruster**
 *    grows aft. The secondary axis at half rate is a styling choice, not a
 *    ruling, and is the number to change if they read wrong.
 *  - **arm**: the hammer head lengthens; the column rises more slowly.
 */
export const GROWTH: Readonly<Record<GrowthKey, { along: number; out: number }>> = {
  gun: { along: 1, out: 0.55 },
  plasma: { along: 1, out: 0.55 },
  particle: { along: 1, out: 0.55 },
  ciws: { along: 1, out: 0.55 },
  pd: { along: 1, out: 0.55 },
  arm: { along: 1, out: 0.75 },
  laser: { along: 1, out: 1 },
  "tank-round": { along: 1, out: 1 },
  cell: { along: 0, out: 0 },
  rocket: { along: 0, out: 0 },
  radiator: { along: 0, out: 1 },
  "tank-long": { along: 1, out: 0.3 },
  antenna: { along: 0.5, out: 1 },
  radar: { along: 0.5, out: 1 },
  optics: { along: 0.5, out: 1 },
  dock: { along: 0.5, out: 1 },
  thruster: { along: 1, out: 0.5 },
};

/**
 * Rocket tubes per launcher at size M, when the fitted module does not say.
 * The count scales with the size class, the tube itself never. A module's own
 * `launch_cells` always wins.
 */
const DEFAULT_COUNT = { rocket: 6 } as const;

/**
 * VLS cells by size class, when the fitted module does not say (ruled
 * 2026-09-23): S 8 (4 × 2), M 16 (6 × 3 less two), L 32 (8 × 4), XL 48
 * (10 × 5 less two). A module's own `launch_cells` always wins, and is drawn
 * cell for cell.
 */
const CELLS_BY_SIZE: Record<SizeClass, number> = { S: 8, M: 16, L: 32, XL: 48 };

/** The size class a size stands for: itself, or the class nearest a size given in metres. */
function sizeClassOf(size: PartSpec["size"]): SizeClass {
  if (typeof size === "string" && size.toUpperCase() in SIZE_M) return size.toUpperCase() as SizeClass;
  const m = span(size);
  return (Object.keys(SIZE_M) as SizeClass[]).reduce((best, k) => (Math.abs(Math.log(SIZE_M[k] / m)) < Math.abs(Math.log(SIZE_M[best] / m)) ? k : best), "M");
}

/** Guard against a typo drawing ten thousand polygons. Not a design limit. */
const MAX_COUNT = 256;

/** Span in metres for a size class, or a number taken as metres directly. */
function span(size: PartSpec["size"]): number {
  if (typeof size === "number" && Number.isFinite(size) && size > 0) return size;
  return SIZE_M[(typeof size === "string" ? size.toUpperCase() : "M") as SizeClass] ?? SIZE_M.M;
}

/** Keep a scaled part recognisable: an eighth of its class at worst, triple at most. */
const clampScale = (v: number | undefined): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(3, Math.max(0.125, v)) : 1);

/** A family's along-hull (`A`) and outward (`O`) dimensions for a size, in metres. */
function dims(size: PartSpec["size"], key: GrowthKey, scale: number): { A: number; O: number; s: number } {
  const s = span(size) / BASE;
  const g = GROWTH[key];
  return { A: BASE * s ** g.along * scale, O: BASE * s ** g.out * scale, s };
}

/** Tubes or cells for a launcher: the module's own figure, else the size class's. */
function countFor(explicit: number | undefined, fallback: number): number {
  const n = typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0 ? explicit : fallback;
  return Math.max(2, Math.min(MAX_COUNT, Math.round(n)));
}

/**
 * Lay `n` tubes out as a bundle about twice as wide as it is deep: 18 tubes is
 * 3 × 6, which is what the rocket reference shows — three rows side-on, six
 * abreast from above. It is also exactly the ruled VLS grids: 8 is 4 × 2, 16 is
 * 6 × 3 less two, 32 is 8 × 4, 48 is 10 × 5 less two.
 */
export function bundle(n: number): { rows: number; cols: number } {
  const rows = Math.max(1, Math.round(Math.sqrt(n / 2)));
  return { rows, cols: Math.ceil(n / rows) };
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/** Signed area, positive counter-clockwise with y up. */
function signedArea(o: Outline): number {
  let twice = 0;
  for (let i = 0; i < o.length; i++) {
    const [x0, y0] = o[i] as [number, number];
    const [x1, y1] = o[(i + 1) % o.length] as [number, number];
    twice += x0 * y1 - x1 * y0;
  }
  return twice / 2;
}

/** Wind a ring counter-clockwise, so every piece fills and measures the same way. */
const ccw = (o: Outline): Outline => (signedArea(o) < 0 ? [...o].reverse() : o);

/** A box from (x0,y0) to (x1,y1). */
const box = (x0: number, y0: number, x1: number, y1: number): Outline =>
  ccw([
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]);

/** An `n`-gon standing in for an ellipse. Reads as round at plate size and needs no curves. */
function ellipse(cx: number, cy: number, rx: number, ry: number, n = 12): Outline {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n + Math.PI / n;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as [number, number];
  });
}

/** A `len` × `wid` bar whose base centre sits at (cx, cy), pointing along (dx, dy). */
function strut(cx: number, cy: number, dx: number, dy: number, len: number, wid: number): Outline {
  const m = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / m, dy / m];
  const [nx, ny] = [-uy * (wid / 2), ux * (wid / 2)];
  return ccw([
    [cx + nx, cy + ny],
    [cx - nx, cy - ny],
    [cx - nx + ux * len, cy - ny + uy * len],
    [cx + nx + ux * len, cy + ny + uy * len],
  ]);
}

const shift = (p: Part, dx: number, dy = 0): Part => p.map((o) => o.map(([x, y]) => [x + dx, y + dy] as [number, number]));

/** Both views shifted along the hull — the non-weapon generators draw from x = 0 and are centred after. */
const shiftViews = (v: Views, dx: number): Views => ({ profile: shift(v.profile, dx), plan: shift(v.plan, dx) });

/** Centre a part across the axis instead of along the hull, for axial parts. */
const centreY = (p: Part, h: number): Part => shift(p, 0, -h / 2);

// ---------------------------------------------------------------------------
// Mountings — the polity's signature under a weapon
// ---------------------------------------------------------------------------

type MountFamily = PartFamilies["turret"];

/**
 * The mounting in the polity's family, side-on. For a gun it *is* the
 * gunhouse; for the reference-drawn weapons it is the footing under them, where
 * the references have their own base plate. That is how a laser in a UJCN
 * barbette and one in a CDN box still read as two navies.
 */
function mountProfile(family: MountFamily, x0: number, x1: number, y0: number, y1: number): Outline {
  const len = x1 - x0;
  const h = y1 - y0;
  if (family === "barbette") {
    return ccw([
      [x0, y0],
      [x1, y0],
      [x1 - len * 0.14, y1],
      [x0 + len * 0.14, y1],
    ]);
  }
  if (family === "cupola") {
    return ccw([
      [x0, y0],
      [x1, y0],
      [x1, y0 + h * 0.45],
      [x1 - len * 0.22, y1],
      [x0 + len * 0.22, y1],
      [x0, y0 + h * 0.45],
    ]);
  }
  return box(x0, y0, x1, y1);
}

/** The same mounting from above: a barbette is a ring, a cupola is round, a box is a box. */
function mountPlan(family: MountFamily, cx: number, len: number, width: number): Outline {
  if (family === "barbette") return ellipse(cx, 0, len / 2, width / 2, 8);
  if (family === "cupola") return ellipse(cx, 0, len / 2, width / 2, 12);
  return box(cx - len / 2, -width / 2, cx + len / 2, width / 2);
}

// ---------------------------------------------------------------------------
// Weapons. Each is centred on its slot along the hull and points forward (−x).
// ---------------------------------------------------------------------------

/**
 * Every barrel weapon. Bore sets barrel length and thickness; barrel count
 * widens the gunhouse and draws one tube each. A 450 mm Mk66 and a 300 mm Mk81
 * are the same shape at different scales, which is right — they work the same
 * way. The barrel grows with `A` and the gunhouse with `O`: the barrel faster.
 */
function gun(A: number, O: number, family: MountFamily, spec: PartSpec): Views {
  const barrels = Math.max(1, Math.min(4, Math.round(spec.barrels ?? 1)));
  const bore = spec.bore_mm && spec.bore_mm > 0 ? spec.bore_mm : 200;
  const calibre = Math.min(2.6, 0.9 + bore / 300); // longer barrels on bigger bores
  const hh = O * 0.55;
  const hl = O * (1 + (barrels - 1) * 0.22);
  const hw = O * (0.8 + (barrels - 1) * 0.18);
  const tube = Math.max(hh * 0.1, Math.min(hh * 0.42, (bore / 1000) * (O / 4)));
  const reach = A * calibre;
  const profile: Part = [mountProfile(family, -hl / 2, hl / 2, 0, hh)];
  const plan: Part = [mountPlan(family, 0, hl, hw)];
  for (let i = 0; i < barrels; i++) {
    // Side-on the barrels are fanned vertically so their count reads; from
    // above they lie abreast, which is where they really are.
    const y = barrels === 1 ? hh * 0.62 : hh * (0.34 + (0.52 * i) / (barrels - 1));
    profile.push(box(-reach, y - tube / 2, 0, y + tube / 2));
    const w = barrels === 1 ? 0 : hw * 0.6 * (i / (barrels - 1) - 0.5);
    plan.push(box(-reach, w - tube / 2, 0, w + tube / 2));
  }
  return { profile, plan };
}

/** Pitch of one launch cell. Four of them are exactly what an M slot always drew. */
const CELL_PITCH = BASE / 4;

/**
 * VLS and its relatives: a flush deck of hatches, no mounting at all. A bigger
 * launcher is more cells at the same pitch. Side-on only the row along the
 * hull shows; from above, every cell does.
 */
function cell(n: number, k: number): Views {
  const p = CELL_PITCH * k;
  const { rows, cols } = bundle(n);
  const len = cols * p;
  const deck = p * 1.21;
  const x0 = -len / 2;
  const profile: Part = [box(x0, 0, -x0, deck)];
  for (let c = 0; c < cols; c++) profile.push(box(x0 + c * p + p * 0.18, deck, x0 + c * p + p * 0.82, deck * 1.45));
  const w0 = (-rows * p) / 2;
  const plan: Part = [box(x0, w0, -x0, -w0)];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    plan.push(box(x0 + c * p + p * 0.18, w0 + r * p + p * 0.18, x0 + c * p + p * 0.82, w0 + r * p + p * 0.82));
  }
  return { profile, plan };
}

/** One rocket tube. Fixed: a bigger launcher has more of them, never fatter ones. */
const TUBE_LEN = BASE * 1.1;
const TUBE_D = TUBE_LEN * 0.085;

/**
 * `rocket_side.png` / `rocket_top.png`: a bundle of long tubes running
 * fore-and-aft with open muzzles forward, on a cradle over a base plate. Rows
 * stack side-on; columns lie abreast from above.
 */
function rocket(n: number, k: number, family: MountFamily): Views {
  const tl = TUBE_LEN * k;
  const td = TUBE_D * k;
  const { rows, cols } = bundle(n);
  const plate = tl * 0.04;
  const cradle = Math.max(rows * td * 1.1, tl * 0.22);
  const profile: Part = [mountProfile(family, -tl * 0.36, tl * 0.36, 0, plate), box(-tl * 0.12, plate, tl * 0.2, plate + cradle)];
  for (let r = 0; r < rows; r++) {
    const y = plate + cradle + r * td;
    profile.push(box(-tl * 0.55, y, tl * 0.45, y + td * 0.86));
  }
  const plan: Part = [mountPlan(family, 0, tl * 0.8, Math.max(cols * td * 1.3, tl * 0.8))];
  for (let c = 0; c < cols; c++) {
    const w = (c - (cols - 1) / 2) * td;
    plan.push(box(-tl * 0.55, w - td * 0.43, tl * 0.45, w + td * 0.43));
  }
  return { profile, plan };
}

/**
 * `bandit_side.png` / `bandit_top.png`: a squat hammer head on a narrow
 * column, the head wider than the base and raked up toward the muzzle end.
 * From above, a square base with the head as a bar along it.
 */
function arm(A: number, O: number, family: MountFamily): Views {
  const plate = O * 0.06;
  const neck = O * 0.62;
  const rise = O * 0.18;
  const thick = O * 0.26;
  const foot = neck - O * 0.04;
  return {
    profile: [
      mountProfile(family, -A * 0.37, A * 0.37, 0, plate),
      ccw([
        [-A * 0.13, plate],
        [A * 0.13, plate],
        [A * 0.09, neck],
        [-A * 0.09, neck],
      ]),
      ccw([
        [A * 0.42, foot],
        [A * 0.42, foot + thick],
        [-A * 0.5, foot + rise + thick],
        [-A * 0.5, foot + rise],
      ]),
    ],
    plan: [mountPlan(family, 0, A * 1.1, A * 1.1), ellipse(0, 0, A * 0.16, A * 0.16), box(-A * 0.5, -A * 0.11, A * 0.42, A * 0.11)],
  };
}

/**
 * `laser_side.png` / `laser_top.png`: a ball turret sitting down into a yoke
 * on a short pedestal, with a circular lens on the forward face. From above,
 * the ball with its housing running aft. A sphere, so it grows uniformly.
 */
function laser(A: number, O: number, family: MountFamily): Views {
  const D = Math.min(A, O) * 0.9;
  const r = D / 2;
  const plate = D * 0.06;
  const ped = D * 0.3;
  const cy = plate + ped + r * 0.9;
  return {
    profile: [
      mountProfile(family, -D * 0.55, D * 0.55, 0, plate),
      ccw([
        [-D * 0.42, plate],
        [D * 0.42, plate],
        [D * 0.3, plate + ped],
        [-D * 0.3, plate + ped],
      ]),
      ellipse(0, cy, r, r, 16),
      box(-r - D * 0.1, cy - D * 0.2, -r + D * 0.06, cy + D * 0.2),
    ],
    plan: [
      mountPlan(family, 0, D * 1.1, D * 1.1),
      box(0, -D * 0.26, r + D * 0.35, D * 0.26),
      ellipse(0, 0, r, r, 16),
      box(-r - D * 0.1, -D * 0.2, -r + D * 0.06, D * 0.2),
    ],
  };
}

/**
 * `plasma_side.png` / `plasma_top.png`: a low casemate with a sloped forward
 * face, a long coil-wound barrel leaving it forward — banded along its length,
 * with a muzzle assembly — and capacitor cylinders canted up and aft. From
 * above, the cylinders sit side by side at the aft edge.
 */
function plasma(A: number, O: number, family: MountFamily): Views {
  const bl = O * 1.1;
  const bh = O * 0.45;
  const plate = O * 0.05;
  const top = plate + bh;
  const bore = bh * 0.14;
  const by = plate + bh * 0.62;
  const x0 = -bl * 0.2;
  const len = A * 0.75;
  const bands = [0.2, 0.42, 0.64].map((f) => x0 - len * f);
  const muzzle = (w: number, c: number): Outline => box(x0 - len * 1.06, c - w, x0 - len * 0.95, c + w);
  return {
    profile: [
      mountProfile(family, -bl * 0.55, bl * 0.55, 0, plate),
      ccw([
        [-bl * 0.5, plate],
        [bl * 0.5, plate],
        [bl * 0.5, top],
        [-bl * 0.22, top],
        [-bl * 0.5, plate + bh * 0.45],
      ]),
      box(x0 - len, by - bore / 2, x0, by + bore / 2),
      ...bands.map((x) => box(x - len * 0.035, by - bore * 0.9, x + len * 0.035, by + bore * 0.9)),
      muzzle(bore * 1.1, by),
      strut(bl * 0.3, top, 0.57, 0.82, bh * 1.2, bh * 0.55),
    ],
    plan: [
      mountPlan(family, 0, bl * 1.2, bl * 1.2),
      box(-bl * 0.5, -bl * 0.35, bl * 0.42, bl * 0.35),
      box(x0 - len, -bore / 2, x0, bore / 2),
      ...bands.map((x) => box(x - len * 0.035, -bore * 0.9, x + len * 0.035, bore * 0.9)),
      muzzle(bore * 1.1, 0),
      ellipse(bl * 0.45, bl * 0.17, bl * 0.14, bl * 0.14),
      ellipse(bl * 0.45, -bl * 0.17, bl * 0.14, bl * 0.14),
    ],
  };
}

/**
 * `beam_side.png` / `beam_top.png`: a long, low wedge lying along the hull,
 * very flat, with a raised deck amidships and the emitter at the front. From
 * above, an elongated hexagon chamfered aft with a prominent tube along the
 * forward half. No mounting: it lies on the hull rather than standing off it.
 */
function particle(A: number, O: number): Views {
  const len = A * 2;
  const h = O * 0.28;
  const w = O * 0.9;
  const xf = -len / 2;
  const xa = len / 2;
  return {
    profile: [
      ccw([
        [xf, 0],
        [xa, 0],
        [xa, h * 0.35],
        [xa - len * 0.12, h],
        [xf + len * 0.02, h],
        [xf, h * 0.7],
      ]),
      ccw([
        [-len * 0.2, h],
        [len * 0.28, h],
        [len * 0.2, h * 1.35],
        [-len * 0.12, h * 1.35],
      ]),
      box(xf - len * 0.05, h * 0.2, xf + len * 0.01, h * 0.75),
    ],
    plan: [
      ccw([
        [xf, -w * 0.42],
        [xa - len * 0.25, -w * 0.5],
        [xa, -w * 0.18],
        [xa, w * 0.18],
        [xa - len * 0.25, w * 0.5],
        [xf, w * 0.42],
      ]),
      box(xf - len * 0.02, -w * 0.1, len * 0.02, w * 0.1),
      box(xf - len * 0.05, -w * 0.14, xf + len * 0.01, w * 0.14),
    ],
  };
}

/**
 * `CIWS_side.png` / `CIWS_top.png`: a compact, boxy body with a fire-control
 * dish on a short mast, and a short barrel cluster projecting forward — a
 * thick shroud, then the barrels. Deliberately unlike a main turret at a
 * glance. A point-defence slot is one of these too.
 */
function ciws(A: number, O: number): Views {
  const bl = O * 0.75;
  const bh = O * 0.5;
  const by = bh * 0.45;
  const front = -bl / 2;
  return {
    profile: [
      ccw([
        [-bl / 2, 0],
        [bl / 2, 0],
        [bl * 0.42, bh],
        [-bl * 0.42, bh],
      ]),
      box(-bl * 0.03, bh, bl * 0.03, bh * 1.3),
      ellipse(0, bh * 1.55, bl * 0.09, bh * 0.28),
      box(front - A * 0.25, by - bh * 0.12, front + bl * 0.05, by + bh * 0.12),
      box(front - A * 0.75, by - bh * 0.05, front - A * 0.25, by + bh * 0.05),
    ],
    plan: [
      ccw([
        [-bl / 2, -bl * 0.35],
        [-bl * 0.35, -bl / 2],
        [bl * 0.35, -bl / 2],
        [bl / 2, -bl * 0.35],
        [bl / 2, bl * 0.35],
        [bl * 0.35, bl / 2],
        [-bl * 0.35, bl / 2],
        [-bl / 2, bl * 0.35],
      ]),
      box(front - A * 0.25, -bh * 0.14, front + bl * 0.05, bh * 0.14),
      box(front - A * 0.75, -bh * 0.06, front - A * 0.25, bh * 0.06),
      ellipse(0, 0, bl * 0.12, bl * 0.12),
    ],
  };
}

/** A turret is whatever weapon is in it, on the polity's mounting where the weapon has one. */
function turret(spec: PartSpec, family: MountFamily, k: number): Views {
  const weapon = spec.weapon ?? "gun";
  switch (weapon) {
    case "gun": {
      const { A, O } = dims(spec.size, "gun", k);
      return gun(A, O, family, spec);
    }
    case "cell":
      return cell(countFor(spec.cells, CELLS_BY_SIZE[sizeClassOf(spec.size)]), k);
    case "rocket":
      return rocket(countFor(spec.cells, DEFAULT_COUNT.rocket * dims(spec.size, "rocket", 1).s), k, family);
    case "arm": {
      const { A, O } = dims(spec.size, "arm", k);
      return arm(A, O, family);
    }
    case "laser": {
      const { A, O } = dims(spec.size, "laser", k);
      return laser(A, O, family);
    }
    case "plasma": {
      const { A, O } = dims(spec.size, "plasma", k);
      return plasma(A, O, family);
    }
    case "particle": {
      const { A, O } = dims(spec.size, "particle", k);
      return particle(A, O);
    }
    case "ciws": {
      const { A, O } = dims(spec.size, "ciws", k);
      return ciws(A, O);
    }
  }
}

// ---------------------------------------------------------------------------
// Radiators
// ---------------------------------------------------------------------------

/** The style kit's radiator aspect when it does not set one. */
export const DEFAULT_RADIATOR_ASPECT = 1.35;

/**
 * Each family's character: the height:span ratio it was drawn at before the
 * aspect became a kit setting, relative to `panel` (the default family).
 */
const RADIATOR_CHARACTER: Record<RadiatorFamily, number> = {
  fin: 1.45 / 1.25,
  panel: 1,
  hoop: 1.2 / 1.25,
  "spine-array": 1.15 / 1.25,
  "droplet-boom": 1.1 / 1.25,
  membrane: 0.75 / 1.25,
};

const clampAspect = (v: number): number => (Number.isFinite(v) ? Math.max(1, v) : DEFAULT_RADIATOR_ASPECT);

/**
 * The height:span ratio a radiator family is drawn at, for a kit aspect.
 *
 * `panel` draws at exactly the kit's aspect. The others keep their character
 * by moving **halfway (in log terms) toward it** rather than being replaced
 * outright — a fin stays taller than a panel, a membrane squatter. And none
 * goes below 1: radiators stay taller than wide (ruled 2026-09-20). That floor
 * is what changes `membrane`, the one family that used to be wider than tall.
 */
export function radiatorRatio(family: RadiatorFamily | undefined, aspect: number | undefined): number {
  const a = clampAspect(aspect ?? DEFAULT_RADIATOR_ASPECT);
  return Math.max(1, a * Math.sqrt(RADIATOR_CHARACTER[family ?? "panel"] ?? 1));
}

/**
 * Radiators, profile. `W` is **one panel's** width along the hull, which never
 * grows with size; `H` is the height, which does. An array of `panels` is
 * `panels × W` long — three radiators in a set are three times as wide as one
 * (ruled 2026-09-23), not one radiator cut into thirds. The family is the
 * polity's signature; `panels` and `sweep_deg` are how one class differs from
 * another in the same navy.
 */
function radiatorProfile(W: number, H: number, family: RadiatorFamily | undefined, panels: number, sweepDeg: number): Part {
  const n = Math.max(1, Math.min(8, Math.round(panels)));
  const A = n * W;
  const tan = Math.tan((Math.max(-60, Math.min(60, sweepDeg)) * Math.PI) / 180);
  /** Rake a piece: every point leans by its height times the sweep. */
  const rake = (o: Outline): Outline => o.map(([x, y]) => [x + y * tan, y] as [number, number]);
  /** One panel's pieces, drawn from `x0`, repeated `n` times along the hull. */
  const each = (unit: (x0: number) => Outline[]): Part => Array.from({ length: n }, (_, i) => unit(i * W)).flat().map(rake);

  switch (family) {
    case "droplet-boom":
      // Two booms with a droplet sheet between them, per panel.
      return each((x0) => [
        [
          [x0, 0],
          [x0 + W * 0.12, 0],
          [x0 + W * 0.12, H * 0.82],
          [x0 + W * 0.88, H * 0.82],
          [x0 + W * 0.88, 0],
          [x0 + W, 0],
          [x0 + W, H],
          [x0, H],
        ],
      ]);
    case "spine-array":
      // A boom the length of the array with a panel hung off it per panel:
      // the family that most obviously grows by adding panels.
      return [
        box(0, 0, A, H * 0.12),
        ...each((x0) => [
          [
            [x0 + W * 0.12, H * 0.12],
            [x0 + W * 0.88, H * 0.12],
            [x0 + W * 0.88, H],
            [x0 + W * 0.12, H],
          ],
        ]),
      ];
    case "hoop": {
      // A closed loop standing off a short pylon — a moving-belt radiator.
      const t = W * 0.1;
      return each((x0) => [
        box(x0 + W * 0.45, 0, x0 + W * 0.55, H * 0.25),
        box(x0, H * 0.25, x0 + W, H),
        // The hole, wound the same way so it reads as a rim at plate size.
        box(x0 + t, H * 0.25 + t, x0 + W - t, H - t),
      ]);
    }
    case "membrane":
      // A slack sheet between two spars: obviously not rigid. Taller than wide
      // now, like every radiator.
      return each((x0) => [
        [
          [x0, 0],
          [x0 + W, 0],
          [x0 + W * 0.94, H * 0.55],
          [x0 + W * 0.72, H],
          [x0 + W * 0.28, H],
          [x0 + W * 0.06, H * 0.55],
        ],
      ]);
    case "fin":
      // Swept triangular fins, one per panel.
      return each((x0) => [
        [
          [x0, 0],
          [x0 + W, 0],
          [x0 + W * 0.62, H],
          [x0 + W * 0.18, H],
        ],
      ]);
    case "panel":
    default: {
      // Flat rectangular panels on a short stalk.
      const stalk = H * 0.16;
      return each((x0) => [
        [
          [x0 + W * 0.42, 0],
          [x0 + W * 0.58, 0],
          [x0 + W * 0.58, stalk],
          [x0 + W, stalk],
          [x0 + W, H],
          [x0, H],
          [x0, stalk],
          [x0 + W * 0.42, stalk],
        ],
      ]);
    }
  }
}

/**
 * A radiator from above is its panels edge-on: every piece becomes a thin
 * strip across its own run along the hull. A radiator is a sheet, and the
 * honest plan of a sheet is a line with just enough thickness to be seen.
 */
function radiatorPlan(profile: Part, W: number): Part {
  const t = Math.max(0.12, W * 0.03);
  return profile.map((o) => {
    const xs = o.map(([x]) => x);
    return box(Math.min(...xs), -t / 2, Math.max(...xs), t / 2);
  });
}

// ---------------------------------------------------------------------------
// Everything else. Drawn from x = 0 and centred on the slot afterwards.
// ---------------------------------------------------------------------------

function antenna(A: number, O: number, family: PartFamilies["antenna"]): Views {
  switch (family) {
    case "phased-panel":
      return {
        profile: [box(A * 0.35, 0, A * 0.65, O * 0.3), box(0, O * 0.3, A, O * 0.45)],
        plan: [box(A * 0.35, -A * 0.1, A * 0.65, A * 0.1), box(0, -A * 0.06, A, A * 0.06)],
      };
    case "whip":
      return { profile: [box(A * 0.45, 0, A * 0.55, O * 2.4)], plan: [ellipse(A * 0.5, 0, A * 0.06, A * 0.06, 8)] };
    case "dish":
    default: {
      // A mast with a dish canted off it.
      const r = A * 0.5;
      const mastTop = O * 0.9;
      return {
        profile: [
          box(A * 0.45, 0, A * 0.55, mastTop),
          ccw([
            [A * 0.5 - r, mastTop],
            [A * 0.5 + r, mastTop],
            [A * 0.5 + r * 0.6, mastTop + O * 0.55],
            [A * 0.5 - r * 0.6, mastTop + O * 0.55],
          ]),
        ],
        plan: [ellipse(A * 0.5, 0, r, r * 0.9), box(A * 0.45, -A * 0.05, A * 0.55, A * 0.05)],
      };
    }
  }
}

/** Search radar: a flat rotating array on a short mast. From above, the array's bar over its mast. */
function radar(A: number, O: number): Views {
  return {
    profile: [box(A * 0.42, 0, A * 0.58, O * 0.55), box(0, O * 0.55, A, O * 0.78)],
    plan: [ellipse(A * 0.5, 0, A * 0.1, A * 0.1, 8), box(0, -A * 0.07, A, A * 0.07)],
  };
}

/** Optics: a small trunnioned ball on a pedestal. From above, the ball. */
function optics(A: number, O: number): Views {
  return {
    profile: [box(A * 0.4, 0, A * 0.6, O * 0.45), box(A * 0.18, O * 0.45, A * 0.82, O * 0.85)],
    plan: [ellipse(A * 0.5, 0, A * 0.32, A * 0.32)],
  };
}

function tank(A: number, O: number, family: PartFamilies["tank"]): Views {
  switch (family) {
    case "spherical": {
      // An octagon reads as a sphere at plate size and needs no curves.
      const r = Math.min(A, O) * 0.42;
      const k = r * 0.4142;
      return {
        profile: [
          [
            [A / 2 - k, 0],
            [A / 2 + k, 0],
            [A / 2 + r, k],
            [A / 2 + r, 2 * r - k],
            [A / 2 + k, 2 * r],
            [A / 2 - k, 2 * r],
            [A / 2 - r, 2 * r - k],
            [A / 2 - r, k],
          ],
        ],
        plan: [ellipse(A / 2, 0, r, r, 8)],
      };
    }
    case "conformal": {
      const d = O * 0.55;
      return {
        profile: [
          [
            [0, 0],
            [A, 0],
            [A * 0.88, d * 0.6],
            [A * 0.12, d * 0.6],
          ],
        ],
        // Flattened onto the skin, so wide from above.
        plan: [box(0, -d * 0.65, A, d * 0.65)],
      };
    }
    case "barrel":
    default: {
      // A barrel with domed ends, flattened onto the skin. Round in section, so
      // it is the same capsule from above, centred.
      const d = O * 0.55;
      const capsule: Outline = [
        [0, d * 0.35],
        [A * 0.12, 0],
        [A * 0.88, 0],
        [A, d * 0.35],
        [A, d * 0.8],
        [A * 0.88, d],
        [A * 0.12, d],
        [0, d * 0.8],
      ];
      return { profile: [capsule], plan: centreY([capsule], d) };
    }
  }
}

function thruster(A: number, O: number, family: PartFamilies["thruster"]): Part {
  const h = O * 0.7;
  switch (family) {
    case "block":
      return [box(0, 0, A, h)];
    case "cluster":
      return [box(0, 0, A * 0.44, h), box(A * 0.56, 0, A, h)];
    case "bell":
    default:
      // A throat opening into a bell, pointing aft.
      return [
        [
          [0, h * 0.2],
          [A * 0.45, h * 0.2],
          [A, 0],
          [A, h],
          [A * 0.45, h * 0.8],
          [0, h * 0.8],
        ],
      ];
  }
}

/** A docking ring: a collar standing off the skin side-on; a ring from above. */
function dock(A: number, O: number): Views {
  return {
    profile: [box(A * 0.2, 0, A * 0.8, O * 0.25), box(0, O * 0.25, A, O * 0.45)],
    plan: [ellipse(A / 2, 0, A * 0.5, A * 0.5, 16), ellipse(A / 2, 0, A * 0.3, A * 0.3, 16)],
  };
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Parts that point aft along the axis rather than outward from the skin. A
 * thruster bell that stood up off the hull like a radiator would be nonsense:
 * the exhaust has to leave astern. Axisymmetric, so both views are the same.
 */
const AXIAL: ReadonlySet<PartKind> = new Set<PartKind>(["thruster"]);

/**
 * Fittings that go all the way round the hull rather than sitting at one clock
 * angle. A radiator array is symmetric about the thrust axis — panels below
 * mean panels above — so one slot draws both sides.
 */
const RADIALLY_SYMMETRIC: ReadonlySet<PartKind> = new Set<PartKind>(["radiator"]);

/** One part in both views, in part-local metres. */
export function partViews(spec: PartSpec): Views {
  const f = spec.families ?? {};
  const k = clampScale(spec.scale);
  switch (spec.kind) {
    case "thruster": {
      // Extends aft from the slot and straddles the thrust line, so it reads
      // as a nozzle rather than a fin.
      const { A, O } = dims(spec.size, "thruster", k);
      const pieces = thruster(A, O, f.thruster);
      const h = Math.max(...pieces.flat().map(([, y]) => y));
      const centred = centreY(pieces, h);
      return { profile: centred, plan: centred };
    }
    case "radiator": {
      // `A` here is one panel's width: GROWTH holds it fixed, so a bigger
      // radiator is a taller panel and a longer array is more panels.
      const { A: W, O } = dims(spec.size, "radiator", k);
      const n = Math.max(1, Math.min(8, Math.round(spec.panels ?? f.radiator_panels ?? 1)));
      // Never wider than tall, panel by panel: an S panel is floored to square.
      const H = Math.max(W, O * radiatorRatio(f.radiator, f.radiator_aspect));
      const profile = shift(radiatorProfile(W, H, f.radiator, n, spec.sweep_deg ?? f.radiator_sweep_deg ?? 0), (-n * W) / 2);
      return { profile, plan: radiatorPlan(profile, W) };
    }
    case "turret":
      return turret(spec, f.turret, k);
    case "pd": {
      const { A, O } = dims(spec.size, "pd", k);
      return ciws(A, O);
    }
    case "antenna": {
      const { A, O } = dims(spec.size, "antenna", k);
      return shiftViews(antenna(A, O, f.antenna), -A / 2);
    }
    case "radar": {
      const { A, O } = dims(spec.size, "radar", k);
      return shiftViews(radar(A, O), -A / 2);
    }
    case "optics": {
      const { A, O } = dims(spec.size, "optics", k);
      return shiftViews(optics(A, O), -A / 2);
    }
    case "tank": {
      const { A, O } = dims(spec.size, f.tank === "spherical" ? "tank-round" : "tank-long", k);
      return shiftViews(tank(A, O, f.tank), -A / 2);
    }
    case "dock": {
      const { A, O } = dims(spec.size, "dock", k);
      return shiftViews(dock(A, O), -A / 2);
    }
  }
}

/** Build one part, as its pieces, in one view. Profile unless asked otherwise. */
export function makePart(spec: PartSpec, view: View = "profile"): Part {
  return partViews(spec)[view];
}

/**
 * Slot types the hull schema knows, mapped to what they look like. A slot type
 * with no external appearance of its own — a bay, a hangar that is a hole
 * rather than a box — maps to `undefined` and draws nothing.
 *
 * `spinal` maps to nothing *here*, because what it looks like is whatever
 * weapon is in it: `partsForHull` draws a spinal slot as its fitted weapon's
 * own profile along the axis, and an empty one as nothing.
 */
const SLOT_PART: Record<string, PartKind | undefined> = {
  turret: "turret",
  pd: "pd",
  radiator: "radiator",
  comms: "antenna",
  sensor: "radar",
  optics: "optics",
  tank: "tank",
  drive: "thruster",
  thruster: "thruster",
  dock: "dock",
  pod: "tank",
  external: undefined,
  spinal: undefined,
  hangar: undefined,
};

const norm = (theta_deg: number): number => ((theta_deg % 360) + 360) % 360;

/** True where a slot's clock angle points at or away from a side-on viewer. */
function isBeamOn(theta_deg: number): boolean {
  const t = norm(theta_deg);
  return (t > 45 && t < 135) || (t > 225 && t < 315);
}

/** What editor 2 knows about the module in a slot, once one is assigned. */
export type FittedWeapon = Pick<PartSpec, "weapon" | "bore_mm" | "barrels" | "cells">;

export interface PartsOptions {
  families?: PartFamilies;
  /**
   * Per-slot linear scale, above the slot's size class. Editor 2 fills this so
   * a radiator is drawn in proportion to what it actually rejects — see
   * `ship/silhouette.ts`.
   */
  scales?: Record<string, number>;
  /**
   * The weapon in each slot, by slot id. Editor 2 fills this from the mount
   * row — `ammo_mm` becomes `bore_mm`, `cells_capacity` becomes `cells` — so a
   * 450 mm Mk66 draws bigger than a 300 mm Mk81 without either being hand-drawn.
   */
  weapons?: Record<string, FittedWeapon>;
  /** Which view the parts are for. Profile — the side elevation — unless asked. */
  view?: View;
  /**
   * How many copies a slot's ring actually carries, by slot id — the ship's
   * collar of drop tanks, say, where the hull only says how many would fit.
   * Falls back to the slot's own `count`.
   */
  counts?: Record<string, number>;
}

/**
 * Every external slot on a hull, as a positioned part ready to hand to the
 * renderer's `fitted` option.
 *
 * Where a part goes and which of its views it shows:
 *
 * | slot    | profile view                          | plan view                               |
 * |---------|---------------------------------------|-----------------------------------------|
 * | dorsal  | its profile, on the skin              | its plan, over the centreline           |
 * | ventral | its profile, under the skin           | its plan, **far** — beneath the hull    |
 * | beam    | its plan, at `a·cos θ`, **far**       | its profile, standing off the beam edge |
 * | spinal  | its weapon's profile on the axis, far | its weapon's plan on the axis, far      |
 *
 * `far` parts are drawn outline-only (`fitted:far:<kind>`), so they read as a
 * fitting behind or inside the hull rather than as hull structure. A beam mount
 * is `far` in the side view because port and starboard mounts at one station
 * project onto the same place, and which of the two is nearer the viewer is
 * not something the drawing can say.
 *
 * A slot may override the kit with its own `part`, which is how a captured or
 * export hull carries a foreign radiator. The override is honoured here and
 * reported as a deviation by the advisory kernel — never blocked.
 */
export function partsForHull(hull: HullGeometry, options: PartsOptions = {}): Appendage[] {
  const view = options.view ?? "profile";
  const out: Appendage[] = [];
  for (const slot of (hull.external_slots ?? []).flatMap((s) => ringMembers(s, options.counts?.[s.id]))) {
    const base = slotIdOf(slot.id);
    const weapon = options.weapons?.[base];
    const spinal = !slot.part && slot.type === "spinal";
    // A spinal slot borrows its weapon's side profile for now; purpose-built
    // spinal glyphs are deferred (`gallery/08`).
    const kind: PartKind | undefined = spinal ? (weapon ? "turret" : undefined) : partKindFor(slot);
    if (!kind) continue;
    const views = partViews({
      kind,
      size: slot.size as SizeClass,
      families: options.families,
      ...(options.scales?.[base] === undefined ? {} : { scale: options.scales[base] }),
      ...(weapon ?? {}),
    });
    const orientation = slotOrientation(slot);
    /**
     * Seen down its own axis, a mount turned by `facing_deg` is its plan view
     * turned by exactly that — the one case a flat drawing can show exactly.
     * The plan's second axis is the slot's tangent, and `lateral` says which
     * way that tangent runs up the screen in this view.
     */
    const turnedPlan = (lateral: number): Part =>
      views.plan.map((o) =>
        o.map(([x, w]) => {
          const t = turn(x, w, orientation.facing_deg);
          return [t.aft, t.tang * lateral] as [number, number];
        }),
      );
    /**
     * Side-on, a turned mount needs its real 3D form to draw exactly, which
     * the generators do not have. It is drawn at whichever of fore or aft it
     * is nearer — a gun turned to fire astern is mirrored — and the true angle
     * shows wherever the mount is seen down its axis.
     */
    const facedProfile = (): Part =>
      Math.cos((orientation.facing_deg * Math.PI) / 180) < 0 ? views.profile.map((o) => o.map(([x, y]) => [-x, y] as [number, number])) : views.profile;

    const rad = (norm(slot.theta_deg) * Math.PI) / 180;
    const beam = !spinal && isBeamOn(slot.theta_deg);
    // By the sign of cos θ, so a mount at 345° is dorsal like one at 15°.
    const ventral = !beam && Math.cos(rad) < 0;
    const axial = AXIAL.has(kind);
    const symmetric = RADIALLY_SYMMETRIC.has(kind);
    const a = halfHeightAt(hull.spine, slot.x);
    const b = beamAt(hull.spine, slot.x) / 2;

    let outline: Part;
    let attach: number;
    let flip = false;
    let far = false;
    let mirror: Appendage["mirror"] = "none";

    /** Which way the slot's tangent runs up the screen: −sin θ side-on, −cos θ from above. */
    const lateral = (view === "profile" ? -Math.sin(rad) : -Math.cos(rad)) < 0 ? -1 : 1;

    if (axial) {
      // A nozzle is round, so its projection in any direction is exact: lay
      // its outline along the exhaust as this view sees it, foreshortened, or
      // show the bell mouth where it points at or away from the eye.
      const e = toShip(exhaustLocal(orientation), slot.theta_deg);
      const v: [number, number] = view === "profile" ? [e[0], e[1]] : [e[0], -e[2]];
      outline = nozzle(views.profile, v);
      // Firing along the hull it sits inboard on the thrust line, as a drive
      // does; firing outward it stands on the skin.
      const reach = orientation.tilt_deg < 45 ? 0.5 : 1;
      attach = (view === "profile" ? a * Math.cos(rad) : -b * Math.sin(rad)) * reach;
      far = view === "profile" ? beam : ventral;
    } else if (spinal) {
      // On the axis, inside the hull: a hidden line, in drawing terms.
      if (view === "plan") outline = turnedPlan(lateral);
      else {
        const faced = facedProfile();
        const ys = faced.flat().map(([, y]) => y);
        outline = centreY(faced, Math.max(...ys) + Math.min(...ys));
      }
      attach = 0;
      far = true;
    } else if (view === "profile") {
      if (beam) {
        // Seen straight down its own outward axis: its plan.
        outline = turnedPlan(lateral);
        attach = a * Math.cos(rad);
        far = true;
      } else {
        outline = facedProfile();
        flip = ventral;
        attach = (ventral ? -1 : 1) * a;
        mirror = symmetric ? "vertical" : "none";
      }
    } else {
      // From above, bow to the right: starboard (θ = 90) lies at −y, port at +y.
      const off = -b * Math.sin(rad);
      if (beam) {
        outline = facedProfile();
        flip = off < 0;
        attach = off;
        // A radiator on one beam implies one on the other, which in plan is
        // exactly a mirror about the centreline.
        mirror = symmetric ? "vertical" : "none";
      } else {
        outline = turnedPlan(lateral);
        attach = off;
        far = ventral;
      }
    }

    outline.forEach((o, i) => {
      if (o.length < 3) return;
      out.push({
        // Pieces of one fitting share the slot's name, so a click or an
        // advisory anchor still reaches the slot rather than piece three.
        id: i === 0 ? slot.id : `${slot.id}~${i}`,
        kind,
        station: slot.x,
        attach_r: attach,
        mirror,
        outline: flip ? o.map(([x, y]) => [x, -y] as [number, number]) : o,
        part: kind,
        plane: view,
        ...(far ? { far: true } : {}),
      });
    });
  }
  return out;
}

/**
 * A slot's ring, as the slots it stands for: the first keeps the slot's id,
 * the rest are `<id>@1`, `<id>@2`, spaced evenly round the hull. A slot with
 * no ring is itself.
 */
export function ringMembers(slot: ExternalSlot, override?: number): ExternalSlot[] {
  const n = Math.max(1, Math.min(8, Math.round(override ?? slot.count ?? 1)));
  if (n === 1) return [slot];
  return Array.from({ length: n }, (_, i) => ({ ...slot, id: i === 0 ? slot.id : `${slot.id}@${i}`, theta_deg: slot.theta_deg + (i * 360) / n }));
}

/**
 * A round nozzle laid along a direction as a view sees it. `outline` runs
 * along +x (throat at 0, bell aft) centred on y = 0; `v` is the exhaust
 * direction projected into the view, whose length is how much of it lies in
 * the view's plane. Under a third of it, the nozzle is seen end on and drawn
 * as its bell mouth.
 */
function nozzle(outline: Part, v: [number, number]): Part {
  const len = Math.hypot(v[0], v[1]);
  const ys = outline.flat().map(([, y]) => y);
  const r = (Math.max(...ys) - Math.min(...ys)) / 2;
  if (len < 1 / 3) return [ellipse(0, 0, r, r, 12)];
  const [ux, uy] = [v[0] / len, v[1] / len];
  return outline.map((o) => ccw(o.map(([px, py]) => [px * len * ux - py * uy, px * len * uy + py * ux] as [number, number])));
}

/** The part kind a slot draws: its own override if it has one, else its type's. */
export function partKindFor(slot: ExternalSlot & { part?: string }): PartKind | undefined {
  const override = typeof slot.part === "string" ? slot.part.trim().toLowerCase() : "";
  if (override && override in SLOT_PART) return SLOT_PART[override];
  if (override && PART_KINDS.includes(override as PartKind)) return override as PartKind;
  return SLOT_PART[slot.type];
}

/**
 * Read a style record's `part_*` fields into families the generators
 * understand. A value with no generator behind it is dropped rather than
 * drawn as a default, so a typo shows up as the fallback shape and not as a
 * silently wrong one.
 */
export function familiesOf(style: Record<string, unknown> | undefined): PartFamilies {
  const pick = <K extends keyof PartFamilies>(key: K, allowed: readonly string[]): PartFamilies[K] | undefined => {
    const v = style?.[`part_${key}`];
    return typeof v === "string" && allowed.includes(v) ? (v as PartFamilies[K]) : undefined;
  };
  const num = (key: string): number | undefined => {
    const v = style?.[key];
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  const f: PartFamilies = {};
  const panels = num("radiator_panels");
  const sweep = num("radiator_sweep_deg");
  const aspect = num("radiator_aspect");
  if (panels !== undefined) f.radiator_panels = panels;
  if (sweep !== undefined) f.radiator_sweep_deg = sweep;
  // Clamped on the way in as well as in the generator, so what the
  // Conformance card shows is what gets drawn.
  if (aspect !== undefined) f.radiator_aspect = clampAspect(aspect);
  const radiator = pick("radiator", ["fin", "panel", "droplet-boom", "spine-array", "hoop", "membrane"]);
  const turret = pick("turret", ["box", "barbette", "cupola"]);
  const tank = pick("tank", ["barrel", "spherical", "conformal"]);
  const thruster = pick("thruster", ["bell", "block", "cluster"]);
  const antenna = pick("antenna", ["dish", "phased-panel", "whip"]);
  if (radiator) f.radiator = radiator;
  if (turret) f.turret = turret;
  if (tank) f.tank = tank;
  if (thruster) f.thruster = thruster;
  if (antenna) f.antenna = antenna;
  return f;
}

/**
 * The slot a drawn piece belongs to. `partsForHull` names extra pieces
 * `<slot>~1`, `<slot>~2`, and ring members `<slot>@1`; a click on a gun's
 * barrel, or on the fourth tank of a collar, has to select the slot.
 */
export function slotIdOf(partId: string): string {
  const i = partId.search(/[~@]/);
  return i === -1 ? partId : partId.slice(0, i);
}

export const PART_KINDS: PartKind[] = ["radiator", "turret", "pd", "antenna", "radar", "optics", "tank", "thruster", "dock"];
export const WEAPON_FAMILIES: WeaponFamily[] = ["gun", "cell", "rocket", "arm", "laser", "plasma", "particle", "ciws"];
export const SLOT_TYPES = Object.keys(SLOT_PART);
