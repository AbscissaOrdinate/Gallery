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
await p.screenshot({ path: "screenshots/map-overview.png" });
// zoom into inner system: wheel up over center a few times
const box = await p.locator(".mapsvg").boundingBox();
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 6; i++) await p.mouse.wheel(0, -120);
await p.waitForTimeout(300);
await p.screenshot({ path: "screenshots/map-inner.png" });
// click Earth
await p.locator("[data-el] text", { hasText: /^Earth$/ }).first().click();
await p.waitForTimeout(400);
await p.screenshot({ path: "screenshots/map-earth-selected.png" });
// open body record for Earth
await p.locator(".mapinspector .editor .title").waitFor();
console.log("selected:", await p.inputValue(".mapinspector .editor .title"));
// body derived panel in record view
await p.getByText("Body", { exact: true }).first().click();
await p.getByText("Earth", { exact: true }).first().click();
await p.waitForSelector(".card");
await p.evaluate(() => document.querySelector(".main").scrollTo(0, 1800));
await p.waitForTimeout(300);
await p.screenshot({ path: "screenshots/body-derived.png" });
console.log("errors:", errors);
await b.close();
