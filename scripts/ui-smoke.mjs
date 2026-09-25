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
const p = await b.newPage({ viewport: { width: 1380, height: 860 } });
const errors = [];
p.on("pageerror", e => errors.push("pageerror: " + e.message));
p.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
await p.goto("http://localhost:4173/");
await p.getByText("Open the demo vault").click();
await p.waitForSelector(".rail");
await p.screenshot({ path: "screenshots/overview.png" });
await p.getByText("Craft", { exact: true }).first().click();
await p.getByText("Sword-of-State-class").first().click();
await p.waitForSelector(".budget-panel");
await p.screenshot({ path: "screenshots/craft.png", fullPage: false });
await p.evaluate(() => document.querySelector(".main").scrollTo(0, 900));
await p.screenshot({ path: "screenshots/craft2.png" });
await p.getByText("Note", { exact: true }).first().click();
await p.locator(".listpane .rec").first().click();
await p.waitForSelector(".outliner");
// edit outline: click last item, press Enter, type
const texts = p.locator(".outliner textarea.text");
await texts.nth(1).click();
await p.keyboard.press("End");
await p.keyboard.press("Enter");
await p.keyboard.type("SCX - Experimental");
await p.keyboard.press("Tab");
await p.waitForTimeout(1200);
await p.screenshot({ path: "screenshots/note.png" });
// new record via + New
await p.getByText("+ New").click();
await p.selectOption(".rail-form select >> nth=0", "module");
await p.selectOption(".rail-form select >> nth=1", "laser-turret");
await p.fill(".rail-form input[placeholder=Name]", "Test laser");
await p.keyboard.press("Enter");
await p.waitForSelector(".doc-title");
await p.screenshot({ path: "screenshots/module.png" });
console.log("title:", await p.inputValue(".doc-title"));
console.log("errors:", errors);
await b.close();
// screenshots land in ./screenshots (create it first)
