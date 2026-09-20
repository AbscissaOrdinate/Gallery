/**
 * Headless smoke check for editor 1, the hull editor.
 *
 *   npm run build && npx vite preview
 *   node scripts/ui-smoke-hull.mjs
 *
 * Per `docs/CLAUDE.md` this is not part of vitest: it needs a browser and a
 * preview server. It drives the editor the way a person does — open a hull,
 * reshape the spine, move a slot, click an advisory — and fails on any page
 * error. Screenshots land in `screenshots/` so the geometry can be looked at,
 * which is the only way some classes of bug ever show up.
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const BASE = process.env.SMOKE_URL ?? "http://localhost:4173/";
const shot = (n) => `screenshots/hull-${n}.png`;

// Playwright defaults to the headless shell, which is a separate download from
// the full browser. Use whichever is actually on this machine rather than
// telling the user to re-run `playwright install`.
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

await page.goto(BASE);
await page.getByText("Open the demo vault").click();
await page.waitForSelector(".sidebar");

// ---- open a hull -----------------------------------------------------------
await page.getByText("Hull", { exact: true }).first().click();
await page.waitForSelector(".listpane .rec");
await page.locator(".listpane .rec").first().click();
await page.getByRole("button", { name: /Open hull editor/ }).click();
await page.waitForSelector(".hullsvg");
await page.waitForTimeout(400);
await page.screenshot({ path: shot("editor") });

// The hull has to actually be drawn, not just the chrome around it.
const outline = await page.locator(".hullsvg path").count();
if (outline === 0) fail("no hull outline drawn");

// The budget rail must carry real numbers, not em dashes.
const railLength = await page.locator(".hullrail .stat", { hasText: "Length" }).locator(".v").innerText();
if (!/\d/.test(railLength)) fail(`budget rail shows no length (got ${JSON.stringify(railLength)})`);
console.log("length:", railLength.replace(/\s+/g, " "));

// ---- reshape the spine by dragging a station -------------------------------
const before = await page.locator(".hullrail .stat", { hasText: "Gross vol" }).locator(".v").innerText();
const handle = page.locator('[data-handle="station"]').nth(1);
if ((await handle.count()) === 0) fail("no station handles to drag");
else {
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const after = await page.locator(".hullrail .stat", { hasText: "Gross vol" }).locator(".v").innerText();
  if (after === before) fail(`dragging a station did not change the volume (${before} → ${after})`);
  else console.log("gross volume:", before, "→", after);
}
await page.screenshot({ path: shot("reshaped") });

// ---- select a section from the outliner ------------------------------------
const sectionRow = page.locator(".hullpane .hullrow").first();
if ((await sectionRow.count()) > 0) {
  await sectionRow.click();
  await page.waitForTimeout(150);
  const heading = await page.locator(".hullside .card h3").first().innerText();
  console.log("inspector:", heading);
}

// ---- overlays --------------------------------------------------------------
for (const label of ["Schematic", "Sections", "Slots", "Scale", "Beam"]) {
  const btn = page.getByRole("button", { name: label, exact: true });
  if ((await btn.count()) > 0) await btn.click();
  await page.waitForTimeout(80);
}
await page.screenshot({ path: shot("silhouette") });
for (const label of ["Schematic", "Sections", "Slots", "Scale", "Beam"]) {
  const btn = page.getByRole("button", { name: label, exact: true });
  if ((await btn.count()) > 0) await btn.click();
}
await page.waitForTimeout(200);

// ---- advisories: make one, then click it ------------------------------------
// Shrinking the hull to nothing is the one edit guaranteed to raise an error
// advisory whatever the record started as.
const lengthField = page.locator(".hullside .field").filter({ has: page.getByText("Length", { exact: true }) }).locator("input");
await page.locator(".hullsvg").click({ position: { x: 5, y: 5 } }); // clear the selection, back to the spine panel
await page.waitForTimeout(150);
if ((await lengthField.count()) === 0) fail("spine panel has no Length field");
else {
  const original = await lengthField.inputValue();
  await lengthField.fill("0");
  await lengthField.blur();
  await page.waitForTimeout(300);
  const adv = page.locator(".hulladv");
  if ((await adv.count()) === 0) fail("a hull with no length raised no advisory");
  else {
    console.log("advisory:", (await adv.first().innerText()).replace(/\s+/g, " ").slice(0, 70));
    await adv.first().click();
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: shot("advisory") });
  await lengthField.fill(original);
  await lengthField.blur();
  await page.waitForTimeout(300);
  const back = await page.locator(".hullrail .stat", { hasText: "Length" }).locator(".v").innerText();
  if (!back.startsWith(original.split(".")[0])) fail(`length did not come back (${original} → ${back})`);
}

// The migrated hull must not be drowning in advisories it did not earn.
const advisoryCount = await page.locator(".hulladv").count();
console.log("advisories on the migrated hull:", advisoryCount);
if (advisoryCount > 20) fail(`${advisoryCount} advisories on an untouched hull — the pane is unreadable`);

// ---- export the silhouette --------------------------------------------------
await page.getByRole("button", { name: "Export SVG" }).click();
await page.waitForTimeout(400);
const toast = await page.locator(".toast").count();
if (toast === 0) fail("Export SVG produced no toast");

// ---- zoom and fit -----------------------------------------------------------
const svgBox = await page.locator(".hullsvg").boundingBox();
await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -120);
await page.waitForTimeout(200);
await page.screenshot({ path: shot("zoomed") });
const fitBtn = page.getByRole("button", { name: "Fit", exact: true });
if ((await fitBtn.count()) === 0) fail("no Fit button after zooming");
else await fitBtn.click();
await page.waitForTimeout(200);

// ---- the fleet strip --------------------------------------------------------
const plates = await page.locator(".hullplate").count();
console.log("fleet strip plates:", plates);

await page.screenshot({ path: shot("final") });
await browser.close();

console.log(errors.length ? "\nERRORS:\n" + errors.join("\n") : "\nno page errors");
process.exit(errors.length ? 1 : 0);
