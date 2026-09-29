/**
 * The structural-mass law (ruled 2026-09-23; `docs/UNITS.md` §9).
 *
 * A hull's structure is no longer a figure typed onto it. It follows from what
 * the hull is:
 *
 * ```
 * internal structure   M_s = (d / 100) · ρ_s · V        d  internal density, cm/m
 * armour               M_a = Σ zones A · t · ρ_armour   (by zone)
 * rated displacement   M_r = ρ_d · p · V                p  packing efficiency
 * structure fraction   f   = (M_s + M_a) / M_r
 * structural cost      C   = c · (M_s + M_a)
 * ```
 *
 * **Internal density** is NEBULOUS's figure: centimetres of plate a straight
 * path meets per metre of interior. Averaged over directions, the fraction of
 * a path that lies in solid is the solid's volume fraction (the stereological
 * identity L_L = V_V), so d/100 is simply the share of the hull's volume that
 * is deck and bulkhead. Times the plate's density, that is its mass.
 *
 * **Rated displacement** is what the hull is built to carry fully loaded: its
 * usable volume at a design density. The **structure fraction** is how much of
 * that is the hull itself. Where it passes 1 the hull cannot carry its own
 * structure, and the budget says so.
 *
 * `ρ_s`, `ρ_d` and `c` are constraint-set parameters, stated where they are
 * chosen rather than buried here. Pure: no React, no tables — a caller passes
 * a density lookup for the armour materials.
 */
import type { HullGeometry } from "./types";
import { grossVolume, wettedArea } from "./geometry";

export interface StructureParams {
  /** Density of the structural plate, kg/m³. */
  structure_density_kg_m3?: number;
  /** Rated full-load mass per m³ of usable volume, t/m³. */
  design_density_t_m3?: number;
  /** Structural cost per tonne of structure and armour. */
  structure_cost_per_t?: number;
}

/** An armour material's density, and whether the row it comes from is provisional. */
export type ArmourDensity = (material: string) => { density_kg_m3: number; provisional: boolean } | undefined;

export interface StructureEstimate {
  /** Decks and bulkheads, t. Absent without an internal density and a plate density. */
  internal_t?: number;
  /** Armour over every zone that names a material the lookup knows, t. */
  armour_t: number;
  /** Zones whose material has no density; they contribute nothing. */
  armourUnknown: string[];
  /** True when an armour density came from a provisional row. */
  armourProvisional: boolean;
  /** Rated full-load displacement, t. */
  rated_t?: number;
  /** (internal + armour) / rated. */
  fraction?: number;
  /** Structural cost. */
  cost?: number;
}

/** Internal structure from the internal density: (d/100) of the volume is plate. */
export function internalStructureMass(hull: HullGeometry, density_kg_m3: number | undefined): number | undefined {
  const d = hull.internal_density_cm_m;
  if (d === undefined || !(density_kg_m3 !== undefined && density_kg_m3 > 0)) return undefined;
  return ((d / 100) * density_kg_m3 * grossVolume(hull.spine)) / 1000;
}

/** Armour mass, zone by zone: wetted area over the zone's run × thickness × density. */
export function armourMass(hull: HullGeometry, density: ArmourDensity): { mass_t: number; unknown: string[]; provisional: boolean } {
  let mass = 0;
  let provisional = false;
  const unknown: string[] = [];
  for (const zone of hull.armor_zones ?? []) {
    const t = zone.thickness_cm ?? 0;
    if (!(t > 0)) continue;
    const found = zone.material ? density(zone.material) : undefined;
    if (!found) {
      unknown.push(zone.id);
      continue;
    }
    const area = wettedArea(hull.spine, Math.min(zone.x0, zone.x1), Math.max(zone.x0, zone.x1));
    mass += (area * (t / 100) * found.density_kg_m3) / 1000;
    provisional ||= found.provisional;
  }
  return { mass_t: mass, unknown, provisional };
}

/** Rated full-load displacement: usable volume at the design density. */
export function ratedDisplacement(hull: HullGeometry, design_density_t_m3: number | undefined): number | undefined {
  if (!(design_density_t_m3 !== undefined && design_density_t_m3 > 0)) return undefined;
  const p = hull.packing_efficiency ?? 1;
  return design_density_t_m3 * p * grossVolume(hull.spine);
}

/** The whole law for one hull. */
export function structureOf(hull: HullGeometry, params: StructureParams, density: ArmourDensity): StructureEstimate {
  const internal = internalStructureMass(hull, params.structure_density_kg_m3);
  const armour = armourMass(hull, density);
  const rated = ratedDisplacement(hull, params.design_density_t_m3);
  const built = (internal ?? 0) + armour.mass_t;
  const out: StructureEstimate = { armour_t: armour.mass_t, armourUnknown: armour.unknown, armourProvisional: armour.provisional };
  if (internal !== undefined) out.internal_t = internal;
  if (rated !== undefined) {
    out.rated_t = rated;
    if (rated > 0 && built > 0) out.fraction = built / rated;
  }
  if (params.structure_cost_per_t !== undefined && internal !== undefined) out.cost = params.structure_cost_per_t * built;
  return out;
}
