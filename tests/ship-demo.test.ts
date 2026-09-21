/**
 * Editor 2's acceptance criteria (`gallery/07` §3), against the demo vault
 * rather than a fixture.
 *
 *   "a hull carries three loadout variants with visibly different silhouettes;
 *    removing radiators trips the thermal advisory; overloading tanks trips
 *    volume and CG."
 *
 * A fixture can be shaped to make a check pass. These three ships are the ones
 * the app actually opens, built from the same presets a user starts from, so
 * the test fails if the presets drift out from under the kernel — which is
 * exactly how the v1-preset hull bug got past editor 1's unit tests.
 */
import { describe, it, expect } from "vitest";
import { MemoryAdapter } from "../src/core/storage/memory";
import { Repository } from "../src/core/repo";
import { demoVault } from "../src/ui/demo";
import { analyseShip, type ShipAnalysis } from "../src/core/designer/ship";
import { writeShip } from "../src/core/designer/ship/record";
import { isNote, type TypedRecord } from "../src/core/types";

async function vault() {
  const fs = new MemoryAdapter();
  await demoVault(fs);
  const repo = new Repository(fs);
  await repo.load();
  const source = { typed: (id: string) => repo.typed(id), tables: repo.tables, values: repo.effectiveConstraints().values };
  const halberds = repo
    .ofType("craft")
    .map((lr) => lr.record)
    .filter((r): r is TypedRecord => !isNote(r) && r.name.startsWith("Halberd"))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { repo, source, halberds, analyse: (c: TypedRecord) => analyseShip(c, source) };
}

const errorsIn = (a: ShipAnalysis, domain: string) => a.advisories.filter((v) => v.severity === "error" && v.domain === domain);

describe("three loadouts on one hull", () => {
  it("are all built on the same hull", async () => {
    const { halberds } = await vault();
    expect(halberds).toHaveLength(3);
    expect(new Set(halberds.map((c) => c.fields.hull)).size).toBe(1);
  });

  it("draw three visibly different silhouettes", async () => {
    const { halberds, analyse } = await vault();
    const drawings = halberds.map((c) => JSON.stringify(analyse(c).silhouette?.parts));
    expect(new Set(drawings).size).toBe(3);
    for (const d of drawings) expect(d.length).toBeGreaterThan(100);
  });

  it("leave different slots empty, which is what makes them read as different ships", async () => {
    const { halberds, analyse } = await vault();
    const empty = halberds.map((c) => analyse(c).silhouette?.emptySlots.join(","));
    expect(new Set(empty).size).toBeGreaterThan(1);
  });

  it("carry a Δv, and say it rests on a provisional density", async () => {
    const { halberds, analyse } = await vault();
    for (const craft of halberds) {
      const { budget } = analyse(craft);
      expect(budget.deltaV_kms, craft.name).toBeGreaterThan(1);
      // `_tables/propellants.yaml` is unverified top to bottom, and every
      // figure downstream of it has to say so.
      expect(budget.provisional.join(" "), craft.name).toContain("propellant mass, wet mass, Δv");
    }
  });

  it("stage: the drop tank goes first and takes its tankage with it", async () => {
    const { halberds, analyse } = await vault();
    const { budget } = analyse(halberds[0] as TypedRecord);
    expect(budget.stages).toHaveLength(2);
    expect(budget.stages[0]?.order).toBe(1);
    expect(budget.stages[0]?.tanks).toEqual(["drop"]);
    expect(budget.stages[1]?.order).toBe(0);
    expect(budget.stages[1]?.m0_t).toBeLessThan(budget.stages[0]?.mf_t as number);
  });

  it("budget cleanly except for the fit that is meant not to", async () => {
    const { halberds, analyse } = await vault();
    const byName = new Map(halberds.map((c) => [c.name, analyse(c)]));
    for (const [name, a] of byName) {
      if (name.includes("DDL")) continue;
      expect(a.advisories.filter((v) => v.severity === "error"), name).toEqual([]);
    }
    // The experimental fit: two beam turrets on a hull sized for guns. It
    // cruises and it cannot fight.
    const ddl = byName.get("Halberd-class (DDL)") as ShipAnalysis;
    expect(errorsIn(ddl, "power").map((v) => v.mode)).toContain("combat");
    expect(errorsIn(ddl, "thermal").map((v) => v.mode)).toContain("combat");
    expect(errorsIn(ddl, "power").map((v) => v.mode)).not.toContain("cruise");
    expect(errorsIn(ddl, "thermal").map((v) => v.mode)).not.toContain("cruise");
  });
});

describe("the advisories the acceptance criteria name", () => {
  it("trips thermal when the radiators come off", async () => {
    const { halberds, analyse } = await vault();
    const craft = halberds[0] as TypedRecord;
    const before = analyse(craft);
    expect(errorsIn(before, "thermal")).toEqual([]);

    const ship = before.ship;
    const stripped: TypedRecord = { ...craft, fields: writeShip(craft.fields, { ...ship, fittings: ship.fittings.filter((f) => !f.slot.startsWith("rad-")) }) };
    const after = analyse(stripped);
    expect(errorsIn(after, "thermal").length).toBeGreaterThan(0);
    expect(after.advisories.map((v) => v.message).join(" ")).toContain("high-temperature");
  });

  it("trips volume, and throws the thrust line off, when the tanks are overfilled", async () => {
    const { halberds, analyse } = await vault();
    const craft = halberds[0] as TypedRecord;
    const before = analyse(craft);
    const overloaded: TypedRecord = {
      ...craft,
      fields: writeShip(craft.fields, {
        ...before.ship,
        // Ten times the integral load, twenty times the drop tank, so the
        // heaviest thing on the ship ends up hanging off one hardpoint.
        tanks: before.ship.tanks.map((t) => (t.slot ? { ...t, volume_m3: t.volume_m3 * 20 } : { ...t, volume_m3: t.volume_m3 * 10 })),
      }),
    };
    const after = analyse(overloaded);
    expect(after.advisories.map((v) => v.message).join(" | ")).toContain("over by");

    // The drop tank is a **collar** of four, spaced about the axis, so filling
    // it twenty times over does not pull the ship off its thrust line — it
    // actually pulls the line straighter, because balanced mass dilutes the
    // dorsal guns and ventral radiators that were skewing it. That is the
    // 2026-09-20 ruling working: only one heavy tank on top needs ballast.
    expect(after.budget.thrustOffset_m).toBeLessThan(before.budget.thrustOffset_m);

    // Put the same propellant in a single barrel on the same hardpoint and it
    // does move, by a lot.
    const lopsided = analyse({
      ...craft,
      fields: writeShip(craft.fields, {
        ...before.ship,
        tanks: before.ship.tanks.map((t) => (t.slot ? { ...t, count: 1, volume_m3: t.volume_m3 * 20 } : t)),
      }),
    } as TypedRecord);
    expect(lopsided.budget.thrustOffset_m).toBeGreaterThan(after.budget.thrustOffset_m * 5);
    expect(lopsided.budget.gimbalRequired_deg).toBeGreaterThan(5);
    // Whether that much gimbal is available is a design figure the vault does
    // not supply, so the budget states the requirement and asserts nothing.
    expect(lopsided.budget.assumptions.join(" ")).toContain("max_gimbal_deg");
    expect(lopsided.advisories.filter((v) => v.domain === "mass")).toEqual([]);
  });

  it("does assert it once a constraint set says how far the drive can vector", async () => {
    const { halberds, source } = await vault();
    const craft = halberds[0] as TypedRecord;
    const strict = { ...source, values: { ...source.values, max_gimbal_deg: 0.1 } };
    const a = analyseShip(craft, strict);
    const v = a.advisories.find((x) => x.domain === "mass");
    expect(v?.severity).toBe("warn");
    expect(v?.message).toContain("of gimbal");
    expect(a.budget.assumptions.join(" ")).not.toContain("max_gimbal_deg");
  });

  it("silences every emitter in EMCON", async () => {
    const { halberds, analyse } = await vault();
    for (const craft of halberds) {
      const { budget } = analyse(craft);
      const emcon = budget.modes.find((m) => m.id === "emcon");
      const combat = budget.modes.find((m) => m.id === "combat");
      expect(emcon?.radiated_kw, craft.name).toBe(0);
      expect(combat?.radiated_kw, craft.name).toBeGreaterThan(0);
    }
  });
});

describe("the vault as a whole", () => {
  it("has no craft whose analysis throws, whatever shape its record is in", async () => {
    const { repo, source } = await vault();
    for (const lr of repo.ofType("craft")) {
      const craft = lr.record;
      if (isNote(craft)) continue;
      expect(() => analyseShip(craft, source), craft.name).not.toThrow();
    }
  });

  it("round-trips every craft's loadout through the writer unchanged", async () => {
    const { repo, source } = await vault();
    for (const lr of repo.ofType("craft")) {
      const craft = lr.record;
      if (isNote(craft)) continue;
      const a = analyseShip(craft, source);
      const again = analyseShip({ ...craft, fields: writeShip(craft.fields, a.ship) }, source);
      expect(again.ship, craft.name).toEqual(a.ship);
      expect(again.budget.dryMass_t, craft.name).toBe(a.budget.dryMass_t);
    }
  });
});
