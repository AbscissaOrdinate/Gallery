/**
 * Reading a hull record into drawable geometry.
 *
 * The property under test throughout is the one from `docs/CLAUDE.md`: a
 * record that is malformed, half-migrated or mid-edit must still *draw*. So
 * these tests feed the reader things a YAML file and a half-typed form
 * actually produce, and assert it yields finite numbers rather than throwing
 * or emitting NaN.
 */
import { describe, it, expect } from "vitest";
import { readHull, writeHull, readSpine, snapStation, stationPitch } from "../src/core/designer/hull/record";
import { hullMetrics } from "../src/core/designer/hull/geometry";
import type { HullGeometry } from "../src/core/designer/hull/types";

const authored = {
  spine: {
    length_m: 180,
    beam_m: 16,
    station_pitch_m: 3,
    stations: [
      { x: 0, half_height_m: 3 },
      { x: 180, half_height_m: 6 },
    ],
  },
  packing_efficiency: 0.78,
  sections: [{ id: "core", x0: 0, x1: 180, allowed: ["drive"], pressurised: true }],
  external_slots: [{ id: "t1", x: 72, theta_deg: 0, type: "turret", size: "M" }],
  appendages: [{ id: "a1", kind: "radiator", station: 96, attach_r: 9, outline: [[0, 0], [10, 0], [10, 5]] }],
  armor_zones: [{ id: "belt", x0: 0, x1: 60, material: "steel", thickness_cm: 4 }],
};

describe("reading a well-formed record", () => {
  it("round-trips through write without losing anything", () => {
    const hull = readHull(authored);
    expect(hull.spine.length_m).toBe(180);
    expect(hull.sections).toHaveLength(1);
    expect(hull.external_slots?.[0]?.id).toBe("t1");
    expect(hull.appendages?.[0]?.outline).toEqual([[0, 0], [10, 0], [10, 5]]);
    expect(hull.armor_zones?.[0]?.thickness_cm).toBe(4);
    expect(readHull(writeHull(authored, hull))).toEqual(hull);
  });

  it("keeps fields the geometry does not own", () => {
    const fields = { ...authored, hull_class: "DD", bus: "ans-mk2", design_notes: "keep me" };
    const out = writeHull(fields, readHull(fields));
    expect(out.hull_class).toBe("DD");
    expect(out.bus).toBe("ans-mk2");
    expect(out.design_notes).toBe("keep me");
  });

  it("drops an emptied list rather than storing []", () => {
    const out = writeHull(authored, { ...readHull(authored), sections: [], appendages: undefined });
    expect("sections" in out).toBe(false);
    expect("appendages" in out).toBe(false);
  });
});

describe("reading what YAML and half-finished edits actually produce", () => {
  it("reads numbers that arrived as strings", () => {
    const spine = readSpine({ spine: { length_m: "180", beam_m: "16", stations: [{ x: "0", half_height_m: "3" }] } });
    expect(spine.length_m).toBe(180);
    expect(spine.beam_m).toBe(16);
    expect(spine.stations[0]).toEqual({ x: 0, half_height_m: 3 });
  });

  it("turns junk into zero instead of NaN, so no budget is poisoned", () => {
    const hull = readHull({ spine: { length_m: "wide", beam_m: null, stations: [{ x: {}, half_height_m: "" }] } });
    expect(hull.spine.length_m).toBe(0);
    expect(hull.spine.beam_m).toBe(0);
    expect(hull.spine.stations[0]).toEqual({ x: 0, half_height_m: 0 });
    expect(JSON.stringify(hullMetrics(hull))).not.toMatch(/null|NaN/);
  });

  it("survives every key being the wrong type", () => {
    const hull = readHull({ spine: "not an object", sections: { core: {} }, external_slots: 7, appendages: null, packing_efficiency: "most of it" });
    expect(hull.spine.stations).toEqual([]);
    expect(hull.sections).toBeUndefined();
    expect(hull.external_slots).toBeUndefined();
    expect(hull.packing_efficiency).toBeUndefined();
  });

  it("survives an entirely empty record", () => {
    expect(() => readHull({})).not.toThrow();
    expect(readHull({}).spine).toEqual({ length_m: 0, beam_m: 0, station_pitch_m: undefined, datum: "bow", stations: [] });
  });

  it("gives a blank or duplicated id something to key on without touching the record", () => {
    const fields = { sections: [{ id: "", x0: 0, x1: 10 }, { x0: 10, x1: 20 }] };
    const hull = readHull(fields);
    expect(hull.sections?.map((s) => s.id)).toEqual(["section-1", "section-2"]);
    // The stored record is untouched: the advisory kernel reports the blank id.
    expect(fields.sections[0]!.id).toBe("");
  });

  it("drops outline points that are not pairs rather than drawing a spike at the origin", () => {
    const hull = readHull({ appendages: [{ id: "a", kind: "pylon", station: 10, outline: [[0, 0], "nope", [5], [5, 5], null] }] });
    expect(hull.appendages?.[0]?.outline).toEqual([[0, 0], [5, 5]]);
  });

  it("keeps a mirror value only when it is one the renderer understands", () => {
    expect(readHull({ appendages: [{ id: "a", kind: "p", station: 0, outline: [], mirror: "sideways" }] }).appendages?.[0]?.mirror).toBeUndefined();
    expect(readHull({ appendages: [{ id: "a", kind: "p", station: 0, outline: [], mirror: "none" }] }).appendages?.[0]?.mirror).toBe("none");
  });

  it("treats a pressurised flag as a flag, not as truthiness", () => {
    expect(readHull({ sections: [{ id: "s", x0: 0, x1: 1, pressurised: "yes" }] }).sections?.[0]?.pressurised).toBeUndefined();
    expect(readHull({ sections: [{ id: "s", x0: 0, x1: 1, pressurised: true }] }).sections?.[0]?.pressurised).toBe(true);
  });

  it("does not silently rescale a packing efficiency given as a percentage", () => {
    // 78 is almost certainly meant as 78%, but guessing here would change every
    // volume behind the user's back. The advisory kernel is where that is said.
    expect(readHull({ packing_efficiency: 78 }).packing_efficiency).toBe(78);
  });
});

describe("the station grid", () => {
  const hull = (pitch?: number): HullGeometry => ({ spine: { length_m: 100, beam_m: 10, stations: [], station_pitch_m: pitch } });

  it("snaps to the nearest multiple", () => {
    expect(snapStation(73, 3)).toBe(72);
    expect(snapStation(74, 3)).toBe(75);
    expect(snapStation(-1, 3)).toBe(-0);
  });

  it("leaves the value alone when there is no grid", () => {
    expect(snapStation(73.4, 0)).toBe(73.4);
    expect(snapStation(73.4, -3)).toBe(73.4);
    expect(snapStation(NaN, 3)).toBeNaN();
  });

  it("falls back from the spine to the bus to the 3 m default", () => {
    expect(stationPitch(hull(2))).toBe(2);
    expect(stationPitch(hull(undefined), 5)).toBe(5);
    expect(stationPitch(hull(undefined))).toBe(3);
    expect(stationPitch(hull(0))).toBe(3); // a zero grid would snap everything to the bow
  });
});
