/**
 * AST interpreter for the expression layer (§2.3).
 *
 * Every value carries three things: a number, a dimension, and whether it is
 * tainted by a provisional table row. All three propagate through the
 * arithmetic, which is the point — a mass derived from an unsourced areal
 * density is itself unsourced, and the UI has to say so.
 *
 * Dimension mismatches are collected as warnings and never stop evaluation
 * (§2.3: "a warning, not a hard failure, since users will write shortcuts").
 * Genuine failures — an unresolvable name, a bad argument count, a non-finite
 * result — throw `EvalError`, which the derivation layer turns into an
 * `info` violation while keeping the authored value.
 */
import type { Node } from "./parse";
import { DIMENSIONLESS, dimDiv, dimEq, dimMul, dimName, dimOf, dimPow, isDimensionless, type Dim } from "./dimension";
import type { TableSet } from "../tables";

export type Value =
  | { kind: "num"; n: number; dim: Dim; provisional: boolean }
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
 * Physical constants. Sourced, per §0:
 *  - SIGMA  Stefan-Boltzmann, CODATA 2018 exact value; `_tables/radiators.yaml`
 *           quotes the same figure truncated to 5.670374e-8.
 *  - G0     standard gravity, ISO 80000-3 / CGPM 1901; already used by budgets.ts.
 *  - T_ENV  comes from the constraint set (§2.8). The fallback is the cosmic
 *           microwave background, Fixsen 2009, ApJ 707:916 — the coldest sink a
 *           radiator can see with no nearby body or star.
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
  /** Dimension complaints land here; evaluation carries on regardless. */
  warnings?: string[];
}

const num = (n: number, dim: Dim = DIMENSIONLESS, provisional = false): Value => ({ kind: "num", n, dim, provisional });

const asNumber = (v: Value, what: string, at: number): Extract<Value, { kind: "num" }> => {
  if (v.kind !== "num") throw new EvalError(`${what} needs a number, got the text "${v.s}"`, at);
  return v;
};

const asString = (v: Value, what: string, at: number): string => {
  if (v.kind === "str") return v.s;
  throw new EvalError(`${what} needs a name in quotes, got the number ${v.n}`, at);
};

const truthy = (v: Value): boolean => (v.kind === "num" ? v.n !== 0 : v.s.length > 0);

/** Coerce a YAML scalar to a Value, tagging its dimension from the field name. */
function fromScalar(name: string, raw: unknown): Value | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return num(raw, dimOf(name));
  if (typeof raw === "string") return { kind: "str", s: raw, provisional: false };
  if (typeof raw === "boolean") return num(raw ? 1 : 0);
  return undefined;
}

export function evaluate(node: Node, ctx: EvalContext = {}): Value {
  const warn = (message: string) => ctx.warnings?.push(message);

  const requireSame = (a: Value, b: Value, what: string): void => {
    if (a.kind !== "num" || b.kind !== "num") return;
    if (!dimEq(a.dim, b.dim)) warn(`${what} mixes ${dimName(a.dim)} and ${dimName(b.dim)}`);
  };

  const walk = (n: Node): Value => {
    switch (n.kind) {
      case "num":
        return num(n.value);

      case "str":
        return { kind: "str", s: n.value, provisional: false };

      case "ident":
        return resolve(n.name, n.at);

      case "unary": {
        const v = asNumber(walk(n.operand), `unary ${n.op}`, n.at);
        return num(n.op === "-" ? -v.n : v.n, v.dim, v.provisional);
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

  const taint = (v: Value, provisional: boolean): Value => (v.kind === "num" ? { ...v, provisional: v.provisional || provisional } : { ...v, provisional: v.provisional || provisional });

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
    if (name === "SIGMA") return num(SIGMA, [1, 0, -3, -4]);
    if (name === "G0") return num(G0, [0, 1, -2, 0]);
    if (name === "PI") return num(Math.PI);
    if (name === "T_ENV") return num(ctx.constraints?.T_ENV ?? DEFAULT_T_ENV, [0, 0, 0, 1]);
    const fromConstraints = ctx.constraints?.[name];
    if (typeof fromConstraints === "number" && Number.isFinite(fromConstraints)) return num(fromConstraints, dimOf(name));
    throw new EvalError(`nothing named "${name}" — not a recipe parameter, another stat, a constant, or a constraint-set parameter`, at);
  }

  function binary(n: Extract<Node, { kind: "binary" }>): Value {
    const left = walk(n.left);
    const right = walk(n.right);
    const provisional = left.provisional || right.provisional;

    if (n.op === "==" || n.op === "!=") {
      const equal = left.kind === "str" || right.kind === "str" ? left.kind === right.kind && (left.kind === "str" ? left.s === (right as typeof left).s : false) : (left as Extract<Value, { kind: "num" }>).n === (right as Extract<Value, { kind: "num" }>).n;
      requireSame(left, right, `comparison with ${n.op}`);
      return num((n.op === "==" ? equal : !equal) ? 1 : 0, DIMENSIONLESS, provisional);
    }

    const a = asNumber(left, `the left side of ${n.op}`, n.at);
    const b = asNumber(right, `the right side of ${n.op}`, n.at);

    switch (n.op) {
      case "+":
      case "-":
        requireSame(a, b, `${n.op === "+" ? "addition" : "subtraction"}`);
        return num(n.op === "+" ? a.n + b.n : a.n - b.n, a.dim, provisional);
      case "*":
        return num(a.n * b.n, dimMul(a.dim, b.dim), provisional);
      case "/":
        if (b.n === 0) throw new EvalError("division by zero", n.at);
        return num(a.n / b.n, dimDiv(a.dim, b.dim), provisional);
      case "%":
        if (b.n === 0) throw new EvalError("remainder by zero", n.at);
        requireSame(a, b, "remainder");
        return num(a.n % b.n, a.dim, provisional);
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

  function power(a: Extract<Value, { kind: "num" }>, b: Extract<Value, { kind: "num" }>, at: number, provisional: boolean): Value {
    if (!isDimensionless(b.dim)) warn(`an exponent must be a plain number, but this one is ${dimName(b.dim)}`);
    if (!isDimensionless(a.dim) && !Number.isInteger(b.n)) warn(`raising ${dimName(a.dim)} to the power ${b.n} does not give a whole dimension`);
    const r = Math.pow(a.n, b.n);
    if (!Number.isFinite(r)) throw new EvalError(`${a.n} ^ ${b.n} is not a finite number`, at);
    return num(r, dimPow(a.dim, b.n), provisional);
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
      return num(typeof value === "boolean" ? (value ? 1 : 0) : value, dimOf(column), provisional);
    }

    const args = n.args.map((a) => walk(a));
    const provisional = args.some((a) => a.provisional);
    const nums = () => args.map((a, i) => asNumber(a, `argument ${i + 1} of ${name}()`, n.at));
    const arity = (min: number, max = min) => {
      if (args.length < min || args.length > max) {
        throw new EvalError(`${name}() takes ${min === max ? min : `${min} to ${max}`} argument${max === 1 ? "" : "s"}, got ${args.length}`, n.at);
      }
    };
    const dimensionlessOnly = (v: Extract<Value, { kind: "num" }>) => {
      if (!isDimensionless(v.dim)) warn(`${name}() needs a plain number, but its argument is ${dimName(v.dim)}`);
    };

    switch (name) {
      case "min":
      case "max": {
        if (args.length < 1) throw new EvalError(`${name}() needs at least one argument`, n.at);
        const vs = nums();
        const first = vs[0] as Extract<Value, { kind: "num" }>;
        for (const v of vs.slice(1)) if (!dimEq(v.dim, first.dim)) warn(`${name}() compares ${dimName(first.dim)} with ${dimName(v.dim)}`);
        const picked = name === "min" ? Math.min(...vs.map((v) => v.n)) : Math.max(...vs.map((v) => v.n));
        return num(picked, first.dim, provisional);
      }
      case "abs": {
        arity(1);
        const v = nums()[0] as Extract<Value, { kind: "num" }>;
        return num(Math.abs(v.n), v.dim, provisional);
      }
      case "floor":
      case "ceil":
      case "round": {
        arity(1);
        const v = nums()[0] as Extract<Value, { kind: "num" }>;
        const f = name === "floor" ? Math.floor : name === "ceil" ? Math.ceil : Math.round;
        return num(f(v.n), v.dim, provisional);
      }
      case "sqrt": {
        arity(1);
        const v = nums()[0] as Extract<Value, { kind: "num" }>;
        if (v.n < 0) throw new EvalError(`sqrt() of the negative number ${v.n}`, n.at);
        if (v.dim.some((e) => e % 2 !== 0)) warn(`sqrt() of ${dimName(v.dim)} does not give a whole dimension`);
        return num(Math.sqrt(v.n), dimPow(v.dim, 0.5), provisional);
      }
      case "pow": {
        arity(2);
        const [a, b] = nums() as [Extract<Value, { kind: "num" }>, Extract<Value, { kind: "num" }>];
        return power(a, b, n.at, provisional);
      }
      case "log":
      case "ln":
      case "exp": {
        arity(1);
        const v = nums()[0] as Extract<Value, { kind: "num" }>;
        dimensionlessOnly(v);
        if ((name === "log" || name === "ln") && v.n <= 0) throw new EvalError(`${name}() of ${v.n}`, n.at);
        const r = name === "log" ? Math.log10(v.n) : name === "ln" ? Math.log(v.n) : Math.exp(v.n);
        if (!Number.isFinite(r)) throw new EvalError(`${name}(${v.n}) is not a finite number`, n.at);
        return num(r, DIMENSIONLESS, provisional);
      }
      case "clamp": {
        arity(3);
        const [v, lo, hi] = nums() as [Extract<Value, { kind: "num" }>, Extract<Value, { kind: "num" }>, Extract<Value, { kind: "num" }>];
        if (!dimEq(v.dim, lo.dim) || !dimEq(v.dim, hi.dim)) warn(`clamp() mixes ${dimName(v.dim)} with ${dimName(lo.dim)} and ${dimName(hi.dim)}`);
        if (lo.n > hi.n) throw new EvalError(`clamp() was given a low bound (${lo.n}) above its high bound (${hi.n})`, n.at);
        return num(Math.min(hi.n, Math.max(lo.n, v.n)), v.dim, provisional);
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
