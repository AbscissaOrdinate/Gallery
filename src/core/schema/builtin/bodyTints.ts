/**
 * Seed data for `<vault>/_tables/body-tints.yaml`: the default colours a body
 * glyph is drawn in when its record sets no `glyph_color` / `star_color`.
 *
 * This is vault data, not a renderer palette (docs/STYLE.md §1, §8). It is
 * written into the vault once, if missing, and read back through the table
 * loader; edit the vault file, not this, to retint a vault. Values are the
 * pre-redesign glyph.ts palette flattened and desaturated 25% so bodies sit
 * under ink-100 labels, with pure white replaced by an off-white.
 */
export const BODY_TINTS_FILE = "body-tints";

const SOURCE = "Gallery built-in glyph palette (pre-2026-09 glyph.ts), desaturated 25%";

export interface MotifTintSeed {
  base: string;
  detail?: string;
  detail_2?: string;
  cloud?: string;
  cap?: string;
  bands?: string[];
}

export const MOTIF_TINTS: Record<string, MotifTintSeed> = {
  gaian: { base: "#3e70a7", detail: "#548046", detail_2: "#827652", cloud: "#e6e9ec", cap: "#e6e9ec" },
  ocean: { base: "#306097", detail: "#47775f", cloud: "#e6e9ec", cap: "#e6e9ec" },
  "amuno-gaian": { base: "#3a7f7f", detail: "#687242", cloud: "#e9f0e7", cap: "#eff5f0" },
  cytherean: { base: "#dec69a", cloud: "#fbf3e0", bands: ["#e8d6ae", "#dcc296", "#ecdcbb", "#d6ba8c", "#e7d3aa", "#dbc096"] },
  arean: { base: "#b06a41", detail: "#6f412d", detail_2: "#cba078", cap: "#f3efe8" },
  chionian: { base: "#e0cabc", detail: "#d2baae", detail_2: "#f5eee8", cap: "#e6e9ec" },
  apnean: { base: "#8d8d95", detail: "#4b4b51", detail_2: "#cacad0" },
  europan: { base: "#e6e2d5", detail: "#986847" },
  ganymedean: { base: "#a59c90", detail: "#685f55", detail_2: "#4b453e", cloud: "#d6d0c7" },
  calidian: { base: "#c58b4e", detail: "#b57a3e", cloud: "#dba65f" },
  "gas-giant": { base: "#c3af92", detail: "#b1634b", bands: ["#d2c2aa", "#ae9375", "#e3d7c4", "#9b795a", "#d5c6af", "#b79f80", "#ded2bc", "#a18362"] },
  "ice-giant": { base: "#80bdc4", bands: ["#8ac7cd", "#78b7c0", "#94cfd4", "#72b0ba", "#8ec9cf"] },
  "hot-jupiter": { base: "#622c2f", cloud: "#e68353", bands: ["#53262a", "#7e3a36", "#441e21", "#974a3b", "#56282b", "#823c35"] },
  lava: { base: "#292124", detail: "#e48145", detail_2: "#e8ad61" },
  carbon: { base: "#313135", detail: "#6b6b74", bands: ["#2b2b2e", "#3b3b3f", "#27272a", "#414147"] },
  tholin: { base: "#b08052", cloud: "#d0a36e", bands: ["#b78a5a", "#a17247", "#c2996b", "#9a6b42"] },
  asteroid: { base: "#8c857b", detail: "#58514a", detail_2: "#c5bfb5" },
  comet: { base: "#abd2f3", cloud: "#e9f2fc", detail: "#98b7cf" },
};

/** Star colour by effective temperature: the first row whose `below_k` exceeds the temperature; the last row has none. */
export const STAR_TINTS: { id: string; below_k?: number; color: string }[] = [
  { id: "m", below_k: 3700, color: "#e99162" },
  { id: "k", below_k: 5200, color: "#edb57d" },
  { id: "g", below_k: 6000, color: "#f4eab3" },
  { id: "f", below_k: 7500, color: "#faf9eb" },
  { id: "a", below_k: 10000, color: "#dee9fa" },
  { id: "b", color: "#b4c9f4" },
];

/** Planetary rings with no record colour. */
export const RING_TINT = "#d3c7ae";

/** The table as written into a vault that has none. */
export function bodyTintsTable(): Record<string, unknown> {
  return {
    meta: {
      title: "Body glyph tints",
      description:
        "Default colours for body glyphs on the map, per motif. A body record's glyph_color (or star_color) overrides its row. Keep tints desaturated enough to sit under light labels on the dark map.",
    },
    motifs: Object.entries(MOTIF_TINTS).map(([id, v]) => ({ id, ...v, source: SOURCE })),
    stars: STAR_TINTS.map((s) => ({ ...s, source: SOURCE })),
    rings: [{ id: "default", color: RING_TINT, source: SOURCE }],
  };
}
