/**
 * Tokenizer for the expression layer (§2.3).
 *
 * Hand-written, character by character. There is no `eval`, no `new Function`
 * and no regex-driven "parse by replacement" anywhere in this pipeline: a
 * recipe is data, and data from a vault file never becomes code.
 */

export type TokenKind = "number" | "string" | "ident" | "op" | "lparen" | "rparen" | "comma" | "question" | "colon";

export interface Token {
  kind: TokenKind;
  /** Source text of the token; for strings, the unquoted contents. */
  text: string;
  /** Parsed value for number tokens. */
  value?: number;
  /** Index in the source, for error messages. */
  at: number;
}

export class ExprSyntaxError extends Error {
  constructor(
    message: string,
    readonly at: number,
  ) {
    super(message);
    this.name = "ExprSyntaxError";
  }
}

const OPERATORS = ["<=", ">=", "==", "!=", "<", ">", "+", "-", "*", "/", "^", "%"];

const isDigit = (c: string) => c >= "0" && c <= "9";
const isIdentStart = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c);

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }

    if (isDigit(c) || (c === "." && isDigit(src[i + 1] ?? ""))) {
      const start = i;
      while (i < src.length && isDigit(src[i])) i++;
      if (src[i] === ".") {
        i++;
        while (i < src.length && isDigit(src[i])) i++;
      }
      if (src[i] === "e" || src[i] === "E") {
        const mark = i;
        i++;
        if (src[i] === "+" || src[i] === "-") i++;
        if (isDigit(src[i] ?? "")) while (i < src.length && isDigit(src[i])) i++;
        else i = mark; // not an exponent after all, e.g. "2erg"
      }
      const text = src.slice(start, i);
      const value = Number(text);
      if (!Number.isFinite(value)) throw new ExprSyntaxError(`"${text}" is not a number`, start);
      out.push({ kind: "number", text, value, at: start });
      continue;
    }

    if (c === '"' || c === "'") {
      const start = i;
      const quote = c;
      i++;
      let text = "";
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < src.length) i++;
        text += src[i];
        i++;
      }
      if (i >= src.length) throw new ExprSyntaxError(`unterminated string`, start);
      i++; // closing quote
      out.push({ kind: "string", text, at: start });
      continue;
    }

    if (isIdentStart(c)) {
      const start = i;
      while (i < src.length && isIdentPart(src[i])) i++;
      out.push({ kind: "ident", text: src.slice(start, i), at: start });
      continue;
    }

    if (c === "(") { out.push({ kind: "lparen", text: c, at: i++ }); continue; }
    if (c === ")") { out.push({ kind: "rparen", text: c, at: i++ }); continue; }
    if (c === ",") { out.push({ kind: "comma", text: c, at: i++ }); continue; }
    if (c === "?") { out.push({ kind: "question", text: c, at: i++ }); continue; }
    if (c === ":") { out.push({ kind: "colon", text: c, at: i++ }); continue; }

    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      out.push({ kind: "op", text: op, at: i });
      i += op.length;
      continue;
    }

    throw new ExprSyntaxError(`unexpected character "${c}"`, i);
  }
  return out;
}
