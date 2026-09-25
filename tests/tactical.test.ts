/** Far-zoom tactical symbols: affiliation from the owning polity, frames by shape, tokens only. */
import { describe, expect, it } from "vitest";
import { affiliationOf, frameMarkup, polityAffiliation, tacticalMarkup, AFFILIATIONS } from "../src/core/astro/tactical";
import type { TypedRecord } from "../src/core/types";

const rec = (type: string, fields: Record<string, unknown>, id = type): TypedRecord => ({ id, type, name: id, slug: id, tags: [], aliases: [], links: [], assets: [], created: "", updated: "", fields });

describe("affiliation", () => {
  const polities: Record<string, TypedRecord> = { p1: rec("polity", { affiliation: "hostile" }, "p1"), p2: rec("polity", { affiliation: "martian" }, "p2") };
  const lookup = (id: string) => polities[id];

  it("comes from the owning polity: a location's owner, a body's controller", () => {
    expect(affiliationOf(rec("location", { owner: "p1" }), lookup)).toBe("hostile");
    expect(affiliationOf(rec("body", { controller: "p1" }), lookup)).toBe("hostile");
  });
  it("is unknown for an unrecognised side — never a new shape", () => {
    expect(polityAffiliation(polities.p2)).toBe("unknown");
    expect(affiliationOf(rec("location", { owner: "p2" }), lookup)).toBe("unknown");
  });
  it("is undefined when nothing owns the object, so it draws bare", () => {
    expect(affiliationOf(rec("body", {}), lookup)).toBeUndefined();
  });
});

describe("symbols", () => {
  it("give each affiliation its own shape", () => {
    expect(frameMarkup("friend", 30, 20)).toMatch(/<rect[^>]*width="30"/);
    expect(frameMarkup("neutral", 30, 20)).toMatch(/<rect[^>]*width="20"[^>]*height="20"/);
    expect(frameMarkup("hostile", 30, 20)).toMatch(/<path d="M0 /);
    expect((frameMarkup("unknown", 30, 20).match(/<circle/g) ?? []).length).toBe(4);
  });
  it("draw in theme tokens only, and unframed when unowned", () => {
    for (const a of AFFILIATIONS) for (const o of ["star", "planet", "station"] as const) expect(tacticalMarkup(o, a, 30, 20)).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb/);
    expect(tacticalMarkup("planet", undefined, 30, 20)).not.toMatch(/<rect|<path d="M0 [^V]/);
  });
});
