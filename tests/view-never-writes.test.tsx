// @vitest-environment jsdom
/**
 * The view-never-writes guard (doc 10 §8, ROADMAP §4): looking at the vault must not change it.
 *
 * Every view, every record's page, and every tab / toggle / display-mode control is mounted and
 * exercised against a spy on the storage adapter (F19: the adapter's writes under the vault
 * root, and only those — `settings.json` and `localStorage` are out of scope). Any write fails
 * the test, except a map drag or L-point park writing `map_angle_deg`, `lagrange_of`, `lagrange`
 * or `orbit_km` (doc 11 §1.6). The drag test below covers `map_angle_deg`, the park test the rest.
 *
 * Timers are faked and run past the 900 ms autosave and every other debounce, and each view is
 * unmounted afterwards (the editors flush on unmount), so a write scheduled by merely looking
 * is caught whether it fires late or on the way out.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import YAML from "yaml";
import { App } from "../src/App";
import { actions, getApp, type View } from "../src/ui/state";
import { demoVault } from "../src/ui/demo";
import { Repository } from "../src/core/repo";
import type { TypedRecord } from "../src/core/types";
import { SpyAdapter } from "./helpers/spyAdapter";
import { CANVAS, installBrowserShims } from "./helpers/browserShims";

beforeAll(installBrowserShims);
// Every record's page is mounted and swept; that takes longer than vitest's default.
vi.setConfig({ testTimeout: 180_000 });

let spy: SpyAdapter;
let container: HTMLElement;
let repo: Repository;

/** Controls that persist a vault preference by design; each is named here, with its reason, and tested below. */
/** Pressing the option already selected must not write; pressing another one does (tested below). */
const PERSISTENT_PREFERENCES = ['[aria-label="Distance units"]']; // SystemMap: saveConfig({ distanceUnit }); doc 11 §1.6 lists saveConfig as view config

const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(2500)));
const go = async (view: View) => {
  await act(async () => actions.navigate(view));
  await flush();
};
const click = async (el: Element) => {
  await act(async () => void fireEvent.click(el));
  await flush();
};
/** Leave the view on screen, so the editor's flush-on-unmount runs inside the guard too. */
const leave = async (label: string) => {
  await go({ kind: "settings" });
  unwritten(`leaving ${label}`);
};
const unwritten = (label: string) => expect(spy.writes, `${label} wrote to the vault`).toEqual([]);

/** Press every tab, segmented switch, pressed-button, overlay checkbox and display-mode select on screen, then focus and leave every field. */
async function sweepToggles(label: string) {
  // A persistent-preference group may be pressed only on its already-selected option: choosing
  // another one is a decision, choosing the current one is looking.
  const skip = (el: Element) => PERSISTENT_PREFERENCES.some((sel) => el.closest(sel)) && el.getAttribute("aria-checked") !== "true";
  const pressAll = async (selector: string) => {
    // Re-query after each click: pressing a tab re-renders the panel it is in.
    const n = container.querySelectorAll(selector).length;
    for (let i = 0; i < n; i++) {
      const el = container.querySelectorAll(selector)[i];
      if (!el || skip(el) || (el as HTMLButtonElement).disabled) continue;
      await click(el);
    }
    return n;
  };
  let pressed = 0;
  // (Not the rail: its buttons navigate away from the view being swept. See `sweepRail`.)
  for (const sel of ['[role="tab"]', '[role="radio"]', "button[aria-pressed]", ".toolbar input[type=checkbox]"]) pressed += await pressAll(sel);
  for (const select of container.querySelectorAll<HTMLSelectElement>('select[aria-label="Display mode"]')) {
    for (const o of Array.from(select.options)) {
      await act(async () => void fireEvent.change(select, { target: { value: o.value } }));
      await flush();
    }
  }
  unwritten(`${label} (after ${pressed} toggles)`);
  // Focusing a field and leaving it without typing is looking, not editing (F1): many fields normalise on blur.
  const fields = Array.from(container.querySelectorAll<HTMLElement>("main input:not([type=checkbox]):not([type=file]), main textarea"));
  for (const f of fields) {
    await act(async () => {
      fireEvent.focus(f);
      fireEvent.blur(f);
    });
  }
  await flush();
  unwritten(`${label} (after focusing and leaving ${fields.length} fields)`);
}

/** The rail: every kind, section and tag entry, and the new-record menu (opening it, not choosing from it). */
async function sweepRail(label: string) {
  const n = container.querySelectorAll(".rail-item").length;
  for (let i = 0; i < n; i++) {
    await click(container.querySelectorAll(".rail-item")[i]);
    await click(container.querySelector(".rail-new")!);
  }
  expect(n, "rail entries").toBeGreaterThan(5);
  unwritten(`${label} (${n} rail entries)`);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  spy = new SpyAdapter();
  await demoVault(spy);
  repo = new Repository(spy);
  await repo.load();
  spy.reset();
  ({ container } = render(<App />));
  // Opening is itself under the guard: the demo vault is current, so nothing may be rewritten (F2).
  await act(async () => void (await actions.openVault(spy)));
  await flush();
});

afterEach(async () => {
  document.documentElement.style.removeProperty("--station-mark");
  await act(async () => actions.closeVault());
  cleanup();
  vi.useRealTimers();
});

describe("view never writes", () => {
  it("opening an up-to-date vault, twice, writes nothing", async () => {
    unwritten("first open");
    await act(async () => void (await actions.openVault(spy)));
    await flush();
    unwritten("second open");
  });

  it("the spy sees a real edit (so silence above means something)", async () => {
    const polity = repo.ofType("polity")[0].record;
    await go({ kind: "record", id: polity.id });
    const title = container.querySelector<HTMLInputElement>('input[aria-label="Name"]')!;
    await act(async () => void fireEvent.change(title, { target: { value: polity.name + " II" } }));
    await flush();
    expect(spy.writes.filter((w) => w.op === "writeText" && w.path.endsWith(".polity.yaml"))).toHaveLength(1);
  });

  it("the application-level views", async () => {
    for (const view of [{ kind: "list" }, { kind: "settings" }, { kind: "import" }, { kind: "log" }] as View[]) {
      await go(view);
      await sweepToggles(view.kind);
    }
    await sweepRail("rail");
    // The list's sort (and any other pane select): choosing an option is a view state.
    await go({ kind: "list" });
    const sorts = container.querySelectorAll<HTMLSelectElement>(".listpane select");
    expect(sorts.length).toBeGreaterThan(0);
    for (const select of sorts) {
      for (const o of Array.from(select.options)) {
        await act(async () => void fireEvent.change(select, { target: { value: o.value } }));
        await flush();
      }
    }
    unwritten("list sort");
    for (const t of repo.registry.types()) {
      await go({ kind: "list", type: t.id });
      unwritten(`list ${t.id}`);
    }
    await go({ kind: "list", query: "sword" } as View);
    unwritten("search");
    await leave("the list views");
  });

  it("every record's page, and its tabs and toggles", async () => {
    let n = 0;
    for (const { record } of repo.all()) {
      const view: View = record.type === "system" ? { kind: "map", id: record.id } : record.type === "hull" ? { kind: "hull", id: record.id } : { kind: "record", id: record.id };
      await go(view);
      await sweepToggles(`${record.type} "${record.name}" (${view.kind})`);
      // The record page too, for those that also have a map or hull editor.
      if (view.kind !== "record") {
        await go({ kind: "record", id: record.id });
        await sweepToggles(`${record.type} "${record.name}" (record)`);
      }
      n++;
    }
    expect(n).toBe(repo.all().length);
    expect(repo.all().length).toBeGreaterThan(50);
    await leave("the last record"); // its editor flushes on unmount
  });

  it("craft open in the hull editor too", async () => {
    for (const c of repo.ofType("craft")) {
      await go({ kind: "hull", id: c.record.id });
      await sweepToggles(`craft "${c.record.name}" (hull)`);
    }
    await leave("the hull editor");
  });

  it("selecting things on the map, and the inspector that opens", async () => {
    await go({ kind: "map", id: repo.ofType("system")[0].record.id });
    const svg = container.querySelector(".mapview svg")!;
    const targets = Array.from(container.querySelectorAll<SVGGElement>("g[data-el]"))
      .filter((g) => g.style.cursor === "grab" || g.style.cursor === "pointer")
      .slice(0, 12);
    expect(targets.length).toBeGreaterThan(5);
    let inspected = 0;
    for (const el of targets) {
      // A click without movement: pointer down on the object, up on the canvas.
      await act(async () => void fireEvent.pointerDown(el, { clientX: 400, clientY: 300, pointerId: 1 }));
      await act(async () => void fireEvent.pointerUp(svg, { clientX: 400, clientY: 300, pointerId: 1 }));
      await act(async () => void fireEvent.click(el));
      await flush();
      unwritten("selecting a map object");
      if (container.querySelector('.mapinspector input[aria-label="Name"]')) {
        inspected++;
        await sweepToggles("map inspector"); // its tabs, toggles and fields
      }
    }
    expect(inspected, "the compact record inspector opened").toBeGreaterThan(0);
    await leave("the map");
  });

  it("the skeleton builder panel opens without writing", async () => {
    const system = repo.ofType("system")[0].record;
    await go({ kind: "record", id: system.id });
    const open = Array.from(container.querySelectorAll("button")).find((b) => /generate skeleton/i.test(b.textContent ?? ""))!;
    expect(open).toBeDefined();
    await click(open);
    unwritten("skeleton builder");
    await leave("the skeleton builder");
  });

  // F1: focus and blur on the title, no typing, must not dirty the record.
  it("focusing and leaving the title does not rewrite the record", async () => {
    for (const { record } of repo.all().slice(0, 12)) {
      await go({ kind: "record", id: record.id });
      const title = container.querySelector<HTMLInputElement>('input[aria-label="Name"]');
      if (!title) continue;
      await act(async () => {
        fireEvent.focus(title);
        fireEvent.blur(title);
      });
      await flush();
      unwritten(`title blur on "${record.name}"`);
    }
    await go({ kind: "list" }); // unmount flush
    unwritten("leaving the last record");
  });

  it("a rename still moves the file: the blur that changes the slug is an edit", async () => {
    const polity = repo.ofType("polity")[0].record;
    await go({ kind: "record", id: polity.id });
    const title = container.querySelector<HTMLInputElement>('input[aria-label="Name"]')!;
    await act(async () => void fireEvent.change(title, { target: { value: "Brand New Name" } }));
    await flush(); // the 900 ms autosave fires before the user leaves the field, as it normally does
    await act(async () => void fireEvent.blur(title));
    await flush();
    // (`repo` here is the test's own instance; what the app did is on the adapter.)
    const files = Object.keys(spy.inner.dump());
    expect(files.filter((p) => /brand-new-name/.test(p))).toEqual(["polities/brand-new-name.polity.yaml"]);
    expect(files).not.toContain("polities/lunar-defense-force.polity.yaml");
  });

  // A slug the user typed this visit is customised: leaving the title must not put it back.
  it("a slug typed into the slug field survives leaving the title", async () => {
    const polity = repo.ofType("polity")[0].record;
    await go({ kind: "record", id: polity.id });
    const slug = Array.from(container.querySelectorAll<HTMLInputElement>("main input")).find((i) => i.value === polity.slug)!;
    expect(slug, "the SLUG / FILE field").toBeDefined();
    await act(async () => void fireEvent.change(slug, { target: { value: "custom-slug" } }));
    await flush(); // its own save: the file moves
    const custom = "polities/custom-slug.polity.yaml";
    expect(Object.keys(spy.inner.dump()).filter((p) => p.startsWith("polities/"))).toContain(custom);

    spy.reset();
    const title = container.querySelector<HTMLInputElement>('input[aria-label="Name"]')!;
    await act(async () => {
      fireEvent.focus(title);
      fireEvent.blur(title);
    });
    await flush();
    unwritten("leaving the title after typing a slug");
    expect(slug.value).toBe("custom-slug");

    // And a new name typed afterwards still leaves the customised slug alone.
    await act(async () => void fireEvent.change(title, { target: { value: "Something Else Entirely" } }));
    await flush();
    await act(async () => void fireEvent.blur(title));
    await flush();
    const files = Object.keys(spy.inner.dump()).filter((p) => p.startsWith("polities/"));
    expect(files).toContain(custom);
    expect(files.filter((p) => /something-else/.test(p))).toEqual([]);
    expect(files).not.toContain("polities/lunar-defense-force.polity.yaml");
  });

  it("the distance-unit switch is the one view control that persists, and it writes only the config", async () => {
    await go({ kind: "map", id: repo.ofType("system")[0].record.id });
    const before = YAML.parse(await spy.readText("gallery.config.yaml")).distanceUnit;
    const other = Array.from(container.querySelectorAll('[aria-label="Distance units"] [role="radio"]')).find((b) => b.getAttribute("aria-checked") === "false")!;
    await click(other);
    expect(spy.writes.map((w) => w.path)).toEqual(["gallery.config.yaml"]);
    expect(YAML.parse(await spy.readText("gallery.config.yaml")).distanceUnit).not.toBe(before);
  });

  it("dragging a body on the map writes map_angle_deg, and nothing else", async () => {
    const system = repo.ofType("system")[0].record;
    await go({ kind: "map", id: system.id });
    const before = spy.inner.dump();
    const grab = Array.from(container.querySelectorAll<SVGGElement>("g[data-el]")).find((g) => g.style.cursor === "grab")!;
    expect(grab, "a draggable body").toBeDefined();
    const svg = container.querySelector(".mapview svg")!;
    await act(async () => {
      fireEvent.pointerDown(grab, { clientX: 500, clientY: 200, pointerId: 1 });
    });
    await act(async () => {
      fireEvent.pointerMove(svg, { clientX: 650, clientY: 420, pointerId: 1 });
    });
    await act(async () => {
      fireEvent.pointerUp(svg, { clientX: 650, clientY: 420, pointerId: 1 });
    });
    await flush();
    const recordWrites = spy.writes.filter((w) => w.op === "writeText" && !w.path.startsWith("_"));
    expect(recordWrites).toHaveLength(1);
    const path = recordWrites[0].path;
    const was = YAML.parse(before[path]);
    const now = YAML.parse(await spy.readText(path));
    const changed = Object.keys({ ...was.fields, ...now.fields }).filter((k) => JSON.stringify(was.fields[k]) !== JSON.stringify(now.fields[k]));
    expect(changed).toEqual(["map_angle_deg"]);
    // Nothing else moved on disk, other than the derived CSVs and the revision bookkeeping of that record.
    const otherWrites = spy.writes.filter((w) => w.path !== path && !w.path.startsWith("_index") && !w.path.startsWith("_exports/"));
    expect(otherWrites).toEqual([]);
  });

  it("parking a station on an L-point writes lagrange_of and lagrange (and drops orbit_km), and nothing else", async () => {
    const system = repo.ofType("system")[0].record;
    // A cycler on a heliocentric orbit: a location that can be dragged and dropped on an L-point dot.
    const station = repo.ofType("location").find((l) => l.record.name === "Antares")!;
    expect((station.record as TypedRecord).fields.lagrange_of).toBeUndefined();
    // The map's snap radius is a station mark (a theme token); jsdom loads no stylesheet, so give it one.
    document.documentElement.style.setProperty("--station-mark", "9px");
    await go({ kind: "map", id: system.id });
    const before = spy.inner.dump();
    const svg = container.querySelector<SVGSVGElement>(".mapview svg")!;
    const grab = container.querySelector<SVGGElement>(`g[data-el="${station.record.id}"]`)!;
    expect(grab, "the station on the map").not.toBeNull();
    // An L-point dot, in the pixel space the drop is measured in: its user-space position through the viewBox.
    const [vx, vy, vw, vh] = svg.getAttribute("viewBox")!.split(/[\s,]+/).map(Number);
    const dot = Array.from(container.querySelectorAll<SVGGElement>("g[data-el]")).find((g) => g.style.cursor === "crosshair" && g.getAttribute("data-el") !== station.record.id)!;
    expect(dot, "an L-point dot").toBeDefined();
    const [, tx, ty] = /translate\(([-\d.e]+)[ ,]([-\d.e]+)\)/.exec(dot.getAttribute("transform")!)!.map(Number) as unknown as [string, number, number];
    const at = { clientX: ((tx - vx) * CANVAS.width) / vw, clientY: ((ty - vy) * CANVAS.height) / vh, pointerId: 1 };

    await act(async () => void fireEvent.pointerDown(grab, { clientX: 500, clientY: 200, pointerId: 1 }));
    await act(async () => void fireEvent.pointerMove(svg, { clientX: 600, clientY: 300, pointerId: 1 }));
    await act(async () => void fireEvent.pointerMove(svg, at));
    await act(async () => void fireEvent.pointerUp(svg, at));
    await flush();

    const recordWrites = spy.writes.filter((w) => w.op === "writeText" && !w.path.startsWith("_"));
    expect(recordWrites.map((w) => w.path)).toEqual([station.location.path]);
    const was = YAML.parse(before[station.location.path]);
    const now = YAML.parse(await spy.readText(station.location.path));
    const changed = Object.keys({ ...was.fields, ...now.fields }).filter((k) => JSON.stringify(was.fields[k]) !== JSON.stringify(now.fields[k]));
    // Never anything beyond the four fields the exception names; a park sets the first two.
    expect(changed.filter((k) => !["map_angle_deg", "lagrange_of", "lagrange", "orbit_km"].includes(k))).toEqual([]);
    expect(changed).toEqual(expect.arrayContaining(["lagrange_of", "lagrange"]));
    expect(now.fields.lagrange).toMatch(/^L[1-5]$/);
    const otherWrites = spy.writes.filter((w) => w.path !== station.location.path && !w.path.startsWith("_index") && !w.path.startsWith("_exports/"));
    expect(otherWrites).toEqual([]);
    // It is one undo step with the park's own label, and undo puts the file back.
    const step = getApp().repo!.history.peekUndo()!;
    expect(step.label).toBe(`PARK ANTARES AT ${now.fields.lagrange}`);
    await act(async () => void (await actions.undo()));
    expect(await spy.readText(station.location.path)).toBe(before[station.location.path]);
  });
});
