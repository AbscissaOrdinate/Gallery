/**
 * Gallery core types.
 *
 * Everything in a vault is a *record*: one file per record, in a folder named
 * after the record type. Typed records (`polity`, `craft`, `module`, …) are
 * YAML or JSON documents that share a common envelope and carry a
 * schema-driven `fields` object. Notes are OPML outlines (Dynalist-compatible)
 * whose envelope lives in the OPML <head>.
 */

/** A typed reference to another record. `to` is a record id. */
export interface Link {
  rel: string;
  to: string;
  /** Optional free-text qualifier (e.g. "since 2131", "x4"). */
  note?: string;
}

/** A file asset referenced by a record (SVG portraits, PNG maps, …). Path is vault-relative. */
export interface AssetRef {
  role: string; // "portrait" | "map" | "sketch" | free text
  path: string; // e.g. "assets/sword-of-state.svg"
  caption?: string;
}

/** Classification level, highest first. A record with no `handling` is unclassified. */
export type HandlingLevel = "top-secret" | "secret" | "confidential" | "unclassified";
export const HANDLING_LEVELS: HandlingLevel[] = ["top-secret", "secret", "confidential", "unclassified"];

/**
 * The record's document marking (docs/STYLE.md §4.1). Every part is optional;
 * the banner reads UNCLASSIFIED when the block is absent. Vocabularies for
 * caveats, clearance, disruption and risk are closed, in gallery.config.yaml.
 */
export interface Handling {
  level?: HandlingLevel;
  caveats?: string[];
  /** Record code; blank derives one from the type's code prefix and the slug. */
  code?: string;
  /** Originating programme: a polity id, shown as its acronym. */
  programme?: string;
  /** ClassificationBadge rows. Clearance first. */
  badge?: { clearance?: string; disruption?: string; risk?: string };
  originator?: string;
  declassify_on?: string;
  derived_from?: string[];
}

/** One line of a record's revision log: when, and what changed, in a few words. */
export interface Revision {
  at: string; // ISO 8601
  change: string;
}

/** Common envelope shared by every record regardless of type. */
export interface RecordEnvelope {
  id: string;
  type: string;
  name: string;
  slug: string;
  tags: string[];
  aliases: string[];
  summary?: string;
  /** Markdown body for typed records. Notes keep their content in the outline instead. */
  body?: string;
  links: Link[];
  assets: AssetRef[];
  created: string; // ISO 8601
  updated: string; // ISO 8601
  /** Name of the preset this record was created from, if any. */
  preset?: string;
  /** Document marking (STYLE.md §4.1). Optional on every type. */
  handling?: Handling;
  /** Newest last; appended by the repository on save, capped (see core/handling.ts). */
  revisions?: Revision[];
}

/** A typed record: envelope + schema-driven fields. */
export interface TypedRecord extends RecordEnvelope {
  fields: Record<string, unknown>;
}

/** One node of an outline (OPML <outline>). Unknown attributes are preserved round-trip. */
export interface OutlineNode {
  text: string;
  note?: string;
  children: OutlineNode[];
  /** Extra OPML attributes (Dynalist: checked, complete, heading, …). */
  attrs?: Record<string, string>;
}

/** A note record: envelope + an outline. Stored as `.opml`. */
export interface NoteRecord extends RecordEnvelope {
  type: "note";
  outline: OutlineNode[];
}

export type GalleryRecord = TypedRecord | NoteRecord;

export function isNote(r: GalleryRecord): r is NoteRecord {
  return r.type === "note";
}

/** Where a record lives on disk. */
export interface RecordLocation {
  /** Vault-relative path, forward slashes. */
  path: string;
  format: "yaml" | "json" | "opml";
}

export interface LoadedRecord {
  record: GalleryRecord;
  location: RecordLocation;
  /** Parse/validation problems, if any. Record is still loaded. */
  problems?: string[];
  /**
   * What the record migrator did to bring this record up to the current shape,
   * in memory. The file on disk is untouched until the record is saved — an
   * upgrade must never rewrite a record behind the user's back.
   */
  migrated?: string[];
}

// ---------------------------------------------------------------------------
// Schemas & presets
// ---------------------------------------------------------------------------

/**
 * A pragmatic subset of JSON Schema (draft-07) plus a few `x-` extensions the
 * form renderer understands. Anything else is preserved but rendered as raw JSON.
 */
export interface FieldSchema {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object";
  title?: string;
  description?: string;
  default?: unknown;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
  items?: FieldSchema;
  properties?: Record<string, FieldSchema>;
  required?: string[];
  /** Multiline text (string). */
  "x-multiline"?: boolean;
  /** Unit label shown after a numeric input, e.g. "t", "MW", "km/s". */
  "x-unit"?: string;
  /** Numeric distance in AU or km: the form shows the equivalent in the vault's display unit (light-time by default). */
  "x-distance"?: boolean;
  /** Marks a string (or array of strings) as a reference to records of the given types. */
  "x-ref"?: { types: string[]; rel?: string };
  /** Group heading in the form. */
  "x-group"?: string;
  /** Hide from the form (computed or internal). */
  "x-hidden"?: boolean;
}

export interface TypeSchema {
  /** Type id, e.g. "craft". Used as file suffix (`.craft.yaml`). */
  id: string;
  /**
   * Built-in schema version. On open, a built-in with a higher version replaces
   * the on-disk copy (the old file is kept as `<type>.schema.v<N>.json`).
   * Set `custom: true` in the file to keep your edits and opt out of upgrades.
   */
  version?: number;
  custom?: boolean;
  title: string;
  description?: string;
  /** Folder under the vault root, e.g. "craft". */
  folder: string;
  /** Icon: a single emoji or short glyph for the sidebar. */
  icon?: string;
  /** JSON-Schema-ish description of `fields`. */
  fields: FieldSchema; // must be type: "object"
  /** Document handling for records of this type: the prefix a derived record code starts with. */
  handling?: { code_prefix?: string };
  /** Default `links[].rel` values offered in the link picker. */
  rels?: string[];
  /** Field names to surface as CSV index columns (dot paths into fields). */
  indexColumns?: string[];
}

/** A preset = starting values for a new record of a given type. */
export interface Preset {
  id: string;
  type: string;
  title: string;
  description?: string;
  tags?: string[];
  fields: Record<string, unknown>;
  links?: Link[];
  body?: string;
}

/** A closed vocabulary value that carries a severity (disruption and risk classes). */
export interface VocabEntry {
  value: string;
  severity: "nominal" | "caution" | "critical";
}

export interface HandlingVocab {
  clearance: string[];
  caveats: string[];
  disruption: VocabEntry[];
  risk: VocabEntry[];
}

/** Vault-level configuration, stored at `<root>/gallery.config.yaml`. */
export interface VaultConfig {
  name: string;
  /** Format used when writing typed records. Both are always readable. */
  recordFormat: "yaml" | "json";
  /** Regenerate `_index.csv` and `_exports/*.csv` on every save. */
  writeCsv: boolean;
  /** How distances are displayed: light-time (default), AU/km, or million km. Records always store AU and km. */
  distanceUnit: "light" | "au" | "mkm";
  /** Political-map colours for polities whose record sets no `color`. Vault data, seeded once (docs/STYLE.md §8). */
  polityPalette?: string[];
  /** Closed vocabularies for record handling (STYLE.md §4.1). Vault data, seeded once. */
  handling?: HandlingVocab;
  /** System map settings. `far_zoom_ratio`: below this fraction of the fit-to-system zoom the map switches to tactical symbols (default 0.75: two wheel steps out from fit). */
  map?: { far_zoom_ratio?: number };
  version: 1;
}

export const DEFAULT_FAR_ZOOM_RATIO = 0.75;

export const DEFAULT_VAULT_CONFIG: VaultConfig = {
  name: "Gallery",
  recordFormat: "yaml",
  writeCsv: true,
  distanceUnit: "light",
  version: 1,
};

/** Folder layout constants (vault-relative). */
export const VAULT = {
  configFile: "gallery.config.yaml",
  schemasDir: "_schemas",
  presetsDir: "_presets",
  constraintsDir: "_constraints",
  tablesDir: "_tables",
  exportsDir: "_exports",
  indexCsv: "_index.csv",
  assetsDir: "assets",
  notesDir: "notes",
} as const;
