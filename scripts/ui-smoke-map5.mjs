import { chromium } from "@playwright/test";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
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
await p.screenshot({ path: "screenshots/v5-overview.png" });
// hover a heliocentric station label to see it enlarge
const nerio = await p.locator("g[data-el]", { has: p.locator("text", { hasText: /^Nerio Castle$/ }) }).first().boundingBox();
if (nerio) { await p.mouse.move(nerio.x + 5, nerio.y + 5); await p.waitForTimeout(300); }
await p.screenshot({ path: "screenshots/v5-station-hover.png", clip: { x: 350, y: 250, width: 700, height: 450 } });
// true scale overview and zoomed
await p.selectOption(".maptools select >> nth=1", "true");
await p.waitForTimeout(400);
await p.screenshot({ path: "screenshots/v5-truescale.png" });
const sun = await p.locator("g[data-el]", { has: p.locator("text", { hasText: /^Heliaris$/ }) }).first().boundingBox();
await p.mouse.move(sun.x + 5, sun.y + 5);
for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(30); }
await p.waitForTimeout(400);
await p.screenshot({ path: "screenshots/v5-truescale-zoom.png" });
// back to schematic, fit, export the SVG
await p.selectOption(".maptools select >> nth=1", "schematic");
await p.getByText("⤢").click();
await p.waitForTimeout(300);
const [dl] = await Promise.all([p.waitForEvent("download"), p.getByText("Export SVG").click()]);
await dl.saveAs("screenshots/heliaris-map.svg");
console.log("errors:", errors);
await b.close();
