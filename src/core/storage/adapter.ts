/**
 * Storage adapter — the only thing that knows where bytes live.
 *
 * Paths are vault-relative, forward-slash separated. Implementations:
 *   - TauriFsAdapter   — desktop; the vault is a plain folder (OneDrive / Google Drive / local)
 *   - MemoryAdapter    — browser dev + tests (seeded with a demo vault)
 *   - (later) GraphAdapter / GDriveAdapter — mobile via cloud APIs
 */
export interface DirEntry {
  name: string;
  isDir: boolean;
  size?: number;
  /** Epoch millis */
  modified?: number;
}

export interface StorageAdapter {
  /** Human-readable location, e.g. an absolute path or "memory". */
  readonly label: string;
  list(dir: string): Promise<DirEntry[]>;
  readText(path: string): Promise<string>;
  writeText(path: string, contents: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdirAll(dir: string): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export function joinPath(...parts: string[]): string {
  return parts
    .filter((p) => p !== undefined && p !== null && p !== "")
    .join("/")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

/** Recursively list files under `dir` (vault-relative paths). Skips dot-folders. */
export async function walk(adapter: StorageAdapter, dir: string, out: string[] = []): Promise<string[]> {
  let entries: DirEntry[];
  try {
    entries = await adapter.list(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const p = joinPath(dir, e.name);
    if (e.isDir) await walk(adapter, p, out);
    else out.push(p);
  }
  return out;
}
