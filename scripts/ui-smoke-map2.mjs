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
await p.goto("http://localhost:4173/");
await p.getByText("Open the demo vault").click();
await p.waitForSelector(".rail");
await p.getByText("Body", { exact: true }).first().click();
await p.getByText("Titan", { exact: true }).first().click();
await p.waitForSelector(".panel");
await p.waitForTimeout(300);
await p.screenshot({ path: "screenshots/body-titan-derived.png" });
// map: drag Mars along its orbit, check saved angle changes
await p.getByText("Heliaris system", { exact: true }).first().click();
await p.waitForSelector(".mapsvg");
const box = await p.locator(".mapsvg").boundingBox();
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 6; i++) await p.mouse.wheel(0, -120);
await p.waitForTimeout(200);
// Labels are not hit targets: grab the glyph's disc (its label may sit either side).
const marsDisc = await p.locator("g[data-el]", { has: p.locator("text", { hasText: /^Mars$/ }) }).first().locator(":scope > g:not([data-ui]) circle").first().boundingBox();
await p.mouse.move(marsDisc.x + marsDisc.width / 2, marsDisc.y + marsDisc.height / 2);
await p.mouse.down();
await p.mouse.move(box.x + box.width / 2 + 40, box.y + 80, { steps: 12 });
await p.mouse.up();
await p.waitForTimeout(600);
await p.screenshot({ path: "screenshots/map-mars-dragged.png" });
await p.locator(".mapinspector .doc-title").waitFor({ timeout: 5000 });
console.log("selected after drag:", await p.inputValue(".mapinspector .doc-title"));
console.log("mars angle field:", await p.locator(".mapinspector input[type=number]").nth(5).inputValue());
// Export SVG (browser: download)
const [dl] = await Promise.all([p.waitForEvent("download"), p.getByText("Export SVG").click()]);
console.log("download:", dl.suggestedFilename());
await dl.saveAs("screenshots/heliaris-map.svg");
await b.close();
