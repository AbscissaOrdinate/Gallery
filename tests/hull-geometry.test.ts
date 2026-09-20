/**
 * Hull spine geometry (§2.4), required by §10.3: volume and wetted area of a
 * spine describing a cylinder and an ellipsoid, checked against closed-form
 * values within 0.1%.
 */
import { describe, it, expect } from "vitest";
import {
  appendageArea,
  beamAt,
  breakpoints,
  cgStation,
  ellipsePerimeter,
  frustumVolume,
  grossVolume,
  grossVolumeSimpson,
  halfHeightAt,
  hullMetrics,
  placeAppendage,
  polygonArea,
  presentedArea,
  sectionVolumes,
  sectionShadowing,
  shadowRadiusAt,
  usableVolume,
  wettedArea,
} from "../src/core/designer/hull/geometry";
import type { HullGeometry, Spine } from "../src/core/designer/hull/types";

/** Within `pct` percent of the closed-form value. */
const closeToPct = (actual: number, expected: number, pct: number, what: string) => {
  const error = Math.abs(actual - expected) / Math.abs(expected);
  expect(error, `${what}: got ${actual}, expected ${expected}, off by ${(error * 100).toFixed(4)}%`).toBeLessThan(pct / 100);
};

/** A cylinder of radius R and length L: circular section, so beam = 2R. */
const cylinder = (R: number, L: number): Spine => ({
  length_m: L,
  beam_m: 2 * R,
  stations: [
    { x: 0, half_height_m: R },
    { x: L, half_height_m: R },
  ],
});

/**
 * A spine describing an ellipsoid with semi-axes (L/2, h, b/2), sampled at
 * `n` stations. The profile is piecewise-linear between them, so this is an
 * inscribed polyhedron approaching the ellipsoid from below as n grows.
 */
const ellipsoid = (L: number, h: number, b: number, n = 400): Spine => {
  const stations = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * L;
    const t = (2 * x) / L - 1; // -1 at the bow, +1 at the stern
    const shape = Math.sqrt(Math.max(0, 1 - t * t));
    stations.push({ x, half_height_m: h * shape });
  }
  return {
    length_m: L,
    beam_m: b,
    stations,
    beam_overrides: stations.map((s) => ({ x: s.x, beam_m: b * (s.half_height_m / h) })),
  };
};

describe("interpolation along the spine", () => {
  const spine: Spine = {
    length_m: 100,
    beam_m: 10,
    stations: [
      { x: 0, half_height_m: 2 },
      { x: 50, half_height_m: 8 },
      { x: 100, half_height_m: 4 },
    ],
  };

  it("interpolates half-height linearly between stations", () => {
    expect(halfHeightAt(spine, 0)).toBe(2);
    expect(halfHeightAt(spine, 25)).toBe(5); // halfway from 2 to 8
    expect(halfHeightAt(spine, 50)).toBe(8);
    expect(halfHeightAt(spine, 75)).toBe(6); // halfway from 8 back to 4
  });

  it("holds the end value beyond the last station rather than extrapolating", () => {
    expect(halfHeightAt(spine, -10)).toBe(2);
    expect(halfHeightAt(spine, 500)).toBe(4);
  });

  it("uses the nominal beam when nothing overrides it", () => {
    expect(beamAt(spine, 0)).toBe(10);
    expect(beamAt(spine, 73)).toBe(10);
  });

  it("interpolates beam overrides", () => {
    const widened: Spine = { ...spine, beam_overrides: [{ x: 0, beam_m: 10 }, { x: 100, beam_m: 20 }] };
    expect(beamAt(widened, 0)).toBe(10);
    expect(beamAt(widened, 50)).toBe(15);
    expect(beamAt(widened, 100)).toBe(20);
  });

  it("collects every breakpoint, ends included, in order", () => {
    const widened: Spine = { ...spine, beam_overrides: [{ x: 30, beam_m: 12 }] };
    expect(breakpoints(widened)).toEqual([0, 30, 50, 100]);
  });

  it("sorts stations given out of order", () => {
    const jumbled: Spine = { length_m: 100, beam_m: 10, stations: [{ x: 100, half_height_m: 4 }, { x: 0, half_height_m: 2 }, { x: 50, half_height_m: 8 }] };
    expect(halfHeightAt(jumbled, 25)).toBe(5);
  });
});

describe("volume against closed forms", () => {
  it("gives a cylinder πR²L", () => {
    const R = 8;
    const L = 180;
    const expected = Math.PI * R * R * L; // π · 64 · 180 = 36 191.147 m³
    closeToPct(grossVolume(cylinder(R, L)), expected, 0.1, "cylinder volume");
    // Exact to floating point, not merely within 0.1%.
    expect(grossVolume(cylinder(R, L))).toBeCloseTo(expected, 6);
  });

  it("gives a cone πR²L/3", () => {
    const R = 6;
    const L = 30;
    const cone: Spine = { length_m: L, beam_m: 2 * R, stations: [{ x: 0, half_height_m: 0 }, { x: L, half_height_m: R }], beam_overrides: [{ x: 0, beam_m: 0 }, { x: L, beam_m: 2 * R }] };
    closeToPct(grossVolume(cone), (Math.PI * R * R * L) / 3, 0.1, "cone volume");
  });

  it("gives an ellipsoid 4/3·π·abc", () => {
    const L = 120;
    const h = 9;
    const b = 16;
    const expected = (4 / 3) * Math.PI * (L / 2) * h * (b / 2); // 4/3 · π · 60 · 9 · 8 = 18 095.574 m³
    closeToPct(grossVolume(ellipsoid(L, h, b)), expected, 0.1, "ellipsoid volume");
  });

  it("gives a sphere 4/3·πR³", () => {
    const R = 20;
    closeToPct(grossVolume(ellipsoid(2 * R, R, 2 * R)), (4 / 3) * Math.PI * R ** 3, 0.1, "sphere volume");
  });

  it("agrees with the spec's Simpson integration", () => {
    for (const [name, spine] of [
      ["cylinder", cylinder(8, 180)],
      ["ellipsoid", ellipsoid(120, 9, 16)],
    ] as [string, Spine][]) {
      closeToPct(grossVolumeSimpson(spine, 200), grossVolume(spine), 0.1, `${name} Simpson vs closed form`);
    }
  });

  it("computes the frustum closed form, reducing to the circular case", () => {
    // Circular frustum: πL(r₀² + r₀r₁ + r₁²)/3
    const r0 = 3;
    const r1 = 7;
    const L = 10;
    expect(frustumVolume(r0, r0, r1, r1, L)).toBeCloseTo((Math.PI * L * (r0 * r0 + r0 * r1 + r1 * r1)) / 3, 9);
  });

  it("integrates over a sub-range for per-section budgets", () => {
    const spine = cylinder(5, 100);
    const whole = Math.PI * 25 * 100;
    expect(grossVolume(spine, 0, 50)).toBeCloseTo(whole / 2, 6);
    expect(grossVolume(spine, 25, 75)).toBeCloseTo(whole / 2, 6);
    expect(grossVolume(spine, 60, 60)).toBe(0);
    expect(grossVolume(spine, 80, 20)).toBe(0); // reversed range, not negative volume
  });
});

describe("wetted area against closed forms", () => {
  it("gives a cylinder 2πRL", () => {
    const R = 8;
    const L = 180;
    closeToPct(wettedArea(cylinder(R, L)), 2 * Math.PI * R * L, 0.1, "cylinder lateral area");
  });

  it("gives a sphere 4πR², which needs the slope correction", () => {
    // This is the case the spec's "perimeter × dx" would get wrong: without the
    // surface-step correction it returns π²R² ≈ 9.87R², against the true 4πR² ≈ 12.57R².
    const R = 20;
    closeToPct(wettedArea(ellipsoid(2 * R, R, 2 * R), undefined, undefined, 4000), 4 * Math.PI * R * R, 0.1, "sphere area");
  });

  it("gives a cone πR·slant", () => {
    const R = 6;
    const L = 30;
    const cone: Spine = { length_m: L, beam_m: 2 * R, stations: [{ x: 0, half_height_m: 0 }, { x: L, half_height_m: R }], beam_overrides: [{ x: 0, beam_m: 0 }, { x: L, beam_m: 2 * R }] };
    const slant = Math.sqrt(R * R + L * L);
    closeToPct(wettedArea(cone, undefined, undefined, 4000), Math.PI * R * slant, 0.1, "cone lateral area");
  });

  it("approximates an ellipse perimeter, exactly for a circle", () => {
    expect(ellipsePerimeter(5, 5)).toBeCloseTo(2 * Math.PI * 5, 9);
    expect(ellipsePerimeter(0, 0)).toBe(0);
  });
});

describe("presented area", () => {
  const spine: Spine = {
    length_m: 100,
    beam_m: 10,
    stations: [
      { x: 0, half_height_m: 0 },
      { x: 40, half_height_m: 6 },
      { x: 100, half_height_m: 6 },
    ],
  };

  it("takes bow-on as the widest cross-section", () => {
    // Widest ellipse is a = 6, b = 5 → π · 30 = 94.248 m²
    expect(presentedArea(spine, "bow")).toBeCloseTo(Math.PI * 6 * 5, 9);
  });

  it("takes beam-on as the silhouette area", () => {
    // Triangle 0→40 (½ · 40 · 12 = 240) plus rectangle 40→100 (60 · 12 = 720) = 960 m²
    expect(presentedArea(spine, "beam")).toBeCloseTo(960, 9);
  });

  it("reports the two aspects separately, as the signature model needs", () => {
    expect(presentedArea(spine, "bow")).not.toBeCloseTo(presentedArea(spine, "beam"), 1);
  });
});

describe("sections", () => {
  const hull: HullGeometry = {
    spine: cylinder(5, 180),
    packing_efficiency: 0.78,
    sections: [
      { id: "fore", x0: 0, x1: 60, allowed: ["magazine", "cic"] },
      { id: "mid", x0: 60, x1: 130, allowed: ["berthing", "hangar"] },
      { id: "aft", x0: 130, x1: 180, allowed: ["drive", "reactor", "tank"] },
    ],
  };

  it("splits the hull volume across sections without losing any", () => {
    const parts = sectionVolumes(hull);
    expect(parts.map((p) => p.id)).toEqual(["fore", "mid", "aft"]);
    const summed = parts.reduce((s, p) => s + p.gross_m3, 0);
    expect(summed).toBeCloseTo(grossVolume(hull.spine), 6);
  });

  it("applies packing efficiency to usable volume only", () => {
    const parts = sectionVolumes(hull);
    for (const p of parts) expect(p.usable_m3).toBeCloseTo(p.gross_m3 * 0.78, 9);
    expect(usableVolume(hull)).toBeCloseTo(grossVolume(hull.spine) * 0.78, 6);
  });

  it("treats a missing packing efficiency as 1, not 0", () => {
    const bare: HullGeometry = { spine: cylinder(5, 100) };
    expect(usableVolume(bare)).toBeCloseTo(grossVolume(bare.spine), 6);
  });
});

describe("centre of gravity", () => {
  it("is the mass-weighted mean station", () => {
    // (10·0 + 30·100) / 40 = 75 m
    expect(cgStation([{ x: 0, mass_t: 10 }, { x: 100, mass_t: 30 }])).toBeCloseTo(75, 9);
  });

  it("is undefined with no mass, rather than zero or NaN", () => {
    expect(cgStation([])).toBeUndefined();
    expect(cgStation([{ x: 10, mass_t: 0 }])).toBeUndefined();
  });

  it("ignores items with unusable numbers", () => {
    expect(cgStation([{ x: 0, mass_t: 10 }, { x: NaN, mass_t: 5 }, { x: 100, mass_t: 30 }])).toBeCloseTo(75, 9);
  });
});

describe("radiation shadow", () => {
  const hull: HullGeometry = {
    spine: cylinder(5, 200),
    sections: [
      { id: "hab-forward", x0: 10, x1: 60 },
      { id: "tanks", x0: 60, x1: 140 },
      { id: "reactor", x0: 150, x1: 180 },
    ],
  };
  // Shield at the reactor, shadow cast forward over the rest of the ship.
  const cone = { x: 150, half_angle_deg: 15, facing: "forward" as const };

  it("widens the shadow linearly with distance from the shield", () => {
    expect(shadowRadiusAt(cone, 150)).toBe(0);
    expect(shadowRadiusAt(cone, 100)).toBeCloseTo(50 * Math.tan((15 * Math.PI) / 180), 9);
    expect(shadowRadiusAt(cone, 170)).toBe(0); // the wrong side of the shield
  });

  it("covers a forward section and leaves one close to the reactor exposed", () => {
    const shadows = sectionShadowing(hull, cone);
    const byId = Object.fromEntries(shadows.map((s) => [s.id, s]));
    // The hull's widest semi-axis is 5 m; the cone clears that at 5/tan(15°) ≈ 18.7 m
    // from the shield, i.e. forward of x ≈ 131. So the forward hab is fully covered.
    expect(byId["hab-forward"]?.covered).toBe(1);
    expect(byId["hab-forward"]?.exposed).toBe(false);
    // The tank section runs right up to x = 140, inside that limit, so it sticks out.
    expect(byId["tanks"]?.exposed).toBe(true);
    expect(byId["tanks"]?.covered).toBeGreaterThan(0);
    expect(byId["tanks"]?.covered).toBeLessThan(1);
  });

  it("flags a hab placed aft of the shield as wholly exposed", () => {
    const badly: HullGeometry = { ...hull, sections: [{ id: "hab-aft", x0: 182, x1: 198 }] };
    const shadows = sectionShadowing(badly, cone);
    expect(shadows[0]?.covered).toBe(0);
    expect(shadows[0]?.exposed).toBe(true);
  });
});

describe("appendages", () => {
  const spine = cylinder(6, 200);
  const radiator = {
    id: "r1",
    kind: "radiator",
    station: 96,
    attach_r: 6,
    outline: [[0, 0], [42, 0], [42, 9], [0, 9]] as [number, number][],
  };

  it("places an outline into hull coordinates and mirrors it vertically", () => {
    const placed = placeAppendage(spine, radiator);
    expect(placed).toHaveLength(2);
    expect(placed[0]?.mirrored).toBe(false);
    expect(placed[0]?.outline[0]).toEqual([96, 6]);
    expect(placed[0]?.outline[2]).toEqual([138, 15]);
    // The mirror is a reflection in the axis, not a sweep: a wing, not a disc.
    expect(placed[1]?.mirrored).toBe(true);
    expect(placed[1]?.outline[0]).toEqual([96, -6]);
    expect(placed[1]?.outline[2]).toEqual([138, -15]);
  });

  it("attaches at the profile half-height when none is given", () => {
    const placed = placeAppendage(spine, { ...radiator, attach_r: undefined });
    expect(placed[0]?.outline[0]).toEqual([96, 6]); // the cylinder's half-height
  });

  it("can opt out of mirroring, which is what puts the CG off-axis", () => {
    expect(placeAppendage(spine, { ...radiator, mirror: "none" })).toHaveLength(1);
  });

  it("measures drawn area by the shoelace formula, counting both sides", () => {
    expect(polygonArea(radiator.outline)).toBeCloseTo(42 * 9, 9);
    const hull: HullGeometry = { spine, appendages: [radiator] };
    expect(appendageArea(hull, "radiator")).toBeCloseTo(2 * 42 * 9, 9); // both panels
    expect(appendageArea(hull, "pylon")).toBe(0);
  });

  it("gives a degenerate outline no area", () => {
    expect(polygonArea([])).toBe(0);
    expect(polygonArea([[0, 0], [1, 1]])).toBe(0);
  });
});

describe("hullMetrics", () => {
  it("rolls everything up in one pass", () => {
    const hull: HullGeometry = {
      spine: cylinder(8, 180),
      packing_efficiency: 0.78,
      sections: [{ id: "all", x0: 0, x1: 180 }],
    };
    const m = hullMetrics(hull);
    expect(m.length_m).toBe(180);
    closeToPct(m.gross_volume_m3, Math.PI * 64 * 180, 0.1, "volume");
    expect(m.usable_volume_m3).toBeCloseTo(m.gross_volume_m3 * 0.78, 6);
    closeToPct(m.wetted_area_m2, 2 * Math.PI * 8 * 180, 0.1, "wetted area");
    expect(m.max_half_height_m).toBe(8);
    expect(m.max_beam_m).toBe(16);
    expect(m.length_over_diameter).toBeCloseTo(180 / 16, 9); // the slenderness a style kit judges
    expect(m.sections).toHaveLength(1);
  });

  it("survives an empty hull without dividing by zero", () => {
    const m = hullMetrics({ spine: { length_m: 0, beam_m: 0, stations: [] } });
    expect(m.gross_volume_m3).toBe(0);
    expect(m.wetted_area_m2).toBe(0);
    expect(m.length_over_diameter).toBe(0);
    expect(Number.isNaN(m.presented_bow_m2)).toBe(false);
  });
});
