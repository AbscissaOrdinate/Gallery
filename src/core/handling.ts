/**
 * The record document layer (docs/STYLE.md §4): handling marks, the banner
 * string, computed redaction and completeness, and the revision log.
 *
 * Pure and framework-free. Redaction is never a flag on a record: a field is
 * redacted when its schema marks it `required` and the record holds no value,
 * so completeness is computed, not stored.
 */
import type { FieldSchema, GalleryRecord, Handling, HandlingLevel, Revision, TypeSchema, TypedRecord } from "./types";
import { HANDLING_LEVELS, isNote } from "./types";

export const LEVEL_WORD: Record<HandlingLevel, string> = {
  "top-secret": "TOP SECRET",
  secret: "SECRET",
  confidential: "CONFIDENTIAL",
  unclassified: "UNCLASSIFIED",
};

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const strs = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v.map(str).filter((x): x is string => !!x);
  return out.length ? out : undefined;
};

/** Read a `handling` block from untrusted file data, keeping only the known shape. Empty → undefined. */
export function parseHandling(raw: unknown): Handling | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const level = HANDLING_LEVELS.includes(o.level as HandlingLevel) ? (o.level as HandlingLevel) : undefined;
  const b = o.badge && typeof o.badge === "object" && !Array.isArray(o.badge) ? (o.badge as Record<string, unknown>) : {};
  const badge = { clearance: str(b.clearance), disruption: str(b.disruption), risk: str(b.risk) };
  const h: Handling = {
    level,
    caveats: strs(o.caveats),
    code: str(o.code),
    programme: str(o.programme),
    badge: badge.clearance || badge.disruption || badge.risk ? badge : undefined,
    originator: str(o.originator),
    declassify_on: str(o.declassify_on),
    derived_from: strs(o.derived_from),
  };
  return compactHandling(h);
}

/** Drop empty parts; undefined when nothing is left, so an unmarked record writes no block. */
export function compactHandling(h: Handling | undefined): Handling | undefined {
  if (!h) return undefined;
  const out: Handling = {};
  if (h.level && h.level !== "unclassified") out.level = h.level;
  if (h.caveats?.length) out.caveats = h.caveats;
  if (h.code) out.code = h.code;
  if (h.programme) out.programme = h.programme;
  const badge = h.badge && { ...(h.badge.clearance ? { clearance: h.badge.clearance } : {}), ...(h.badge.disruption ? { disruption: h.badge.disruption } : {}), ...(h.badge.risk ? { risk: h.badge.risk } : {}) };
  if (badge && Object.keys(badge).length) out.badge = badge;
  if (h.originator) out.originator = h.originator;
  if (h.declassify_on) out.declassify_on = h.declassify_on;
  if (h.derived_from?.length) out.derived_from = h.derived_from;
  return Object.keys(out).length ? out : undefined;
}

export function parseRevisions(raw: unknown): Revision[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({ at: str(r.at) ?? "", change: str(r.change) ?? "" }))
    .filter((r) => r.at && r.change);
  return out.length ? out : undefined;
}

/** The record code: its own, else the type's prefix and the slug, uppercase. */
export function recordCode(r: GalleryRecord, schema?: TypeSchema): string {
  if (r.handling?.code) return r.handling.code;
  const prefix = schema?.handling?.code_prefix ?? r.type.toUpperCase();
  return `${prefix}-${r.slug.toUpperCase()}`;
}

/** A polity's short form for a programme marking: its acronym, else its name, uppercase. */
export function programmeLabel(polity: TypedRecord | undefined): string | undefined {
  if (!polity) return undefined;
  return (str(polity.fields.acronym) ?? polity.name).toLocaleUpperCase("en");
}

export function levelOf(r: GalleryRecord): HandlingLevel {
  return r.handling?.level ?? "unclassified";
}

/**
 * The banner line, identical top and bottom: `LEVEL//CAVEATS — CODE — PROGRAMME`.
 * A record with no handling reads UNCLASSIFIED — never no banner.
 */
export function bannerString(r: GalleryRecord, schema: TypeSchema | undefined, polity: TypedRecord | undefined): string {
  const marking = [LEVEL_WORD[levelOf(r)], ...(r.handling?.caveats ?? [])].join("//");
  return [marking, recordCode(r, schema), programmeLabel(polity)].filter(Boolean).join(" — ");
}

// ---------------------------------------------------------------------------
// Redaction and completeness
// ---------------------------------------------------------------------------

/** No value at all: absent, blank, an empty list or an empty object. Zero and false are values. */
export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

export interface Completeness {
  required: number;
  filled: number;
  /** Required keys with no value, in schema order. */
  pending: string[];
  /** filled ÷ required, or undefined when the type requires nothing. */
  fraction: number | undefined;
}

/** STYLE.md §4.2: completeness = filled required ÷ required. Notes carry no fields and so none. */
export function completeness(r: GalleryRecord, fields: FieldSchema | undefined): Completeness {
  const required = isNote(r) ? [] : (fields?.required ?? []).filter((k) => fields?.properties?.[k] && !fields.properties[k]!["x-hidden"]);
  const values = isNote(r) ? {} : (r as TypedRecord).fields;
  const pending = required.filter((k) => isEmptyValue(values[k]));
  return { required: required.length, filled: required.length - pending.length, pending, fraction: required.length ? (required.length - pending.length) / required.length : undefined };
}

// ---------------------------------------------------------------------------
// Revision log
// ---------------------------------------------------------------------------

/** How many entries a record keeps. */
export const REVISION_CAP = 20;
/** Saves this close together are one editing session, and one entry. */
export const REVISION_COALESCE_MS = 30 * 60 * 1000;

const ENVELOPE_PARTS: [keyof GalleryRecord, string][] = [
  ["name", "renamed"],
  ["slug", "file"],
  ["tags", "tags"],
  ["aliases", "aliases"],
  ["summary", "summary"],
  ["body", "notes"],
  ["links", "links"],
  ["assets", "assets"],
  ["handling", "handling"],
];

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What changed between two versions of a record, as short parts: `renamed`, `fields: length_m, beam_m`. */
export function describeChange(prev: GalleryRecord | undefined, next: GalleryRecord): string[] {
  if (!prev) return ["created"];
  const parts: string[] = [];
  for (const [k, word] of ENVELOPE_PARTS) if (!same(prev[k], next[k])) parts.push(word);
  if (isNote(next) || isNote(prev)) {
    if (isNote(next) && isNote(prev) && !same(prev.outline, next.outline)) parts.push("outline");
  } else {
    const a = (prev as TypedRecord).fields ?? {};
    const b = (next as TypedRecord).fields ?? {};
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !same(a[k], b[k]));
    if (keys.length) parts.push(`fields: ${keys.join(", ")}`);
  }
  return parts;
}

/** Merge change parts, uniting the `fields:` lists. */
function mergeParts(a: string[], b: string[]): string[] {
  const words = new Set<string>();
  const fields = new Set<string>();
  for (const p of [...a, ...b]) {
    if (p.startsWith("fields: ")) for (const k of p.slice(8).split(", ")) fields.add(k);
    else words.add(p);
  }
  return [...words, ...(fields.size ? [`fields: ${[...fields].join(", ")}`] : [])];
}

/** Keep a long field list readable in one line. */
function render(parts: string[]): string {
  return parts
    .map((p) => {
      if (!p.startsWith("fields: ")) return p;
      const keys = p.slice(8).split(", ");
      return keys.length > 6 ? `fields: ${keys.slice(0, 6).join(", ")} +${keys.length - 6}` : p;
    })
    .join(" · ");
}

function unrender(change: string): string[] {
  return change.split(" · ").map((p) => p.replace(/ \+\d+$/, ""));
}

/**
 * The record's revisions after a save: a new entry, or the last one widened if
 * it belongs to the same editing session. Nothing changed → unchanged log.
 */
export function nextRevisions(prev: GalleryRecord | undefined, next: GalleryRecord, now: string): Revision[] | undefined {
  const log = [...(prev?.revisions ?? next.revisions ?? [])];
  const parts = describeChange(prev, next);
  if (!parts.length) return log.length ? log : undefined;
  const last = log[log.length - 1];
  const recent = last && last.change !== "created" && Date.parse(now) - Date.parse(last.at) < REVISION_COALESCE_MS;
  if (last && recent && !parts.includes("created")) log[log.length - 1] = { at: now, change: render(mergeParts(unrender(last.change), parts)) };
  else log.push({ at: now, change: render(parts) });
  return log.slice(-REVISION_CAP);
}
