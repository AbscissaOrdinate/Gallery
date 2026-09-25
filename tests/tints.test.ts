/**
 * Body and polity colours are vault data (docs/STYLE.md §1, §8): seeded into
 * the vault once, read back from it, and never supplied by a renderer.
 */
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { MemoryAdapter } from "../src/core/storage/memory";
import { Repository } from "../src/core/repo";
import { glyphMarkup, type Motif } from "../src/core/astro/glyph";
import { EMPTY_PALETTE, glyphPaletteFrom, seedBodyTints, starTint } from "../src/core/astro/tints";
import { polityColor, rampColor, greenRamp } from "../src/core/astro/modes";
import { MOTIF_TINTS } from "../src/core/schema/builtin/bodyTints";
import { POLITY_PALETTE_SEED } from "../src/core/schema/builtin/polityPalette";
import type { TypedRecord } from "../src/core/types";

const MOTIFS: Motif[] = ["star", "gaian", "cytherean", "arean", "apnean", "europan", "gas-giant", "ice-giant", "hot-jupiter", "lava", "carbon", "tholin", "ocean", "asteroid", "comet", "belt", "ring", "barycenter", "chionian", "calidian", "ganymedean", "amuno-gaian"];
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

async function seededRepo(files: Record<string, string> = {}): Promise<Repository> {
  const repo = new Repository(new MemoryAdapter(files));
  await repo.init();
  await repo.load();
  return repo;
}

describe("glyph renderer", () => {
  it("draws no literal colour and no gradient without a palette", () => {
    for (const motif of MOTIFS) {
      const svg = glyphMarkup({ motif, seed: "x", rings: true, caps: true }, 10, EMPTY_PALETTE);
      expect(svg, motif).not.toMatch(LITERAL);
      expect(svg, motif).not.toMatch(/Gradient/);
    }
  });

  it("takes colours from the palette, and the record's own colour wins", () => {
    const palette = { motifs: { gaian: { base: "#123456", detail: "#654321" } }, stars: [] };
    expect(glyphMarkup({ motif: "gaian", seed: "x" }, 10, palette)).toContain("#123456");
    const own = glyphMarkup({ motif: "gaian", seed: "x", color: "#abcdef" }, 10, palette);
    expect(own).toContain("#abcdef");
    expect(own).not.toContain("#123456");
  });
});

describe("body-tints table", () => {
  it("is seeded into a new vault and read back as the glyph palette", async () => {
    const repo = await seededRepo();
    const palette = glyphPaletteFrom(repo.tables);
    expect(palette.motifs.gaian?.base).toBe(MOTIF_TINTS.gaian!.base);
    expect(palette.motifs["gas-giant"]?.bands?.length).toBe(8);
    expect(starTint(palette, 3000)).toMatch(/^#/);
    expect(starTint(palette, 30000)).toMatch(/^#/);
    expect(repo.designProblems.filter((p) => p.includes("body-tints"))).toEqual([]);
  });

  it("never overwrites a vault's own table", async () => {
    const fs = new MemoryAdapter({ "_tables/body-tints.yaml": YAML.stringify({ motifs: [{ id: "gaian", base: "#010203", source: "mine" }] }) });
    expect(await seedBodyTints(fs)).toBe(0);
    const repo = new Repository(fs);
    await repo.init();
    await repo.load();
    expect(glyphPaletteFrom(repo.tables).motifs.gaian?.base).toBe("#010203");
  });

  it("drops invalid colours rather than guessing", async () => {
    const fs = new MemoryAdapter({ "_tables/body-tints.yaml": YAML.stringify({ motifs: [{ id: "gaian", base: "blue", source: "mine" }] }) });
    const repo = new Repository(fs);
    await repo.load();
    expect(glyphPaletteFrom(repo.tables).motifs.gaian?.base).toBeUndefined();
    expect(glyphMarkup({ motif: "gaian", seed: "x" }, 10, glyphPaletteFrom(repo.tables))).toContain("var(--ink-300)");
  });
});

describe("polity palette", () => {
  it("is seeded into gallery.config.yaml once, keeping the rest of the config", async () => {
    const repo = await seededRepo({ "gallery.config.yaml": YAML.stringify({ name: "Mine", recordFormat: "yaml", writeCsv: false, version: 1 }) });
    expect(repo.config.polityPalette).toEqual([...POLITY_PALETTE_SEED]);
    expect(repo.config.name).toBe("Mine");
    expect(repo.config.writeCsv).toBe(false);
  });

  it("keeps a palette the vault already set", async () => {
    const repo = await seededRepo({ "gallery.config.yaml": YAML.stringify({ name: "Mine", polityPalette: ["#111111"], version: 1 }) });
    expect(repo.config.polityPalette).toEqual(["#111111"]);
  });

  it("uses the record's colour, then the vault palette, then neutral ink", () => {
    const p = (fields: Record<string, unknown>) => ({ id: "p1", type: "polity", fields }) as unknown as TypedRecord;
    expect(polityColor(p({ color: "#224466" }), 0, ["#111111"])).toBe("#224466");
    expect(polityColor(p({}), 0, ["#111111"])).toBe("#111111");
    expect(polityColor(p({}), 0, [])).toBe("var(--ink-300)");
    expect(polityColor(undefined, -1, ["#111111"])).toBe("var(--ink-300)");
  });
});

describe("overlay ramps", () => {
  it("are composed from tokens, never literals", () => {
    for (const t of [0, 0.3, 0.5, 0.8, 1]) {
      expect(rampColor(t)).toMatch(/^color-mix\(in srgb, var\(--[a-z0-9-]+\) \d+%, var\(--[a-z0-9-]+\)\)$/);
      expect(greenRamp(t)).not.toMatch(LITERAL);
    }
  });
});
