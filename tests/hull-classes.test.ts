/**
 * Hull classes (`gallery/09` §2): eleven starting points, six of them measured
 * from the fleet reference and anchored on the existing 138 m destroyer.
 *
 * What is protected: that the ladder is what the reference says rather than
 * what the plan guessed; that every class is a hull the kernel is happy with;
 * and that no class quietly acquires a physical figure nobody supplied.
 */
import { describe, it, expect } from "vitest";
import { BUILTIN_PRESETS } from "../src/core/schema/builtin/presets";
import { readHull } from "../src/core/designer/hull/record";
import { hullMetrics } from "../src/core/designer/hull/geometry";
import { hullAdvisories } from "../src/core/designer/hull/advisories";
import { ANCHOR_PRESET_ID, CLASS_CODES, FLEET_REFERENCE, measuredLength, meanHeight, verticalScale, type MeasuredClass } from "../src/core/designer/hull/classes";
import { SLOT_TYPES } from "../src/core/designer/hull/parts";

const classes = BUILTIN_PRESETS.filter((p) => p.type === "hull" && p.tags?.includes("class"));
const byCode = (code: string) => {
  const p = classes.find((c) => c.fields.hull_class === code);
  if (!p) throw new Error(`no ${code} class`);
  return p;
};
const hullOf = (code: string) => readHull(byCode(code).fields);
const anchor = readHull(BUILTIN_PRESETS.find((p) => p.id === ANCHOR_PRESET_ID)!.fields);

describe("the ladder", () => {
  it("has all eleven classes, once each", () => {
    expect(classes.map((c) => c.fields.hull_class).sort()).toEqual([...CLASS_CODES].sort());
  });

  it("is the existing 138 m destroyer at DD, unchanged", () => {
    const dd = byCode("DD");
    expect(dd.id).toBe(ANCHOR_PRESET_ID);
    expect(hullOf("DD").spine.length_m).toBe(138);
    expect(FLEET_REFERENCE.anchor_m).toBe(138);
  });

  it("takes every measured length from the reference, snapped to the 3 m grid", () => {
    for (const code of ["BB", "CV", "CL", "CA", "CG"] as MeasuredClass[]) {
      const L = hullOf(code).spine.length_m!;
      expect(L % 3, code).toBe(0);
      expect(Math.abs(L - measuredLength(code)), code).toBeLessThanOrEqual(1.5);
    }
  });

  it("orders the measured classes as the reference draws them — CL above CA", () => {
    // The plan's starting ladder had CL at ~185 m, below CA at ~225. The
    // reference draws the CL icon 52.4 px long and the CA 43.8.
    const L = (c: string) => hullOf(c).spine.length_m!;
    expect(L("CG")).toBeLessThan(L("CA"));
    expect(L("CA")).toBeLessThan(L("CL"));
    expect(L("CL")).toBeLessThan(L("CV"));
    expect(L("CV")).toBeLessThan(L("BB"));
  });

  it("keeps the unmeasured classes at the plan's own figures", () => {
    expect(hullOf("DL").spine.length_m).toBe(165);
    expect(hullOf("FF").spine.length_m).toBe(111);
    expect(hullOf("MN").spine.length_m).toBe(150);
    expect(hullOf("SC").spine.length_m).toBe(21);
    expect(hullOf("MSL").spine.length_m).toBe(8);
  });
});

describe("proportions", () => {
  const LD = (c: string) => hullMetrics(hullOf(c)).length_over_diameter;

  it("anchors heights on the destroyer, so the destroyer icon means the anchor's mean height", () => {
    expect(FLEET_REFERENCE.icons.DD.mean_px * verticalScale(anchor.spine)).toBeCloseTo(meanHeight(anchor.spine), 9);
  });

  it("makes the CV and the monitor fat and the DL thin, as the plan and the reference say", () => {
    expect(LD("CV")).toBeLessThan(LD("DD") * 0.7);
    expect(LD("MN")).toBeLessThan(LD("DD") * 0.7);
    expect(LD("DL")).toBeGreaterThan(LD("DD"));
  });

  it("draws the BB's bands and the CG's lozenges, not a smooth taper", () => {
    // A band is a local maximum in the half-height, bow to stern.
    const bumps = (c: string) => {
      const hs = hullOf(c).spine.stations.map((s) => s.half_height_m);
      return hs.filter((h, i) => i > 0 && i < hs.length - 1 && h > hs[i - 1]! && h > hs[i + 1]!).length;
    };
    expect(bumps("BB")).toBeGreaterThanOrEqual(2);
    expect(bumps("CG")).toBeGreaterThanOrEqual(2);
  });

  it("stretches the DL out of the DD's magazine block, at the DD's height", () => {
    expect(hullMetrics(hullOf("DL")).max_half_height_m).toBeCloseTo(hullMetrics(anchor).max_half_height_m, 9);
    const mag = hullOf("DL").sections!.find((s) => s.id === "magazine")!;
    const ddMag = anchor.sections!.find((s) => s.id === "magazine")!;
    expect(mag.x1 - mag.x0).toBe(ddMag.x1 - ddMag.x0 + 27);
  });
});

describe("every class is a hull the kernel is happy with", () => {
  for (const code of CLASS_CODES) {
    it(`${code}: no errors, no warnings`, () => {
      const hull = hullOf(code);
      const adv = hullAdvisories(hull, { stationPitch_m: hull.spine.station_pitch_m });
      expect(adv.filter((a) => a.severity !== "info").map((a) => a.message)).toEqual([]);
    });

    it(`${code}: sections tile the hull, slots sit on it and on the grid`, () => {
      const hull = hullOf(code);
      const L = hull.spine.length_m!;
      const sections = [...(hull.sections ?? [])].sort((a, b) => a.x0 - b.x0);
      expect(sections[0]?.x0).toBe(0);
      expect(sections[sections.length - 1]?.x1).toBe(L);
      for (let i = 1; i < sections.length; i++) expect(sections[i]!.x0).toBe(sections[i - 1]!.x1);
      const pitch = hull.spine.station_pitch_m ?? 3;
      for (const s of hull.external_slots ?? []) {
        expect(s.x, s.id).toBeGreaterThanOrEqual(0);
        expect(s.x, s.id).toBeLessThanOrEqual(L);
        expect(Math.abs(s.x / pitch - Math.round(s.x / pitch)), s.id).toBeLessThan(1e-9);
        expect(SLOT_TYPES, s.id).toContain(s.type);
      }
      expect(new Set((hull.external_slots ?? []).map((s) => s.id)).size).toBe((hull.external_slots ?? []).length);
    });
  }
});

describe("nothing invented", () => {
  it("leaves structural mass and cost to the anchor alone", () => {
    // Scaling them would need a structure-mass law nobody has ruled on.
    for (const p of classes) {
      if (p.id === ANCHOR_PRESET_ID) continue;
      expect(p.fields.structural_mass_t, String(p.fields.hull_class)).toBeUndefined();
      expect(p.fields.structural_cost, String(p.fields.hull_class)).toBeUndefined();
    }
  });

  it("gives every armour zone the anchor's own material and thickness", () => {
    const bow = anchor.armor_zones![0]!;
    for (const code of CLASS_CODES) {
      for (const z of hullOf(code).armor_zones ?? []) {
        expect(z.material, code).toBe(bow.material);
        expect(z.thickness_cm, code).toBe(bow.thickness_cm);
      }
    }
  });

  it("leaves a missile unarmoured with nothing standing off it", () => {
    expect(hullOf("MSL").armor_zones ?? []).toEqual([]);
    expect(hullOf("MSL").external_slots ?? []).toEqual([]);
  });

  it("says where each class comes from", () => {
    for (const p of classes) expect(p.description ?? p.fields.design_notes, p.id).toBeTruthy();
  });
});
