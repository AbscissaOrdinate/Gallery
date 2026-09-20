/**
 * The normalised read of a module record.
 *
 * Module records are authored by hand today and by editor 3 later; either way
 * the budget engine should see one shape. Every figure defaults to 0 rather
 * than to a plausible guess, so a module that declares nothing contributes
 * nothing and the advisory kernel can say which figure is missing.
 */

export type CrewBasis = "per_watch" | "total";

/**
 * Which temperature regime a heat load belongs to.
 *
 * `docs/UNITS.md` §5: life-support heat (~300 K) and reactor/weapon heat
 * (800–1500 K) need **separate arrays**, and the two must never be summed into
 * one rejection figure — the low-temperature array is usually the larger, and
 * a single total hides that a ship has no way to reject its habitat's heat.
 */
export type HeatClass = "low" | "high";

export interface ModuleSpec {
  category: string;
  slot: string;
  mass_t: number;
  volume_m3: number;
  power_out_MW: number;
  power_in_MW: number;
  /** Draw when idling but available. Absent means `standby` is indistinguishable from `off`. */
  power_standby_MW?: number;
  heat_out_MW: number;
  heat_reject_MW: number;
  /** Radiator working temperature. Decides which array a rejection figure belongs to. */
  reject_temp_k?: number;
  crew: number;
  crew_basis: CrewBasis;
  bus_iface?: string;
  cost: number;
  thrust_kN: number;
  isp_s: number;
  propellant?: string;
  /**
   * `open` means the drive's waste heat leaves in the exhaust and needs no
   * radiator (`docs/UNITS.md` §5). Absent is treated as `closed`, which is the
   * conservative reading: it asks the design for rejection it may not need,
   * rather than quietly forgiving heat it cannot shed.
   */
  cycle?: "open" | "closed";
  propellant_capacity_t: number;
  /** Rounds the mounting holds, for the magazine check. */
  magazine: number;
  weapon_family?: string;
  bore_mm?: number;
  barrels?: number;
  launch_cells?: number;
  /** Radiated RF power. A module with any is an emitter, and EMCON shuts it down. */
  radiated_power_kw: number;
}

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const optNum = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const optStr = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || undefined;
};

export function readModule(fields: Record<string, unknown>): ModuleSpec {
  const spec: ModuleSpec = {
    category: typeof fields.category === "string" ? fields.category : "other",
    slot: typeof fields.slot === "string" ? fields.slot : "internal",
    mass_t: n(fields.mass_t),
    volume_m3: n(fields.volume_m3),
    power_out_MW: n(fields.power_out_MW),
    power_in_MW: n(fields.power_in_MW),
    heat_out_MW: n(fields.heat_out_MW),
    heat_reject_MW: n(fields.heat_reject_MW),
    // `per_watch` is the default an author writing by hand means; the
    // NEBULOUS-seeded catalogue is `total` (docs/UNITS.md §4).
    crew: n(fields.crew),
    crew_basis: fields.crew_basis === "total" ? "total" : "per_watch",
    cost: n(fields.cost),
    thrust_kN: n(fields.thrust_kN),
    isp_s: n(fields.isp_s),
    propellant_capacity_t: n(fields.propellant_capacity_t),
    magazine: n(fields.magazine),
    radiated_power_kw: n(fields.radiated_power_kw),
  };
  const standby = optNum(fields.power_standby_MW);
  if (standby !== undefined) spec.power_standby_MW = standby;
  const temp = optNum(fields.reject_temp_k);
  if (temp !== undefined) spec.reject_temp_k = temp;
  const bus = optStr(fields.bus_iface);
  if (bus) spec.bus_iface = bus;
  const prop = optStr(fields.propellant);
  if (prop) spec.propellant = prop;
  if (fields.cycle === "open" || fields.cycle === "closed") spec.cycle = fields.cycle;
  const family = optStr(fields.weapon_family);
  if (family) spec.weapon_family = family;
  const bore = optNum(fields.bore_mm);
  if (bore !== undefined) spec.bore_mm = bore;
  const barrels = optNum(fields.barrels);
  if (barrels !== undefined) spec.barrels = barrels;
  const cells = optNum(fields.launch_cells);
  if (cells !== undefined) spec.launch_cells = cells;
  return spec;
}

/**
 * Which array has to reject a module's waste heat.
 *
 * Reactors, drives and weapons run hot; everything a crew lives inside runs
 * near 300 K. An unrecognised category is treated as **low**, which is the
 * conservative half: the low-temperature array is the larger one, so an
 * unknown lands in the budget that is harder to satisfy rather than the one
 * that flatters it.
 */
const HIGH_TEMP = new Set(["reactor", "drive", "weapon-kinetic", "weapon-laser", "weapon-particle", "weapon-missile", "point-defense"]);

export function heatClassOf(spec: ModuleSpec): HeatClass {
  return HIGH_TEMP.has(spec.category) ? "high" : "low";
}

/**
 * Waste heat an array actually has to reject.
 *
 * An open-cycle drive throws its heat out with the propellant: a torch putting
 * 250 MW into its exhaust needs no radiator for it, and counting it as a
 * rejection load would demand an array the ship does not need and would fail
 * every torch ship in the vault on thermal. `docs/UNITS.md` §5.
 */
export function rejectableHeat(spec: ModuleSpec): number {
  if (spec.category === "drive" && spec.cycle === "open") return 0;
  return spec.heat_out_MW;
}

/**
 * The array a radiator belongs to, or `undefined` when it does not say.
 *
 * 400 K is the split: a radiator below it cannot usefully reject a 1,200 K
 * reactor load, and one far above it is a poor match for a 300 K habitat. A
 * radiator that declares no temperature is left unclassed and counted against
 * whichever load still needs it, with the ambiguity reported.
 */
export function rejectClassOf(spec: ModuleSpec): HeatClass | undefined {
  if (spec.reject_temp_k === undefined) return undefined;
  return spec.reject_temp_k < 400 ? "low" : "high";
}
