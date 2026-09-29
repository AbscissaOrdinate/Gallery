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
await page.waitForSelector(".rail");
await page.screenshot({ path: shot("02-overview") });

// A body record: schema form, units, derived figures.
await page.getByText("Body", { exact: true }).first().click();
await page.getByText("Earth", { exact: true }).first().click();
await page.waitForSelector(".doc-title");
await page.screenshot({ path: shot("03-record-body") });

// A craft: the budget panel and advisories.
await page.getByText("Craft", { exact: true }).first().click();
await page.locator(".listpane .rec").first().click();
await page.waitForSelector(".doc-title");
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

// ---- the record document layer (STYLE.md §4) ---------------------------------
// A new polity: kind has a default, government is required and empty, so the
// page shows a redaction bar, a pending count, the badge and both banners.
await page.getByRole("button", { name: /\+ NEW RECORD/ }).click();
await page.locator(".rail-form select").first().selectOption("polity");
await page.locator(".rail-form").getByPlaceholder("Name").fill("Smoke polity");
await page.getByRole("button", { name: "CREATE", exact: true }).click();
await page.waitForSelector(".recordpage");
await page.waitForTimeout(300);
const banners = await page.locator(".banner").allInnerTexts();
if (banners.length !== 2 || banners[0] !== banners[1]) errors.push(`banners: expected two identical, got ${JSON.stringify(banners)}`);
if (!/^UNCLASSIFIED — POL-SMOKE-POLITY$/.test(banners[0] ?? "")) errors.push(`unmarked banner reads ${JSON.stringify(banners[0])}`);
if ((await page.locator(".redact").count()) === 0) errors.push("no redaction bar for the empty required government field");
if ((await page.locator(".group-meta", { hasText: /FIELDS? PENDING/ }).count()) === 0) errors.push("no pending count in a group header");
const survey = await page.locator(".cbadge-row", { hasText: "SURVEY" }).innerText();
if (!/50% COMPLETE/.test(survey)) errors.push(`badge survey reads ${JSON.stringify(survey)}`);
await page.locator(".redact").first().hover();
await page.screenshot({ path: shot("07-record-page") });
// Mark it, and the banners follow; the save is logged.
const handling = page.locator(".rp-side .panel", { hasText: "HANDLING" });
await handling.locator(".frow", { has: page.locator(".flabel", { hasText: /^LEVEL$/ }) }).locator("select").selectOption("secret");
await handling.locator(".check", { hasText: /^SI$/ }).click();
await page.waitForTimeout(1500); // autosave
const marked = await page.locator(".banner").first().innerText();
if (marked !== "SECRET//SI — POL-SMOKE-POLITY") errors.push(`marked banner reads ${JSON.stringify(marked)}`);
if (!(await page.locator(".banner").first().getAttribute("class"))?.includes("lvl-secret")) errors.push("banner ground did not follow the level");
const revisions = await page.locator(".rp-side .revision").allInnerTexts();
if (!revisions.some((r) => /handling/.test(r))) errors.push(`revision log has no handling entry: ${JSON.stringify(revisions)}`);
// A bar reveals its field on click, so the gap can be filled.
await page.locator(".redact").first().click();
if ((await page.locator(".redact").count()) !== 0) errors.push("clicking the redaction bar did not reveal the field");
await page.screenshot({ path: shot("08-record-marked") });

await browser.close();
console.log(`screens → ${OUT}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("errors: none");
