/**
 * Units and dimensional analysis for the expression layer (§2.3).
 *
 * A **dimension** is a vector of exponents over four base quantities — mass,
 * length, time, temperature. That covers everything the designer computes:
 * power is M·L²·T⁻³, the Stefan-Boltzmann constant is M·T⁻³·Θ⁻⁴, areal density
 * is M·L⁻². Current, amount and luminous intensity never appear.
 *
 * A **unit** is a dimension plus the factor that converts it to SI base. That
 * second half is what lets the checker tell watts from megawatts and tonnes
 * from kilograms, which a dimension alone cannot.
 *
 * Both are inferred from a field's *unit suffix* — `area_m2` is m², and
 * `heat_rejected_mw` is MW — because that is how every stat in this codebase is
 * already named, and §8 fixes the canonical unit per quantity (mass tonnes,
 * power MW, thrust kN, volume m³, length m). Records keep those units on disk;
 * the imperial toggle is display-only.
 *
 * ## Scale-agnostic literals
 *
 * A bare number in an expression has no unit, so it takes the scale of whatever
 * it is combined with rather than asserting SI. `mass_t + 5` is five tonnes and
 * draws no complaint, and `theta_deg > 90` compares degrees with degrees. Only
 * a value that actually knows its unit can disagree with another one.
 *
 * ## What is checked, and what is not
 *
 * Mismatches are warnings, never failures (§2.3: "a warning, not a hard failure,
 * since users will write shortcuts"). A field whose name has no recognised
 * suffix is dimensionless and scale-agnostic, so unrecognised names stay quiet
 * rather than generating noise.
 *
 * The suffix table is meant for designer stats. It would read the `population_k`
 * on a location record as a temperature; nothing puts location fields through
 * this layer, but do not repurpose `dimOf` for records generally.
 */

/** Exponents of [mass, length, time, temperature]. */
export type Dim = readonly [number, number, number, number];

export const DIMENSIONLESS: Dim = [0, 0, 0, 0];

export const dimEq = (a: Dim, b: Dim): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
export const isDimensionless = (d: Dim): boolean => dimEq(d, DIMENSIONLESS);
export const dimMul = (a: Dim, b: Dim): Dim => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
export const dimDiv = (a: Dim, b: Dim): Dim => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
export const dimPow = (a: Dim, k: number): Dim => [a[0] * k, a[1] * k, a[2] * k, a[3] * k];

/** A unit: what quantity it measures, and what multiplies it into SI base units. */
export interface Unit {
  symbol: string;
  dim: Dim;
  /** value_in_SI = value × scale. */
  scale: number;
}

// ---------------------------------------------------------------------------
// Named dimensions, for readable messages
// ---------------------------------------------------------------------------

const NAMED: { dim: Dim; name: string }[] = [
  { dim: [0, 0, 0, 0], name: "dimensionless" },
  { dim: [1, 0, 0, 0], name: "mass" },
  { dim: [0, 1, 0, 0], name: "length" },
  { dim: [0, 2, 0, 0], name: "area" },
  { dim: [0, 3, 0, 0], name: "volume" },
  { dim: [0, 0, 1, 0], name: "time" },
  { dim: [0, 0, -1, 0], name: "frequency" },
  { dim: [0, 0, 0, 1], name: "temperature" },
  { dim: [0, 1, -1, 0], name: "velocity" },
  { dim: [0, 1, -2, 0], name: "acceleration" },
  { dim: [1, 1, -2, 0], name: "force" },
  { dim: [1, 2, -2, 0], name: "energy" },
  { dim: [1, 2, -3, 0], name: "power" },
  { dim: [1, 1, -1, 0], name: "momentum" },
  { dim: [1, -3, 0, 0], name: "density" },
  { dim: [1, -2, 0, 0], name: "areal density" },
  { dim: [1, -1, -2, 0], name: "pressure" },
  { dim: [1, 0, -3, 0], name: "power per area" },
  { dim: [1, 0, -3, -4], name: "Stefan-Boltzmann" },
  { dim: [-1, 0, 3, 0], name: "mass per power" },
];

const BASE_SYMBOLS = ["M", "L", "T", "Θ"] as const;

const SUPERSCRIPT: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", ".": "·" };

const superscript = (n: number): string =>
  String(n)
    .split("")
    .map((c) => SUPERSCRIPT[c] ?? c)
    .join("");

const magnitude = (d: Dim): number => d.reduce((s, e) => s + Math.abs(e), 0);

/** Named dimensions worth using as a factor, richest first, so we say "power·area" not "area·power". */
const FACTORS = NAMED.filter((n) => !isDimensionless(n.dim)).sort((a, b) => magnitude(b.dim) - magnitude(a.dim));

/**
 * "power", "power·area", or a bare product like "M·L²·T⁻³" when nothing names it.
 *
 * The two-factor pass exists so a mismatch message reads the way an engineer
 * would say it out loud. The spec's example phrases the same quantity as
 * "power·length²"; "power·area" is the same dimension.
 */
export function dimName(d: Dim): string {
  const named = NAMED.find((n) => dimEq(n.dim, d));
  if (named) return named.name;
  // A pure power of one base reads better as L⁴ than as "volume·length".
  const usedBases = d.filter((e) => e !== 0).length;
  if (usedBases > 1) {
    for (const a of FACTORS) {
      const rest = dimDiv(d, a.dim);
      if (isDimensionless(rest)) continue;
      const b = FACTORS.find((n) => dimEq(n.dim, rest));
      if (b) return `${a.name}·${b.name}`;
    }
  }
  const parts = d.map((e, i) => (e === 0 ? "" : e === 1 ? BASE_SYMBOLS[i] : `${BASE_SYMBOLS[i]}${superscript(e)}`)).filter(Boolean);
  return parts.length ? parts.join("·") : "dimensionless";
}

// ---------------------------------------------------------------------------
// The unit table
// ---------------------------------------------------------------------------

const M: Dim = [1, 0, 0, 0];
const L: Dim = [0, 1, 0, 0];
const T: Dim = [0, 0, 1, 0];
const K: Dim = [0, 0, 0, 1];
const AREA: Dim = [0, 2, 0, 0];
const VOLUME: Dim = [0, 3, 0, 0];
const POWER: Dim = [1, 2, -3, 0];
const ENERGY: Dim = [1, 2, -2, 0];
const FORCE: Dim = [1, 1, -2, 0];
const VELOCITY: Dim = [0, 1, -1, 0];
const ACCEL: Dim = [0, 1, -2, 0];
const DENSITY: Dim = [1, -3, 0, 0];
const AREAL_DENSITY: Dim = [1, -2, 0, 0];
const POWER_PER_AREA: Dim = [1, 0, -3, 0];

/** Standard gravity, ISO 80000-3 / 3rd CGPM (1901). Also the scale of one "g" of acceleration. */
export const G0 = 9.80665;
/** 1 kilotonne TNT equivalent = 4.184e12 J exactly, by the thermochemical calorie definition (NIST SP 811). */
const KILOTONNE_TNT_J = 4.184e12;

const unit = (symbol: string, dim: Dim, scale: number): Unit => ({ symbol, dim, scale });

/**
 * Field-name suffix → unit. Longest suffix wins, so `_kg_m2` beats `_kg`,
 * `_kw_m2` beats `_kw`, and `_mw` beats `_m`.
 *
 * `_g` means gees here, never grams: this codebase has no gram-denominated
 * field and the existing budget code already uses `_g` for acceleration.
 *
 * Angles are dimensionless, but carrying their scale still catches degrees used
 * where radians were meant.
 */
const SUFFIX_UNITS: [string, Unit][] = [
  ["_kg_m2", unit("kg/m²", AREAL_DENSITY, 1)],
  ["_kg_m3", unit("kg/m³", DENSITY, 1)],
  ["_g_cm3", unit("g/cm³", DENSITY, 1000)],
  ["_gcc", unit("g/cm³", DENSITY, 1000)],
  ["_t_per_gw", unit("t/GW", [-1, 0, 3, 0], 1000 / 1e9)],
  ["_kw_m2", unit("kW/m²", POWER_PER_AREA, 1e3)],
  ["_mw_m2", unit("MW/m²", POWER_PER_AREA, 1e6)],
  ["_w_m2", unit("W/m²", POWER_PER_AREA, 1)],
  ["_m2", unit("m²", AREA, 1)],
  ["_m3", unit("m³", VOLUME, 1)],
  ["_km", unit("km", L, 1000)],
  ["_cm", unit("cm", L, 0.01)],
  ["_mm", unit("mm", L, 0.001)],
  ["_um", unit("µm", L, 1e-6)],
  ["_nm", unit("nm", L, 1e-9)],
  ["_m", unit("m", L, 1)],
  ["_kg", unit("kg", M, 1)],
  ["_t", unit("t", M, 1000)],
  ["_gw", unit("GW", POWER, 1e9)],
  ["_mw", unit("MW", POWER, 1e6)],
  ["_kw", unit("kW", POWER, 1e3)],
  ["_w", unit("W", POWER, 1)],
  ["_gj", unit("GJ", ENERGY, 1e9)],
  ["_mj", unit("MJ", ENERGY, 1e6)],
  ["_kj", unit("kJ", ENERGY, 1e3)],
  ["_j", unit("J", ENERGY, 1)],
  ["_kt", unit("kt", ENERGY, KILOTONNE_TNT_J)],
  ["_kn", unit("kN", FORCE, 1e3)],
  ["_n", unit("N", FORCE, 1)],
  ["_kps", unit("km/s", VELOCITY, 1000)],
  ["_kms", unit("km/s", VELOCITY, 1000)],
  ["_ms", unit("m/s", VELOCITY, 1)],
  ["_g", unit("g", ACCEL, G0)],
  ["_k", unit("K", K, 1)],
  ["_days", unit("days", T, 86400)],
  ["_day", unit("days", T, 86400)],
  ["_hours", unit("h", T, 3600)],
  ["_min", unit("min", T, 60)],
  ["_s", unit("s", T, 1)],
  ["_urad", unit("µrad", DIMENSIONLESS, 1e-6)],
  ["_mrad", unit("mrad", DIMENSIONLESS, 1e-3)],
  ["_rad", unit("rad", DIMENSIONLESS, 1)],
  ["_deg", unit("°", DIMENSIONLESS, Math.PI / 180)],
];

/** Every unit that may be named in a recipe's `unit:` field, by symbol. */
export const UNITS_BY_SYMBOL = new Map<string, Unit>();
for (const [, u] of SUFFIX_UNITS) if (!UNITS_BY_SYMBOL.has(u.symbol)) UNITS_BY_SYMBOL.set(u.symbol, u);
// Spellings that never appear as a field suffix but read naturally in a `unit:`.
for (const [symbol, u] of [
  ["m/s2", unit("m/s²", ACCEL, 1)],
  ["m/s²", unit("m/s²", ACCEL, 1)],
  ["tonnes", unit("t", M, 1000)],
  ["kps", unit("km/s", VELOCITY, 1000)],
  ["m2", unit("m²", AREA, 1)],
  ["m3", unit("m³", VOLUME, 1)],
] as [string, Unit][]) {
  if (!UNITS_BY_SYMBOL.has(symbol)) UNITS_BY_SYMBOL.set(symbol, u);
}

/** Look a unit up by the symbol a recipe wrote, exactly first and then case-insensitively. */
export function unitBySymbol(symbol: string): Unit | undefined {
  const exact = UNITS_BY_SYMBOL.get(symbol);
  if (exact) return exact;
  const lower = symbol.toLowerCase();
  for (const [key, u] of UNITS_BY_SYMBOL) if (key.toLowerCase() === lower) return u;
  return undefined;
}

/** The unit a field name implies, or undefined when the name carries no recognised suffix. */
export function unitOfField(name: string): Unit | undefined {
  const lower = name.toLowerCase();
  let best: Unit | undefined;
  let bestLen = -1;
  for (const [suffix, u] of SUFFIX_UNITS) {
    if (lower.endsWith(suffix) && suffix.length > bestLen) {
      best = u;
      bestLen = suffix.length;
    }
  }
  return best;
}

/** The dimension a field name implies. Unrecognised names are dimensionless. */
export function dimOf(name: string): Dim {
  return unitOfField(name)?.dim ?? DIMENSIONLESS;
}

/** The scale a field name implies, or undefined when it is scale-agnostic. */
export function scaleOf(name: string): number | undefined {
  return unitOfField(name)?.scale;
}

/**
 * Describe a scale as a unit symbol where one exists for that dimension,
 * otherwise as the bare factor — for messages like "expects MW, yields W".
 */
export function scaleName(dim: Dim, scale: number): string {
  for (const [, u] of SUFFIX_UNITS) if (dimEq(u.dim, dim) && u.scale === scale) return u.symbol;
  return `${Number(scale.toPrecision(6))}× SI`;
}

/** How far apart two scales are, as a readable factor: "1000×", "10⁶×". */
export function scaleRatio(from: number, to: number): string {
  const ratio = from / to;
  const exponent = Math.log10(Math.abs(ratio));
  if (Number.isInteger(exponent) && Math.abs(exponent) >= 3) return `10${superscript(exponent)}×`;
  return `${Number(ratio.toPrecision(6))}×`;
}

export const CONSTANT_DIMS = { SIGMA: [1, 0, -3, -4] as Dim, G0: ACCEL, T_ENV: K, PI: DIMENSIONLESS };
