/**
 * Constraint sets (§2.8): composition by `extends`, the era → faction → bureau
 * precedence, and the engine parameters phase 3 still needs a decision on.
 */
import { describe, it, expect } from "vitest";
import { MemoryAdapter } from "../src/core/storage/memory";
import {
  composeConstraints,
  DEFAULT_CONSTRAINT_SET,
  ENGINE_PARAMS,
  loadConstraints,
  missingParams,
  parseConstraintSet,
  provisionalParams,
  seedConstraints,
  type ConstraintSet,
} from "../src/core/designer/constraints";
import { VAULT } from "../src/core/types";

const set = (id: string, scope: ConstraintSet["scope"], params: Record<string, number>, rest: Partial<ConstraintSet> = {}): ConstraintSet => ({
  id,
  name: id,
  scope,
  params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, { value: v, source: "test fixture" }])),
  rules: [],
  ...rest,
});

describe("composition", () => {
  const sets = [
    DEFAULT_CONSTRAINT_SET,
    set("2130s", "era", { T_ENV: 3, automation_factor: 1.0, target_accel_g: 0.05 }),
    set("uesc", "faction", { automation_factor: 0.8 }),
    set("pallas-yard", "bureau", { automation_factor: 0.6, kg_per_crew_day: 9 }),
  ];

  it("applies base, then era, then faction, then bureau", () => {
    const eff = composeConstraints(sets, { era: "2130s", faction: "uesc", bureau: "pallas-yard" });
    expect(eff.applied).toEqual(["default", "2130s", "uesc", "pallas-yard"]);
    expect(eff.values.automation_factor).toBe(0.6); // bureau beats faction beats era
    expect(eff.values.target_accel_g).toBe(0.05); // only the era sets it
    expect(eff.values.kg_per_crew_day).toBe(9); // only the bureau sets it
    expect(eff.values.T_ENV).toBe(3); // the era overrides the built-in CMB figure
  });

  it("says which set supplied each value", () => {
    const eff = composeConstraints(sets, { era: "2130s", faction: "uesc" });
    expect(eff.provenance).toMatchObject({ T_ENV: "2130s", automation_factor: "uesc", target_accel_g: "2130s" });
  });

  it("leaves the base set in force when nothing else is named", () => {
    const eff = composeConstraints(sets, {});
    expect(eff.applied).toEqual(["default"]);
    expect(eff.values.T_ENV).toBe(2.725);
    expect(eff.violations).toEqual([]);
  });

  it("applies an extends chain ancestors-first", () => {
    const chained = [
      DEFAULT_CONSTRAINT_SET,
      set("early", "era", { automation_factor: 1.0, closing_speed_kps: 10 }),
      set("2130s", "era", { automation_factor: 0.9 }, { extends: "early" }),
    ];
    const eff = composeConstraints(chained, { era: "2130s" });
    expect(eff.applied).toEqual(["default", "early", "2130s"]);
    expect(eff.values.automation_factor).toBe(0.9); // the child wins
    expect(eff.values.closing_speed_kps).toBe(10); // inherited from the parent
  });

  it("warns about a set that is not there, without dropping the rest", () => {
    const eff = composeConstraints(sets, { era: "2130s", faction: "nonsuch" });
    expect(eff.values.T_ENV).toBe(3);
    expect(eff.violations).toHaveLength(1);
    expect(eff.violations[0]?.severity).toBe("warn");
    expect(eff.violations[0]?.message).toMatch(/faction constraint set "nonsuch", which is not in _constraints/);
  });

  it("breaks an extends loop rather than hanging", () => {
    const looped = [set("a", "era", { T_ENV: 1 }, { extends: "b" }), set("b", "era", { T_ENV: 2 }, { extends: "a" })];
    const eff = composeConstraints(looped, { base: "a" });
    expect(eff.violations.some((v) => v.message.includes("extends itself"))).toBe(true);
    expect(eff.values.T_ENV).toBe(1); // "a" still applies, over its own broken ancestor
  });

  it("lets a later set replace an earlier rule of the same id", () => {
    const withRules = [
      set("base", "base", {}, { rules: [{ id: "max-isp", severity: "error", field: "isp_s", max: 900 }] }),
      set("late", "era", {}, { rules: [{ id: "max-isp", severity: "warn", field: "isp_s", max: 12000 }] }),
    ];
    const eff = composeConstraints(withRules, { base: "base", era: "late" });
    expect(eff.rules).toHaveLength(1);
    expect(eff.rules[0]).toMatchObject({ id: "max-isp", severity: "warn", max: 12000 });
  });
});

describe("sourcing discipline", () => {
  it("ships a base set whose only sourced figure is cited, and whose conventions are marked", () => {
    expect(Object.keys(DEFAULT_CONSTRAINT_SET.params).sort()).toEqual(["T_ENV", "cell_pitch_m", "cell_volume_m3"]);
    // The one looked-up figure carries its citation and is not provisional.
    expect(DEFAULT_CONSTRAINT_SET.params.T_ENV?.source).toMatch(/Fixsen 2009/);
    expect(DEFAULT_CONSTRAINT_SET.params.T_ENV?.provisional).toBeFalsy();
    // The two NEBULOUS-import conventions are rulings, not measurements: no source,
    // provisional, so every volume derived from them keeps the marker.
    for (const name of ["cell_pitch_m", "cell_volume_m3"]) {
      expect(DEFAULT_CONSTRAINT_SET.params[name]?.source, name).toBeUndefined();
      expect(DEFAULT_CONSTRAINT_SET.params[name]?.provisional, name).toBe(true);
      expect(DEFAULT_CONSTRAINT_SET.params[name]?.note, name).toBeTruthy();
    }
  });

  it("pins the cell ruling to the published figure it was derived from", () => {
    // NEBULOUS ship editor: a Reinforced Magazine in a 4x1x8 compartment reads
    // "Capacity: 280/320 m3". 4 x 1 x 8 = 32 cells, and reinforced-magazine yields
    // 10 m3 per cell, so 32 x 10 = 320. A cell must hold at least bulk-magazine's
    // 15 m3, which is what rules out the old 2 m/cell (8 m3).
    const cells = 4 * 1 * 8;
    expect(cells * 10).toBe(320);
    const cellVolume = DEFAULT_CONSTRAINT_SET.params.cell_volume_m3?.value as number;
    expect(cellVolume).toBeGreaterThanOrEqual(15);
    expect(Math.pow(DEFAULT_CONSTRAINT_SET.params.cell_pitch_m?.value as number, 3)).toBeCloseTo(cellVolume, 9);
  });

  it("treats a parameter written without a source as provisional", () => {
    const { set: parsed } = parseConstraintSet("x", "params:\n  automation_factor: 0.8\n  closing_speed_kps: { value: 10, source: 'a citation' }\n");
    expect(parsed?.params.automation_factor?.provisional).toBe(true);
    expect(parsed?.params.closing_speed_kps?.provisional).toBe(false);
    const eff = composeConstraints([parsed as ConstraintSet], { base: "x" });
    expect(provisionalParams(eff)).toEqual(["automation_factor"]);
  });

  it("lists the engine parameters nothing has set yet", () => {
    const eff = composeConstraints([DEFAULT_CONSTRAINT_SET], {});
    const missing = missingParams(eff).map((p) => p.name);
    // Set by the base set: one sourced figure and the two decided conventions.
    for (const name of ["T_ENV", "cell_pitch_m", "cell_volume_m3"]) expect(missing).not.toContain(name);
    // Everything else is a campaign assumption that has to be chosen, not looked up.
    expect(missing).toContain("target_accel_g");
    expect(missing).toContain("closing_speed_kps");
    expect(missing).toContain("automation_factor");
    expect(missing).toContain("kg_per_crew_day");
    expect(missing).toHaveLength(ENGINE_PARAMS.length - 3);
  });

  it("marks exactly one declared engine parameter as physically citable", () => {
    expect(ENGINE_PARAMS.filter((p) => p.physical).map((p) => p.name)).toEqual(["T_ENV"]);
  });
});

describe("parsing", () => {
  it("defaults a rule with no severity to warn and says so", () => {
    const { set: parsed, problems } = parseConstraintSet("x", "rules:\n  - { id: r1, field: isp_s, max: 10 }\n");
    expect(parsed?.rules[0]?.severity).toBe("warn");
    expect(problems[0]).toMatch(/no valid severity/);
  });

  it("flags a parameter given in the wrong unit", () => {
    const { problems } = parseConstraintSet("x", "params:\n  closing_speed_kps: { value: 10, unit: 'm/s', source: 'x' }\n");
    expect(problems[0]).toMatch(/declared in km\/s \(velocity\) but this set gives m\/s/);
  });
});

describe("vault I/O", () => {
  it("seeds the default set once and never overwrites it", async () => {
    const fs = new MemoryAdapter();
    expect(await seedConstraints(fs)).toBe(1);
    const path = `${VAULT.constraintsDir}/default.yaml`;
    const written = await fs.readText(path);
    expect(written).toMatch(/Fixsen 2009/);
    expect(written).toMatch(/deliberately absent/); // the header explains the gap
    await fs.writeText(path, "id: default\nname: Edited by hand\nparams: {}\n");
    expect(await seedConstraints(fs)).toBe(0);
    expect(await fs.readText(path)).toMatch(/Edited by hand/);
  });

  it("loads sets from disk over the built-in default", async () => {
    const fs = new MemoryAdapter();
    await fs.mkdirAll(VAULT.constraintsDir);
    await fs.writeText(`${VAULT.constraintsDir}/2130s.yaml`, "id: 2130s\nname: The 2130s\nscope: era\nparams:\n  T_ENV: { value: 40, source: 'inner system, sunlit' }\n");
    const { sets, problems } = await loadConstraints(fs);
    expect(problems).toEqual([]);
    expect([...sets.keys()].sort()).toEqual(["2130s", "default"]);
    expect(composeConstraints(sets, { era: "2130s" }).values.T_ENV).toBe(40);
  });

  it("treats a missing _constraints/ as just the built-in default", async () => {
    const { sets, problems } = await loadConstraints(new MemoryAdapter());
    expect([...sets.keys()]).toEqual(["default"]);
    expect(problems).toEqual([]);
  });
});
