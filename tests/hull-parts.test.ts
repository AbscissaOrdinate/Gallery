/**
 * External fittings.
 *
 * Two things are being protected. First, that a part is *generated* rather
 * than typed: a style kit that names a family with no geometry behind it draws
 * nothing, and a fleet only reads as one navy if the same generator runs
 * across every class. Second, that the silhouette shows external components
 * only — a magazine is section volume and must not appear.
 */
import { describe, it, expect } from "vitest";
import { makePart, partsForHull, partKindFor, slotIdOf, PART_KINDS, type PartFamilies } from "../src/core/designer/hull/parts";
import { polygonArea } from "../src/core/designer/hull/geometry";
import { renderHull } from "../src/core/designer/hull/render";
import type { HullGeometry } from "../src/core/designer/hull/types";

const hull: HullGeometry = {
  spine: {
    length_m: 120,
    beam_m: 12,
    station_pitch_m: 3,
    stations: [
      { x: 0, half_height_m: 2 },
      { x: 30, half_height_m: 6 },
      { x: 100, half_height_m: 6 },
      { x: 120, half_height_m: 4 },
    ],
  },
  external_slots: [
    { id: "t1", x: 30, theta_deg: 0, type: "turret", size: "M" },
    { id: "r1", x: 66, theta_deg: 180, type: "radiator", size: "L" },
    { id: "s1", x: 90, theta_deg: 90, type: "sensor", size: "S" }, // beam-on
    { id: "d1", x: 120, theta_deg: 0, type: "drive", size: "L" },
    { id: "sp", x: 12, theta_deg: 0, type: "spinal", size: "XL" },
  ],
};

describe("generating a part", () => {
  it("makes closed pieces with area for every kind", () => {
    for (const kind of PART_KINDS) {
      const pieces = makePart({ kind, size: "M" });
      expect(pieces.length, kind).toBeGreaterThanOrEqual(1);
      for (const o of pieces) {
        expect(o.length, kind).toBeGreaterThanOrEqual(3);
        expect(polygonArea(o), kind).toBeGreaterThan(0);
        expect(o.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), kind).toBe(true);
      }
    }
  });

  it("keeps separate pieces separate rather than folding them into one ring", () => {
    // Concatenated into one point list, a cluster thruster fills as a bowtie
    // and a gun barrel as a wedge: SVG's nonzero rule on a self-intersecting
    // polygon. These have to stay distinct polygons.
    expect(makePart({ kind: "thruster", size: "M", families: { thruster: "cluster" } })).toHaveLength(2);
    expect(makePart({ kind: "turret", size: "M", weapon: "gun" })).toHaveLength(2); // mounting + barrel
    expect(makePart({ kind: "turret", size: "M", weapon: "missile" })).toHaveLength(2);
    expect(makePart({ kind: "pd", size: "M" })).toHaveLength(3);
    expect(makePart({ kind: "radiator", size: "M", families: { radiator: "fin" } })).toHaveLength(1);
  });

  it("grows with the size class", () => {
    const area = (s: "S" | "M" | "L" | "XL") => makePart({ kind: "radiator", size: s }).reduce((a, o) => a + polygonArea(o), 0);
    expect(area("S")).toBeLessThan(area("M"));
    expect(area("M")).toBeLessThan(area("L"));
    expect(area("L")).toBeLessThan(area("XL"));
  });

  it("accepts a size in metres as well as a class", () => {
    const area = (size: number | "L") => makePart({ kind: "tank", size }).reduce((a, o) => a + polygonArea(o), 0);
    expect(area(20)).toBeGreaterThan(area("L"));
  });

  it("stands outward from the skin, centred on its slot", () => {
    const o = makePart({ kind: "turret", size: "M" }).flat();
    expect(Math.min(...o.map(([, y]) => y))).toBe(0); // sits on the hull, never sunk into it
    expect(Math.max(...o.map(([, y]) => y))).toBeGreaterThan(0);
    const xs = o.map(([x]) => x);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(0);
  });

  it("gives each family a visibly different shape", () => {
    const shapes = (["fin", "panel", "droplet-boom"] as const).map((radiatorFamily) =>
      JSON.stringify(makePart({ kind: "radiator", size: "L", families: { radiator: radiatorFamily } })),
    );
    expect(new Set(shapes).size).toBe(3);
  });

  it("changes a turret with the weapon in it", () => {
    const of = (weapon: "gun" | "railgun" | "missile" | "beam") => makePart({ kind: "turret", size: "M", weapon });
    // A railgun's barrel reaches further forward than a gun's; a missile cell has none.
    const reach = (w: "gun" | "railgun" | "missile" | "beam") => -Math.min(...of(w).flat().map(([x]) => x));
    expect(reach("railgun")).toBeGreaterThan(reach("gun"));
    expect(reach("gun")).toBeGreaterThan(reach("missile"));
    expect(new Set([of("gun"), of("railgun"), of("missile"), of("beam")].map((o) => JSON.stringify(o))).size).toBe(4);
  });

  it("does not confuse point defence with a main turret", () => {
    expect(JSON.stringify(makePart({ kind: "pd", size: "M" }))).not.toBe(JSON.stringify(makePart({ kind: "turret", size: "M" })));
  });
});

describe("placing parts on a hull", () => {
  it("puts a dorsal part above the skin and a ventral one below", () => {
    const parts = partsForHull(hull);
    const t = parts.find((p) => p.id === "t1");
    const r = parts.find((p) => p.id === "r1");
    expect(t?.attach_r).toBeCloseTo(6, 9); // the profile half-height at station 30
    expect(r?.attach_r).toBeCloseTo(-6, 9);
    expect(t?.outline.every(([, y]) => y >= 0)).toBe(true);
    expect(r?.outline.every(([, y]) => y <= 0)).toBe(true);
  });

  it("never mirrors a part, because a slot is one fitting and not a pair", () => {
    for (const p of partsForHull(hull)) expect(p.mirror).toBe("none");
  });

  it("draws nothing for a beam-on slot rather than inventing a projection", () => {
    // At 90° the fitting points at the viewer; in a side profile it is behind
    // or in front of the hull. The slot marker is the honest drawing.
    expect(partsForHull(hull).map((p) => p.id)).not.toContain("s1");
  });

  it("draws nothing for a slot type with no external appearance", () => {
    expect(partsForHull(hull).map((p) => p.id)).not.toContain("sp"); // spinal is buried
  });

  it("turns a drive slot into a thruster", () => {
    expect(partsForHull(hull).find((p) => p.id === "d1")?.kind).toBe("thruster");
  });

  it("carries the polity's families through to every part", () => {
    const families: PartFamilies = { radiator: "fin", turret: "barbette" };
    const withKit = partsForHull(hull, { families });
    const plain = partsForHull(hull);
    expect(JSON.stringify(withKit)).not.toBe(JSON.stringify(plain));
  });

  it("takes the weapon family editor 2 will supply", () => {
    // The mounting is the same either way; the barrel is what changes, so the
    // whole fitting has to be compared rather than its first piece.
    const fitting = (weapons?: Record<string, "railgun">) => partsForHull(hull, { weapons }).filter((p) => slotIdOf(p.id) === "t1");
    expect(JSON.stringify(fitting({ t1: "railgun" }))).not.toBe(JSON.stringify(fitting()));
  });

  it("names extra pieces after their slot, so a click reaches the fitting", () => {
    const pieces = partsForHull(hull).filter((p) => slotIdOf(p.id) === "t1");
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces[0]?.id).toBe("t1");
    expect(pieces.every((p) => slotIdOf(p.id) === "t1")).toBe(true);
  });

  it("lets a slot override the kit, for a captured or export hull", () => {
    const captured = { ...hull, external_slots: [{ id: "t1", x: 30, theta_deg: 0, type: "turret", size: "M", part: "radiator" }] };
    expect(partsForHull(captured)[0]?.kind).toBe("radiator");
    expect(partKindFor({ id: "x", x: 0, theta_deg: 0, type: "turret", size: "M", part: "optics" })).toBe("optics");
    // An override nobody recognises falls back to the slot's own type.
    expect(partKindFor({ id: "x", x: 0, theta_deg: 0, type: "turret", size: "M", part: "nonsense" })).toBe("turret");
  });

  it("survives a hull with no slots at all", () => {
    expect(partsForHull({ spine: { length_m: 10, beam_m: 2, stations: [] } })).toEqual([]);
  });
});

describe("reaching the silhouette", () => {
  it("appears through the renderer's fitted seam, under its own role", () => {
    const parts = partsForHull(hull, { families: { radiator: "fin" } });
    const scene = renderHull(hull, { fitted: parts });
    const ids = scene.elements.map((e) => e.id);
    expect(ids).toContain("fitted-t1");
    expect(ids).toContain("fitted-r1");
    expect(scene.elements.find((e) => e.id === "fitted-r1")?.role).toBe("fitted:radiator");
  });

  it("widens the drawing, because a radiator is the tallest thing on most ships", () => {
    const bare = renderHull(hull);
    const fitted = renderHull(hull, { fitted: partsForHull(hull) });
    expect(fitted.bounds.y0).toBeLessThan(bare.bounds.y0); // the ventral radiator reaches down
  });

  it("keeps internal components out of the silhouette entirely", () => {
    // A magazine is section volume. It has no slot, so there is nothing to draw
    // and no way for it to leak into the plate.
    const withMagazine: HullGeometry = { ...hull, sections: [{ id: "magazine", x0: 20, x1: 50, allowed: ["magazine"] }] };
    const parts = partsForHull(withMagazine);
    expect(parts.map((p) => p.id)).not.toContain("magazine");
    expect(parts.every((p) => (withMagazine.external_slots ?? []).some((s) => s.id === slotIdOf(p.id)))).toBe(true);
  });
});
