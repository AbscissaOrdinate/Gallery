/**
 * What a round weighs, and what it takes up.
 *
 * `_tables/munitions.yaml` carries calibre, velocity, penetration and a damage
 * index for every round, and **no mass and no volume** — so until 2026-09-20 a
 * magazine was recorded as a mix of counts and contributed nothing to the mass
 * budget. A 240-round 450 mm magazine is not weightless, and that was the
 * largest known hole in the ship budget.
 *
 * ## Four anchors, ruled 2026-09-20 and 2026-09-21
 *
 * | calibre | mass | volume | implied stowage density | taken from |
 * |---|---|---|---|---|
 * | 20 mm | 0.25 kg | 0.0025 m³ | 100 kg/m³ | autocannon round, complete |
 * | 120 mm | 22 kg | 0.05 m³ | 440 kg/m³ | tank round, complete |
 * | 450 mm | 1,315 kg | 0.8 m³ | 1,644 kg/m³ | naval AP shell |
 * | 600 mm | 2,170 kg | 1.46 m³ | 1,486 kg/m³ | siege mortar shell |
 *
 * Everything else is interpolated from those four, all of which are historical
 * naval-gun or artillery figures.
 *
 * ## The density knee at 450 mm is the whole point
 *
 * Density climbs 100 → 440 → 1,644 kg/m³ and then **falls** to 1,486. A belt of
 * 20 mm is mostly links and air; a 450 mm AP shell in its rack is very nearly
 * solid steel; a 600 mm siege round is short, thin-walled and mostly filler, so
 * it is lighter than a cube-law scale from 450 mm would make it — 2,170 kg
 * against 3,117 kg.
 *
 * That knee is why a single scaling law cannot work here. The mass exponent
 * runs d^2.50, then d^3.09, then **d^1.74**: past roughly 500 mm you have
 * stopped building naval rifles and started building siege ordnance, and the
 * two scale differently. Volume, by contrast, stays on effectively one exponent
 * from 120 mm up (2.098 then 2.091) — it is mass that bends, not bulk.
 *
 * ## Why a piecewise power law and not a cubic
 *
 * The exponent genuinely changes between the anchors — 2.50, then 3.09, then
 * 1.74 — so no single power law passes through all four, and a polynomial fit
 * through four points dives negative below the smallest anchor and oscillates
 * between them. Straight lines between the points **in log-log space** are the
 * simplest curve that hits every anchor exactly, stays positive everywhere and
 * stays monotonic, which is what "a spline from those" has to mean for a
 * quantity that is a mass.
 *
 * Outside the anchors it extrapolates along the nearest segment's exponent, and
 * says that it did. Above 600 mm that is deliberately the *gentle* slope: an
 * 800 mm round comes out at ~3.6 t rather than the ~7.6 t a cube law gives,
 * which is the right neighbourhood for a Schwerer-Gustav-class shell and the
 * wrong one for a scaled naval rifle.
 */

export interface RoundAnchor {
  calibre_mm: number;
  mass_kg: number;
  volume_m3: number;
}

export interface RoundSize {
  mass_kg: number;
  volume_m3: number;
  /** True when the calibre lies outside the anchors and the exponent was extended. */
  extrapolated: boolean;
}

/** The anchors as ruled. A table's `meta.round_scale.anchors` overrides these. */
export const DEFAULT_ROUND_ANCHORS: RoundAnchor[] = [
  { calibre_mm: 20, mass_kg: 0.25, volume_m3: 0.0025 },
  { calibre_mm: 120, mass_kg: 22, volume_m3: 0.05 },
  { calibre_mm: 450, mass_kg: 1315, volume_m3: 0.8 },
  // Ruled 2026-09-21. The mass is a siege-mortar figure; the volume continues
  // the 120–450 exponent, which is what makes the density fall rather than the
  // volume jump.
  { calibre_mm: 600, mass_kg: 2170, volume_m3: 1.46 },
];

/** One segment's exponent: `y = y0 · (d/d0)^k` through both ends. */
function exponent(d0: number, y0: number, d1: number, y1: number): number {
  if (!(d0 > 0 && d1 > 0 && y0 > 0 && y1 > 0) || d0 === d1) return 0;
  return Math.log(y1 / y0) / Math.log(d1 / d0);
}

/**
 * Mass and stowed volume for a round of this calibre.
 *
 * Returns `undefined` rather than a guess when there is nothing to interpolate
 * from — one anchor is a point, not a curve — so a caller can say the figure is
 * missing instead of quietly inventing one.
 */
export function roundSize(calibre_mm: number, anchors: RoundAnchor[] = DEFAULT_ROUND_ANCHORS): RoundSize | undefined {
  if (!(calibre_mm > 0)) return undefined;
  const sorted = anchors.filter((a) => a.calibre_mm > 0 && a.mass_kg > 0 && a.volume_m3 > 0).sort((a, b) => a.calibre_mm - b.calibre_mm);
  if (sorted.length < 2) return undefined;

  // The segment this calibre falls in, or the nearest one to extend from.
  let i = sorted.findIndex((a, n) => n + 1 < sorted.length && calibre_mm <= (sorted[n + 1] as RoundAnchor).calibre_mm);
  if (i < 0) i = sorted.length - 2;
  const lo = sorted[i] as RoundAnchor;
  const hi = sorted[i + 1] as RoundAnchor;
  const ratio = calibre_mm / lo.calibre_mm;

  return {
    mass_kg: lo.mass_kg * Math.pow(ratio, exponent(lo.calibre_mm, lo.mass_kg, hi.calibre_mm, hi.mass_kg)),
    volume_m3: lo.volume_m3 * Math.pow(ratio, exponent(lo.calibre_mm, lo.volume_m3, hi.calibre_mm, hi.volume_m3)),
    extrapolated: calibre_mm < (sorted[0] as RoundAnchor).calibre_mm || calibre_mm > (sorted[sorted.length - 1] as RoundAnchor).calibre_mm,
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Read the anchors a munitions table declares, from `meta.round_scale.anchors`.
 * A table that declares none falls back to the ruled set, so a vault whose
 * table predates the ruling still gets masses.
 */
export function readRoundAnchors(meta: Record<string, unknown> | undefined): RoundAnchor[] {
  const scale = isObject(meta?.round_scale) ? meta.round_scale : undefined;
  const raw = Array.isArray(scale?.anchors) ? scale.anchors : [];
  const anchors = raw
    .filter(isObject)
    .map((a) => ({ calibre_mm: num(a.calibre_mm), mass_kg: num(a.mass_kg), volume_m3: num(a.volume_m3) }))
    .filter((a) => a.calibre_mm > 0 && a.mass_kg > 0 && a.volume_m3 > 0);
  return anchors.length >= 2 ? anchors : DEFAULT_ROUND_ANCHORS;
}
