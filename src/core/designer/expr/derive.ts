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
 *  - Dimension and scale complaints are `warn`. They tell you the shape of the
 *    mistake, not that you must fix it.
 *
 * ## Declaring the unit an expression produces
 *
 * A recipe entry is either a bare expression, meaning "this already comes out in
 * the field's own unit":
 *
 * ```yaml
 * derive:
 *   mass_t: "area_m2 * table('radiators', material, 'areal_mass_kg_m2') / 1000"
 * ```
 *
 * or an object declaring what unit it produces, which the engine then converts:
 *
 * ```yaml
 * derive:
 *   heat_rejected_mw:
 *     expr: "emissivity * SIGMA * area_m2 * (temp_k^4 - T_ENV^4)"
 *     unit: W
 * ```
 *
 * The second form exists because `SIGMA` is in SI watts while the field is in
 * megawatts. Writing `/ 1e6` by hand — as the spec's example originally did —
 * works arithmetically but hides the conversion inside a bare literal, which
 * carries no unit and so defeats the scale check entirely. Declaring the unit
 * puts the conversion where the engine can see it, verify it, and do it.
 */
import { parse, identifiersIn, ExprSyntaxError, type Node } from "./parse";
import { evaluate, EvalError, type Value } from "./evaluate";
import { dimEq, dimName, scaleName, scaleRatio, unitBySymbol, unitOfField } from "./dimension";
import type { TableSet } from "../tables";
import { violation, type Violation } from "../violations";

/** A recipe entry: an expression, optionally declaring the unit it produces. */
export type DeriveEntry = string | { expr: string; unit?: string };

export interface DeriveInput {
  /** Authored stat block. Not mutated. */
  stats: Record<string, unknown>;
  /** Recipe parameters. */
  params?: Record<string, unknown>;
  /** Field name → expression, or { expr, unit }. */
  derive?: Record<string, DeriveEntry>;
  /** Fields that keep their authored value. */
  locks?: string[];
  /** Effective constraint-set parameters. */
  constraints?: Record<string, number>;
  tables?: TableSet;
}

export interface DerivedField {
  expression: string;
  /** The unit the recipe declared, when it declared one. */
  declaredUnit?: string;
  /** What the recipe produced, in the field's own unit. */
  value: number | string;
  /** Factor applied to get from the declared unit to the field's unit, when not 1. */
  converted?: number;
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

const exprOf = (entry: DeriveEntry): string => (typeof entry === "string" ? entry : entry.expr);
const unitOf = (entry: DeriveEntry): string | undefined => (typeof entry === "string" ? undefined : entry.unit);

/**
 * Dependency-ordered field list. Kahn's algorithm with an alphabetical
 * tie-break, so a given recipe always evaluates in the same order and two runs
 * of the same design produce byte-identical output.
 *
 * Returns the order plus any fields left in a cycle.
 */
export function evaluationOrder(derive: Record<string, DeriveEntry>, asts: Map<string, Node>): { order: string[]; cyclic: string[] } {
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
function describeCycle(field: string, derive: Record<string, DeriveEntry>, asts: Map<string, Node>): string {
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
    const source = exprOf(derive[field] as DeriveEntry);
    try {
      asts.set(field, parse(source));
    } catch (err) {
      const message = err instanceof ExprSyntaxError ? `${err.message} (at character ${err.at + 1})` : (err as Error).message;
      violations.push(violation("info", `${field}: could not read the expression — ${message}. Keeping the authored value.`, { field, source: "expr" }));
    }
  }

  const parsable = Object.fromEntries(Object.keys(derive).filter((f) => asts.has(f)).map((f) => [f, derive[f] as DeriveEntry]));
  const { order, cyclic } = evaluationOrder(parsable, asts);

  for (const field of cyclic) {
    violations.push(violation("info", `${field}: the recipe is circular (${describeCycle(field, derive, asts)}). Keeping the authored value.`, { field, source: "expr" }));
  }

  for (const field of order) {
    const ast = asts.get(field) as Node;
    const entry = derive[field] as DeriveEntry;
    const source = exprOf(entry);
    const declaredSymbol = unitOf(entry);
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

    const fieldUnit = unitOfField(field);
    let produced = value.kind === "num" ? value.n : value.s;
    let convertedBy: number | undefined;

    if (value.kind === "num" && value.agnostic) {
      // The expression carries no unit of its own, so whatever the recipe says
      // it produces is the only claim there is. Convert on that word alone.
      const declared = declaredSymbol === undefined ? undefined : unitBySymbol(declaredSymbol);
      if (declaredSymbol !== undefined && !declared) {
        violations.push(violation("warn", `${field}: "${declaredSymbol}" is not a unit this engine knows, so the result was taken as already being in ${fieldUnit?.symbol ?? "the field's unit"}.`, { field, source: "expr" }));
      } else if (declared && fieldUnit && !dimEq(declared.dim, fieldUnit.dim)) {
        violations.push(violation("warn", `${field} expects ${dimName(fieldUnit.dim)}, but the recipe declares ${declared.symbol}, which is ${dimName(declared.dim)}`, { field, source: "expr" }));
      } else if (declared && fieldUnit && declared.scale !== fieldUnit.scale) {
        convertedBy = declared.scale / fieldUnit.scale;
        produced = value.n * convertedBy;
      }
    } else if (value.kind === "num") {
      const declared = declaredSymbol === undefined ? undefined : unitBySymbol(declaredSymbol);
      if (declaredSymbol !== undefined && !declared) {
        violations.push(violation("warn", `${field}: "${declaredSymbol}" is not a unit this engine knows, so the result was taken as already being in ${fieldUnit?.symbol ?? "the field's unit"}.`, { field, source: "expr" }));
      }

      // What unit is the expression actually in?
      const producedUnit = declared ?? fieldUnit;

      // Dimension: does the expression compute the right kind of quantity?
      const wantDim = fieldUnit?.dim ?? value.dim;
      const haveDim = declared ? declared.dim : value.dim;
      if (!dimEq(value.dim, haveDim)) {
        violations.push(violation("warn", `${field}: the recipe declares ${declared?.symbol}, which is ${dimName(haveDim)}, but the expression yields ${dimName(value.dim)}`, { field, source: "expr" }));
      } else if (fieldUnit && !dimEq(haveDim, wantDim)) {
        violations.push(violation("warn", `${field} expects ${dimName(wantDim)}, expression yields ${dimName(haveDim)}`, { field, source: "expr" }));
      } else if (!fieldUnit && !dimEq(value.dim, wantDim)) {
        violations.push(violation("warn", `${field} expects ${dimName(wantDim)}, expression yields ${dimName(value.dim)}`, { field, source: "expr" }));
      }

      // Scale: is it in the unit it claims to be in?
      if (value.scale !== undefined && producedUnit && dimEq(value.dim, producedUnit.dim) && value.scale !== producedUnit.scale) {
        const hint = declared
          ? `the recipe declares ${producedUnit.symbol} but the expression works out in ${scaleName(value.dim, value.scale)}`
          : `${field} is in ${producedUnit.symbol} but the expression works out in ${scaleName(value.dim, value.scale)} — out by ${scaleRatio(value.scale, producedUnit.scale)}. Declare the unit the expression produces instead of scaling it by hand.`;
        violations.push(violation("warn", `${field}: ${hint}`, { field, source: "expr" }));
      }

      // Convert from the declared unit into the field's own unit.
      if (declared && fieldUnit && dimEq(declared.dim, fieldUnit.dim) && declared.scale !== fieldUnit.scale) {
        convertedBy = declared.scale / fieldUnit.scale;
        produced = value.n * convertedBy;
      }
    }

    if (value.provisional) provisional.add(field);

    const record: DerivedField = {
      expression: source,
      value: produced,
      provisional: value.provisional,
      ...(declaredSymbol !== undefined ? { declaredUnit: declaredSymbol } : {}),
      ...(convertedBy !== undefined ? { converted: convertedBy } : {}),
    };

    if (locks.has(field)) {
      const authored = input.stats[field];
      const delta = typeof authored === "number" && typeof produced === "number" ? produced - authored : undefined;
      derived[field] = { ...record, locked: { authored, delta } };
      // stats keeps the authored value: a lock wins.
    } else {
      stats[field] = produced;
      derived[field] = record;
    }
  }

  return { stats, derived, provisional, violations };
}
