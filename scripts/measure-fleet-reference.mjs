/**
 * Measure the hull-class icons in `docs/refs/SolarSystem_Fleet_Deployment.png`
 * and print the table that `src/core/designer/hull/classes.ts` carries as
 * `FLEET_REFERENCE` — so the ladder is reproducible from the image rather than
 * trusted.
 *
 *   node scripts/measure-fleet-reference.mjs
 *
 * Like the smoke scripts this needs a browser (it reads pixels through a
 * canvas); set SMOKE_CHROME to use an installed one.
 *
 * ## Method (`gallery/09` §2)
 *
 * 1. Classify every pixel of the balance-of-forces panel (y ≥ 1990) into the
 *    four fleet colours, and find 8-connected components. Single letters drop
 *    out by width; the 42 px-tall flag boxes by height. What is left is ships.
 * 2. The chart draws every navy's ships with **one icon per class at one
 *    common scale**: widths agree across all four colours to within a pixel.
 *    So one Commonwealth (blue) icon per class is the sample, picked by its
 *    size. DD and DL share an icon, so DL cannot be measured apart.
 * 3. For each icon, per-column thickness weighted by ink coverage, so the
 *    anti-aliased edges count as the fraction of a pixel they are.
 * 4. Mask the radiator blocks — they stand off the hull and are not it —
 *    replacing them with the hull thickness under them, read off enlarged
 *    crops (`MASKS` below; the one manual step). Record each block's position
 *    and how far it reaches beyond the hull.
 * 5. Simplify the profile (Douglas–Peucker, 0.5 px) to breakpoints.
 */
import { chromium } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

async function launch() {
  const exe = process.env.SMOKE_CHROME;
  if (exe && existsSync(exe)) return chromium.launch({ executablePath: exe });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chromium" });
  }
}

/** Each class's icon, recognised by its size in pixels (width, height). */
const SAMPLES = { BB: [69, 24], CV: [59, 30], CL: [53, 22], CA: [44, 16], CG: [40, 12], DD: [31, 7] };

/**
 * Radiator blocks and one-pixel fin spikes, as inclusive column ranges from
 * the stern, with the hull thickness under a block (`null`: interpolate from
 * its neighbours). Read off 12× crops of each icon.
 */
const MASKS = {
  BB: [[0, 20, 8.5]],
  CV: [[0, 10, 16.5]],
  CL: [[0, 18, 7.5], [34, 38, null]],
  CA: [[0, 6, 7.9], [10, 10, null], [32, 35, null]],
  CG: [[0, 11, 4.4], [30, 30, null]],
  DD: [[7, 8, null], [14, 15, null]],
};
/** Radiator blocks proper, inclusive column ranges from the stern. */
const RADIATORS = { BB: [[3, 7], [9, 13], [15, 19]], CV: [[2, 5], [7, 10]], CL: [[2, 6], [8, 12], [14, 17], [35, 38]], CA: [[2, 5]], CG: [[1, 5], [7, 10]], DD: [] };

/** Runs inside the page: components of the four fleet colours, and a coverage profile per sample. */
function measure({ samples }) {
  const img = document.getElementById("ref");
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data: d, width: W, height: H } = ctx.getImageData(0, 0, c.width, c.height);
  const COL = [[19, 34, 225], [180, 100, 0], [230, 0, 0], [0, 150, 55]]; // blue, orange, red, green
  const lab = new Int8Array(W * H).fill(-1);
  for (let y = 1990; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      if (Math.max(r, g, b) - Math.min(r, g, b) < 90) continue;
      let best = -1;
      let bd = 90 * 90;
      COL.forEach((k, j) => {
        const dd = (r - k[0]) ** 2 + (g - k[1]) ** 2 + (b - k[2]) ** 2;
        if (dd < bd) [bd, best] = [dd, j];
      });
      lab[y * W + x] = best;
    }
  const seen = new Uint8Array(W * H);
  const comps = [];
  for (let s = 0; s < W * H; s++) {
    if (lab[s] < 0 || seen[s]) continue;
    const k = lab[s];
    let [x0, x1, y0, y1] = [W, -1, H, -1];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const q = stack.pop();
      const qx = q % W;
      const qy = (q - qx) / W;
      x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, qy); y1 = Math.max(y1, qy);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const [nx, ny] = [qx + dx, qy + dy];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const t = ny * W + nx;
          if (!seen[t] && lab[t] === k) { seen[t] = 1; stack.push(t); }
        }
    }
    comps.push({ colour: k, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  const ships = comps.filter((c) => c.w >= 30 && c.h !== 42);
  // Widths per colour, to show the scale is common to every navy.
  const widths = [0, 1, 2, 3].map((k) => [...new Set(ships.filter((c) => c.colour === k).map((c) => c.w))].sort((a, b) => a - b));
  const cov = (x, y) => Math.max(0, Math.min(1, (255 - d[(y * W + x) * 4]) / (255 - 19)));
  const profiles = {};
  for (const [name, [w, h]] of Object.entries(samples)) {
    const icon = ships.find((c) => c.colour === 0 && Math.abs(c.w - w) <= 1 && Math.abs(c.h - h) <= 1);
    const cols = [];
    for (let x = icon.x0 - 2; x <= icon.x0 + icon.w + 1; x++) {
      let sum = 0;
      for (let y = icon.y0 - 3; y <= icon.y0 + icon.h + 2; y++) sum += cov(x, y);
      if (sum > 0.15) cols.push(sum);
    }
    const peak = Math.min(Math.max(...cols), 3);
    profiles[name] = { at: [icon.x0, icon.y0], cols, len: cols.reduce((a, t) => a + Math.min(1, t / Math.max(1, peak)), 0) };
  }
  return { widths, profiles };
}

function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let [idx, dmax] = [-1, 0];
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const dist = Math.abs((b[1] - a[1]) * x - (b[0] - a[0]) * y + b[0] * a[1] - b[1] * a[0]) / Math.hypot(b[1] - a[1], b[0] - a[0]);
    if (dist > dmax) [idx, dmax] = [i, dist];
  }
  if (dmax <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

const browser = await launch();
const page = await browser.newPage();
const png = readFileSync("docs/refs/SolarSystem_Fleet_Deployment.png").toString("base64");
await page.setContent(`<img id="ref" src="data:image/png;base64,${png}">`);
await page.waitForFunction(() => document.getElementById("ref").complete);
const { widths, profiles } = await page.evaluate(measure, { samples: SAMPLES });
await browser.close();

console.log("Ship widths per fleet colour (px) — equal across colours means one common scale:");
["blue", "orange", "red", "green"].forEach((n, i) => console.log(`  ${n.padEnd(6)} ${widths[i].join(" ")}`));
console.log("\nFLEET_REFERENCE.icons:");
const r2 = (n) => Math.round(n * 100) / 100;
for (const [name, p] of Object.entries(profiles)) {
  const t = p.cols.slice();
  for (const [a, b, v] of MASKS[name]) {
    const [lo, hi] = [t[a - 1] ?? v, t[b + 1] ?? v];
    for (let i = a; i <= b; i++) t[i] = v ?? lo + ((hi - lo) * (i - a + 1)) / (b - a + 2);
  }
  const [L, N] = [p.len, t.length];
  const at = (i) => ((i + 0.5) * L) / N;
  const profile = simplify([[0, t[1]], ...t.slice(1, -1).map((v, i) => [at(i + 1), v]), [L, 0]], 0.5).map(([x, y]) => [r2(x), r2(y)]);
  const mean = t.reduce((a, v) => a + v, 0) / N;
  const radiators = RADIATORS[name].map(([a, b]) => {
    const peak = Math.max(...p.cols.slice(a, b + 1));
    const under = t.slice(a, b + 1).reduce((x, y) => x + y, 0) / (b - a + 1);
    return [r2((at(a) + at(b)) / 2), r2((peak - under) / 2)];
  });
  console.log(`  ${name}: ${JSON.stringify({ len_px: r2(L), mean_px: Math.round(mean * 1000) / 1000, profile, radiators })}`);
}
