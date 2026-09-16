/**
 * Recipe derivation (§2.1, §2.3): run a module's `derive` expressions over its
 * authored `stats`.
 *
 * Rules, straight from the spec:
 *  - A derived field overwrites the authored value on every evaluation, unless
 *    it is listed in `locks`. A locked field keeps what the author wrote and
 *    records the delta from what the recipe would have produced, so the UI can
 *    show a lock icon and the gap beside it.
 *  - Fields evaluate in dependency order, so one derived field may read another.
 *  - A cycle, a parse failure or an evaluation failure leaves the authored value
 *    in place and raises an `info`-severity violation. Never an error: a broken
 *    recipe is a half-finished thought, not a broken ship.
 *  - Dimension complaints are `warn`. They tell you the shape of the mistake,
 *    not that you must fix it.
 */
import { parse, identifiersIn, ExprSyntaxError, type Node } from "./parse";
import { evaluate, EvalError, type Value } from "./evaluate";
import { dimEq, dimName, dimOf } from "./dimension";
import type { TableSet } from "../tables";
import { violation, type Violation } from "../violations";

export interface DeriveInput {
  /** Authored stat block. Not mutated. */
  stats: Record<string, unknown>;
  /** Recipe parameters. */
  params?: Record<string, unknown>;
  /** Field name → expression. */
  derive?: Record<string, string>;
  /** Fields that keep their authored value. */
  locks?: string[];
  /** Effective constraint-set parameters. */
  constraints?: Record<string, number>;
  tables?: TableSet;
}

export interface DerivedField {
  expression: string;
  /** What the recipe produced. */
  value: number | string;
  provisional: boolean;
  /** Present when the field is locked: the authored value won, and by how much. */
  locked?: { authored: unknown; delta?: number };
}

export interface DeriveResult {
  /** Authored stats with derived fields written over them (locks excepted). */
  stats: Record<string, unknown>;
  /** Field → what the recipe did, for badges and hover text. */
  derived: Record<string, DerivedField>;
  /** Fields whose value depends on a `provisional: true` table row. */
  provisional: Set<string>;
  violations: Violation[];
}

/**
 * Dependency-ordered field list. Kahn's algorithm with an alphabetical
 * tie-break, so a given recipe always evaluates in the same order and two runs
 * of the same design produce byte-identical output.
 *
 * Returns the order plus any fields left in a cycle.
 */
export function evaluationOrder(derive: Record<string, string>, asts: Map<string, Node>): { order: string[]; cyclic: string[] } {
  const fields = Object.keys(derive).sort();
  const deps = new Map<string, Set<string>>();
  for (const f of fields) {
    const ast = asts.get(f);
    const used = ast ? identifiersIn(ast) : new Set<string>();
    deps.set(f, new Set([...used].filter((id) => id !== f && derive[id] !== undefined).concat(used.has(f) ? [f] : [])));
  }

  const order: string[] = [];
  const remaining = new Set(fields);
  for (;;) {
    const ready = [...remaining].filter((f) => [...(deps.get(f) as Set<string>)].every((d) => !remaining.has(d))).sort();
    if (!ready.length) break;
    for (const f of ready) {
      order.push(f);
      remaining.delete(f);
    }
  }
  return { order, cyclic: [...remaining].sort() };
}

/** Describe a cycle containing `field`, e.g. "mass_t → volume_m3 → mass_t". */
function describeCycle(field: string, derive: Record<string, string>, asts: Map<string, Node>): string {
  const seen: string[] = [];
  let current = field;
  for (let guard = 0; guard < 64; guard++) {
    seen.push(current);
    const ast = asts.get(current);
    const next = ast ? [...identifiersIn(ast)].filter((id) => derive[id] !== undefined).sort()[0] : undefined;
    if (!next) break;
    if (seen.includes(next)) {
      seen.push(next);
      break;
    }
    current = next;
  }
  return seen.join(" → ");
}

export function deriveStats(input: DeriveInput): DeriveResult {
  const derive = input.derive ?? {};
  const locks = new Set(input.locks ?? []);
  const stats: Record<string, unknown> = { ...input.stats };
  const derived: Record<string, DerivedField> = {};
  const provisional = new Set<string>();
  const violations: Violation[] = [];

  // Parse everything first: a field that will not parse never enters the graph.
  const asts = new Map<string, Node>();
  for (const field of Object.keys(derive).sort()) {
    const source = derive[field] as string;
    try {
      asts.set(field, parse(source));
    } catch (err) {
      const message = err instanceof ExprSyntaxError ? `${err.message} (at character ${err.at + 1})` : (err as Error).message;
      violations.push(violation("info", `${field}: could not read the expression — ${message}. Keeping the authored value.`, { field, source: "expr" }));
    }
  }

  const { order, cyclic } = evaluationOrder(
    Object.fromEntries(Object.keys(derive).filter((f) => asts.has(f)).map((f) => [f, derive[f] as string])),
    asts,
  );

  for (const field of cyclic) {
    violations.push(
      violation("info", `${field}: the recipe is circular (${describeCycle(field, derive, asts)}). Keeping the authored value.`, { field, source: "expr" }),
    );
  }

  for (const field of order) {
    const ast = asts.get(field) as Node;
    const source = derive[field] as string;
    const warnings: string[] = [];
    let value: Value;
    try {
      value = evaluate(ast, { params: input.params, stats, constraints: input.constraints, tables: input.tables, warnings });
    } catch (err) {
      const message = err instanceof EvalError ? err.message : (err as Error).message;
      violations.push(violation("info", `${field}: the recipe did not work out — ${message}. Keeping the authored value.`, { field, source: "expr" }));
      continue;
    }

    for (const w of warnings) violations.push(violation("warn", `${field}: ${w}`, { field, source: "expr" }));

    if (value.kind === "num") {
      const want = dimOf(field);
      if (!dimEq(value.dim, want)) {
        violations.push(
          violation("warn", `${field} expects ${dimName(want)}, expression yields ${dimName(value.dim)}`, { field, source: "expr" }),
        );
      }
    }

    const produced = value.kind === "num" ? value.n : value.s;
    if (value.provisional) provisional.add(field);

    if (locks.has(field)) {
      const authored = input.stats[field];
      const delta = typeof authored === "number" && value.kind === "num" ? value.n - authored : undefined;
      derived[field] = { expression: source, value: produced, provisional: value.provisional, locked: { authored, delta } };
      // stats keeps the authored value: a lock wins.
    } else {
      stats[field] = produced;
      derived[field] = { expression: source, value: produced, provisional: value.provisional };
    }
  }

  return { stats, derived, provisional, violations };
}
