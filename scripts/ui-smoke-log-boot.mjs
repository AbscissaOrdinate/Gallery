// Smoke for UI redesign step 6 (docs/STYLE.md §6): the AdvisoryLog and the
// BootSequence, against their plates.
//
//   npm run build && npx vite preview        # then, in another shell:
//   node scripts/ui-smoke-log-boot.mjs [base-url] [out-dir]
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:4173/";
const OUT = process.argv[3] ?? "screenshots/log-boot";
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
// Brief boot (the default) is gone the moment loading finishes: it never holds the vault.
await page.waitForTimeout(200);
if ((await page.locator(".boot").count()) !== 0) errors.push("brief boot still showing after load");

// Make some events: a hull editor (advisories), a record page, the map.
await page.getByText("Hull", { exact: true }).first().click();
await page.locator(".listpane .rec").first().click();
await page.getByRole("button", { name: /Open hull editor/ }).click();
await page.waitForSelector(".hullsvg");
await page.waitForTimeout(300);
await page.getByText("Heliaris system", { exact: true }).first().click();
await page.waitForSelector(".mapsvg");
await page.waitForTimeout(300);

// ---- the log ------------------------------------------------------------------
await page.locator(".rail-item", { hasText: "Session log" }).click();
await page.waitForSelector(".logview");
const rows = page.locator(".log-row");
const n = await rows.count();
if (n < 5) errors.push(`only ${n} log lines`);
const first = await rows.first().locator(".log-msg").textContent();
if (!/^Vault mounted — \d+ records, \d+ kinds$/.test(first ?? "")) errors.push(`first line reads ${JSON.stringify(first)}`);
if (!/^VLT-0001$/.test((await rows.first().locator(".log-code").textContent()) ?? "")) errors.push("first code is not VLT-0001");
if (!/SESSION \d{4}/.test((await page.locator(".log-session").textContent()) ?? "")) errors.push("no session strip");
const sources = await page.locator(".log-src").allTextContents();
for (const s of ["vault", "hull", "map"]) if (!sources.includes(s)) errors.push(`no ${s} lines (${[...new Set(sources)].join(",")})`);
// Time order: timestamps never go backwards.
const ts = await page.locator(".log-ts").allTextContents();
if (ts.some((t, i) => i > 0 && t < ts[i - 1])) errors.push("log is not in time order");
await page.screenshot({ path: shot("01-log") });

// Toggle INFO off: dimmed in the bar, its count still shown, its lines out of the stream.
const info = page.locator(".log-filter", { hasText: "INFO" });
const infoCount = Number(await info.locator(".count").textContent());
await info.click();
if (!(await info.getAttribute("class"))?.includes("is-off")) errors.push("INFO toggle did not dim");
if (Number(await info.locator(".count").textContent()) !== infoCount) errors.push("INFO count changed when toggled off");
if ((await page.locator(".log-row .stamp", { hasText: /^INFO$/ }).count()) !== 0) errors.push("INFO lines still in the stream");
await info.click();
// A typed query.
await page.locator(".log-query").fill("source:hull severity:>=caution");
await page.waitForTimeout(100);
const hullSev = await page.locator(".log-row .stamp").allTextContents();
if (hullSev.some((s) => !/VIOLATION|CAUTION/.test(s))) errors.push(`query let through ${hullSev}`);
await page.locator(".log-query").fill("");
// Select a line: an outline inside the row, and the detail pane.
await rows.nth(1).click();
if (!(await rows.nth(1).getAttribute("class"))?.includes("is-current")) errors.push("row did not select");
if ((await page.locator(".logside .flabel", { hasText: /^RAISED$/ }).count()) !== 1) errors.push("detail pane has no RAISED row");
if (!/FOLLOWING TAIL|PAUSED/.test((await page.locator(".log-foot").textContent()) ?? "")) errors.push("footer has no follow state");
await page.screenshot({ path: shot("02-log-selected") });

// ---- full boot ------------------------------------------------------------------
await page.locator(".rail-item", { hasText: "Settings" }).click();
await page.getByLabel("Boot screen").selectOption("full");
await page.waitForTimeout(100);
await page.getByRole("button", { name: "REOPEN VAULT" }).click();
await page.waitForSelector(".boot");
await page.waitForSelector(".boot-idle");
const bootBanners = await page.locator(".boot .banner").allInnerTexts();
if (bootBanners.length !== 2 || bootBanners[0] !== "TOP SECRET//ORCON — GALLERY WORKBENCH — UESC" || bootBanners[1] !== bootBanners[0]) errors.push(`boot banners read ${JSON.stringify(bootBanners)}`);
const bootLines = await page.locator(".boot-msg").allTextContents();
for (const want of [/^HANDSHAKE/, /^AUTHORIZATION: TOP SECRET$/, /^RECONCILING TYPED SCHEMA — \d+ KINDS$/, /^MOUNTING VAULT — \d+ FILES$/]) if (!bootLines.some((l) => want.test(l))) errors.push(`no boot line ${want} in ${JSON.stringify(bootLines)}`);
if (!/100%/.test((await page.locator(".boot-progress").textContent()) ?? "")) errors.push("progress did not reach 100%");
if ((await page.getByLabel("PIN").evaluate((el) => el === document.activeElement)) !== true) errors.push("PIN field does not hold focus");
if (!(await page.getByRole("button", { name: "AUTHORIZE" }).isEnabled())) errors.push("AUTHORIZE not enabled after load");
const art = (await page.locator(".boot-art").textContent()) ?? "";
if (!art.includes("*") || !art.includes("o")) errors.push("orbital idle has no primary or bodies");
if ((await page.locator(".boot-primary").count()) !== 1) errors.push("primary not set apart");
await page.screenshot({ path: shot("03-boot-full") });
// Typing in the PIN field does not dismiss; any other key does.
await page.getByLabel("PIN").type("1234");
if ((await page.locator(".boot").count()) !== 1) errors.push("typing a PIN dismissed the boot");
await page.locator(".boot-wordmark").click();
await page.waitForTimeout(100);
if ((await page.locator(".boot").count()) !== 0) errors.push("a click did not dismiss the loaded boot");
// The reopened vault started a new session.
await page.locator(".rail-item", { hasText: "Session log" }).click();
await page.waitForSelector(".logview");
if (!/^VLT-0001$/.test((await page.locator(".log-row .log-code").first().textContent()) ?? "")) errors.push("reopen did not start a new session log");

await browser.close();
console.log(`log & boot → ${OUT}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("errors: none");
