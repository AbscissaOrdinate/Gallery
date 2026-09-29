/**
 * Snapshots (doc 10 §7.7, doc 11 §1.7): before anything destructive, copy the files it will
 * touch into `_snapshots/<id>/` and record why. Pure core — everything goes through the
 * StorageAdapter, so a snapshot is as durable and as synced as the vault itself.
 *
 *   _snapshots/<id>/manifest.json     cause, time, record ids, file list with sizes
 *   _snapshots/<id>/files/<path>      each file's text exactly as it was on disk
 *
 * `<id>` is the ISO timestamp with `:` and `.` turned into `-` (Windows folder names cannot
 * hold a colon), with `-2`, `-3`… when two snapshots share a millisecond. Snapshots are for
 * recovery across restarts; undo (doc 11 §1) never reads them.
 *
 * Callers normally use the Repository wrappers (`repo.snapshot(cause, ids)`,
 * `repo.restoreSnapshot(id)`); S1c's `transaction(..., { snapshot: { cause, ids } })` calls the
 * same `repo.snapshot`. `VaultUpgrade` is the open-time variant: it snapshots lazily, at the
 * first file it is about to overwrite, so opening an up-to-date vault creates nothing.
 */
import type { StorageAdapter } from "./storage/adapter";
import { dirname, joinPath } from "./storage/adapter";
import { VAULT } from "./types";

export interface SnapshotFile {
  /** Vault-relative path the file had. */
  path: string;
  /** UTF-8 size of the copy. */
  bytes: number;
  /** The record that lived in it, when the caller knew. Restore uses it to spot a record renamed since. */
  id?: string;
}

export interface SnapshotManifest {
  version: 1;
  /** The folder name under `_snapshots/`. */
  id: string;
  /** ISO timestamp the snapshot was opened. */
  at: string;
  /** Why: "Before delete", "Before import", "Before vault upgrade"… */
  cause: string;
  /** Record ids the caller named (may include ids whose file was already gone). */
  ids: string[];
  files: SnapshotFile[];
}

/** Cause strings used by the callers in this repo, so tests and the UI agree on them. */
export const SNAPSHOT_CAUSE = {
  upgrade: "Before vault upgrade",
  delete: "Before delete",
  bulkDelete: "Before bulk delete",
  import: "Before import",
  skeleton: "Before skeleton generate",
  restore: (id: string) => `Before restore of ${id}`,
} as const;

const MANIFEST = "manifest.json";
const FILES = "files";
const dirOf = (id: string) => joinPath(VAULT.snapshotsDir, id);
const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

/** A vault-relative path that stays inside the vault and outside `_snapshots/`. Manifests are untrusted markup. */
export function isSafeVaultPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/.test(path)) return false;
  const parts = path.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return false;
  return parts[0].toLowerCase() !== VAULT.snapshotsDir; // case-insensitive: OneDrive vaults live on Windows and macOS
}

/** Where a snapshot keeps its copy of `path`. */
export const snapshotFilePath = (id: string, path: string): string => joinPath(dirOf(id), FILES, path);

const isSafeId = (id: string) => /^[0-9A-Za-z][0-9A-Za-z-]*$/.test(id);

/** Builds one snapshot a file at a time. The folder appears with the first captured file. */
export class SnapshotWriter {
  private manifest?: SnapshotManifest;

  constructor(
    private readonly fs: StorageAdapter,
    readonly cause: string,
    private readonly ids: readonly string[] = [],
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The snapshot's id once a file has been captured. */
  get id(): string | undefined {
    return this.manifest?.id;
  }

  /** The manifest as it stands, or undefined when nothing was captured. */
  get result(): SnapshotManifest | undefined {
    return this.manifest && structuredClone(this.manifest);
  }

  /**
   * Copy `path` into the snapshot before the caller changes it. Returns true when the file is in
   * the snapshot, false when there was nothing to copy (missing file, or a path that may not be
   * snapshotted). A read or write error propagates: the caller must not go on to overwrite a
   * file it failed to copy.
   */
  async capture(path: string, recordId?: string): Promise<boolean> {
    const p = joinPath(path);
    if (!isSafeVaultPath(p)) return false;
    if (this.manifest?.files.some((f) => f.path === p)) return true;
    if (!(await this.fs.exists(p))) return false;
    const text = await this.fs.readText(p);
    // The manifest becomes ours only once the first copy and the manifest are both on disk, so a
    // failed write never leaves a snapshot id that points at nothing.
    const base = this.manifest ?? (await this.fresh());
    const next: SnapshotManifest = { ...base, files: [...base.files, { path: p, bytes: utf8Bytes(text), ...(recordId ? { id: recordId } : {}) }] };
    const copy = snapshotFilePath(base.id, p);
    try {
      await this.fs.mkdirAll(dirname(copy));
      await this.fs.writeText(copy, text);
      // Rewritten after every file, so a crash mid-way still leaves a manifest that matches the copies.
      await this.fs.writeText(joinPath(dirOf(base.id), MANIFEST), JSON.stringify(next, null, 2) + "\n");
    } catch (err) {
      await this.fs.remove(copy).catch(() => undefined);
      throw err;
    }
    this.manifest = next;
    return true;
  }

  /** A manifest with a free id, not yet on disk. */
  private async fresh(): Promise<SnapshotManifest> {
    const at = this.now().toISOString();
    const base = at.replace(/[:.]/g, "-");
    let id = base;
    for (let n = 2; await this.fs.exists(dirOf(id)); n++) id = `${base}-${n}`;
    return { version: 1, id, at, cause: this.cause, ids: [...this.ids], files: [] };
  }
}

/** Snapshot the given files in one go. Undefined when none of them existed. */
export async function takeSnapshot(
  fs: StorageAdapter,
  cause: string,
  files: readonly { path: string; id?: string }[],
  ids: readonly string[] = [],
  now?: () => Date,
): Promise<SnapshotManifest | undefined> {
  const w = new SnapshotWriter(fs, cause, ids, now);
  for (const f of files) await w.capture(f.path, f.id);
  return w.result;
}

export async function readManifest(fs: StorageAdapter, id: string): Promise<SnapshotManifest> {
  if (!isSafeId(id)) throw new Error(`"${id}" is not a snapshot id`);
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readText(joinPath(dirOf(id), MANIFEST)));
  } catch {
    throw new Error(`Snapshot ${id} has no readable manifest`);
  }
  const m = raw as Partial<SnapshotManifest> | null;
  const okFiles = Array.isArray(m?.files) && m!.files.every((f) => f && typeof f.path === "string" && isSafeVaultPath(f.path) && typeof f.bytes === "number");
  if (!m || m.version !== 1 || m.id !== id || typeof m.at !== "string" || typeof m.cause !== "string" || !Array.isArray(m.ids) || !okFiles) {
    throw new Error(`Snapshot ${id} has a malformed manifest`);
  }
  return m as SnapshotManifest;
}

/** Every readable snapshot, newest first. A folder without a good manifest is skipped. */
export async function listSnapshots(fs: StorageAdapter): Promise<SnapshotManifest[]> {
  let entries;
  try {
    entries = await fs.list(VAULT.snapshotsDir);
  } catch {
    return [];
  }
  const out: SnapshotManifest[] = [];
  for (const e of entries) {
    if (!e.isDir) continue;
    try {
      out.push(await readManifest(fs, e.name));
    } catch {
      /* not a snapshot Gallery wrote */
    }
  }
  return out.sort((a, b) => (a.at === b.at ? b.id.localeCompare(a.id) : b.at.localeCompare(a.at)));
}

export const snapshotBytes = (m: SnapshotManifest): number => m.files.reduce((n, f) => n + f.bytes, 0);

export interface RestoreResult {
  manifest: SnapshotManifest;
  /** What was on disk before, taken first (cause "Before restore of <id>"). Undefined when nothing existed to copy. */
  safety?: SnapshotManifest;
  /** Files written (those already identical are left alone). */
  restored: string[];
  /** Files removed because the same record now lives under another name. */
  removed: string[];
}

/**
 * Put a snapshot's files back. The current versions of every file it will overwrite or remove are
 * snapshotted first, and every copy is read before anything is written, so a damaged snapshot
 * changes nothing. `remove` lists current paths that must go because the restored file replaces
 * them (a record renamed since) — the Repository works these out.
 */
export async function restoreSnapshot(
  fs: StorageAdapter,
  id: string,
  opts: { remove?: readonly string[]; now?: () => Date } = {},
): Promise<RestoreResult> {
  const manifest = await readManifest(fs, id);
  const copies: { path: string; text: string }[] = [];
  for (const f of manifest.files) copies.push({ path: f.path, text: await fs.readText(snapshotFilePath(id, f.path)) });
  const remove = [...new Set(opts.remove ?? [])].filter((p) => isSafeVaultPath(p) && !copies.some((c) => c.path === p));

  const safety = new SnapshotWriter(fs, SNAPSHOT_CAUSE.restore(id), manifest.ids, opts.now);
  const changed: typeof copies = [];
  for (const c of copies) {
    const exists = await fs.exists(c.path);
    if (exists && (await fs.readText(c.path)) === c.text) continue;
    if (exists) await safety.capture(c.path, manifest.files.find((f) => f.path === c.path)?.id);
    changed.push(c);
  }
  for (const p of remove) await safety.capture(p);

  for (const c of changed) {
    await fs.mkdirAll(dirname(c.path));
    await fs.writeText(c.path, c.text);
  }
  const removed: string[] = [];
  for (const p of remove) {
    if (!(await fs.exists(p))) continue;
    await fs.remove(p);
    removed.push(p);
  }
  return { manifest, safety: safety.result, restored: changed.map((c) => c.path), removed };
}

/**
 * Open-time maintenance (F2): opening a vault is not viewing, but it must not write more than it
 * has to. `write` creates a missing file with no snapshot, does nothing when the content is
 * unchanged, and otherwise copies the existing file into the "Before vault upgrade" snapshot
 * first. One snapshot covers everything an open rewrites.
 */
export class VaultUpgrade {
  private readonly writer: SnapshotWriter;
  /** Existing files that were overwritten. */
  readonly rewritten: string[] = [];
  /** Existing files left as they were because they could not be snapshotted. */
  readonly skipped: { path: string; reason: string }[] = [];

  constructor(
    private readonly fs: StorageAdapter,
    now?: () => Date,
  ) {
    this.writer = new SnapshotWriter(fs, SNAPSHOT_CAUSE.upgrade, [], now);
  }

  /** The snapshot's id, once an existing file has been copied into it. */
  get snapshot(): string | undefined {
    return this.writer.id;
  }

  /** True when `text` was written. */
  async write(path: string, text: string): Promise<boolean> {
    if (!(await this.fs.exists(path))) {
      await this.fs.writeText(path, text);
      return true;
    }
    if ((await this.fs.readText(path)) === text) return false;
    try {
      if (!(await this.writer.capture(path))) throw new Error("path cannot be snapshotted");
    } catch (err) {
      this.skipped.push({ path, reason: (err as Error).message });
      return false;
    }
    await this.fs.writeText(path, text);
    this.rewritten.push(path);
    return true;
  }
}
