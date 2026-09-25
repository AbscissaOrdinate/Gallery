/**
 * Vault repository: scan a folder, load every record, save records, keep the
 * CSV index and per-type exports current, resolve links and backlinks.
 */
import YAML from "yaml";
import type { StorageAdapter } from "./storage/adapter";
import { basename, joinPath, walk } from "./storage/adapter";
import { Registry, defaultsFor } from "./schema/registry";
import { formatFromPath, parseRecordText, recordFilename, serializeRecord, typeFromFilename } from "./codec/record";
import { parseNoteOpml, serializeNoteOpml } from "./codec/opml";
import { indexCsv, typeCsv } from "./codec/csv";
import { derivedColumns } from "./astro/derive";
import { loadTables, TableSet } from "./designer/tables";
import { migrateRecord } from "./schema/migrate";
import { seedBodyTints } from "./astro/tints";
import { nextRevisions } from "./handling";
import { HANDLING_VOCAB_SEED } from "./schema/builtin/handlingVocab";
import { POLITY_PALETTE_SEED } from "./schema/builtin/polityPalette";
import { composeConstraints, loadConstraints, seedConstraints, type ConstraintSelection, type ConstraintSet, type EffectiveConstraints } from "./designer/constraints";
import type { GalleryRecord, LoadedRecord, NoteRecord, Preset, TypedRecord, VaultConfig } from "./types";
import { DEFAULT_VAULT_CONFIG, VAULT, isNote } from "./types";
import { newId, nowIso, slugify } from "./ids";

export interface VaultStats {
  records: number;
  byType: Record<string, number>;
  problems: { path: string; problems: string[] }[];
}

/**
 * What load() is doing, for the boot screen (docs/STYLE.md §2: its log lines are the real load
 * steps). Every hook is optional; load() behaves the same without a reporter.
 */
export interface LoadReporter {
  /** The config has been read. */
  config?(config: VaultConfig): void;
  /** Schemas and presets are loaded. */
  schemas?(kinds: number, problems: number): void;
  /** Reference tables and constraint sets are loaded. */
  tables?(problems: number): void;
  /** Record files read so far, of the total found. */
  records?(done: number, total: number): void;
}

/** Read the config without loading anything else, for decisions made before load() (the boot mode). */
export async function peekConfig(fs: StorageAdapter): Promise<Partial<VaultConfig> | undefined> {
  try {
    const raw = YAML.parse(await fs.readText(VAULT.configFile)) as Partial<VaultConfig> | null;
    return raw && typeof raw === "object" ? raw : undefined;
  } catch {
    return undefined;
  }
}

export class Repository {
  readonly registry = new Registry();
  config: VaultConfig = { ...DEFAULT_VAULT_CONFIG };
  /** Reference tables from `_tables/` (§2.7). Empty until load(). */
  tables = new TableSet();
  /** Constraint sets from `_constraints/` (§2.8), plus the built-in default. */
  constraintSets = new Map<string, ConstraintSet>();
  /** Problems from the table and constraint loaders, surfaced beside record problems. */
  designProblems: string[] = [];
  /** Records the migrator brought forward on the last load, newest load only. */
  migrationReport: { id: string; name: string; notes: string[] }[] = [];
  private byId = new Map<string, LoadedRecord>();
  /** Each record as last read or written, so a save can say what changed even when the caller edited the stored object in place. */
  private saved = new Map<string, GalleryRecord>();
  private listeners = new Set<() => void>();

  constructor(public readonly fs: StorageAdapter) {}

  // ---- events ----------------------------------------------------------
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  // ---- lifecycle -------------------------------------------------------

  /** Create folder structure, config, schemas and presets if missing. */
  async init(): Promise<void> {
    const cfgPath = VAULT.configFile;
    if (!(await this.fs.exists(cfgPath))) {
      await this.fs.writeText(cfgPath, YAML.stringify({ ...this.config, polityPalette: [...POLITY_PALETTE_SEED], handling: structuredClone(HANDLING_VOCAB_SEED) }));
    } else {
      // Seed vault data added after the vault was made; never overwrite a value.
      try {
        const raw = YAML.parse(await this.fs.readText(cfgPath)) as Partial<VaultConfig> | null;
        if (raw && typeof raw === "object") {
          const add: Partial<VaultConfig> = {};
          if (!Array.isArray(raw.polityPalette)) add.polityPalette = [...POLITY_PALETTE_SEED];
          if (!raw.handling || typeof raw.handling !== "object") add.handling = structuredClone(HANDLING_VOCAB_SEED);
          if (Object.keys(add).length) await this.fs.writeText(cfgPath, YAML.stringify({ ...raw, ...add }));
        }
      } catch {
        // An unreadable config is load()'s to report, not init's to rewrite.
      }
    }
    await this.registry.seed(this.fs);
    for (const t of this.registry.types()) await this.fs.mkdirAll(t.folder);
    await this.fs.mkdirAll(VAULT.assetsDir);
    await this.fs.mkdirAll(VAULT.constraintsDir);
    await this.fs.mkdirAll(VAULT.tablesDir);
    await seedConstraints(this.fs);
    await seedBodyTints(this.fs);
    await this.fs.mkdirAll(VAULT.exportsDir);
  }

  async isVault(): Promise<boolean> {
    return this.fs.exists(VAULT.configFile);
  }

  /** Load config, registry and every record. Safe to call again to refresh. */
  async load(report: LoadReporter = {}): Promise<VaultStats> {
    try {
      const raw = YAML.parse(await this.fs.readText(VAULT.configFile)) as Partial<VaultConfig>;
      this.config = { ...DEFAULT_VAULT_CONFIG, ...raw, version: 1 };
    } catch {
      this.config = { ...DEFAULT_VAULT_CONFIG };
    }
    report.config?.(this.config);
    await this.registry.load(this.fs);
    report.schemas?.(this.registry.types().length, this.registry.problems.length);
    this.tables = await loadTables(this.fs);
    const constraints = await loadConstraints(this.fs);
    this.constraintSets = constraints.sets;
    this.designProblems = [...this.tables.problems, ...constraints.problems];
    report.tables?.(this.designProblems.length);

    const files = await walk(this.fs, "");
    const next = new Map<string, LoadedRecord>();
    const problems: VaultStats["problems"] = [];
    let done = 0;
    for (const path of files) {
      report.records?.(done++, files.length);
      const top = path.split("/")[0];
      if (top.startsWith("_") || top === VAULT.assetsDir || path === VAULT.configFile) continue;
      const fmt = formatFromPath(path);
      if (!fmt) continue;
      try {
        let loaded: LoadedRecord | null = null;
        if (fmt === "opml") {
          const text = await this.fs.readText(path);
          const { record, problems: p } = parseNoteOpml(text, basename(path).replace(/\.opml$/i, ""));
          loaded = { record, location: { path, format: "opml" }, problems: p.length ? p : undefined };
        } else {
          const type = typeFromFilename(basename(path));
          if (!type) continue; // plain yaml/json that isn't a record
          const text = await this.fs.readText(path);
          const { record, problems: p } = parseRecordText(text, fmt);
          if (record.type === "unknown") record.type = type;
          if (record.type !== type) p.push(`type "${record.type}" disagrees with filename "${type}"`);
          loaded = { record, location: { path, format: fmt }, problems: p.length ? p : undefined };
          // Records are migrated into the shape the app expects, in memory
          // only. The file keeps whatever it was authored as until something
          // saves it, so opening a vault never rewrites it.
          const m = migrateRecord(record);
          if (m.changed) {
            loaded.record = m.record;
            loaded.migrated = m.notes;
          }
        }
        if (loaded) {
          if (next.has(loaded.record.id)) {
            loaded.problems = [...(loaded.problems ?? []), `duplicate id with ${next.get(loaded.record.id)!.location.path}`];
          }
          next.set(loaded.record.id, loaded);
          if (loaded.problems) problems.push({ path, problems: loaded.problems });
        }
      } catch (err) {
        problems.push({ path, problems: [(err as Error).message] });
      }
    }
    report.records?.(files.length, files.length);
    this.byId = next;
    this.saved = new Map([...next].map(([id, lr]) => [id, structuredClone(lr.record)]));
    this.migrationReport = [...next.values()].filter((r) => r.migrated).map((r) => ({ id: r.record.id, name: r.record.name, notes: r.migrated! }));
    this.emit();
    const byType: Record<string, number> = {};
    for (const r of next.values()) byType[r.record.type] = (byType[r.record.type] ?? 0) + 1;
    return { records: next.size, byType, problems };
  }

  // ---- queries ---------------------------------------------------------

  all(): LoadedRecord[] {
    return [...this.byId.values()];
  }
  get(id: string): LoadedRecord | undefined {
    return this.byId.get(id);
  }
  record(id: string): GalleryRecord | undefined {
    return this.byId.get(id)?.record;
  }
  typed(id: string): TypedRecord | undefined {
    const r = this.byId.get(id)?.record;
    return r && !isNote(r) ? r : undefined;
  }
  ofType(type: string): LoadedRecord[] {
    return this.all().filter((r) => r.record.type === type);
  }
  nameOf(id: string): string | undefined {
    return this.byId.get(id)?.record.name;
  }

  /** Records that link to `id` (explicit links or x-ref fields). */
  backlinks(id: string): { from: LoadedRecord; rel: string }[] {
    const out: { from: LoadedRecord; rel: string }[] = [];
    for (const lr of this.byId.values()) {
      for (const l of lr.record.links) if (l.to === id) out.push({ from: lr, rel: l.rel });
      if (!isNote(lr.record)) {
        for (const [k, v] of Object.entries(lr.record.fields)) {
          if (v === id) out.push({ from: lr, rel: k });
          else if (Array.isArray(v)) {
            for (const item of v) {
              if (item === id) out.push({ from: lr, rel: k });
              else if (item && typeof item === "object") {
                for (const [ik, iv] of Object.entries(item as Record<string, unknown>)) if (iv === id) out.push({ from: lr, rel: `${k}.${ik}` });
              }
            }
          }
        }
      }
    }
    return out;
  }

  /**
   * The constraint set a craft is judged by: base, then era, then faction, then
   * bureau, each overriding the last (§2.8).
   */
  effectiveConstraints(selection: ConstraintSelection = {}): EffectiveConstraints {
    return composeConstraints(this.constraintSets, selection);
  }

  search(q: string): LoadedRecord[] {
    const needle = q.trim().toLowerCase();
    if (!needle) return this.all();
    return this.all().filter(({ record: r }) => {
      if (r.name.toLowerCase().includes(needle)) return true;
      if (r.tags.some((t) => t.toLowerCase().includes(needle))) return true;
      if (r.aliases.some((t) => t.toLowerCase().includes(needle))) return true;
      if (r.summary?.toLowerCase().includes(needle)) return true;
      return false;
    });
  }

  // ---- mutations -------------------------------------------------------

  /** Create a new typed record (optionally from a preset). Not saved until save() is called. */
  create(type: string, name: string, preset?: Preset): TypedRecord {
    const schema = this.registry.get(type);
    const fields = { ...(schema ? defaultsFor(schema.fields) : {}), ...(preset ? structuredClone(preset.fields) : {}) };
    const now = nowIso();
    return {
      id: newId(),
      type,
      name,
      slug: this.uniqueSlug(slugify(name), type),
      tags: [...(preset?.tags ?? [])],
      aliases: [],
      links: [...(preset?.links ?? [])],
      assets: [],
      fields,
      body: preset?.body,
      created: now,
      updated: now,
      preset: preset?.id,
    };
  }

  createNote(name: string): NoteRecord {
    const now = nowIso();
    return {
      id: newId(),
      type: "note",
      name,
      slug: this.uniqueSlug(slugify(name), "note"),
      tags: [],
      aliases: [],
      links: [],
      assets: [],
      created: now,
      updated: now,
      outline: [{ text: "", children: [] }],
    };
  }

  private uniqueSlug(base: string, type: string): string {
    const taken = new Set(this.all().filter((r) => r.record.type === type).map((r) => r.record.slug));
    if (!taken.has(base)) return base;
    for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
    return `${base}-${newId(4)}`;
  }

  pathFor(r: GalleryRecord): string {
    if (isNote(r)) return joinPath(VAULT.notesDir, `${r.slug}.opml`);
    const folder = this.registry.folderFor(r.type);
    return joinPath(folder, recordFilename(r.slug, r.type, this.config.recordFormat));
  }

  /** Persist a record (new or existing). Renames the file if slug/type changed. */
  async save(r: GalleryRecord, opts: { touch?: boolean } = {}): Promise<LoadedRecord> {
    if (opts.touch !== false) {
      r.updated = nowIso();
      // The revision log (STYLE.md §4, RecordPage): one entry per editing session.
      const revisions = nextRevisions(this.saved.get(r.id), r, r.updated);
      if (revisions) r.revisions = revisions;
    }
    const existing = this.byId.get(r.id);
    let path = existing?.location.path ?? this.pathFor(r);
    // keep the existing format unless the type/slug changed
    const desired = this.pathFor(r);
    if (existing && basename(existing.location.path) !== basename(desired)) {
      const keepFmt = existing.location.format;
      const newPath = isNote(r) ? desired : joinPath(this.registry.folderFor(r.type), recordFilename(r.slug, r.type, keepFmt === "opml" ? this.config.recordFormat : keepFmt));
      if (newPath !== existing.location.path) {
        await this.fs.mkdirAll(newPath.split("/").slice(0, -1).join("/"));
        try {
          await this.fs.rename(existing.location.path, newPath);
        } catch {
          /* fall through: will write new and remove old */
          await this.fs.remove(existing.location.path).catch(() => undefined);
        }
        path = newPath;
      }
    }
    const fmt = formatFromPath(path) ?? this.config.recordFormat;
    await this.fs.mkdirAll(path.split("/").slice(0, -1).join("/"));
    const text = isNote(r) ? serializeNoteOpml(r) : serializeRecord(r, fmt === "opml" ? this.config.recordFormat : fmt);
    await this.fs.writeText(path, text);
    const loaded: LoadedRecord = { record: r, location: { path, format: fmt === "opml" ? "opml" : fmt } };
    this.byId.set(r.id, loaded);
    this.saved.set(r.id, structuredClone(r));
    this.emit();
    if (this.config.writeCsv) await this.writeCsv().catch(() => undefined);
    return loaded;
  }

  async delete(id: string): Promise<void> {
    const lr = this.byId.get(id);
    if (!lr) return;
    await this.fs.remove(lr.location.path);
    this.byId.delete(id);
    this.saved.delete(id);
    this.emit();
    if (this.config.writeCsv) await this.writeCsv().catch(() => undefined);
  }

  async saveConfig(cfg: Partial<VaultConfig>): Promise<void> {
    this.config = { ...this.config, ...cfg, version: 1 };
    await this.fs.writeText(VAULT.configFile, YAML.stringify(this.config));
    this.emit();
  }

  /** Store an asset file (text content, e.g. SVG) and return its vault path. */
  async putTextAsset(name: string, contents: string): Promise<string> {
    await this.fs.mkdirAll(VAULT.assetsDir);
    const path = joinPath(VAULT.assetsDir, name);
    await this.fs.writeText(path, contents);
    return path;
  }

  async readAsset(path: string): Promise<string> {
    return this.fs.readText(path);
  }

  /** Regenerate `_index.csv` and `_exports/<type>.csv`. */
  async writeCsv(): Promise<void> {
    const all = this.all();
    await this.fs.writeText(VAULT.indexCsv, indexCsv(all));
    await this.fs.mkdirAll(VAULT.exportsDir);
    for (const t of this.registry.types()) {
      if (t.id === "note") continue;
      const rows = all.filter((r) => r.record.type === t.id);
      if (!rows.length) continue;
      const extra = t.id === "body" ? (lr: LoadedRecord) => (isNote(lr.record) ? {} : derivedColumns(lr.record, (id) => this.typed(id))) : undefined;
      await this.fs.writeText(joinPath(VAULT.exportsDir, `${t.id}.csv`), typeCsv(t, rows, (id) => this.nameOf(id), extra));
    }
  }
}
