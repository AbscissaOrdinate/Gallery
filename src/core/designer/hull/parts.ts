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
  radiator?: "fin" | "panel" | "droplet-boom";
  turret?: "box" | "barbette" | "cupola";
  tank?: "barrel" | "spherical" | "conformal";
  thruster?: "bell" | "block" | "cluster";
  antenna?: "dish" | "phased-panel" | "whip";
}

/** What a turret looks like depends on what is in it. */
export type WeaponFamily = "gun" | "railgun" | "missile" | "beam" | "pd";

export interface PartSpec {
  kind: PartKind;
  size?: SizeClass | number;
  families?: PartFamilies;
  weapon?: WeaponFamily;
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

function radiator(L: number, family: PartFamilies["radiator"]): Part {
  switch (family) {
    case "droplet-boom": {
      // Two booms and a thin sheet between them: the shape that says "this is
      // not a solid panel" at silhouette size.
      const h = L * 1.1;
      return [[
        [0, 0],
        [L * 0.12, 0],
        [L * 0.12, h * 0.82],
        [L * 0.88, h * 0.82],
        [L * 0.88, 0],
        [L, 0],
        [L, h],
        [0, h],
      ]];
    }
    case "fin": {
      // A swept triangular fin, deeper than it is long.
      const h = L * 1.45;
      return [[
        [0, 0],
        [L, 0],
        [L * 0.62, h],
        [L * 0.18, h],
      ]];
    }
    case "panel":
    default: {
      // A flat rectangular panel on a short stalk.
      const h = L * 1.25;
      const stalk = h * 0.16;
      return [[
        [L * 0.42, 0],
        [L * 0.58, 0],
        [L * 0.58, stalk],
        [L, stalk],
        [L, h],
        [0, h],
        [0, stalk],
        [L * 0.42, stalk],
      ]];
    }
  }
}

function turret(L: number, family: PartFamilies["turret"], weapon: WeaponFamily): Part {
  const h = L * 0.55;
  const barrelLen = weapon === "railgun" ? L * 1.9 : weapon === "gun" ? L * 1.25 : 0;
  const base: Outline =
    family === "barbette"
      ? [
          [0, 0],
          [L, 0],
          [L * 0.86, h],
          [L * 0.14, h],
        ]
      : family === "cupola"
        ? [
            [0, 0],
            [L, 0],
            [L, h * 0.45],
            [L * 0.78, h],
            [L * 0.22, h],
            [0, h * 0.45],
          ]
        : box(0, 0, L, h);

  if (barrelLen > 0) {
    // A barrel laid along the hull, pointing forward, which is how a trained-fore gun reads.
    const by = h * 0.62;
    const bt = h * 0.18;
    return [base, box(L * 0.5 - barrelLen, by - bt, L * 0.5, by)];
  }
  if (weapon === "missile") return [box(0, 0, L, h * 0.7), box(L * 0.1, h * 0.7, L * 0.9, h)]; // cell hatches
  if (weapon === "beam") return [base, box(L * 0.3, h, L * 0.7, h * 1.45)]; // a short wide aperture
  return [base];
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

/** Centre a part across the axis instead of along the hull, for axial parts. */
const centreY = (p: Part, h: number): Part => p.map((o) => o.map(([x, y]) => [x, y - h / 2] as [number, number]));

/** Build one part, as its pieces, in part-local metres with +y outward (or +x aft, if axial). */
export function makePart(spec: PartSpec): Part {
  const L = span(spec.size);
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
      return centre(radiator(L, f.radiator), L);
    case "turret":
      return centre(turret(L, f.turret, spec.weapon ?? "gun"), L);
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

export interface PartsOptions {
  families?: PartFamilies;
  /** Weapon family per slot id, supplied by editor 2 once a module is assigned. */
  weapons?: Record<string, WeaponFamily>;
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
    const pieces = makePart({ kind, size: slot.size as SizeClass, families: options.families, weapon: options.weapons?.[slot.id] });
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
        mirror: "none", // one slot is one fitting, not a symmetric pair
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
export function slotIdOf(partId: string): string {
  const i = partId.indexOf("~");
  return i === -1 ? partId : partId.slice(0, i);
}

export const PART_KINDS: PartKind[] = ["radiator", "turret", "pd", "antenna", "radar", "optics", "tank", "thruster", "dock"];
export const SLOT_TYPES = Object.keys(SLOT_PART);
