// Renders every design-book reference plate (docs/design-book/components/*/preview.html)
// against the app's own src/theme.css and screenshots it, so a smoke screenshot
// can be compared with the plate it is meant to match (docs/STYLE.md §6).
//
//   node scripts/ui-plates.mjs [out-dir]        # default screenshots/plates
//
// The plates are fragments with no stylesheet of their own: they read the same
// CSS variables as the app, so theme.css is injected ahead of each one.
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "screenshots/plates";
const BOOK = "docs/design-book/components";
mkdirSync(OUT, { recursive: true });

async function launch() {
  const exe = process.env.SMOKE_CHROME;
  if (exe && existsSync(exe)) return chromium.launch({ executablePath: exe });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chromium" });
  }
}
const theme = readFileSync("src/theme.css", "utf8");
const browser = await launch();
const errors = [];
for (const name of readdirSync(BOOK)) {
  const file = join(BOOK, name, "preview.html");
  if (!existsSync(file)) continue;
  const html = readFileSync(file, "utf8");
  const card = /@dsCard[^>]*?height=(\d+)[^>]*?width=(\d+)/.exec(html);
  const [height, width] = card ? [Number(card[1]), Number(card[2])] : [800, 1200];
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.setContent(`<!doctype html><html><head><style>${theme}</style></head><body>${html}</body></html>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  await page.close();
}
await browser.close();
console.log(`plates → ${OUT}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
