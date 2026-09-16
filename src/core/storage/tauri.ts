import { invoke } from "@tauri-apps/api/core";
import type { DirEntry, StorageAdapter } from "./adapter";

/**
 * Desktop adapter. All I/O goes through a handful of Rust commands in
 * src-tauri/src/lib.rs, so the vault can live anywhere on disk (OneDrive,
 * Google Drive, a USB stick) without plugin scope configuration.
 */
export class TauriFsAdapter implements StorageAdapter {
  constructor(public readonly root: string) {}

  get label() {
    return this.root;
  }

  private abs(path: string): string {
    const sep = this.root.includes("\\") ? "\\" : "/";
    const rel = path.replace(/\//g, sep);
    if (!rel) return this.root;
    return this.root.replace(/[\\/]+$/, "") + sep + rel;
  }

  async list(dir: string): Promise<DirEntry[]> {
    return invoke<DirEntry[]>("fs_list", { path: this.abs(dir) });
  }
  async readText(path: string): Promise<string> {
    return invoke<string>("fs_read_text", { path: this.abs(path) });
  }
  async writeText(path: string, contents: string): Promise<void> {
    await invoke("fs_write_text", { path: this.abs(path), contents });
  }
  async exists(path: string): Promise<boolean> {
    return invoke<boolean>("fs_exists", { path: this.abs(path) });
  }
  async mkdirAll(dir: string): Promise<void> {
    await invoke("fs_mkdir_all", { path: this.abs(dir) });
  }
  async remove(path: string): Promise<void> {
    await invoke("fs_remove", { path: this.abs(path) });
  }
  async rename(from: string, to: string): Promise<void> {
    await invoke("fs_rename", { from: this.abs(from), to: this.abs(to) });
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** App-level settings (last vault path, window prefs) stored in the OS config dir. */
export async function readAppSettings(): Promise<Record<string, unknown>> {
  try {
    const text = await invoke<string>("settings_read");
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function writeAppSettings(s: Record<string, unknown>): Promise<void> {
  await invoke("settings_write", { contents: JSON.stringify(s, null, 2) });
}
