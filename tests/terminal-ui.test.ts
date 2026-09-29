/** Step 7: caveats you write yourself, the rail's sections, the boot's runtime lines. */
import { describe, expect, it } from "vitest";
import { normaliseCaveat, withCaveat, withoutCaveat } from "../src/core/handling";
import { sectionsOf } from "../src/ui/sections";
import { engineLabel } from "../src/ui/runtime";
import type { TypeSchema } from "../src/core/types";

describe("caveats", () => {
  it("are written uppercase, single-spaced, and never carry the banner's // separator", () => {
    expect(normaliseCaveat("  eyes   only ")).toBe("EYES ONLY");
    expect(normaliseCaveat("rel to//cmw")).toBe("REL TO CMW");
    expect(normaliseCaveat(" / ")).toBe("");
  });
  it("join the vault list once, and leave it without touching the rest", () => {
    const v = { clearance: ["LEVEL 1"], caveats: ["SI"], disruption: [], risk: [] };
    expect(withCaveat(v, "EYES ONLY").caveats).toEqual(["SI", "EYES ONLY"]);
    expect(withCaveat(v, "SI")).toEqual(v);
    expect(withoutCaveat(v, "SI")).toEqual({ ...v, caveats: [] });
    expect(withCaveat(undefined, "X").caveats).toEqual(["X"]);
  });
});

describe("sections", () => {
  const t = (id: string): TypeSchema => ({ id, title: id, folder: id, fields: { type: "object" } });
  it("group kinds in section order and put a custom kind in OTHER", () => {
    const out = sectionsOf(["hull", "note", "body", "widget", "system", "craft"].map(t));
    expect(out.map((s) => [s.section.id, s.types.map((x) => x.id)])).toEqual([
      ["notes", ["note"]],
      ["astro", ["system", "body"]],
      ["shipyard", ["hull", "craft"]],
      ["other", ["widget"]],
    ]);
  });
});

describe("runtime", () => {
  it("names the engine from the user agent", () => {
    expect(engineLabel("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0")).toBe("EDGE 131");
    expect(engineLabel("Mozilla/5.0 (X11) Gecko/20100101 Firefox/132.0")).toBe("FIREFOX 132");
    expect(engineLabel("")).toBe("UNKNOWN ENGINE");
  });
});
