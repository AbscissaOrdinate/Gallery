import { describe, it, expect } from "vitest";
import { MemoryAdapter } from "../src/core/storage/memory";
import { Repository } from "../src/core/repo";
import { demoVault } from "../src/ui/demo";
import { layoutSystem, orbitShape, pointOnOrbit, placeLabels } from "../src/core/astro/layout";
import { deriveBody } from "../src/core/astro/derive";
import { glyphSvg, motifFor } from "../src/core/astro/glyph";
import type { TypedRecord } from "../src/core/types";
import { isNote } from "../src/core/types";

describe("orbit geometry", () => {
  it("circular orbit keeps radius at every angle", () => {
    const o = orbitShape({ x: 0, y: 0 }, 100, 100, 0);
    for (const a of [0, 45, 90, 200, 359]) expect(Math.hypot(pointOnOrbit(o, a).x, pointOnOrbit(o, a).y)).toBeCloseTo(100, 6);
  });
  it("eccentric orbit passes through periapsis and apoapsis at the mapped radii with the focus at the star", () => {
    const o = orbitShape({ x: 0, y: 0 }, 80, 200, 30);
    const peri = pointOnOrbit(o, 30);
    const apo = pointOnOrbit(o, 210);
    expect(Math.hypot(peri.x, peri.y)).toBeCloseTo(80, 6);
    expect(Math.hypot(apo.x, apo.y)).toBeCloseTo(200, 6);
    expect(o.e).toBeCloseTo((200 - 80) / 280, 6);
    // the ellipse centre sits between them along the major axis
    expect(Math.hypot(o.center.x, o.center.y)).toBeCloseTo(60, 6);
  });
});

describe("system layout (demo Heliaris)", () => {
  it("maps the demo system: orbits, screen-space neighbourhoods, Lagrange pairs, belts, cyclers", async () => {
    const fs = new MemoryAdapter();
    await demoVault(fs);
    const repo = new Repository(fs);
    await repo.load();
    const system = repo.ofType("system")[0].record as TypedRecord;
    const all = repo.all().map((r) => r.record).filter((r): r is TypedRecord => !isNote(r));
    const L = layoutSystem(system, all, (id) => repo.typed(id));
    expect(L.warnings).toEqual([]);
    expect(L.primary?.name).toBe("Heliaris");
    const byName = (n: string) => L.bodies.find((b) => b.name === n)!;
    const rOf = (n: string) => Math.hypot(byName(n).pos.x, byName(n).pos.y);
    expect(rOf("Mercury")).toBeLessThan(rOf("Venus"));
    expect(rOf("Venus")).toBeLessThan(rOf("Earth"));
    expect(rOf("Earth")).toBeLessThan(rOf("Mars"));
    expect(rOf("Mars")).toBeLessThan(rOf("Jupiter"));
    expect(rOf("Jupiter")).toBeLessThan(rOf("Neptune"));
    // general-type sublabels
    expect(byName("Jupiter").sublabel).toBe("Jovian");
    expect(byName("Uranus").sublabel).toBe("Neptunian");
    expect(byName("Mars").sublabel).toBe("Arean");
    expect(byName("Earth").sublabel).toBe("Gaian");
    expect(byName("Heliaris").sublabel).toBe("G2.8V");
    // Luna lives in Earth's neighbourhood (screen px) within the moon scale
    const earth = byName("Earth");
    const luna = earth.neighbourhood.find((s) => s.kind === "moon" && s.name === "Luna")!;
    expect(luna).toBeDefined();
    expect(Math.hypot(luna.off.x, luna.off.y)).toBeLessThanOrEqual(64);
    // Earth–Moon L4/L5 castles sit in Earth's neighbourhood at Luna's L-points, not on Earth's heliocentric orbit
    const hyperion = earth.neighbourhood.find((s) => s.kind === "lobject" && s.name === "Hyperion")!;
    expect(hyperion.secondaryId).toBe(luna.id);
    expect(hyperion.lpoint).toBe("L4");
    const lunaL4 = earth.neighbourhood.find((s) => s.kind === "lpoint" && s.secondaryId === luna.id && s.lpoint === "L4")!;
    expect(lunaL4.occupied).toBe(true);
    expect(hyperion.off).toEqual(lunaL4.off);
    const angLuna = Math.atan2(luna.off.y, luna.off.x);
    const angL4 = Math.atan2(lunaL4.off.y, lunaL4.off.x);
    expect((((angL4 - angLuna) * 180) / Math.PI + 360) % 360).toBeCloseTo(60, 3);
    expect(L.locations.some((l) => l.name === "Hyperion")).toBe(false);
    // Earth–Sun L1/L2 are neighbourhood dots; L4/L5 on the orbit; L3 only when occupied
    expect(earth.neighbourhood.filter((s) => s.kind === "lpoint" && s.secondaryId === earth.id).map((s) => s.lpoint).sort()).toEqual(["L1", "L2"]);
    expect(earth.lpoints.map((p) => p.point).sort()).toEqual(["L4", "L5"]);
    // Mars–Sun L5 hosts Nerio Castle as a heliocentric location at 60° behind Mars
    const nerio = L.locations.find((l) => l.name === "Nerio Castle")!;
    expect(nerio.lpoint).toEqual({ secondaryId: byName("Mars").id, point: "L5" });
    const mars = byName("Mars");
    const dAng = ((Math.atan2(nerio.pos.y, nerio.pos.x) - Math.atan2(mars.pos.y, mars.pos.x)) * 180) / Math.PI;
    expect(((dAng % 360) + 360) % 360).toBeCloseTo(300, 3);
    // belts, cyclers on eccentric artificial orbits, station on a planetary orbit
    expect(L.belts.length).toBe(2);
    const harmonia = L.locations.find((l) => l.name === "Harmonia Ecliptic")!;
    expect(harmonia.orbit?.e).toBeGreaterThan(0.05);
    expect(L.orbits.find((o) => o.id === harmonia.id)?.artificial).toBe(true);
    const ares = mars.neighbourhood.find((s) => s.kind === "station" && s.name === "Ares Depot")!;
    expect(ares.artificial).toBe(true);
    expect(ares.distKm).toBe(17000);
    // annotations: two around the primary (Trojan camps), two in neighbourhoods
    expect(L.annotations.length).toBe(2);
    expect(earth.neighbourhood.some((s) => s.kind === "annotation")).toBe(true);
    // glyphs
    expect(byName("Jupiter").glyph.motif).toBe("gas-giant");
    expect(byName("Saturn").glyph.rings).toBe(true);
    expect(byName("Heliaris").glyph.motif).toBe("star");
    // true-scale mapping is proportional
    const T = layoutSystem(system, all, (id) => repo.typed(id), { mapping: "linear" });
    const tOf = (n: string) => Math.hypot(T.bodies.find((b) => b.name === n)!.pos.x, T.bodies.find((b) => b.name === n)!.pos.y);
    expect(tOf("Neptune") / tOf("Earth")).toBeCloseTo(30.1, 0);
    // CSV export carries derived columns
    const csv = fs.dump()["_exports/body.csv"];
    expect(csv).toContain("d_class");
    expect(csv).toMatch(/Marine Tundral AquaGaian/);
  });

  it("places labels greedily without overlap and hides what cannot fit", () => {
    const reqs = [
      { id: "a", x: 100, y: 100, r: 8, text: "Alpha", sub: "Gaian", fontPx: 10, priority: 80 },
      { id: "b", x: 160, y: 100, r: 4, text: "Beta", fontPx: 10, priority: 50 },
      { id: "c", x: 100, y: 100, r: 4, text: "Gamma", fontPx: 10, priority: 10 },
    ];
    const placed = placeLabels(reqs);
    expect(placed.get("a")!.hidden).toBe(false);
    expect(placed.get("a")!.anchor).toBe("start");
    expect(placed.get("b")!.hidden).toBe(false);
    expect(placed.get("b")!.anchor).toBe("start");
    expect(placed.get("c")!.hidden).toBe(false); // same anchor as Alpha: pushed out to the left
    expect(placed.get("c")!.anchor).toBe("end");
    // nothing fits inside a fully occupied area
    const blocked = placeLabels([{ id: "z", x: 100, y: 100, r: 4, text: "Zeta", fontPx: 10, priority: 1 }], [{ x: 0, y: 0, w: 300, h: 300 }]);
    expect(blocked.get("z")!.hidden).toBe(true);
  });

  it("derives Earth and Luna like the sheet", async () => {
    const fs = new MemoryAdapter();
    await demoVault(fs);
    const repo = new Repository(fs);
    await repo.load();
    const earth = repo.ofType("body").map((r) => r.record as TypedRecord).find((b) => b.name === "Earth")!;
    const d = deriveBody(earth, (id) => repo.typed(id));
    expect(d.surfaceTempK).toBe(288);
    expect(d.periodDays).toBeCloseTo(365.256, 2);
    expect(d.ewocs.shorthand).toBe("Macrobiotic Marine Tundral AquaGaian");
    expect(d.gasRetention?.every((g) => g.retained)).toBe(true);
    const luna = repo.ofType("body").map((r) => r.record as TypedRecord).find((b) => b.name === "Luna")!;
    const dl = deriveBody(luna, (id) => repo.typed(id));
    expect(dl.periodDays).toBeCloseTo(27.3, 0);
    expect(dl.synodicDays).toBeCloseTo(29.5, 0);
    expect(dl.lockToParentLabel).toMatch(/locked/i);
    expect(dl.ewocs.shorthand).toBe("Vesperian Apnean Satellite");
  });

  it("schema upgrade replaces an older built-in and keeps a backup, unless custom", async () => {
    const fs = new MemoryAdapter({ "_schemas/body.schema.json": JSON.stringify({ id: "body", title: "Body", folder: "bodies", fields: { type: "object", properties: {} } }), "_schemas/craft.schema.json": JSON.stringify({ id: "craft", custom: true, title: "My craft", folder: "craft", fields: { type: "object", properties: {} } }) });
    const repo = new Repository(fs);
    await repo.init();
    await repo.load();
    const dump = fs.dump();
    expect(dump["_schemas/body.schema.v1.json"]).toBeDefined();
    expect(JSON.parse(dump["_schemas/body.schema.json"]).version).toBeGreaterThanOrEqual(3);
    expect(repo.registry.get("craft")?.title).toBe("My craft");
    expect(repo.registry.get("body")?.fields.properties?.mass_earth).toBeDefined();
  });
});

describe("glyphs", () => {
  it("renders every motif as valid-looking SVG", () => {
    for (const motif of ["star", "gaian", "cytherean", "arean", "apnean", "europan", "gas-giant", "ice-giant", "hot-jupiter", "lava", "carbon", "tholin", "ocean", "asteroid", "comet", "belt", "ring", "barycenter", "chionian", "calidian", "ganymedean", "amuno-gaian"] as const) {
      const svg = glyphSvg({ motif, seed: "x", rings: motif === "gas-giant" }, 64);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect((svg.match(/</g) ?? []).length).toBeGreaterThanOrEqual(3);
    }
  });
  it("auto motif follows classification", () => {
    expect(motifFor({ kind: "planet", gas_fraction: "Jovian", aerosol: "Enstatian" })).toBe("hot-jupiter");
    expect(motifFor({ kind: "planet", surface_type: "Gaian", fluid: "Amunian" })).toBe("amuno-gaian");
    expect(motifFor({ kind: "planet", surface_type: "Thalassic" })).toBe("ocean");
    expect(motifFor({ kind: "moon" })).toBe("apnean");
    expect(motifFor({ kind: "planet", glyph: "lava" })).toBe("lava");
  });
});
