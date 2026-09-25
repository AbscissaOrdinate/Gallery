// Screens smoke for the UI redesign (docs/STYLE.md §6): walks the main
// screens of the demo vault, screenshots each one, and fails on any page error.
//
//   npm run build && npx vite preview        # then, in another shell:
//   node scripts/ui-smoke-screens.mjs [base-url] [out-dir]
//
// Defaults: http://localhost:4173/ and screenshots/screens. Run it against a
// build of the base branch into a second directory to get a before/after pair.
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:4173/";
const OUT = process.argv[3] ?? "screenshots/screens";
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
await page.waitForTimeout(300);
await page.screenshot({ path: shot("01-welcome") });
await page.getByText("Open the demo vault").click();
await page.waitForSelector(".sidebar");
await page.screenshot({ path: shot("02-overview") });

// A body record: schema form, units, derived figures.
await page.getByText("Body", { exact: true }).first().click();
await page.getByText("Earth", { exact: true }).first().click();
await page.waitForSelector(".editor .title");
await page.screenshot({ path: shot("03-record-body") });

// A craft: the budget panel and advisories.
await page.getByText("Craft", { exact: true }).first().click();
await page.locator(".listpane .rec").first().click();
await page.waitForSelector(".editor .title");
await page.waitForTimeout(300);
await page.screenshot({ path: shot("04-record-craft") });

// The system map.
await page.getByText("Heliaris system", { exact: true }).first().click();
await page.waitForSelector(".mapsvg");
await page.waitForTimeout(500);
await page.screenshot({ path: shot("05-map") });

// Overlay modes: polity colours from records and the vault palette, token ramps.
const modeSelect = page.locator("select[title='Display mode']");
await modeSelect.selectOption("political");
await page.waitForTimeout(300);
await page.screenshot({ path: shot("05b-map-political") });
await modeSelect.selectOption("economic");
await page.waitForTimeout(300);
await page.screenshot({ path: shot("05c-map-economic") });
await modeSelect.selectOption("plain");

// An exported map must carry literal colours: theme tokens mean nothing outside the app.
const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export SVG" }).click()]);
const exported = await readFile(await download.path(), "utf8");
if (/var\(--|color-mix\(/.test(exported)) errors.push("export: map SVG still contains theme tokens");
if (!/fill="#[0-9a-f]{6}"/.test(exported)) errors.push("export: map SVG has no literal fills");

// The hull editor.
await page.getByText("Hull", { exact: true }).first().click();
await page.waitForSelector(".listpane .rec");
await page.locator(".listpane .rec").first().click();
await page.getByRole("button", { name: /Open hull editor/ }).click();
await page.waitForSelector(".hullsvg");
await page.waitForTimeout(400);
await page.screenshot({ path: shot("06-hull-editor") });

await browser.close();
console.log(`screens → ${OUT}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("errors: none");
