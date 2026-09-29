import type { DirEntry, StorageAdapter } from "../../src/core/storage/adapter";
import { joinPath } from "../../src/core/storage/adapter";
import { MemoryAdapter } from "../../src/core/storage/memory";

export interface WriteCall {
  op: "writeText" | "remove" | "rename" | "mkdirAll";
  path: string;
  /** rename only */
  to?: string;
}

/**
 * A StorageAdapter that forwards to `inner` and records every write to it (F19: the guard watches
 * the adapter under the vault root, and nothing else — not `settings.json`, not `localStorage`).
 *
 * `mkdirAll` counts only when it creates a folder that was not there: the calls the app makes on
 * every open to make sure a folder exists are idempotent and change nothing on disk.
 */
export class SpyAdapter implements StorageAdapter {
  readonly writes: WriteCall[] = [];
  constructor(readonly inner: MemoryAdapter = new MemoryAdapter()) {}
  get label() {
    return this.inner.label;
  }
  list(dir: string): Promise<DirEntry[]> {
    return this.inner.list(dir);
  }
  readText(path: string) {
    return this.inner.readText(path);
  }
  exists(path: string) {
    return this.inner.exists(path);
  }
  async writeText(path: string, contents: string) {
    this.writes.push({ op: "writeText", path: joinPath(path) });
    return this.inner.writeText(path, contents);
  }
  async mkdirAll(dir: string) {
    if (!(await this.inner.exists(dir))) this.writes.push({ op: "mkdirAll", path: joinPath(dir) });
    return this.inner.mkdirAll(dir);
  }
  async remove(path: string) {
    this.writes.push({ op: "remove", path: joinPath(path) });
    return this.inner.remove(path);
  }
  async rename(from: string, to: string) {
    this.writes.push({ op: "rename", path: joinPath(from), to: joinPath(to) });
    return this.inner.rename(from, to);
  }
  /** Forget what was written so far (e.g. after seeding a vault, before the view under test). */
  reset() {
    this.writes.length = 0;
  }
}
