/**
 * Expression layer (§2.3), required by §10.1: precedence, functions, dimension
 * checking, cycle detection, failure fallback.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, identifiersIn } from "../src/core/designer/expr/parse";
import { tokenize, ExprSyntaxError } from "../src/core/designer/expr/tokenize";
import { evaluate, EvalError, SIGMA } from "../src/core/designer/expr/evaluate";
import { deriveStats, evaluationOrder } from "../src/core/designer/expr/derive";
import { dimName, dimOf, unitOfField, DIMENSIONLESS } from "../src/core/designer/expr/dimension";
import { TableSet, parseTableFile } from "../src/core/designer/tables";

/** Evaluate for the number only, ignoring dimensions. */
const val = (src: string, ctx = {}): number => {
  const v = evaluate(parse(src), ctx);
  if (v.kind !== "num") throw new Error("expected a number");
  return v.n;
};

describe("tokenizer", () => {
  it("reads numbers, names, strings and operators", () => {
    expect(tokenize("1e6").map((t) => t.value)).toEqual([1000000]);
    expect(tokenize("5.670374e-8")[0]?.value).toBeCloseTo(5.670374e-8, 20);
    expect(tokenize("0.5").map((t) => t.value)).toEqual([0.5]);
    expect(tokenize("a_b2").map((t) => t.text)).toEqual(["a_b2"]);
    expect(tokenize("'radiators'").map((t) => ({ k: t.kind, t: t.text }))).toEqual([{ k: "string", t: "radiators" }]);
    expect(tokenize("a<=b").map((t) => t.text)).toEqual(["a", "<=", "b"]);
  });

  it("does not mistake a trailing e for an exponent", () => {
    // "2e" is the number 2 followed by the name e, not a broken exponent.
    expect(tokenize("2e").map((t) => t.kind)).toEqual(["number", "ident"]);
  });

  it("rejects junk", () => {
    expect(() => tokenize("1 $ 2")).toThrow(ExprSyntaxError);
    expect(() => tokenize("'unterminated")).toThrow(/unterminated/);
  });
});

describe("precedence and associativity", () => {
  it("binds * tighter than +", () => {
    expect(val("2 + 3 * 4")).toBe(14);
    expect(val("(2 + 3) * 4")).toBe(20);
    expect(val("2 * 3 + 4 * 5")).toBe(26);
  });

  it("subtracts and divides left to right", () => {
    expect(val("10 - 2 - 3")).toBe(5);
    expect(val("100 / 5 / 2")).toBe(10);
    expect(val("10 % 3")).toBe(1);
  });

  it("raises to powers right to left, tighter than unary minus", () => {
    expect(val("2 ^ 3 ^ 2")).toBe(512); // 2^(3^2), not (2^3)^2 = 64
    expect(val("-2 ^ 2")).toBe(-4); // -(2^2)
    expect(val("(-2) ^ 2")).toBe(4);
    expect(val("2 ^ -1")).toBe(0.5);
  });

  it("stacks unary operators", () => {
    expect(val("--3")).toBe(3);
    expect(val("-+-3")).toBe(3);
  });

  it("puts comparison below arithmetic", () => {
    expect(val("1 + 2 > 2")).toBe(1);
    expect(val("1 + 2 == 3")).toBe(1);
    expect(val("1 != 1")).toBe(0);
  });

  it("puts the ternary below everything and nests it to the right", () => {
    expect(val("1 < 2 ? 10 : 20")).toBe(10);
    expect(val("1 > 2 ? 10 : 20")).toBe(20);
    expect(val("0 ? 1 : 2 + 3")).toBe(5); // else-branch takes the whole sum
    expect(val("1 + 2 > 2 ? 5 : 6")).toBe(5); // condition takes the whole sum
    expect(val("0 ? 1 : 0 ? 2 : 3")).toBe(3); // right-associative: 0 ? 1 : (0 ? 2 : 3)
    expect(val("1 ? 2 : 1 ? 3 : 4")).toBe(2);
    expect(val("(1 ? 2 : 3) + 10")).toBe(12);
  });

  it("refuses malformed input rather than guessing", () => {
    for (const bad of ["1 +", "* 2", "(1 + 2", "1 + 2)", "1 ? 2", "1 : 2", "", "min(1,)", "1 2"]) {
      expect(() => parse(bad), bad).toThrow(ExprSyntaxError);
    }
  });
});

describe("functions", () => {
  it("computes the documented set", () => {
    expect(val("min(3, 1, 2)")).toBe(1);
    expect(val("max(3, 1, 2)")).toBe(3);
    expect(val("abs(-4)")).toBe(4);
    expect(val("sqrt(144)")).toBe(12);
    expect(val("pow(2, 10)")).toBe(1024);
    expect(val("log(1000)")).toBeCloseTo(3, 12);
    expect(val("ln(exp(2))")).toBeCloseTo(2, 12);
    expect(val("floor(2.7)")).toBe(2);
    expect(val("ceil(2.1)")).toBe(3);
    expect(val("round(2.5)")).toBe(3);
    expect(val("clamp(15, 0, 10)")).toBe(10);
    expect(val("clamp(-1, 0, 10)")).toBe(0);
    expect(val("clamp(5, 0, 10)")).toBe(5);
    expect(val("if(1 > 0, 10, 20)")).toBe(10);
    expect(val("if(0, 10, 20)")).toBe(20);
  });

  it("nests calls and arguments", () => {
    expect(val("max(min(5, 3), sqrt(4))")).toBe(3);
    expect(val("clamp(2 + 3, 0, 4 * 1)")).toBe(4);
  });

  it("reports arity and unknown names", () => {
    expect(() => val("sqrt(1, 2)")).toThrow(/takes 1 argument/);
    expect(() => val("clamp(1, 2)")).toThrow(/takes 3 arguments/);
    expect(() => val("frobnicate(1)")).toThrow(/no function called frobnicate/);
  });

  it("fails loudly on impossible arithmetic rather than returning NaN", () => {
    expect(() => val("1 / 0")).toThrow(/division by zero/);
    expect(() => val("sqrt(-1)")).toThrow(/negative/);
    expect(() => val("ln(0)")).toThrow(/ln/);
    expect(() => val("clamp(1, 10, 0)")).toThrow(/low bound/);
  });
});

describe("identifier resolution", () => {
  const ctx = {
    params: { area_m2: 2400, material: "tin-droplet" },
    stats: { area_m2: 1, mass_t: 42 },
    constraints: { T_ENV: 4, target_accel_g: 0.1 },
  };

  it("prefers params, then stats, then constants, then constraint parameters", () => {
    expect(val("area_m2", ctx)).toBe(2400); // param wins over the stat of the same name
    expect(val("mass_t", ctx)).toBe(42); // only a stat
    expect(val("PI", ctx)).toBeCloseTo(Math.PI, 12);
    expect(val("SIGMA", ctx)).toBe(SIGMA);
    expect(val("target_accel_g", ctx)).toBe(0.1); // only a constraint parameter
  });

  it("takes T_ENV from the constraint set, and falls back to the CMB", () => {
    expect(val("T_ENV", ctx)).toBe(4);
    expect(val("T_ENV", {})).toBe(2.725);
  });

  it("names what it could not find", () => {
    expect(() => val("nonsuch", ctx)).toThrow(/nothing named "nonsuch"/);
  });
});

describe("dimensions", () => {
  it("reads a dimension off a field name", () => {
    expect(dimName(dimOf("heat_rejected_mw"))).toBe("power");
    expect(dimName(dimOf("area_m2"))).toBe("area");
    expect(dimName(dimOf("mass_t"))).toBe("mass");
    expect(dimName(dimOf("temp_k"))).toBe("temperature");
    expect(dimName(dimOf("accelWet_g"))).toBe("acceleration");
    expect(dimName(dimOf("areal_mass_kg_m2"))).toBe("areal density"); // longest suffix wins over _m2
    expect(dimName(dimOf("emissivity"))).toBe("dimensionless");
  });

  it("names a compound dimension as a product of named ones", () => {
    // mass * area / time^3  =  power * area
    expect(dimName([1, 4, -3, 0])).toBe("power·area");
  });

  it("accepts the spec's radiator recipe, and knows it comes out in SI watts", () => {
    //  0.92 · σ · 2400 m² · (900⁴ − 2.725⁴) K⁴
    //  = dimensionless · (M·T⁻³·Θ⁻⁴) · L² · Θ⁴ = M·L²·T⁻³ = power ✓
    //  σ is in SI, so the result is 82 144 945 W — 82.1 MW.
    const warnings: string[] = [];
    const v = evaluate(parse("emissivity * SIGMA * area_m2 * (temp_k^4 - T_ENV^4)"), {
      params: { emissivity: 0.92, area_m2: 2400, temp_k: 900 },
      warnings,
    });
    expect(warnings).toEqual([]);
    expect(v.kind).toBe("num");
    if (v.kind !== "num") return;
    expect(dimName(v.dim)).toBe("power");
    expect(v.scale).toBe(1); // watts, not megawatts
    expect(v.n).toBeCloseTo(82144945.04433066, 3);
  });

  it("warns when addition mixes dimensions, and carries on", () => {
    const warnings: string[] = [];
    const v = evaluate(parse("mass_t + area_m2"), { params: { mass_t: 1, area_m2: 2 }, warnings });
    expect(warnings).toEqual(["addition mixes mass and area"]);
    expect(v.kind === "num" && v.n).toBe(3); // still evaluated
  });

  it("warns about exponents, roots and transcendentals that make no sense", () => {
    const w1: string[] = [];
    evaluate(parse("sqrt(volume_m3)"), { params: { volume_m3: 8 }, warnings: w1 });
    expect(w1[0]).toMatch(/sqrt\(\) of volume/);

    const w2: string[] = [];
    evaluate(parse("ln(mass_t)"), { params: { mass_t: 2 }, warnings: w2 });
    expect(w2[0]).toMatch(/ln\(\) needs a plain number.*mass/);

    const w3: string[] = [];
    evaluate(parse("2 ^ mass_t"), { params: { mass_t: 2 }, warnings: w3 });
    expect(w3[0]).toMatch(/exponent must be a plain number.*mass/);
  });

  it("treats a comparison as dimensionless however it is spelled", () => {
    const v = evaluate(parse("mass_t > 1"), { params: { mass_t: 2 } });
    expect(v.kind === "num" && v.dim).toEqual(DIMENSIONLESS);
  });
});

describe("table() in expressions", () => {
  const tables = new TableSet();
  tables.add(
    parseTableFile(
      "radiators",
      [
        "meta: { physical_source: 'Atomic Rockets' }",
        "physical:",
        "  - { id: tin-droplet, name: Tin droplet, areal_mass_kg_m2: 6.4154 }",
        "  - { id: guessed, name: Guessed, areal_mass_kg_m2: 1.0, provisional: true }",
        "game:",
        "  - { id: tin-droplet, name: Tin droplet, mass_t_per_gw: 125 }",
      ].join("\n"),
    ),
  );

  it("looks a figure up and tags its dimension from the column name", () => {
    const v = evaluate(parse("area_m2 * table('radiators', 'physical/tin-droplet', 'areal_mass_kg_m2') / 1000"), {
      params: { area_m2: 2400 },
      tables,
    });
    // 2400 m² × 6.4154 kg/m² ÷ 1000 = 15.39696 t
    expect(v.kind === "num" && v.n).toBeCloseTo(15.39696, 9);
    expect(v.kind === "num" && dimName(v.dim)).toBe("mass");
  });

  it("carries the provisional flag through the arithmetic", () => {
    const clean = evaluate(parse("table('radiators', 'physical/tin-droplet', 'areal_mass_kg_m2') * 2"), { tables });
    expect(clean.provisional).toBe(false);
    const tainted = evaluate(parse("table('radiators', 'physical/guessed', 'areal_mass_kg_m2') * 2 + 1"), { tables });
    expect(tainted.provisional).toBe(true);
  });

  it("refuses an ambiguous bare row id and says how to qualify it", () => {
    expect(() => evaluate(parse("table('radiators', 'tin-droplet', 'mass_t_per_gw')"), { tables })).toThrow(/ambiguous.*physical\/tin-droplet.*game\/tin-droplet/s);
  });

  it("takes a row id from a parameter, as the spec's recipe does", () => {
    const v = evaluate(parse("table('radiators', material, 'mass_t_per_gw')"), { params: { material: "game/tin-droplet" }, tables });
    expect(v.kind === "num" && v.n).toBe(125);
  });

  it("reports a missing column, table or row", () => {
    expect(() => evaluate(parse("table('radiators', 'physical/tin-droplet', 'nope')"), { tables })).toThrow(/has no "nope"/);
    expect(() => evaluate(parse("table('nope', 'x', 'y')"), { tables })).toThrow(/no table "nope"/);
    expect(() => evaluate(parse("table('radiators', 'nope', 'x')"), { tables })).toThrow(/has no row "nope"/);
  });
});

describe("evaluation order and cycles", () => {
  const astsFor = (derive: Record<string, string>) => new Map(Object.entries(derive).map(([k, v]) => [k, parse(v)]));

  it("orders dependencies first, breaking ties alphabetically for determinism", () => {
    const derive = { c: "b * 2", b: "a + 1", a: "1", z: "1" };
    const { order, cyclic } = evaluationOrder(derive, astsFor(derive));
    expect(order).toEqual(["a", "z", "b", "c"]);
    expect(cyclic).toEqual([]);
  });

  it("finds a cycle instead of looping", () => {
    const derive = { a: "b + 1", b: "a + 1", ok: "2" };
    const { order, cyclic } = evaluationOrder(derive, astsFor(derive));
    expect(order).toEqual(["ok"]);
    expect(cyclic).toEqual(["a", "b"]);
  });

  it("finds a self-reference", () => {
    const derive = { a: "a + 1" };
    expect(evaluationOrder(derive, astsFor(derive)).cyclic).toEqual(["a"]);
  });

  it("collects the identifiers an expression uses, ignoring function names", () => {
    expect([...identifiersIn(parse("max(a, b) + table('f', c, 'col')"))].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("deriveStats", () => {
  it("overwrites authored stats and chains one derived field into the next", () => {
    const r = deriveStats({
      stats: { area_m2: 0, heat_rejected_mw: 999, mass_t: 0 },
      params: { emissivity: 0.92, temp_k: 900, side_m: 40 },
      derive: {
        area_m2: "side_m * side_m * 1.5",
        // σ is in SI watts; the engine converts W → MW for the field.
        heat_rejected_mw: { expr: "emissivity * SIGMA * area_m2 * (temp_k^4 - T_ENV^4)", unit: "W" },
      },
    });
    // area = 40 × 40 × 1.5 = 2400 m², then the radiator recipe over that area
    expect(r.stats.area_m2).toBe(2400);
    expect(r.stats.heat_rejected_mw).toBeCloseTo(82.14494504433065, 9);
    expect(r.stats.mass_t).toBe(0); // untouched: no recipe for it
    expect(r.violations).toEqual([]);
    expect(r.derived.heat_rejected_mw?.expression).toMatch(/SIGMA/);
  });

  it("keeps a locked field and records what the recipe wanted", () => {
    const r = deriveStats({
      stats: { mass_t: 40 },
      params: { area_m2: 2400 },
      derive: { mass_t: "area_m2 * 0.02" },
      locks: ["mass_t"],
    });
    expect(r.stats.mass_t).toBe(40); // the lock wins
    expect(r.derived.mass_t?.value).toBe(48);
    expect(r.derived.mass_t?.locked).toEqual({ authored: 40, delta: 8 });
  });

  it("keeps the authored value when an expression will not parse", () => {
    const r = deriveStats({ stats: { mass_t: 7 }, derive: { mass_t: "2 +" } });
    expect(r.stats.mass_t).toBe(7);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]?.severity).toBe("info");
    expect(r.violations[0]?.field).toBe("mass_t");
    expect(r.violations[0]?.message).toMatch(/could not read the expression.*Keeping the authored value/);
  });

  it("keeps the authored value when an expression fails at run time", () => {
    const r = deriveStats({ stats: { mass_t: 7 }, derive: { mass_t: "nonsuch * 2" } });
    expect(r.stats.mass_t).toBe(7);
    expect(r.violations[0]?.severity).toBe("info");
    expect(r.violations[0]?.message).toMatch(/nothing named "nonsuch"/);
  });

  it("keeps authored values on both sides of a cycle and names the loop", () => {
    const r = deriveStats({ stats: { a_t: 1, b_t: 2, c_t: 3 }, derive: { a_t: "b_t + 1", b_t: "a_t + 1", c_t: "10" } });
    expect(r.stats.a_t).toBe(1);
    expect(r.stats.b_t).toBe(2);
    expect(r.stats.c_t).toBe(10); // the field outside the cycle still derives
    const cyclic = r.violations.filter((v) => v.message.includes("circular"));
    expect(cyclic).toHaveLength(2);
    expect(cyclic[0]?.severity).toBe("info");
    expect(cyclic[0]?.message).toMatch(/a_t → b_t → a_t/);
  });

  it("warns when the result does not match the field it is assigned to", () => {
    const r = deriveStats({ stats: { heat_rejected_mw: 0 }, params: { area_m2: 3 }, derive: { heat_rejected_mw: "area_m2 * area_m2" } });
    expect(r.stats.heat_rejected_mw).toBe(9); // still assigned
    const warn = r.violations.find((v) => v.severity === "warn");
    expect(warn?.message).toBe("heat_rejected_mw expects power, expression yields L⁴");
  });

  it("marks a field provisional when its recipe reads a provisional row", () => {
    const tables = new TableSet();
    tables.add(parseTableFile("structures", "rows:\n  - { id: steel-frame, structural_density_kg_m3: 7850, provisional: true }\n"));
    const r = deriveStats({
      stats: { mass_t: 0 },
      params: { volume_m3: 100 },
      derive: { mass_t: "volume_m3 * table('structures', 'steel-frame', 'structural_density_kg_m3') / 1000" },
      tables,
    });
    expect(r.stats.mass_t).toBe(785);
    expect(r.provisional.has("mass_t")).toBe(true);
    expect(r.derived.mass_t?.provisional).toBe(true);
  });

  it("does nothing at all without a recipe", () => {
    const stats = { mass_t: 42, volume_m3: 310 };
    const r = deriveStats({ stats });
    expect(r.stats).toEqual(stats);
    expect(r.derived).toEqual({});
    expect(r.violations).toEqual([]);
  });
});

describe("scale", () => {
  it("reads a unit, not just a dimension, off a field name", () => {
    expect(unitOfField("mass_t")).toMatchObject({ symbol: "t", scale: 1000 });
    expect(unitOfField("mass_kg")).toMatchObject({ symbol: "kg", scale: 1 });
    expect(unitOfField("heat_rejected_mw")).toMatchObject({ symbol: "MW", scale: 1e6 });
    expect(unitOfField("power_out_W")).toMatchObject({ symbol: "W", scale: 1 });
    expect(unitOfField("thrust_kN")).toMatchObject({ symbol: "kN", scale: 1000 });
    expect(unitOfField("deltav_kps")).toMatchObject({ symbol: "km/s", scale: 1000 });
    expect(unitOfField("emissivity")).toBeUndefined(); // no suffix: scale-agnostic
  });

  it("treats a bare literal as scale-agnostic, so it adopts the unit beside it", () => {
    const w: string[] = [];
    const v = evaluate(parse("mass_t + 5"), { params: { mass_t: 10 }, warnings: w });
    expect(w).toEqual([]); // 5 is five tonnes, not five kilograms
    expect(v.kind === "num" && v.scale).toBe(1000);
    expect(v.kind === "num" && v.n).toBe(15);
  });

  it("catches two units of the same quantity being added", () => {
    const w: string[] = [];
    evaluate(parse("mass_t + mass_kg"), { params: { mass_t: 1, mass_kg: 1 }, warnings: w });
    expect(w).toEqual(["addition mixes t and kg"]);
  });

  it("catches degrees compared against radians, which dimensions alone cannot", () => {
    const w: string[] = [];
    evaluate(parse("theta_deg > beam_rad"), { params: { theta_deg: 90, beam_rad: 1 }, warnings: w });
    expect(w).toEqual(["comparison with > mixes ° and rad"]);
    // ...but a bare number is fine on either side.
    const w2: string[] = [];
    evaluate(parse("theta_deg > 90"), { params: { theta_deg: 45 }, warnings: w2 });
    expect(w2).toEqual([]);
  });

  it("multiplies and divides scales through", () => {
    // 2400 m² × 6.4 kg/m² = 15360 kg, which is mass at scale 1, not tonnes.
    const v = evaluate(parse("area_m2 * areal_kg_m2"), { params: { area_m2: 2400, areal_kg_m2: 6.4 } });
    expect(v.kind === "num" && v.scale).toBe(1);
    expect(v.kind === "num" && dimName(v.dim)).toBe("mass");
  });

  it("raises scale to the same power as the value", () => {
    const v = evaluate(parse("length_km ^ 2"), { params: { length_km: 3 } });
    expect(v.kind === "num" && v.scale).toBe(1e6); // (1000 m)² = 1e6 m²
    expect(v.kind === "num" && dimName(v.dim)).toBe("area");
  });
});

describe("deriveStats and units", () => {
  it("converts from the unit the recipe declares into the field's own unit", () => {
    const r = deriveStats({
      stats: { heat_rejected_mw: 0 },
      params: { watts: 82144945 },
      derive: { heat_rejected_mw: { expr: "watts", unit: "W" } },
    });
    expect(r.stats.heat_rejected_mw).toBeCloseTo(82.144945, 9);
    expect(r.derived.heat_rejected_mw?.declaredUnit).toBe("W");
    expect(r.derived.heat_rejected_mw?.converted).toBe(1e-6);
    expect(r.violations).toEqual([]);
  });

  it("does not convert when the declared unit is already the field's", () => {
    const r = deriveStats({ stats: { mass_t: 0 }, params: { x_t: 12 }, derive: { mass_t: { expr: "x_t", unit: "t" } } });
    expect(r.stats.mass_t).toBe(12);
    expect(r.derived.mass_t?.converted).toBeUndefined();
    expect(r.violations).toEqual([]);
  });

  it("catches a hand-rolled conversion that leaves the result in the wrong unit", () => {
    // The old spelling of the radiator recipe: correct arithmetic, but the
    // /1e6 hides the conversion inside a literal, so the result claims watts.
    const r = deriveStats({
      stats: { heat_rejected_mw: 0 },
      params: { emissivity: 0.92, area_m2: 2400, temp_k: 900 },
      derive: { heat_rejected_mw: "emissivity * SIGMA * area_m2 * (temp_k^4 - T_ENV^4) / 1e6" },
    });
    const warn = r.violations.find((v) => v.severity === "warn");
    expect(warn?.message).toBe(
      "heat_rejected_mw: heat_rejected_mw is in MW but the expression works out in W — out by 10⁻⁶×. Declare the unit the expression produces instead of scaling it by hand.",
    );
    // The number is still assigned: a warning never blocks a value.
    expect(r.stats.heat_rejected_mw).toBeCloseTo(82.14494504433065, 9);
  });

  it("catches an expression that forgot to convert at all", () => {
    const r = deriveStats({ stats: { mass_t: 0 }, params: { mass_kg: 5000 }, derive: { mass_t: "mass_kg" } });
    expect(r.violations[0]?.message).toMatch(/mass_t is in t but the expression works out in kg — out by 10⁻³×/);
  });

  it("complains when the declared unit measures the wrong quantity", () => {
    const r = deriveStats({ stats: { mass_t: 0 }, params: { x_t: 1 }, derive: { mass_t: { expr: "x_t", unit: "MW" } } });
    expect(r.violations[0]?.message).toMatch(/declares MW, which is power, but the expression yields mass/);
  });

  it("falls back to the field's unit when the declared one is not recognised", () => {
    const r = deriveStats({ stats: { mass_t: 0 }, params: { x_t: 3 }, derive: { mass_t: { expr: "x_t", unit: "furlongs" } } });
    expect(r.violations[0]?.message).toMatch(/"furlongs" is not a unit this engine knows/);
    expect(r.stats.mass_t).toBe(3);
  });

  it("stays quiet about a field whose name carries no unit", () => {
    const r = deriveStats({ stats: { crew_per_watch: 0 }, params: { berths: 12 }, derive: { crew_per_watch: "berths / 3" } });
    expect(r.stats.crew_per_watch).toBe(4);
    expect(r.violations).toEqual([]);
  });
});

describe("no dynamic code execution", () => {
  it("never reaches for eval or Function anywhere in core", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(entry.name)) {
          const src = readFileSync(p, "utf8");
          // Comments in this suite mention them by name; only flag real call sites.
          if (/\beval\s*\(/.test(src) || /new\s+Function\s*\(/.test(src) || /\bFunction\s*\(\s*["'`]/.test(src)) offenders.push(p);
        }
      }
    };
    walk(join(__dirname, "..", "src", "core"));
    expect(offenders).toEqual([]);
  });
});
