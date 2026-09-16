/**
 * Craft budget roll-up (CoaDE-lite, phase-1 version).
 *
 * Given a craft record, its hull, and the modules in its loadout, compute the
 * mass / power / thermal / Δv / cost / crew budgets and flag problems. This is
 * deliberately simple and transparent; constraint sets (tech ceilings, mass
 * fractions) plug in later without changing the shape of the result.
 */
import type { TypedRecord } from "../types";

export const G0 = 9.80665;

export interface LoadoutLine {
  module: TypedRecord | undefined;
  moduleId: string;
  count: number;
  slot?: string;
}

export interface Budget {
  lines: LoadoutLine[];
  structuralMass_t: number;
  moduleMass_t: number;
  dryMass_t: number;
  propellant_t: number;
  propellantCapacity_t: number;
  wetMass_t: number;
  powerOut_MW: number;
  powerIn_MW: number;
  powerMargin_MW: number;
  heatOut_MW: number;
  heatReject_MW: number;
  heatMargin_MW: number;
  thrust_kN: number;
  /** Thrust-weighted Isp of drive modules. */
  isp_s: number;
  accelWet_g: number;
  accelDry_g: number;
  deltaV_kms: number;
  cost: number;
  crew: number;
  slotUse: Record<string, { used: number; available: number }>;
  warnings: string[];
}

function n(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function computeBudget(craft: TypedRecord, hull: TypedRecord | undefined, moduleById: (id: string) => TypedRecord | undefined): Budget {
  const f = craft.fields;
  const rawLoadout = Array.isArray(f.loadout) ? (f.loadout as Array<Record<string, unknown>>) : [];
  const lines: LoadoutLine[] = rawLoadout
    .filter((l) => l && typeof l.module === "string")
    .map((l) => ({
      moduleId: l.module as string,
      module: moduleById(l.module as string),
      count: Math.max(1, Math.floor(n(l.count) || 1)),
      slot: typeof l.slot === "string" ? l.slot : undefined,
    }));

  const warnings: string[] = [];
  let moduleMass = 0,
    powerOut = 0,
    powerIn = 0,
    heatOut = 0,
    heatReject = 0,
    thrust = 0,
    ispWeighted = 0,
    cost = 0,
    crew = 0,
    capacity = 0;
  const slotUse: Record<string, { used: number; available: number }> = {};

  for (const line of lines) {
    if (!line.module) {
      warnings.push(`Unknown module ${line.moduleId}`);
      continue;
    }
    const m = line.module.fields;
    const c = line.count;
    moduleMass += n(m.mass_t) * c;
    powerOut += n(m.power_out_MW) * c;
    powerIn += n(m.power_in_MW) * c;
    heatOut += n(m.heat_out_MW) * c;
    heatReject += n(m.heat_reject_MW) * c;
    cost += n(m.cost) * c;
    crew += n(m.crew) * c;
    capacity += n(m.propellant_capacity_t) * c;
    const t = n(m.thrust_kN) * c;
    thrust += t;
    ispWeighted += t * n(m.isp_s);
    const slot = line.slot || (typeof m.slot === "string" ? m.slot : "internal");
    slotUse[slot] = slotUse[slot] ?? { used: 0, available: 0 };
    slotUse[slot].used += c;
  }

  const structuralMass = n(hull?.fields.structural_mass_t);
  cost += n(hull?.fields.structural_cost);
  const hullSlots = Array.isArray(hull?.fields.slots) ? (hull!.fields.slots as Array<Record<string, unknown>>) : [];
  for (const s of hullSlots) {
    const kind = typeof s.kind === "string" ? s.kind : "internal";
    slotUse[kind] = slotUse[kind] ?? { used: 0, available: 0 };
    slotUse[kind].available += Math.max(0, Math.floor(n(s.count) || 1));
  }
  if (hull) for (const [k, v] of Object.entries(slotUse)) if (v.used > v.available) warnings.push(`Slot "${k}": ${v.used} used / ${v.available} available`);
  if (!hull && craft.fields.hull) warnings.push("Hull reference not found");

  const propellant = n(f.propellant_t);
  if (capacity > 0 && propellant > capacity) warnings.push(`Propellant ${propellant} t exceeds tank capacity ${capacity} t`);
  const dry = structuralMass + moduleMass;
  const wet = dry + propellant;
  const isp = thrust > 0 ? ispWeighted / thrust : 0;
  const deltaV = isp > 0 && dry > 0 && wet > dry ? (isp * G0 * Math.log(wet / dry)) / 1000 : 0;
  const powerMargin = powerOut - powerIn;
  const heatMargin = heatReject - heatOut;
  if (powerIn > 0 && powerMargin < 0) warnings.push(`Power deficit ${(-powerMargin).toFixed(1)} MW`);
  if (heatOut > 0 && heatMargin < 0) warnings.push(`Radiator deficit ${(-heatMargin).toFixed(1)} MW`);
  if (lines.length && thrust === 0 && f.kind !== "station") warnings.push("No drive module");
  const crewOverride = n(f.crew_override);

  return {
    lines,
    structuralMass_t: structuralMass,
    moduleMass_t: moduleMass,
    dryMass_t: dry,
    propellant_t: propellant,
    propellantCapacity_t: capacity,
    wetMass_t: wet,
    powerOut_MW: powerOut,
    powerIn_MW: powerIn,
    powerMargin_MW: powerMargin,
    heatOut_MW: heatOut,
    heatReject_MW: heatReject,
    heatMargin_MW: heatMargin,
    thrust_kN: thrust,
    isp_s: isp,
    accelWet_g: wet > 0 ? (thrust * 1000) / (wet * 1000) / G0 : 0,
    accelDry_g: dry > 0 ? (thrust * 1000) / (dry * 1000) / G0 : 0,
    deltaV_kms: deltaV,
    cost,
    crew: crewOverride > 0 ? crewOverride : crew,
    slotUse,
    warnings,
  };
}
