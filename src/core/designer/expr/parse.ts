/**
 * Shunting-yard parser: tokens → AST (§2.3).
 *
 * Precedence, loosest to tightest:
 *
 *   1  ? :            right-associative, and lower than everything
 *   2  == !=
 *   3  <  <=  >  >=
 *   4  +  -
 *   5  *  /  %
 *   6  unary -  unary +
 *   7  ^                 right-associative
 *
 * `?` acts as a barrier on the operator stack the way `(` does; `:` sits on top
 * of its `?` and the pair reduces together, popping three operands. That is what
 * makes `a ? b : c ? d : e` nest to the right, and `a + b ? c : d + e` parse as
 * `(a + b) ? c : (d + e)`.
 */
import { ExprSyntaxError, tokenize, type Token } from "./tokenize";

export type Node =
  | { kind: "num"; value: number; at: number }
  | { kind: "str"; value: string; at: number }
  | { kind: "ident"; name: string; at: number }
  | { kind: "unary"; op: "-" | "+"; operand: Node; at: number }
  | { kind: "binary"; op: string; left: Node; right: Node; at: number }
  | { kind: "ternary"; cond: Node; whenTrue: Node; whenFalse: Node; at: number }
  | { kind: "call"; name: string; args: Node[]; at: number };

const BINARY_PRECEDENCE: Record<string, number> = {
  "==": 2,
  "!=": 2,
  "<": 3,
  "<=": 3,
  ">": 3,
  ">=": 3,
  "+": 4,
  "-": 4,
  "*": 5,
  "/": 5,
  "%": 5,
  "^": 7,
};
const RIGHT_ASSOCIATIVE = new Set(["^"]);
const UNARY_PRECEDENCE = 6;
const TERNARY_PRECEDENCE = 1;

type StackEntry =
  | { kind: "binary"; op: string; at: number }
  | { kind: "unary"; op: "-" | "+"; at: number }
  | { kind: "lparen"; at: number }
  | { kind: "func"; name: string; argc: number; at: number }
  | { kind: "question"; at: number }
  | { kind: "colon"; at: number };

const precedenceOf = (e: StackEntry): number =>
  e.kind === "binary" ? BINARY_PRECEDENCE[e.op] : e.kind === "unary" ? UNARY_PRECEDENCE : e.kind === "colon" ? TERNARY_PRECEDENCE : -1;

const isBarrier = (e: StackEntry): boolean => e.kind === "lparen" || e.kind === "func" || e.kind === "question";

export function parse(src: string): Node {
  const tokens = tokenize(src);
  if (!tokens.length) throw new ExprSyntaxError("empty expression", 0);

  const output: Node[] = [];
  const ops: StackEntry[] = [];
  /** True where a value may start: at the beginning, and after any operator. */
  let expectValue = true;

  const popOperand = (at: number): Node => {
    const n = output.pop();
    if (!n) throw new ExprSyntaxError("missing operand", at);
    return n;
  };

  const reduceOne = (): void => {
    const e = ops.pop();
    if (!e) throw new ExprSyntaxError("missing operator", 0);
    if (e.kind === "binary") {
      const right = popOperand(e.at);
      const left = popOperand(e.at);
      output.push({ kind: "binary", op: e.op, left, right, at: e.at });
    } else if (e.kind === "unary") {
      output.push({ kind: "unary", op: e.op, operand: popOperand(e.at), at: e.at });
    } else if (e.kind === "colon") {
      const question = ops.pop();
      if (!question || question.kind !== "question") throw new ExprSyntaxError("a ':' without a matching '?'", e.at);
      const whenFalse = popOperand(e.at);
      const whenTrue = popOperand(e.at);
      const cond = popOperand(e.at);
      output.push({ kind: "ternary", cond, whenTrue, whenFalse, at: question.at });
    } else if (e.kind === "question") {
      throw new ExprSyntaxError("a '?' without a matching ':'", e.at);
    } else {
      throw new ExprSyntaxError("unbalanced parenthesis", e.at);
    }
  };

  /** Reduce while the top is a real operator the caller still outranks. */
  const reduceWhile = (keepGoing: (top: StackEntry) => boolean): void => {
    while (ops.length) {
      const top = ops[ops.length - 1] as StackEntry;
      if (isBarrier(top) || !keepGoing(top)) break;
      reduceOne();
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as Token;

    switch (t.kind) {
      case "number":
        if (!expectValue) throw new ExprSyntaxError(`unexpected number ${t.text}`, t.at);
        output.push({ kind: "num", value: t.value as number, at: t.at });
        expectValue = false;
        break;

      case "string":
        if (!expectValue) throw new ExprSyntaxError("unexpected string", t.at);
        output.push({ kind: "str", value: t.text, at: t.at });
        expectValue = false;
        break;

      case "ident": {
        if (!expectValue) throw new ExprSyntaxError(`unexpected name ${t.text}`, t.at);
        const next = tokens[i + 1];
        if (next && next.kind === "lparen") {
          const after = tokens[i + 2];
          const empty = after !== undefined && after.kind === "rparen";
          ops.push({ kind: "func", name: t.text, argc: empty ? 0 : 1, at: t.at });
          i++; // consume the "("
          if (empty) {
            i++; // consume the ")"
            const f = ops.pop() as Extract<StackEntry, { kind: "func" }>;
            output.push({ kind: "call", name: f.name, args: [], at: f.at });
            expectValue = false;
          } else {
            expectValue = true;
          }
        } else {
          output.push({ kind: "ident", name: t.text, at: t.at });
          expectValue = false;
        }
        break;
      }

      case "op": {
        if (expectValue) {
          if (t.text !== "-" && t.text !== "+") throw new ExprSyntaxError(`${t.text} needs a value on its left`, t.at);
          // Unary is right-associative: never reduce another unary out from under it.
          ops.push({ kind: "unary", op: t.text, at: t.at });
          expectValue = true;
        } else {
          const prec = BINARY_PRECEDENCE[t.text];
          if (prec === undefined) throw new ExprSyntaxError(`unknown operator ${t.text}`, t.at);
          const right = RIGHT_ASSOCIATIVE.has(t.text);
          reduceWhile((top) => (right ? precedenceOf(top) > prec : precedenceOf(top) >= prec));
          ops.push({ kind: "binary", op: t.text, at: t.at });
          expectValue = true;
        }
        break;
      }

      case "lparen":
        if (!expectValue) throw new ExprSyntaxError("unexpected open parenthesis", t.at);
        ops.push({ kind: "lparen", at: t.at });
        expectValue = true;
        break;

      case "rparen": {
        if (expectValue) throw new ExprSyntaxError("unexpected close parenthesis", t.at);
        reduceWhile(() => true);
        const top = ops.pop();
        if (!top || (top.kind !== "lparen" && top.kind !== "func")) throw new ExprSyntaxError("unmatched close parenthesis", t.at);
        if (top.kind === "func") {
          const args: Node[] = [];
          for (let k = 0; k < top.argc; k++) args.unshift(popOperand(t.at));
          output.push({ kind: "call", name: top.name, args, at: top.at });
        }
        expectValue = false;
        break;
      }

      case "comma": {
        if (expectValue) throw new ExprSyntaxError("unexpected comma", t.at);
        reduceWhile(() => true);
        const top = ops[ops.length - 1];
        if (!top || top.kind !== "func") throw new ExprSyntaxError("a comma outside an argument list", t.at);
        top.argc++;
        expectValue = true;
        break;
      }

      case "question":
        if (expectValue) throw new ExprSyntaxError("unexpected '?'", t.at);
        reduceWhile((top) => precedenceOf(top) > TERNARY_PRECEDENCE);
        ops.push({ kind: "question", at: t.at });
        expectValue = true;
        break;

      case "colon": {
        if (expectValue) throw new ExprSyntaxError("unexpected ':'", t.at);
        reduceWhile(() => true);
        const top = ops[ops.length - 1];
        if (!top || top.kind !== "question") throw new ExprSyntaxError("a ':' without a matching '?'", t.at);
        ops.push({ kind: "colon", at: t.at });
        expectValue = true;
        break;
      }
    }
  }

  if (expectValue) throw new ExprSyntaxError("expression ends with an operator", src.length);
  while (ops.length) {
    const top = ops[ops.length - 1] as StackEntry;
    if (top.kind === "lparen" || top.kind === "func") throw new ExprSyntaxError("unmatched open parenthesis", top.at);
    reduceOne();
  }
  if (output.length !== 1) throw new ExprSyntaxError("could not reduce to a single expression", 0);
  return output[0] as Node;
}

/** Every bare identifier in an expression (not function names, not strings). */
export function identifiersIn(node: Node, into: Set<string> = new Set()): Set<string> {
  switch (node.kind) {
    case "ident":
      into.add(node.name);
      break;
    case "unary":
      identifiersIn(node.operand, into);
      break;
    case "binary":
      identifiersIn(node.left, into);
      identifiersIn(node.right, into);
      break;
    case "ternary":
      identifiersIn(node.cond, into);
      identifiersIn(node.whenTrue, into);
      identifiersIn(node.whenFalse, into);
      break;
    case "call":
      for (const a of node.args) identifiersIn(a, into);
      break;
  }
  return into;
}

export { ExprSyntaxError };
