/**
 * Hull classes — eleven starting points, so a new hull never begins as an
 * empty spine (`gallery/09` §2).
 *
 * ## Where the numbers come from
 *
 * Six classes are **measured** from `docs/refs/SolarSystem_Fleet_Deployment.png`.
 * Its balance-of-forces panel draws every navy's ships with one icon per class
 * at one common scale — the widths agree across all four fleet colours to
 * within a pixel — so one Commonwealth (blue) icon per class is the sample.
 * `scripts/measure-fleet-reference.mjs` reproduces every figure in
 * `FLEET_REFERENCE` from the image.
 *
 * The scale is anchored, as the plan says, on the existing 138 m destroyer
 * (`ujcn-destroyer-hull`): the destroyer icon's length is 138 m, and every
 * other length follows from its icon. Heights are anchored on the same ship —
 * see `verticalScale` — because the icons draw hulls about twice as thick as
 * that destroyer, and a fleet whose DD alone was half as fat as its siblings
 * would not be one fleet.
 *
 * The other five are **not in the reference**: the chart has no frigate,
 * monitor, strikecraft or missile, and it draws DL and DD with the same icon.
 * Their lengths are the plan's own ladder, and each is derived from a named
 * source rather than drawn freehand — see `HULL_CLASSES`.
 *
 * ## Mass, armour and height (ruled 2026-09-23)
 *
 * The vault owner supplied NEBULOUS example craft — armour thickness, internal
 * density and mass for nine classes (`NEBULOUS_EXAMPLES`) — and a structural
 * law to match them (`hull/structure.ts`). So every class in that table:
 *
 *  - carries its **internal density**, from which the law computes its
 *    structural mass; nothing is typed onto the hull any more;
 *  - is **armoured end to end** at its thickness, with the sloped bow taper at
 *    four fifths of it — credit for the slope, deliberately not overdone;
 *  - has its **height solved** so its rated displacement (usable volume at the
 *    base set's design density) is its example mass. Heights were left to the
 *    implementer; this is the one choice that makes the examples come out, and
 *    it keeps every class's measured length and its profile's shape.
 *
 * The strikecraft and missile have no example row and are left as they were.
 */
import type { Preset } from "../../types";
import type { ArmorZone, ExternalSlot, HullSection, Spine, Station } from "./types";
import { breakpoints, halfHeightAt } from "./geometry";
import { ratedDisplacement } from "./structure";
import { DEFAULT_CONSTRAINT_SET } from "../constraints";

/**
 * NEBULOUS: Fleet Command example craft, as supplied by the vault owner on
 * 2026-09-23: armour thickness, internal density (cm of plate per metre of
 * interior) and mass. The masses are what each class's height is solved to
 * rate at; the thickness and density go onto the hull as they are.
 */
export const NEBULOUS_EXAMPLES: Record<string, { armour_cm: number; internal_cm_m: number; mass_t: number }> = {
  MN: { armour_cm: 48, internal_cm_m: 0.75, mass_t: 5000 },
  FF: { armour_cm: 15, internal_cm_m: 0.5, mass_t: 5000 },
  DD: { armour_cm: 22, internal_cm_m: 0.5, mass_t: 8000 },
  DL: { armour_cm: 26, internal_cm_m: 0.75, mass_t: 9000 },
  CL: { armour_cm: 26, internal_cm_m: 1, mass_t: 10000 },
  CG: { armour_cm: 30, internal_cm_m: 1.2, mass_t: 12000 },
  CA: { armour_cm: 40, internal_cm_m: 1.2, mass_t: 14500 },
  CV: { armour_cm: 30, internal_cm_m: 0.75, mass_t: 19000 },
  BB: { armour_cm: 56, internal_cm_m: 1.5, mass_t: 21000 },
};

/** The bow taper carries this share of the class thickness: credit for the slope, not overdone. */
export const NOSE_THICKNESS_FACTOR = 0.8;

/** The class armour material — the anchor's, which the owner authored. */
export const CLASS_ARMOUR_MATERIAL = "composite";

// ---------------------------------------------------------------------------
// The measurement
// ---------------------------------------------------------------------------

/**
 * One icon from the reference, in its own pixels.
 *
 * - `len_px` — length, coverage-weighted so the anti-aliased ends count as the
 *   fraction of a pixel they are.
 * - `profile` — the hull's thickness along its length, as breakpoints
 *   `[px from the stern, thickness px]`, with the radiator blocks masked out
 *   (they stand off the hull; they are not the hull).
 * - `mean_px` — mean hull thickness over the length, same masking.
 * - `radiators` — each radiator block as `[px from the stern, reach px]`, the
 *   reach being how far it stands beyond the hull on one side.
 */
export interface ReferenceIcon {
  len_px: number;
  mean_px: number;
  profile: [number, number][];
  radiators: [number, number][];
}

export const FLEET_REFERENCE = {
  file: "docs/refs/SolarSystem_Fleet_Deployment.png",
  panel: "Balance of forces by theater — one Commonwealth (blue) icon per class",
  /** The anchor: the destroyer icon is this many metres long. */
  anchor_m: 138,
  icons: {
    BB: {
      len_px: 69.41,
      mean_px: 6.734,
      profile: [
        [0, 8.5],
        [19.49, 8.5],
        [23.3, 8.09],
        [25.2, 6.5],
        [28.05, 7.36],
        [30.9, 6.86],
        [33.75, 11.09],
        [35.66, 8.76],
        [42.31, 6.51],
        [46.11, 4.32],
        [48.97, 7.5],
        [50.87, 6.24],
        [57.52, 4.82],
        [58.48, 5.25],
        [69.41, 0],
      ],
      radiators: [
        [5.23, 7.47],
        [10.93, 6.68],
        [16.64, 6.5],
      ],
    },
    CV: {
      len_px: 59.85,
      mean_px: 13.292,
      profile: [
        [0, 16.5],
        [19.13, 16.66],
        [25.02, 13.75],
        [26, 14.46],
        [28.94, 12.55],
        [56.42, 10.64],
        [58.38, 8.07],
        [59.85, 0],
      ],
      radiators: [
        [3.92, 7.18],
        [8.83, 6.73],
      ],
    },
    CL: {
      len_px: 52.44,
      mean_px: 5.787,
      profile: [
        [0, 7.5],
        [17.32, 7.5],
        [24.82, 6.58],
        [26.69, 7.2],
        [30.43, 4.94],
        [36.99, 5.87],
        [44.48, 3.42],
        [46.35, 4.78],
        [47.29, 2.86],
        [52.44, 0],
      ],
      radiators: [
        [4.21, 7.45],
        [9.83, 6.81],
        [14.98, 6.35],
        [34.65, 5.96],
      ],
    },
    CA: {
      len_px: 43.79,
      mean_px: 5.894,
      profile: [
        [0, 7.9],
        [10.95, 7.71],
        [19.52, 6.15],
        [23.32, 6.53],
        [29.03, 4.67],
        [34.75, 5.6],
        [43.79, 0],
      ],
      radiators: [[3.81, 4.12]],
    },
    CG: {
      len_px: 40.21,
      mean_px: 6.247,
      profile: [
        [0, 4.4],
        [13.88, 4.41],
        [16.75, 8.96],
        [19.63, 6.22],
        [24.41, 6.04],
        [30.16, 11.16],
        [36.86, 6.47],
        [40.21, 0],
      ],
      radiators: [
        [3.35, 4.11],
        [8.62, 4.19],
      ],
    },
    DD: {
      len_px: 30.45,
      mean_px: 3.617,
      profile: [
        [0, 5.46],
        [2.31, 6.1],
        [4.15, 4.83],
        [11.53, 3.35],
        [15.22, 4.05],
        [23.53, 3.57],
        [28.14, 2.36],
        [30.45, 0],
      ],
      radiators: [],
    },
  } satisfies Record<string, ReferenceIcon>,
} as const;

export type MeasuredClass = keyof typeof FLEET_REFERENCE.icons;

/** Metres per reference pixel along the hull: the destroyer icon is the anchor's length. */
export const HORIZONTAL_SCALE = FLEET_REFERENCE.anchor_m / FLEET_REFERENCE.icons.DD.len_px;

/** A class's length as the reference draws it, before snapping to the station grid. */
export function measuredLength(code: MeasuredClass): number {
  return FLEET_REFERENCE.icons[code].len_px * HORIZONTAL_SCALE;
}

/** Mean full height of a spine over its length, in metres. */
export function meanHeight(spine: Spine, samples = 2000): number {
  const L = spine.length_m ?? 0;
  if (!(L > 0)) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i++) sum += 2 * halfHeightAt(spine, ((i + 0.5) / samples) * L);
  return sum / samples;
}

/**
 * Metres per reference pixel **across** the hull.
 *
 * Not the same as along it. The icons are pictograms and draw hulls thick for
 * legibility: at the horizontal scale, the destroyer icon is about twice the
 * height of the 138 m destroyer it stands for. So heights are anchored on that
 * ship too — the destroyer icon's mean thickness is made the anchor's mean
 * height — which keeps every class's proportions *relative to the destroyer*
 * exactly as the reference draws them (the CV twice as fat, the DL thin)
 * while keeping the destroyer itself as authored.
 */
export function verticalScale(anchor: Spine): number {
  return meanHeight(anchor) / FLEET_REFERENCE.icons.DD.mean_px;
}

// ---------------------------------------------------------------------------
// Building spines
// ---------------------------------------------------------------------------

const PITCH = 3;
/** Snap to the station grid, which is `cell_pitch_m` (`docs/UNITS.md` §4). */
const grid = (x: number): number => Math.round(x / PITCH) * PITCH;
const r1 = (n: number): number => Math.round(n * 100) / 100;

/** A spine from a measured icon, bow first, at a length and a vertical scale. */
function iconStations(icon: ReferenceIcon, length_m: number, kv: number): Station[] {
  const kh = length_m / icon.len_px;
  return icon.profile
    .map(([px, t]) => ({ x: Math.round(length_m - px * kh), half_height_m: r1((t * kv) / 2) }))
    .sort((a, b) => a.x - b.x);
}

/**
 * The anchor's plan-view shape, carried to another class: its beam is 0.96 of
 * its greatest height, reached a fifth of the way aft of a narrow bow, and
 * constant from there. Nothing here is a new figure — every ratio is the
 * anchor's own.
 */
function beamLike(anchor: Spine, stations: Station[], length_m: number): Pick<Spine, "beam_m" | "beam_overrides"> {
  const anchorHeight = 2 * Math.max(...breakpoints(anchor).map((x) => halfHeightAt(anchor, x)));
  const ratio = (anchor.beam_m ?? anchorHeight) / anchorHeight;
  const overrides = anchor.beam_overrides ?? [];
  const bowRatio = overrides.length ? (overrides[0]!.beam_m ?? 0) / (anchor.beam_m || 1) : 1;
  const shoulder = overrides.length > 1 ? (overrides[1]!.x ?? 0) / (anchor.length_m || 1) : 0;
  const height = 2 * Math.max(...stations.map((s) => s.half_height_m));
  const beam_m = r1(height * ratio);
  return {
    beam_m,
    beam_overrides: [
      { x: 0, beam_m: r1(beam_m * bowRatio) },
      { x: Math.round(shoulder * length_m), beam_m },
      { x: length_m, beam_m },
    ],
  };
}

/** The anchor's spine scaled uniformly — length and height together. */
function scaledStations(anchor: Spine, length_m: number): Station[] {
  const k = length_m / (anchor.length_m || 1);
  return anchor.stations.map((s) => ({ x: Math.round(s.x * k), half_height_m: r1(s.half_height_m * k) }));
}

// ---------------------------------------------------------------------------
// The classes
// ---------------------------------------------------------------------------

/** Section vocabularies, in module categories (`gallery/08`: not archetypes). */
const FORWARD = ["habitat", "sensor", "ew", "other"];
const MAGAZINE = ["weapon-missile", "weapon-kinetic", "cargo", "other"];
const ENGINEERING = ["reactor", "drive", "radiator", "tank", "other"];

/** The anchor's armour: its material and thickness, which every class carries unchanged. */
interface AnchorArmour {
  material: string;
  thickness_cm: number;
  /** How far aft the anchor's nose armour runs, as a fraction of its length. */
  noseFraction: number;
}

/** Attitude control fore and aft, as the anchor carries it: a couple needs both ends. */
function rcs(fwd: number, aft: number, size = "S"): ExternalSlot[] {
  return [
    { id: "rcs-fwd-d", x: fwd, theta_deg: 0, type: "thruster", size },
    { id: "rcs-fwd-v", x: fwd, theta_deg: 180, type: "thruster", size },
    { id: "rcs-aft-d", x: aft, theta_deg: 0, type: "thruster", size },
    { id: "rcs-aft-v", x: aft, theta_deg: 180, type: "thruster", size },
  ];
}

/**
 * A radiator slot per measured block, sized by how far the block stands off
 * the hull: the size class whose default radiator comes nearest that reach.
 */
function measuredRadiators(icon: ReferenceIcon, length_m: number, kv: number): ExternalSlot[] {
  const kh = length_m / icon.len_px;
  // Heights a default (panel, 1.35) radiator reaches at each size class.
  const sizes: [string, number][] = [
    ["M", 4 * 1.35],
    ["L", 8 * 1.35],
    ["XL", 14 * 1.35],
  ];
  return icon.radiators.map(([px, reach], i) => {
    const m = reach * kv;
    const size = sizes.reduce((best, s) => (Math.abs(s[1] - m) < Math.abs(best[1] - m) ? s : best))[0];
    return { id: `rad-${i + 1}`, x: grid(length_m - px * kh), theta_deg: 180, type: "radiator", size };
  });
}

interface ClassContext {
  anchor: Spine;
  kv: number;
  armour: AnchorArmour;
}

interface ClassDef {
  code: string;
  id: string;
  title: string;
  /** Where the length and shape come from, one line, for the preset's description. */
  basis: string;
  /**
   * Keep the proportions and solve the **size** for the example mass, rather
   * than keeping the length and solving the height. For the classes whose
   * character is being fat — ruled 2026-09-24 for the CV and MN.
   */
  keepProportions?: boolean;
  build: (ctx: ClassContext) => { spine: Spine; sections: HullSection[]; armor_zones: ArmorZone[]; external_slots: ExternalSlot[]; design_notes: string };
}

const nose = (ctx: ClassContext, length_m: number): ArmorZone => ({
  id: "nose",
  x0: 0,
  x1: grid(ctx.armour.noseFraction * length_m),
  material: ctx.armour.material,
  thickness_cm: ctx.armour.thickness_cm,
});

const zone = (ctx: ClassContext, id: string, x0: number, x1: number): ArmorZone => ({ id, x0, x1, material: ctx.armour.material, thickness_cm: ctx.armour.thickness_cm });

/** A measured spine, bow first, with the anchor's plan-view shape. */
function measuredSpine(ctx: ClassContext, code: MeasuredClass): Spine {
  const length_m = grid(measuredLength(code));
  const stations = iconStations(FLEET_REFERENCE.icons[code], length_m, ctx.kv);
  return { length_m, station_pitch_m: PITCH, datum: "bow", stations, ...beamLike(ctx.anchor, stations, length_m) };
}

/**
 * The eleven, in the order the plan lists them. `DD` is not built here: it is
 * the anchor, `ujcn-destroyer-hull`, unchanged.
 */
export const HULL_CLASSES: ClassDef[] = [
  {
    code: "BB",
    id: "class-bb-hull",
    title: "BB — battleship hull",
    basis: "Measured: the BB icon, 69.4 px against the destroyer's 30.5.",
    build: (ctx) => {
      const spine = measuredSpine(ctx, "BB");
      const L = spine.length_m!;
      // The two bands on the icon (the bulges amidships) mark the section joints.
      return {
        spine,
        sections: [
          { id: "forward", x0: 0, x1: 87, allowed: FORWARD, pressurised: true },
          { id: "battery-a", x0: 87, x1: 162, allowed: MAGAZINE },
          { id: "battery-b", x0: 162, x1: 228, allowed: MAGAZINE },
          { id: "engineering", x0: 228, x1: L, allowed: ENGINEERING },
        ],
        // "Heavy belt": the whole midsection, band to band to engineering.
        armor_zones: [zone(ctx, "belt", 87, 228)],
        external_slots: [
          { id: "gun-a", x: 45, theta_deg: 0, type: "turret", size: "L" },
          { id: "gun-b", x: 66, theta_deg: 0, type: "turret", size: "L" },
          { id: "gun-c", x: 180, theta_deg: 0, type: "turret", size: "L" },
          { id: "gun-x", x: 108, theta_deg: 180, type: "turret", size: "M" },
          { id: "gun-y", x: 141, theta_deg: 180, type: "turret", size: "M" },
          { id: "sec-s1", x: 99, theta_deg: 90, type: "turret", size: "S" },
          { id: "sec-p1", x: 99, theta_deg: 270, type: "turret", size: "S" },
          { id: "sec-s2", x: 150, theta_deg: 90, type: "turret", size: "S" },
          { id: "sec-p2", x: 150, theta_deg: 270, type: "turret", size: "S" },
          { id: "eo", x: 30, theta_deg: 0, type: "optics", size: "S" },
          { id: "radar", x: 81, theta_deg: 0, type: "sensor", size: "L" },
          { id: "comms", x: 120, theta_deg: 0, type: "comms", size: "M" },
          { id: "cells", x: 201, theta_deg: 0, type: "turret", size: "L" },
          { id: "pd-a", x: 57, theta_deg: 180, type: "pd", size: "S" },
          { id: "pd-b", x: 216, theta_deg: 180, type: "pd", size: "S" },
          ...measuredRadiators(FLEET_REFERENCE.icons.BB, L, ctx.kv),
          { id: "tank", x: 246, theta_deg: 0, type: "tank", size: "L" },
          { id: "ring", x: 18, theta_deg: 180, type: "dock", size: "S" },
          ...rcs(15, L - 15),
          { id: "drive", x: L, theta_deg: 0, type: "drive", size: "XL" },
        ],
        design_notes: "Longest hull in the fleet, banded amidships, three radiator arrays aft. Main battery forward and aft of the bands, secondaries on both beams.",
      };
    },
  },
  {
    code: "CV",
    id: "class-cv-hull",
    title: "CV — carrier hull",
    basis: "The CV icon's proportions — the fattest hull the reference draws — resized as a whole to its example mass; part of its hangar space is external, as flight decks (ruled 2026-09-24).",
    keepProportions: true,
    build: (ctx) => {
      const spine = measuredSpine(ctx, "CV");
      const L = spine.length_m!;
      return {
        spine,
        sections: [
          { id: "bow", x0: 0, x1: 45, allowed: FORWARD, pressurised: true },
          { id: "hangar-fwd", x0: 45, x1: 135, allowed: ["hangar", "docking", "cargo", "other"], pressurised: true },
          { id: "hangar-aft", x0: 135, x1: 219, allowed: ["hangar", "docking", "cargo", "other"], pressurised: true },
          { id: "engineering", x0: 219, x1: L, allowed: ENGINEERING },
        ],
        armor_zones: [nose(ctx, L)],
        external_slots: [
          { id: "bay-1", x: 90, theta_deg: 180, type: "hangar", size: "L" },
          { id: "bay-2", x: 180, theta_deg: 180, type: "hangar", size: "L" },
          // The external hangar space: a flight deck along the spine and one
          // hung off each beam.
          { id: "deck-d", x: 141, theta_deg: 0, type: "hangar", subtype: "flight-deck", size: "XL" },
          { id: "deck-s", x: 120, theta_deg: 90, type: "hangar", subtype: "flight-deck", size: "L" },
          { id: "deck-p", x: 120, theta_deg: 270, type: "hangar", subtype: "flight-deck", size: "L" },
          { id: "radar", x: 30, theta_deg: 0, type: "sensor", size: "L" },
          { id: "comms", x: 60, theta_deg: 0, type: "comms", size: "M" },
          { id: "cells-a", x: 105, theta_deg: 0, type: "turret", size: "M" },
          { id: "cells-b", x: 165, theta_deg: 0, type: "turret", size: "M" },
          { id: "pd-s", x: 75, theta_deg: 90, type: "pd", size: "S" },
          { id: "pd-p", x: 75, theta_deg: 270, type: "pd", size: "S" },
          { id: "pd-d", x: 204, theta_deg: 0, type: "pd", size: "S" },
          { id: "pd-v", x: 204, theta_deg: 180, type: "pd", size: "S" },
          ...measuredRadiators(FLEET_REFERENCE.icons.CV, L, ctx.kv),
          { id: "tank", x: 228, theta_deg: 0, type: "tank", size: "L" },
          { id: "ring", x: 15, theta_deg: 180, type: "dock", size: "M" },
          ...rcs(12, L - 15),
          { id: "drive", x: L, theta_deg: 0, type: "drive", size: "XL" },
        ],
        design_notes: "A blunt hangar block: low L/D, with its flight decks outside the hull — one along the spine, one off each beam — and the bays inside. Defended by point defence and cells rather than a gun battery.",
      };
    },
  },
  {
    code: "CA",
    id: "class-ca-hull",
    title: "CA — heavy cruiser hull",
    basis: "Measured: the CA icon, 43.8 px.",
    build: (ctx) => {
      const spine = measuredSpine(ctx, "CA");
      const L = spine.length_m!;
      return {
        spine,
        sections: [
          { id: "forward", x0: 0, x1: 66, allowed: [...FORWARD, "weapon-kinetic"], pressurised: true },
          { id: "magazine", x0: 66, x1: 138, allowed: MAGAZINE },
          { id: "engineering", x0: 138, x1: L, allowed: ENGINEERING },
        ],
        // "Armoured nose, main battery forward": the armour covers the battery.
        armor_zones: [zone(ctx, "nose", 0, 66)],
        external_slots: [
          { id: "gun-a", x: 27, theta_deg: 0, type: "turret", size: "L" },
          { id: "gun-b", x: 48, theta_deg: 0, type: "turret", size: "L" },
          { id: "gun-y", x: 42, theta_deg: 180, type: "turret", size: "M" },
          { id: "eo", x: 18, theta_deg: 0, type: "optics", size: "S" },
          { id: "radar", x: 63, theta_deg: 0, type: "sensor", size: "M" },
          { id: "comms", x: 78, theta_deg: 0, type: "comms", size: "M" },
          { id: "cells", x: 105, theta_deg: 0, type: "turret", size: "M" },
          { id: "pd-s", x: 90, theta_deg: 90, type: "pd", size: "S" },
          { id: "pd-p", x: 90, theta_deg: 270, type: "pd", size: "S" },
          ...measuredRadiators(FLEET_REFERENCE.icons.CA, L, ctx.kv),
          { id: "tank", x: 150, theta_deg: 0, type: "tank", size: "L" },
          { id: "ring", x: 18, theta_deg: 180, type: "dock", size: "S" },
          ...rcs(12, L - 12),
          { id: "drive", x: L, theta_deg: 0, type: "drive", size: "L" },
        ],
        design_notes: "Armoured nose over a forward main battery; magazine amidships; one radiator array aft.",
      };
    },
  },
  {
    code: "CG",
    id: "class-cg-hull",
    title: "CG — guided-missile cruiser hull",
    basis: "Measured: the CG icon, 40.2 px — two lozenges on a thin neck.",
    build: (ctx) => {
      const spine = measuredSpine(ctx, "CG");
      const L = spine.length_m!;
      // Sections follow the lozenge chain the icon draws.
      return {
        spine,
        sections: [
          { id: "forward", x0: 0, x1: 69, allowed: FORWARD, pressurised: true },
          { id: "magazine", x0: 69, x1: 120, allowed: MAGAZINE },
          { id: "engineering", x0: 120, x1: L, allowed: ENGINEERING },
        ],
        armor_zones: [nose(ctx, L)],
        external_slots: [
          { id: "gun-a", x: 21, theta_deg: 0, type: "turret", size: "M" },
          { id: "cells-a", x: 36, theta_deg: 0, type: "turret", size: "L" },
          { id: "cells-b", x: 51, theta_deg: 0, type: "turret", size: "L" },
          { id: "cells-c", x: 84, theta_deg: 0, type: "turret", size: "L" },
          { id: "cells-d", x: 102, theta_deg: 0, type: "turret", size: "L" },
          { id: "cells-e", x: 42, theta_deg: 180, type: "turret", size: "M" },
          { id: "cells-f", x: 93, theta_deg: 180, type: "turret", size: "M" },
          { id: "radar", x: 63, theta_deg: 0, type: "sensor", size: "L" },
          { id: "comms", x: 72, theta_deg: 0, type: "comms", size: "M" },
          { id: "eo", x: 12, theta_deg: 0, type: "optics", size: "S" },
          { id: "pd-s", x: 111, theta_deg: 90, type: "pd", size: "S" },
          { id: "pd-p", x: 111, theta_deg: 270, type: "pd", size: "S" },
          ...measuredRadiators(FLEET_REFERENCE.icons.CG, L, ctx.kv),
          { id: "tank", x: 132, theta_deg: 0, type: "tank", size: "M" },
          { id: "ring", x: 15, theta_deg: 180, type: "dock", size: "S" },
          ...rcs(9, L - 12),
          { id: "drive", x: L, theta_deg: 0, type: "drive", size: "L" },
        ],
        design_notes: "Missile-heavy: cells on both lozenges, one gun forward. The neck between them is the magazine.",
      };
    },
  },
  {
    code: "CL",
    id: "class-cl-hull",
    title: "CL — light cruiser hull",
    basis: "The CL icon's profile at the plan's ~185 m (186 on the grid). The reference draws its CL longer than the CA; ruled 2026-09-23 that CL means light cruiser, so the chart is off and the plan's length stands.",
    build: (ctx) => {
      const L = 186;
      const icon = FLEET_REFERENCE.icons.CL;
      const stations = iconStations(icon, L, ctx.kv);
      return {
        spine: { length_m: L, station_pitch_m: PITCH, datum: "bow", stations, ...beamLike(ctx.anchor, stations, L) },
        sections: [
          { id: "forward", x0: 0, x1: 63, allowed: FORWARD, pressurised: true },
          { id: "magazine", x0: 63, x1: 126, allowed: MAGAZINE },
          { id: "engineering", x0: 126, x1: L, allowed: ENGINEERING },
        ],
        armor_zones: [nose(ctx, L)],
        external_slots: [
          { id: "gun-a", x: 18, theta_deg: 0, type: "turret", size: "M" },
          { id: "gun-b", x: 30, theta_deg: 0, type: "turret", size: "M" },
          { id: "gun-c", x: 105, theta_deg: 0, type: "turret", size: "M" },
          { id: "gun-y", x: 48, theta_deg: 180, type: "turret", size: "S" },
          { id: "eo", x: 9, theta_deg: 0, type: "optics", size: "S" },
          { id: "radar", x: 42, theta_deg: 0, type: "sensor", size: "M" },
          { id: "comms", x: 54, theta_deg: 0, type: "comms", size: "M" },
          { id: "cells", x: 87, theta_deg: 0, type: "turret", size: "L" },
          { id: "pd-s", x: 75, theta_deg: 90, type: "pd", size: "S" },
          { id: "pd-p", x: 75, theta_deg: 270, type: "pd", size: "S" },
          ...measuredRadiators(icon, L, ctx.kv),
          { id: "tank", x: 141, theta_deg: 0, type: "tank", size: "L" },
          { id: "ring", x: 18, theta_deg: 180, type: "dock", size: "S" },
          ...rcs(12, L - 12),
          { id: "drive", x: L, theta_deg: 0, type: "drive", size: "L" },
        ],
        design_notes: "Three radiator arrays aft and a fourth amidships, as the reference draws it. Guns forward and one aft of the cells.",
      };
    },
  },
  {
    code: "DL",
    id: "class-dl-hull",
    title: "DL — destroyer leader hull",
    basis: "The anchor destroyer stretched by a 27 m magazine plug (the plan's 165 m). The reference draws DL with the DD icon, so it cannot be measured apart.",
    build: (ctx) => {
      // "A stretched DD: more magazine, an extra pair of mounts." The plug goes
      // into the midships magazine block, so everything aft of it moves aft.
      const plugAt = 87;
      const plug = 27;
      const move = (x: number) => (x >= plugAt ? x + plug : x);
      const L = (ctx.anchor.length_m ?? 138) + plug;
      const spine: Spine = {
        ...ctx.anchor,
        length_m: L,
        stations: stretchStations(ctx.anchor.stations, plugAt, plug),
        beam_overrides: (ctx.anchor.beam_overrides ?? []).map((o) => ({ ...o, x: move(o.x) })),
      };
      return {
        spine,
        sections: [
          { id: "forward", x0: 0, x1: 48, allowed: FORWARD, pressurised: true },
          { id: "magazine", x0: 48, x1: plugAt + plug, allowed: MAGAZINE },
          { id: "engineering", x0: plugAt + plug, x1: L, allowed: ENGINEERING },
        ],
        armor_zones: [zone(ctx, "bow", 0, 48)],
        external_slots: [
          { id: "gun-a", x: 21, theta_deg: 0, type: "turret", size: "M" },
          { id: "gun-b", x: 36, theta_deg: 0, type: "turret", size: "M" },
          { id: "gun-c", x: 96, theta_deg: 0, type: "turret", size: "M" },
          { id: "gun-y", x: 84, theta_deg: 180, type: "turret", size: "S" },
          { id: "gun-z", x: 105, theta_deg: 180, type: "turret", size: "S" },
          { id: "eo", x: 30, theta_deg: 0, type: "optics", size: "S" },
          { id: "radar", x: 42, theta_deg: 0, type: "sensor", size: "M" },
          { id: "comms", x: 54, theta_deg: 0, type: "comms", size: "M" },
          { id: "cells", x: 66, theta_deg: 0, type: "turret", size: "L" },
          { id: "pd-p", x: 72, theta_deg: 180, type: "pd", size: "S" },
          { id: "rad-1", x: 96 + plug, theta_deg: 180, type: "radiator", size: "L" },
          { id: "rad-2", x: 114 + plug, theta_deg: 180, type: "radiator", size: "L" },
          { id: "tank", x: 108 + plug, theta_deg: 0, type: "tank", size: "L" },
          { id: "ring", x: 12, theta_deg: 180, type: "dock", size: "S" },
          ...rcs(15, 126 + plug),
          { id: "drive", x: L, theta_deg: 0, type: "drive", size: "L" },
        ],
        design_notes: "The destroyer with a 27 m magazine plug and an extra pair of mounts in it. Same height as the DD on a longer hull, so the thinner of the two.",
      };
    },
  },
  {
    code: "FF",
    id: "class-ff-hull",
    title: "FF — frigate hull",
    basis: "The anchor destroyer at the plan's 111 m, scaled uniformly. The reference draws no frigate.",
    build: (ctx) => {
      const L = 111;
      const stations = scaledStations(ctx.anchor, L);
      const k = L / (ctx.anchor.length_m || 138);
      return {
        spine: { ...ctx.anchor, length_m: L, stations, ...beamLike(ctx.anchor, stations, L) },
        sections: [
          { id: "forward", x0: 0, x1: grid(48 * k), allowed: FORWARD, pressurised: true },
          { id: "magazine", x0: grid(48 * k), x1: grid(87 * k), allowed: MAGAZINE },
          { id: "engineering", x0: grid(87 * k), x1: L, allowed: ENGINEERING },
        ],
        armor_zones: [nose(ctx, L)],
        // "Few slots."
        external_slots: [
          { id: "gun-a", x: 18, theta_deg: 0, type: "turret", size: "M" },
          { id: "radar", x: 33, theta_deg: 0, type: "sensor", size: "M" },
          { id: "comms", x: 42, theta_deg: 0, type: "comms", size: "S" },
          { id: "cells", x: 54, theta_deg: 0, type: "turret", size: "M" },
          { id: "pd", x: 60, theta_deg: 180, type: "pd", size: "S" },
          { id: "rad-1", x: 81, theta_deg: 180, type: "radiator", size: "L" },
          { id: "tank", x: 87, theta_deg: 0, type: "tank", size: "M" },
          ...rcs(12, 102),
          { id: "drive", x: L, theta_deg: 0, type: "drive", size: "M" },
        ],
        design_notes: "A small destroyer: one gun, one cell block, one radiator array.",
      };
    },
  },
  {
    code: "MN",
    id: "class-mn-hull",
    title: "MN — monitor hull",
    basis: "The measured CV profile — the reference's lowest L/D — resized as a whole to the example monitor's mass, so it stays fat (ruled 2026-09-24). The reference draws no monitor.",
    keepProportions: true,
    build: (ctx) => {
      const L = 150;
      const cv = FLEET_REFERENCE.icons.CV;
      // Uniform: the CV's proportions, not its size.
      const stations = iconStations(cv, L, ctx.kv * (L / grid(measuredLength("CV"))));
      return {
        spine: { length_m: L, station_pitch_m: PITCH, datum: "bow", stations, ...beamLike(ctx.anchor, stations, L) },
        sections: [
          { id: "forward", x0: 0, x1: 36, allowed: FORWARD, pressurised: true },
          { id: "battery", x0: 36, x1: 108, allowed: MAGAZINE },
          { id: "engineering", x0: 108, x1: L, allowed: ENGINEERING },
        ],
        // "Very heavily armoured": end to end.
        armor_zones: [zone(ctx, "citadel", 0, L)],
        external_slots: [
          { id: "gun-a", x: 27, theta_deg: 0, type: "turret", size: "XL" },
          { id: "gun-b", x: 60, theta_deg: 0, type: "turret", size: "XL" },
          { id: "gun-y", x: 45, theta_deg: 180, type: "turret", size: "L" },
          { id: "radar", x: 84, theta_deg: 0, type: "sensor", size: "M" },
          { id: "comms", x: 96, theta_deg: 0, type: "comms", size: "S" },
          { id: "pd-s", x: 75, theta_deg: 90, type: "pd", size: "S" },
          { id: "pd-p", x: 75, theta_deg: 270, type: "pd", size: "S" },
          ...measuredRadiators(cv, L, ctx.kv * (L / grid(measuredLength("CV")))),
          { id: "tank", x: 117, theta_deg: 0, type: "tank", size: "M" },
          ...rcs(12, 138),
          { id: "drive", x: L, theta_deg: 0, type: "drive", size: "M" },
        ],
        design_notes: "Static fire support: two heavy guns forward on a short, fat, armoured hull, and only a modest drive.",
      };
    },
  },
  {
    code: "SC",
    id: "class-sc-hull",
    title: "SC — strikecraft hull",
    basis: "The anchor destroyer at the plan's ~20 m (21 m, on the grid), scaled uniformly. The reference draws no strikecraft.",
    build: (ctx) => {
      const L = 21;
      const stations = scaledStations(ctx.anchor, L);
      return {
        spine: { ...ctx.anchor, length_m: L, stations, ...beamLike(ctx.anchor, stations, L) },
        // "One section, no rotation."
        sections: [{ id: "hull", x0: 0, x1: L, allowed: ["habitat", "sensor", "weapon-kinetic", "weapon-laser", "weapon-missile", "reactor", "drive", "tank", "other"], pressurised: true }],
        // "Minimal armour": the nose only. No example row gives a thickness,
        // and the destroyer's would be absurd on a 21 m craft, so it is left
        // for the author — the zone inspector says it contributes nothing.
        armor_zones: [{ id: "nose", x0: 0, x1: 3, material: CLASS_ARMOUR_MATERIAL }],
        external_slots: [
          { id: "sensor", x: 3, theta_deg: 0, type: "sensor", size: "S" },
          { id: "gun", x: 9, theta_deg: 0, type: "turret", size: "S" },
          { id: "drive", x: L, theta_deg: 0, type: "drive", size: "S" },
        ],
        design_notes: "One section, one mount, one drive.",
      };
    },
  },
  {
    code: "MSL",
    id: "class-msl-body",
    title: "MSL — missile body",
    basis: "8 m (the plan's figure) at the L/D of the vault's existing missile-body preset, 10. The reference draws no missile.",
    build: () => {
      const L = 8;
      const r = L / 10 / 2;
      return {
        spine: {
          length_m: L,
          beam_m: 2 * r,
          station_pitch_m: 0.5,
          datum: "bow",
          stations: [
            { x: 0, half_height_m: 0 },
            { x: 1.2, half_height_m: r },
            { x: L, half_height_m: r },
          ],
        },
        // "Single stage, one warhead section."
        sections: [
          // Warhead and seeker together in the forward 3.5 m.
          { id: "warhead", x0: 0, x1: 3.5, allowed: ["weapon-missile", "sensor", "other"] },
          { id: "stage", x0: 3.5, x1: L, allowed: ["drive", "tank", "other"] },
        ],
        // A missile is unarmoured, and its motor is internal: an empty list is
        // the scheme here, not an omission.
        armor_zones: [],
        external_slots: [],
        design_notes: "A single stage and a warhead. The motor is internal, so nothing stands off the body.",
      };
    },
  },
];

/**
 * Insert a plug `length` long at station `at`. Everything aft of it moves aft,
 * and the block ending at `at` is held at its height across the plug, so the
 * hull stretches rather than growing a taper. Where `at` is a step (two
 * stations there), the step moves to the far side of the plug.
 */
function stretchStations(stations: Station[], at: number, length: number): Station[] {
  const atPlug = stations.filter((s) => s.x === at);
  const fore = atPlug[0];
  if (!fore) return stations.map((s) => ({ ...s, x: s.x > at ? s.x + length : s.x }));
  const aft = atPlug[atPlug.length - 1]!;
  return [
    ...stations.filter((s) => s.x < at).map((s) => ({ ...s })),
    { ...fore },
    { x: at + length, half_height_m: fore.half_height_m },
    ...(aft !== fore ? [{ x: at + length, half_height_m: aft.half_height_m }] : []),
    ...stations.filter((s) => s.x > at).map((s) => ({ ...s, x: s.x + length })),
  ];
}

/** Codes in the order the plan lists them, DD included. */
export const CLASS_CODES = ["BB", "CV", "CA", "CG", "CL", "DD", "DL", "FF", "MN", "SC", "MSL"] as const;

/** The anchor's preset id: the DD entry of the class list is this preset, unchanged. */
export const ANCHOR_PRESET_ID = "ujcn-destroyer-hull";

/**
 * Every class as a hull preset, built against the anchor's fields.
 *
 * Takes the anchor rather than importing it, because the anchor lives in the
 * built-in preset list that these presets join.
 */
/** Scale a spine's heights and beams together: the profile keeps its shape, the volume goes as the square. */
function scaleHeight(spine: Spine, k: number): Spine {
  return {
    ...spine,
    beam_m: r1((spine.beam_m ?? 0) * k),
    stations: spine.stations.map((st) => ({ x: st.x, half_height_m: r1(st.half_height_m * k) })),
    ...(spine.beam_overrides ? { beam_overrides: spine.beam_overrides.map((o) => ({ x: o.x, beam_m: r1(o.beam_m * k) })) } : {}),
  };
}

/** Scale a whole class uniformly: every station, zone, section and slot. Heights and beams go with it. */
function scaleWhole(built: ReturnType<ClassDef["build"]>, k: number): ReturnType<ClassDef["build"]> {
  const L = grid((built.spine.length_m ?? 0) * k);
  const along = (x: number) => Math.min(L, grid(x * k));
  const spine: Spine = {
    ...scaleHeight(built.spine, k),
    length_m: L,
    stations: built.spine.stations.map((st) => ({ x: Math.min(L, Math.round(st.x * k)), half_height_m: r1(st.half_height_m * k) })),
    ...(built.spine.beam_overrides ? { beam_overrides: built.spine.beam_overrides.map((o) => ({ x: Math.min(L, Math.round(o.x * k)), beam_m: r1(o.beam_m * k) })) } : {}),
  };
  spine.stations[spine.stations.length - 1]!.x = L;
  const sections = built.sections.map((sec) => ({ ...sec, x0: along(sec.x0), x1: along(sec.x1) }));
  sections[sections.length - 1]!.x1 = L;
  // Slots land on the grid; two that land on one station too close round the
  // clock would foul, so the later one steps a station aft (or forward, at the stern).
  const placed: ExternalSlot[] = [];
  for (const slot of built.external_slots) {
    let x = along(slot.x);
    const fouls = (at: number) =>
      placed.some((o) => o.x === at && Math.min(Math.abs(o.theta_deg - slot.theta_deg) % 360, 360 - (Math.abs(o.theta_deg - slot.theta_deg) % 360)) < 15);
    while (fouls(x)) x = x + PITCH <= L ? x + PITCH : x - PITCH;
    placed.push({ ...slot, x });
  }
  return { ...built, spine, sections: sections.filter((sec) => sec.x1 > sec.x0), external_slots: placed };
}

/** The uniform scale at which a class rates at `mass_t`: rated displacement goes as its cube. */
function sizeForMass(built: ReturnType<ClassDef["build"]>, mass_t: number, packing: number, density: number): ReturnType<ClassDef["build"]> {
  const rated = ratedDisplacement({ spine: built.spine, packing_efficiency: packing }, density) ?? 0;
  if (!(rated > 0)) return built;
  const resized = scaleWhole(built, Math.cbrt(mass_t / rated));
  // The length went onto the grid; take up the last few per cent in height.
  return { ...resized, spine: heightForMass(resized.spine, mass_t, packing, density) };
}

/**
 * The height at which a spine rates at `mass_t` — by bisection on the one
 * scale factor, since rated displacement grows as its square.
 */
function heightForMass(spine: Spine, mass_t: number, packing: number, density: number): Spine {
  const rate = (k: number) => ratedDisplacement({ spine: scaleHeight(spine, k), packing_efficiency: packing }, density) ?? 0;
  let lo = 0.02;
  let hi = 20;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (rate(mid) > mass_t) hi = mid;
    else lo = mid;
  }
  return scaleHeight(spine, (lo + hi) / 2);
}

/**
 * The class armour scheme: end to end at the class thickness, with the bow
 * taper — the spine's first segment — at `NOSE_THICKNESS_FACTOR` of it.
 */
export function classArmour(spine: Spine, armour_cm: number): ArmorZone[] {
  const L = spine.length_m ?? 0;
  const taper = spine.stations.find((st) => st.x > 0)?.x ?? 0;
  const nose = Math.min(L, Math.max(PITCH, taper));
  return [
    { id: "nose", x0: 0, x1: nose, material: CLASS_ARMOUR_MATERIAL, thickness_cm: r1(armour_cm * NOSE_THICKNESS_FACTOR) },
    { id: "hull", x0: nose, x1: L, material: CLASS_ARMOUR_MATERIAL, thickness_cm: armour_cm },
  ];
}

/**
 * Every class as a hull preset, built against the anchor's fields.
 *
 * Takes the anchor rather than importing it, because the anchor lives in the
 * built-in preset list that these presets join.
 */
export function hullClassPresets(anchor: { spine: Spine; armor_zones?: ArmorZone[] }): Preset[] {
  const bow = anchor.armor_zones?.[0];
  const ctx: ClassContext = {
    anchor: anchor.spine,
    kv: verticalScale(anchor.spine),
    armour: {
      material: bow?.material ?? CLASS_ARMOUR_MATERIAL,
      thickness_cm: bow?.thickness_cm ?? 0,
      noseFraction: bow ? Math.max(bow.x0, bow.x1) / (anchor.spine.length_m || 1) : 0,
    },
  };
  const packing = 0.78;
  const density = DEFAULT_CONSTRAINT_SET.params.design_density_t_m3?.value;
  return HULL_CLASSES.map((def) => {
    const built = def.build(ctx);
    const example = NEBULOUS_EXAMPLES[def.code];
    if (example && density) {
      if (def.keepProportions) Object.assign(built, sizeForMass(built, example.mass_t, packing, density));
      else built.spine = heightForMass(built.spine, example.mass_t, packing, density);
      built.armor_zones = classArmour(built.spine, example.armour_cm);
    }
    return {
      id: def.id,
      type: "hull",
      title: def.title,
      description: example ? `${def.basis} Height solved to rate at the NEBULOUS example's ${example.mass_t.toLocaleString("en")} t.` : def.basis,
      tags: ["class", def.code],
      fields: {
        hull_class: def.code,
        environment: "orbital",
        // The anchor's own packing, carried unchanged.
        packing_efficiency: packing,
        ...(example ? { internal_density_cm_m: example.internal_cm_m } : {}),
        ...built,
      },
    };
  });
}
