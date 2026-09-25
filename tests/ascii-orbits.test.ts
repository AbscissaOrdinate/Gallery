/** Boot orbital idle: generated from the vault's system, the plate's frames when there is none. */
import { describe, expect, it } from "vitest";
import { PLATE_FRAMES, idleSubject, orbitalFrames } from "../src/core/astro/asciiOrbits";
import type { TypedRecord } from "../src/core/types";

const rec = (type: string, id: string, fields: Record<string, unknown>): TypedRecord => ({ id, type, name: id, slug: id, tags: [], aliases: [], links: [], assets: [], created: "", updated: "", fields });

describe("idleSubject", () => {
  const sys = rec("system", "sol", { primary: "sun" });
  const bodies = [
    rec("body", "sun", { system: "sol", kind: "star" }),
    rec("body", "mars", { system: "sol", parent: "sun", kind: "planet", sma_au: 1.52, map_angle_deg: 20 }),
    rec("body", "earth", { system: "sol", parent: "sun", kind: "planet", sma_au: 1, map_angle_deg: 80 }),
    rec("body", "luna", { system: "sol", parent: "earth", kind: "moon", sma_km: 384400 }),
    rec("body", "belt", { system: "sol", parent: "sun", kind: "belt", sma_au: 2.7 }),
  ];
  it("takes the primary and the planets that orbit it, innermost first, no moons or belts", () => {
    expect(idleSubject([sys], bodies)).toEqual({ primary: "sun", orbits: [{ name: "earth", angleDeg: 80 }, { name: "mars", angleDeg: 20 }] });
  });
  it("is undefined without a system or a primary", () => {
    expect(idleSubject([], bodies)).toBeUndefined();
    expect(idleSubject([rec("system", "x", {})], bodies)).toBeUndefined();
  });
});

describe("orbitalFrames", () => {
  it("falls back to the plate's frames", () => {
    expect(orbitalFrames(undefined)).toBe(PLATE_FRAMES);
    expect(orbitalFrames({ primary: "Sun", orbits: [] })).toBe(PLATE_FRAMES);
  });
  it("draws the primary at the centre and every body, moving between frames", () => {
    const frames = orbitalFrames({ primary: "Sun", orbits: [{ name: "a", angleDeg: 0 }, { name: "b", angleDeg: 90 }, { name: "c", angleDeg: 200 }] });
    expect(frames).toHaveLength(3);
    for (const f of frames) {
      const text = f.join("\n");
      expect(text.match(/\*/g)).toHaveLength(1);
      expect((text.match(/o/g) ?? []).length).toBe(3);
      expect(f[Math.floor(f.length / 2)]).toContain("*");
    }
    expect(frames[0]).not.toEqual(frames[1]);
  });
});
