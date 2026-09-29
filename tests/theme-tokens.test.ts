/**
 * `src/theme.css` is the only source of colour, size and type values
 * (docs/STYLE.md §1). Every `var(--…)` the app reads must be a token defined
 * there, so a renamed or legacy variable fails here rather than silently
 * falling back to the browser default.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const theme = readFileSync(join(ROOT, "src/theme.css"), "utf8");
const defined = new Set([...theme.matchAll(/^\s*--([a-z0-9-]+)\s*:/gm)].map((m) => m[1]));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css)$/.test(name) && !p.endsWith("theme.css")) out.push(p);
  }
  return out;
}

describe("theme tokens", () => {
  it("every var(--…) in src/ is defined in theme.css", () => {
    const missing: string[] = [];
    for (const file of walk(join(ROOT, "src"))) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/var\(--([a-z0-9-]+)[,)]/g)) {
        if (!defined.has(m[1]!)) missing.push(`${file.slice(ROOT.length + 1)}: --${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("no literal colour in src/ outside theme.css and vault seed data", () => {
    // Seed data is written into the vault and read back from there; it is not
    // a palette any renderer draws from directly (docs/STYLE.md §1, §8).
    const SEED = /(schema[\\/]builtin[\\/](bodyTints|polityPalette|bodyPresets)\.ts|ui[\\/]demo\.ts)$/;
    const found: string[] = [];
    for (const file of walk(join(ROOT, "src"))) {
      if (SEED.test(file)) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line) || /description:/.test(line)) return;
          if (/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![-\w])|\brgba?\(|\bhsla?\(/.test(line)) found.push(`${file.slice(ROOT.length + 1)}:${i + 1}`);
        });
    }
    expect(found).toEqual([]);
  });

  it("every hull render Token is defined in theme.css", () => {
    const src = readFileSync(join(ROOT, "src/core/designer/hull/render.ts"), "utf8");
    const union = /export type Token =([^;]+);/.exec(src)?.[1] ?? "";
    const names = [...union.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]!);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n) => !defined.has(n))).toEqual([]);
  });
});
