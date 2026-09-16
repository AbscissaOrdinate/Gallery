/**
 * Map display modes (HOI4-style overlays): political control, economic /
 * industrial strength, habitability, military presence. Each returns a value
 * per body / location plus a colour; the map draws halos and a legend.
 */
import type { TypedRecord } from "../types";
import { deriveBody, type BodyDerived, type Lookup } from "./derive";

export type MapMode = "plain" | "political" | "economic" | "habitability" | "military";
export const MAP_MODES: { id: MapMode; label: string; description: string }[] = [
  { id: "plain", label: "Plain", description: "Classification glyphs only" },
  { id: "political", label: "Political", description: "Controlling polity (body field, else location owners)" },
  { id: "economic", label: "Economic", description: "Industrial strength 0–10 and population" },
  { id: "habitability", label: "Habitability", description: "Estimated 0–1 from class, temperature, gravity, pressure" },
  { id: "military", label: "Military", description: "Bases, shipyards, garrisons, craft based here" },
];

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** Categorical palette that reads on the navy ground (used when a polity has no colour). */
export const POLITY_PALETTE = ["#c9663a", "#4f8fd6", "#6fbf95", "#d9a83a", "#b46fd1", "#e07a6a", "#5fc6c9", "#9aa0a6", "#8fbf3a", "#d16f9e"];

export function polityColor(polity: TypedRecord | undefined, index: number): string {
  const c = polity ? str(polity.fields.color) : undefined;
  if (c && /^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (!polity) return "#5b6780";
  let h = 0;
  for (const ch of polity.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return POLITY_PALETTE[(index >= 0 ? index : h) % POLITY_PALETTE.length];
}

/** Sequential ramp (navy → rust) for 0..1. */
export function rampColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  const stops: [number, [number, number, number]][] = [
    [0, [61, 72, 97]],
    [0.35, [135, 96, 74]],
    [0.7, [201, 102, 58]],
    [1, [241, 200, 177]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const k = (x - t0) / (t1 - t0);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return "rgb(241,200,177)";
}
export function greenRamp(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  const r = Math.round(61 + (111 - 61) * x);
  const g = Math.round(72 + (191 - 72) * x);
  const b = Math.round(97 + (149 - 97) * x);
  return `rgb(${r},${g},${b})`;
}

export interface ControlShare {
  polityId: string | undefined;
  share: number; // 0..1
}
export interface BodyModes {
  control: ControlShare[]; // sorted desc; length 1 when uncontested
  controlSource: "field" | "derived" | "none";
  industry: number; // 0..10
  populationM: number;
  habitability: number; // 0..1
  habitabilitySource: "override" | "derived";
  military: number; // 0..10-ish
}

/** Locations that belong to a body: on it, orbiting it, or at one of its Lagrange points. */
export function locationsOf(bodyId: string, records: TypedRecord[]): TypedRecord[] {
  return records.filter((r) => r.type === "location" && (str(r.fields.body) === bodyId || str(r.fields.lagrange_of) === bodyId));
}

/**
 * Colonisation-friendliness 0–1: Earth ≈ 1, Mars ≈ 0.3, Titan ≈ 0.3, Luna ≈ 0.2,
 * Venus ≈ 0.1, gas giants ≈ 0.02. Weighted geometric blend of surface class,
 * temperature (Gaussian about 288 K, σ 50 K), gravity (0.5–1.5 g comfortable)
 * and pressure (0.5–3 atm); biospheres get a bonus. Override with the body's
 * `habitability` field.
 */
export function estimateHabitability(d: BodyDerived, fields: Record<string, unknown>): number {
  const gas = str(fields.gas_fraction);
  if (d.isStar) return 0;
  if (gas === "Jovian" || gas === "Neptunian") return 0.02;
  const surface = str(fields.surface_type);
  const fluid = str(fields.fluid);
  let base = 0.06;
  if (surface && /Gaian|Tohulian/.test(surface)) base = fluid === "Aquatic" || !fluid ? 0.75 : 0.35;
  else if (surface === "Abyssal" || surface === "Thalassic") base = fluid === "Aquatic" ? 0.5 : 0.25;
  else if (surface === "Calidian") base = 0.3;
  else if (surface === "Europan" || surface === "Ganymedean" || surface === "Phlegethean") base = 0.15;
  else if (surface === "Arean" || surface === "Agonian") base = 0.25;
  else if (surface === "Chionian") base = 0.1;
  else if (surface === "Cytherean" || surface === "Muspellian") base = 0.04;
  else if (surface === "Apnean") base = 0.06;
  let tFactor = 0.6;
  if (d.surfaceTempK !== undefined) {
    const dT = d.surfaceTempK - 288;
    tFactor = 0.2 + 0.8 * Math.exp(-(dT * dT) / (2 * 50 * 50));
  }
  let gFactor = 1;
  if (d.gravityG !== undefined) {
    if (d.gravityG < 0.5) gFactor = 0.5 + d.gravityG;
    else if (d.gravityG > 1.5) gFactor = Math.max(0.2, 1 - (d.gravityG - 1.5) * 0.5);
  }
  const p = num(fields.pressure_atm) ?? 0;
  let pFactor: number;
  if (p < 0.5) pFactor = 0.35 + (0.65 * p) / 0.5;
  else if (p > 3) pFactor = Math.max(0.2, 1 - (p - 3) / 30);
  else pFactor = 1;
  const life = str(fields.misc_life);
  const lifeBonus = life === "Macrobiotic" || life === "Neobiotic" ? 1.15 : 1;
  const score = Math.pow(base, 0.5) * Math.pow(tFactor, 0.35) * Math.pow(gFactor, 0.15) * Math.pow(pFactor, 0.15) * lifeBonus;
  return Math.max(0, Math.min(1, score));
}

export function bodyModes(body: TypedRecord, records: TypedRecord[], lookup: Lookup, derived?: BodyDerived): BodyModes {
  const d = derived ?? deriveBody(body, lookup);
  const f = body.fields;
  const locs = locationsOf(body.id, records);
  // political
  let control: ControlShare[] = [];
  let controlSource: BodyModes["controlSource"] = "none";
  const ctl = str(f.controller);
  if (ctl) {
    control = [{ polityId: ctl, share: 1 }];
    controlSource = "field";
  } else {
    const tally = new Map<string | undefined, number>();
    for (const l of locs) {
      const owner = str(l.fields.owner);
      const w = 1 + (num(l.fields.industry) ?? 0) * 0.3 + (num(l.fields.garrison) ?? 0) * 0.3 + Math.log10(1 + (num(l.fields.population_k) ?? 0));
      tally.set(owner, (tally.get(owner) ?? 0) + w);
    }
    const total = [...tally.values()].reduce((a, b) => a + b, 0);
    if (total > 0) {
      control = [...tally.entries()].map(([polityId, w]) => ({ polityId, share: w / total })).sort((a, b) => b.share - a.share);
      controlSource = "derived";
    }
  }
  // economic
  const industry = num(f.industry) ?? Math.min(10, locs.reduce((a, l) => a + (num(l.fields.industry) ?? 0), 0));
  const populationM = num(f.population_m) ?? locs.reduce((a, l) => a + (num(l.fields.population_k) ?? 0), 0) / 1000;
  // habitability
  const hOverride = num(f.habitability);
  const habitability = hOverride ?? estimateHabitability(d, f);
  // military
  const craftBased = records.filter((r) => r.type === "craft" && r.links.some((l) => l.rel === "based-at" && (l.to === body.id || locs.some((x) => x.id === l.to)))).length;
  const KIND_W: Record<string, number> = { base: 2, shipyard: 3, depot: 1, station: 0.5, skyhook: 0.5, elevator: 0.5, ring: 1 };
  const military = locs.reduce((a, l) => a + (num(l.fields.garrison) ?? 0) + (KIND_W[str(l.fields.kind) ?? ""] ?? 0), 0) + craftBased;
  return { control, controlSource, industry, populationM, habitability, habitabilitySource: hOverride !== undefined ? "override" : "derived", military };
}

export interface LocationModes {
  polityId?: string;
  industry: number;
  military: number;
  populationK: number;
}
export function locationModes(loc: TypedRecord, records: TypedRecord[]): LocationModes {
  const craftBased = records.filter((r) => r.type === "craft" && r.links.some((l) => l.rel === "based-at" && l.to === loc.id)).length;
  const KIND_W: Record<string, number> = { base: 2, shipyard: 3, depot: 1, station: 0.5 };
  return {
    polityId: str(loc.fields.owner),
    industry: num(loc.fields.industry) ?? 0,
    military: (num(loc.fields.garrison) ?? 0) + (KIND_W[str(loc.fields.kind) ?? ""] ?? 0) + craftBased,
    populationK: num(loc.fields.population_k) ?? 0,
  };
}
