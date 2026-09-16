import type { DirEntry, StorageAdapter } from "./adapter";
import { dirname, joinPath } from "./adapter";

/** In-memory adapter for browser dev mode and unit tests. */
export class MemoryAdapter implements StorageAdapter {
  readonly label = "memory";
  private files = new Map<string, string>();
  private dirs = new Set<string>([""]);

  constructor(seed: Record<string, string> = {}) {
    for (const [p, c] of Object.entries(seed)) this.put(p, c);
  }

  private put(path: string, contents: string) {
    const p = joinPath(path);
    this.files.set(p, contents);
    let d = dirname(p);
    while (d) {
      this.dirs.add(d);
      d = dirname(d);
    }
  }

  async list(dir: string): Promise<DirEntry[]> {
    const d = joinPath(dir);
    if (!this.dirs.has(d)) throw new Error(`ENOENT: ${dir}`);
    const seen = new Map<string, DirEntry>();
    const prefix = d ? d + "/" : "";
    for (const p of this.files.keys()) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      const first = rest.split("/")[0];
      if (rest.includes("/")) seen.set(first, { name: first, isDir: true });
      else seen.set(first, { name: first, isDir: false, size: this.files.get(p)!.length });
    }
    for (const dd of this.dirs) {
      if (dd && dd.startsWith(prefix)) {
        const rest = dd.slice(prefix.length);
        if (!rest.includes("/") && rest) seen.set(rest, { name: rest, isDir: true });
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async readText(path: string): Promise<string> {
    const p = joinPath(path);
    const c = this.files.get(p);
    if (c === undefined) throw new Error(`ENOENT: ${path}`);
    return c;
  }

  async writeText(path: string, contents: string): Promise<void> {
    this.put(path, contents);
  }

  async exists(path: string): Promise<boolean> {
    const p = joinPath(path);
    return this.files.has(p) || this.dirs.has(p);
  }

  async mkdirAll(dir: string): Promise<void> {
    let d = joinPath(dir);
    while (d) {
      this.dirs.add(d);
      d = dirname(d);
    }
  }

  async remove(path: string): Promise<void> {
    this.files.delete(joinPath(path));
  }

  async rename(from: string, to: string): Promise<void> {
    const c = await this.readText(from);
    this.files.delete(joinPath(from));
    this.put(to, c);
  }

  /** Snapshot for tests. */
  dump(): Record<string, string> {
    return Object.fromEntries([...this.files.entries()].sort());
  }
}
