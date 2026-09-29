// @vitest-environment jsdom
/**
 * Undo/redo through the real screens (doc 11 §1.9, S1 PR 3b): the record form, the hull editor's
 * canvas, the map drag, and the two multi-record operations (skeleton generate, import), each
 * against an in-memory vault behind a write spy. Ctrl+Z goes through the same key router the app
 * installs.
 *
 * Timers are faked (setTimeout only) so the 900 ms autosave is advanced by hand; `Date.now` is
 * real, which is what the 4 s coalescing window reads.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "../src/App";
import { actions, getApp, historyToast, type View } from "../src/ui/state";
import { sessionLog } from "../src/ui/log";
import { demoVault } from "../src/ui/demo";
import { Repository } from "../src/core/repo";
import { SpyAdapter } from "./helpers/spyAdapter";
import { installBrowserShims } from "./helpers/browserShims";

beforeAll(installBrowserShims);
vi.setConfig({ testTimeout: 60_000 });

let spy: SpyAdapter;
let container: HTMLElement;
/** The test's own reader of the same adapter (the app has its own Repository). */
let repo: Repository;

const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(2500)));
const go = async (view: View) => {
  await act(async () => actions.navigate(view));
  await flush();
};
const key = async (target: Element, init: Partial<KeyboardEventInit> & { key: string }) => {
  let event!: KeyboardEvent;
  await act(async () => {
    event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    await vi.advanceTimersByTimeAsync(50);
  });
  return event;
};
const ctrlZ = (target: Element = document.body) => key(target, { key: "z", ctrlKey: true });
const toast = () => container.querySelector(".toast")?.textContent ?? null;
const text = (path: string) => spy.inner.dump()[path];
const field = (label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const type = async (el: HTMLInputElement, value: string) => act(async () => void fireEvent.change(el, { target: { value } }));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  spy = new SpyAdapter();
  await demoVault(spy);
  repo = new Repository(spy);
  await repo.load();
  ({ container } = render(<App />));
  await act(async () => void (await actions.openVault(spy)));
  await flush();
  actions.toast(null); // the store outlives the test: a toast left by the last one is not this one's
  spy.reset();
});
afterEach(async () => {
  await act(async () => void (await actions.closeVault()));
  cleanup();
  vi.useRealTimers();
});

const polity = () => repo.ofType("polity")[0];

describe("undo on the record form", () => {
  it("an edit, autosaved, is undone by Ctrl+Z: the field and the file are back as they were", async () => {
    const { record, location } = polity();
    const before = text(location.path);
    await go({ kind: "record", id: record.id });
    const summary = field("Summary");
    const old = summary.value;
    await type(summary, "A brand new summary");
    await flush(); // the 900 ms autosave
    await act(async () => void fireEvent.blur(summary));
    expect(text(location.path)).not.toBe(before);

    const e = await ctrlZ();
    expect(e.defaultPrevented).toBe(true);
    expect(text(location.path)).toBe(before); // byte-identical
    expect(field("Summary").value).toBe(old); // the clean draft followed the repository
    expect(toast()).toMatch(/^UNDONE — EDIT /);
  });

  it("redo puts it back: Ctrl+Shift+Z and Ctrl+Y", async () => {
    const { record, location } = polity();
    await go({ kind: "record", id: record.id });
    await type(field("Summary"), "Redo me");
    await flush();
    const edited = text(location.path);
    await ctrlZ();
    expect(field("Summary").value).not.toBe("Redo me");

    await key(document.body, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(text(location.path)).toBe(edited);
    expect(field("Summary").value).toBe("Redo me");
    expect(toast()).toMatch(/^REDONE — EDIT /);

    await ctrlZ();
    await key(document.body, { key: "y", ctrlKey: true });
    expect(text(location.path)).toBe(edited);
  });

  it("an edit still waiting for its autosave is saved first, and is the step that comes off", async () => {
    const { record, location } = polity();
    const before = text(location.path);
    await go({ kind: "record", id: record.id });
    const old = field("Summary").value;
    await type(field("Summary"), "Typed, then straight to Ctrl+Z");
    await ctrlZ(); // no pause: nothing has been written yet
    expect(text(location.path)).toBe(before);
    expect(field("Summary").value).toBe(old);
    expect(toast()).toMatch(/^UNDONE — EDIT /);
    await flush();
    expect(text(location.path)).toBe(before); // and the undone edit is not saved again
  });

  it("Ctrl+Z in a text field is the browser's own text undo, not the app's", async () => {
    const { record, location } = polity();
    await go({ kind: "record", id: record.id });
    await type(field("Summary"), "Edited");
    await flush();
    const edited = text(location.path);
    const input = field("Summary");
    input.focus();
    expect(document.activeElement).toBe(input);
    const e = await ctrlZ(input);
    expect(e.defaultPrevented).toBe(false);
    expect(text(location.path)).toBe(edited);
    expect(toast()).toBeNull();
    // A checkbox is not a text entry: there the app takes it.
    const box = container.querySelector<HTMLInputElement>("input[type=checkbox]");
    if (box) {
      box.focus();
      expect((await ctrlZ(box)).defaultPrevented).toBe(true);
    }
  });

  it("nothing to undo is not a refusal: no toast, no log line", async () => {
    await go({ kind: "record", id: polity().record.id });
    const lines = sessionLog().lines.length;
    await ctrlZ();
    await key(document.body, { key: "z", ctrlKey: true, shiftKey: true });
    expect(toast()).toBeNull();
    expect(getApp().error).toBeNull();
    expect(sessionLog().lines.slice(lines).filter((l) => l.source === "history")).toEqual([]);
    expect(historyToast("undo", { ok: false, label: "", refused: [] })).toBeNull();
    expect(historyToast("undo", { ok: false, label: "EDIT X", refused: [{ path: "a.yaml", reason: "changed" }] })).toBe("UNDO REFUSED — a.yaml CHANGED ON DISK");
    expect(spy.writes).toEqual([]);
  });

  it("a file changed on disk since is never overwritten: UNDO REFUSED, logged, the step stays", async () => {
    const { record, location } = polity();
    await go({ kind: "record", id: record.id });
    await type(field("Summary"), "Mine");
    await flush();
    const external = text(location.path).replace("Mine", "Theirs — edited elsewhere");
    await spy.inner.writeText(location.path, external);
    spy.reset();

    await ctrlZ();
    expect(toast()).toBe(`UNDO REFUSED — ${location.path} CHANGED ON DISK`);
    expect(text(location.path)).toBe(external);
    expect(spy.writes).toEqual([]);
    const refusal = sessionLog().lines.filter((l) => l.source === "history" && l.severity === "caution");
    expect(refusal).toHaveLength(1);
    expect(refusal[0].message).toContain(location.path);

    // Reload picks the outside change up, and the step still refuses rather than clobbers.
    await act(async () => void (await actions.reload()));
    await ctrlZ();
    expect(text(location.path)).toBe(external);
  });

  it("an undone step is logged as UNDONE, through repo.onLog", async () => {
    await go({ kind: "record", id: polity().record.id });
    await type(field("Summary"), "Log it");
    await flush();
    await ctrlZ();
    const line = sessionLog().lines.filter((l) => l.source === "history").at(-1)!;
    expect(line.message).toMatch(/^UNDONE — EDIT /);
    expect(line.code).toMatch(/^HIS-/);
  });

  it("a name that takes another record's slug: the draft adopts the new slug, and a toast names it", async () => {
    const [a, b] = repo.ofType("polity").map((r) => r.record);
    await go({ kind: "record", id: b.id });
    const title = field("Name");
    await type(title, a.name);
    await flush(); // saved under the new name; the file has not moved
    await act(async () => void fireEvent.blur(title)); // the slug follows the name: a's slug
    await flush();
    expect(toast()).toBe(`SLUG TAKEN — ${a.slug} → ${a.slug}-2`);
    const slug = Array.from(container.querySelectorAll<HTMLInputElement>("main input")).find((i) => i.value === `${a.slug}-2`);
    expect(slug, "the SLUG / FILE field shows the slug it was saved under").toBeDefined();
    expect(Object.keys(spy.inner.dump())).toContain(`polities/${a.slug}-2.polity.yaml`);
    expect(Object.keys(spy.inner.dump())).toContain(`polities/${a.slug}.polity.yaml`); // a is untouched
    // The next blur does not fight it: no second toast, no further write.
    spy.reset();
    await act(async () => void fireEvent.focus(title));
    await act(async () => void fireEvent.blur(title));
    await flush();
    expect(spy.writes).toEqual([]);
  });
});

describe("undo on the canvases", () => {
  it("a hull-editor drag is one step, and Ctrl+Z puts the silhouette and the file back", async () => {
    const hull = repo.ofType("hull")[0];
    await go({ kind: "hull", id: hull.record.id });
    const before = text(hull.location.path);
    const svg = container.querySelector<SVGSVGElement>(".hullsvg")!;
    const handle = svg.querySelector<SVGGElement>('[data-handle="slot"], [data-handle="station"]')!;
    expect(handle, "a drag handle").toBeDefined();
    await act(async () => void fireEvent.pointerDown(handle, { clientX: 300, clientY: 300, pointerId: 1 }));
    for (const dx of [20, 60, 120]) await act(async () => void fireEvent.pointerMove(svg, { clientX: 300 + dx, clientY: 300 - dx / 4, pointerId: 1 }));
    await act(async () => void fireEvent.pointerUp(svg, { clientX: 420, clientY: 270, pointerId: 1 }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(50))); // the checkpoint's save, well before any autosave
    const dragged = text(hull.location.path);
    expect(dragged).not.toBe(before);
    expect(spy.writes.filter((w) => w.path === hull.location.path && w.op === "writeText")).toHaveLength(1);

    await ctrlZ();
    expect(text(hull.location.path)).toBe(before);
    expect(toast()).toMatch(/^UNDONE — EDIT /);
    await flush();
    expect(text(hull.location.path)).toBe(before); // the hull editor's draft followed, and did not save the drag back
  });

  it("a map drag is one step: Ctrl+Z restores the angle, byte for byte", async () => {
    const system = repo.ofType("system")[0].record;
    await go({ kind: "map", id: system.id });
    const before = spy.inner.dump();
    const grab = Array.from(container.querySelectorAll<SVGGElement>("g[data-el]")).find((g) => g.style.cursor === "grab")!;
    const svg = container.querySelector(".mapview svg")!;
    await act(async () => void fireEvent.pointerDown(grab, { clientX: 500, clientY: 200, pointerId: 1 }));
    await act(async () => void fireEvent.pointerMove(svg, { clientX: 650, clientY: 420, pointerId: 1 }));
    await act(async () => void fireEvent.pointerUp(svg, { clientX: 650, clientY: 420, pointerId: 1 }));
    await flush();
    const changed = Object.keys(spy.inner.dump()).filter((p) => !p.startsWith("_") && spy.inner.dump()[p] !== before[p]);
    expect(changed).toHaveLength(1);
    expect(getApp().repo!.history.peekUndo()?.label).toMatch(/^MOVE /);

    await ctrlZ();
    expect(text(changed[0])).toBe(before[changed[0]]);
    expect(toast()).toMatch(/^UNDONE — MOVE /);
  });

  it("two drags of one body are two steps (never coalesced)", async () => {
    await go({ kind: "map", id: repo.ofType("system")[0].record.id });
    const grab = Array.from(container.querySelectorAll<SVGGElement>("g[data-el]")).find((g) => g.style.cursor === "grab")!;
    const svg = container.querySelector(".mapview svg")!;
    const start = getApp().repo!.history.past.length;
    for (const [x, y] of [[650, 420], [300, 450]]) {
      await act(async () => void fireEvent.pointerDown(grab, { clientX: 500, clientY: 200, pointerId: 1 }));
      await act(async () => void fireEvent.pointerMove(svg, { clientX: x, clientY: y, pointerId: 1 }));
      await act(async () => void fireEvent.pointerUp(svg, { clientX: x, clientY: y, pointerId: 1 }));
      await flush();
    }
    expect(getApp().repo!.history.past.length - start).toBe(2);
  });
});

describe("history across editors", () => {
  it("a record edit, a map drag and a hull edit undo in reverse order, in one history", async () => {
    const p = polity();
    const system = repo.ofType("system")[0].record;
    const hull = repo.ofType("hull")[0];
    const orig = spy.inner.dump();

    await go({ kind: "record", id: p.record.id });
    await type(field("Summary"), "First: the form");
    await flush();
    const afterForm = text(p.location.path);

    await go({ kind: "map", id: system.id });
    const grab = Array.from(container.querySelectorAll<SVGGElement>("g[data-el]")).find((g) => g.style.cursor === "grab")!;
    const svg = container.querySelector(".mapview svg")!;
    await act(async () => void fireEvent.pointerDown(grab, { clientX: 500, clientY: 200, pointerId: 1 }));
    await act(async () => void fireEvent.pointerMove(svg, { clientX: 650, clientY: 420, pointerId: 1 }));
    await act(async () => void fireEvent.pointerUp(svg, { clientX: 650, clientY: 420, pointerId: 1 }));
    await flush();
    const afterMap = spy.inner.dump();

    await go({ kind: "hull", id: hull.record.id });
    const hsvg = container.querySelector<SVGSVGElement>(".hullsvg")!;
    const handle = hsvg.querySelector<SVGGElement>('[data-handle="slot"], [data-handle="station"]')!;
    await act(async () => void fireEvent.pointerDown(handle, { clientX: 300, clientY: 300, pointerId: 1 }));
    await act(async () => void fireEvent.pointerMove(hsvg, { clientX: 400, clientY: 280, pointerId: 1 }));
    await act(async () => void fireEvent.pointerUp(hsvg, { clientX: 400, clientY: 280, pointerId: 1 }));
    await flush();
    const afterHull = text(hull.location.path);
    expect(afterHull).not.toBe(orig[hull.location.path]);

    await ctrlZ(); // the hull edit
    expect(text(hull.location.path)).toBe(orig[hull.location.path]);
    expect(spy.inner.dump()).toEqual({ ...afterMap, [hull.location.path]: orig[hull.location.path] });
    await ctrlZ(); // the map drag
    const back = spy.inner.dump();
    const movedPath = Object.keys(back).find((k) => !k.startsWith("_") && k !== p.location.path && back[k] !== afterMap[k] && k !== hull.location.path)!;
    expect(back[movedPath]).toBe(orig[movedPath]);
    expect(text(p.location.path)).toBe(afterForm);
    await ctrlZ(); // the form
    expect(text(p.location.path)).toBe(orig[p.location.path]);
    expect(toast()).toMatch(/^UNDONE — EDIT /);
  });
});

describe("undo of multi-record operations", () => {
  it("a skeleton generate is one step: one Ctrl+Z removes every body it made and restores the system", async () => {
    // A system of its own, so the skeleton has an empty star to plan around.
    const sys = repo.create("system", "Kepler Test");
    await repo.save(sys);
    await act(async () => void (await actions.reload()));
    const systemPath = repo.get(sys.id)!.location.path;
    const before = spy.inner.dump();

    await go({ kind: "record", id: sys.id });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /generate skeleton/i })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /plan orbits/i })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /^CREATE \d+ BODIES/ })));
    await flush();

    const made = Object.keys(spy.inner.dump()).filter((p) => !p.startsWith("_") && !(p in before));
    expect(made.length).toBeGreaterThan(3); // the star and the planets
    expect(text(systemPath)).not.toBe(before[systemPath]);
    const app = getApp().repo!;
    const step = app.history.peekUndo()!;
    expect(step.label).toBe("GENERATE SKELETON — KEPLER TEST");
    expect(step.entries.length).toBe(made.length + 1);
    expect(step.snapshot, "the old system record was snapshotted first").toBeDefined();

    await ctrlZ();
    const after = spy.inner.dump();
    for (const p of made) expect(after[p], p).toBeUndefined();
    expect(text(systemPath)).toBe(before[systemPath]);
    expect(toast()).toBe("UNDONE — GENERATE SKELETON — KEPLER TEST");
    // The other side of the round trip.
    await key(document.body, { key: "z", ctrlKey: true, shiftKey: true });
    for (const p of made) expect(text(p), p).toBeDefined();
  });
});
