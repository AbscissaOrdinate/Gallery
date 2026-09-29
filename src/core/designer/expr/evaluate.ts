/**
 * AST interpreter for the expression layer (§2.3).
 *
 * Every value carries four things: a number, a dimension, the scale that
 * converts it to SI, and whether it is tainted by a provisional table row. All
 * four propagate through the arithmetic. The dimension catches area used where
 * a power was meant; the scale catches watts used where megawatts were meant;
 * the taint means a mass derived from an unsourced areal density is itself
 * unsourced by the time it reaches the UI.
 *
 * A bare numeric literal is deliberately **scale-agnostic** — it has no unit, so
 * it adopts whatever it is combined with. `mass_t + 5` is five tonnes and draws
 * no complaint. Only values that know their own unit can disagree.
 *
 * Dimension and scale mismatches are collected as warnings and never stop
 * evaluation (§2.3: "a warning, not a hard failure, since users will write
 * shortcuts"). Genuine failures — an unresolvable name, a bad argument count, a
 * non-finite result — throw `EvalError`, which the derivation layer turns into
 * an `info` violation while keeping the authored value.
 */
import type { Node } from "./parse";
import { DIMENSIONLESS, dimDiv, dimEq, dimMul, dimName, dimOf, dimPow, isDimensionless, scaleName, scaleOf, scaleRatio, type Dim } from "./dimension";
import type { TableSet } from "../tables";

export type Value =
  | {
      kind: "num";
      n: number;
      dim: Dim;
      scale?: number;
      /**
       * True for a value that carries no unit of its own — a bare literal, or a
       * name with no recognised suffix. It adopts whatever it is combined with
       * and never disagrees with anything, so `mass_t + 5` is five tonnes.
       */
      agnostic?: boolean;
      provisional: boolean;
    }
  | { kind: "str"; s: string; provisional: boolean };

export class EvalError extends Error {
  constructor(
    message: string,
    readonly at = 0,
  ) {
    super(message);
    this.name = "EvalError";
  }
}

/**
 * Physical constants, in SI. Sourced, per §0:
 *  - SIGMA  Stefan-Boltzmann, CODATA 2018 exact value, W·m⁻²·K⁻⁴; the
 *           `_tables/radiators.yaml` meta block quotes it truncated to 5.670374e-8.
 *  - G0     standard gravity, ISO 80000-3 / 3rd CGPM (1901), m/s²; already used
 *           by budgets.ts.
 *  - T_ENV  comes from the constraint set (§2.8). The fallback is the cosmic
 *           microwave background, Fixsen 2009, ApJ 707:916 — the coldest sink a
 *           radiator can see with no nearby body or star in view.
 *
 * These being SI is why a recipe mixing them with MW-denominated fields must
 * declare its unit (see `derive.ts`) rather than divide by 1e6 by hand.
 */
export const SIGMA = 5.670374419e-8;
export const G0 = 9.80665;
export const DEFAULT_T_ENV = 2.725;

export interface EvalContext {
  /** Recipe parameters — resolved first. */
  params?: Record<string, unknown>;
  /** Other stat fields on the same module — resolved second. */
  stats?: Record<string, unknown>;
  /** Effective constraint-set parameters — resolved after the constants. */
  constraints?: Record<string, number>;
  tables?: TableSet;
  /** Dimension and scale complaints land here; evaluation carries on regardless. */
  warnings?: string[];
}

type Num = Extract<Value, { kind: "num" }>;

const num = (n: number, dim: Dim = DIMENSIONLESS, provisional = false, scale?: number, agnostic = false): Value => ({ kind: "num", n, dim, scale, agnostic, provisional });

/** A number with no unit at all: adopts its neighbour's dimension and scale. */
const freeNum = (n: number, provisional = false): Value => num(n, DIMENSIONLESS, provisional, undefined, true);

/** Multiplying keeps a known scale; two scale-agnostic operands stay agnostic. */
const mulScale = (a?: number, b?: number): number | undefined => (a === undefined && b === undefined ? undefined : (a ?? 1) * (b ?? 1));
const divScale = (a?: number, b?: number): number | undefined => (a === undefined && b === undefined ? undefined : (a ?? 1) / (b ?? 1));
/** Adding adopts whichever side knows its unit. */
const addScale = (a?: number, b?: number): number | undefined => a ?? b;

const asNumber = (v: Value, what: string, at: number): Num => {
  if (v.kind !== "num") throw new EvalError(`${what} needs a number, got the text "${v.s}"`, at);
  return v;
};

const asString = (v: Value, what: string, at: number): string => {
  if (v.kind === "str") return v.s;
  throw new EvalError(`${what} needs a name in quotes, got the number ${v.n}`, at);
};

const truthy = (v: Value): boolean => (v.kind === "num" ? v.n !== 0 : v.s.length > 0);

/** Coerce a YAML scalar to a Value, tagging its unit from the field name. */
function fromScalar(name: string, raw: unknown): Value | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return num(raw, dimOf(name), false, scaleOf(name), scaleOf(name) === undefined);
  if (typeof raw === "string") return { kind: "str", s: raw, provisional: false };
  if (typeof raw === "boolean") return num(raw ? 1 : 0);
  return undefined;
}

export function evaluate(node: Node, ctx: EvalContext = {}): Value {
  const warn = (message: string) => ctx.warnings?.push(message);

  /** Both operands must agree on dimension, and on scale where both know theirs. */
  const requireSame = (a: Value, b: Value, what: string): void => {
    if (a.kind !== "num" || b.kind !== "num") return;
    if (a.agnostic || b.agnostic) return; // a value with no unit agrees with everything
    if (!dimEq(a.dim, b.dim)) {
      warn(`${what} mixes ${dimName(a.dim)} and ${dimName(b.dim)}`);
      return; // the scales are not comparable either; one complaint is enough
    }
    if (a.scale !== undefined && b.scale !== undefined && a.scale !== b.scale) {
      warn(`${what} mixes ${scaleName(a.dim, a.scale)} and ${scaleName(b.dim, b.scale)}`);
    }
  };

  const taint = (v: Value, provisional: boolean): Value => ({ ...v, provisional: v.provisional || provisional });

  const walk = (n: Node): Value => {
    switch (n.kind) {
      case "num":
        return freeNum(n.value); // a literal carries no unit at all
      case "str":
        return { kind: "str", s: n.value, provisional: false };
      case "ident":
        return resolve(n.name, n.at);
      case "unary": {
        const v = asNumber(walk(n.operand), `unary ${n.op}`, n.at);
        return num(n.op === "-" ? -v.n : v.n, v.dim, v.provisional, v.scale, v.agnostic);
      }
      case "binary":
        return binary(n);
      case "ternary": {
        const cond = walk(n.cond);
        const whenTrue = walk(n.whenTrue);
        const whenFalse = walk(n.whenFalse);
        requireSame(whenTrue, whenFalse, "the two branches of ? :");
        const picked = truthy(cond) ? whenTrue : whenFalse;
        return taint(picked, cond.provisional || whenTrue.provisional || whenFalse.provisional);
      }
      case "call":
        return call(n);
    }
  };

  function resolve(name: string, at: number): Value {
    const fromParams = ctx.params?.[name];
    if (fromParams !== undefined) {
      const v = fromScalar(name, fromParams);
      if (v) return v;
    }
    const fromStats = ctx.stats?.[name];
    if (fromStats !== undefined) {
      const v = fromScalar(name, fromStats);
      if (v) return v;
    }
    if (name === "SIGMA") return num(SIGMA, [1, 0, -3, -4], false, 1);
    if (name === "G0") return num(G0, [0, 1, -2, 0], false, 1);
    if (name === "PI") return freeNum(Math.PI);
    if (name === "T_ENV") return num(ctx.constraints?.T_ENV ?? DEFAULT_T_ENV, [0, 0, 0, 1], false, 1);
    const fromConstraints = ctx.constraints?.[name];
    if (typeof fromConstraints === "number" && Number.isFinite(fromConstraints))
      return num(fromConstraints, dimOf(name), false, scaleOf(name), scaleOf(name) === undefined);
    throw new EvalError(`nothing named "${name}" — not a recipe parameter, another stat, a constant, or a constraint-set parameter`, at);
  }

  function binary(n: Extract<Node, { kind: "binary" }>): Value {
    const left = walk(n.left);
    const right = walk(n.right);
    const provisional = left.provisional || right.provisional;

    if (n.op === "==" || n.op === "!=") {
      const equal =
        left.kind === "str" || right.kind === "str"
          ? left.kind === "str" && right.kind === "str" && left.s === right.s
          : (left as Num).n === (right as Num).n;
      requireSame(left, right, `comparison with ${n.op}`);
      return num((n.op === "==" ? equal : !equal) ? 1 : 0, DIMENSIONLESS, provisional);
    }

    const a = asNumber(left, `the left side of ${n.op}`, n.at);
    const b = asNumber(right, `the right side of ${n.op}`, n.at);

    switch (n.op) {
      case "+":
      case "-": {
        requireSame(a, b, n.op === "+" ? "addition" : "subtraction");
        const free = a.agnostic === true && b.agnostic === true;
        const dim = a.agnostic ? b.dim : a.dim; // the side that knows its unit decides
        return num(n.op === "+" ? a.n + b.n : a.n - b.n, dim, provisional, addScale(a.scale, b.scale), free);
      }
      case "*":
        return num(a.n * b.n, dimMul(a.dim, b.dim), provisional, mulScale(a.scale, b.scale), a.agnostic === true && b.agnostic === true);
      case "/":
        if (b.n === 0) throw new EvalError("division by zero", n.at);
        return num(a.n / b.n, dimDiv(a.dim, b.dim), provisional, divScale(a.scale, b.scale), a.agnostic === true && b.agnostic === true);
      case "%": {
        if (b.n === 0) throw new EvalError("remainder by zero", n.at);
        requireSame(a, b, "remainder");
        const dim = a.agnostic ? b.dim : a.dim;
        return num(a.n % b.n, dim, provisional, addScale(a.scale, b.scale), a.agnostic === true && b.agnostic === true);
      }
      case "^":
        return power(a, b, n.at, provisional);
      case "<":
      case "<=":
      case ">":
      case ">=": {
        requireSame(a, b, `comparison with ${n.op}`);
        const r = n.op === "<" ? a.n < b.n : n.op === "<=" ? a.n <= b.n : n.op === ">" ? a.n > b.n : a.n >= b.n;
        return num(r ? 1 : 0, DIMENSIONLESS, provisional);
      }
      default:
        throw new EvalError(`unknown operator ${n.op}`, n.at);
    }
  }

  function power(a: Num, b: Num, at: number, provisional: boolean): Value {
    if (!isDimensionless(b.dim)) warn(`an exponent must be a plain number, but this one is ${dimName(b.dim)}`);
    if (!isDimensionless(a.dim) && !Number.isInteger(b.n)) warn(`raising ${dimName(a.dim)} to the power ${b.n} does not give a whole dimension`);
    const r = Math.pow(a.n, b.n);
    if (!Number.isFinite(r)) throw new EvalError(`${a.n} ^ ${b.n} is not a finite number`, at);
    return num(r, dimPow(a.dim, b.n), provisional, a.scale === undefined ? undefined : Math.pow(a.scale, b.n), a.agnostic);
  }

  function call(n: Extract<Node, { kind: "call" }>): Value {
    const name = n.name;

    if (name === "table") {
      if (n.args.length !== 3) throw new EvalError(`table() takes 3 arguments (file, row, column), got ${n.args.length}`, n.at);
      const file = asString(walk(n.args[0] as Node), "table()'s first argument", n.at);
      const ref = asString(walk(n.args[1] as Node), "table()'s second argument", n.at);
      const column = asString(walk(n.args[2] as Node), "table()'s third argument", n.at);
      if (!ctx.tables) throw new EvalError("no reference tables are loaded", n.at);
      const got = ctx.tables.lookup(file, ref, column);
      if ("error" in got) throw new EvalError(got.error, n.at);
      const { value, provisional } = got.lookup;
      if (typeof value === "string") return { kind: "str", s: value, provisional };
      return num(typeof value === "boolean" ? (value ? 1 : 0) : value, dimOf(column), provisional, scaleOf(column), scaleOf(column) === undefined);
    }

    const args = n.args.map((a) => walk(a));
    const provisional = args.some((a) => a.provisional);
    const nums = () => args.map((a, i) => asNumber(a, `argument ${i + 1} of ${name}()`, n.at));
    const arity = (min: number, max = min) => {
      if (args.length < min || args.length > max) {
        throw new EvalError(`${name}() takes ${min === max ? min : `${min} to ${max}`} argument${max === 1 ? "" : "s"}, got ${args.length}`, n.at);
      }
    };
    const dimensionlessOnly = (v: Num) => {
      if (!isDimensionless(v.dim)) warn(`${name}() needs a plain number, but its argument is ${dimName(v.dim)}`);
    };

    switch (name) {
      case "min":
      case "max": {
        if (args.length < 1) throw new EvalError(`${name}() needs at least one argument`, n.at);
        const vs = nums();
        const first = vs[0] as Num;
        for (const v of vs.slice(1)) requireSame(first, v, `${name}()`);
        const picked = name === "min" ? Math.min(...vs.map((v) => v.n)) : Math.max(...vs.map((v) => v.n));
        const known = vs.find((v) => !v.agnostic);
        return num(picked, (known ?? first).dim, provisional, vs.reduce<number | undefined>((s, v) => addScale(s, v.scale), undefined), known === undefined);
      }
      case "abs": {
        arity(1);
        const v = nums()[0] as Num;
        return num(Math.abs(v.n), v.dim, provisional, v.scale, v.agnostic);
      }
      case "floor":
      case "ceil":
      case "round": {
        arity(1);
        const v = nums()[0] as Num;
        const f = name === "floor" ? Math.floor : name === "ceil" ? Math.ceil : Math.round;
        return num(f(v.n), v.dim, provisional, v.scale, v.agnostic);
      }
      case "sqrt": {
        arity(1);
        const v = nums()[0] as Num;
        if (v.n < 0) throw new EvalError(`sqrt() of the negative number ${v.n}`, n.at);
        if (v.dim.some((e) => e % 2 !== 0)) warn(`sqrt() of ${dimName(v.dim)} does not give a whole dimension`);
        return num(Math.sqrt(v.n), dimPow(v.dim, 0.5), provisional, v.scale === undefined ? undefined : Math.sqrt(v.scale), v.agnostic);
      }
      case "pow": {
        arity(2);
        const [a, b] = nums() as [Num, Num];
        return power(a, b, n.at, provisional);
      }
      case "log":
      case "ln":
      case "exp": {
        arity(1);
        const v = nums()[0] as Num;
        dimensionlessOnly(v);
        if ((name === "log" || name === "ln") && v.n <= 0) throw new EvalError(`${name}() of ${v.n}`, n.at);
        const r = name === "log" ? Math.log10(v.n) : name === "ln" ? Math.log(v.n) : Math.exp(v.n);
        if (!Number.isFinite(r)) throw new EvalError(`${name}(${v.n}) is not a finite number`, n.at);
        return freeNum(r, provisional);
      }
      case "clamp": {
        arity(3);
        const [v, lo, hi] = nums() as [Num, Num, Num];
        requireSame(v, lo, "clamp()");
        requireSame(v, hi, "clamp()");
        if (lo.n > hi.n) throw new EvalError(`clamp() was given a low bound (${lo.n}) above its high bound (${hi.n})`, n.at);
        const known = [v, lo, hi].find((x) => !x.agnostic);
        return num(Math.min(hi.n, Math.max(lo.n, v.n)), (known ?? v).dim, provisional, addScale(v.scale, addScale(lo.scale, hi.scale)), known === undefined);
      }
      case "if": {
        arity(3);
        const [cond, a, b] = args as [Value, Value, Value];
        requireSame(a, b, "the two branches of if()");
        return taint(truthy(cond) ? a : b, provisional);
      }
      default:
        throw new EvalError(`there is no function called ${name}()`, n.at);
    }
  }

  const result = walk(node);
  if (result.kind === "num" && !Number.isFinite(result.n)) throw new EvalError("the result is not a finite number");
  return result;
}

export { scaleName, scaleRatio };
