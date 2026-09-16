/**
 * Dimensional analysis for the expression layer (§2.3).
 *
 * A dimension is a vector of exponents over four base quantities — mass,
 * length, time, temperature. That is enough for everything the designer
 * computes: power is M·L²·T⁻³, the Stefan-Boltzmann constant is M·T⁻³·Θ⁻⁴,
 * areal density is M·L⁻². Current, amount and luminous intensity never appear.
 *
 * Dimensions are inferred from a field's *unit suffix* (`area_m2` → area,
 * `heat_rejected_mw` → power), because that is how every stat in this codebase
 * is already named. An identifier with no recognised suffix is treated as
 * dimensionless, which is right for the ratios and efficiencies that make up
 * most bare-named parameters (`emissivity`, `packing_efficiency`).
 *
 * Checking is advisory. A mismatch is a `warn`, never a failure — users write
 * shortcuts, and a shortcut that produces the right number is not a bug.
 *
 * Note the limit this design has by construction: dimensions carry no scale, so
 * the check cannot tell watts from megawatts, or tonnes from kilograms. It
 * catches `power·length²`, not a factor of 1000.
 */

/** Exponents of [mass, length, time, temperature]. */
export type Dim = readonly [number, number, number, number];

export const DIMENSIONLESS: Dim = [0, 0, 0, 0];

export const dimEq = (a: Dim, b: Dim): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
export const isDimensionless = (d: Dim): boolean => dimEq(d, DIMENSIONLESS);
export const dimMul = (a: Dim, b: Dim): Dim => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
export const dimDiv = (a: Dim, b: Dim): Dim => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
export const dimPow = (a: Dim, k: number): Dim => [a[0] * k, a[1] * k, a[2] * k, a[3] * k];

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
// Unit suffixes → dimensions
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

/**
 * Longest suffix wins, so `_kg_m2` beats `_kg` and `_kw_m2` beats `_kw`.
 * `_g` means gees here (`accelWet_g`), never grams — this codebase has no
 * gram-denominated field, and the existing budget code already uses `_g` for
 * acceleration.
 */
const SUFFIXES: [string, Dim][] = [
  ["_kg_m2", AREAL_DENSITY],
  ["_kg_m3", DENSITY],
  ["_g_cm3", DENSITY],
  ["_gcc", DENSITY],
  ["_t_per_gw", [-1, 0, 3, 0]],
  ["_kw_m2", POWER_PER_AREA],
  ["_mw_m2", POWER_PER_AREA],
  ["_w_m2", POWER_PER_AREA],
  ["_m2", AREA],
  ["_m3", VOLUME],
  ["_km", L],
  ["_cm", L],
  ["_mm", L],
  ["_um", L],
  ["_nm", L],
  ["_m", L],
  ["_kg", M],
  ["_t", M],
  ["_gw", POWER],
  ["_mw", POWER],
  ["_kw", POWER],
  ["_w", POWER],
  ["_gj", ENERGY],
  ["_mj", ENERGY],
  ["_kj", ENERGY],
  ["_j", ENERGY],
  ["_kt", ENERGY], // kilotonnes TNT — an energy, per §5 warhead yield
  ["_kn", FORCE],
  ["_n", FORCE],
  ["_kps", VELOCITY],
  ["_kms", VELOCITY],
  ["_ms", VELOCITY],
  ["_g", ACCEL],
  ["_k", K],
  ["_days", T],
  ["_day", T],
  ["_hours", T],
  ["_min", T],
  ["_s", T],
];

/**
 * The dimension a field name implies. Unrecognised names are dimensionless —
 * see the note at the top of this file.
 */
export function dimOf(name: string): Dim {
  const lower = name.toLowerCase();
  let best: Dim | undefined;
  let bestLen = -1;
  for (const [suffix, dim] of SUFFIXES) {
    if (lower.endsWith(suffix) && suffix.length > bestLen) {
      best = dim;
      bestLen = suffix.length;
    }
  }
  return best ?? DIMENSIONLESS;
}

export const CONSTANT_DIMS = { SIGMA: [1, 0, -3, -4] as Dim, G0: ACCEL, T_ENV: K, PI: DIMENSIONLESS };
