/**
 * CSV index + per-type exports.
 *
 * `_index.csv` — one row per record across the whole vault (id, type, name,
 * slug, path, tags, updated, summary). Opens cleanly in Excel / Google Sheets.
 *
 * `_exports/<type>.csv` — one row per record of a type, with every scalar
 * field flattened (`fields.mass_t` → column `mass_t`, nested objects as dot
 * paths, arrays joined with `; `). Reference fields are emitted as the linked
 * record's name plus an `<field>_id` column so the sheet stays readable.
 */
import Papa from "papaparse";
import type { LoadedRecord, TypeSchema, FieldSchema } from "../types";
import { isNote } from "../types";

export interface IndexRow {
  id: string;
  type: string;
  name: string;
  slug: string;
  path: string;
  tags: string;
  aliases: string;
  updated: string;
  created: string;
  summary: string;
}

export function buildIndexRows(records: LoadedRecord[]): IndexRow[] {
  return records
    .map(({ record: r, location }) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      slug: r.slug,
      path: location.path,
      tags: r.tags.join("; "),
      aliases: r.aliases.join("; "),
      updated: r.updated,
      created: r.created,
      summary: r.summary ?? "",
    }))
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

export function indexCsv(records: LoadedRecord[]): string {
  return Papa.unparse(buildIndexRows(records), { newline: "\n" }) + "\n";
}

function flatten(prefix: string, value: unknown, out: Record<string, string>): void {
  if (value === null || value === undefined) {
    out[prefix] = "";
  } else if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== "object")) out[prefix] = value.map(String).join("; ");
    else out[prefix] = JSON.stringify(value);
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) flatten(prefix ? `${prefix}.${k}` : k, v, out);
  } else {
    out[prefix] = String(value);
  }
}

/** Collect x-ref field paths from a schema so we can resolve ids → names. */
function refPaths(schema: FieldSchema, prefix = ""): Map<string, true> {
  const m = new Map<string, true>();
  for (const [k, f] of Object.entries(schema.properties ?? {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (f["x-ref"]) m.set(p, true);
    if (f.type === "object" && f.properties) for (const [kk] of refPaths(f, p)) m.set(kk, true);
  }
  return m;
}

export function typeCsv(
  type: TypeSchema,
  records: LoadedRecord[],
  nameOf: (id: string) => string | undefined,
  extra?: (r: LoadedRecord) => Record<string, string>,
): string {
  const rows: Record<string, string>[] = [];
  const refs = refPaths(type.fields);
  const columns = new Set<string>(["id", "name", "slug", "tags", "updated"]);
  for (const { record: r } of records) {
    if (r.type !== type.id || isNote(r)) continue;
    const row: Record<string, string> = {
      id: r.id,
      name: r.name,
      slug: r.slug,
      tags: r.tags.join("; "),
      updated: r.updated,
    };
    const flat: Record<string, string> = {};
    flatten("", r.fields, flat);
    for (const [k, v] of Object.entries(flat)) {
      if (refs.has(k)) {
        const ids = v.split("; ").filter(Boolean);
        row[k] = ids.map((id) => nameOf(id) ?? id).join("; ");
        row[`${k}_id`] = v;
        columns.add(k);
        columns.add(`${k}_id`);
      } else {
        row[k] = v;
        columns.add(k);
      }
    }
    if (extra) {
      for (const [k, v] of Object.entries(extra({ record: r, location: { path: "", format: "yaml" } }))) {
        row[k] = v;
        columns.add(k);
      }
    }
    rows.push(row);
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return Papa.unparse(rows, { columns: [...columns], newline: "\n" }) + "\n";
}
