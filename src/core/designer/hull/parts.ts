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
 * ## Frame
 *
 * A part outline is built in **part-local metres**: `+x` runs aft along the
 * hull, `+y` runs outward from the skin, and the origin sits on the hull
 * surface at the slot. `partsForHull` places it: dorsal slots keep `+y` up,
 * ventral slots flip it down, and neither is mirrored, because a slot is one
 * fitting at one clock angle rather than a symmetric pair.
 *
 * Beam slots (roughly 45°–135° and 225°–315°) point at or away from the
 * viewer. In a true side profile they are behind or in front of the hull, so
 * nothing is drawn for them rather than inventing a projection; the slot
 * marker the renderer already draws is the honest representation.
 */
import type { Appendage, ExternalSlot, HullGeometry } from "./types";
import { halfHeightAt } from "./geometry";

/** The external fittings a silhouette shows. */
export type PartKind = "radiator" | "turret" | "pd" | "antenna" | "radar" | "optics" | "tank" | "thruster" | "dock";

export type SizeClass = "S" | "M" | "L" | "XL";

/** Base scale in metres for each size class: the part's span along the hull. */
const SIZE_M: Record<SizeClass, number> = { S: 2, M: 4, L: 8, XL: 14 };

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
  | "arm" // one-armed bandit: a trainable rail
  | "laser" // beam turret
  | "plasma" // plasma cannon: a coil stack
  | "particle" // particle beam: a long segmented accelerator
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
  /** Cells or tubes, from a launcher's `cells_capacity`. Sets how many hatches are drawn. */
  cells?: number;
  /** Panels in a radiator array. */
  panels?: number;
  /** Radiator sweep: positive rakes forward, negative aft. */
  sweep_deg?: number;
  /**
   * Linear scale on the part's span, above whatever its size class gives.
   *
   * This is how a radiator ends up drawn in proportion to what it actually
   * rejects. The part scales in both dimensions, so its drawn **area** goes as
   * the square of this — a caller wanting area proportional to rejection passes
   * `√(reject / reference)`. Clamped at both ends so a rounding error or a
   * zero-rejection radiator cannot make a part vanish or swallow the hull.
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

/** Span in metres for a size class, or a number taken as metres directly. */
function span(size: PartSpec["size"]): number {
  if (typeof size === "number" && Number.isFinite(size) && size > 0) return size;
  return SIZE_M[(typeof size === "string" ? size.toUpperCase() : "M") as SizeClass] ?? SIZE_M.M;
}

/** A box from (x0,y0) to (x1,y1), wound consistently so areas come out positive. */
const box = (x0: number, y0: number, x1: number, y1: number): Outline => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** Centre a part on its slot: parts are specified from 0 and shifted back by half. */
const centre = (p: Part, L: number): Part => p.map((o) => o.map(([x, y]) => [x - L / 2, y] as [number, number]));

// ---------------------------------------------------------------------------
// Generators. Each returns an outline in part-local metres, +y outward.
// ---------------------------------------------------------------------------

/**
 * Radiators. The family is the polity's signature; `panels` and `sweep_deg`
 * are how one class differs from another within the same navy.
 */
function radiator(L: number, family: RadiatorFamily | undefined, panels: number, sweepDeg: number): Part {
  const n = Math.max(1, Math.min(8, Math.round(panels)));
  const tan = Math.tan((Math.max(-60, Math.min(60, sweepDeg)) * Math.PI) / 180);
  /** Rake a piece: every point leans by its height times the sweep. */
  const rake = (o: Outline): Outline => o.map(([x, y]) => [x + y * tan, y] as [number, number]);
  /** Lay `n` copies of one panel along the hull, centred on the slot. */
  const array = (panel: (span: number) => Outline): Part => {
    const span = L / n;
    return Array.from({ length: n }, (_, i) => rake(panel(span).map(([x, y]) => [x + i * span, y] as [number, number])));
  };

  switch (family) {
    case "droplet-boom": {
      // Two booms with a droplet sheet between them.
      const h = L * 1.1;
      return [
        rake([
          [0, 0],
          [L * 0.12, 0],
          [L * 0.12, h * 0.82],
          [L * 0.88, h * 0.82],
          [L * 0.88, 0],
          [L, 0],
          [L, h],
          [0, h],
        ]),
      ];
    }
    case "spine-array": {
      // A boom with a row of panels hung off it: the array that grows by
      // adding panels rather than by getting bigger.
      const h = L * 1.15;
      const boom = box(0, 0, L, h * 0.12);
      return [
        boom,
        ...array((span) => [
          [span * 0.12, h * 0.12],
          [span * 0.88, h * 0.12],
          [span * 0.88, h],
          [span * 0.12, h],
        ]),
      ];
    }
    case "hoop": {
      // A closed loop standing off a short pylon — a moving-belt radiator.
      const h = L * 1.2;
      const t = L * 0.1;
      const hoop: Part = [
        box(L * 0.45, 0, L * 0.55, h * 0.25),
        [
          [0, h * 0.25],
          [L, h * 0.25],
          [L, h],
          [0, h],
        ],
        // The hole, wound the same way so it reads as a rim at plate size.
        box(t, h * 0.25 + t, L - t, h - t),
      ];
      return hoop.map(rake);
    }
    case "membrane": {
      // A slack sheet between two spars: shallow, wide, and obviously not rigid.
      const h = L * 0.75;
      return [
        rake([
          [0, 0],
          [L, 0],
          [L * 0.94, h * 0.55],
          [L * 0.72, h],
          [L * 0.28, h],
          [L * 0.06, h * 0.55],
        ]),
      ];
    }
    case "fin": {
      // Swept triangular fins, one per panel.
      const h = L * 1.45;
      return array((span) => [
        [0, 0],
        [span, 0],
        [span * 0.62, h],
        [span * 0.18, h],
      ]);
    }
    case "panel":
    default: {
      // Flat rectangular panels on a short stalk.
      const h = L * 1.25;
      const stalk = h * 0.16;
      return array((span) => [
        [span * 0.42, 0],
        [span * 0.58, 0],
        [span * 0.58, stalk],
        [span, stalk],
        [span, h],
        [0, h],
        [0, stalk],
        [span * 0.42, stalk],
      ]);
    }
  }
}


/**
 * A turret is a mounting in the polity's style plus whatever the weapon
 * actually is. The mounting family is the navy's signature; the weapon is what
 * stops a CIWS reading as a railgun.
 */
function turret(L: number, family: PartFamilies["turret"], spec: PartSpec): Part {
  const weapon = spec.weapon ?? "gun";
  const h = L * 0.55;
  /** The mounting, in the polity's family. */
  const mount = (len = L, height = h): Outline =>
    family === "barbette"
      ? [
          [0, 0],
          [len, 0],
          [len * 0.86, height],
          [len * 0.14, height],
        ]
      : family === "cupola"
        ? [
            [0, 0],
            [len, 0],
            [len, height * 0.45],
            [len * 0.78, height],
            [len * 0.22, height],
            [0, height * 0.45],
          ]
        : box(0, 0, len, height);

  switch (weapon) {
    case "gun": {
      // Every barrel weapon. Bore sets barrel length and thickness; barrel
      // count widens the gunhouse and draws one tube each. A 450 mm Mk66 and a
      // 300 mm Mk81 are the same shape at different scales, which is right —
      // they work the same way.
      const barrels = Math.max(1, Math.min(4, Math.round(spec.barrels ?? 1)));
      const bore = spec.bore_mm && spec.bore_mm > 0 ? spec.bore_mm : 200;
      const calibre = Math.min(2.6, 0.9 + bore / 300); // longer barrels on bigger bores
      const tube = Math.max(h * 0.1, Math.min(h * 0.42, (bore / 1000) * (L / 4)));
      const house = L * (1 + (barrels - 1) * 0.22);
      const pieces: Part = [mount(house)];
      for (let i = 0; i < barrels; i++) {
        const y = barrels === 1 ? h * 0.62 : h * (0.34 + (0.52 * i) / (barrels - 1));
        pieces.push(box(house * 0.5 - L * calibre, y - tube / 2, house * 0.5, y + tube / 2));
      }
      return pieces;
    }
    case "cell": {
      // VLS and its relatives: a flush block of hatches, no mounting at all.
      const cells = Math.max(2, Math.min(12, Math.round(spec.cells ?? 4)));
      const deck = h * 0.55;
      const pieces: Part = [box(0, 0, L, deck)];
      const w = L / cells;
      for (let i = 0; i < cells; i++) pieces.push(box(i * w + w * 0.18, deck, i * w + w * 0.82, deck * 1.45));
      return pieces;
    }
    case "rocket": {
      // A bundle of tubes on a low trainable base: muzzles showing, not hatches.
      const tubes = Math.max(2, Math.min(8, Math.round(spec.cells ?? 6)));
      const rows = tubes > 4 ? 2 : 1;
      const per = Math.ceil(tubes / rows);
      const pieces: Part = [mount(L, h * 0.45)];
      const w = L / per;
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < per; i++) {
          const y = h * 0.45 + r * h * 0.42;
          pieces.push(box(i * w + w * 0.12, y, i * w + w * 0.88, y + h * 0.34));
        }
      }
      return pieces;
    }
    case "arm": {
      // A one-armed bandit: a pedestal and a single trainable rail, raked up.
      const armLen = L * 1.5;
      const t = h * 0.16;
      return [
        mount(L * 0.7, h * 0.6),
        [
          [L * 0.35, h * 0.6],
          [L * 0.35 + armLen * 0.94, h * 0.6 + armLen * 0.34],
          [L * 0.35 + armLen * 0.9, h * 0.6 + armLen * 0.34 + t],
          [L * 0.35 - t * 0.6, h * 0.6 + t],
        ],
      ];
    }
    case "laser": {
      // A low dome with a short, fat aperture. Nothing that reads as a barrel.
      return [mount(L, h * 0.7), box(L * 0.28, h * 0.7, L * 0.72, h * 1.15), box(L * 0.38, h * 1.15, L * 0.62, h * 1.35)];
    }
    case "plasma": {
      // A stack of accelerator coils around a stubby muzzle.
      const pieces: Part = [mount(L, h * 0.6)];
      for (let i = 0; i < 3; i++) pieces.push(box(L * (0.2 + i * 0.2), h * 0.6, L * (0.34 + i * 0.2), h * 1.25));
      pieces.push(box(L * 0.26, h * 1.25, L * 0.8, h * 1.45));
      return pieces;
    }
    case "particle": {
      // A long, slender, segmented accelerator — longer than any gun barrel and
      // obviously not a tube.
      const len = L * 2.4;
      const t = h * 0.22;
      const pieces: Part = [mount(L * 0.8, h * 0.5), box(L * 0.4 - len, h * 0.5, L * 0.4, h * 0.5 + t)];
      for (let i = 0; i < 4; i++) {
        const x = L * 0.4 - len * (0.18 + i * 0.22);
        pieces.push(box(x - t * 0.35, h * 0.5 - t * 0.35, x + t * 0.35, h * 0.5 + t * 1.35));
      }
      return pieces;
    }
    case "ciws":
      return pointDefence(L);
  }
}


function pointDefence(L: number): Part {
  // Small, stubby, a short barrel cluster. Deliberately unlike a main turret at a glance.
  const h = L * 0.5;
  return [box(L * 0.2, 0, L * 0.8, h * 0.6), box(0, h * 0.6, L, h), box(L * 0.35, h, L * 0.65, h * 1.5)];
}

function antenna(L: number, family: PartFamilies["antenna"]): Part {
  switch (family) {
    case "phased-panel":
      return [box(L * 0.35, 0, L * 0.65, L * 0.3), box(0, L * 0.3, L, L * 0.45)];
    case "whip":
      return [box(L * 0.45, 0, L * 0.55, L * 2.4)];
    case "dish":
    default: {
      // A mast with a dish canted off it.
      const r = L * 0.5;
      const mastTop = L * 0.9;
      return [
        box(L * 0.45, 0, L * 0.55, mastTop),
        [
          [L * 0.5 - r, mastTop],
          [L * 0.5 + r, mastTop],
          [L * 0.5 + r * 0.6, mastTop + r * 1.1],
          [L * 0.5 - r * 0.6, mastTop + r * 1.1],
        ],
      ];
    }
  }
}

/** Search radar: a flat rotating array on a short mast. */
function radar(L: number): Part {
  return [box(L * 0.42, 0, L * 0.58, L * 0.55), box(0, L * 0.55, L, L * 0.78)];
}

/** Optics: a small trunnioned ball on a pedestal. */
function optics(L: number): Part {
  const h = L * 0.45;
  return [box(L * 0.4, 0, L * 0.6, h), box(L * 0.18, h, L * 0.82, h + L * 0.4)];
}

function tank(L: number, family: PartFamilies["tank"]): Part {
  const d = L * 0.55;
  switch (family) {
    case "spherical": {
      // An octagon reads as a sphere at plate size and needs no curves.
      const r = L * 0.42;
      const k = r * 0.4142;
      return [[
        [L / 2 - k, 0],
        [L / 2 + k, 0],
        [L / 2 + r, k],
        [L / 2 + r, 2 * r - k],
        [L / 2 + k, 2 * r],
        [L / 2 - k, 2 * r],
        [L / 2 - r, 2 * r - k],
        [L / 2 - r, k],
      ]];
    }
    case "conformal":
      return [[
        [0, 0],
        [L, 0],
        [L * 0.88, d * 0.6],
        [L * 0.12, d * 0.6],
      ]];
    case "barrel":
    default:
      // A barrel with domed ends, flattened onto the skin.
      return [[
        [0, d * 0.35],
        [L * 0.12, 0],
        [L * 0.88, 0],
        [L, d * 0.35],
        [L, d * 0.8],
        [L * 0.88, d],
        [L * 0.12, d],
        [0, d * 0.8],
      ]];
  }
}

function thruster(L: number, family: PartFamilies["thruster"]): Part {
  const h = L * 0.7;
  switch (family) {
    case "block":
      return [box(0, 0, L, h)];
    case "cluster":
      return [box(0, 0, L * 0.44, h), box(L * 0.56, 0, L, h)];
    case "bell":
    default:
      // A throat opening into a bell, pointing aft.
      return [[
        [0, h * 0.2],
        [L * 0.45, h * 0.2],
        [L, 0],
        [L, h],
        [L * 0.45, h * 0.8],
        [0, h * 0.8],
      ]];
  }
}

/** A docking ring seen edge-on: a collar standing off the skin. */
function dock(L: number): Part {
  return [box(L * 0.2, 0, L * 0.8, L * 0.25), box(0, L * 0.25, L, L * 0.45)];
}

/**
 * Parts that point aft along the axis rather than outward from the skin. A
 * thruster bell that stood up off the hull like a radiator would be nonsense:
 * the exhaust has to leave astern.
 */
const AXIAL: ReadonlySet<PartKind> = new Set<PartKind>(["thruster"]);

/**
 * Fittings that go all the way round the hull rather than sitting at one clock
 * angle. A radiator array is symmetric about the thrust axis — panels below
 * mean panels above — so one slot draws both sides.
 */
const RADIALLY_SYMMETRIC: ReadonlySet<PartKind> = new Set<PartKind>(["radiator"]);

/** Centre a part across the axis instead of along the hull, for axial parts. */
const centreY = (p: Part, h: number): Part => p.map((o) => o.map(([x, y]) => [x, y - h / 2] as [number, number]));

/** Build one part, as its pieces, in part-local metres with +y outward (or +x aft, if axial). */
/** Keep a scaled part recognisable: an eighth of its class at worst, triple at most. */
const clampScale = (v: number | undefined): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(3, Math.max(0.125, v)) : 1);

export function makePart(spec: PartSpec): Part {
  const L = span(spec.size) * clampScale(spec.scale);
  const f = spec.families ?? {};
  if (spec.kind === "thruster") {
    // Extends aft from the slot and straddles the thrust line, so it reads as
    // a nozzle rather than a fin.
    const pieces = thruster(L, f.thruster);
    const h = Math.max(...pieces.flat().map(([, y]) => y));
    return centreY(pieces, h);
  }
  switch (spec.kind) {
    case "radiator":
      return centre(radiator(L, f.radiator, spec.panels ?? f.radiator_panels ?? 1, spec.sweep_deg ?? f.radiator_sweep_deg ?? 0), L);
    case "turret":
      return centre(turret(L, f.turret, spec), L);
    case "pd":
      return centre(pointDefence(L), L);
    case "antenna":
      return centre(antenna(L, f.antenna), L);
    case "radar":
      return centre(radar(L), L);
    case "optics":
      return centre(optics(L), L);
    case "tank":
      return centre(tank(L, f.tank), L);
    case "dock":
      return centre(dock(L), L);
  }
}

/**
 * Slot types the hull schema knows, mapped to what they look like. A slot type
 * with no external appearance — a spinal mount buried in the hull, an internal
 * bay, a hangar that is a hole rather than a box — maps to `undefined` and
 * draws nothing.
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

/** True where a slot's clock angle points at or away from the viewer. */
function isBeamOn(theta_deg: number): boolean {
  const t = ((theta_deg % 360) + 360) % 360;
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
}

/**
 * Every external slot on a hull, as a positioned part ready to hand to the
 * renderer's `fitted` option.
 *
 * A slot may override the kit with its own `part`, which is how a captured or
 * export hull carries a foreign radiator. The override is honoured here and
 * reported as a deviation by the advisory kernel — never blocked.
 */
export function partsForHull(hull: HullGeometry, options: PartsOptions = {}): Appendage[] {
  const out: Appendage[] = [];
  for (const slot of hull.external_slots ?? []) {
    if (isBeamOn(slot.theta_deg)) continue; // edge-on: the slot marker is the honest drawing
    const kind = partKindFor(slot);
    if (!kind) continue;
    const pieces = makePart({
      kind,
      size: slot.size as SizeClass,
      families: options.families,
      ...(options.scales?.[slot.id] === undefined ? {} : { scale: options.scales[slot.id] }),
      ...(options.weapons?.[slot.id] ?? {}),
    });
    const ventral = (((slot.theta_deg % 360) + 360) % 360) >= 135;
    const skin = halfHeightAt(hull.spine, slot.x);
    // An axial part sits inboard on the thrust line; everything else stands on
    // the skin.
    const attach = AXIAL.has(kind) ? skin * 0.5 : skin;
    pieces.forEach((outline, i) => {
      if (outline.length < 3) return;
      out.push({
        // Pieces of one fitting share the slot's name, so a click or an
        // advisory anchor still reaches the slot rather than piece three.
        id: i === 0 ? slot.id : `${slot.id}~${i}`,
        kind,
        station: slot.x,
        attach_r: ventral ? -attach : attach,
        // A radiator array is radially symmetric about the thrust axis: panels
        // below imply panels above. Everything else is one fitting at one clock
        // angle, so it is not mirrored.
        mirror: RADIALLY_SYMMETRIC.has(kind) ? "vertical" : "none",
        outline: ventral ? outline.map(([x, y]) => [x, -y] as [number, number]) : outline,
        part: kind,
      });
    });
  }
  return out;
}

/** The part kind a slot draws: its own override if it has one, else its type's. */
export function partKindFor(slot: ExternalSlot & { part?: string }): PartKind | undefined {
  const override = typeof slot.part === "string" ? slot.part.trim().toLowerCase() : "";
  if (override && override in SLOT_PART) return SLOT_PART[override];
  if (override && PART_KINDS.includes(override as PartKind)) return override as PartKind;
  return SLOT_PART[slot.type];
}

/**
 * The slot a drawn piece belongs to. `partsForHull` names extra pieces
 * `<slot>~1`, `<slot>~2`; a click on a gun's barrel has to select the gun.
 */
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
  if (panels !== undefined) f.radiator_panels = panels;
  if (sweep !== undefined) f.radiator_sweep_deg = sweep;
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

export function slotIdOf(partId: string): string {
  const i = partId.indexOf("~");
  return i === -1 ? partId : partId.slice(0, i);
}

export const PART_KINDS: PartKind[] = ["radiator", "turret", "pd", "antenna", "radar", "optics", "tank", "thruster", "dock"];
export const SLOT_TYPES = Object.keys(SLOT_PART);
