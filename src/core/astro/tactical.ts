/**
 * Tactical symbols for the far-zoom map (docs/design-book/components/
 * TacticalSymbols, SystemMapFarZoom). Affiliation is the frame, after
 * MIL-STD-2525: friend a rectangle in glyph-navy, hostile a diamond in
 * status-red-mark, neutral a square in status-green-mark, unknown a
 * quatrefoil in status-amber-mark. Shape carries the meaning; colour repeats
 * it. An object nobody owns is drawn bare, with no frame.
 *
 * Framework-free: markup strings in theme tokens only, sized by the caller
 * from the --tac-frame-* tokens.
 */
import type { TypedRecord } from "../types";

export type Affiliation = "friend" | "hostile" | "neutral" | "unknown";
export const AFFILIATIONS: Affiliation[] = ["friend", "hostile", "neutral", "unknown"];
export type SpaceObject = "star" | "planet" | "station";

export const AFFILIATION_COLOR: Record<Affiliation, string> = {
  friend: "var(--glyph-navy)",
  hostile: "var(--status-red-mark)",
  neutral: "var(--status-green-mark)",
  unknown: "var(--status-amber-mark)",
};

/** A polity's side, from its `affiliation` field. Anything unrecognised is unknown (never a new shape). */
export function polityAffiliation(polity: TypedRecord | undefined): Affiliation | undefined {
  if (!polity) return undefined;
  const a = polity.fields.affiliation;
  return AFFILIATIONS.includes(a as Affiliation) ? (a as Affiliation) : "unknown";
}

/** Who owns a map object: a body's controller, a location's owner. Undefined → drawn bare. */
export function ownerOf(record: TypedRecord | undefined): string | undefined {
  if (!record) return undefined;
  const v = record.type === "location" ? record.fields.owner : record.fields.controller;
  return typeof v === "string" && v ? v : undefined;
}

export function affiliationOf(record: TypedRecord | undefined, lookup: (id: string) => TypedRecord | undefined, fallbackOwner?: string): Affiliation | undefined {
  const owner = ownerOf(record) ?? fallbackOwner;
  return owner ? polityAffiliation(lookup(owner)) : undefined;
}

const f = (n: number) => Number(n.toFixed(2));

/** The affiliation frame, centred on (0,0), w × h for the rectangle (the others take h as their size). */
export function frameMarkup(aff: Affiliation, w: number, h: number): string {
  const c = AFFILIATION_COLOR[aff];
  const common = `fill="none" stroke="${c}" stroke-width="var(--border-2)"`;
  switch (aff) {
    case "friend":
      return `<rect x="${f(-w / 2)}" y="${f(-h / 2)}" width="${f(w)}" height="${f(h)}" ${common}/>`;
    case "neutral":
      return `<rect x="${f(-h / 2)}" y="${f(-h / 2)}" width="${f(h)}" height="${f(h)}" ${common}/>`;
    case "hostile": {
      const r = h * 0.72;
      return `<path d="M0 ${f(-r)} L${f(r)} 0 L0 ${f(r)} L${f(-r)} 0 Z" ${common}/>`;
    }
    case "unknown": {
      const r = h * 0.27;
      const o = h * 0.26;
      return [
        [0, -o],
        [o, 0],
        [0, o],
        [-o, 0],
      ]
        .map(([x, y]) => `<circle cx="${f(x!)}" cy="${f(y!)}" r="${f(r)}" ${common}/>`)
        .join("");
    }
  }
}

/** The object inside the frame (or bare): an asterisk star, a disc planet, an anchor station. */
export function objectMarkup(obj: SpaceObject, h: number, color: string): string {
  const s = h * 0.32;
  switch (obj) {
    case "star":
      return [0, 60, 120].map((deg) => `<line x1="0" y1="${f(-s * 1.4)}" x2="0" y2="${f(s * 1.4)}" stroke="${color}" stroke-width="var(--border-2)" transform="rotate(${deg})"/>`).join("");
    case "planet":
      return `<circle r="${f(s * 0.7)}" fill="${color}"/>`;
    case "station":
      return `<path d="M0 ${f(-s)} V${f(s)} M${f(-s * 0.7)} ${f(-s * 0.35)} H${f(s * 0.7)} M${f(-s * 0.9)} ${f(s * 0.3)} Q0 ${f(s * 1.3)} ${f(s * 0.9)} ${f(s * 0.3)}" fill="none" stroke="${color}" stroke-width="var(--border-2)"/>`;
  }
}

/** A whole symbol: framed when an affiliation is known, bare otherwise. */
export function tacticalMarkup(obj: SpaceObject, aff: Affiliation | undefined, w: number, h: number): string {
  if (!aff) return objectMarkup(obj, h * 1.4, obj === "star" ? "var(--ink-200)" : "var(--ink-300)");
  return frameMarkup(aff, w, h) + objectMarkup(obj, h, AFFILIATION_COLOR[aff]);
}
