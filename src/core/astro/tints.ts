/**
 * Body glyph tints, read from the vault's `_tables/body-tints.yaml`.
 *
 * Body and polity colours are record data, never renderer constants
 * (docs/STYLE.md §1). The glyph renderer takes a `GlyphPalette` built here from
 * the loaded tables; anything the vault does not supply falls back to a theme
 * token, so a missing or partial table degrades to neutral ink rather than to
 * a colour nobody chose.
 */
import YAML from "yaml";
import type { StorageAdapter } from "../storage/adapter";
import { joinPath } from "../storage/adapter";
import { VAULT } from "../types";
import type { TableSet } from "../designer/tables";
import { BODY_TINTS_FILE, bodyTintsTable } from "../schema/builtin/bodyTints";

export interface MotifTint {
  base?: string;
  detail?: string;
  detail_2?: string;
  cloud?: string;
  cap?: string;
  bands?: string[];
}

export interface GlyphPalette {
  motifs: Record<string, MotifTint>;
  /** Ascending by `belowK`; the last entry may have none (the hottest class). */
  stars: { belowK?: number; color: string }[];
  ring?: string;
}

/** Token fallbacks for anything the vault does not supply. */
export const TINT_FALLBACK = {
  base: "var(--ink-300)",
  detail: "var(--ink-400)",
  light: "var(--ink-200)",
  star: "var(--ink-100)",
  ring: "var(--map-belt)",
} as const;

export const EMPTY_PALETTE: GlyphPalette = { motifs: {}, stars: [] };

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: unknown): string | undefined => (typeof v === "string" && HEX.test(v) ? v : undefined);

/** Build the palette from loaded tables. Invalid colours are dropped, not guessed at. */
export function glyphPaletteFrom(tables: TableSet | undefined): GlyphPalette {
  if (!tables || !tables.fileNames().includes(BODY_TINTS_FILE)) return EMPTY_PALETTE;
  const motifs: Record<string, MotifTint> = {};
  const stars: GlyphPalette["stars"] = [];
  let ring: string | undefined;
  for (const row of tables.rows(BODY_TINTS_FILE)) {
    const v = row.values;
    if (row.group === "motifs") {
      const bands = Array.isArray(v.bands) ? v.bands.map(hex).filter((b): b is string => !!b) : undefined;
      motifs[row.id] = { base: hex(v.base), detail: hex(v.detail), detail_2: hex(v.detail_2), cloud: hex(v.cloud), cap: hex(v.cap), bands: bands?.length ? bands : undefined };
    } else if (row.group === "stars") {
      const color = hex(v.color);
      if (color) stars.push({ belowK: typeof v.below_k === "number" ? v.below_k : undefined, color });
    } else if (row.group === "rings") {
      ring = hex(v.color) ?? ring;
    }
  }
  stars.sort((a, b) => (a.belowK ?? Infinity) - (b.belowK ?? Infinity));
  return { motifs, stars, ring };
}

/** Star colour by temperature from the palette, or the token fallback. */
export function starTint(palette: GlyphPalette, tempK: number | undefined): string {
  const t = tempK ?? 5800;
  const hit = palette.stars.find((s) => s.belowK === undefined || t < s.belowK);
  return hit?.color ?? TINT_FALLBACK.star;
}

/** Write the built-in body-tints table into a vault that lacks one. Never overwrites. */
export async function seedBodyTints(fs: StorageAdapter, dir: string = VAULT.tablesDir): Promise<number> {
  await fs.mkdirAll(dir);
  const path = joinPath(dir, `${BODY_TINTS_FILE}.yaml`);
  if (await fs.exists(path)) return 0;
  const header = [
    "# Body glyph tints -- default map colours per glyph motif.",
    "# A body record's glyph_color / star_color overrides its row. Edit freely;",
    "# Gallery writes this file only when it is missing.",
    "",
  ].join("\n");
  await fs.writeText(path, header + YAML.stringify(bodyTintsTable(), { lineWidth: 120 }));
  return 1;
}
