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
await p.waitForSelector(".rail");
await p.getByText("Heliaris system", { exact: true }).first().click();
await p.waitForSelector(".mapsvg");
await p.waitForTimeout(500);
await p.screenshot({ path: "screenshots/v3-overview.png" });
const box = await p.locator(".mapsvg").boundingBox();
// zoom on Earth region: find Earth label, zoom there
const earth = await p.locator("g[data-el]", { has: p.locator("text", { hasText: /^Earth$/ }) }).first().boundingBox();
await p.mouse.move(earth.x + 6, earth.y + 6);
for (let i = 0; i < 9; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(30); }
await p.waitForTimeout(400);
await p.screenshot({ path: "screenshots/v3-earth-zoom.png" });
// hover Earth for tooltip
const earth2 = await p.locator("g[data-el]", { has: p.locator("text", { hasText: /^Earth$/ }) }).first().boundingBox();
await p.mouse.move(earth2.x + 8, earth2.y + 8);
await p.waitForTimeout(300);
await p.screenshot({ path: "screenshots/v3-earth-hover.png" });
console.log("tip:", (await p.locator(".maptip").innerText().catch(() => "none")).replace(/\n/g, " | "));
// political mode overview
await p.getByRole("button", { name: "Fit", exact: true }).click();
await p.selectOption(".toolbar select >> nth=0", "political");
await p.waitForTimeout(300);
await p.screenshot({ path: "screenshots/v3-political.png" });
await p.selectOption(".toolbar select >> nth=0", "habitability");
await p.waitForTimeout(300);
await p.screenshot({ path: "screenshots/v3-habitability.png" });
// true scale
await p.selectOption(".toolbar select >> nth=0", "plain");
await p.selectOption(".toolbar select >> nth=1", "true");
await p.waitForTimeout(400);
await p.screenshot({ path: "screenshots/v3-truescale.png" });
console.log("errors:", errors);
await b.close();
