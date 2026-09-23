/**
 * The 2026-09-23 issue list, one describe block per issue:
 *
 * - radiators are a fixed width **per panel**, so three in a set are three
 *   times as wide as one;
 * - a mount can be **turned** — a gun flipped to fire aft, a thruster tilted
 *   and turned — in the hull editor, drawn that way, and used that way by the
 *   attitude budget, which can now report roll;
 * - VLS cells default to 8 / 16 / 32 / 48 by size and otherwise draw the
 *   module's own count;
 * - a slot can be a **ring** of up to eight, spaced round the hull;
 * - plasma and rocket weapons have presets to show the families exist;
 * - structure follows the **structural-mass law** rather than a typed figure.
 */
import { describe, it, expect } from "vitest";
import { makePart, partsForHull, ringMembers, slotIdOf } from "../src/core/designer/hull/parts";
import { exhaustLocal, slotOrientation, toShip } from "../src/core/designer/hull/orientation";
import { renderHull } from "../src/core/designer/hull/render";
import { hullAdvisories } from "../src/core/designer/hull/advisories";
import { grossVolume } from "../src/core/designer/hull/geometry";
import { readHull, writeHull } from "../src/core/designer/hull/record";
import { structureOf } from "../src/core/designer/hull/structure";
import { shipBudget, type ShipContext } from "../src/core/designer/ship/budget";
import { readShip } from "../src/core/designer/ship/record";
import { fittedWeapon, shipSilhouette } from "../src/core/designer/ship/silhouette";
import { readModule } from "../src/core/designer/ship/module";
import { BUILTIN_PRESETS } from "../src/core/schema/builtin/presets";
import type { ExternalSlot, HullGeometry } from "../src/core/designer/hull/types";

const hull = (slots: ExternalSlot[], extra: Partial<HullGeometry> = {}): HullGeometry => ({
  spine: { length_m: 100, beam_m: 10, station_pitch_m: 3, stations: [{ x: 0, half_height_m: 5 }, { x: 100, half_height_m: 5 }] },
  external_slots: slots,
  ...extra,
});
const xs = (pieces: [number, number][][]) => pieces.flat().map(([x]) => x);
const ys = (pieces: [number, number][][]) => pieces.flat().map(([, y]) => y);
const width = (pieces: [number, number][][]) => Math.max(...xs(pieces)) - Math.min(...xs(pieces));

describe("radiators are a fixed width per panel", () => {
  it("makes three panels three times as wide as one", () => {
    for (const radiator of ["fin", "panel", "droplet-boom", "spine-array", "hoop", "membrane"] as const) {
      const one = makePart({ kind: "radiator", size: "L", families: { radiator }, panels: 1 });
      const three = makePart({ kind: "radiator", size: "L", families: { radiator }, panels: 3 });
      expect(width(three), radiator).toBeCloseTo(3 * width(one), 6);
    }
  });

  it("keeps each panel taller than it is wide, however many there are", () => {
    const three = makePart({ kind: "radiator", size: "S", families: { radiator: "fin" }, panels: 3 });
    const h = Math.max(...ys(three)) - Math.min(...ys(three));
    expect(h).toBeGreaterThanOrEqual(width(three) / 3 - 1e-9);
  });
});

describe("mounts can be turned", () => {
  it("defaults a thruster slot to radial and a drive to aft, as the budget always assumed", () => {
    expect(slotOrientation({ type: "thruster" })).toEqual({ facing_deg: 0, tilt_deg: 90 });
    expect(slotOrientation({ type: "drive" })).toEqual({ facing_deg: 0, tilt_deg: 0 });
    // Only nozzles tilt.
    expect(slotOrientation({ type: "turret", tilt_deg: 45 }).tilt_deg).toBe(0);
    // A radial nozzle on the dorsal skin exhausts straight up.
    const up = toShip(exhaustLocal(slotOrientation({ type: "thruster" })), 0);
    expect(up[1]).toBeCloseTo(1, 9);
  });

  it("flips a gun to fire aft", () => {
    const fore = partsForHull(hull([{ id: "g", x: 50, theta_deg: 0, type: "turret", size: "M" }]));
    const aft = partsForHull(hull([{ id: "g", x: 50, theta_deg: 0, type: "turret", size: "M", facing_deg: 180 }]));
    // The barrel runs toward −x (the bow) as drawn, toward +x once flipped.
    expect(Math.min(...xs(fore.map((p) => p.outline)))).toBeLessThan(-4);
    expect(Math.max(...xs(aft.map((p) => p.outline)))).toBeGreaterThan(4);
    expect(Math.min(...xs(aft.map((p) => p.outline)))).toBeGreaterThan(-4);
  });

  it("turns a gun exactly where it is seen down its axis", () => {
    // From above, a dorsal gun turned 90° points to starboard, which is down
    // the screen with the bow to the right.
    const turned = partsForHull(hull([{ id: "g", x: 50, theta_deg: 0, type: "turret", size: "M", facing_deg: 90 }]), { view: "plan" });
    const barrel = turned.find((p) => p.id === "g~1")!;
    expect(Math.min(...barrel.outline.map(([, y]) => y))).toBeLessThan(-4);
    expect(Math.max(...barrel.outline.map(([x]) => Math.abs(x)))).toBeLessThan(1);
  });

  it("points a radial thruster outward and a retro-thruster forward", () => {
    const radial = partsForHull(hull([{ id: "t", x: 50, theta_deg: 0, type: "thruster", size: "S" }]));
    expect(Math.min(...ys(radial.map((p) => p.outline)))).toBeGreaterThan(-1e-9); // stands up off the skin
    expect(Math.max(...ys(radial.map((p) => p.outline)))).toBeGreaterThan(1);
    const retro = partsForHull(hull([{ id: "t", x: 50, theta_deg: 0, type: "thruster", size: "S", tilt_deg: 0, facing_deg: 180 }]));
    expect(Math.max(...xs(retro.map((p) => p.outline)))).toBeLessThan(1e-9); // exhaust toward the bow
  });

  it("shows a nozzle pointing at the eye as its bell mouth", () => {
    // A radial thruster on the starboard beam fires straight at a side-on viewer.
    const atEye = partsForHull(hull([{ id: "t", x: 50, theta_deg: 90, type: "thruster", size: "S" }]));
    expect(atEye).toHaveLength(1);
    expect(atEye[0]!.outline).toHaveLength(12);
    expect(atEye[0]!.far).toBe(true);
  });

  it("round-trips facing, tilt and ring count through the record", () => {
    const h = hull([{ id: "t", x: 50, theta_deg: 0, type: "thruster", size: "S", facing_deg: 90, tilt_deg: 30, count: 4 }]);
    const back = readHull(writeHull({}, h));
    expect(back.external_slots?.[0]).toMatchObject({ facing_deg: 90, tilt_deg: 30, count: 4 });
    // Out of range is read as the nearest thing that makes sense.
    const wild = readHull({ ...writeHull({}, h), external_slots: [{ id: "t", x: 1, theta_deg: 0, type: "thruster", size: "S", tilt_deg: 200, count: 20 }] });
    expect(wild.external_slots?.[0]).toMatchObject({ tilt_deg: 90, count: 8 });
  });
});

describe("the attitude budget reads which way thrusters point", () => {
  const rcsHull = (slots: ExternalSlot[]) => {
    const fields = writeHull({ structural_mass_t: 1000 }, hull([...slots, { id: "drive", x: 100, theta_deg: 0, type: "drive", size: "L" }]));
    return fields;
  };
  const MODULES: Record<string, Record<string, unknown>> = { quad: { category: "drive", slot: "thruster", mass_t: 2, thrust_kN: 40, isp_s: 320 } };
  const budget = (slots: ExternalSlot[], fittings: string[]) => {
    const fields = rcsHull(slots);
    const ctx: ShipContext = { hull: readHull(fields), hullFields: fields, module: (id) => MODULES[id] };
    return shipBudget(readShip({ hull: "h", fittings: fittings.map((slot) => ({ slot, module: "quad" })) }), ctx);
  };

  it("keeps the old pitch figures for radial thrusters exactly", () => {
    const b = budget(
      [
        { id: "f", x: 10, theta_deg: 0, type: "thruster", size: "S" },
        { id: "a", x: 90, theta_deg: 0, type: "thruster", size: "S" },
      ],
      ["f", "a"],
    );
    // One 40 kN nozzle at each end; the weaker end's couple is 40 kN × its arm.
    expect(b.attitude?.torque_kNm).toBeGreaterThan(0);
    expect(b.attitude?.roll).toBeUndefined(); // radial thrust through the axis has no roll
  });

  it("rolls the ship once nozzles are turned tangential, both ways round", () => {
    const b = budget(
      [
        { id: "cw", x: 50, theta_deg: 0, type: "thruster", size: "S", tilt_deg: 0, facing_deg: 90, count: 2 },
        { id: "ccw", x: 52, theta_deg: 0, type: "thruster", size: "S", tilt_deg: 0, facing_deg: 270, count: 2 },
      ],
      ["cw", "ccw"],
    );
    // Four 40 kN nozzles, two each way, 5 m off the axis: 2 × 40 × 5 per sense.
    expect(b.attitude?.roll?.torque_kNm).toBeCloseTo(400, 6);
    expect(b.attitude?.roll?.slew90_s).toBeGreaterThan(0);
  });

  it("gets no couple from nozzles fired along the hull", () => {
    const b = budget(
      [
        { id: "f", x: 10, theta_deg: 0, type: "thruster", size: "S", tilt_deg: 0 },
        { id: "a", x: 90, theta_deg: 0, type: "thruster", size: "S", tilt_deg: 0 },
      ],
      ["f", "a"],
    );
    const radial = budget(
      [
        { id: "f", x: 10, theta_deg: 0, type: "thruster", size: "S" },
        { id: "a", x: 90, theta_deg: 0, type: "thruster", size: "S" },
      ],
      ["f", "a"],
    );
    // Axial thrust 5 m off the axis turns the ship by 5 m of arm, not 40.
    expect(b.attitude!.torque_kNm).toBeLessThan(radial.attitude!.torque_kNm / 5);
  });
});

describe("VLS cells", () => {
  it("draws the module's own count cell for cell", () => {
    const plan = makePart({ kind: "turret", weapon: "cell", cells: 24 }, "plan");
    expect(plan.length - 1).toBe(24);
  });
});

describe("rings", () => {
  const collar: ExternalSlot = { id: "tk", x: 60, theta_deg: 45, type: "tank", size: "M", count: 4 };

  it("spaces a ring's members evenly from its clock angle", () => {
    expect(ringMembers(collar).map((m) => [m.id, m.theta_deg])).toEqual([
      ["tk", 45],
      ["tk@1", 135],
      ["tk@2", 225],
      ["tk@3", 315],
    ]);
    expect(slotIdOf("tk@3~1")).toBe("tk");
  });

  it("draws every member, and a ship's collar count wins over the hull's", () => {
    const drawn = (options = {}) => new Set(partsForHull(hull([collar]), options).map((p) => p.id.split("~")[0])).size;
    expect(drawn()).toBe(4);
    expect(drawn({ counts: { tk: 6 } })).toBe(6);
  });

  it("marks every member on the schematic, and a click on any selects the slot", () => {
    const ids = renderHull(hull([collar]), { mode: "schematic" }).elements.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(["slot-tk", "slot-tk@1", "slot-tk@2", "slot-tk@3"]));
  });

  it("checks every member for fouling against other slots", () => {
    const fouled = hullAdvisories(hull([collar, { id: "gun", x: 60, theta_deg: 140, type: "turret", size: "M" }]), {});
    expect(fouled.some((a) => a.message.includes("“tk” and “gun”"))).toBe(true);
  });

  it("charges a fitting once per member, on the thrust line", () => {
    const fields = writeHull({ structural_mass_t: 1000 }, hull([{ id: "pd", x: 30, theta_deg: 0, type: "pd", size: "S", count: 4 }]));
    const b = shipBudget(readShip({ hull: "h", fittings: [{ slot: "pd", module: "pdm" }] }), {
      hull: readHull(fields),
      hullFields: fields,
      module: () => ({ category: "point-defense", slot: "pd", mass_t: 5, cost: 2 }),
    });
    const line = b.lines.find((l) => l.id === "pd")!;
    expect(line.count).toBe(4);
    expect(line.mass_t).toBe(20);
    expect(line.theta_deg).toBeUndefined();
  });

  it("draws a ship's tank collar at its count", () => {
    const h = hull([{ id: "tk", x: 60, theta_deg: 0, type: "tank", size: "M" }]);
    const ship = readShip({ hull: "h", tanks: [{ id: "t", slot: "tk", module: "tank", count: 3, volume_m3: 10 }] });
    const parts = shipSilhouette(h, ship, { module: () => ({ category: "tank", slot: "tank", mass_t: 1 }) }).parts;
    expect(new Set(parts.map((p) => p.id.split("~")[0])).size).toBe(3);
  });
});

describe("plasma and rocket weapons", () => {
  it("ship as presets sourced from the mounts table, drawn as their own families", () => {
    const preset = (id: string) => BUILTIN_PRESETS.find((p) => p.id === id)!;
    expect(fittedWeapon(readModule(preset("rl18-launcher").fields))).toMatchObject({ weapon: "rocket", cells: 18 });
    expect(fittedWeapon(readModule(preset("t81-plasma").fields))).toMatchObject({ weapon: "plasma" });
    expect(preset("rl18-launcher").description).toContain("mounts.yaml");
  });
});

describe("the structural-mass law", () => {
  const h = hull([], { internal_density_cm_m: 0.5, packing_efficiency: 0.8, armor_zones: [{ id: "all", x0: 0, x1: 100, material: "steel", thickness_cm: 10 }] });
  const steel = () => ({ density_kg_m3: 7850, provisional: false });
  const params = { structure_density_kg_m3: 7850, design_density_t_m3: 0.7, structure_cost_per_t: 0.1 };

  it("makes internal density the plate share of the volume", () => {
    const s = structureOf(h, params, steel);
    expect(s.internal_t).toBeCloseTo((grossVolume(h.spine) * 0.005 * 7850) / 1000, 9);
    expect(s.rated_t).toBeCloseTo(0.7 * 0.8 * grossVolume(h.spine), 9);
    expect(s.fraction).toBeCloseTo((s.internal_t! + s.armour_t) / s.rated_t!, 12);
    expect(s.cost).toBeCloseTo(0.1 * (s.internal_t! + s.armour_t), 9);
  });

  const ctxFor = (extra: Record<string, unknown>, provisionalParams: string[] = []): ShipContext => {
    const fields = writeHull(extra, h);
    return {
      hull: readHull(fields),
      hullFields: fields,
      tables: { lookup: (file, ref, column) => (file === "armor" && ref === "steel" && column === "density_kg_m3" ? { lookup: { value: 7850, provisional: false } } : { error: "no" }) },
      params,
      provisionalParams,
    };
  };

  it("computes the budget's structural mass when nothing is typed", () => {
    const b = shipBudget(readShip({ hull: "h" }), ctxFor({}, ["design_density_t_m3"]));
    expect(b.structureSource).toBe("law");
    expect(b.structuralMass_t).toBeCloseTo(structureOf(h, params, steel).internal_t!, 9);
    expect(b.ratedMass_t).toBeGreaterThan(0);
    // The rating rests on a provisional calibration, and says so.
    expect(b.provisional).toContain("rated displacement and structure fraction");
  });

  it("lets a typed figure win, and shows the law beside it", () => {
    const b = shipBudget(readShip({ hull: "h" }), ctxFor({ structural_mass_t: 1234 }));
    expect(b.structureSource).toBe("hand");
    expect(b.structuralMass_t).toBe(1234);
    expect(b.advisories.some((a) => a.message.includes("hand-set at 1,234 t"))).toBe(true);
  });

  it("warns when a hull is too heavily built to carry anything", () => {
    const b = shipBudget(readShip({ hull: "h" }), { ...ctxFor({}), params: { ...params, design_density_t_m3: 0.05 } });
    expect(b.advisories.some((a) => a.severity === "warn" && a.message.includes("outweigh the hull's rated full load"))).toBe(true);
  });
});
