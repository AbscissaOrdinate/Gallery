import { describe, it, expect } from "vitest";
import { formatKm, formatAU, lightTime } from "../src/core/astro/units";
import { MemoryAdapter } from "../src/core/storage/memory";
import { Repository } from "../src/core/repo";
import { demoVault } from "../src/ui/demo";
import { bodyModes, estimateHabitability, polityColor } from "../src/core/astro/modes";
import { deriveBody } from "../src/core/astro/derive";
import type { TypedRecord } from "../src/core/types";
import { isNote } from "../src/core/types";

describe("units", () => {
  it("light-time auto-scales", () => {
    expect(lightTime(384400)).toBe("1.28 ls");
    expect(formatAU(1, "light")).toBe("8.32 lm");
    expect(formatAU(5.2, "light")).toBe("43.2 lm");
    expect(formatAU(30.1, "light")).toBe("4.17 lh");
    expect(formatAU(1000, "light")).toBe("5.78 ld");
    expect(formatKm(5800, "light")).toBe("19.3 light-ms");
  });
  it("AU/km and Mkm", () => {
    expect(formatAU(1.524, "au")).toBe("1.52 AU");
    expect(formatKm(384400, "au")).toBe("384,000 km");
    expect(formatAU(1, "mkm")).toBe("150 Mkm");
    expect(formatKm(35786, "mkm")).toBe("35.8 kkm");
  });
});

describe("map modes", () => {
  it("derives control, industry, habitability and military from the demo", async () => {
    const fs = new MemoryAdapter();
    await demoVault(fs);
    const repo = new Repository(fs);
    await repo.load();
    const all = repo.all().map((r) => r.record).filter((r): r is TypedRecord => !isNote(r));
    const find = (n: string) => all.find((r) => r.name === n)!;
    const lookup = (id: string) => repo.typed(id);
    const earth = bodyModes(find("Earth"), all, lookup);
    // Earth: no controller field → derived from locations (UESC elevators vs LDF castles)
    expect(earth.controlSource).toBe("derived");
    expect(earth.control.length).toBeGreaterThanOrEqual(2);
    expect(earth.control.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1, 5);
    expect(earth.industry).toBe(10); // override
    expect(earth.populationM).toBe(9800);
    expect(earth.habitability).toBeGreaterThan(0.8);
    expect(earth.military).toBeGreaterThan(5);
    const jup = bodyModes(find("Jupiter"), all, lookup);
    expect(jup.controlSource).toBe("field");
    expect(jup.control[0].polityId).toBe(find("United Jovian Confederacy").id);
    expect(jup.habitability).toBeLessThan(0.05);
    const mars = bodyModes(find("Mars"), all, lookup);
    expect(mars.control[0].polityId).toBe(find("United Earth Space Company (UESC)").id);
    expect(mars.habitability).toBeGreaterThan(0.15);
    expect(mars.habitability).toBeLessThan(0.45);
    expect(mars.industry).toBe(10); // 5 + 4 + 3 capped at 10
    const venus = bodyModes(find("Venus"), all, lookup);
    expect(venus.habitability).toBeLessThan(0.15);
    expect(venus.habitability).toBeLessThan(mars.habitability);
    // polity colours: explicit hex wins
    expect(polityColor(find("United Jovian Confederacy"), 1)).toBe("#4f8fd6");
  });
  it("habitability estimator ranks archetypes sensibly", async () => {
    const fs = new MemoryAdapter();
    await demoVault(fs);
    const repo = new Repository(fs);
    await repo.load();
    const h = (name: string) => {
      const b = repo.ofType("body").map((r) => r.record as TypedRecord).find((x) => x.name === name)!;
      return estimateHabitability(deriveBody(b, (id) => repo.typed(id)), b.fields);
    };
    expect(h("Earth")).toBeGreaterThan(h("Mars"));
    expect(h("Mars")).toBeGreaterThan(h("Venus"));
    expect(h("Titan")).toBeGreaterThan(h("Luna"));
    expect(h("Europa")).toBeGreaterThan(h("Jupiter"));
  });
});
