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
  /** Base colour override (hex). */
  color?: string;
  /** Star temperature for colour ramp. */
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

/** Blackbody-ish colour by temperature. */
export function starColor(tempK: number | undefined): string {
  const t = tempK ?? 5800;
  if (t < 3700) return "#ff8a4c";
  if (t < 5200) return "#ffb56b";
  if (t < 6000) return "#fff1a8";
  if (t < 7500) return "#fdfbe8";
  if (t < 10000) return "#d9e8ff";
  return "#a9c5ff";
}

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

function caps(r: number, color = "#ffffff", size = 0.35): string {
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

/** SVG markup for a body glyph centred at the origin with radius r. */
export function glyphMarkup(spec: GlyphSpec, r: number): string {
  const rand = rng(spec.seed ?? spec.motif);
  const id = `g${(clipCounter++).toString(36)}${Math.floor(rand() * 1e6).toString(36)}`;
  const clip = `<clipPath id="${id}"><circle r="${f(r)}"/></clipPath>`;
  const shade = `<circle r="${f(r)}" fill="url(#${id}s)"/>`;
  const shadeDef = `<radialGradient id="${id}s" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0.25"/><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>`;
  const rings = spec.rings ? `<ellipse rx="${f(r * 2.1)}" ry="${f(r * 0.45)}" fill="none" stroke="${spec.color ?? "#d9c9a8"}" stroke-width="${f(Math.max(1, r * 0.22))}" opacity="0.55" transform="rotate(-18)"/>` : "";
  const ringsFront = spec.rings ? `<path d="M${f(-r * 2.1)} 0 A${f(r * 2.1)} ${f(r * 0.45)} 0 0 0 ${f(r * 2.1)} 0" fill="none" stroke="${spec.color ?? "#d9c9a8"}" stroke-width="${f(Math.max(1, r * 0.22))}" opacity="0.8" transform="rotate(-18)"/>` : "";
  const wrap = (inner: string, base: string) => `<defs>${clip}${shadeDef}</defs>${rings}<g clip-path="url(#${id})"><circle r="${f(r)}" fill="${base}"/>${inner}${shade}</g>${ringsFront}`;

  switch (spec.motif) {
    case "star": {
      const c = spec.color ?? starColor(spec.tempK);
      return `<defs><radialGradient id="${id}g"><stop offset="0" stop-color="${c}" stop-opacity="0.9"/><stop offset="0.5" stop-color="${c}" stop-opacity="0.25"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient><radialGradient id="${id}c" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="0.85"/></radialGradient></defs><circle r="${f(r * 1.9)}" fill="url(#${id}g)"/><circle r="${f(r)}" fill="url(#${id}c)"/>`;
    }
    case "gaian":
      return wrap(blobs(rand, r, 5, "#4f8a3c", 0.95) + blobs(rand, r, 3, "#8a7a4a", 0.6, 0.6) + blobs(rand, r, 4, "#ffffff", 0.45, 0.7) + (spec.caps !== false ? caps(r) : ""), spec.color ?? "#2d6fb8");
    case "ocean":
      return wrap(blobs(rand, r, 4, "#ffffff", 0.4, 0.8) + blobs(rand, r, 1, "#3f7f5f", 0.7, 0.4) + (spec.caps ? caps(r) : ""), spec.color ?? "#1f5fa8");
    case "amuno-gaian":
      return wrap(blobs(rand, r, 5, "#6d7a3a", 0.95) + blobs(rand, r, 3, "#e8f1e6", 0.45, 0.7) + (spec.caps !== false ? caps(r, "#eef6ef") : ""), spec.color ?? "#2f8a8a");
    case "cytherean":
      return wrap(bands(r, ["#f2d9a4", "#e8c58a", "#f4dfb3", "#e3bd7f", "#f1d6a0", "#e6c38b"], 0.9) + blobs(rand, r, 3, "#fff5dc", 0.35, 0.9), spec.color ?? "#e9c98f");
    case "arean":
      return wrap(blobs(rand, r, 4, "#7a3d22", 0.6) + blobs(rand, r, 2, "#d9a06a", 0.5, 0.6) + (spec.caps !== false ? caps(r, "#f5f0e6", 0.25) : ""), spec.color ?? "#c2652f");
    case "chionian":
      return wrap(blobs(rand, r, 3, "#d8b8a8", 0.7) + blobs(rand, r, 2, "#f7eee6", 0.8, 0.8) + caps(r, "#ffffff", 0.3), spec.color ?? "#e6c9b6");
    case "apnean":
      return wrap(craters(rand, r, 9, "#4a4a52", "#c9c9d1"), spec.color ?? "#8c8c96");
    case "europan":
      return wrap(cracks(rand, r, 7, "#a5663a", Math.max(0.6, r * 0.05)), spec.color ?? "#e9e3d2");
    case "ganymedean":
      return wrap(blobs(rand, r, 5, "#6b5f52", 0.7) + craters(rand, r, 5, "#4d453c", "#d8d0c4"), spec.color ?? "#a99d8c");
    case "calidian":
      return wrap(blobs(rand, r, 3, "#c97a2a", 0.5, 0.8) + `<circle r="${f(r)}" fill="#f0a94a" opacity="0.45"/>`, spec.color ?? "#d98c3a");
    case "gas-giant":
      return wrap(bands(r, ["#d9c3a3", "#b8946b", "#e8d8bf", "#a6784f", "#dcc7a8", "#c0a077", "#e4d3b6", "#ab8358"], 0.95) + `<ellipse cx="${f(r * 0.3)}" cy="${f(r * 0.25)}" rx="${f(r * 0.28)}" ry="${f(r * 0.14)}" fill="#c25a3a" opacity="0.85"/>`, spec.color ?? "#cbb08a");
    case "ice-giant":
      return wrap(bands(r, ["#7fd0d8", "#6cc0cc", "#8ad8de", "#66b8c6", "#83d2da"], 0.6), spec.color ?? "#74c6d0");
    case "hot-jupiter":
      return wrap(bands(r, ["#5a1f24", "#8a2f2a", "#4a181c", "#a63f2c", "#5e2024", "#8f3128"], 0.95) + `<circle r="${f(r)}" fill="#ff7a3a" opacity="0.15"/>`, spec.color ?? "#6b2327");
    case "lava":
      return wrap(cracks(rand, r, 8, "#ff7a2a", Math.max(0.8, r * 0.06)) + blobs(rand, r, 2, "#ffb04a", 0.5, 0.4), spec.color ?? "#2a2024");
    case "carbon":
      return wrap(bands(r, ["#2a2a2e", "#3a3a40", "#26262a", "#404048"], 0.8) + blobs(rand, r, 2, "#6a6a75", 0.35, 0.6), spec.color ?? "#303036");
    case "tholin":
      return wrap(bands(r, ["#c78a4a", "#b07238", "#d19a5c", "#a86a34"], 0.7) + `<circle r="${f(r)}" fill="#e0a45e" opacity="0.3"/>`, spec.color ?? "#bf8043");
    case "asteroid": {
      const pts: string[] = [];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (0.7 + rand() * 0.35);
        pts.push(`${f(Math.cos(a) * rr)},${f(Math.sin(a) * rr)}`);
      }
      return `<polygon points="${pts.join(" ")}" fill="${spec.color ?? "#8f8578"}" stroke="#3a342e" stroke-width="${f(Math.max(0.5, r * 0.06))}"/>${craters(rand, r * 0.8, 3, "#5a5148", "#c8bfb2")}`;
    }
    case "comet":
      return `<path d="M0 0 L${f(r * 4)} ${f(-r * 1.2)} L${f(r * 4.2)} ${f(r * 0.6)} Z" fill="${spec.color ?? "#9fd3ff"}" opacity="0.35"/><circle r="${f(r)}" fill="#e6f2ff"/><circle r="${f(r * 0.5)}" fill="#8fb8d8"/>`;
    case "belt":
      return `<circle r="${f(r)}" fill="none" stroke="${spec.color ?? "#8a7f70"}" stroke-width="${f(r * 0.5)}" stroke-dasharray="${f(r * 0.3)} ${f(r * 0.2)}" opacity="0.7"/>`;
    case "ring":
      return `<circle r="${f(r)}" fill="none" stroke="${spec.color ?? "#8b7355"}" stroke-width="${f(Math.max(2, r * 0.35))}"/>`;
    case "barycenter":
      return `<circle r="${f(r)}" fill="none" stroke="${spec.color ?? "#aeb4c6"}" stroke-width="1" stroke-dasharray="2 2"/><path d="M${f(-r)} 0H${f(r)}M0 ${f(-r)}V${f(r)}" stroke="${spec.color ?? "#aeb4c6"}" stroke-width="1"/>`;
    default:
      return wrap("", spec.color ?? "#8c8c96");
  }
}

/** Standalone <svg> for previews. */
export function glyphSvg(spec: GlyphSpec, size = 64): string {
  const r = size * 0.36;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-size / 2} ${-size / 2} ${size} ${size}" width="${size}" height="${size}">${glyphMarkup(spec, r)}</svg>`;
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

export function glyphSpecFor(record: TypedRecord, extras: { tempK?: number; tundral?: boolean } = {}): GlyphSpec {
  const fields = record.fields;
  const motif = motifFor(fields);
  return {
    motif,
    color: typeof fields.glyph_color === "string" && fields.glyph_color ? (fields.glyph_color as string) : typeof fields.star_color === "string" && fields.star_color ? (fields.star_color as string) : undefined,
    tempK: extras.tempK,
    rings: !!fields.has_rings,
    caps: extras.tundral,
    seed: record.id,
  };
}
