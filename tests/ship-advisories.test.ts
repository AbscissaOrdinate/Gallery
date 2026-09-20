/**
 * Ship advisories: every check that needs a loadout.
 *
 * The acceptance criteria for editor 2 (`gallery/07` §3) are here — removing
 * the radiators trips the thermal advisory, overloading the tanks trips volume
 * and balance — alongside the fit checks that only became possible once a
 * fitting knew which slot it was in.
 */
import { describe, it, expect } from "vitest";
import { shipAdvisories } from "../src/core/designer/ship/advisories";
import { shipBudget, type ShipContext } from "../src/core/designer/ship/budget";
import { readShip } from "../src/core/designer/ship/record";
import { readHull } from "../src/core/designer/hull/record";
import type { Violation } from "../src/core/designer/violations";

const hullFields = {
  structural_mass_t: 1000,
  packing_efficiency: 1,
  spine: {
    length_m: 100,
    beam_m: 10,
    datum: "bow",
    stations: [
      { x: 0, half_height_m: 5 },
      { x: 100, half_height_m: 5 },
    ],
  },
  sections: [
    { id: "forward", x0: 0, x1: 50, allowed: ["habitat", "sensor"], pressurised: true },
    { id: "aft", x0: 50, x1: 100, allowed: ["reactor", "drive"] },
  ],
  external_slots: [
    { id: "gun-a", x: 20, theta_deg: 0, type: "turret", size: "M" },
    { id: "gun-b", x: 30, theta_deg: 180, type: "turret", size: "M" },
    { id: "rad-1", x: 70, theta_deg: 180, type: "radiator", size: "L" },
    { id: "drive", x: 100, theta_deg: 0, type: "drive", size: "L" },
  ],
};

const MODULES: Record<string, Record<string, unknown>> = {
  drive: { category: "drive", slot: "drive", mass_t: 100, thrust_kN: 9000, isp_s: 5000, propellant: "water", heat_out_MW: 200 },
  reactor: { category: "reactor", slot: "internal", mass_t: 60, volume_m3: 500, power_out_MW: 50, heat_out_MW: 100 },
  radiator: { category: "radiator", slot: "radiator", mass_t: 12, heat_reject_MW: 400, reject_temp_k: 1200 },
  coldRadiator: { category: "radiator", slot: "radiator", mass_t: 8, heat_reject_MW: 20, reject_temp_k: 320 },
  habitat: { category: "habitat", slot: "internal", mass_t: 40, volume_m3: 900, heat_out_MW: 4, power_in_MW: 2 },
  gun: { category: "weapon-kinetic", slot: "turret", mass_t: 300, power_in_MW: 12, heat_out_MW: 8, magazine: 200, bus_iface: "UJCN-M" },
  boat: { category: "docking", slot: "dock", mass_t: 5 },
};

const tables = {
  lookup(file: string, ref: string, column: string) {
    if (file === "propellants" && column === "density_kg_m3") {
      if (ref === "water") return { lookup: { value: 1000, provisional: false } };
      if (ref === "methane-liquid") return { lookup: { value: 422, provisional: true } };
    }
    return { error: `no row "${ref}"` };
  },
};

function advise(fields: Record<string, unknown>, extra: Partial<ShipContext> & { bus?: { mount_ifaces?: string[] } } = {}): Violation[] {
  const ship = readShip({ hull: "h", kind: "ship", ...fields });
  const ctx: ShipContext = { hull: readHull(hullFields), hullFields, module: (id) => MODULES[id], tables, ...extra };
  return shipAdvisories(ship, shipBudget(ship, ctx), { ...ctx, ...(extra.bus ? { bus: extra.bus } : {}) });
}

const find = (vs: Violation[], fragment: string) => vs.find((v) => v.message.includes(fragment));

describe("fit", () => {
  it("reports a fitting on a slot the hull does not have", () => {
    const v = find(advise({ fittings: [{ slot: "ghost", module: "gun" }] }), 'slot "ghost"');
    expect(v?.severity).toBe("error");
    expect(v?.domain).toBe("fit");
  });

  it("reports two fittings on one slot once, against the slot", () => {
    const vs = advise({ fittings: [{ slot: "gun-a", module: "gun" }, { slot: "gun-a", module: "gun" }] });
    const v = find(vs, "2 fittings are assigned");
    expect(v?.severity).toBe("error");
    expect(v?.anchor?.componentId).toBe("gun-a");
    expect(vs.filter((x) => x.message.includes("fittings are assigned"))).toHaveLength(1);
  });

  it("warns when a module meets a slot of a different kind", () => {
    const v = find(advise({ fittings: [{ slot: "rad-1", module: "gun" }] }), "radiator mount but carries a module built for a turret");
    expect(v?.severity).toBe("warn");
    expect(v?.anchor?.station).toBe(70);
  });

  it("warns when a module is built to an interface the hull's bus does not carry", () => {
    expect(find(advise({ fittings: [{ slot: "gun-a", module: "gun" }] }, { bus: { mount_ifaces: ["UJCN-S", "UJCN-L"] } }), "needs an adapter")).toBeDefined();
    // The same module on a bus that lists its interface is silent.
    expect(find(advise({ fittings: [{ slot: "gun-a", module: "gun" }] }, { bus: { mount_ifaces: ["UJCN-M"] } }), "needs an adapter")).toBeUndefined();
  });

  it("reports a manifest entry in a section the hull does not have, and one in none", () => {
    expect(find(advise({ manifest: [{ id: "r1", section: "nowhere", module: "reactor" }] }), 'section "nowhere"')?.severity).toBe("error");
    expect(find(advise({ manifest: [{ id: "r1", module: "reactor" }] }), "in no section")?.severity).toBe("warn");
  });

  it("checks the section's allowed list and its pressurisation", () => {
    expect(find(advise({ manifest: [{ id: "h1", section: "aft", module: "habitat" }] }), "allows reactor, drive")).toBeDefined();
    // Allowed there, but the section is not pressurised.
    const relaxed = { ...hullFields, sections: [{ id: "aft", x0: 50, x1: 100, allowed: ["habitat"] }] };
    const vs = advise({ manifest: [{ id: "h1", section: "aft", module: "habitat" }] }, { hull: readHull(relaxed), hullFields: relaxed });
    expect(find(vs, "not marked pressurised")).toBeDefined();
  });

  it("says when a module declares no volume, because the fit check then sees nothing", () => {
    const noVolume: Record<string, Record<string, unknown>> = { ...MODULES, blob: { category: "habitat", slot: "internal", mass_t: 1 } };
    const vs = advise({ manifest: [{ id: "b1", section: "forward", module: "blob" }] }, { module: (id) => noVolume[id] });
    expect(find(vs, "declares no volume")?.severity).toBe("info");
  });

  it("counts v1 loadout lines as unplaced, in one advisory rather than one each", () => {
    const vs = advise({ loadout: [{ module: "gun", count: 4, slot: "turret" }, { module: "reactor", count: 2, slot: "internal" }] });
    const v = find(vs, "not placed on a slot");
    expect(v?.severity).toBe("info");
    expect(v?.message).toContain("2 loadout lines (6 modules)");
  });
});

describe("volume", () => {
  it("trips when a section is overloaded, and names the overage", () => {
    // Forward is π·25·50 ≈ 3,927 m³; five 900 m³ habitats is 4,500.
    const v = find(advise({ manifest: [{ id: "h1", section: "forward", module: "habitat", count: 5 }] }), "over by");
    expect(v?.severity).toBe("error");
    expect(v?.domain).toBe("fit");
    expect(v?.anchor?.componentId).toBe("forward");
  });

  it("stays quiet when the manifest fits", () => {
    expect(find(advise({ manifest: [{ id: "h1", section: "forward", module: "habitat", count: 4 }] }), "over by")).toBeUndefined();
  });
});

describe("thermal — the acceptance criterion", () => {
  const withReactor = { manifest: [{ id: "r1", section: "aft", module: "reactor", count: 1 }] };

  it("is quiet with the radiator fitted and trips as soon as it is removed", () => {
    const cooled = advise({ ...withReactor, fittings: [{ slot: "rad-1", module: "radiator" }] });
    expect(cooled.filter((v) => v.domain === "thermal" && v.severity === "error")).toEqual([]);
    const stripped = advise(withReactor);
    const v = find(stripped, "high-temperature");
    expect(v?.severity).toBe("error");
    expect(v?.message).toContain("short by 100 MW");
  });

  it("catches a ship that can cool its reactor but not its crew", () => {
    const vs = advise({
      manifest: [
        { id: "r1", section: "aft", module: "reactor" },
        { id: "h1", section: "forward", module: "habitat" },
      ],
      fittings: [{ slot: "rad-1", module: "radiator" }],
    });
    // 400 MW at 1,200 K rejects the reactor easily and cannot touch the 4 MW
    // the habitat sheds at 300 K.
    expect(find(vs, "low-temperature")?.severity).toBe("error");
    expect(find(vs, "high-temperature")).toBeUndefined();
  });

  it("is satisfied when the low-temperature array is added", () => {
    const vs = advise({
      manifest: [
        { id: "r1", section: "aft", module: "reactor" },
        { id: "h1", section: "forward", module: "habitat" },
      ],
      fittings: [
        { slot: "rad-1", module: "radiator" },
        { slot: "gun-a", module: "coldRadiator" },
      ],
    });
    expect(vs.filter((v) => v.domain === "thermal" && v.severity === "error")).toEqual([]);
  });

  it("scopes a mode-only deficit to that mode", () => {
    const vs = advise({
      ...withReactor,
      fittings: [{ slot: "rad-1", module: "radiator" }],
      modes: [
        { id: "cruise", name: "Cruise", duties: [] },
        { id: "emcon", name: "EMCON", duties: [{ component: "rad-1", duty: "off" }] },
      ],
    });
    const v = find(vs, "high-temperature");
    expect(v?.mode).toBe("emcon");
    expect(v?.severity).toBe("error");
  });
});

describe("power", () => {
  it("errors on a deficit and warns on a margin under 5%", () => {
    const thirsty: Record<string, Record<string, unknown>> = { ...MODULES, hog: { category: "sensor", slot: "turret", mass_t: 1, power_in_MW: 60 } };
    const vs = advise({ manifest: [{ id: "r1", section: "aft", module: "reactor" }], fittings: [{ slot: "gun-a", module: "hog" }] }, { module: (id) => thirsty[id] });
    expect(find(vs, "short by 10 MW")?.severity).toBe("error");

    const thin: Record<string, Record<string, unknown>> = { ...MODULES, near: { category: "sensor", slot: "turret", mass_t: 1, power_in_MW: 48 } };
    const vs2 = advise({ manifest: [{ id: "r1", section: "aft", module: "reactor" }], fittings: [{ slot: "gun-a", module: "near" }] }, { module: (id) => thin[id] });
    expect(find(vs2, "power margin")?.severity).toBe("warn");
  });
});

describe("propulsion", () => {
  it("warns when a ship carrying modules has no drive", () => {
    expect(find(advise({ manifest: [{ id: "r1", section: "aft", module: "reactor" }] }), "No drive module")?.severity).toBe("warn");
  });

  it("errors when a drive burns something no tank carries", () => {
    const methane: Record<string, Record<string, unknown>> = { ...MODULES, mdrive: { category: "drive", slot: "drive", mass_t: 10, thrust_kN: 100, isp_s: 380, propellant: "methane-liquid" } };
    const vs = advise({ fittings: [{ slot: "drive", module: "mdrive" }], tanks: [{ id: "t1", propellant: "water", volume_m3: 100 }] }, { module: (id) => methane[id] });
    const v = find(vs, 'burns "methane-liquid"');
    expect(v?.severity).toBe("error");
    expect(v?.domain).toBe("deltav");
  });

  it("only says a drive names a propellant in prose, rather than calling it wrong fuel", () => {
    // "uranium tetrabromide brine (20% enriched)" is not a propellants-table
    // row. That is a vocabulary gap, not a ship that cannot fly.
    const prose: Record<string, Record<string, unknown>> = {
      ...MODULES,
      brine: { category: "drive", slot: "drive", mass_t: 10, thrust_kN: 100, isp_s: 6700, propellant: "uranium tetrabromide brine (20% enriched)" },
    };
    const vs = advise({ fittings: [{ slot: "drive", module: "brine" }], tanks: [{ id: "t1", propellant: "water", volume_m3: 100 }] }, { module: (id) => prose[id] });
    const v = find(vs, "names its propellant as");
    expect(v?.severity).toBe("info");
    expect(vs.filter((x) => x.severity === "error" && x.domain === "deltav")).toEqual([]);
  });

  it("is quiet when the tank carries what the drive burns", () => {
    const vs = advise({ fittings: [{ slot: "drive", module: "drive" }], tanks: [{ id: "t1", propellant: "water", volume_m3: 100 }] });
    expect(find(vs, "which no tank")).toBeUndefined();
  });

  it("warns when the loaded propellant exceeds tank capacity", () => {
    expect(find(advise({ propellant_t: 5000, fittings: [{ slot: "drive", module: "drive" }] }), "exceeds tank capacity")).toBeUndefined();
    const withCapacity: Record<string, Record<string, unknown>> = { ...MODULES, smallTank: { category: "tank", slot: "external", mass_t: 2, propellant_capacity_t: 10 } };
    const vs = advise({ propellant_t: 5000, manifest: [{ id: "t", section: "aft", module: "smallTank" }] }, { module: (id) => withCapacity[id] });
    expect(find(vs, "exceeds tank capacity")?.severity).toBe("warn");
  });

  it("errors when a tank is loaded beyond its own tankage", () => {
    const tanks: Record<string, Record<string, unknown>> = { ...MODULES, can: { category: "tank", slot: "external", mass_t: 2, volume_m3: 100 } };
    const vs = advise({ tanks: [{ id: "t1", module: "can", propellant: "water", volume_m3: 400 }] }, { module: (id) => tanks[id] });
    expect(find(vs, "its tankage holds")?.severity).toBe("error");
  });
});

describe("balance", () => {
  /**
   * A tapered stern, with no structure mass to balance the mounts. The
   * advisory is deliberately conservative — it fires only where the geometry
   * makes trimming impossible, because what counts as "too much gimbal" is a
   * figure no table in the vault supplies. So the case that trips it is a drive
   * on a narrow tail with the mass out on the wide part of the hull.
   */
  const tail = {
    ...hullFields,
    structural_mass_t: 0,
    spine: {
      length_m: 100,
      beam_m: 10,
      datum: "bow",
      stations: [
        { x: 0, half_height_m: 5 },
        { x: 90, half_height_m: 5 },
        { x: 100, half_height_m: 1 },
      ],
    },
  };

  it("warns when the thrust line cannot be trimmed onto the centre of gravity", () => {
    const vs = advise({ fittings: [{ slot: "gun-a", module: "gun" }, { slot: "drive", module: "drive" }] }, { hull: readHull(tail), hullFields: tail });
    const v = find(vs, "off the thrust line");
    expect(v?.severity).toBe("warn");
    expect(v?.domain).toBe("mass");
  });

  it("is quiet once the mount is mirrored", () => {
    const vs = advise(
      { fittings: [{ slot: "gun-a", module: "gun" }, { slot: "gun-b", module: "gun" }, { slot: "drive", module: "drive" }] },
      { hull: readHull(tail), hullFields: tail },
    );
    expect(find(vs, "off the thrust line")).toBeUndefined();
  });

  it("reports the gimbal angle the offset would need, without judging it", () => {
    const ship = readShip({ hull: "h", fittings: [{ slot: "gun-a", module: "gun" }, { slot: "drive", module: "drive" }] });
    const b = shipBudget(ship, { hull: readHull(tail), hullFields: tail, module: (id) => MODULES[id] });
    expect(b.thrustOffset_m).toBeGreaterThan(0);
    expect(b.gimbalRequired_deg).toBeCloseTo((Math.atan(b.thrustOffset_m / Math.abs(100 - (b.cgStation_m as number))) * 180) / Math.PI, 9);
  });
});

describe("magazines", () => {
  it("warns when the mix exceeds the launcher's capacity", () => {
    const vs = advise({ fittings: [{ slot: "gun-a", module: "gun", magazine: [{ munition: "450mm-ap", rounds: 150 }, { munition: "450mm-he", rounds: 100 }] }] });
    const v = find(vs, "250 rounds against a magazine of 200");
    expect(v?.severity).toBe("warn");
  });

  it("is quiet within capacity, and says so when there is no capacity to check against", () => {
    expect(find(advise({ fittings: [{ slot: "gun-a", module: "gun", magazine: [{ munition: "450mm-ap", rounds: 200 }] }] }), "against a magazine")).toBeUndefined();
    const vs = advise({ fittings: [{ slot: "rad-1", module: "radiator", magazine: [{ munition: "450mm-ap", rounds: 10 }] }] });
    expect(find(vs, "declares no magazine capacity")?.severity).toBe("info");
  });
});

describe("degenerate records", () => {
  it("says the one useful thing when a craft names no hull", () => {
    const ship = readShip({ kind: "ship", loadout: [{ module: "reactor", count: 1 }] });
    const vs = shipAdvisories(ship, shipBudget(ship, { module: (id) => MODULES[id] }), { module: (id) => MODULES[id] });
    expect(vs).toHaveLength(1);
    expect(vs[0]?.message).toContain("names no hull");
  });

  it("says the one useful thing when the hull has been deleted", () => {
    const ship = readShip({ kind: "ship", hull: "gone" });
    const vs = shipAdvisories(ship, shipBudget(ship, {}), {});
    expect(vs).toHaveLength(1);
    expect(vs[0]?.severity).toBe("error");
    expect(vs[0]?.message).toContain("not in the vault");
  });

  it("reports an out-of-range watch factor against the authored value", () => {
    expect(find(advise({ watch_factor: 12 }), "outside the 1–3")).toBeDefined();
  });
});
