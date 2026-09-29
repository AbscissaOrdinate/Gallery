/**
 * The ship's silhouette.
 *
 * Editor 1 draws a hull's slots; editor 2 draws what is bolted into them. The
 * acceptance criterion for this half (`gallery/07` §3) is that three loadouts
 * on one hull read as three different ships, which needs three things to hold:
 * an empty slot draws nothing, the fitted module decides the part, and the
 * weapon's own scale reaches the drawing.
 */
import { describe, it, expect } from "vitest";
import { shipSilhouette, fittedWeapon } from "../src/core/designer/ship/silhouette";
import { readModule } from "../src/core/designer/ship/module";
import { readShip } from "../src/core/designer/ship/record";
import { readHull } from "../src/core/designer/hull/record";
import { slotIdOf } from "../src/core/designer/hull/parts";

const hull = readHull({
  spine: {
    length_m: 100,
    beam_m: 10,
    datum: "bow",
    stations: [
      { x: 0, half_height_m: 5 },
      { x: 100, half_height_m: 5 },
    ],
  },
  external_slots: [
    { id: "gun-a", x: 20, theta_deg: 0, type: "turret", size: "M" },
    { id: "gun-b", x: 30, theta_deg: 0, type: "turret", size: "M" },
    { id: "cells", x: 40, theta_deg: 0, type: "turret", size: "L" },
    { id: "rad-1", x: 70, theta_deg: 180, type: "radiator", size: "L" },
    { id: "spare", x: 50, theta_deg: 0, type: "external", size: "M" },
  ],
});

const MODULES: Record<string, Record<string, unknown>> = {
  bigGun: { category: "weapon-kinetic", slot: "turret", mass_t: 30, bore_mm: 450, barrels: 2 },
  smallGun: { category: "weapon-kinetic", slot: "turret", mass_t: 12, bore_mm: 120, barrels: 1 },
  rockets: { category: "weapon-kinetic", slot: "turret", mass_t: 10, weapon_family: "rocket" },
  vls: { category: "weapon-missile", slot: "turret", mass_t: 20, launch_cells: 32 },
  laser: { category: "weapon-laser", slot: "turret", mass_t: 25 },
  radiator: { category: "radiator", slot: "radiator", mass_t: 12 },
  radar: { category: "sensor", slot: "sensor", mass_t: 7 },
  nonsense: { category: "weapon-kinetic", slot: "turret", mass_t: 5, weapon_family: "trebuchet" },
};

const silhouette = (fields: Record<string, unknown>) => shipSilhouette(hull, readShip({ hull: "h", ...fields }), { module: (id) => MODULES[id] });

describe("fittedWeapon", () => {
  it("takes the family from the category where the category decides it", () => {
    expect(fittedWeapon(readModule(MODULES.laser as Record<string, unknown>))?.weapon).toBe("laser");
    expect(fittedWeapon(readModule(MODULES.vls as Record<string, unknown>))?.weapon).toBe("cell");
    expect(fittedWeapon(readModule({ category: "point-defense" }))?.weapon).toBe("ciws");
  });

  it("lets a module override it, because one category covers shapes that differ", () => {
    // A railgun, a rocket bundle and a one-armed bandit are all weapon-kinetic
    // and do not look alike.
    expect(fittedWeapon(readModule(MODULES.rockets as Record<string, unknown>))?.weapon).toBe("rocket");
    expect(fittedWeapon(readModule(MODULES.bigGun as Record<string, unknown>))?.weapon).toBe("gun");
  });

  it("ignores a family with no generator behind it rather than drawing nothing", () => {
    expect(fittedWeapon(readModule(MODULES.nonsense as Record<string, unknown>))?.weapon).toBe("gun");
  });

  it("carries the scale figures through, and leaves out the ones not declared", () => {
    expect(fittedWeapon(readModule(MODULES.bigGun as Record<string, unknown>))).toEqual({ weapon: "gun", bore_mm: 450, barrels: 2 });
    expect(fittedWeapon(readModule(MODULES.vls as Record<string, unknown>))).toEqual({ weapon: "cell", cells: 32 });
  });

  it("is undefined for anything that is not a weapon", () => {
    expect(fittedWeapon(readModule(MODULES.radiator as Record<string, unknown>))).toBeUndefined();
  });
});

describe("shipSilhouette", () => {
  it("draws nothing for an empty slot and lists it as empty", () => {
    const bare = silhouette({});
    expect(bare.parts).toEqual([]);
    expect(bare.emptySlots).toEqual(["gun-a", "gun-b", "cells", "rad-1", "spare"]);
  });

  it("draws only what is fitted", () => {
    const one = silhouette({ fittings: [{ slot: "gun-a", module: "bigGun" }] });
    expect(new Set(one.parts.map((p) => slotIdOf(p.id)))).toEqual(new Set(["gun-a"]));
    expect(one.emptySlots).not.toContain("gun-a");
  });

  it("gives three loadouts on one hull three different drawings", () => {
    const guns = silhouette({ fittings: [{ slot: "gun-a", module: "bigGun" }, { slot: "gun-b", module: "bigGun" }] });
    const missiles = silhouette({ fittings: [{ slot: "cells", module: "vls" }] });
    const beams = silhouette({ fittings: [{ slot: "gun-a", module: "laser" }, { slot: "cells", module: "laser" }] });
    const shapes = [guns, missiles, beams].map((s) => JSON.stringify(s.parts));
    expect(new Set(shapes).size).toBe(3);
    expect(guns.parts.length).toBeGreaterThan(0);
    expect(missiles.parts.length).toBeGreaterThan(0);
  });

  it("scales a gun by its bore and barrel count", () => {
    const big = silhouette({ fittings: [{ slot: "gun-a", module: "bigGun" }] });
    const small = silhouette({ fittings: [{ slot: "gun-a", module: "smallGun" }] });
    // Same slot, same size class, same family: only the weapon's own scale differs.
    expect(JSON.stringify(big.parts)).not.toBe(JSON.stringify(small.parts));
    expect(big.parts.length).toBeGreaterThan(small.parts.length); // two barrels, not one
  });

  it("lets the fitted module decide the part where the slot type does not", () => {
    // A bare `external` slot has no appearance of its own; a radar in it does.
    const withRadar = silhouette({ fittings: [{ slot: "spare", module: "radar" }] });
    expect(withRadar.parts.map((p) => p.kind)).toContain("radar");
    const withRadiator = silhouette({ fittings: [{ slot: "spare", module: "radiator" }] });
    expect(withRadiator.parts.map((p) => p.kind)).toContain("radiator");
  });

  it("keeps the hull's own part override above what the module would give", () => {
    // A captured hull carrying a foreign fitting: the author said so explicitly.
    const overridden = readHull({
      ...{ spine: { length_m: 100, beam_m: 10, datum: "bow", stations: [{ x: 0, half_height_m: 5 }, { x: 100, half_height_m: 5 }] } },
      external_slots: [{ id: "gun-a", x: 20, theta_deg: 0, type: "turret", size: "M", part: "antenna" }],
    });
    const parts = shipSilhouette(overridden, readShip({ hull: "h", fittings: [{ slot: "gun-a", module: "bigGun" }] }), { module: (id) => MODULES[id] }).parts;
    expect(parts.map((p) => p.kind)).toContain("antenna");
  });

  it("mirrors a radiator array and nothing else", () => {
    const s = silhouette({ fittings: [{ slot: "rad-1", module: "radiator" }, { slot: "gun-a", module: "bigGun" }] });
    for (const p of s.parts) expect(p.mirror).toBe(p.kind === "radiator" ? "vertical" : "none");
  });

  it("draws one fitting on a doubled slot rather than overprinting two", () => {
    const s = silhouette({ fittings: [{ slot: "gun-a", module: "bigGun" }, { slot: "gun-a", module: "laser" }] });
    expect(new Set(s.parts.map((p) => slotIdOf(p.id)))).toEqual(new Set(["gun-a"]));
  });

  it("draws a fitting whose module is missing as the slot's own part, not as nothing", () => {
    // The advisory kernel reports the dangling reference; the drawing should
    // still show that the slot is occupied.
    const s = silhouette({ fittings: [{ slot: "gun-a", module: "ghost" }] });
    expect(s.parts.map((p) => p.kind)).toContain("turret");
    expect(s.emptySlots).not.toContain("gun-a");
  });
});

describe("radiators drawn to what they reject", () => {
  const RADS: Record<string, Record<string, unknown>> = {
    big: { category: "radiator", slot: "radiator", mass_t: 18, heat_reject_MW: 120 },
    small: { category: "radiator", slot: "radiator", mass_t: 11, heat_reject_MW: 12 },
    same: { category: "radiator", slot: "radiator", mass_t: 18, heat_reject_MW: 120 },
    mute: { category: "radiator", slot: "radiator", mass_t: 5 },
  };
  const twoSlot = readHull({
    spine: { length_m: 100, beam_m: 10, datum: "bow", stations: [{ x: 0, half_height_m: 5 }, { x: 100, half_height_m: 5 }] },
    external_slots: [
      { id: "r1", x: 40, theta_deg: 180, type: "radiator", size: "L" },
      { id: "r2", x: 60, theta_deg: 180, type: "radiator", size: "L" },
    ],
  });
  const draw = (a: string, b: string) =>
    shipSilhouette(twoSlot, readShip({ hull: "h", fittings: [{ slot: "r1", module: a }, { slot: "r2", module: b }] }), { module: (id) => RADS[id] });

  /** Bounding-box area of every piece belonging to one slot. */
  const extent = (s: ReturnType<typeof shipSilhouette>, slot: string) => {
    const pts = s.parts.filter((p) => slotIdOf(p.id) === slot).flatMap((p) => p.outline);
    const xs = pts.map(([x]) => x);
    const ys = pts.map(([, y]) => y);
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  };

  it("draws a tenth of the rejection at roughly a tenth of the area", () => {
    const s = draw("big", "small");
    // Area goes as the square of the span, so 12 MW against 120 MW is √(1/10)
    // on each dimension and a tenth of the area.
    expect(extent(s, "r2") / extent(s, "r1")).toBeCloseTo(0.1, 2);
  });

  it("leaves two equal arrays equal", () => {
    const s = draw("big", "same");
    expect(extent(s, "r2") / extent(s, "r1")).toBeCloseTo(1, 6);
  });

  it("keeps the largest array at its slot's own size class", () => {
    // A ship with one radiator has to draw exactly as it did before scaling
    // existed, or every hull in the vault would silently change size.
    const scaled = draw("big", "small");
    const alone = shipSilhouette(twoSlot, readShip({ hull: "h", fittings: [{ slot: "r1", module: "big" }] }), { module: (id) => RADS[id] });
    expect(extent(scaled, "r1")).toBeCloseTo(extent(alone, "r1"), 9);
  });

  it("falls back to the size class for a radiator that declares no rejection", () => {
    const s = draw("big", "mute");
    expect(s.parts.some((p) => slotIdOf(p.id) === "r2")).toBe(true);
    expect(extent(s, "r2")).toBeGreaterThan(0);
  });
});
