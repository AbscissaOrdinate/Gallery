/**
 * The craft record ↔ ship loadout coercion.
 *
 * Same contract as the hull reader: a record hand-edited in YAML, half-migrated
 * or typed into mid-thought has to budget rather than throw, and reading it
 * must never change what is on disk.
 */
import { describe, it, expect } from "vitest";
import { readShip, writeShip, componentIds } from "../src/core/designer/ship/record";
import { modeTemplates, dutyFor, dutyDraw, FULL_MODE } from "../src/core/designer/ship/modes";
import { readModule } from "../src/core/designer/ship/module";

describe("readShip", () => {
  it("reads an empty record without inventing anything", () => {
    const ship = readShip({});
    expect(ship.fittings).toEqual([]);
    expect(ship.manifest).toEqual([]);
    expect(ship.tanks).toEqual([]);
    expect(ship.unplaced).toEqual([]);
    expect(ship.modes).toEqual([]);
    expect(ship.hull).toBeUndefined();
    expect(ship.watch_sections).toBe(1);
    expect(ship.watches_manned).toBe(1);
    expect(ship.propellant_t).toBe(0);
  });

  it("coerces numbers written as strings rather than producing NaN", () => {
    const ship = readShip({
      tanks: [{ id: "t1", volume_m3: "400", jettison_order: "2" }],
      manifest: [{ id: "m1", count: "3" }],
      propellant_t: "120",
      watch_sections: "3",
      watches_manned: "2",
    });
    expect(ship.tanks[0]?.volume_m3).toBe(400);
    expect(ship.tanks[0]?.jettison_order).toBe(2);
    expect(ship.manifest[0]?.count).toBe(3);
    expect(ship.propellant_t).toBe(120);
    expect(ship.watch_sections).toBe(3);
    expect(ship.watches_manned).toBe(2);
  });

  it("gives an unnamed entry a positional id so a view can key on it", () => {
    const ship = readShip({ manifest: [{ module: "m" }, { id: "", module: "m" }], tanks: [{}] });
    expect(ship.manifest.map((m) => m.id)).toEqual(["item-1", "item-2"]);
    expect(ship.tanks[0]?.id).toBe("tank-1");
  });

  it("keeps two fittings on one slot distinguishable instead of merging them", () => {
    // The collision is an advisory, not a silent fix — but the view still needs
    // distinct keys, and the silhouette still has to pick one.
    const ship = readShip({ fittings: [{ slot: "gun-a", module: "x" }, { slot: "gun-a", module: "y" }] });
    expect(ship.fittings.map((f) => f.slot)).toEqual(["gun-a", "gun-a#2"]);
  });

  it("clamps a watch bill that cannot be stood, and keeps what was authored", () => {
    // More sections manned than exist would make the complement smaller than
    // the people standing in it.
    const over = readShip({ watch_sections: 3, watches_manned: 5 });
    expect(over.watches_manned).toBe(3);
    expect(over.watch_authored).toEqual({ sections: 3, manned: 5 });
    const none = readShip({ watch_sections: -1, watches_manned: 0 });
    expect([none.watch_sections, none.watches_manned]).toEqual([1, 1]);
  });

  it("converts a pre-ruling `watch_factor` into the bill it was standing in for", () => {
    // A bare factor of 3 meant "three watches"; under the 2026-09-20 ruling
    // that is three sections with two of them manned.
    const ship = readShip({ watch_factor: 3 });
    expect([ship.watch_sections, ship.watches_manned]).toEqual([3, 2]);
    expect(readShip({ watch_factor: 1 }).watch_sections).toBe(1);
  });

  it("drops a magazine entry that names no munition, and rounds the count", () => {
    const ship = readShip({ fittings: [{ slot: "a", magazine: [{ munition: "450mm-ap", rounds: 120.6 }, { rounds: 5 }] }] });
    expect(ship.fittings[0]?.magazine).toEqual([{ munition: "450mm-ap", rounds: 121 }]);
  });

  it("reads a v1 loadout as unplaced lines, keeping the slot kind", () => {
    const ship = readShip({
      loadout: [
        { module: "drive-1", count: 1, slot: "drive" },
        { module: "rad-1", count: 4, slot: "radiator" },
        { count: 2 }, // no module: nothing to count
      ],
    });
    expect(ship.unplaced).toHaveLength(2);
    expect(ship.unplaced[0]).toEqual({ id: "line-1", module: "drive-1", count: 1, slot_type: "drive" });
    expect(ship.unplaced[1]?.count).toBe(4);
  });
});

describe("duties", () => {
  it("reads the authored list form and the hand-written mapping form alike", () => {
    const asList = readShip({ modes: [{ id: "cruise", name: "Cruise", duties: [{ component: "gun-a", duty: "off" }, { component: "rad-1", duty: "0.5" }] }] });
    const asMap = readShip({ modes: [{ id: "cruise", name: "Cruise", duties: { "gun-a": "off", "rad-1": 0.5 } }] });
    expect(asList.modes[0]?.duties).toEqual({ "gun-a": "off", "rad-1": 0.5 });
    expect(asMap.modes[0]?.duties).toEqual(asList.modes[0]?.duties);
  });

  it("drops a duty it cannot parse rather than coercing it to full", () => {
    // A typo silently becoming `full` would quietly change a power budget.
    const ship = readShip({ modes: [{ id: "m", duties: [{ component: "a", duty: "ful" }, { component: "b", duty: "off" }] }] });
    expect(ship.modes[0]?.duties).toEqual({ b: "off" });
  });

  it("clamps a fraction into 0–1", () => {
    const ship = readShip({ modes: [{ id: "m", duties: [{ component: "a", duty: 4 }, { component: "b", duty: -2 }] }] });
    expect(ship.modes[0]?.duties).toEqual({ a: 1, b: 0 });
  });

  it("runs anything a mode does not name at full", () => {
    const mode = { id: "m", name: "M", duties: { a: "off" as const } };
    expect(dutyFor(mode, "a")).toBe("off");
    expect(dutyFor(mode, "b")).toBe("full");
    expect(dutyFor(undefined, "b")).toBe("full");
    expect(dutyFor(FULL_MODE, "anything")).toBe("full");
  });
});

describe("dutyDraw", () => {
  const spec = readModule({ power_in_MW: 10, power_standby_MW: 1.5 });
  const noStandby = readModule({ power_in_MW: 10 });

  it("scales a fraction and honours a declared standby draw", () => {
    expect(dutyDraw(spec, "full").draw_MW).toBe(10);
    expect(dutyDraw(spec, 0.25).draw_MW).toBe(2.5);
    expect(dutyDraw(spec, "off").draw_MW).toBe(0);
    expect(dutyDraw(spec, "standby").draw_MW).toBe(1.5);
  });

  it("budgets standby as off when the module declares no standby draw, and says so", () => {
    const draw = dutyDraw(noStandby, "standby");
    expect(draw.draw_MW).toBe(0);
    expect(draw.standbyUnknown).toBe(true);
    // A module that draws nothing anyway has no ambiguity to report.
    expect(dutyDraw(readModule({}), "standby").standbyUnknown).toBe(false);
  });
});

describe("modeTemplates", () => {
  const components = [
    { id: "gun-a", spec: readModule({ category: "weapon-kinetic" }) },
    { id: "pd-p", spec: readModule({ category: "point-defense" }) },
    { id: "radar", spec: readModule({ category: "sensor", radiated_power_kw: 4100 }) },
    { id: "eo", spec: readModule({ category: "sensor" }) },
    { id: "rad-1", spec: readModule({ category: "radiator" }) },
  ];

  it("seeds three modes with the guns cold in cruise and hot in combat", () => {
    const [cruise, combat, emcon] = modeTemplates(components);
    expect(cruise?.duties["gun-a"]).toBe("off");
    expect(cruise?.duties["pd-p"]).toBe("standby");
    expect(combat?.duties["gun-a"]).toBeUndefined(); // unnamed is full
    expect(emcon).toBeDefined();
  });

  it("silences emitters in EMCON by what they radiate, not by category", () => {
    const emcon = modeTemplates(components)[2];
    // Both are `sensor`. Only the one that radiates goes off.
    expect(emcon?.duties.radar).toBe("off");
    expect(emcon?.duties.eo).toBeUndefined();
  });

  it("leaves radiators running in every template", () => {
    for (const mode of modeTemplates(components)) expect(mode.duties["rad-1"]).toBeUndefined();
  });
});

describe("writeShip", () => {
  it("round-trips a loadout and keeps fields it does not own", () => {
    const fields = {
      hull: "h1",
      kind: "ship",
      role: "railgun destroyer",
      watch_factor: 3,
      fittings: [{ slot: "gun-a", module: "m1", magazine: [{ munition: "450mm-ap", rounds: 120 }] }],
      manifest: [{ id: "r1", section: "engineering", module: "m2", count: 2 }],
      tanks: [{ id: "t1", section: "midships", module: "m3", propellant: "water", volume_m3: 400, jettison_order: 0 }],
      modes: [{ id: "cruise", name: "Cruise", duties: [{ component: "gun-a", duty: "off" }] }],
    };
    const out = writeShip(fields, readShip(fields));
    expect(out.role).toBe("railgun destroyer");
    expect(out.fittings).toEqual(fields.fittings);
    expect(out.manifest).toEqual(fields.manifest);
    expect(out.tanks).toEqual(fields.tanks);
    expect(out.modes).toEqual(fields.modes);
    expect(readShip(out)).toEqual(readShip(fields));
  });

  it("removes a list that has been emptied rather than writing []", () => {
    const out = writeShip({ fittings: [{ slot: "a" }] }, readShip({}));
    expect("fittings" in out).toBe(false);
  });

  it("lists every component a mode can carry a duty for", () => {
    const ship = readShip({
      fittings: [{ slot: "gun-a" }],
      manifest: [{ id: "r1" }],
      tanks: [{ id: "t1" }],
      loadout: [{ module: "m", count: 1 }],
    });
    expect(componentIds(ship)).toEqual(["gun-a", "r1", "line-1", "t1"]);
  });
});
