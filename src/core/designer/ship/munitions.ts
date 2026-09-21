/**
 * What a round weighs, and what it takes up.
 *
 * `_tables/munitions.yaml` carries calibre, velocity, penetration and a damage
 * index for every round, and **no mass and no volume** — so until 2026-09-20 a
 * magazine was recorded as a mix of counts and contributed nothing to the mass
 * budget. A 240-round 450 mm magazine is not weightless, and that was the
 * largest known hole in the ship budget.
 *
 * ## Three anchors, ruled 2026-09-20
 *
 * | calibre | mass | volume | implied stowage density |
 * |---|---|---|---|
 * | 20 mm | 0.25 kg | 0.0025 m³ | 100 kg/m³ |
 * | 120 mm | 22 kg | 0.05 m³ | 440 kg/m³ |
 * | 450 mm | 1,315 kg | 0.8 m³ | 1,644 kg/m³ |
 *
 * Everything else is interpolated from those three. The density climbing with
 * calibre is the interesting part and is why a single scaling law will not do:
 * a belt of 20 mm is mostly links and air, a 450 mm shell in its rack is mostly
 * metal.
 *
 * ## Why a piecewise power law and not a cubic
 *
 * Three points, and the exponent genuinely changes between them — mass goes as
 * d^2.50 from 20 to 120 mm and as d^3.09 from 120 to 450. A single power law
 * cannot pass through all three; a cubic through three points in linear space
 * overshoots into negative mass below the smallest anchor. Straight lines
 * between the points **in log-log space** are the simplest curve that passes
 * through every anchor exactly, stays positive everywhere, and stays monotonic
 * — which is what "a spline from those three" has to mean for a quantity that
 * is a mass.
 *
 * Outside the anchors it extrapolates along the nearest segment's exponent, so
 * a 15 mm round and a 600 mm round both get an answer, and both are marked as
 * resting on an extrapolation.
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
