// @vitest-environment jsdom
/**
 * Smoke test for ImportDialog (AUDIT §3: a write surface with no coverage): choose a Dynalist
 * OPML file, read the preview, import, and find the notes, the "Before import" snapshot and the
 * index on disk. Runs the real screen inside the real App against an in-memory vault.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "../src/App";
import { actions } from "../src/ui/state";
import { demoVault } from "../src/ui/demo";
import { listSnapshots, SNAPSHOT_CAUSE } from "../src/core/snapshots";
import { SpyAdapter } from "./helpers/spyAdapter";
import { installBrowserShims } from "./helpers/browserShims";

beforeAll(installBrowserShims);

const OPML = `<?xml version="1.0"?>
<opml version="2.0"><head><title>Fleets and Strikecraft</title></head><body>
<outline text="Fleets and Strikecraft">
  <outline text="Early USSF #fleet"><outline text="Sword class" _note="the first"/></outline>
  <outline text="Late USSF"><outline text="Halberd class"/></outline>
</outline></body></opml>`;

let spy: SpyAdapter;
let container: HTMLElement;

beforeEach(async () => {
  spy = new SpyAdapter();
  await demoVault(spy);
  ({ container } = render(<App />));
  await act(async () => void (await actions.openVault(spy)));
  await act(async () => actions.navigate({ kind: "import" }));
  spy.reset();
});
afterEach(async () => {
  await act(async () => actions.closeVault());
  cleanup();
});

const notePaths = () => Object.keys(spy.inner.dump()).filter((p) => p.startsWith("notes/"));

describe("ImportDialog", () => {
  it("previews a Dynalist file, then imports it behind a snapshot", async () => {
    expect(screen.getByText("Import", { selector: ".page-title" })).toBeTruthy();
    const before = notePaths();

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([OPML], "fleets.opml", { type: "text/x-opml" });
    await act(async () => void fireEvent.change(input, { target: { files: [file] } }));

    // Preview: nothing is written until IMPORT is pressed.
    const preview = await screen.findByText("PREVIEW");
    expect(preview).toBeTruthy();
    expect(within(container.querySelector("table.tbl")!).getByText("fleets.opml")).toBeTruthy();
    expect(spy.writes).toEqual([]);

    const button = screen.getByRole("button", { name: /IMPORT 2 NOTES/ });
    await act(async () => void fireEvent.click(button));

    const added = notePaths().filter((p) => !before.includes(p));
    expect(added.sort()).toEqual(["notes/fleets-and-strikecraft-early-ussf-fleet.opml", "notes/fleets-and-strikecraft-late-ussf.opml"]);
    // The snapshot was taken before the first note was written.
    const snaps = await listSnapshots(spy);
    expect(snaps.map((s) => s.cause)).toEqual([SNAPSHOT_CAUSE.import]);
    const order = spy.writes.map((w) => w.path);
    const firstNote = order.findIndex((p) => added.includes(p));
    const snapWrite = order.findIndex((p) => p.startsWith(`_snapshots/${snaps[0].id}/manifest.json`));
    expect(snapWrite).toBeGreaterThanOrEqual(0);
    expect(snapWrite).toBeLessThan(firstNote);
    expect(snaps[0].files.map((f) => f.path)).toContain("_index.csv");
    // The app moved to the note list and told the user.
    expect(container.querySelector(".toast")?.textContent).toBe("Imported 2 notes");
  });

  it("imports a second time without overwriting the first (slugs are made unique)", async () => {
    const before = notePaths();
    for (let i = 0; i < 2; i++) {
      await act(async () => actions.navigate({ kind: "import" }));
      const file = new File([OPML], "fleets.opml");
      await act(async () => void fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [file] } }));
      const button = await screen.findByRole("button", { name: /IMPORT 2 NOTES/ });
      await act(async () => void fireEvent.click(button));
    }
    const added = notePaths().filter((p) => !before.includes(p));
    expect(added).toHaveLength(4);
    expect(added.filter((p) => /-2\.opml$/.test(p))).toHaveLength(2); // the second import's notes took a suffix
    expect((await listSnapshots(spy)).map((s) => s.cause)).toEqual([SNAPSHOT_CAUSE.import, SNAPSHOT_CAUSE.import]);
  });
});
