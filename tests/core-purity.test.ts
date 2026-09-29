/**
 * Core purity (AUDIT F7, CLAUDE.md "src/core/ stays framework-free", doc 10 §8): nothing under
 * `src/core/` may import React, the UI, Tauri or Node, and none of it may reach for the browser's
 * globals. Adapters are the two named exceptions below. Runs with `npm test`, so CI enforces it.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import ts from "typescript";

const CORE = path.resolve(__dirname, "../src/core");
const rel = (f: string) => path.relative(CORE, f).split(path.sep).join("/");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** The adapters that are allowed exactly one kind of outside import, with the reason. */
const ALLOWED_TAURI = new Set(["storage/tauri.ts"]); // the desktop StorageAdapter is the Tauri bridge
const ALLOWED_NODE = new Set(["storage/node.ts"]); // the CLI StorageAdapter reads the real disk
/** Browser globals core may name, per file, with the reason. Everything else is a violation. */
const ALLOWED_GLOBALS: Record<string, { names: string[]; why: string }> = {
  "storage/tauri.ts": { names: ["window"], why: "detects the Tauri shell" },
  "codec/svg.ts": { names: ["DOMParser"], why: "injectable parser for sanitizeSvg; core tests pass their own" },
};
const BROWSER_GLOBALS = new Set(["window", "document", "localStorage", "sessionStorage", "navigator", "DOMParser", "HTMLElement", "Element", "requestAnimationFrame", "ResizeObserver", "indexedDB"]);

const isNodeBuiltin = (spec: string) => spec.startsWith("node:") || builtinModules.includes(spec.split("/")[0]);
const isReact = (spec: string) => /^react(-dom)?(\/|$)/.test(spec) || spec.startsWith("@types/react");

const files = walk(CORE);
const sources = files.filter((f) => /\.(ts|tsx|mts|js|jsx)$/.test(f));

describe("src/core stays framework-free", () => {
  it("has files to check", () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it("contains no JSX files", () => {
    expect(files.filter((f) => /\.(tsx|jsx)$/.test(f)).map(rel)).toEqual([]);
  });

  it("imports no React, UI, Tauri or Node module outside the two adapters", () => {
    const violations: string[] = [];
    for (const file of sources) {
      const r = rel(file);
      const text = readFileSync(file, "utf8");
      // preProcessFile ignores comments and strings, and sees `import x from`, `export … from`, `import()` and `require()`.
      for (const imp of ts.preProcessFile(text, true, true).importedFiles) {
        const spec = imp.fileName;
        if (spec.startsWith(".")) {
          const target = path.resolve(path.dirname(file), spec);
          if (target !== CORE && !target.startsWith(CORE + path.sep)) violations.push(`${r}: "${spec}" leaves src/core (the UI, App and main live outside it)`);
        } else if (isReact(spec)) violations.push(`${r}: "${spec}" — React`);
        else if (spec.startsWith("@tauri-apps/")) {
          if (!ALLOWED_TAURI.has(r)) violations.push(`${r}: "${spec}" — Tauri belongs in storage/tauri.ts`);
        } else if (isNodeBuiltin(spec)) {
          if (!ALLOWED_NODE.has(r)) violations.push(`${r}: "${spec}" — Node belongs in storage/node.ts`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("names no browser global outside the listed exceptions", () => {
    const violations: string[] = [];
    /** `x.window`, `{ window: 1 }`, a parameter called `document`: a name, not the global. */
    const declaresName = (n: ts.Identifier) => {
      const p = n.parent;
      if (ts.isPropertyAccessExpression(p)) return p.name === n;
      return (ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isBindingElement(p) || ts.isParameter(p) || ts.isVariableDeclaration(p)) && p.name === n;
    };
    /** A DOM type in an annotation (`el: Element`) costs nothing at runtime. */
    const inTypePosition = (n: ts.Node) => {
      for (let p = n.parent; p; p = p.parent) if (ts.isTypeNode(p)) return true;
      return false;
    };
    for (const file of sources) {
      const r = rel(file);
      const allowed = new Set(ALLOWED_GLOBALS[r]?.names ?? []);
      const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true);
      const visit = (n: ts.Node) => {
        if (ts.isIdentifier(n) && BROWSER_GLOBALS.has(n.text) && !allowed.has(n.text) && !declaresName(n) && !inTypePosition(n)) {
          violations.push(`${r}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}: \`${n.text}\``);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(violations).toEqual([]);
  });

  it("the exceptions are still needed (delete the entry when the file stops using it)", () => {
    for (const [r, { names }] of Object.entries(ALLOWED_GLOBALS)) {
      const text = readFileSync(path.join(CORE, r), "utf8");
      for (const n of names) expect(new RegExp(`\\b${n}\\b`).test(text), `${r} no longer mentions ${n}`).toBe(true);
    }
    for (const r of [...ALLOWED_TAURI, ...ALLOWED_NODE]) expect(files.map(rel)).toContain(r);
  });

  it("import detection sees through comments and dynamic imports", () => {
    const imports = (src: string) => ts.preProcessFile(src, true, true).importedFiles.map((i) => i.fileName);
    expect(imports(`import React from "react"; // import x from "nope"\nconst a = await import("react-dom/client");`)).toEqual(["react", "react-dom/client"]);
    expect(isReact("react-dom/client") && isReact("react") && !isReact("reactive-thing")).toBe(true);
    expect(isNodeBuiltin("node:fs") && isNodeBuiltin("fs/promises") && !isNodeBuiltin("yaml")).toBe(true);
  });
});
