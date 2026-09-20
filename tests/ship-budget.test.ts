/**
 * The ship budget engine.
 *
 * Three things are being pinned here beyond the arithmetic:
 *
 * - a figure the vault does not supply contributes **zero** and is named in
 *   `assumptions`, never filled in with something plausible;
 * - a number derived from a `provisional: true` table row is named in
 *   `provisional`, so the UI can mark it wherever it lands;
 * - heat is reported as two arrays and never as one total, per
 *   `docs/UNITS.md` §5.
 */
import { describe, it, expect } from "vitest";
import { shipBudget, G0, type ShipContext, type TableLookupLike } from "../src/core/designer/ship/budget";
import { readShip } from "../src/core/designer/ship/record";
import { readHull } from "../src/core/designer/hull/record";
import { grossVolume } from "../src/core/designer/hull/geometry";

// A 100 m barrel, 10 m across and 10 m tall, in two sections. Easy to reason
// about: the cross-section is a 5 m circle everywhere.
const hullFields = {
  structural_mass_t: 1000,
  structural_cost: 200,
  packing_efficiency: 1,
  spine: {
    length_m: 100,
    beam_m: 10,
    station_pitch_m: 3,
    datum: "bow",
    stations: [
      { x: 0, half_height_m: 5 },
      { x: 100, half_height_m: 5 },
    ],
  },
  sections: [
    { id: "forward", x0: 0, x1: 50, allowed: ["habitat", "sensor"], pressurised: true },
    { id: "aft", x0: 50, x1: 100, allowed: ["reactor", "drive", "tank"] },
  ],
  external_slots: [
    { id: "gun-a", x: 20, theta_deg: 0, type: "turret", size: "M" },
    { id: "gun-b", x: 30, theta_deg: 180, type: "turret", size: "M" },
    { id: "rad-1", x: 70, theta_deg: 180, type: "radiator", size: "L" },
    { id: "drive", x: 100, theta_deg: 0, type: "drive", size: "L" },
  ],
};

const MODULES: Record<string, Record<string, unknown>> = {
  drive: { category: "drive", slot: "drive", mass_t: 100, thrust_kN: 9000, isp_s: 5000, propellant: "water", heat_out_MW: 200, crew: 6 },
  reactor: { category: "reactor", slot: "internal", mass_t: 60, volume_m3: 500, power_out_MW: 50, heat_out_MW: 100, crew: 4 },
  hotRadiator: { category: "radiator", slot: "radiator", mass_t: 12, heat_reject_MW: 400, reject_temp_k: 1200, power_in_MW: 0.5 },
  coldRadiator: { category: "radiator", slot: "radiator", mass_t: 8, heat_reject_MW: 20, reject_temp_k: 320 },
  anyRadiator: { category: "radiator", slot: "radiator", mass_t: 10, heat_reject_MW: 300 },
  habitat: { category: "habitat", slot: "internal", mass_t: 40, volume_m3: 900, heat_out_MW: 4, power_in_MW: 2, crew: 10 },
  gun: { category: "weapon-kinetic", slot: "turret", mass_t: 30, power_in_MW: 12, heat_out_MW: 8, magazine: 200, crew: 12 },
  radar: { category: "sensor", slot: "sensor", mass_t: 7, power_in_MW: 3.6, heat_out_MW: 3, radiated_power_kw: 4100 },
  tank: { category: "tank", slot: "external", mass_t: 20, volume_m3: 1000, propellant_capacity_t: 1000 },
};

/** Stands in for `_tables/`: water is sourced, methane is provisional. */
const tables: TableLookupLike = {
  lookup(file, ref, column) {
    if (file === "propellants" && column === "density_kg_m3") {
      if (ref === "water") return { lookup: { value: 1000, provisional: false } };
      if (ref === "methane-liquid") return { lookup: { value: 422, provisional: true } };
    }
    if (file === "armor" && column === "density_kg_m3" && ref === "steel") return { lookup: { value: 7850, provisional: false } };
    return { error: `no row "${ref}" in "${file}"` };
  },
};

const ctx = (extra: Partial<ShipContext> = {}): ShipContext => ({
  hull: readHull(hullFields),
  hullFields,
  module: (id) => MODULES[id],
  tables,
  ...extra,
});

const budgetOf = (fields: Record<string, unknown>, extra: Partial<ShipContext> = {}) => shipBudget(readShip({ hull: "h", kind: "ship", ...fields }), ctx(extra));

describe("mass", () => {
  it("sums fittings, manifest, tanks and structure", () => {
    const b = budgetOf({
      watch_factor: 1,
      fittings: [{ slot: "gun-a", module: "gun" }],
      manifest: [{ id: "r1", section: "aft", module: "reactor", count: 2 }],
      tanks: [{ id: "t1", section: "aft", module: "tank", propellant: "water", volume_m3: 500 }],
    });
    expect(b.moduleMass_t).toBe(30 + 120 + 20);
    expect(b.structuralMass_t).toBe(1000);
    expect(b.dryMass_t).toBe(1170);
    // 500 m³ of water is 500 t.
    expect(b.propellant_t).toBe(500);
    expect(b.wetMass_t).toBe(1670);
  });

  it("counts an external fitting's mass but none of its volume", () => {
    // `gallery/05` §2.5: external modules add mass and wetted area, not volume.
    const b = budgetOf({ fittings: [{ slot: "rad-1", module: "hotRadiator" }] });
    expect(b.moduleMass_t).toBe(12);
    expect(b.volumeUsed_m3).toBe(0);
  });

  it("reports a missing structure mass as an assumption instead of deriving one", () => {
    // structures.yaml is a placeholder whose own header says not to trust a row.
    const b = shipBudget(readShip({ hull: "h" }), { ...ctx(), hullFields: {} });
    expect(b.structuralMass_t).toBe(0);
    expect(b.assumptions.join(" ")).toContain("Structure mass is 0");
  });

  it("derives armour mass from the zone's wetted area and the table density", () => {
    const withArmor = { ...hullFields, armor_zones: [{ id: "belt", x0: 0, x1: 100, material: "steel", thickness_cm: 5 }] };
    const b = shipBudget(readShip({ hull: "h" }), { ...ctx(), hull: readHull(withArmor), hullFields: withArmor });
    // A 100 m tube of 5 m radius: 2πrL = 3141.6 m², × 0.05 m × 7850 kg/m³.
    expect(b.armorMass_t).toBeCloseTo((2 * Math.PI * 5 * 100 * 0.05 * 7850) / 1000, 0);
    expect(b.dryMass_t).toBeCloseTo(1000 + b.armorMass_t, 6);
  });
});

describe("propellant", () => {
  it("marks a mass derived from a provisional density, and everything downstream of it", () => {
    const b = budgetOf({
      fittings: [{ slot: "drive", module: "drive" }],
      tanks: [{ id: "t1", propellant: "methane-liquid", volume_m3: 1000 }],
    });
    expect(b.propellant_t).toBe(422);
    expect(b.provisional).toContain('propellant density for "methane-liquid"');
    expect(b.provisional).toContain("propellant mass, wet mass, Δv and acceleration");
  });

  it("leaves a sourced density unmarked", () => {
    const b = budgetOf({ tanks: [{ id: "t1", propellant: "water", volume_m3: 100 }] });
    expect(b.propellant_t).toBe(100);
    expect(b.provisional).toEqual([]);
  });

  it("carries no mass for a propellant with no row, and says which tank", () => {
    const b = budgetOf({ tanks: [{ id: "t1", propellant: "unobtainium", volume_m3: 100 }] });
    expect(b.propellant_t).toBe(0);
    expect(b.advisories.map((v) => v.message).join(" ")).toContain('Tank "t1" carries no mass');
  });

  it("reads the v1 bare mass only while there are no tanks", () => {
    expect(budgetOf({ propellant_t: 3000 }).propellant_t).toBe(3000);
    // Once a tank exists the bare figure is ignored, so nothing is double-counted.
    expect(budgetOf({ propellant_t: 3000, tanks: [{ id: "t1", propellant: "water", volume_m3: 40 }] }).propellant_t).toBe(40);
  });
});

describe("volume", () => {
  it("spends each section's budget separately and flags only the one that overflows", () => {
    const b = budgetOf({
      manifest: [{ id: "h1", section: "forward", module: "habitat", count: 3 }],
      tanks: [{ id: "t1", section: "aft", module: "tank", propellant: "water", volume_m3: 900 }],
    });
    const forward = b.sections.find((s) => s.id === "forward");
    const aft = b.sections.find((s) => s.id === "aft");
    // A 50 m half of a 5 m-radius tube is π·25·50 ≈ 3,927 m³.
    expect(forward?.usable_m3).toBeCloseTo(grossVolume(readHull(hullFields).spine, 0, 50), 6);
    expect(forward?.used_m3).toBe(2700);
    expect(forward?.over_m3).toBe(0);
    expect(aft?.used_m3).toBe(900);
  });

  it("counts a tank's load against its section, not its tankage mass", () => {
    const b = budgetOf({ tanks: [{ id: "t1", section: "aft", module: "tank", propellant: "water", volume_m3: 250 }] });
    expect(b.sections.find((s) => s.id === "aft")?.used_m3).toBe(250);
  });

  it("leaves an unassigned item out of every section budget", () => {
    const b = budgetOf({ manifest: [{ id: "h1", module: "habitat", count: 1 }] });
    expect(b.sections.every((s) => s.used_m3 === 0)).toBe(true);
    expect(b.volumeUsed_m3).toBe(900); // still in the ship total
  });
});

describe("power and heat by mode", () => {
  const fitted = {
    fittings: [
      { slot: "gun-a", module: "gun" },
      { slot: "rad-1", module: "hotRadiator" },
    ],
    manifest: [
      { id: "r1", section: "aft", module: "reactor", count: 1 },
      { id: "radar", section: "forward", module: "radar", count: 1 },
    ],
  };

  it("runs everything at full when no mode is declared", () => {
    const b = budgetOf(fitted);
    expect(b.modes).toHaveLength(1);
    expect(b.powerIn_MW).toBeCloseTo(12 + 0.5 + 3.6, 6);
    expect(b.powerOut_MW).toBe(50);
  });

  it("reports each mode and takes the headline from the hungriest", () => {
    const b = budgetOf({
      ...fitted,
      modes: [
        { id: "cruise", name: "Cruise", duties: [{ component: "gun-a", duty: "off" }] },
        { id: "combat", name: "Combat", duties: [] },
      ],
    });
    const cruise = b.modes.find((m) => m.id === "cruise");
    expect(cruise?.powerIn_MW).toBeCloseTo(0.5 + 3.6, 6);
    expect(b.worstMode).toBe("combat");
    expect(b.powerIn_MW).toBeCloseTo(12 + 0.5 + 3.6, 6);
  });

  it("silences the emitter in EMCON, which is what the mode is for", () => {
    const b = budgetOf({ ...fitted, modes: [{ id: "emcon", name: "EMCON", duties: [{ component: "radar", duty: "off" }] }] });
    expect(b.modes[0]?.radiated_kw).toBe(0);
    expect(budgetOf(fitted).modes[0]?.radiated_kw).toBe(4100);
  });

  it("scales heat and generation by duty, including a radiator that is folded away", () => {
    const b = budgetOf({ ...fitted, modes: [{ id: "half", name: "Half", duties: [{ component: "rad-1", duty: 0.5 }] }] });
    expect(b.modes[0]?.heatReject_MW).toBe(200);
  });
});

describe("heat is two arrays, never one total (UNITS.md §5)", () => {
  const load = {
    manifest: [
      { id: "h1", section: "forward", module: "habitat", count: 1 }, // 4 MW at ~300 K
      { id: "r1", section: "aft", module: "reactor", count: 1 }, // 100 MW hot
    ],
  };

  it("splits the load by what produced it", () => {
    const m = budgetOf(load).modes[0];
    expect(m?.heatLow_MW).toBe(4);
    expect(m?.heatHigh_MW).toBe(100);
    expect(m?.heatOut_MW).toBe(104);
  });

  it("catches a ship that can reject its reactor but not its habitat", () => {
    // 400 MW of 1,200 K rejection against 4 MW of 300 K load. One total would
    // show a comfortable surplus; the split shows the habitat cooking.
    const b = budgetOf({ ...load, fittings: [{ slot: "rad-1", module: "hotRadiator" }] });
    const m = b.modes[0];
    expect(m?.heatMargin_MW).toBeGreaterThan(0);
    expect(m?.marginLow_MW).toBe(-4);
    expect(m?.marginHigh_MW).toBe(300);
  });

  it("is satisfied once a low-temperature array is fitted", () => {
    const b = budgetOf({
      ...load,
      fittings: [
        { slot: "rad-1", module: "hotRadiator" },
        { slot: "gun-a", module: "coldRadiator" },
      ],
    });
    expect(b.modes[0]?.marginLow_MW).toBe(16);
  });

  it("spends an unclassed radiator once, worst deficit first", () => {
    // 300 MW with no declared temperature against 4 low and 100 high: 4 goes to
    // the habitat, 296 remains for the reactor. It cannot be counted twice.
    const b = budgetOf({ ...load, fittings: [{ slot: "rad-1", module: "anyRadiator" }] });
    const m = b.modes[0];
    expect(m?.rejectUnclassed_MW).toBe(300);
    // Both bands are covered, neither out of its own capacity. The 196 MW left
    // over belongs to neither, so it is reported on its own rather than added
    // to a margin that might not be able to draw on it.
    expect(m?.marginLow_MW).toBe(0);
    expect(m?.marginHigh_MW).toBe(0);
    expect(m?.rejectSpare_MW).toBe(196);
  });
});

describe("crew", () => {
  it("multiplies per-watch figures by the watch factor and leaves totals alone", () => {
    // docs/UNITS.md §4: crew = Σ (total ? crew : per_watch × watches).
    const withTotals: Record<string, Record<string, unknown>> = {
      ...MODULES,
      cic: { category: "other", slot: "internal", mass_t: 5, crew: 40, crew_basis: "total" },
    };
    const b = shipBudget(
      readShip({
        hull: "h",
        watch_factor: 3,
        manifest: [
          { id: "r1", section: "aft", module: "reactor", count: 1 }, // 4 per watch
          { id: "c1", section: "forward", module: "cic", count: 1 }, // 40 total
        ],
      }),
      { ...ctx(), module: (id) => withTotals[id] },
    );
    expect(b.crewOnWatch).toBe(4);
    expect(b.crew).toBe(4 * 3 + 40);
  });

  it("leaves automation at 1 and says so, rather than guessing a figure", () => {
    const b = budgetOf({ watch_factor: 3, manifest: [{ id: "r1", section: "aft", module: "reactor", count: 1 }] });
    expect(b.crew).toBe(12);
    expect(b.assumptions.join(" ")).toContain("Automation factor is 1");
  });

  it("applies an automation factor a constraint set does supply", () => {
    const b = budgetOf({ watch_factor: 3, manifest: [{ id: "r1", section: "aft", module: "reactor", count: 1 }] }, { params: { automation_factor: 0.5 } });
    expect(b.crew).toBe(6);
    expect(b.assumptions.join(" ")).not.toContain("Automation factor");
  });

  it("carries no consumables mass without kg_per_crew_day, and does once it has one", () => {
    const fields = { watch_factor: 1, endurance_days: 60, manifest: [{ id: "h1", section: "forward", module: "habitat", count: 1 }] };
    const without = budgetOf(fields);
    expect(without.consumablesMass_t).toBe(0);
    expect(without.assumptions.join(" ")).toContain("kg_per_crew_day");
    const with_ = budgetOf(fields, { params: { kg_per_crew_day: 10 } });
    expect(with_.crewDays).toBe(600);
    expect(with_.consumablesMass_t).toBe(6);
    expect(with_.dryMass_t).toBe(1000 + 40 + 6);
  });

  it("honours an explicit complement over the roll-up", () => {
    const b = budgetOf({ watch_factor: 3, crew_override: 200, manifest: [{ id: "r1", section: "aft", module: "reactor", count: 1 }] });
    expect(b.crew).toBe(200);
    expect(b.crewOnWatch).toBe(4);
  });
});

describe("Δv and staging", () => {
  const drive = { fittings: [{ slot: "drive", module: "drive" }] };

  it("gives one stage and the plain rocket equation when nothing is jettisoned", () => {
    const b = budgetOf({ ...drive, propellant_t: 1000 });
    expect(b.stages).toHaveLength(1);
    expect(b.deltaV_kms).toBeCloseTo((5000 * G0 * Math.log(b.wetMass_t / b.dryMass_t)) / 1000, 9);
  });

  it("drops a tank's dry mass with it, which is what makes a drop tank worth having", () => {
    const staged = budgetOf({
      ...drive,
      tanks: [
        { id: "drop", module: "tank", propellant: "water", volume_m3: 500, jettison_order: 1 },
        { id: "core", module: "tank", propellant: "water", volume_m3: 500, jettison_order: 0 },
      ],
    });
    const integral = budgetOf({
      ...drive,
      tanks: [
        { id: "a", module: "tank", propellant: "water", volume_m3: 500, jettison_order: 0 },
        { id: "b", module: "tank", propellant: "water", volume_m3: 500, jettison_order: 0 },
      ],
    });
    expect(staged.stages).toHaveLength(2);
    expect(staged.stages[0]?.order).toBe(1);
    expect(staged.stages[1]?.order).toBe(0); // the integral stage burns last
    expect(staged.wetMass_t).toBe(integral.wetMass_t);
    expect(staged.deltaV_kms).toBeGreaterThan(integral.deltaV_kms);
  });

  it("reports the acceleration at the start of each stage", () => {
    const b = budgetOf({
      ...drive,
      tanks: [
        { id: "drop", module: "tank", propellant: "water", volume_m3: 500, jettison_order: 1 },
        { id: "core", module: "tank", propellant: "water", volume_m3: 200, jettison_order: 0 },
      ],
    });
    expect(b.stages[0]?.accelStart_g).toBeCloseTo((9000 * 1000) / (b.wetMass_t * 1000) / G0, 9);
    expect(b.stages[1]?.accelStart_g).toBeGreaterThan(b.stages[0]?.accelStart_g as number);
  });

  it("has no Δv without a drive, and does not divide by zero", () => {
    const b = budgetOf({ propellant_t: 1000 });
    expect(b.deltaV_kms).toBe(0);
    expect(b.stages).toEqual([]);
  });
});

describe("balance", () => {
  it("puts the centre of gravity where the mass is, counting structure at the hull's centroid", () => {
    const b = budgetOf({ fittings: [{ slot: "gun-a", module: "gun" }] });
    // 1,000 t of structure at the 50 m centroid, 30 t of gun at 20 m.
    expect(b.cgStation_m).toBeCloseTo((1000 * 50 + 30 * 20) / 1030, 6);
  });

  it("measures the arm between the centre of gravity and the thrust line", () => {
    // One dorsal gun at half-height 5 m, against a drive on the axis.
    const b = budgetOf({
      fittings: [
        { slot: "gun-a", module: "gun" },
        { slot: "drive", module: "drive" },
      ],
    });
    expect(b.thrustOffset_m).toBeGreaterThan(0);
    // The same gun mirrored ventrally cancels it.
    const balanced = budgetOf({
      fittings: [
        { slot: "gun-a", module: "gun" },
        { slot: "gun-b", module: "gun" },
        { slot: "drive", module: "drive" },
      ],
    });
    expect(balanced.thrustOffset_m).toBeCloseTo(0, 9);
  });
});

describe("robustness", () => {
  it("reports a module that is not in the vault rather than silently dropping it", () => {
    const b = budgetOf({ manifest: [{ id: "m1", section: "aft", module: "ghost", count: 1 }] });
    expect(b.moduleMass_t).toBe(0);
    expect(b.advisories[0]?.severity).toBe("error");
    expect(b.advisories[0]?.message).toContain("not in the vault");
  });

  it("budgets a craft with no hull at all without throwing", () => {
    const b = shipBudget(readShip({ loadout: [{ module: "reactor", count: 2 }] }), { module: (id) => MODULES[id] });
    expect(b.moduleMass_t).toBe(120);
    expect(b.sections).toEqual([]);
    expect(b.thrustOffset_m).toBe(0);
  });
});

describe("open-cycle drives (UNITS.md §5)", () => {
  const OPEN: Record<string, Record<string, unknown>> = {
    ...MODULES,
    torch: { category: "drive", slot: "drive", mass_t: 100, thrust_kN: 9000, isp_s: 5000, propellant: "water", cycle: "open", heat_out_MW: 250 },
    closed: { category: "drive", slot: "drive", mass_t: 100, thrust_kN: 9000, isp_s: 5000, propellant: "water", cycle: "closed", heat_out_MW: 250 },
  };
  const withDrive = (id: string) => shipBudget(readShip({ hull: "h", fittings: [{ slot: "drive", module: id }] }), { ...ctx(), module: (m) => OPEN[m] });

  it("does not ask a radiator to reject what left in the exhaust", () => {
    expect(withDrive("torch").modes[0]?.heatHigh_MW).toBe(0);
    expect(withDrive("closed").modes[0]?.heatHigh_MW).toBe(250);
  });

  it("treats a drive that does not say as closed, which is the conservative half", () => {
    // `drive` in MODULES declares no cycle and sheds 200 MW.
    expect(budgetOf({ fittings: [{ slot: "drive", module: "drive" }] }).modes[0]?.heatHigh_MW).toBe(200);
  });

  it("only forgives a drive — a reactor's heat is a reactor's heat", () => {
    const odd: Record<string, Record<string, unknown>> = { ...MODULES, r: { category: "reactor", slot: "internal", mass_t: 1, cycle: "open", heat_out_MW: 100 } };
    const b = shipBudget(readShip({ hull: "h", manifest: [{ id: "r1", section: "aft", module: "r" }] }), { ...ctx(), module: (m) => odd[m] });
    expect(b.modes[0]?.heatHigh_MW).toBe(100);
  });
});

describe("drop tanks hang outside the hull", () => {
  const drop = {
    fittings: [{ slot: "drive", module: "drive" }],
    tanks: [
      { id: "inner", section: "aft", module: "tank", propellant: "water", volume_m3: 300, jettison_order: 0 },
      { id: "outer", slot: "rad-1", module: "tank", propellant: "water", volume_m3: 300, jettison_order: 1 },
    ],
  };

  it("spends no section volume, unlike an integral tank", () => {
    const b = budgetOf(drop);
    expect(b.sections.find((s) => s.id === "aft")?.used_m3).toBe(300);
    expect(b.propellant_t).toBe(600);
  });

  it("still carries its tankage mass and sits at its slot for the CG", () => {
    const b = budgetOf(drop);
    expect(b.moduleMass_t).toBe(100 + 20 + 20);
    expect(b.lines.find((l) => l.id === "outer")?.x).toBe(70); // the rad-1 slot
  });

  it("ignores a section on a tank that names a slot, rather than counting both", () => {
    const both = readShip({ hull: "h", tanks: [{ id: "t", slot: "rad-1", section: "aft", module: "tank", propellant: "water", volume_m3: 300 }] });
    expect(both.tanks[0]?.section).toBeUndefined();
    expect(both.tanks[0]?.slot).toBe("rad-1");
  });
});
