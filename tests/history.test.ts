/**
 * The history stack on its own (doc 11 §1.2–1.3, §1.9): pointers, redo clearing, depth, and
 * coalescing on and off each §1.3 condition. No repository.
 */
import { describe, expect, it } from "vitest";
import { COALESCE_MS, History, entryLabel, type Entry, type NewStep } from "../src/core/history";
import type { TypedRecord } from "../src/core/types";

const rec = (id: string, fields: Record<string, unknown>, name = "Mars"): TypedRecord => ({
  id,
  type: "body",
  name,
  slug: name.toLowerCase(),
  tags: [],
  aliases: [],
  links: [],
  assets: [],
  fields,
  created: "2026-09-29T00:00:00.000Z",
  updated: "2026-09-29T00:00:00.000Z",
});
const side = (id: string, fields: Record<string, unknown>, name = "Mars") => ({ path: `bodies/${name.toLowerCase()}.body.yaml`, text: JSON.stringify({ id, name, fields }), record: rec(id, fields, name) });
const edit = (id: string, a: Record<string, unknown>, b: Record<string, unknown>, extra: Partial<NewStep> = {}): NewStep => ({
  label: `EDIT ${id}`,
  origin: "editor-1",
  entries: [{ id, before: side(id, a), after: side(id, b) }],
  ...extra,
});
const plain = (n: number): NewStep => ({ label: `STEP ${n}`, entries: [{ id: `r${n}`, before: null, after: side(`r${n}`, {}) }] });

describe("History — pointers", () => {
  it("push, undo and redo move steps between the stacks", () => {
    const h = new History();
    let calls = 0;
    h.subscribe(() => calls++);
    const [a, b, c] = [h.push(plain(1), 0), h.push(plain(2), 10), h.push(plain(3), 20)];
    expect(h.past).toEqual([a, b, c]);
    expect([a.seq, b.seq, c.seq]).toEqual([1, 2, 3]);
    expect(c.at).toBe(20);
    expect(h.peekUndo()).toBe(c);
    expect(h.peekRedo()).toBeUndefined();

    h.commitUndo();
    h.commitUndo();
    expect(h.past).toEqual([a]);
    expect(h.future).toEqual([c, b]);
    expect(h.peekUndo()).toBe(a);
    expect(h.peekRedo()).toBe(b);

    h.commitRedo();
    expect(h.past).toEqual([a, b]);
    expect(h.future).toEqual([c]);
    expect(calls).toBe(6);
    expect(h.version).toBe(6);
  });

  it("commit names the step it applied, so a write landing on top meanwhile is left alone", () => {
    const h = new History();
    const a = h.push(plain(1), 0);
    const b = h.push(plain(2), 1);
    h.commitUndo(a); // a was being undone while b arrived
    expect(h.past).toEqual([b]);
    expect(h.future).toEqual([a]);
    h.commitUndo(a); // not in past any more: nothing moves
    expect(h.past).toEqual([b]);
  });

  it("a new step clears redo", () => {
    const h = new History();
    h.push(plain(1), 0);
    h.push(plain(2), 1);
    h.commitUndo();
    expect(h.future).toHaveLength(1);
    h.push(plain(3), 2);
    expect(h.future).toEqual([]);
    expect(h.past.map((s) => s.label)).toEqual(["STEP 1", "STEP 3"]);
  });

  it("keeps 200 steps, dropping the oldest", () => {
    const h = new History();
    expect(h.depth).toBe(200);
    for (let i = 1; i <= 201; i++) h.push(plain(i), i);
    expect(h.past).toHaveLength(200);
    expect(h.past[0].label).toBe("STEP 2");
    expect(h.peekUndo()!.label).toBe("STEP 201");
  });

  it("clear empties both stacks", () => {
    const h = new History();
    h.push(plain(1), 0);
    h.push(plain(2), 0);
    h.commitUndo();
    h.clear();
    expect([h.past, h.future]).toEqual([[], []]);
  });
});

describe("History — coalescing (§1.3)", () => {
  it("folds a burst into the previous step: earlier before, newer after", () => {
    const h = new History();
    h.push(edit("m", { a: 1 }, { a: 2 }), 1000);
    const first = h.past[0];
    const s = h.push(edit("m", { a: 2 }, { a: 3 }), 1000 + COALESCE_MS - 1);
    expect(s).toBe(first); // folded in place: a commit naming the step still finds it
    expect(h.past).toHaveLength(1);
    expect(h.past[0]).toBe(s);
    expect(s.seq).toBe(1);
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0].before!.record).toEqual(rec("m", { a: 1 }));
    expect(s.entries[0].after!.record).toEqual(rec("m", { a: 3 }));
    expect(s.label).toBe("EDIT MARS — fields: a"); // labelled for the whole span
    expect(s.at).toBe(1000 + COALESCE_MS - 1);
  });

  it("measures the 4 s from the last burst folded in, so steady typing stays one step", () => {
    const h = new History();
    for (let i = 0; i < 5; i++) h.push(edit("m", { a: i }, { a: i + 1 }), i * 3000);
    expect(h.past).toHaveLength(1);
    expect(h.past[0].entries[0].before!.record).toEqual(rec("m", { a: 0 }));
    expect(h.past[0].entries[0].after!.record).toEqual(rec("m", { a: 5 }));
  });

  const offCases: [string, (h: History) => NewStep, number?][] = [
    ["4 s or more after the previous step", () => edit("m", { a: 2 }, { a: 3 }), COALESCE_MS],
    ["a different origin", () => edit("m", { a: 2 }, { a: 3 }, { origin: "editor-2" })],
    ["no origin", () => edit("m", { a: 2 }, { a: 3 }, { origin: undefined })],
    ["a different record", () => edit("n", { a: 2 }, { a: 3 })],
    ["different parts changed", () => edit("m", { a: 2 }, { a: 2, b: 1 })],
    [
      "more than one entry in the new step",
      () => ({ ...edit("m", { a: 2 }, { a: 3 }), entries: [...edit("m", { a: 2 }, { a: 3 }).entries, ...edit("n", {}, { a: 1 }).entries] }),
    ],
    ["a create", () => ({ label: "CREATE", origin: "editor-1", entries: [{ id: "m", before: null, after: side("m", { a: 3 }) }] })],
    ["a delete", () => ({ label: "DELETE", origin: "editor-1", entries: [{ id: "m", before: side("m", { a: 2 }), after: null }] })],
  ];
  for (const [what, next, gap] of offCases) {
    it(`does not fold ${what}`, () => {
      const h = new History();
      h.push(edit("m", { a: 1 }, { a: 2 }), 0);
      h.push(next(h), gap ?? 100);
      expect(h.past).toHaveLength(2);
    });
  }

  it("does not fold into a previous step with more than one entry", () => {
    const h = new History();
    h.push({ ...edit("m", { a: 1 }, { a: 2 }), entries: [...edit("m", { a: 1 }, { a: 2 }).entries, ...edit("n", {}, { a: 1 }).entries] }, 0);
    h.push(edit("m", { a: 2 }, { a: 3 }), 100);
    expect(h.past).toHaveLength(2);
  });

  it("does not fold when the file changed between the bursts (an external edit picked up by a reload)", () => {
    const h = new History();
    h.push(edit("m", { a: 1 }, { a: 2 }), 0);
    h.push(edit("m", { a: 2, ext: true }, { a: 3, ext: true }), 100);
    expect(h.past).toHaveLength(2);
  });

  it("relabels a folded rename for the whole span", () => {
    const h = new History();
    const e = (a: string, b: string): NewStep => ({ label: "x", origin: "editor-1", entries: [{ id: "m", before: side("m", {}, a), after: side("m", {}, b) }] });
    h.push(e("Ares", "AresX"), 0);
    h.push(e("AresX", "AresXY"), 100);
    expect(h.past).toHaveLength(1);
    expect(h.past[0].label).toBe("RENAME ARES → ARESXY — file");
  });

  it("does not fold when something has been undone (redo is pending)", () => {
    const h = new History();
    h.push(edit("m", { a: 1 }, { a: 2 }), 0);
    h.push(plain(9), 50);
    h.commitUndo(); // top of past is the edit again, but redo holds STEP 9
    h.push(edit("m", { a: 2 }, { a: 3 }), 100);
    expect(h.past).toHaveLength(2);
    expect(h.future).toEqual([]);
  });

  it("does not fold into a step that is no longer the top of past", () => {
    const h = new History();
    h.push(edit("m", { a: 1 }, { a: 2 }), 0);
    h.push(plain(9), 50); // another write lands in between
    h.push(edit("m", { a: 2 }, { a: 3 }), 100);
    expect(h.past.map((s) => s.entries[0].id)).toEqual(["m", "r9", "m"]);
  });
});

describe("step labels", () => {
  const e = (before: Entry["before"], after: Entry["after"]): Entry => ({ id: "m", before, after });
  it("name the verb, the record upper-cased and what changed", () => {
    expect(entryLabel(e(side("m", { sma_au: 1 }), side("m", { sma_au: 1.5 })))).toBe("EDIT MARS — fields: sma_au");
    expect(entryLabel(e(null, side("m", {})))).toBe("CREATE MARS");
    expect(entryLabel(e(side("m", {}, "Sword"), null))).toBe("DELETE SWORD");
    expect(entryLabel(e(side("m", {}, "Ares"), side("m", { x: 1 }, "Mars")))).toBe("RENAME ARES → MARS — file · fields: x");
    expect(entryLabel(e(side("m", {}), side("m", {})))).toBe("EDIT MARS");
  });
});
