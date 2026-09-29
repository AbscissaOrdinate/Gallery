// Map smoke for UI redesign step 5 (docs/STYLE.md §6): the SystemMap restyle and
// the far-zoom tactical level of detail, against the SystemMap and
// SystemMapFarZoom plates.
//
//   npm run build && npx vite preview        # then, in another shell:
//   node scripts/ui-smoke-map-lod.mjs [base-url] [out-dir]
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:4173/";
const OUT = process.argv[3] ?? "screenshots/map-lod";
mkdirSync(OUT, { recursive: true });
const shot = (name) => join(OUT, `${name}.png`);

async function launch() {
  const exe = process.env.SMOKE_CHROME;
  if (exe && existsSync(exe)) return chromium.launch({ executablePath: exe });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chromium" });
  }
}
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|404/.test(m.text())) errors.push("console: " + m.text());
});

await page.goto(BASE);
await page.getByText("Open the demo vault").click();
await page.waitForSelector(".rail");
await page.getByText("Heliaris system", { exact: true }).first().click();
await page.waitForSelector(".mapsvg");
await page.waitForTimeout(400);

// ---- working zoom -------------------------------------------------------------
if ((await page.locator(".mapsvg").getAttribute("data-lod")) !== "near") errors.push("map did not open at working zoom");
// Toolbar: segmented unit and spacing switches, the mode select.
for (const name of ["Distance units", "Orbit spacing"]) if ((await page.getByRole("radiogroup", { name }).count()) !== 1) errors.push(`no ${name} switch`);
// Labels are set in type tokens, never a numeric size.
const labelFonts = await page.$$eval(".mapsvg text", (ts) => ts.map((t) => t.getAttribute("font-size") ?? "").filter(Boolean));
if (labelFonts.length) errors.push(`labels with numeric font-size: ${labelFonts.slice(0, 3)}`);
const zoneLabels = await page.$$eval(".mapsvg text", (ts) => ts.map((t) => t.textContent));
for (const z of ["HABITABLE ZONE", "FROST LINE"]) if (!zoneLabels.includes(z)) errors.push(`no ${z} label`);
await page.screenshot({ path: shot("01-working") });

// Select Earth: halo, frame, dashed bracket, leader, accent label; the inspector's sel-head.
// Labels are not hit targets (they never block a pan): click the glyph's disc.
const clickCentre = async (loc) => {
  const b = await loc.boundingBox();
  if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  else errors.push("nothing to click");
};
const earth = page.locator(".mapsvg g[data-el]").filter({ has: page.locator("text", { hasText: /^Earth$/ }) }).first();
await clickCentre(earth.locator(":scope > g:not([data-ui]) circle").first());
await page.waitForTimeout(300);
const sel = page.locator("[data-ui=selection]");
if ((await sel.count()) !== 1) errors.push(`expected one selection mark, got ${await sel.count()}`);
else {
  const t = await sel.locator(".map-sel-label").textContent();
  if (t !== "EARTH") errors.push(`selection label reads ${JSON.stringify(t)}`);
  if ((await sel.locator("rect[stroke-dasharray]").count()) !== 1) errors.push("no dashed bracket");
}
const head = await page.locator(".mapinspector .sel-head .s").textContent().catch(() => "");
if (!/^SELECTED · BODY-EARTH$/.test(head ?? "")) errors.push(`inspector sel-head reads ${JSON.stringify(head)}`);
await page.screenshot({ path: shot("02-selected") });

// True scale shows a scale bar; schematic does not.
if ((await page.locator(".mapscale").count()) !== 0) errors.push("scale bar in schematic mode");
await page.click('.toolbar [role=radio]:has-text("TRUE SCALE")');
await page.waitForTimeout(300);
if ((await page.locator(".mapscale").count()) !== 1) errors.push("no scale bar in true scale");
await page.screenshot({ path: shot("03-true-scale") });
await page.click('.toolbar [role=radio]:has-text("SCHEMATIC")');
await page.waitForTimeout(300);

// ---- far zoom -----------------------------------------------------------------
await page.locator(".mapsvg [data-ui=bg]").click({ position: { x: 20, y: 20 } }); // deselect
const svgBox = await page.locator(".mapsvg").boundingBox();
await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
for (let i = 0; i < 3; i++) {
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(60);
}
await page.waitForTimeout(300);
if ((await page.locator(".mapsvg").getAttribute("data-lod")) !== "far") errors.push("zooming out did not reach far zoom");
const affs = await page.$$eval("[data-tactical]", (gs) => gs.map((g) => g.getAttribute("data-tactical")));
// The demo's LDF holds only Luna and its Earth–Moon castles, which far zoom drops with the moons.
for (const a of ["friend", "hostile", "none"]) if (!affs.includes(a)) errors.push(`no ${a} symbol at far zoom (${affs.join(",")})`);
if ((await page.locator(".mapsvg image, .mapsvg [data-el] ellipse").count()) !== 0) errors.push("rendered glyphs mixed into the far view");
if ((await page.locator(".mapkey").count()) !== 1) errors.push("no affiliation key at far zoom");
if (!/far zoom · symbols only/.test((await page.locator(".toolbar .meta").textContent()) ?? "")) errors.push("toolbar meta does not say far zoom");
await page.screenshot({ path: shot("04-far") });
// Selecting a symbol raises the inspector.
await clickCentre(page.locator('[data-tactical="hostile"] > rect').first());
await page.waitForTimeout(300);
if ((await page.locator("[data-ui=selection]").count()) !== 1) errors.push("far-zoom selection has no bracket");
if ((await page.locator(".mapinspector .sel-head").count()) !== 1) errors.push("far-zoom selection did not raise the inspector");
await page.screenshot({ path: shot("05-far-selected") });

await browser.close();
console.log(`map lod → ${OUT}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("errors: none");
