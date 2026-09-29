/**
 * Headless smoke check for undo/redo (doc 11 §1.9, S1 PR 3b): the three editors in one history,
 * a skeleton generate as one step, an external edit refused, and Ctrl+Z inside a text field left to
 * the browser.
 *
 *   npm run build && npx vite preview        # then, in another shell:
 *   node scripts/ui-smoke-undo.mjs
 *
 * Against the preview build the checks are what a person sees: fields, the hull's silhouette, where
 * a body sits on the map, the toasts, and — through the Reload button, which re-reads the folder —
 * what the "files" hold. Against a dev server (`npx vite`, then SMOKE_URL=http://localhost:5173/)
 * the script also reaches the vault's in-memory adapter through the app's own module, so it can
 * compare file bytes exactly and edit a file behind the app's back for the refusal check; on a
 * preview build those two are skipped and said so.
 *
 * Set SMOKE_CHROME to an installed Chromium when the Playwright browser is not downloaded.
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const BASE = process.env.SMOKE_URL ?? "http://localhost:4173/";

async function launch() {
  const exe = process.env.SMOKE_CHROME;
  if (exe && existsSync(exe)) return chromium.launch({ executablePath: exe });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chromium" }); // the full build, not the shell
  }
}
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|404/.test(m.text())) errors.push("console: " + m.text());
});
const fail = (msg) => {
  errors.push("assert: " + msg);
  console.error("FAIL " + msg);
};
const ok = (msg) => console.log("ok   " + msg);
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

await page.goto(BASE);
await page.getByText("Open the demo vault").click();
await page.waitForSelector(".rail");

// ---- the vault's files, when the app's own module can be reached (dev server only) ------------
const handle = await page.evaluate(async () => {
  try {
    const m = await import(/* @vite-ignore */ "/src/ui/state.ts");
    return typeof m.getApp().repo?.fs.dump === "function";
  } catch {
    return false;
  }
});
const files = () => page.evaluate(async () => (await import(/* @vite-ignore */ "/src/ui/state.ts")).getApp().repo.fs.dump());
const pathOf = (id) => page.evaluate(async (i) => (await import(/* @vite-ignore */ "/src/ui/state.ts")).getApp().repo.get(i)?.location.path, id);
const writeFile = (path, text) => page.evaluate(async ([p, t]) => (await import(/* @vite-ignore */ "/src/ui/state.ts")).getApp().repo.fs.writeText(p, t), [path, text]);
if (!handle) console.log("note: no dev-server module handle — file-byte and external-edit checks are skipped (use SMOKE_URL=http://localhost:5173/ against `npx vite`)");

// ---- helpers ------------------------------------------------------------------------------------
const toast = async () => (await page.locator(".toast").count()) ? (await page.locator(".toast").first().innerText()).trim() : null;
const clearToast = () => page.waitForFunction(() => !document.querySelector(".toast"), null, { timeout: 4000 });
const undo = async () => {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(250);
};
const redo = async () => {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(250);
};
/** A kind's list, from the rail: "Polity", "Body", "Hull", "Star system". */
const openList = async (kind) => {
  await page.locator(".rail-item", { has: page.locator(".name", { hasText: new RegExp(`^${kind}$`) }) }).first().click();
  await page.waitForSelector(".listpane .rec");
};
/** The system map, from the rail's own entry for it. */
const openMap = async () => {
  await page.locator(".rail-item", { has: page.locator(".name", { hasText: /^Heliaris system$/ }) }).first().click();
  await page.waitForSelector(".mapsvg");
  await page.waitForTimeout(500);
};
const nameField = () => page.locator('main input[aria-label="Name"]');
const summary = () => page.locator('input[aria-label="Summary"]');
const hullSig = () => page.evaluate(() => Array.from(document.querySelectorAll(".hullsvg path")).map((p) => p.getAttribute("d")).join("|"));
const center = async (loc) => {
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const near = (a, b) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;

// ---- 1. edit on the record form -------------------------------------------------------------------
await openList("Polity");
await page.locator(".listpane .rec").first().click();
await page.waitForSelector('input[aria-label="Summary"]');
const polityName = await nameField().inputValue();
const polityPath = await page.locator(".doc-path").first().innerText();
const summary0 = await summary().inputValue();
const polityFile0 = handle ? (await files())[polityPath] : undefined;
await summary().fill("smoke: edited on the form");
await page.waitForTimeout(1300); // the 900 ms autosave
const polityFile1 = handle ? (await files())[polityPath] : undefined;
if (handle) check(polityFile1 !== polityFile0, "the form edit was autosaved to its file");

const polityFileEdited = polityFile1;

// ---- 2. a map drag ------------------------------------------------------------------------------
await openMap();
// A draggable object, and a point that really lands on it (its bounding box also covers its label and
// empty corners, where a press would pan the map instead).
const grab = await page.evaluate(() => {
  for (const g of document.querySelectorAll('g[data-el][style*="cursor: grab"]')) {
    const r = g.getBoundingClientRect();
    for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.5], [0.5, 0.3], [0.7, 0.5], [0.5, 0.7]]) {
      const x = r.left + r.width * fx;
      const y = r.top + r.height * fy;
      if (document.elementFromPoint(x, y)?.closest("[data-el]") === g) return { id: g.getAttribute("data-el"), x, y };
    }
  }
  return null;
});
if (!grab) fail("no draggable object on the map");
const bodyId = grab.id;
const body = page.locator(`g[data-el="${bodyId}"]`);
const at0 = await center(body);
const bodyPath = handle ? await pathOf(bodyId) : undefined;
const bodyFile0 = handle ? (await files())[bodyPath] : undefined;
await page.mouse.move(grab.x, grab.y);
await page.mouse.down();
await page.mouse.move(grab.x + 90, grab.y + 120, { steps: 10 });
await page.waitForTimeout(150); // a hand lets go a frame after the last move; the map reads the drag state from the render
await page.mouse.up();
await page.waitForTimeout(400);
const at1 = await center(page.locator(`g[data-el="${bodyId}"]`));
check(!near(at0, at1), `the drag moved the body (${at0.x | 0},${at0.y | 0} → ${at1.x | 0},${at1.y | 0})`);
if (handle) check((await files())[bodyPath] !== bodyFile0, "the drag was saved to the body's file");

// Where the body sits on a clean mount (no inspector open): what "still in place" is measured against later.
await openList("Hull");
await openMap();
const atDragged = await center(page.locator(`g[data-el="${bodyId}"]`));
check(!near(at0, atDragged), "the drag persisted: a fresh mount of the map shows the new position");

// ---- 3. a hull-editor drag ----------------------------------------------------------------------
await openList("Hull");
await page.locator(".listpane .rec").first().click();
await page.getByRole("button", { name: /Open hull editor/ }).click();
await page.waitForSelector(".hullsvg");
await page.waitForTimeout(400);
const hullPath = handle ? await page.evaluate(async () => (await import(/* @vite-ignore */ "/src/ui/state.ts")).getApp().view.id).then(pathOf) : undefined;
const sig0 = await hullSig();
const hullFile0 = handle ? (await files())[hullPath] : undefined;
const knob = page.locator('[data-handle="station"]').nth(1);
const kb = await knob.boundingBox();
await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
await page.mouse.down();
await page.mouse.move(kb.x + kb.width / 2, kb.y - 60, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300); // well inside the 900 ms autosave: the drag's own checkpoint saves it
const sig1 = await hullSig();
check(sig1 !== sig0, "the station drag reshaped the silhouette");
if (handle) check((await files())[hullPath] !== hullFile0, "the hull drag was saved at pointer-up, not left to the autosave");

// ---- Ctrl+Z ×3: reverse order, one history ------------------------------------------------------
await undo();
check((await hullSig()) === sig0, "Ctrl+Z #1: the hull silhouette is back");
check(/^UNDONE — EDIT /.test((await toast()) ?? ""), `Ctrl+Z #1 toast: ${await toast()}`);
if (handle) check((await files())[hullPath] === hullFile0, "…and the hull file is byte-identical to before the drag");
await page.getByRole("button", { name: "Reload" }).click(); // re-reads the folder: what the files hold
await page.waitForTimeout(500);
check((await hullSig()) === sig0, "…and Reload (which reads the files) agrees");

await openMap();
check(near(await center(page.locator(`g[data-el="${bodyId}"]`)), atDragged), "the map drag is still in place after undoing only the hull (reverse order)");
await undo();
check(near(await center(page.locator(`g[data-el="${bodyId}"]`)), at0), "Ctrl+Z #2: the body is back where it was on the map");
check(/^UNDONE — MOVE /.test((await toast()) ?? ""), `Ctrl+Z #2 toast: ${await toast()}`);
if (handle) check((await files())[bodyPath] === bodyFile0, "…and the body's file is byte-identical");

await openList("Polity");
await page.locator(".listpane .rec", { hasText: polityName }).first().click();
await page.waitForSelector('input[aria-label="Summary"]');
check((await summary().inputValue()) === "smoke: edited on the form", "the form edit is still there after undoing the other two");
await undo();
check((await summary().inputValue()) === summary0, "Ctrl+Z #3: the form field is back");
check(/^UNDONE — EDIT /.test((await toast()) ?? ""), `Ctrl+Z #3 toast: ${await toast()}`);
if (handle) check((await files())[polityPath] === polityFile0, "…and the record's file is byte-identical");

await clearToast();
await undo();
check((await toast()) === null, "Ctrl+Z with nothing left is not a refusal: no toast");

// ---- redo -------------------------------------------------------------------------------------
await redo();
check((await summary().inputValue()) === "smoke: edited on the form", "Ctrl+Shift+Z redoes the form edit");
if (handle) check((await files())[polityPath] === polityFileEdited, "…to the same bytes");

// ---- 4. external edit: refused, never clobbered -------------------------------------------------
if (handle) {
  await clearToast();
  const outside = (await files())[polityPath] + "\n# edited outside Gallery\n";
  await writeFile(polityPath, outside);
  await undo(); // the form edit is redone, so its undo is the top of the stack
  check(new RegExp(`^UNDO REFUSED — ${polityPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} CHANGED ON DISK$`).test((await toast()) ?? ""), `external edit → ${await toast()}`);
  check((await files())[polityPath] === outside, "…and the file is exactly what was written outside");
}

// ---- 5. skeleton generate: one step ---------------------------------------------------------------
await page.locator(".rail-new").click();
await page.locator('.rail-form select[aria-label="Type"]').selectOption("system");
await page.locator('.rail-form input[aria-label="Name"]').fill("Smoke System");
await page.locator(".rail-form").getByRole("button", { name: "CREATE", exact: true }).click();
await nameField().waitFor();
await openList("Body");
const bodiesBefore = await page.locator(".listpane .rec").count();
await openList("Star system");
await page.locator(".listpane .rec", { hasText: "Smoke System" }).first().click();
await nameField().waitFor();
await page.getByRole("button", { name: /generate skeleton/i }).click();
await page.getByRole("button", { name: /plan orbits/i }).click();
await page.getByRole("button", { name: /^CREATE \d+ BODIES/ }).click();
await page.waitForFunction(() => /Created \d+ bodies/.test(document.querySelector(".toast")?.textContent ?? ""));
const made = Number(/Created (\d+) bodies/.exec(await toast())[1]);
await openList("Body");
const bodiesAfter = await page.locator(".listpane .rec").count();
check(bodiesAfter > bodiesBefore, `the skeleton made bodies (${bodiesBefore} → ${bodiesAfter}, ${made} planned)`);
await clearToast();
await undo();
check(/^UNDONE — GENERATE SKELETON — SMOKE SYSTEM$/.test((await toast()) ?? ""), `one Ctrl+Z: ${await toast()}`);
await openList("Body");
check((await page.locator(".listpane .rec").count()) === bodiesBefore, "…and every body it made is gone");
await redo();
await openList("Body");
check((await page.locator(".listpane .rec").count()) === bodiesAfter, "Ctrl+Shift+Z brings them all back");

// ---- 6. Ctrl+Z in a text field is the browser's, not the app's ---------------------------------
// (Last, because the browser's own undo changes the field, and that autosaves as a step of its own.)
await openList("Polity");
await page.locator(".listpane .rec").first().click();
await summary().waitFor();
await summary().fill("");
await summary().pressSequentially("typed for the field check");
await page.waitForTimeout(1300);
await clearToast();
await page.keyboard.press("Control+z");
await page.waitForTimeout(300);
check(!/UNDONE|REFUSED/.test((await toast()) ?? ""), "Ctrl+Z inside a text field does not trigger app undo (no toast)");
if (handle) {
  const future = await page.evaluate(async () => (await import(/* @vite-ignore */ "/src/ui/state.ts")).getApp().repo.history.future.length);
  check(future === 0, "…and nothing was moved onto the redo stack");
}

console.log(errors.length ? `\n${errors.length} problem(s):\n` + errors.join("\n") : "\nno page errors, all checks passed");
await browser.close();
process.exit(errors.length ? 1 : 0);
