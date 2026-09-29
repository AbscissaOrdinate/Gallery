/**
 * Vertical steps in the profile.
 *
 * The fleet plates this project is aiming at are not smooth spindles — they
 * are stacks of discrete modules with hard shoulders between them: the flat
 * face of a tank, a collar of frames, the shoulder where a hangar block ends.
 * Two stations at the same x is how a hull says that.
 *
 * A step that draws right but measures as a taper is the dangerous case: it is
 * invisible and it is tens of per cent of the internal volume.
 */
import { describe, it, expect } from "vitest";
import { grossVolume, halfHeightAt, isStep, wettedArea, sortedStations, sectionAreaAt } from "../src/core/designer/hull/geometry";
import { renderHull } from "../src/core/designer/hull/render";
import { hullAdvisories } from "../src/core/designer/hull/advisories";
import type { Spine } from "../src/core/designer/hull/types";

/** 100 m, half-height 2 m for the first 50 m, then a hard step up to 8 m. Beam 4 m throughout. */
const stepped: Spine = {
  length_m: 100,
  beam_m: 4,
  stations: [
    { x: 0, half_height_m: 2 },
    { x: 50, half_height_m: 2 },
    { x: 50, half_height_m: 8 },
    { x: 100, half_height_m: 8 },
  ],
};
/** Two cylinders: π·a·b·L each, with b = beam/2 = 2. */
const TRUE_VOLUME = Math.PI * 2 * 2 * 50 + Math.PI * 8 * 2 * 50;

describe("measuring a step", () => {
  it("measures two cylinders, not a cone", () => {
    // Read across the step this is 2,199 m³ — 30% under — and nothing says so.
    expect(grossVolume(stepped)).toBeCloseTo(TRUE_VOLUME, 6);
  });

  it("reports the half-height on each side of the step", () => {
    expect(halfHeightAt(stepped, 50, "aft")).toBe(2);
    expect(halfHeightAt(stepped, 50, "fore")).toBe(8);
    expect(halfHeightAt(stepped, 50)).toBe(2); // the default is the bow-side limit
    expect(isStep(stepped, 50)).toBe(true);
    expect(isStep(stepped, 40)).toBe(false);
  });

  it("keeps the authored order of two stations at one x", () => {
    const down: Spine = { ...stepped, stations: [...stepped.stations].reverse() };
    // Reversed, the same four stations describe a hull that steps *down* at 50
    // and ramps back up to the stern: the order is data, so the sort keeps it.
    expect(halfHeightAt(down, 50, "aft")).toBe(8);
    expect(halfHeightAt(down, 50, "fore")).toBe(2);
    expect(sortedStations(down).map((s) => s.half_height_m)).toEqual([2, 8, 2, 8]);
    // It is a different hull — two cones rather than two cylinders — even
    // though linearity happens to give the pair the same total volume.
    expect(halfHeightAt(down, 25)).toBeCloseTo(5, 9); // mid-cone, not a 2 m barrel
    expect(halfHeightAt(stepped, 25)).toBe(2);
  });

  it("counts the annular face of the step as wetted area", () => {
    const face = Math.abs(sectionAreaAt(stepped, 50 + 1e-9) - sectionAreaAt(stepped, 50 - 1e-9));
    expect(face).toBeGreaterThan(0);
    // Two cylinders' barrels, plus the ring where the smaller meets the larger.
    const barrels = wettedArea({ ...stepped, stations: [{ x: 0, half_height_m: 2 }, { x: 50, half_height_m: 2 }] }, 0, 50) + wettedArea({ ...stepped, stations: [{ x: 50, half_height_m: 8 }, { x: 100, half_height_m: 8 }] }, 50, 100);
    expect(wettedArea(stepped)).toBeCloseTo(barrels + face, 0);
  });

  it("a taper of the same extent is not mistaken for a step", () => {
    const tapered: Spine = { ...stepped, stations: [{ x: 0, half_height_m: 2 }, { x: 50, half_height_m: 2 }, { x: 60, half_height_m: 8 }, { x: 100, half_height_m: 8 }] };
    expect(isStep(tapered, 50)).toBe(false);
    expect(grossVolume(tapered)).toBeLessThan(TRUE_VOLUME);
  });

  it("handles several steps in a row, which is what a module stack looks like", () => {
    // narrow · wide · narrow · wide, the lozenge chain in the fleet plates
    const stack: Spine = {
      length_m: 80,
      beam_m: 4,
      stations: [
        { x: 0, half_height_m: 1 }, { x: 20, half_height_m: 1 },
        { x: 20, half_height_m: 5 }, { x: 40, half_height_m: 5 },
        { x: 40, half_height_m: 1 }, { x: 60, half_height_m: 1 },
        { x: 60, half_height_m: 5 }, { x: 80, half_height_m: 5 },
      ],
    };
    const expected = Math.PI * 2 * 20 * (1 + 5 + 1 + 5); // b = 2, four 20 m barrels
    expect(grossVolume(stack)).toBeCloseTo(expected, 6);
  });
});

describe("drawing a step", () => {
  it("puts a vertical edge in the outline instead of cutting the corner", () => {
    const scene = renderHull({ spine: stepped });
    const path = scene.elements.find((e) => e.id === "hull");
    expect(path?.kind).toBe("path");
    if (path?.kind !== "path") return;
    // Both half-heights appear at x = 50: the outline goes up the face.
    expect(path.d).toMatch(/L 50 2\b/);
    expect(path.d).toMatch(/L 50 8\b/);
  });

  it("draws the step on the mirrored underside too", () => {
    const path = renderHull({ spine: stepped }).elements.find((e) => e.id === "hull");
    if (path?.kind !== "path") return;
    expect(path.d).toMatch(/L 50 -8\b/);
    expect(path.d).toMatch(/L 50 -2\b/);
  });

  it("steps the beam outline where a beam override steps", () => {
    const hull = { spine: { ...stepped, beam_overrides: [{ x: 0, beam_m: 4 }, { x: 50, beam_m: 4 }, { x: 50, beam_m: 16 }, { x: 100, beam_m: 16 }] } };
    const beam = renderHull(hull, { showBeam: true }).elements.find((e) => e.id === "beam");
    if (beam?.kind !== "path") return;
    expect(beam.d).toMatch(/L 50 2\b/);
    expect(beam.d).toMatch(/L 50 8\b/);
  });
});

describe("what the advisory kernel says about it", () => {
  const hull = { spine: stepped, sections: [{ id: "core", x0: 0, x1: 100 }] };

  it("treats a two-station step as intentional and says nothing", () => {
    expect(hullAdvisories(hull).filter((v) => /share x/.test(v.message))).toEqual([]);
  });

  it("still flags three or more at one x, where only a pair can be drawn", () => {
    const messy = { ...hull, spine: { ...stepped, stations: [...stepped.stations, { x: 50, half_height_m: 5 }] } };
    const v = hullAdvisories(messy).find((x) => /share x/.test(x.message));
    expect(v?.severity).toBe("warn");
    expect(v?.message).toMatch(/A step uses two/);
  });
});
