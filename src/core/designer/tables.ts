/**
 * Reference tables — `<vault>/_tables/*.yaml` (§2.7).
 *
 * These are the sourced figures every recipe reads. Per §0 each row carries a
 * `source`, and a row whose figure was not taken from a cited source carries
 * `provisional: true`. This loader's one job beyond parsing is to make that flag
 * impossible to lose: `provisional` rides on every lookup and the expression
 * layer propagates it through the arithmetic, so a number derived from a
 * provisional row is itself provisional all the way to the UI.
 *
 * ## Shape
 *
 * The seeded files do not share a single `rows:` key. Each groups its rows under
 * whatever headings suit it — `radiators.yaml` has `physical:`, `physical_extras:`
 * and `game:`, `mounts.yaml` has one group per mount family — and every file
 * carries a `meta:` block of sources and formulas that is not rows at all. So a
 * group is detected structurally: a top-level key whose value is a list of
 * objects carrying an `id`, or a mapping with a `rows:` list of the same. Every
 * other top-level key is prose or metadata and is kept aside, not indexed.
 *
 * ## Addressing, and a deviation from the spec
 *
 * §2.3 specifies `table(file, row, column)`. That is ambiguous against the data
 * as seeded: `tin-droplet` exists in both `radiators.physical` (heat_cap_kw_m2,
 * mass_kg_m2) and `radiators.game` (mass_t_per_gw) and means different things in
 * each. Rather than silently pick one, a row reference may be qualified as
 * `group/id`, and a bare `id` that matches more than one group is an error that
 * names the candidates. A bare `id` that is unique still works, so every
 * expression the spec shows parses unchanged.
 */
import YAML from "yaml";
import type { StorageAdapter } from "../storage/adapter";
import { joinPath } from "../storage/adapter";
import { VAULT } from "../types";

export interface TableRow {
  file: string;
  group: string;
  id: string;
  name?: string;
  source?: string;
  era?: string;
  notes?: string;
  /** Row-level flag, or inherited from the file's `meta.provisional`. */
  provisional: boolean;
  /** The row as authored, including id/name/source. */
  values: Record<string, unknown>;
}

export interface TableFile {
  /** File name without extension, e.g. "radiators". */
  name: string;
  meta: Record<string, unknown>;
  /** True when `meta.provisional` marks the whole file unsourced. */
  provisional: boolean;
  /**
   * Column values every row in the file inherits unless it sets its own, from
   * `meta.defaults`.
   *
   * This is for properties that belong to the *file* because they follow from
   * its source. `crew_basis` is the example the mechanism was added for: the
   * 2026-09-19 ruling (`docs/UNITS.md` §4) is that every NEBULOUS crew figure
   * is a total rather than a per-watch station, and that is true of the whole
   * catalogue, not of individual rows. Repeating the literal on thirty rows is
   * how it drifts.
   *
   * Distinct from `meta.provisional`, which sets a first-class provenance flag
   * rather than a column — `source` and `provisional` are the whole provenance
   * vocabulary and stay out of here.
   */
  defaults: Record<string, unknown>;
  /** Group name → rows, in file order. */
  groups: Map<string, TableRow[]>;
  /** Top-level keys that were prose or metadata rather than rows. */
  nonRowKeys: string[];
}

export interface TableLookup {
  value: number | string | boolean;
  provisional: boolean;
  row: TableRow;
  column: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const isRowList = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.length > 0 && v.every(isObject) && v.some((r) => typeof r.id === "string");

function toRow(file: string, group: string, raw: Record<string, unknown>, fileProvisional: boolean, defaults: Record<string, unknown> = {}): TableRow | undefined {
  if (typeof raw.id !== "string") return undefined;
  return {
    file,
    group,
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : undefined,
    source: typeof raw.source === "string" ? raw.source : undefined,
    era: typeof raw.era === "string" ? raw.era : undefined,
    notes: typeof raw.note === "string" ? raw.note : typeof raw.notes === "string" ? raw.notes : undefined,
    provisional: raw.provisional === true || fileProvisional,
    // The row wins over the file, so a single exception stays expressible.
    values: { ...defaults, ...raw },
  };
}

/** Parse one table document. Exported so tests can build a TableSet without a filesystem. */
export function parseTableFile(name: string, text: string): TableFile {
  const doc = YAML.parse(text);
  const meta = isObject(doc) && isObject(doc.meta) ? doc.meta : {};
  const provisional = meta.provisional === true;
  const defaults = isObject(meta.defaults) ? meta.defaults : {};
  const groups = new Map<string, TableRow[]>();
  const nonRowKeys: string[] = [];

  if (isObject(doc)) {
    for (const [key, value] of Object.entries(doc)) {
      if (key === "meta") continue;
      let list: Record<string, unknown>[] | undefined;
      if (isRowList(value)) list = value;
      else if (isObject(value) && isRowList(value.rows)) list = value.rows;
      if (!list) {
        nonRowKeys.push(key);
        continue;
      }
      const rows = list.map((r) => toRow(name, key, r, provisional, defaults)).filter((r): r is TableRow => r !== undefined);
      if (rows.length) groups.set(key, rows);
      else nonRowKeys.push(key);
    }
  }
  return { name, meta, provisional, defaults, groups, nonRowKeys };
}

export class TableSet {
  readonly files = new Map<string, TableFile>();
  readonly problems: string[] = [];

  add(file: TableFile): void {
    this.files.set(file.name, file);
  }

  fileNames(): string[] {
    return [...this.files.keys()].sort();
  }

  rows(file: string): TableRow[] {
    const f = this.files.get(file);
    if (!f) return [];
    return [...f.groups.values()].flat();
  }

  /** A file's `meta` block, for conventions that belong to the table as a whole. */
  metaOf(file: string): Record<string, unknown> | undefined {
    return this.files.get(file)?.meta;
  }

  groupNames(file: string): string[] {
    return [...(this.files.get(file)?.groups.keys() ?? [])];
  }

  /**
   * Resolve `ref` — either `group/id` or a bare `id` — within a file.
   * Returns an error string rather than throwing; callers turn it into a violation.
   */
  find(file: string, ref: string): { row: TableRow } | { error: string } {
    const f = this.files.get(file);
    if (!f) return { error: `no table "${file}" (have: ${this.fileNames().join(", ") || "none"})` };

    const slash = ref.indexOf("/");
    if (slash >= 0) {
      const group = ref.slice(0, slash);
      const id = ref.slice(slash + 1);
      const rows = f.groups.get(group);
      if (!rows) return { error: `table "${file}" has no group "${group}" (have: ${this.groupNames(file).join(", ")})` };
      const row = rows.find((r) => r.id === id);
      return row ? { row } : { error: `table "${file}/${group}" has no row "${id}"` };
    }

    const matches: TableRow[] = [];
    for (const rows of f.groups.values()) for (const r of rows) if (r.id === ref) matches.push(r);
    if (matches.length === 1) return { row: matches[0] as TableRow };
    if (matches.length === 0) return { error: `table "${file}" has no row "${ref}"` };
    return {
      error: `"${ref}" is ambiguous in "${file}" — it appears in ${matches.length} groups. Qualify it: ${matches.map((m) => `"${m.group}/${m.id}"`).join(" or ")}`,
    };
  }

  lookup(file: string, ref: string, column: string): { lookup: TableLookup } | { error: string } {
    const found = this.find(file, ref);
    if ("error" in found) return found;
    const { row } = found;
    const value = row.values[column];
    if (value === undefined || value === null) {
      const available = Object.keys(row.values)
        .filter((k) => !["id", "name", "source", "note", "notes", "provisional", "era"].includes(k))
        .join(", ");
      return { error: `row "${row.group}/${row.id}" in "${file}" has no "${column}" (has: ${available})` };
    }
    if (typeof value !== "number" && typeof value !== "string" && typeof value !== "boolean") {
      return { error: `"${column}" on "${row.group}/${row.id}" in "${file}" is not a scalar` };
    }
    return { lookup: { value, provisional: row.provisional, row, column } };
  }

  /** Every provisional row, for the "what in here is a guess" report. */
  provisionalRows(): TableRow[] {
    return [...this.files.values()].flatMap((f) => [...f.groups.values()].flat()).filter((r) => r.provisional);
  }
}

/** Read and parse every `*.yaml` in the vault's `_tables/`. Missing directory is not an error. */
export async function loadTables(fs: StorageAdapter, dir: string = VAULT.tablesDir): Promise<TableSet> {
  const set = new TableSet();
  let entries;
  try {
    entries = await fs.list(dir);
  } catch {
    return set; // no _tables yet
  }
  for (const e of entries) {
    if (e.isDir || !/\.ya?ml$/i.test(e.name)) continue;
    const name = e.name.replace(/\.ya?ml$/i, "");
    try {
      const file = parseTableFile(name, await fs.readText(joinPath(dir, e.name)));
      set.add(file);
      if (file.groups.size === 0) set.problems.push(`${e.name}: no rows found`);
    } catch (err) {
      set.problems.push(`${e.name}: ${(err as Error).message}`);
    }
  }
  return set;
}
