/**
 * The ship budget engine — one engine, for every editor.
 *
 * This replaces `designer/budgets.ts`, which read the hull's v1 `slots` list
 * and summed a flat loadout. It keeps every number that engine produced, under
 * the same names, so `tests/migration.test.ts`'s regression gate still compares
 * like with like; what it adds is placement (which slot, which section), modes,
 * staging, and an honest account of what rests on a guess.
 *
 * ## Three rules it holds to
 *
 * **Nothing is invented.** A figure the vault does not supply contributes
 * **zero** and says so in `assumptions` — consumables need `kg_per_crew_day`,
 * a propellant mass needs a density, a structure mass needs the hull to declare
 * one. A budget that is missing a term is visibly missing it; it is never
 * quietly filled in with a plausible number.
 *
 * **Provisional propagates.** `docs/CLAUDE.md`: a provisional table value must
 * render with a visible marker *everywhere it reaches the UI, including inside
 * values derived from it*. So every output that touched a provisional row is
 * named in `provisional`, with the row that made it so.
 *
 * **Heat is never one number.** `docs/UNITS.md` §5 forbids summing
 * life-support and reactor heat into a single rejection figure. The per-mode
 * budget carries the low- and high-temperature halves separately; the summed
 * `heatOut_MW` / `heatReject_MW` survive only as the headline the old engine
 * reported, and the advisories work on the split.
 */
import { cgStation, halfHeightAt, beamAt, sectionVolumes, volumeCentroid, wettedArea } from "../hull/geometry";
import type { HullGeometry, MassItem } from "../hull/types";
import { violation, type Violation } from "../violations";
import { heatClassOf, readModule, rejectableHeat, rejectClassOf, type HeatClass, type ModuleSpec } from "./module";
import { dutyDraw, dutyFor, modesOf } from "./modes";
import type { OperatingMode, ShipLoadout } from "./types";

export const G0 = 9.80665;

/** The slice of `TableSet` the budget needs, so tests can stub it and there is no import cycle. */
export interface TableLookupLike {
  lookup(file: string, ref: string, column: string): { lookup: { value: number | string | boolean; provisional: boolean } } | { error: string };
}

export interface ShipContext {
  /** The hull's geometry view, from `hull/record.ts`. */
  hull?: HullGeometry;
  /** The hull record's raw fields — structural mass and cost live outside the geometry. */
  hullFields?: Record<string, unknown>;
  /** Module record fields by id. */
  module?: (id: string) => Record<string, unknown> | undefined;
  tables?: TableLookupLike;
  /** Effective constraint-set parameters (`automation_factor`, `kg_per_crew_day`, …). */
  params?: Record<string, number>;
}

/** One contributing item, flattened for the UI and for the mass/CG roll-up. */
export interface BudgetLine {
  id: string;
  kind: "fitting" | "manifest" | "tank" | "unplaced";
  moduleId?: string;
  spec?: ModuleSpec;
  count: number;
  /** Dry mass. For a tank this is the tankage, not what is in it. */
  mass_t: number;
  /**
   * Propellant in this tank. Separate from `mass_t` because the rocket equation
   * consumes it, but it is *at the tank* and is often the largest single mass
   * on the ship, so the centre of gravity has to count it.
   */
  propellant_t?: number;
  volume_m3: number;
  /** Station, where the item has one. Unplaced lines do not. */
  x?: number;
  /** Clock angle for an external fitting. */
  theta_deg?: number;
}

export interface SectionBudget {
  id: string;
  usable_m3: number;
  used_m3: number;
  /** Positive when the section is over budget. */
  over_m3: number;
}

export interface ModeBudget {
  id: string;
  name: string;
  powerOut_MW: number;
  powerIn_MW: number;
  powerMargin_MW: number;
  /** Total waste heat. Kept for continuity only — work from the split. */
  heatOut_MW: number;
  heatLow_MW: number;
  heatHigh_MW: number;
  heatReject_MW: number;
  rejectLow_MW: number;
  rejectHigh_MW: number;
  /** Rejection from radiators that declare no working temperature, usable by either array. */
  rejectUnclassed_MW: number;
  /**
   * What is left of the unclassed pool after both arrays' deficits are covered.
   * It belongs to neither band — it is headroom that exists only because some
   * radiator has not said what temperature it runs at — so it is reported on
   * its own rather than added to a margin it might not be available to.
   */
  rejectSpare_MW: number;
  heatMargin_MW: number;
  /**
   * Per-array margin after the unclassed pool has covered what it can. Negative
   * means that array genuinely cannot reject its load; **zero means covered**,
   * possibly by borrowed unclassed capacity — read `rejectSpare_MW` for the
   * headroom.
   */
  marginLow_MW: number;
  marginHigh_MW: number;
  /** Radiated RF power in this mode — what makes EMCON mean something. */
  radiated_kw: number;
}

export interface Stage {
  /** Jettison order. 0 is the integral core stage, which burns last. */
  order: number;
  tanks: string[];
  m0_t: number;
  mf_t: number;
  propellant_t: number;
  deltaV_kms: number;
  accelStart_g: number;
}

export interface ShipBudget {
  lines: BudgetLine[];

  structuralMass_t: number;
  moduleMass_t: number;
  armorMass_t: number;
  consumablesMass_t: number;
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
  /** Thrust-weighted Isp over the drive modules. */
  isp_s: number;
  accelWet_g: number;
  accelDry_g: number;
  deltaV_kms: number;
  stages: Stage[];

  cost: number;
  /** Complement, after the watch and automation factors (`docs/UNITS.md` §4). */
  crew: number;
  /** People on station in one watch — the figure the old engine reported. */
  crewOnWatch: number;
  crewDays: number;

  modes: ModeBudget[];
  /** The mode the headline power and heat figures come from: the hungriest one. */
  worstMode: string;

  sections: SectionBudget[];
  volumeUsed_m3: number;
  volumeUsable_m3: number;

  cgStation_m?: number;
  /**
   * How far the centre of gravity lies off the line the drives push along, in
   * metres. Every burn torques the ship by this arm.
   */
  thrustOffset_m: number;
  /**
   * The angle the thrust vector has to be tilted through to point at the centre
   * of gravity: `atan(offset / drive-to-CG distance)`.
   *
   * This is the figure that makes the offset actionable, and it is reported
   * rather than judged: what counts as too much is a gimbal limit, and no table
   * in the vault supplies one. The advisory kernel only fires on the case that
   * needs no such figure — an arm so long that no gimbal *inside the hull*
   * could reach it.
   */
  gimbalRequired_deg: number;

  /** Outputs that rest on a `provisional: true` table row, and which row. */
  provisional: string[];
  /** Terms left at zero because the vault does not supply the figure. */
  assumptions: string[];
  advisories: Violation[];
}

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const fmt = (v: number, d = 1) => v.toLocaleString(undefined, { maximumFractionDigits: d });

// ---------------------------------------------------------------------------

export function shipBudget(ship: ShipLoadout, ctx: ShipContext = {}): ShipBudget {
  const advisories: Violation[] = [];
  const provisional: string[] = [];
  const assumptions: string[] = [];
  const specOf = (id: string | undefined): ModuleSpec | undefined => {
    if (!id) return undefined;
    const fields = ctx.module?.(id);
    return fields ? readModule(fields) : undefined;
  };

  const slots = new Map((ctx.hull?.external_slots ?? []).map((s) => [s.id, s]));
  const sectionSpans = new Map((ctx.hull?.sections ?? []).map((s) => [s.id, s]));

  // ---- lines ---------------------------------------------------------------
  const lines: BudgetLine[] = [];
  for (const f of ship.fittings) {
    const spec = specOf(f.module);
    const slot = slots.get(f.slot);
    const line: BudgetLine = {
      id: f.slot,
      kind: "fitting",
      count: 1,
      mass_t: spec?.mass_t ?? 0,
      // External fittings add mass and wetted area but consume no internal
      // volume (`gallery/05` §2.5).
      volume_m3: 0,
    };
    if (f.module) line.moduleId = f.module;
    if (spec) line.spec = spec;
    if (slot) {
      line.x = slot.x;
      line.theta_deg = slot.theta_deg;
    }
    lines.push(line);
  }
  for (const m of ship.manifest) {
    const spec = specOf(m.module);
    const section = m.section ? sectionSpans.get(m.section) : undefined;
    const line: BudgetLine = {
      id: m.id,
      kind: "manifest",
      count: m.count,
      mass_t: (spec?.mass_t ?? 0) * m.count,
      volume_m3: (spec?.volume_m3 ?? 0) * m.count,
    };
    if (m.module) line.moduleId = m.module;
    if (spec) line.spec = spec;
    if (section) line.x = (section.x0 + section.x1) / 2;
    lines.push(line);
  }
  for (const t of ship.tanks) {
    const spec = specOf(t.module);
    const slot = t.slot ? slots.get(t.slot) : undefined;
    const section = t.section ? sectionSpans.get(t.section) : undefined;
    const line: BudgetLine = {
      id: t.id,
      kind: "tank",
      count: 1,
      // A tank's mass line is its *dry* tankage. The propellant in it is a
      // separate term, because it is what the rocket equation consumes.
      mass_t: spec?.mass_t ?? 0,
      // A drop tank hangs outside and spends no internal volume.
      volume_m3: t.slot ? 0 : t.volume_m3,
    };
    if (t.module) line.moduleId = t.module;
    if (spec) line.spec = spec;
    if (slot) {
      line.x = slot.x;
      line.theta_deg = slot.theta_deg;
    } else if (section) line.x = (section.x0 + section.x1) / 2;
    lines.push(line);
  }
  for (const u of ship.unplaced) {
    const spec = specOf(u.module);
    const line: BudgetLine = {
      id: u.id,
      kind: "unplaced",
      count: u.count,
      mass_t: (spec?.mass_t ?? 0) * u.count,
      // An unplaced line has no section, so its volume is counted in the ship
      // total but against no section's budget.
      volume_m3: (spec?.volume_m3 ?? 0) * u.count,
    };
    if (u.module) line.moduleId = u.module;
    if (spec) line.spec = spec;
    lines.push(line);
  }

  for (const line of lines) {
    if (line.moduleId && !line.spec) {
      advisories.push(
        violation("error", `${line.id} references module "${line.moduleId}", which is not in the vault. Its mass, power and heat are missing from every total.`, {
          field: line.kind,
          domain: "fit",
          source: "ship.budget",
          anchor: { componentId: line.id, ...(line.x === undefined ? {} : { station: line.x }) },
        }),
      );
    }
  }

  // ---- mass ----------------------------------------------------------------
  const moduleMass = lines.reduce((sum, l) => sum + l.mass_t, 0);
  const structuralMass = n(ctx.hullFields?.structural_mass_t);
  if (ctx.hull && structuralMass === 0) {
    assumptions.push("Structure mass is 0: the hull declares no `structural_mass_t`, and `_tables/structures.yaml` is a placeholder whose own header says not to rely on any row.");
  }

  const armor = armorMass(ctx, provisional);
  const propellant = propellantLoad(ship, ctx, provisional, advisories);
  for (const line of lines) {
    if (line.kind !== "tank") continue;
    const load = propellant.byTank.get(line.id);
    if (load !== undefined && load > 0) line.propellant_t = load;
  }

  // ---- propulsion, cost, crew ---------------------------------------------
  let thrust = 0;
  let ispWeighted = 0;
  let capacity = 0;
  let cost = n(ctx.hullFields?.structural_cost);
  let crewOnWatch = 0;
  let crewTotal = 0;
  for (const line of lines) {
    const s = line.spec;
    if (!s) continue;
    cost += s.cost * line.count;
    capacity += s.propellant_capacity_t * line.count;
    const t = s.thrust_kN * line.count;
    thrust += t;
    ispWeighted += t * s.isp_s;
    if (s.crew_basis === "total") crewTotal += s.crew * line.count;
    else crewOnWatch += s.crew * line.count;
  }
  const isp = thrust > 0 ? ispWeighted / thrust : 0;

  // ---- crew ----------------------------------------------------------------
  // crew = Σ (basis == "total" ? crew : crew_per_watch × watch_factor) × automation_factor
  // (docs/UNITS.md §4). No set supplies automation_factor, so it stays at 1 —
  // the identity, not a guess — and the omission is stated.
  const automation = ctx.params?.automation_factor;
  if (automation === undefined && crewOnWatch + crewTotal > 0) {
    assumptions.push("Automation factor is 1: no constraint set in scope supplies `automation_factor`, so the complement is un-adjusted.");
  }
  const rolledCrew = Math.round((crewTotal + crewOnWatch * ship.watch_factor) * (automation ?? 1));
  const crew = ship.crew_override > 0 ? ship.crew_override : rolledCrew;

  const kgPerCrewDay = ctx.params?.kg_per_crew_day;
  let consumables = 0;
  if (kgPerCrewDay !== undefined && ship.endurance_days > 0) consumables = (crew * ship.endurance_days * kgPerCrewDay) / 1000;
  else if (ship.endurance_days > 0) assumptions.push("Consumables mass is 0: no constraint set supplies `kg_per_crew_day`, so endurance carries no mass.");

  const dry = structuralMass + moduleMass + armor.mass_t + consumables;
  const wet = dry + propellant.mass_t;

  // ---- modes ---------------------------------------------------------------
  const modes = modesOf(ship).map((mode) => modeBudget(mode, lines, advisories));
  // The headline is the hungriest mode: a ship is sized for its worst case, and
  // with no modes declared that is the single implicit full-power mode, which
  // is exactly what the pre-mode engine reported.
  const worst = modes.reduce((a, b) => (b.powerIn_MW > a.powerIn_MW || (b.powerIn_MW === a.powerIn_MW && b.heatOut_MW > a.heatOut_MW) ? b : a), modes[0] as ModeBudget);

  // ---- volume --------------------------------------------------------------
  const volumes = ctx.hull ? sectionVolumes(ctx.hull) : [];
  const used = new Map<string, number>();
  for (const m of ship.manifest) if (m.section) used.set(m.section, (used.get(m.section) ?? 0) + (specOf(m.module)?.volume_m3 ?? 0) * m.count);
  for (const t of ship.tanks) if (t.section && !t.slot) used.set(t.section, (used.get(t.section) ?? 0) + t.volume_m3);
  const sections: SectionBudget[] = volumes.map((v) => {
    const spent = used.get(v.id) ?? 0;
    return { id: v.id, usable_m3: v.usable_m3, used_m3: spent, over_m3: Math.max(0, spent - v.usable_m3) };
  });

  // ---- balance -------------------------------------------------------------
  // As loaded. A ship's centre of gravity in the condition it flies in is the
  // one that matters, and the fuel is usually the heaviest thing aboard: a full
  // ventral drop tank moves the CG a long way off the thrust line, and a
  // dry-mass CG would not show it at all. The legacy bare `propellant_t` has no
  // tank and therefore no station, so it cannot be placed.
  const items: MassItem[] = lines
    .map((l) => ({ x: l.x, mass: l.mass_t + (l.propellant_t ?? 0), id: l.id }))
    .filter((l): l is { x: number; mass: number; id: string } => l.x !== undefined && l.mass > 0)
    .map((l) => ({ x: l.x, mass_t: l.mass, id: l.id }));
  if (ctx.hull && structuralMass > 0) {
    const centroid = volumeCentroid(ctx.hull.spine);
    if (centroid !== undefined) items.push({ x: centroid, mass_t: structuralMass, id: "structure" });
  }
  const cg = cgStation(items);
  const offset = thrustOffset(lines, ctx.hull);
  const driveStation = lines.find((l) => (l.spec?.thrust_kN ?? 0) > 0 && l.x !== undefined)?.x;
  const arm = cg !== undefined && driveStation !== undefined ? Math.abs(driveStation - cg) : 0;
  const gimbal = offset > 0 && arm > 0 ? (Math.atan(offset / arm) * 180) / Math.PI : 0;
  if (gimbal > 0 && ctx.params?.max_gimbal_deg === undefined) {
    assumptions.push(
      `The thrust line needs ${gimbal.toFixed(1)}° of gimbal to aim through the centre of gravity. Whether that is available is unknown: no constraint set supplies \`max_gimbal_deg\`.`,
    );
  }

  const staged = stageDeltaV(ship, dry, isp, thrust, propellant, specOf);

  const budget: ShipBudget = {
    lines,
    structuralMass_t: structuralMass,
    moduleMass_t: moduleMass,
    armorMass_t: armor.mass_t,
    consumablesMass_t: consumables,
    dryMass_t: dry,
    propellant_t: propellant.mass_t,
    propellantCapacity_t: capacity,
    wetMass_t: wet,
    powerOut_MW: worst.powerOut_MW,
    powerIn_MW: worst.powerIn_MW,
    powerMargin_MW: worst.powerMargin_MW,
    heatOut_MW: worst.heatOut_MW,
    heatReject_MW: worst.heatReject_MW,
    heatMargin_MW: worst.heatMargin_MW,
    thrust_kN: thrust,
    isp_s: isp,
    // Written the long way round — kN to N over t to kg — because that is the
    // order the phase-1 engine evaluated in, and floating-point addition is not
    // associative: `thrust / (dry * G0)` differs from this in the last bit, and
    // the regression gate compares exactly.
    accelWet_g: wet > 0 ? (thrust * 1000) / (wet * 1000) / G0 : 0,
    accelDry_g: dry > 0 ? (thrust * 1000) / (dry * 1000) / G0 : 0,
    deltaV_kms: staged.total_kms,
    stages: staged.stages,
    cost,
    crew,
    crewOnWatch,
    crewDays: crew * ship.endurance_days,
    modes,
    worstMode: worst.id,
    sections,
    volumeUsed_m3: lines.reduce((sum, l) => sum + l.volume_m3, 0),
    volumeUsable_m3: volumes.reduce((sum, v) => sum + v.usable_m3, 0),
    thrustOffset_m: offset,
    gimbalRequired_deg: gimbal,
    provisional,
    assumptions,
    advisories,
  };
  if (cg !== undefined) budget.cgStation_m = cg;
  return budget;
}

// ---------------------------------------------------------------------------
// Propellant
// ---------------------------------------------------------------------------

interface PropellantLoad {
  mass_t: number;
  /** Mass per tank id, for staging. */
  byTank: Map<string, number>;
  /** True when the total rests on a provisional density. */
  provisional: boolean;
}

/**
 * Propellant mass.
 *
 * From the tanks when there are any: `volume_m3 × density`, with the density
 * from `_tables/propellants.yaml`. Every row in that file is provisional — its
 * own header says so — so any mass derived from it is marked, and a tank whose
 * propellant has no row contributes no mass rather than a guessed one.
 *
 * v1's bare `propellant_t` is read **only when there are no tanks**, so a craft
 * that has been given tanks is never counted twice.
 */
function propellantLoad(ship: ShipLoadout, ctx: ShipContext, provisional: string[], advisories: Violation[]): PropellantLoad {
  const byTank = new Map<string, number>();
  if (!ship.tanks.length) return { mass_t: ship.propellant_t, byTank, provisional: false };

  let total = 0;
  let sawProvisional = false;
  for (const tank of ship.tanks) {
    if (!tank.propellant) {
      advisories.push(
        violation("warn", `Tank "${tank.id}" names no propellant, so its ${fmt(tank.volume_m3)} m³ carries no mass and contributes nothing to Δv.`, {
          field: "tanks",
          domain: "deltav",
          source: "ship.budget",
          anchor: { componentId: tank.id },
        }),
      );
      continue;
    }
    const found = ctx.tables?.lookup("propellants", tank.propellant, "density_kg_m3");
    if (!found || "error" in found) {
      advisories.push(
        violation("warn", `No density for propellant "${tank.propellant}"${found ? `: ${found.error}` : ""}. Tank "${tank.id}" carries no mass until one is supplied.`, {
          field: "tanks",
          domain: "deltav",
          source: "_tables/propellants.yaml",
          anchor: { componentId: tank.id },
        }),
      );
      continue;
    }
    const density = typeof found.lookup.value === "number" ? found.lookup.value : 0;
    const mass = (tank.volume_m3 * density) / 1000;
    byTank.set(tank.id, mass);
    total += mass;
    if (found.lookup.provisional) {
      sawProvisional = true;
      const label = `propellant density for "${tank.propellant}"`;
      if (!provisional.includes(label)) provisional.push(label);
    }
  }
  if (sawProvisional) provisional.push("propellant mass, wet mass, Δv and acceleration");
  return { mass_t: total, byTank, provisional: sawProvisional };
}

// ---------------------------------------------------------------------------
// Armour
// ---------------------------------------------------------------------------

/**
 * Armour mass, per zone: the hull's wetted area over the zone's run, times the
 * thickness, times the material density from `_tables/armor.yaml`. Armour
 * consumes no internal volume (`gallery/05` §3).
 */
function armorMass(ctx: ShipContext, provisional: string[]): { mass_t: number } {
  const zones = ctx.hull?.armor_zones ?? [];
  if (!ctx.hull || !zones.length) return { mass_t: 0 };
  let mass = 0;
  for (const zone of zones) {
    const thickness = zone.thickness_cm ?? 0;
    if (!(thickness > 0) || !zone.material) continue;
    const found = ctx.tables?.lookup("armor", zone.material, "density_kg_m3");
    if (!found || "error" in found) continue;
    const density = typeof found.lookup.value === "number" ? found.lookup.value : 0;
    const area = wettedArea(ctx.hull.spine, Math.min(zone.x0, zone.x1), Math.max(zone.x0, zone.x1));
    mass += (area * (thickness / 100) * density) / 1000;
    if (found.lookup.provisional && !provisional.includes("armour mass")) provisional.push("armour mass");
  }
  return { mass_t: mass };
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

function modeBudget(mode: OperatingMode, lines: BudgetLine[], advisories: Violation[]): ModeBudget {
  let powerOut = 0;
  let powerIn = 0;
  let radiated = 0;
  const heat: Record<HeatClass, number> = { low: 0, high: 0 };
  const reject: Record<HeatClass, number> = { low: 0, high: 0 };
  let rejectUnclassed = 0;
  const standbyUnknown: string[] = [];

  for (const line of lines) {
    const spec = line.spec;
    if (!spec) continue;
    const duty = dutyFor(mode, line.id);
    const draw = dutyDraw(spec, duty);
    if (draw.standbyUnknown) standbyUnknown.push(line.id);
    const c = line.count;
    powerOut += spec.power_out_MW * draw.fraction * c;
    powerIn += draw.draw_MW * c;
    radiated += spec.radiated_power_kw * draw.fraction * c;
    heat[heatClassOf(spec)] += rejectableHeat(spec) * draw.fraction * c;
    // Rejection scales with duty too: a radiator folded away in EMCON rejects
    // nothing.
    const rejected = spec.heat_reject_MW * draw.fraction * c;
    if (rejected === 0) continue;
    const cls = rejectClassOf(spec);
    if (cls) reject[cls] += rejected;
    else rejectUnclassed += rejected;
  }

  if (standbyUnknown.length) {
    const who = standbyUnknown.length === 1 ? `"${standbyUnknown[0]}" is` : `${standbyUnknown.length} components are`;
    advisories.push(
      violation("info", `In ${mode.name}, ${who} set to standby but declare no \`power_standby_MW\`, so standby is budgeted as off.`, {
        field: "modes",
        domain: "power",
        mode: mode.id,
        source: "ship.budget",
        ...(standbyUnknown.length === 1 ? { anchor: { componentId: standbyUnknown[0] as string } } : {}),
      }),
    );
  }

  // Unclassed rejection goes where it is needed, worst deficit first. It cannot
  // be double-counted: each MW is spent once.
  let spare = rejectUnclassed;
  const deficitLow = Math.max(0, heat.low - reject.low);
  const deficitHigh = Math.max(0, heat.high - reject.high);
  const toLow = Math.min(spare, deficitLow);
  spare -= toLow;
  const toHigh = Math.min(spare, deficitHigh);
  spare -= toHigh;

  const heatOut = heat.low + heat.high;
  const heatReject = reject.low + reject.high + rejectUnclassed;
  return {
    id: mode.id,
    name: mode.name,
    powerOut_MW: powerOut,
    powerIn_MW: powerIn,
    powerMargin_MW: powerOut - powerIn,
    heatOut_MW: heatOut,
    heatLow_MW: heat.low,
    heatHigh_MW: heat.high,
    heatReject_MW: heatReject,
    rejectLow_MW: reject.low,
    rejectHigh_MW: reject.high,
    rejectUnclassed_MW: rejectUnclassed,
    rejectSpare_MW: spare,
    heatMargin_MW: heatReject - heatOut,
    marginLow_MW: reject.low + toLow - heat.low,
    marginHigh_MW: reject.high + toHigh - heat.high,
    radiated_kw: radiated,
  };
}

// ---------------------------------------------------------------------------
// Staged Δv
// ---------------------------------------------------------------------------

/**
 * Δv stage by stage (`gallery/05` §3).
 *
 * Tanks carry a `jettison_order`: 1 is dropped first, then 2, and 0 is integral
 * and burns last. At each jettison the tankage's own dry mass leaves with it,
 * which is the whole point of a drop tank and is why a single rocket-equation
 * pass over the total load understates Δv.
 *
 * With no tanks there is one stage — the v1 case — and the total is identical
 * to what the pre-staging engine produced.
 */
function stageDeltaV(
  ship: ShipLoadout,
  dryMass_t: number,
  isp_s: number,
  thrust_kN: number,
  propellant: PropellantLoad,
  specOf: (id: string | undefined) => ModuleSpec | undefined,
): { stages: Stage[]; total_kms: number } {
  if (!(isp_s > 0) || !(dryMass_t > 0)) return { stages: [], total_kms: 0 };

  const orders = [...new Set(ship.tanks.map((t) => t.jettison_order))].filter((o) => o > 0).sort((a, b) => a - b);
  // 0 burns last: it is the integral stage. A ship with no tanks at all still
  // has one, carrying the legacy `propellant_t`.
  orders.push(0);

  const stages: Stage[] = [];
  let carried = propellant.mass_t;
  // Dry mass still aboard at the start of each stage, counting tankage not yet
  // dropped. Tank dry mass is already inside `dryMass_t`.
  let dryAboard = dryMass_t;
  let total = 0;

  for (const order of orders) {
    const tanks = ship.tanks.filter((t) => t.jettison_order === order);
    const burn = ship.tanks.length ? tanks.reduce((sum, t) => sum + (propellant.byTank.get(t.id) ?? 0), 0) : order === 0 ? propellant.mass_t : 0;
    const m0 = dryAboard + carried;
    const mf = m0 - burn;
    if (burn > 0 && m0 > 0 && mf > 0) {
      const dv = (isp_s * G0 * Math.log(m0 / mf)) / 1000;
      stages.push({
        order,
        tanks: tanks.map((t) => t.id),
        m0_t: m0,
        mf_t: mf,
        propellant_t: burn,
        deltaV_kms: dv,
        accelStart_g: m0 > 0 ? thrust_kN / (m0 * G0) : 0,
      });
      total += dv;
      carried -= burn;
    }
    // Drop the emptied tankage before the next stage, whether or not it held
    // anything: an empty drop tank is still jettisoned.
    if (order > 0) dryAboard -= tanks.reduce((sum, t) => sum + (specOf(t.module)?.mass_t ?? 0), 0);
  }
  return { stages, total_kms: total };
}

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

/**
 * How far the centre of gravity sits off the line the drives push along.
 *
 * Both transverse components matter: an external fitting at clock angle θ on a
 * hull of semi-axes (a, b) sits at `(b·sin θ, a·cos θ)` in the cross-section,
 * so a lone dorsal mount and a lone starboard mount are equally out of balance,
 * just about different axes. Internal items and unplaced lines sit on the axis
 * — the manifest is volume in a section, not a position.
 */
function thrustOffset(lines: BudgetLine[], hull?: HullGeometry): number {
  if (!hull) return 0;
  let mass = 0;
  let my = 0;
  let mz = 0;
  let thrust = 0;
  let ty = 0;
  let tz = 0;
  for (const line of lines) {
    if (line.x === undefined) continue;
    // A drive is axial. Its slot carries a clock angle because every slot does,
    // but a stern bell pushes along the thrust line by definition — placing it
    // out on the skin would invent a torque and, worse, cancel a real one.
    const axial = line.spec?.category === "drive";
    const theta = ((line.theta_deg ?? 0) * Math.PI) / 180;
    const a = halfHeightAt(hull.spine, line.x);
    const b = beamAt(hull.spine, line.x) / 2;
    const offAxis = line.theta_deg !== undefined && !axial;
    const y = offAxis ? a * Math.cos(theta) : 0;
    const z = offAxis ? b * Math.sin(theta) : 0;
    const laden = line.mass_t + (line.propellant_t ?? 0);
    mass += laden;
    my += laden * y;
    mz += laden * z;
    const t = (line.spec?.thrust_kN ?? 0) * line.count;
    if (t > 0) {
      thrust += t;
      ty += t * y;
      tz += t * z;
    }
  }
  if (!(mass > 0)) return 0;
  const cy = my / mass;
  const cz = mz / mass;
  const dy = thrust > 0 ? ty / thrust : 0;
  const dz = thrust > 0 ? tz / thrust : 0;
  return Math.hypot(cy - dy, cz - dz);
}
