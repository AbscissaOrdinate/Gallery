/** Node.js adapter for CLI scripts and tests (not bundled into the app). */
import { promises as fsp } from "node:fs";
import * as path from "node:path";
import type { DirEntry, StorageAdapter } from "./adapter";

export class NodeFsAdapter implements StorageAdapter {
  constructor(public readonly root: string) {}
  get label() {
    return this.root;
  }
  private abs(p: string) {
    return path.join(this.root, ...p.split("/").filter(Boolean));
  }
  async list(dir: string): Promise<DirEntry[]> {
    const entries = await fsp.readdir(this.abs(dir), { withFileTypes: true });
    const out: DirEntry[] = [];
    for (const e of entries) {
      const st = await fsp.stat(path.join(this.abs(dir), e.name)).catch(() => null);
      out.push({ name: e.name, isDir: e.isDirectory(), size: st?.size, modified: st?.mtimeMs });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  async readText(p: string): Promise<string> {
    return (await fsp.readFile(this.abs(p), "utf8")).replace(/^﻿/, "");
  }
  async writeText(p: string, contents: string): Promise<void> {
    await fsp.mkdir(path.dirname(this.abs(p)), { recursive: true });
    await fsp.writeFile(this.abs(p), contents, "utf8");
  }
  async exists(p: string): Promise<boolean> {
    return fsp
      .access(this.abs(p))
      .then(() => true)
      .catch(() => false);
  }
  async mkdirAll(dir: string): Promise<void> {
    await fsp.mkdir(this.abs(dir), { recursive: true });
  }
  async remove(p: string): Promise<void> {
    await fsp.unlink(this.abs(p));
  }
  async rename(from: string, to: string): Promise<void> {
    await fsp.mkdir(path.dirname(this.abs(to)), { recursive: true });
    await fsp.rename(this.abs(from), this.abs(to));
  }
}
