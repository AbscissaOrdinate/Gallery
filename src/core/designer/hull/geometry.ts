/**
 * Hull spine geometry (§2.4) — pure functions, no library, no CAD kernel.
 *
 * The cross-section at station x is an ellipse with semi-axes `half_height(x)`
 * and `beam(x)/2`, both linearly interpolated between authored stations. So:
 *
 *   V     = ∫ π·a(x)·b(x) dx
 *   A_wet = ∫ P(a(x), b(x)) · dl        (Ramanujan perimeter, dl along the surface)
 *
 * Volume is computed **exactly** rather than numerically. Because a and b are
 * piecewise-linear, each segment between consecutive breakpoints is an
 * elliptical frustum with a closed form, and summing them is exact to floating
 * point. `grossVolumeSimpson` is kept beside it as the spec's stated method
 * (§2.4: "integrated numerically (Simpson, ≥200 panels)") and the two are
 * asserted to agree — the closed form is what callers get.
 *
 * ### Deviation from §2.4, logged per §12
 *
 * The spec computes wetted area as "Ramanujan perimeter approximation per
 * station × dx". That is the perimeter times the *axial* step, which ignores
 * the slope of the hull surface: it would give a cone the lateral area of a
 * cylinder, understating a pointed bow badly (a 45° nose cone by a factor of
 * √2, and worse as it sharpens). This implementation multiplies by the surface
 * step `dl = dx·√(1 + (da/dx)²)` averaged over the two semi-axes instead, which
 * reduces to the spec's formula exactly when the profile is parallel-sided.
 * A sphere then integrates to 4πR² within 0.1%, which the spec's version does
 * not.
 */
import type { Appendage, HullGeometry, HullSection, MassItem, ShadowCone, Spine, Station } from "./types";

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Stations sorted fore to aft. The sort is **stable**, which is load-bearing:
 * two stations at the same x are a deliberate vertical step in the profile —
 * a bulkhead, a collar, the flat face of a tank — and their authored order
 * says which value is forward of the step and which is aft of it.
 */
export function sortedStations(spine: Spine): Station[] {
  return (spine.stations ?? [])
    .filter((s) => Number.isFinite(s?.x) && Number.isFinite(s?.half_height_m))
    .slice()
    .sort((p, q) => p.x - q.x);
}

/**
 * Which value to take where the profile is discontinuous. `aft` is the limit
 * approaching x from the bow side, `fore` the limit leaving it towards the
 * stern. They differ only at a step.
 */
export type Side = "aft" | "fore";

/**
 * Linear interpolation over a sorted control list, flat beyond the ends.
 *
 * At a step (two controls sharing an x) this returns the first value for
 * `aft` and the last for `fore`, so a caller integrating a segment can ask for
 * the value *inside* its own segment rather than the one across the step.
 * Sampling the midpoint would be enough for drawing, but not for volume: a
 * step read as a taper under-measures, and on a stepped hull that is tens of
 * per cent of the internal volume.
 */
function interpolate(points: { x: number; v: number }[], x: number, side: Side = "aft"): number {
  if (!points.length) return 0;
  const first = points[0] as { x: number; v: number };
  const last = points[points.length - 1] as { x: number; v: number };
  if (x <= first.x) return first.v;
  if (x >= last.x) return last.v;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as { x: number; v: number };
    const b = points[i] as { x: number; v: number };
    if (x < b.x) {
      const span = b.x - a.x;
      return span === 0 ? b.v : a.v + ((x - a.x) / span) * (b.v - a.v);
    }
    if (x === b.x) {
      // Sitting exactly on a control. `aft` stops here; `fore` walks past any
      // further controls at the same x to the far side of the step.
      if (side === "aft") return b.v;
      let j = i;
      while (j + 1 < points.length && (points[j + 1] as { x: number }).x === x) j++;
      return (points[j] as { x: number; v: number }).v;
    }
  }
  return last.v;
}

/** Profile half-height at station x, in metres. */
export function halfHeightAt(spine: Spine, x: number, side: Side = "aft"): number {
  return Math.max(0, interpolate(sortedStations(spine).map((s) => ({ x: s.x, v: s.half_height_m })), x, side));
}

/** True where the profile jumps at x: two stations share it with different half-heights. */
export function isStep(spine: Spine, x: number): boolean {
  return halfHeightAt(spine, x, "aft") !== halfHeightAt(spine, x, "fore");
}

/** Beam at station x, in metres. Overrides interpolate; elsewhere the hull's nominal beam applies. */
export function beamAt(spine: Spine, x: number, side: Side = "aft"): number {
  const overrides = (spine.beam_overrides ?? [])
    .filter((o) => Number.isFinite(o?.x) && Number.isFinite(o?.beam_m))
    .slice()
    .sort((p, q) => p.x - q.x);
  if (!overrides.length) return Math.max(0, spine.beam_m ?? 0);
  return Math.max(0, interpolate(overrides.map((o) => ({ x: o.x, v: o.beam_m })), x, side));
}

/** Semi-axes of the cross-section at x: [vertical, horizontal]. */
export function semiAxesAt(spine: Spine, x: number, side: Side = "aft"): [number, number] {
  return [halfHeightAt(spine, x, side), beamAt(spine, x, side) / 2];
}

/** Cross-sectional area at x, m². */
export function sectionAreaAt(spine: Spine, x: number): number {
  const [a, b] = semiAxesAt(spine, x);
  return Math.PI * a * b;
}

/**
 * Every x where the profile's slope can change: authored stations, beam
 * overrides, and the hull ends. Integrating segment by segment between these
 * is exact for a piecewise-linear profile.
 */
export function breakpoints(spine: Spine, extra: number[] = []): number[] {
  const length = Math.max(0, spine.length_m ?? 0);
  const xs = new Set<number>([0, length]);
  for (const s of sortedStations(spine)) if (s.x >= 0 && s.x <= length) xs.add(s.x);
  for (const o of spine.beam_overrides ?? []) if (Number.isFinite(o?.x) && o.x >= 0 && o.x <= length) xs.add(o.x);
  for (const x of extra) if (Number.isFinite(x) && x >= 0 && x <= length) xs.add(x);
  return [...xs].sort((p, q) => p - q);
}

/**
 * Volume of one elliptical frustum, where both semi-axes vary linearly.
 *
 *   V = πL · [ a₀b₀ + (a₀Δb + b₀Δa)/2 + ΔaΔb/3 ]
 *
 * With a = b = r this reduces to the familiar πL(r₀² + r₀r₁ + r₁²)/3.
 */
export function frustumVolume(a0: number, b0: number, a1: number, b1: number, length: number): number {
  const da = a1 - a0;
  const db = b1 - b0;
  return Math.PI * length * (a0 * b0 + (a0 * db + b0 * da) / 2 + (da * db) / 3);
}

/** Gross internal volume, m³. Exact for the piecewise-linear profile. */
export function grossVolume(spine: Spine, x0?: number, x1?: number): number {
  const lo = clamp(x0 ?? 0, 0, spine.length_m ?? 0);
  const hi = clamp(x1 ?? spine.length_m ?? 0, 0, spine.length_m ?? 0);
  if (hi <= lo) return 0;
  const xs = breakpoints(spine, [lo, hi]).filter((x) => x >= lo && x <= hi);
  let total = 0;
  for (let i = 1; i < xs.length; i++) {
    const xa = xs[i - 1] as number;
    const xb = xs[i] as number;
    // Each segment is measured from inside itself: the value just *after* its
    // fore end and just *before* its aft end. Reading across a step would
    // measure a taper that is not there.
    const [a0, b0] = semiAxesAt(spine, xa, "fore");
    const [a1, b1] = semiAxesAt(spine, xb, "aft");
    total += frustumVolume(a0, b0, a1, b1, xb - xa);
  }
  return total;
}

/**
 * The spec's stated method: Simpson's rule over ≥200 panels. Kept so the exact
 * form has something independent to be checked against.
 */
export function grossVolumeSimpson(spine: Spine, panels = 200): number {
  const length = Math.max(0, spine.length_m ?? 0);
  if (length <= 0) return 0;
  const n = panels % 2 === 0 ? panels : panels + 1; // Simpson needs an even count
  const h = length / n;
  let total = sectionAreaAt(spine, 0) + sectionAreaAt(spine, length);
  for (let i = 1; i < n; i++) total += (i % 2 === 1 ? 4 : 2) * sectionAreaAt(spine, i * h);
  return (h / 3) * total;
}

/** Usable internal volume = gross × packing efficiency. */
export function usableVolume(hull: HullGeometry, x0?: number, x1?: number): number {
  const packing = hull.packing_efficiency;
  const factor = typeof packing === "number" && packing > 0 ? packing : 1;
  return grossVolume(hull.spine, x0, x1) * factor;
}

/** Ramanujan's approximation to the perimeter of an ellipse with semi-axes a and b. */
export function ellipsePerimeter(a: number, b: number): number {
  if (a <= 0 && b <= 0) return 0;
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

/**
 * Wetted (lateral) area of the swept ellipse, m². Feeds armour zone areas,
 * radiator blockage and RCS.
 *
 * See the deviation note at the top of the file: the axial step is corrected to
 * a surface step so that tapering runs are not understated.
 */
export function wettedArea(spine: Spine, x0?: number, x1?: number, panels = 400): number {
  const length = Math.max(0, spine.length_m ?? 0);
  const lo = clamp(x0 ?? 0, 0, length);
  const hi = clamp(x1 ?? length, 0, length);
  if (hi <= lo) return 0;
  const n = Math.max(2, panels);
  const h = (hi - lo) / n;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const xa = lo + i * h;
    const xb = xa + h;
    const [aa, ba] = semiAxesAt(spine, xa, "fore");
    const [ab, bb] = semiAxesAt(spine, xb, "aft");
    const perimeter = (ellipsePerimeter(aa, ba) + ellipsePerimeter(ab, bb)) / 2;
    // Surface step: average the two semi-axis slopes rather than assume dl = dx.
    const slope = (Math.abs(ab - aa) + Math.abs(bb - ba)) / 2 / h;
    total += perimeter * h * Math.sqrt(1 + slope * slope);
  }
  // A vertical step in the profile is a real annular face — the flat end of a
  // tank, the front of a collar. It has area and it radiates, so it counts.
  for (const x of breakpoints(spine)) {
    if (x < lo || x > hi) continue;
    const [aa, ba] = semiAxesAt(spine, x, "aft");
    const [af, bf] = semiAxesAt(spine, x, "fore");
    total += Math.abs(Math.PI * af * bf - Math.PI * aa * ba);
  }
  return total;
}

/**
 * Presented cross-section, m² (§2.4) — computed separately for the two aspects
 * because they are not the same number and the signature model needs both.
 *
 *  - `bow`  the largest elliptical cross-section anywhere along the hull
 *  - `beam` the silhouette area, ∫ 2·half_height(x) dx
 */
export function presentedArea(spine: Spine, aspect: "bow" | "beam"): number {
  const length = Math.max(0, spine.length_m ?? 0);
  if (length <= 0) return 0;
  if (aspect === "bow") {
    let max = 0;
    for (const x of breakpoints(spine)) max = Math.max(max, sectionAreaAt(spine, x));
    return max;
  }
  const xs = breakpoints(spine);
  let total = 0;
  for (let i = 1; i < xs.length; i++) {
    const xa = xs[i - 1] as number;
    const xb = xs[i] as number;
    total += ((halfHeightAt(spine, xa) + halfHeightAt(spine, xb)) / 2) * 2 * (xb - xa);
  }
  return total;
}

export interface SectionVolume {
  id: string;
  x0: number;
  x1: number;
  gross_m3: number;
  usable_m3: number;
}

/** Gross and usable volume for each authored section. */
export function sectionVolumes(hull: HullGeometry): SectionVolume[] {
  const packing = hull.packing_efficiency;
  const factor = typeof packing === "number" && packing > 0 ? packing : 1;
  return (hull.sections ?? []).map((s: HullSection) => {
    const gross = grossVolume(hull.spine, Math.min(s.x0, s.x1), Math.max(s.x0, s.x1));
    return { id: s.id, x0: s.x0, x1: s.x1, gross_m3: gross, usable_m3: gross * factor };
  });
}

/**
 * The station the hull's own volume balances about.
 *
 * Structure mass has to sit somewhere for the centre of gravity to mean
 * anything, and the honest place is the volumetric centroid: a hull that is
 * fat aft has its structure aft. Integrated over the same breakpoints the
 * volume uses, so the two agree exactly on where the hull is.
 */
export function volumeCentroid(spine: Spine): number | undefined {
  const xs = breakpoints(spine);
  let volume = 0;
  let moment = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const xa = xs[i] as number;
    const xb = xs[i + 1] as number;
    const dx = xb - xa;
    if (dx <= 0) continue;
    const [aa, ba] = semiAxesAt(spine, xa, "fore");
    const [ab, bb] = semiAxesAt(spine, xb, "aft");
    const v = frustumVolume(aa, ba, ab, bb, dx);
    // The panel's own centroid, exact for a linear taper: the area at each end
    // weights where inside the panel its volume sits.
    const areaA = Math.PI * aa * ba;
    const areaB = Math.PI * ab * bb;
    const total = areaA + areaB;
    const offset = total > 0 ? (dx * (areaA + 2 * areaB)) / (3 * total) : dx / 2;
    volume += v;
    moment += v * (xa + offset);
  }
  return volume > 0 ? moment / volume : undefined;
}

/** Mass-weighted centre of gravity along the axis, in metres from the bow. */
export function cgStation(items: MassItem[]): number | undefined {
  let mass = 0;
  let moment = 0;
  for (const item of items) {
    if (!Number.isFinite(item?.x) || !Number.isFinite(item?.mass_t)) continue;
    mass += item.mass_t;
    moment += item.mass_t * item.x;
  }
  return mass > 0 ? moment / mass : undefined;
}

/** Radius of the shield's shadow at station x. Zero where the cone has not reached. */
export function shadowRadiusAt(cone: ShadowCone, x: number): number {
  const aft = (cone.facing ?? "aft") === "aft";
  const distance = aft ? x - cone.x : cone.x - x;
  if (distance <= 0) return 0;
  return distance * Math.tan((cone.half_angle_deg * Math.PI) / 180);
}

export interface SectionShadow {
  id: string;
  /** Fraction of the section's length whose full cross-section lies inside the cone. */
  covered: number;
  /** True when any part of the section sticks out of the shadow. */
  exposed: boolean;
}

/**
 * How much of each section the reactor's shield actually shadows (§3.5 /
 * `gallery/06` §1.4). A crewed section that is `exposed` earns a dose advisory;
 * this function reports the geometry and takes no view on severity.
 */
export function sectionShadowing(hull: HullGeometry, cone: ShadowCone, samples = 64): SectionShadow[] {
  return (hull.sections ?? []).map((s) => {
    const lo = Math.min(s.x0, s.x1);
    const hi = Math.max(s.x0, s.x1);
    if (hi <= lo) return { id: s.id, covered: 0, exposed: true };
    let inside = 0;
    for (let i = 0; i < samples; i++) {
      const x = lo + ((i + 0.5) / samples) * (hi - lo);
      const [a, b] = semiAxesAt(hull.spine, x);
      // The whole cross-section is shadowed only if the cone clears its widest semi-axis.
      if (shadowRadiusAt(cone, x) >= Math.max(a, b)) inside++;
    }
    const covered = inside / samples;
    return { id: s.id, covered, exposed: covered < 1 };
  });
}

/** Signed area of a polygon by the shoelace formula; sign discarded. */
export function polygonArea(points: [number, number][]): number {
  if (!points || points.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i] as [number, number];
    const [x1, y1] = points[(i + 1) % points.length] as [number, number];
    twice += x0 * y1 - x1 * y0;
  }
  return Math.abs(twice) / 2;
}

export interface PlacedAppendage {
  id: string;
  kind: string;
  /** Outline in hull coordinates: x from the bow, y above the axis. */
  outline: [number, number][];
  /** True for the mirrored copy below the axis. */
  mirrored: boolean;
  area_m2: number;
}

/**
 * Place an appendage into hull coordinates, adding its vertical mirror when it
 * has one. Appendages are flat parts in the silhouette plane — a radiator wing
 * is two panels, never a swept disc.
 */
export function placeAppendage(spine: Spine, appendage: Appendage): PlacedAppendage[] {
  const skin = appendage.plane === "plan" ? beamAt(spine, appendage.station) / 2 : halfHeightAt(spine, appendage.station);
  const attach = Number.isFinite(appendage.attach_r as number) ? (appendage.attach_r as number) : skin;
  const outline = (appendage.outline ?? []).map(([dx, dy]) => [appendage.station + dx, attach + dy] as [number, number]);
  const area = polygonArea(outline);
  const placed: PlacedAppendage[] = [{ id: appendage.id, kind: appendage.kind, outline, mirrored: false, area_m2: area }];
  if ((appendage.mirror ?? "vertical") === "vertical") {
    placed.push({
      id: appendage.id,
      kind: appendage.kind,
      outline: outline.map(([x, y]) => [x, -y] as [number, number]),
      mirrored: true,
      area_m2: area,
    });
  }
  return placed;
}

/** Every appendage placed, both sides of the mirror line. */
export function placeAppendages(hull: HullGeometry): PlacedAppendage[] {
  return (hull.appendages ?? []).flatMap((a) => placeAppendage(hull.spine, a));
}

/** Total drawn area of appendages of a kind, both sides counted. */
export function appendageArea(hull: HullGeometry, kind?: string): number {
  return placeAppendages(hull)
    .filter((p) => kind === undefined || p.kind === kind)
    .reduce((sum, p) => sum + p.area_m2, 0);
}

export interface HullMetrics {
  length_m: number;
  gross_volume_m3: number;
  usable_volume_m3: number;
  wetted_area_m2: number;
  presented_bow_m2: number;
  presented_beam_m2: number;
  max_half_height_m: number;
  max_beam_m: number;
  /** Length over the greater of beam and height — the slenderness a style kit judges. */
  length_over_diameter: number;
  sections: SectionVolume[];
}

/** Everything the budget rail and the advisory kernel need from the geometry, in one pass. */
export function hullMetrics(hull: HullGeometry): HullMetrics {
  const spine = hull.spine;
  const length = Math.max(0, spine.length_m ?? 0);
  let maxHalfHeight = 0;
  let maxBeam = 0;
  for (const x of breakpoints(spine)) {
    maxHalfHeight = Math.max(maxHalfHeight, halfHeightAt(spine, x));
    maxBeam = Math.max(maxBeam, beamAt(spine, x));
  }
  const diameter = Math.max(maxBeam, maxHalfHeight * 2);
  return {
    length_m: length,
    gross_volume_m3: grossVolume(spine),
    usable_volume_m3: usableVolume(hull),
    wetted_area_m2: wettedArea(spine),
    presented_bow_m2: presentedArea(spine, "bow"),
    presented_beam_m2: presentedArea(spine, "beam"),
    max_half_height_m: maxHalfHeight,
    max_beam_m: maxBeam,
    length_over_diameter: diameter > 0 ? length / diameter : 0,
    sections: sectionVolumes(hull),
  };
}
