/**
 * Vault repository: scan a folder, load every record, save records, keep the
 * CSV index and per-type exports current, resolve links and backlinks.
 *
 * Every record write goes through `save`/`delete` (or a `transaction` of them) and becomes one
 * undoable step in `history` (doc 11 §1). Exempt from undo, by design (§1.6): `saveConfig`,
 * `putTextAsset`, `writeCsv` and `init()`'s seeding.
 */
import YAML from "yaml";
import type { StorageAdapter } from "./storage/adapter";
import { basename, dirname, joinPath, walk } from "./storage/adapter";
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
import { SNAPSHOT_CAUSE, VaultUpgrade, SnapshotWriter, listSnapshots, readManifest, restoreSnapshot, snapshotFilePath, type RestoreResult, type SnapshotManifest } from "./snapshots";
import { History, entryLabel, type Entry, type FileSide, type Step } from "./history";
import type { LogInput } from "./sessionLog";

/** A transaction in progress: its `save`/`delete` add entries to one step (doc 11 §1.4). */
export interface Tx {
  readonly label: string;
  save(r: GalleryRecord, opts?: { touch?: boolean }): Promise<LoadedRecord>;
  delete(id: string): Promise<void>;
}

export interface SaveOptions {
  /** false: keep `updated` and `revisions` as they are (import). */
  touch?: boolean;
  /** false: not undoable. Startup/seeding only; every use carries `// history: exempt — <reason>`. */
  history?: false;
  /** The editor instance making the write; consecutive bursts from one origin coalesce (§1.3). */
  origin?: string;
  /** Append to this open transaction instead of making a step of its own. */
  tx?: Tx;
}

export interface DeleteOptions {
  /** As for `save`. */
  history?: false;
  tx?: Tx;
}

export type ApplyResult = { ok: true; label: string } | { ok: false; label: string; refused: { path: string; reason: string }[] };

interface TxState {
  label: string;
  handle: Tx;
  entries: Entry[];
  /** The snapshot taken before the first entry, if any. */
  snapshot?: SnapshotManifest;
  open: boolean;
}

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

/** What `init()` did to files that already existed (F2). Creating missing seed files is not reported. */
export interface InitReport {
  /** The "Before vault upgrade" snapshot, when an existing file was overwritten. */
  snapshot?: string;
  /** Existing files that were overwritten. */
  rewritten: string[];
  /** Existing files left alone because they could not be snapshotted first. */
  skipped: { path: string; reason: string }[];
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
  /** Each record's file as last read or written: the `before.text` of its next step (doc 11 §1.4). */
  private lastText = new Map<string, { path: string; text: string }>();
  private versions = new Map<string, number>();
  private listeners = new Set<() => void>();
  /** The transaction in progress, if any. */
  private tx?: TxState;
  /** Undo/redo run one at a time, so two quick presses never apply the same step twice. */
  private applying: Promise<unknown> = Promise.resolve();

  /** The session's undo history (doc 11 §1). Kept across `load()`; ends with this Repository. */
  readonly history = new History();

  /**
   * Session-log lines the history raises (source `history`): `UNDONE — …` / `REDONE — …`, one
   * caution per refused path, a violation for an incomplete transaction or a failed apply. The UI
   * points this at its session log, as it does `onSnapshot`.
   */
  onLog?: (line: LogInput) => void;

  constructor(public readonly fs: StorageAdapter) {}

  // ---- events ----------------------------------------------------------
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  /** Bumps on every write, apply or reload that changes the record's file; drafts reload on a change. */
  version(id: string): number {
    return this.versions.get(id) ?? 0;
  }
  private bump(id: string) {
    this.versions.set(id, this.version(id) + 1);
  }

  // ---- lifecycle -------------------------------------------------------

  /**
   * Create folder structure, config, schemas and presets if missing.
   *
   * Opening a vault is maintenance, not viewing (F2): a missing seed file is created without
   * ceremony; an existing one (schema upgrade, config rewrite) is overwritten only when the new
   * content differs, and only after the old copy is in a "Before vault upgrade" snapshot. Opening
   * an up-to-date vault writes nothing.
   */
  async init(): Promise<InitReport> {
    const upgrade = new VaultUpgrade(this.fs);
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
          if (Object.keys(add).length) await upgrade.write(cfgPath, YAML.stringify({ ...raw, ...add }));
        }
      } catch {
        // An unreadable config is load()'s to report, not init's to rewrite.
      }
    }
    await this.registry.seed(this.fs, upgrade);
    for (const t of this.registry.types()) await this.fs.mkdirAll(t.folder);
    await this.fs.mkdirAll(VAULT.assetsDir);
    await this.fs.mkdirAll(VAULT.constraintsDir);
    await this.fs.mkdirAll(VAULT.tablesDir);
    await seedConstraints(this.fs);
    await seedBodyTints(this.fs);
    await this.fs.mkdirAll(VAULT.exportsDir);
    return { snapshot: upgrade.snapshot, rewritten: upgrade.rewritten, skipped: upgrade.skipped };
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

    const files = await walk(this.fs, "", [], (dir) => dir === VAULT.snapshotsDir);
    const next = new Map<string, LoadedRecord>();
    const nextText = new Map<string, { path: string; text: string }>();
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
        let text = "";
        if (fmt === "opml") {
          text = await this.fs.readText(path);
          const { record, problems: p } = parseNoteOpml(text, basename(path).replace(/\.opml$/i, ""));
          loaded = { record, location: { path, format: "opml" }, problems: p.length ? p : undefined };
        } else {
          const type = typeFromFilename(basename(path));
          if (!type) continue; // plain yaml/json that isn't a record
          text = await this.fs.readText(path);
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
          nextText.set(loaded.record.id, { path, text });
          if (loaded.problems) problems.push({ path, problems: loaded.problems });
        }
      } catch (err) {
        problems.push({ path, problems: [(err as Error).message] });
      }
    }
    report.records?.(files.length, files.length);
    // The history survives a reload (doc 11 §1.4): a step whose files changed meanwhile is refused
    // when applied. A record whose file changed, appeared or went is a new version for its drafts.
    for (const id of new Set([...this.lastText.keys(), ...nextText.keys()])) {
      const [a, b] = [this.lastText.get(id), nextText.get(id)];
      if (a?.path !== b?.path || a?.text !== b?.text) this.bump(id);
    }
    this.byId = next;
    this.lastText = nextText;
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

  /**
   * Persist a record (new or existing). Renames the file if slug/type changed. One undoable step,
   * or one entry of `opts.tx` (doc 11 §1.3–1.4).
   */
  async save(r: GalleryRecord, opts: SaveOptions = {}): Promise<LoadedRecord> {
    const tx = this.openTx(opts.tx);
    const prior = this.byId.get(r.id);
    const before = prior ? await this.currentSide(r.id) : null;
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
    const copy = structuredClone(r);
    this.byId.set(r.id, loaded);
    this.saved.set(r.id, copy);
    this.lastText.set(r.id, { path, text });
    this.bump(r.id);
    this.emit();
    if (opts.history !== false) this.fileEntry({ id: r.id, before, after: { path, text, record: copy } }, tx, opts.origin);
    if (!tx && this.config.writeCsv) await this.writeCsv().catch(() => undefined);
    return loaded;
  }

  /**
   * Remove a record's file. Every delete snapshots the file first ("Before delete", doc 11 §1.7) —
   * undo does not survive a restart, the snapshot does — unless it is inside a transaction whose
   * own snapshot already holds that file (bulk delete: one "Before bulk delete" snapshot).
   */
  async delete(id: string, opts: DeleteOptions = {}): Promise<void> {
    const tx = this.openTx(opts.tx);
    const lr = this.byId.get(id);
    if (!lr) return;
    const covered = tx?.snapshot?.files.some((f) => f.id === id);
    const snap = covered ? undefined : await this.snapshot(SNAPSHOT_CAUSE.delete, [id]);
    const before = await this.currentSide(id);
    await this.fs.remove(lr.location.path);
    this.byId.delete(id);
    this.saved.delete(id);
    this.lastText.delete(id);
    this.bump(id);
    this.emit();
    if (opts.history !== false) this.fileEntry({ id, before, after: null }, tx, undefined, snap?.id);
    if (!tx && this.config.writeCsv) await this.writeCsv().catch(() => undefined);
  }

  // ---- history (src/core/history.ts, doc 11 §1) --------------------------

  /** A record's file as it stands, as one side of an entry; null when the record is not loaded. */
  private async currentSide(id: string): Promise<FileSide | null> {
    const lr = this.byId.get(id);
    if (!lr) return null;
    const record = this.saved.get(id) ?? structuredClone(lr.record);
    const last = this.lastText.get(id);
    if (last) return { path: last.path, text: last.text, record };
    // Not expected: every record in byId came through load, save or an apply, which fill lastText.
    try {
      return { path: lr.location.path, text: await this.fs.readText(lr.location.path), record };
    } catch {
      return null;
    }
  }

  /** The open transaction `tx` names, or undefined for none. A finished one is a programming error. */
  private openTx(tx: Tx | undefined): TxState | undefined {
    if (!tx) return undefined;
    const s = this.tx;
    if (!s || s.handle !== tx || !s.open) throw new Error(`Transaction "${tx.label}" has finished; await every write inside it`);
    return s;
  }

  /** File a single write: into the open transaction, or as a step of its own. */
  private fileEntry(e: Entry, tx: TxState | undefined, origin?: string, snapshot?: string) {
    if (!e.before && !e.after) return;
    if (tx) {
      tx.entries.push(e);
      return;
    }
    // The same bytes at the same path: there is nothing to undo.
    if (e.before && e.after && e.before.path === e.after.path && e.before.text === e.after.text) return;
    this.history.push({ label: entryLabel(e), origin, entries: [e], ...(snapshot ? { snapshot } : {}) }, Date.now());
  }

  private log(line: LogInput) {
    this.onLog?.(line);
  }

  /**
   * Run `fn` as one undo step (doc 11 §1.4): the writes it makes through `tx` become one step,
   * labelled `label`, with the CSV regenerated once at the end. `opts.snapshot` snapshots those
   * records first (callers declaring ≥ 10 ids must, §1.7); a delete inside the transaction then
   * takes no snapshot of its own. Writes made outside `tx` meanwhile are steps of their own. If
   * `fn` throws after writing, the partial step is kept (label `— INCOMPLETE`) so it can be undone,
   * a violation is logged, and the error is rethrown. Nesting is a programming error and throws.
   */
  async transaction<T>(label: string, fn: (tx: Tx) => Promise<T>, opts: { snapshot?: { cause: string; ids: string[] } } = {}): Promise<T> {
    if (this.tx) throw new Error(`Nested transaction: "${label}" started inside "${this.tx.label}"`);
    const handle: Tx = {
      label,
      save: (r, o = {}) => this.save(r, { touch: o.touch, tx: handle }),
      delete: (id) => this.delete(id, { tx: handle }),
    };
    const state: TxState = { label, handle, entries: [], open: true };
    this.tx = state;
    let result: T;
    try {
      if (opts.snapshot) state.snapshot = await this.snapshot(opts.snapshot.cause, opts.snapshot.ids);
      result = await fn(handle);
    } catch (err) {
      await this.closeTx(state, true);
      if (state.entries.length) {
        this.log({ severity: "violation", source: "history", message: `${label} — INCOMPLETE`, detail: { components: state.entries.map((e) => (e.after ?? e.before)!.path), note: `${(err as Error).message}. What was written is one undo step.` } });
      }
      throw err;
    }
    await this.closeTx(state, false);
    return result;
  }

  private async closeTx(state: TxState, failed: boolean) {
    state.open = false;
    if (this.tx === state) this.tx = undefined;
    if (!state.entries.length) return;
    this.history.push({ label: failed ? `${state.label} — INCOMPLETE` : state.label, entries: state.entries, ...(state.snapshot ? { snapshot: state.snapshot.id } : {}) }, Date.now());
    if (this.config.writeCsv) await this.writeCsv().catch(() => undefined);
  }

  /** Revert the latest step. Refuses, writing nothing, when any of its files changed on disk since (§1.5). */
  undo(): Promise<ApplyResult> {
    return this.serial(() => this.applyTop("undo"));
  }

  /** Re-apply the latest undone step, under the same rule. */
  redo(): Promise<ApplyResult> {
    return this.serial(() => this.applyTop("redo"));
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.applying.then(fn, fn);
    this.applying = run.catch(() => undefined);
    return run;
  }

  private async applyTop(dir: "undo" | "redo"): Promise<ApplyResult> {
    const step = dir === "undo" ? this.history.peekUndo() : this.history.peekRedo();
    if (!step) return { ok: false, label: "", refused: [] };
    const res = await this.apply(step, dir);
    if (res.ok) {
      if (dir === "undo") this.history.commitUndo(step);
      else this.history.commitRedo(step);
    }
    return res;
  }

  /**
   * Apply a step (doc 11 §1.5). Every entry is preflighted first, against the disk as the entries
   * before it in this step will have left it: the file to be replaced or removed must hold exactly
   * the text the step left there, and a path to be created must be free (and, for a record coming
   * back, its id not loaded). Any failure refuses the whole step — nothing written, both stacks as
   * they were. Never clobbers, never partly applies. An I/O error part-way is logged with the files
   * written so far and rethrown; the step stays on its stack.
   */
  private async apply(step: Step, dir: "undo" | "redo"): Promise<ApplyResult> {
    const order = dir === "undo" ? [...step.entries].reverse() : step.entries;
    const moves = order.map((e) => (dir === "undo" ? { id: e.id, from: e.after, to: e.before } : { id: e.id, from: e.before, to: e.after }));
    const verb = dir === "undo" ? "UNDO" : "REDO";

    const view = new Map<string, string | null>(); // path → text this step will have left there; null = absent
    const loaded = new Map<string, boolean>();
    const textAt = async (p: string): Promise<string | null> => {
      if (view.has(p)) return view.get(p)!;
      try {
        return await this.fs.readText(p);
      } catch {
        return null; // a read error on a path that should exist counts as changed
      }
    };
    const existsAt = async (p: string): Promise<boolean> => (view.has(p) ? view.get(p) !== null : this.fs.exists(p));
    const refused: { path: string; reason: string }[] = [];
    const refuse = (path: string, reason: string) => {
      if (!refused.some((r) => r.path === path)) refused.push({ path, reason });
    };
    for (const m of moves) {
      if (m.from) {
        const t = await textAt(m.from.path);
        if (t !== m.from.text) refuse(m.from.path, t === null ? "missing or unreadable" : "changed on disk");
      } else if (loaded.get(m.id) ?? this.byId.has(m.id)) {
        refuse(m.to!.path, "the record is loaded again");
      }
      if (m.to && m.to.path !== m.from?.path && (await existsAt(m.to.path))) refuse(m.to.path, "a file is already there");
      if (m.from) view.set(m.from.path, null);
      if (m.to) view.set(m.to.path, m.to.text);
      loaded.set(m.id, !!m.to);
    }
    if (refused.length) {
      const where = step.snapshot ? ` The pre-change files are in snapshot ${step.snapshot}.` : "";
      for (const r of refused) {
        this.log({ severity: "caution", source: "history", message: `${verb} REFUSED — ${r.path} CHANGED ON DISK`, detail: { path: r.path, note: `${step.label}: ${r.reason}. Reload to see the change; the step stays available.${where}` } });
      }
      return { ok: false, label: step.label, refused };
    }

    const written: string[] = [];
    try {
      for (const m of moves) {
        if (m.to) {
          await this.fs.mkdirAll(dirname(m.to.path));
          await this.fs.writeText(m.to.path, m.to.text);
          written.push(m.to.path);
          this.adopt(m.id, m.to);
        }
        if (m.from && m.from.path !== m.to?.path) {
          await this.fs.remove(m.from.path);
          written.push(m.from.path);
          if (!m.to) this.adopt(m.id, null);
        }
      }
    } catch (err) {
      this.emit();
      if (written.length && this.config.writeCsv) await this.writeCsv().catch(() => undefined);
      this.log({ severity: "violation", source: "history", message: `${verb} FAILED PART-WAY — ${step.label}`, detail: { components: written, note: `${(err as Error).message}. Written so far: ${written.join(", ") || "nothing"}. The step stays available.` } });
      throw err;
    }
    this.emit();
    if (this.config.writeCsv) await this.writeCsv().catch(() => undefined);
    this.log({ severity: "info", source: "history", message: `${dir === "undo" ? "UNDONE" : "REDONE"} — ${step.label}` });
    return { ok: true, label: step.label };
  }

  /** Take one side of an applied entry as the record's current state (null: gone). */
  private adopt(id: string, side: FileSide | null) {
    if (side) {
      const fmt = formatFromPath(side.path) ?? this.config.recordFormat;
      this.byId.set(id, { record: structuredClone(side.record), location: { path: side.path, format: fmt } });
      this.saved.set(id, structuredClone(side.record));
      this.lastText.set(id, { path: side.path, text: side.text });
    } else {
      this.byId.delete(id);
      this.saved.delete(id);
      this.lastText.delete(id);
    }
    // S2 updates the wiki link index here (doc 11 §2.4).
    this.bump(id);
  }

  // ---- snapshots (src/core/snapshots.ts) -------------------------------

  /**
   * Called once for every snapshot taken here on a caller's behalf, so the UI can put it in the
   * session log. The open-time upgrade snapshot is reported through `init()`'s return value.
   */
  onSnapshot?: (manifest: SnapshotManifest) => void;

  /**
   * Copy the files of the records `ids` (as they are now), plus any extra vault-relative `paths`,
   * into a new snapshot. This is the call S1c's `transaction(…, { snapshot: { cause, ids } })`
   * makes; `manifest.id` is what a history step records. Ids not loaded and files that do not
   * exist are skipped; undefined when nothing at all was copied. A copy that fails throws, so the
   * caller does not go on to change what it could not save.
   */
  async snapshot(cause: string, ids: readonly string[], extra: { paths?: readonly string[] } = {}): Promise<SnapshotManifest | undefined> {
    const w = new SnapshotWriter(this.fs, cause, ids);
    for (const id of new Set(ids)) {
      const lr = this.byId.get(id);
      if (lr) await w.capture(lr.location.path, id);
    }
    for (const p of extra.paths ?? []) await w.capture(p);
    const manifest = w.result;
    if (manifest) this.onSnapshot?.(manifest);
    return manifest;
  }

  /** Every snapshot in the vault, newest first. Reads only. */
  snapshots(): Promise<SnapshotManifest[]> {
    return listSnapshots(this.fs);
  }

  /**
   * Put a snapshot's files back, then reload. What is on disk now is snapshotted first ("Before
   * restore of <id>"), and a record that has been renamed since is moved back rather than
   * duplicated. Files created after the snapshot are left alone. Refuses, changing nothing, when
   * a file to restore now holds a *different* record (deleted, then another record took the name).
   * Which record a file holds is read from the snapshot's own copy, not from its manifest.
   *
   * The restore is one undo step (doc 11 §1.6): undo puts back the record files as they were before
   * it. Other files a snapshot holds (the config, the CSV) are not undoable (§1.6); what they were
   * is in the "Before restore" snapshot.
   */
  restoreSnapshot(id: string): Promise<RestoreResult> {
    return this.transaction(`RESTORE SNAPSHOT ${id}`, () => this.restoreInTx(id));
  }

  private async restoreInTx(id: string): Promise<RestoreResult> {
    const state = this.tx!;
    const manifest = await readManifest(this.fs, id);
    const remove: string[] = [];
    const touched = new Set<string>();
    for (const f of manifest.files) {
      const fmt = formatFromPath(f.path);
      if (!fmt) continue;
      let recordId: string | undefined;
      try {
        const text = await this.fs.readText(snapshotFilePath(id, f.path));
        recordId = fmt === "opml" ? parseNoteOpml(text, basename(f.path).replace(/\.opml$/i, "")).record.id : parseRecordText(text, fmt).record.id;
      } catch {
        continue; // not a record Gallery can read: restore it as a plain file
      }
      const holder = [...this.byId.values()].find((lr) => lr.location.path === f.path);
      if (holder && holder.record.id !== recordId) {
        throw new Error(`Cannot restore ${f.path}: it now holds "${holder.record.name}", a different record. Rename or move that record first.`);
      }
      const cur = this.byId.get(recordId);
      if (cur && cur.location.path !== f.path) remove.push(cur.location.path);
      touched.add(recordId);
    }
    const pre = new Map<string, FileSide | null>();
    for (const rid of touched) pre.set(rid, await this.currentSide(rid));
    const result = await restoreSnapshot(this.fs, id, { remove });
    if (result.safety) {
      this.onSnapshot?.(result.safety);
      state.snapshot = result.safety;
    }
    await this.load();
    for (const rid of touched) {
      const [before, after] = [pre.get(rid) ?? null, await this.currentSide(rid)];
      if (before?.path === after?.path && before?.text === after?.text) continue;
      state.entries.push({ id: rid, before, after });
    }
    // The transaction regenerates the CSV once it has entries; a restore of other files only still does.
    if (!state.entries.length && this.config.writeCsv) await this.writeCsv().catch(() => undefined);
    return result;
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
