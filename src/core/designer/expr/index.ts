/**
 * The expression layer (§2.3) — the escape hatch that lets a module derive its
 * stats from physics instead of from a table.
 *
 * Tokenizer to shunting-yard to AST to interpreter, with no `eval`, no
 * `new Function`, and nothing that turns vault data into executable code.
 */
export { tokenize, ExprSyntaxError, type Token, type TokenKind } from "./tokenize";
export { parse, identifiersIn, type Node } from "./parse";
export { evaluate, EvalError, SIGMA, G0, DEFAULT_T_ENV, type Value, type EvalContext } from "./evaluate";
export { deriveStats, evaluationOrder, type DeriveInput, type DeriveResult, type DerivedField, type DeriveEntry } from "./derive";
export {
  DIMENSIONLESS,
  dimEq,
  dimMul,
  dimDiv,
  dimPow,
  dimName,
  dimOf,
  isDimensionless,
  scaleOf,
  scaleName,
  scaleRatio,
  unitOfField,
  unitBySymbol,
  UNITS_BY_SYMBOL,
  type Dim,
  type Unit,
} from "./dimension";
