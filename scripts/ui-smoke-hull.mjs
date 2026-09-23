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

// ---- labels are legible ------------------------------------------------------
// The bug this guards: `render.ts` authored label sizes in metres while the
// canvas read them as screen pixels, so every label drew at 2.2-3 CSS pixels at
// every zoom level while the same scene exported fine (`gallery/09` §3.1). Only
// a browser can measure this — vitest is `environment: node`, and the canvas
// draws inside a metre-space group, so a computed font-size is in user units
// and says nothing. A client bounding box is in CSS pixels and does.
const labelPx = await page.evaluate(() =>
  [...document.querySelectorAll(".hullsvg text")].map((t) => t.getBoundingClientRect().height).filter((h) => h > 0),
);
if (labelPx.length === 0) fail("no labels drawn on the schematic");
else {
  const smallest = Math.min(...labelPx);
  console.log(`labels: ${labelPx.length}, smallest ${smallest.toFixed(1)} px`);
  if (smallest < 8) fail(`smallest label is ${smallest.toFixed(1)} CSS px — labels are sized in metres again`);
}

// And they hold that size as the view zooms, which is what a technical drawing
// wants — a label that grew with the hull would be no more readable.
{
  const box = await page.locator(".hullsvg").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -120);
  // Park the pointer off the canvas before measuring: hovering a section
  // enlarges its label on purpose, and that is not the size under test.
  await page.mouse.move(2, 2);
  await page.waitForTimeout(200);
  const zoomed = await page.evaluate(() => {
    const t = document.querySelector(".hullsvg text");
    return t ? t.getBoundingClientRect().height : 0;
  });
  if (zoomed > 0 && Math.abs(zoomed - labelPx[0]) > 1.5) fail(`label changed size on zoom (${labelPx[0].toFixed(1)} → ${zoomed.toFixed(1)} px)`);
  const fit = page.getByRole("button", { name: "Fit", exact: true });
  if ((await fit.count()) > 0) await fit.click();
  await page.waitForTimeout(150);
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

// ---- armour zones have an inspector -----------------------------------------
// Clicking an armour belt used to blank the whole inspector card: the canvas
// made zones pickable, `Inspector` had no `zone` branch, and the flow fell
// through to the appendage lookup and returned null (`gallery/09` §3.2).
//
// Last, and deliberately: the migrated Sword hull carries no armour zones, so
// this needs the UJCN pattern hull, and everything above is about the migrated
// one. Opening a second hull here disturbs nothing.
await page.getByRole("button", { name: "←" }).click();
await page.waitForSelector(".listpane .rec");
const halberd = page.locator(".listpane .rec", { hasText: "Halberd" }).first();
if ((await halberd.count()) === 0) fail("no Halberd hull in the demo vault to test armour zones on");
else {
  await halberd.click();
  await page.getByRole("button", { name: /Open hull editor/ }).click();
  await page.waitForSelector(".hullsvg");
  await page.waitForTimeout(400);

  // The outliner lists zones at all — they used to be reachable only by
  // hitting a 2 px belt stroke on the canvas.
  const zoneRow = page.locator(".hullpane .hullrow").filter({ hasText: "composite" }).first();
  if ((await zoneRow.count()) === 0) fail("armour zones missing from the outliner");
  else {
    await zoneRow.click();
    await page.waitForTimeout(200);
    const card = page.locator(".hullside .card").first();
    const heading = await card.locator("h3").innerText();
    if (!/armour/i.test(heading)) fail(`outliner zone row opened ${JSON.stringify(heading)}, not the armour inspector`);
    // The four authored fields, and the three derived from them.
    for (const label of ["From", "To", "Material", "Thickness", "Areal density", "Belt area", "Zone mass"]) {
      if ((await card.locator(".field", { hasText: label }).count()) === 0) fail(`armour inspector has no ${label} field`);
    }
    const mass = (await card.locator(".field", { hasText: "Zone mass" }).locator(".mono").innerText()).trim();
    // The demo vault seeds only propellants and munitions, so there is no
    // `armor` row to take a density from and the mass is honestly blank. What
    // it must not do is leave a bare dash with no reason given — an empty
    // number the person cannot act on is how the blank card read in the first
    // place. Against the working vault this branch shows a figure instead.
    if (/\d/.test(mass)) console.log("armour inspector:", heading.replace(/\s+/g, " "), "· zone mass", mass);
    else {
      const why = (await card.innerText()).replace(/\s+/g, " ");
      if (!/no density for this material/i.test(why)) fail(`zone mass is "${mass}" and the card does not say why`);
      else console.log("armour inspector:", heading.replace(/\s+/g, " "), "· no density in the demo vault, and says so");
    }
  }

  // Now the path that was actually reported: a click on the belt itself. The
  // belt is a stroke over a `fill="none"` path, so clicking the centre of its
  // bounding box would miss the stroke — aim at a real point on it.
  await page.locator(".hullsvg").click({ position: { x: 5, y: 5 } }); // clear the selection first
  await page.waitForTimeout(150);
  const onBelt = await page.evaluate(() => {
    // The longest belt, at its middle: a short one (the bow taper) can sit
    // under a slot's drag handle, which rightly takes the click.
    const belts = [...document.querySelectorAll('.hullsvg [data-pick^="zone:"]')].filter((e) => e.getTotalLength);
    const el = belts.sort((a, b) => b.getTotalLength() - a.getTotalLength())[0];
    if (!el) return null;
    const p = el.getPointAtLength(el.getTotalLength() * 0.5);
    const m = el.getScreenCTM();
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  });
  if (!onBelt) fail("no pickable armour belt on the canvas");
  else {
    await page.mouse.click(onBelt.x, onBelt.y);
    await page.waitForTimeout(200);
    const body = (await page.locator(".hullside .card").first().innerText()).replace(/\s+/g, " ");
    if (!/armour/i.test(body)) fail(`clicking the armour belt gave ${JSON.stringify(body.slice(0, 60))}, not the armour inspector`);
    else console.log("belt click:", body.slice(0, 60));
  }
  await page.screenshot({ path: shot("armour") });
}

// ---- a new hull starts from a class ------------------------------------------
// `gallery/09` §2: a blank hull must never leave a person facing an empty
// spine. The editor offers the classes, and picking one fills the geometry.
await page.getByRole("button", { name: "+ New" }).click();
await page.locator(".sidebar .card select").first().selectOption("hull");
await page.locator(".sidebar").getByPlaceholder("Name").fill("Smoke blank hull");
await page.getByRole("button", { name: "Create" }).click();
await page.getByRole("button", { name: /Open hull editor/ }).click();
await page.waitForSelector(".hullsvg, .hullwrap");
await page.waitForTimeout(300);
const picker = page.locator(".hullside .card", { hasText: "Start from a class" });
if ((await picker.count()) === 0) fail("a blank hull offers no classes to start from");
else {
  const offered = await picker.locator("button.classpick").count();
  if (offered !== 11) fail(`class picker offers ${offered} classes, not 11`);
  await picker.locator("button.classpick", { hasText: "CG" }).click();
  await page.waitForTimeout(400);
  const len = await page.locator(".hullrail .stat", { hasText: "Length" }).locator(".v").innerText();
  if (!len.startsWith("183")) fail(`picking the CG gave a ${len} hull, not 183 m`);
  if ((await page.locator(".hullside .card", { hasText: "Start from a class" }).count()) !== 0) fail("the class picker stayed up after a class filled the spine");
  console.log(`class picker: ${offered} classes; CG → ${len.replace(/\s+/g, " ")}`);
  await page.screenshot({ path: shot("class") });
}

await page.screenshot({ path: shot("final") });
await browser.close();

console.log(errors.length ? "\nERRORS:\n" + errors.join("\n") : "\nno page errors");
process.exit(errors.length ? 1 : 0);
