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
import {
  ANCHOR_PRESET_ID,
  CLASS_ARMOUR_MATERIAL,
  CLASS_CODES,
  FLEET_REFERENCE,
  NEBULOUS_EXAMPLES,
  NOSE_THICKNESS_FACTOR,
  measuredLength,
  meanHeight,
  verticalScale,
  type MeasuredClass,
} from "../src/core/designer/hull/classes";
import { ratedDisplacement, structureOf } from "../src/core/designer/hull/structure";
import { DEFAULT_CONSTRAINT_SET } from "../src/core/designer/constraints";
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
    // The CV was measured too, then resized as a whole on 2026-09-24.
    for (const code of ["BB", "CA", "CG"] as MeasuredClass[]) {
      const L = hullOf(code).spine.length_m!;
      expect(L % 3, code).toBe(0);
      expect(Math.abs(L - measuredLength(code)), code).toBeLessThanOrEqual(1.5);
    }
  });

  it("puts the light cruiser below the heavy one, whatever the chart draws", () => {
    // Ruled 2026-09-23: CL means light cruiser, so the chart's long CL icon is
    // the chart being off. The CL takes the plan's ~185 m (186 on the grid).
    const L = (c: string) => hullOf(c).spine.length_m!;
    expect(L("CL")).toBe(186);
    expect(L("DL")).toBeLessThan(L("CL"));
    expect(L("CL")).toBeLessThan(L("CA"));
    expect(L("CA")).toBeLessThan(L("BB"));
  });

  it("keeps the unmeasured classes at the plan's own figures", () => {
    expect(hullOf("DL").spine.length_m).toBe(165);
    expect(hullOf("FF").spine.length_m).toBe(111);
    // The monitor was resized as a whole to its example mass (2026-09-24).
    expect(hullOf("MN").spine.length_m).toBe(78);
    expect(hullOf("SC").spine.length_m).toBe(21);
    expect(hullOf("MSL").spine.length_m).toBe(8);
  });
});

describe("proportions", () => {
  const LD = (c: string) => hullMetrics(hullOf(c)).length_over_diameter;

  it("anchors heights on the destroyer, so the destroyer icon means the anchor's mean height", () => {
    expect(FLEET_REFERENCE.icons.DD.mean_px * verticalScale(anchor.spine)).toBeCloseTo(meanHeight(anchor.spine), 9);
  });

  it("rates every example class at its NEBULOUS mass, by solving its height", () => {
    const density = DEFAULT_CONSTRAINT_SET.params.design_density_t_m3!.value;
    for (const [code, ex] of Object.entries(NEBULOUS_EXAMPLES)) {
      const rated = ratedDisplacement(hullOf(code), density)!;
      expect(Math.abs(rated - ex.mass_t) / ex.mass_t, code).toBeLessThan(0.005);
    }
  });

  it("leaves every example class able to carry its own structure", () => {
    const params = {
      structure_density_kg_m3: DEFAULT_CONSTRAINT_SET.params.structure_density_kg_m3!.value,
      design_density_t_m3: DEFAULT_CONSTRAINT_SET.params.design_density_t_m3!.value,
    };
    const composite = () => ({ density_kg_m3: 1930, provisional: false }); // _tables/armor.yaml
    for (const code of Object.keys(NEBULOUS_EXAMPLES)) {
      const f = structureOf(hullOf(code), params, composite).fraction!;
      expect(f, code).toBeGreaterThan(0.2);
      expect(f, code).toBeLessThan(1);
    }
    // The destroyer, the baseline: about a third of it is hull.
    expect(structureOf(hullOf("DD"), params, composite).fraction).toBeCloseTo(0.34, 2);
  });

  it("keeps the CV and the monitor fat, resizing them to their masses instead", () => {
    // Ruled 2026-09-24: their character is being fat, so they keep the CV
    // icon's proportions and change size — the CV to 123 m, the MN to 78 m.
    expect(LD("CV")).toBeLessThan(LD("DD") * 0.7);
    expect(LD("MN")).toBeLessThan(LD("DD") * 0.7);
    expect(hullOf("CV").spine.length_m).toBe(123);
  });

  it("puts part of the CV's hangar space outside the hull, as flight decks", () => {
    const decks = (hullOf("CV").external_slots ?? []).filter((s) => s.type === "hangar" && s.subtype === "flight-deck");
    expect(decks.length).toBeGreaterThanOrEqual(3);
    expect(new Set(decks.map((d) => d.theta_deg))).toEqual(new Set([0, 90, 270]));
  });

  it("keeps the DL thinner than the DD", () => {
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

  it("stretches the DL out of the DD's magazine block, in the DD's proportions", () => {
    // Same profile, scaled as a whole: every station's height is the DD's
    // times one factor.
    const dl = hullOf("DL").spine.stations.filter((s) => s.x <= 60);
    const dd = anchor.spine.stations.filter((s) => s.x <= 60);
    const k = dl[1]!.half_height_m / dd[1]!.half_height_m;
    for (let i = 1; i < dd.length; i++) expect(dl[i]!.half_height_m / dd[i]!.half_height_m).toBeCloseTo(k, 1);
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
  it("types no structural mass or cost onto any class, the anchor included", () => {
    // The structural-mass law computes both (ruled 2026-09-23).
    for (const p of classes) {
      expect(p.fields.structural_mass_t, String(p.fields.hull_class)).toBeUndefined();
      expect(p.fields.structural_cost, String(p.fields.hull_class)).toBeUndefined();
    }
  });

  it("armours every example class end to end at its thickness, the bow taper at four fifths", () => {
    for (const [code, ex] of Object.entries(NEBULOUS_EXAMPLES)) {
      const hull = hullOf(code);
      expect(hull.internal_density_cm_m, code).toBe(ex.internal_cm_m);
      const zones = hull.armor_zones!;
      expect(zones.map((z) => z.material), code).toEqual([CLASS_ARMOUR_MATERIAL, CLASS_ARMOUR_MATERIAL]);
      expect(zones[0]!.thickness_cm, code).toBeCloseTo(ex.armour_cm * NOSE_THICKNESS_FACTOR, 9);
      expect(zones[1]!.thickness_cm, code).toBe(ex.armour_cm);
      // Contiguous, bow to stern.
      expect(zones[0]!.x0).toBe(0);
      expect(zones[1]!.x0).toBe(zones[0]!.x1);
      expect(zones[1]!.x1).toBe(hull.spine.length_m);
    }
  });

  it("leaves the strikecraft's armour thickness for the author, having no example to take it from", () => {
    expect(hullOf("SC").armor_zones?.[0]?.thickness_cm).toBeUndefined();
  });

  it("leaves a missile unarmoured with nothing standing off it", () => {
    expect(hullOf("MSL").armor_zones ?? []).toEqual([]);
    expect(hullOf("MSL").external_slots ?? []).toEqual([]);
  });

  it("says where each class comes from", () => {
    for (const p of classes) expect(p.description ?? p.fields.design_notes, p.id).toBeTruthy();
  });
});
