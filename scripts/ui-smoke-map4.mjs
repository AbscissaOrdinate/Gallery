import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

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
const b = await launch();
const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
p.on("pageerror", e => errors.push("pageerror: " + e.message));
p.on("console", m => { if (m.type() === "error" && !/favicon|404/.test(m.text())) errors.push("console: " + m.text()); });
await p.goto("http://localhost:4173/");
await p.getByText("Open the demo vault").click();
await p.waitForSelector(".sidebar");
await p.getByText("Heliaris system", { exact: true }).first().click();
await p.waitForSelector(".mapsvg");
await p.waitForTimeout(500);
// zoom in a couple of steps on Earth so the Earth–Moon castles are visible but the neighbourhood still hidden
const earth = await p.locator("g[data-el]", { has: p.locator("text", { hasText: /^Earth$/ }) }).first().boundingBox();
await p.mouse.move(earth.x + 6, earth.y + 6);
for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(30); }
await p.waitForTimeout(300);
await p.screenshot({ path: "screenshots/v4-earth-mid.png", clip: { x: 300, y: 150, width: 800, height: 600 } });
// zoom fully in so the neighbourhood shows
for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(30); }
await p.waitForTimeout(300);
await p.screenshot({ path: "screenshots/v4-earth-nbhd.png", clip: { x: 300, y: 150, width: 800, height: 600 } });
// click Earth to open the inspector form and look for the light-time hint beside the AU input
const e2 = await p.locator("g[data-el]", { has: p.locator("text", { hasText: /^Earth$/ }) }).first().boundingBox();
await p.mouse.click(e2.x + 8, e2.y + 8);
await p.waitForTimeout(400);
const hints = await p.locator(".mapinspector .unit.muted").allInnerTexts();
console.log("hints:", hints);
await p.screenshot({ path: "screenshots/v4-inspector-hint.png", clip: { x: 1120, y: 80, width: 380, height: 820 } });
console.log("errors:", errors);
await b.close();
