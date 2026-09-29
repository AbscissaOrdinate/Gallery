/**
 * The status primitives' pure helpers, and the STYLE.md §1 rules that are easy
 * to regress with one careless line: no text-transform, no gradients, no
 * numeric font sizes in inline styles.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { asciiBar, asciiMeter, caps, commitState, countBySeverity, groupBySeverity, ratioSeverity, treePrefix, uiSeverity } from "../src/ui/kit/severity";
import { violation } from "../src/core/designer/violations";

describe("severity words", () => {
  it("maps kernel severities to UI words without renaming the kernel", () => {
    expect(uiSeverity("error")).toBe("violation");
    expect(uiSeverity("warn")).toBe("caution");
    expect(uiSeverity("info")).toBe("info");
  });

  it("groups in the fixed editor order: violation, caution, info", () => {
    const vs = [violation("info", "c"), violation("warn", "b"), violation("error", "a"), violation("info", "d")];
    expect(groupBySeverity(vs).map((g) => [g.severity, g.violations.length])).toEqual([
      ["violation", 1],
      ["caution", 1],
      ["info", 2],
    ]);
    expect(countBySeverity(vs)).toEqual({ violation: 1, caution: 1, info: 2 });
  });
});

describe("commit state", () => {
  it("states violations beside a save that went through — nothing blocks", () => {
    const vs = [violation("error", "x"), violation("error", "y"), violation("warn", "z")];
    expect(commitState({ dirty: false }, vs)).toEqual({ text: "SAVED WITH 2 VIOLATIONS", severity: "violation" });
    expect(commitState({ dirty: true }, [vs[0]!])).toEqual({ text: "UNSAVED WITH 1 VIOLATION", severity: "violation" });
    expect(commitState({ dirty: false }, [])).toEqual({ text: "SAVED", severity: "nominal" });
    expect(commitState({ saving: true }, vs).text).toBe("SAVING");
  });
});

describe("ASCII indicators", () => {
  it("draws ten cells always", () => {
    expect(asciiBar(0.71)).toBe("[#######---]");
    expect(asciiBar(0)).toBe("[----------]");
    expect(asciiBar(1.4)).toBe("[##########]");
    expect(asciiBar(undefined)).toBe("[----------]");
    for (const f of [0.01, 0.33, 0.5, 0.99]) expect(asciiBar(f)).toHaveLength(12);
  });

  it("draws one glyph per real thing", () => {
    expect(asciiMeter(4, 6)).toBe("▮▮▮▮▯▯");
    expect(asciiMeter(9, 3)).toBe("▮▮▮");
  });

  it("colours a ratio by severity", () => {
    expect(ratioSeverity(0.5)).toBe("nominal");
    expect(ratioSeverity(0.95)).toBe("caution");
    expect(ratioSeverity(1.08)).toBe("violation");
    expect(ratioSeverity(undefined)).toBe("pending");
  });

  it("builds tree prefixes", () => {
    expect(treePrefix([], false)).toBe("├─ ");
    expect(treePrefix([true], true)).toBe("│  └─ ");
  });
});

describe("copy", () => {
  it("uppercases labels in the text itself", () => {
    expect(caps("Semi-major axis (moons)")).toBe("SEMI-MAJOR AXIS (MOONS)");
  });
});

const ROOT = join(__dirname, "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(p);
  }
  return out;
}
const lines = (pattern: RegExp) =>
  walk(join(ROOT, "src")).flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .map((l, i) => ({ l, at: `${file.slice(ROOT.length + 1)}:${i + 1}` }))
      .filter(({ l }) => !/^\s*(\/\/|\*|\/\*)/.test(l) && pattern.test(l))
      .map(({ at }) => at),
  );

describe("STYLE.md §1 guards", () => {
  it("never uppercases by text-transform", () => {
    expect(lines(/text-transform\s*:|textTransform/)).toEqual([]);
  });
  it("draws no gradients anywhere", () => {
    expect(lines(/linear-gradient|radial-gradient|<radialGradient|<linearGradient/)).toEqual([]);
  });
  it("sets no numeric font sizes in inline styles", () => {
    expect(lines(/fontSize:\s*\d/)).toEqual([]);
  });
  it("rounds nothing but the badge and tag chips", () => {
    expect(lines(/border-?[rR]adius\s*:(?!\s*var\(--radius-(0|pill|2)\))/)).toEqual([]);
  });
});
