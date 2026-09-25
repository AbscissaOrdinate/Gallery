/**
 * Low-fidelity body portraits as SVG fragments.
 *
 * `glyphMarkup(spec, r)` returns SVG (inner markup) drawn centred on (0,0)
 * with radius r — usable inside the map, inside a preview <svg viewBox>, and
 * when exporting a system map as a standalone SVG. Motifs are deliberately
 * simple (10–20 primitives) so they read at 8–40 px. A `portrait` asset on the
 * record replaces the glyph when present (planet-map renders land here later).
 */
import type { TypedRecord } from "../types";
import { EMPTY_PALETTE, TINT_FALLBACK, starTint, type GlyphPalette, type MotifTint } from "./tints";

export type Motif =
  | "star"
  | "gaian"
  | "amuno-gaian"
  | "cytherean"
  | "arean"
  | "chionian"
  | "apnean"
  | "europan"
  | "ganymedean"
  | "calidian"
  | "gas-giant"
  | "ice-giant"
  | "hot-jupiter"
  | "lava"
  | "carbon"
  | "tholin"
  | "ocean"
  | "asteroid"
  | "comet"
  | "belt"
  | "ring"
  | "barycenter";

export interface GlyphSpec {
  motif: Motif;
  /** Base colour override from the record (hex). */
  color?: string;
  /** Star temperature, for the body-tints star rows. */
  tempK?: number;
  rings?: boolean;
  /** Polar caps (tundral/glacial). */
  caps?: boolean;
  /** Stable seed so the same body always gets the same blobs. */
  seed?: string;
}

// --- deterministic pseudo-random ------------------------------------------
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => Number(n.toFixed(2));

/** Random blobs (continents, maria, spots) clipped to the disc. */
function blobs(rand: () => number, r: number, n: number, fill: string, opacity = 1, scale = 1): string {
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.75;
    const cx = Math.cos(a) * d;
    const cy = Math.sin(a) * d;
    const rx = (0.18 + rand() * 0.28) * r * scale;
    const ry = (0.12 + rand() * 0.22) * r * scale;
    const rot = rand() * 180;
    out += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})" fill="${fill}" opacity="${opacity}"/>`;
  }
  return out;
}

function bands(r: number, colors: string[], opacity = 0.9): string {
  // horizontal bands as clipped rects
  let out = "";
  const n = colors.length;
  for (let i = 0; i < n; i++) {
    const y0 = -r + (2 * r * i) / n;
    const h = (2 * r) / n;
    out += `<rect x="${f(-r)}" y="${f(y0)}" width="${f(2 * r)}" height="${f(h + 0.5)}" fill="${colors[i]}" opacity="${opacity}"/>`;
  }
  return out;
}

function caps(r: number, color: string, size = 0.35): string {
  return `<ellipse cx="0" cy="${f(-r * 0.86)}" rx="${f(r * size)}" ry="${f(r * 0.14)}" fill="${color}" opacity="0.9"/><ellipse cx="0" cy="${f(r * 0.86)}" rx="${f(r * size)}" ry="${f(r * 0.14)}" fill="${color}" opacity="0.9"/>`;
}

function craters(rand: () => number, r: number, n: number, dark: string, light: string): string {
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.8;
    const cx = Math.cos(a) * d;
    const cy = Math.sin(a) * d;
    const cr = (0.05 + rand() * 0.14) * r;
    out += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(cr)}" fill="${dark}" opacity="0.55"/><circle cx="${f(cx - cr * 0.25)}" cy="${f(cy - cr * 0.25)}" r="${f(cr * 0.55)}" fill="${light}" opacity="0.35"/>`;
  }
  return out;
}

function cracks(rand: () => number, r: number, n: number, color: string, width: number): string {
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const x0 = Math.cos(a) * r * 0.9;
    const y0 = Math.sin(a) * r * 0.9;
    const x1 = (rand() - 0.5) * r;
    const y1 = (rand() - 0.5) * r;
    const x2 = -x0 + (rand() - 0.5) * r * 0.5;
    const y2 = -y0 + (rand() - 0.5) * r * 0.5;
    out += `<path d="M${f(x0)} ${f(y0)} Q${f(x1)} ${f(y1)} ${f(x2)} ${f(y2)}" stroke="${color}" stroke-width="${f(width)}" fill="none" opacity="0.8"/>`;
  }
  return out;
}

let clipCounter = 0;

/**
 * SVG markup for a body glyph centred at the origin with radius r.
 *
 * Colours come from the record (`spec.color`) or the vault's body-tints table
 * (`palette`), never from this module (docs/STYLE.md §1, §2). Fills are flat:
 * no shading gradient and no star glow. What neither source supplies falls
 * back to an ink token.
 */
export function glyphMarkup(spec: GlyphSpec, r: number, palette: GlyphPalette = EMPTY_PALETTE): string {
  const rand = rng(spec.seed ?? spec.motif);
  const id = `g${(clipCounter++).toString(36)}${Math.floor(rand() * 1e6).toString(36)}`;
  const t: MotifTint = palette.motifs[spec.motif] ?? {};
  const base = spec.color ?? t.base ?? TINT_FALLBACK.base;
  const detail = t.detail ?? TINT_FALLBACK.detail;
  const detail2 = t.detail_2 ?? TINT_FALLBACK.light;
  const cloud = t.cloud ?? TINT_FALLBACK.light;
  const cap = t.cap ?? TINT_FALLBACK.light;
  const bandsOf = (n: number): string[] => (t.bands?.length ? t.bands : Array.from({ length: n }, (_, i) => (i % 2 ? detail : base)));
  const ringColor = spec.color ?? palette.ring ?? TINT_FALLBACK.ring;
  const clip = `<clipPath id="${id}"><circle r="${f(r)}"/></clipPath>`;
  const rings = spec.rings ? `<ellipse rx="${f(r * 2.1)}" ry="${f(r * 0.45)}" fill="none" stroke="${ringColor}" stroke-width="${f(Math.max(1, r * 0.22))}" opacity="0.55" transform="rotate(-18)"/>` : "";
  const ringsFront = spec.rings ? `<path d="M${f(-r * 2.1)} 0 A${f(r * 2.1)} ${f(r * 0.45)} 0 0 0 ${f(r * 2.1)} 0" fill="none" stroke="${ringColor}" stroke-width="${f(Math.max(1, r * 0.22))}" opacity="0.8" transform="rotate(-18)"/>` : "";
  const wrap = (inner: string) => `<defs>${clip}</defs>${rings}<g clip-path="url(#${id})"><circle r="${f(r)}" fill="${base}"/>${inner}</g>${ringsFront}`;

  switch (spec.motif) {
    case "star":
      return `<circle r="${f(r)}" fill="${spec.color ?? starTint(palette, spec.tempK)}"/>`;
    case "gaian":
      return wrap(blobs(rand, r, 5, detail, 0.95) + blobs(rand, r, 3, detail2, 0.6, 0.6) + blobs(rand, r, 4, cloud, 0.45, 0.7) + (spec.caps !== false ? caps(r, cap) : ""));
    case "ocean":
      return wrap(blobs(rand, r, 4, cloud, 0.4, 0.8) + blobs(rand, r, 1, detail, 0.7, 0.4) + (spec.caps ? caps(r, cap) : ""));
    case "amuno-gaian":
      return wrap(blobs(rand, r, 5, detail, 0.95) + blobs(rand, r, 3, cloud, 0.45, 0.7) + (spec.caps !== false ? caps(r, cap) : ""));
    case "cytherean":
      return wrap(bands(r, bandsOf(6), 0.9) + blobs(rand, r, 3, cloud, 0.35, 0.9));
    case "arean":
      return wrap(blobs(rand, r, 4, detail, 0.6) + blobs(rand, r, 2, detail2, 0.5, 0.6) + (spec.caps !== false ? caps(r, cap, 0.25) : ""));
    case "chionian":
      return wrap(blobs(rand, r, 3, detail, 0.7) + blobs(rand, r, 2, detail2, 0.8, 0.8) + caps(r, cap, 0.3));
    case "apnean":
      return wrap(craters(rand, r, 9, detail, detail2));
    case "europan":
      return wrap(cracks(rand, r, 7, detail, Math.max(0.6, r * 0.05)));
    case "ganymedean":
      return wrap(blobs(rand, r, 5, detail, 0.7) + craters(rand, r, 5, detail2, cloud));
    case "calidian":
      return wrap(blobs(rand, r, 3, detail, 0.5, 0.8) + `<circle r="${f(r)}" fill="${cloud}" opacity="0.45"/>`);
    case "gas-giant":
      return wrap(bands(r, bandsOf(8), 0.95) + `<ellipse cx="${f(r * 0.3)}" cy="${f(r * 0.25)}" rx="${f(r * 0.28)}" ry="${f(r * 0.14)}" fill="${detail}" opacity="0.85"/>`);
    case "ice-giant":
      return wrap(bands(r, bandsOf(5), 0.6));
    case "hot-jupiter":
      return wrap(bands(r, bandsOf(6), 0.95) + `<circle r="${f(r)}" fill="${cloud}" opacity="0.15"/>`);
    case "lava":
      return wrap(cracks(rand, r, 8, detail, Math.max(0.8, r * 0.06)) + blobs(rand, r, 2, detail2, 0.5, 0.4));
    case "carbon":
      return wrap(bands(r, bandsOf(4), 0.8) + blobs(rand, r, 2, detail, 0.35, 0.6));
    case "tholin":
      return wrap(bands(r, bandsOf(4), 0.7) + `<circle r="${f(r)}" fill="${cloud}" opacity="0.3"/>`);
    case "asteroid": {
      const pts: string[] = [];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (0.7 + rand() * 0.35);
        pts.push(`${f(Math.cos(a) * rr)},${f(Math.sin(a) * rr)}`);
      }
      return `<polygon points="${pts.join(" ")}" fill="${base}" stroke="var(--line-100)" stroke-width="${f(Math.max(0.5, r * 0.06))}"/>${craters(rand, r * 0.8, 3, detail, detail2)}`;
    }
    case "comet":
      return `<path d="M0 0 L${f(r * 4)} ${f(-r * 1.2)} L${f(r * 4.2)} ${f(r * 0.6)} Z" fill="${base}" opacity="0.35"/><circle r="${f(r)}" fill="${cloud}"/><circle r="${f(r * 0.5)}" fill="${detail}"/>`;
    // Map structure rather than bodies: drawn in map tokens unless the record says otherwise.
    case "belt":
      return `<circle r="${f(r)}" fill="none" stroke="${spec.color ?? "var(--map-belt)"}" stroke-width="${f(r * 0.5)}" stroke-dasharray="${f(r * 0.3)} ${f(r * 0.2)}" opacity="0.7"/>`;
    case "ring":
      return `<circle r="${f(r)}" fill="none" stroke="${spec.color ?? "var(--map-belt)"}" stroke-width="${f(Math.max(2, r * 0.35))}"/>`;
    case "barycenter":
      return `<circle r="${f(r)}" fill="none" stroke="${spec.color ?? "var(--ink-300)"}" stroke-width="1" stroke-dasharray="2 2"/><path d="M${f(-r)} 0H${f(r)}M0 ${f(-r)}V${f(r)}" stroke="${spec.color ?? "var(--ink-300)"}" stroke-width="1"/>`;
    default:
      return wrap("");
  }
}

/** Standalone <svg> for previews. */
export function glyphSvg(spec: GlyphSpec, size = 64, palette: GlyphPalette = EMPTY_PALETTE): string {
  const r = size * 0.36;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-size / 2} ${-size / 2} ${size} ${size}" width="${size}" height="${size}">${glyphMarkup(spec, r, palette)}</svg>`;
}

/** Pick a motif from a body's classification fields. */
export function motifFor(fields: Record<string, unknown>): Motif {
  const g = fields.glyph as string | undefined;
  if (g && g !== "auto") return g as Motif;
  const kind = fields.kind as string | undefined;
  if (kind === "star" || kind === "brown-dwarf") return "star";
  if (kind === "barycenter") return "barycenter";
  if (kind === "belt") return "belt";
  if (kind === "ring" || kind === "artificial") return "ring";
  if (kind === "comet") return "comet";
  if (kind === "asteroid") return "asteroid";
  const gas = fields.gas_fraction as string | undefined;
  const aer = fields.aerosol as string | undefined;
  const temp = typeof fields.surface_temp_K === "number" ? (fields.surface_temp_K as number) : undefined;
  if (gas === "Jovian" || gas === "Neptunian") {
    if (aer && /Enstatian|Rutilian|Refractian|Carbean|Aithalian|Alkalinean|Erythronian|Chloridian|Silicolean|Sulfolian|Pyro|Hyperpyro|Epistellar/.test(aer)) return "hot-jupiter";
    if (aer === "Tholian") return "tholin";
    if (aer && /Cryo|Methanean|Borean|Neonean|Frigidian/.test(aer)) return "ice-giant";
    if (gas === "Neptunian" && !aer) return "ice-giant";
    return "gas-giant";
  }
  const surface = fields.surface_type as string | undefined;
  const fluid = fields.fluid as string | undefined;
  const co = fields.co_ratio as string | undefined;
  if (fluid === "Igneous" || fluid === "Salific") return "lava";
  if (co === "Carbonic" || co === "Carbidic" || fluid === "Petrolic" || fluid === "Bitumic") return "carbon";
  if (surface === "Cytherean" || surface === "Muspellian") return "cytherean";
  if (surface === "Calidian") return "calidian";
  if (surface === "Europan" || surface === "Phlegethean") return "europan";
  if (surface === "Ganymedean") return "ganymedean";
  if (surface === "Chionian") return "chionian";
  if (surface === "Arean" || surface === "Agonian") return "arean";
  if (surface === "Apnean") return "apnean";
  if (surface && /Gaian|Abyssal|Thalassic|Tohulian/.test(surface)) {
    const liquid = typeof fields.liquid_pct === "number" ? (fields.liquid_pct as number) : 70;
    if (liquid > 90 || surface === "Thalassic" || surface === "Abyssal") return "ocean";
    if (fluid === "Amunian") return "amuno-gaian";
    return "gaian";
  }
  if (kind === "moon" || kind === "dwarf") return temp !== undefined && temp < 100 ? "chionian" : "apnean";
  return "apnean";
}

const hexColor = (v: unknown): string | undefined => (typeof v === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim()) ? v.trim() : undefined);

export function glyphSpecFor(record: TypedRecord, extras: { tempK?: number; tundral?: boolean } = {}): GlyphSpec {
  const fields = record.fields;
  const motif = motifFor(fields);
  return {
    motif,
    // Hex only: the colour lands inside SVG markup, so anything else is dropped
    // rather than trusted (and the vault palette applies instead).
    color: hexColor(fields.glyph_color) ?? hexColor(fields.star_color),
    tempK: extras.tempK,
    rings: !!fields.has_rings,
    caps: extras.tundral,
    seed: record.id,
  };
}
