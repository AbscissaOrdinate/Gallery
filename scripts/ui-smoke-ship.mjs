/**
 * Headless smoke check for editor 2's kernel, through the craft record's budget
 * rail.
 *
 *   npm run build && npx vite preview
 *   node scripts/ui-smoke-ship.mjs
 *
 * Per `docs/CLAUDE.md` this is not part of vitest: it needs a browser and a
 * preview server. The three-pane ship editor is the next pass; what this checks
 * is that the kernel's output survives the trip into React — the per-mode
 * columns, the section chips, the provisional marker and the grouped advisories
 * — and that editing a craft does not throw.
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const BASE = process.env.SMOKE_URL ?? "http://localhost:4173/";
const shot = (n) => `screenshots/ship-${n}.png`;

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
const fail = (msg) => {
  errors.push("assert: " + msg);
  console.error("FAIL " + msg);
};

await page.goto(BASE);
await page.getByText("Open the demo vault").click();
await page.waitForSelector(".sidebar");

// ---- open a craft ----------------------------------------------------------
await page.getByText("Craft", { exact: true }).first().click();
await page.waitForSelector(".listpane .rec");
const halberd = page.locator(".listpane .rec", { hasText: "Halberd-class (DDL)" }).first();
if ((await halberd.count()) === 0) fail("the Halberd variants are not in the demo vault");
else await halberd.click();
await page.waitForSelector(".budget");
await page.waitForTimeout(300);
await page.screenshot({ path: shot("budget"), fullPage: true });

// ---- the headline numbers are real -----------------------------------------
const stat = async (label) => {
  const el = page.locator(".stat", { hasText: label }).first();
  return (await el.count()) ? (await el.locator(".v").innerText()).trim() : "";
};
for (const label of ["Dry mass", "Wet mass", "Δv", "Crew"]) {
  const v = await stat(label);
  if (!v || v.startsWith("—") || v.startsWith("0")) fail(`${label} reads "${v}"`);
}
console.log("dry", await stat("Dry mass"), "| wet", await stat("Wet mass"), "| dv", await stat("Δv"), "| crew", await stat("Crew"));

// ---- the per-mode columns reached the DOM ----------------------------------
const modeRows = await page.locator("table.modes tbody tr").count();
if (modeRows !== 3) fail(`expected 3 operating modes, got ${modeRows}`);
const modeNames = await page.locator("table.modes tbody tr td:first-child").allInnerTexts();
console.log("modes:", modeNames.join(", "));

// Heat is reported as two arrays, never one total (docs/UNITS.md §5).
const headers = await page.locator("table.modes thead th").allInnerTexts();
// `table.tbl th` is uppercased by the theme, so match case-insensitively.
if (!headers.some((h) => /low-t/i.test(h)) || !headers.some((h) => /high-t/i.test(h))) fail(`heat is not split into two arrays: ${headers.join(" | ")}`);

// The DDL cannot power or cool itself in combat, and only in combat.
const warnCells = await page.locator("table.modes td.warn").count();
if (warnCells === 0) fail("no mode is flagged, but the DDL fails power and thermal in combat");

// ---- provenance reached the UI ---------------------------------------------
// A figure derived from a provisional table row must carry a visible marker
// everywhere it lands (docs/CLAUDE.md).
const provisional = await page.locator(".provisional").count();
if (provisional === 0) fail("Δv rests on a provisional propellant density and is not marked");
else console.log("provisional:", (await page.locator(".provisional").first().innerText()).trim().slice(0, 90));

// ---- section budgets and grouped advisories --------------------------------
const chips = await page.locator(".chip").allInnerTexts();
if (!chips.some((c) => /m³/.test(c))) fail("no section volume chips");
console.log("sections:", chips.filter((c) => /m³/.test(c)).join(" · "));

const advisories = await page.locator(".advisories li").count();
if (advisories === 0) fail("the DDL reports no advisories at all");
console.log("advisories:", advisories);

// ---- a clean fit is clean --------------------------------------------------
await page.locator(".listpane .rec", { hasText: "Halberd-class (DD)" }).first().click();
await page.waitForSelector(".budget");
await page.waitForTimeout(200);
const clean = await page.locator(".advisories li").allInnerTexts();
const hard = clean.filter((t) => /short by|over by/.test(t));
if (hard.length) fail(`the baseline gun fit should budget cleanly, but reports: ${hard.join(" | ")}`);
await page.screenshot({ path: shot("clean"), fullPage: true });

// ---- editing does not throw ------------------------------------------------
const watches = page.locator("input").filter({ hasNot: page.locator("[type=checkbox]") });
if (await watches.count()) {
  await watches.first().click();
  await page.keyboard.type("x");
  await page.waitForTimeout(200);
}

await browser.close();
if (errors.length) {
  console.error("\n" + errors.length + " problem(s):");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log("\nno page errors");
