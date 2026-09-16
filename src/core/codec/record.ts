/**
 * Typed-record codec: YAML and JSON in, either out.
 *
 * On disk a typed record is a single document:
 *
 *   id: 7k2m9x1qzp3a
 *   type: craft
 *   name: Sword-of-State-class
 *   slug: sword-of-state
 *   tags: [destroyer, ujcn]
 *   aliases: []
 *   summary: Railgun destroyer …
 *   links:
 *     - { rel: hull, to: … }
 *   assets:
 *     - { role: portrait, path: assets/sword-of-state.svg }
 *   fields: { … schema-driven … }
 *   created: 2026-09-14T00:00:00Z
 *   updated: 2026-09-14T00:00:00Z
 */
import YAML from "yaml";
import type { TypedRecord, Link, AssetRef } from "../types";
import { newId, nowIso, slugify } from "../ids";

export type RecordFormat = "yaml" | "json";

export function formatFromPath(path: string): RecordFormat | "opml" | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".opml")) return "opml";
  return null;
}

/** Extract `<type>` from `name.<type>.yaml` / `.json`. Returns null if not a record filename. */
export function typeFromFilename(filename: string): string | null {
  const m = /^(.+)\.([a-z][a-z0-9_-]*)\.(ya?ml|json)$/i.exec(filename);
  return m ? m[2].toLowerCase() : null;
}

export function recordFilename(slug: string, type: string, format: RecordFormat): string {
  return `${slug}.${type}.${format}`;
}

export function parseRecordText(text: string, format: RecordFormat): { record: TypedRecord; problems: string[] } {
  const raw = format === "json" ? JSON.parse(text) : YAML.parse(text);
  return normalizeRecord(raw);
}

/** Coerce a loosely-shaped object into a valid TypedRecord, reporting fixes. */
export function normalizeRecord(raw: unknown): { record: TypedRecord; problems: string[] } {
  const problems: string[] = [];
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (k: string, fallback = ""): string => (typeof o[k] === "string" ? (o[k] as string) : fallback);
  const arr = <T>(k: string, guard: (x: unknown) => x is T): T[] =>
    Array.isArray(o[k]) ? (o[k] as unknown[]).filter(guard) : [];

  const type = str("type");
  if (!type) problems.push("missing type");
  const name = str("name") || "Untitled";
  if (!o.name) problems.push("missing name");
  let id = str("id");
  if (!id) {
    id = newId();
    problems.push("missing id (generated)");
  }
  const slug = str("slug") || slugify(name);

  const isStr = (x: unknown): x is string => typeof x === "string";
  const isLink = (x: unknown): x is Link =>
    !!x && typeof x === "object" && typeof (x as Link).to === "string" && typeof (x as Link).rel === "string";
  const isAsset = (x: unknown): x is AssetRef =>
    !!x && typeof x === "object" && typeof (x as AssetRef).path === "string";

  const fields =
    o.fields && typeof o.fields === "object" && !Array.isArray(o.fields) ? (o.fields as Record<string, unknown>) : {};

  const record: TypedRecord = {
    id,
    type: type || "unknown",
    name,
    slug,
    tags: arr("tags", isStr),
    aliases: arr("aliases", isStr),
    summary: str("summary") || undefined,
    body: str("body") || undefined,
    links: arr("links", isLink).map((l) => ({ rel: l.rel, to: l.to, ...(l.note ? { note: l.note } : {}) })),
    assets: arr("assets", isAsset).map((a) => ({ role: a.role || "attachment", path: a.path, ...(a.caption ? { caption: a.caption } : {}) })),
    created: str("created") || nowIso(),
    updated: str("updated") || nowIso(),
    preset: str("preset") || undefined,
    fields,
  };
  return { record, problems };
}

/** Serialize with a stable key order so diffs stay readable in OneDrive/git. */
export function serializeRecord(r: TypedRecord, format: RecordFormat): string {
  const ordered: Record<string, unknown> = {
    id: r.id,
    type: r.type,
    name: r.name,
    slug: r.slug,
  };
  if (r.preset) ordered.preset = r.preset;
  ordered.tags = r.tags;
  ordered.aliases = r.aliases;
  if (r.summary) ordered.summary = r.summary;
  ordered.links = r.links;
  ordered.assets = r.assets;
  ordered.fields = r.fields;
  if (r.body) ordered.body = r.body;
  ordered.created = r.created;
  ordered.updated = r.updated;

  if (format === "json") return JSON.stringify(ordered, null, 2) + "\n";
  return YAML.stringify(ordered, { lineWidth: 100, indent: 2, blockQuote: "literal" });
}
