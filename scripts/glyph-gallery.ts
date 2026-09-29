/** Renders every body preset's low-fi glyph into screenshots/glyphs.html for a visual check. */
import { readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import { BODY_PRESETS } from "../src/core/schema/builtin/bodyPresets";
import { glyphSvg, glyphSpecFor } from "../src/core/astro/glyph";
import { deriveStar } from "../src/core/astro/worldsmith";
import type { TypedRecord } from "../src/core/types";
import { glyphPaletteFrom } from "../src/core/astro/tints";
import { parseTableFile, TableSet } from "../src/core/designer/tables";
import { BODY_TINTS_FILE, bodyTintsTable } from "../src/core/schema/builtin/bodyTints";

// The seeded body-tints table, as a new vault would get it.
const tables = new TableSet();
tables.add(parseTableFile(BODY_TINTS_FILE, YAML.stringify(bodyTintsTable())));
const palette = glyphPaletteFrom(tables);

const cells = BODY_PRESETS.map((p) => {
  const rec = { id: p.id, type: "body", name: p.title, slug: p.id, tags: [], aliases: [], links: [], assets: [], created: "", updated: "", fields: p.fields } as TypedRecord;
  const tempK = typeof p.fields.mass_sol === "number" ? deriveStar(p.fields.mass_sol as number, 1, { luminositySol: p.fields.luminosity_sol as number | undefined, radiusSol: p.fields.radius_sol as number | undefined }).temperatureK : undefined;
  const tundral = /snowball|marslike|plutolike|earthlike/.test(p.id);
  const spec = glyphSpecFor(rec, { tempK, tundral });
  return `<div class="c">${glyphSvg(spec, 96, palette)}<div class="t">${p.title}</div><div class="m">${spec.motif}</div></div>`;
});
writeFileSync(
  "screenshots/glyphs.html",
  // Page chrome in theme tokens only (docs/STYLE.md §1); theme.css is inlined so the file stands alone.
  `<!doctype html><meta charset="utf-8"><style>${readFileSync("src/theme.css", "utf8")}body{background:var(--map-void);color:var(--ink-100);font:var(--text-label-md);margin:var(--space-6)}.g{display:grid;grid-template-columns:repeat(8,1fr);gap:var(--space-5)}.c{background:var(--surface-200);border:var(--border-1) solid var(--line-200);padding:var(--space-4);text-align:center}.t{margin-top:var(--space-2);font:var(--text-label-sm)}.m{color:var(--ink-300);font:var(--text-data-sm)}</style><div class="g">${cells.join("")}</div>`,
);
console.log(`wrote ${cells.length} glyphs`);
