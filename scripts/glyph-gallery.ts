/** Renders every body preset's low-fi glyph into screenshots/glyphs.html for a visual check. */
import { writeFileSync } from "node:fs";
import { BODY_PRESETS } from "../src/core/schema/builtin/bodyPresets";
import { glyphSvg, glyphSpecFor } from "../src/core/astro/glyph";
import { deriveStar } from "../src/core/astro/worldsmith";
import type { TypedRecord } from "../src/core/types";

const cells = BODY_PRESETS.map((p) => {
  const rec = { id: p.id, type: "body", name: p.title, slug: p.id, tags: [], aliases: [], links: [], assets: [], created: "", updated: "", fields: p.fields } as TypedRecord;
  const tempK = typeof p.fields.mass_sol === "number" ? deriveStar(p.fields.mass_sol as number, 1, { luminositySol: p.fields.luminosity_sol as number | undefined, radiusSol: p.fields.radius_sol as number | undefined }).temperatureK : undefined;
  const tundral = /snowball|marslike|plutolike|earthlike/.test(p.id);
  const spec = glyphSpecFor(rec, { tempK, tundral });
  return `<div class="c">${glyphSvg(spec, 96)}<div class="t">${p.title}</div><div class="m">${spec.motif}</div></div>`;
});
writeFileSync(
  "screenshots/glyphs.html",
  `<!doctype html><meta charset="utf-8"><style>body{background:#141829;color:#e9e9ed;font:12px Inter,system-ui,sans-serif;margin:16px}.g{display:grid;grid-template-columns:repeat(8,1fr);gap:10px}.c{background:#1a2033;border:1px solid #2e374b;border-radius:8px;padding:8px;text-align:center}.t{margin-top:4px;font-weight:600}.m{color:#8792a8;font-size:11px}</style><div class="g">${cells.join("")}</div>`,
);
console.log(`wrote ${cells.length} glyphs`);
