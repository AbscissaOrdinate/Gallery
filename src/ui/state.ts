/**
 * Minimal app store (no external state lib). One Repository at a time; the UI
 * subscribes with useSyncExternalStore.
 */
import { useSyncExternalStore } from "react";
import { Repository, type VaultStats } from "../core/repo";
import type { StorageAdapter } from "../core/storage/adapter";
import { isTauri, readAppSettings, writeAppSettings, TauriFsAdapter } from "../core/storage/tauri";
import { MemoryAdapter } from "../core/storage/memory";
import { demoVault } from "./demo";

export type View =
  | { kind: "welcome" }
  | { kind: "list"; type?: string }
  | { kind: "record"; id: string }
  | { kind: "settings" }
  | { kind: "import" }
  | { kind: "map"; id: string };

interface AppState {
  repo: Repository | null;
  stats: VaultStats | null;
  view: View;
  query: string;
  busy: string | null;
  error: string | null;
  toast: string | null;
  /** History of visited record ids for back navigation. */
  history: View[];
}

let state: AppState = { repo: null, stats: null, view: { kind: "welcome" }, query: "", busy: null, error: null, toast: null, history: [] };
const listeners = new Set<() => void>();
let unsubscribeRepo: (() => void) | null = null;

function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useApp(): AppState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Force re-render when the repo emits (records changed). */
function bindRepo(repo: Repository) {
  unsubscribeRepo?.();
  unsubscribeRepo = repo.subscribe(() => set({ repo }));
}

export const actions = {
  navigate(view: View) {
    set({ view, history: [...state.history.slice(-50), state.view], error: null });
  },
  back() {
    const h = [...state.history];
    const prev = h.pop();
    if (prev) set({ view: prev, history: h });
  },
  setQuery(query: string) {
    set({ query });
  },
  toast(msg: string | null) {
    set({ toast: msg });
    if (msg) setTimeout(() => state.toast === msg && set({ toast: null }), 2500);
  },
  error(msg: string | null) {
    set({ error: msg });
  },

  async openVault(adapter: StorageAdapter, opts: { create?: boolean } = {}) {
    set({ busy: "Opening vault…", error: null });
    try {
      const repo = new Repository(adapter);
      if (!(await repo.isVault())) {
        if (!opts.create) throw new Error("No gallery.config.yaml here. Choose 'Create vault here' to initialize the folder.");
        await repo.init();
      } else {
        await repo.init(); // seeds anything missing (new built-in types/presets)
      }
      const stats = await repo.load();
      bindRepo(repo);
      set({ repo, stats, view: { kind: "list" }, busy: null, history: [] });
      if (isTauri() && adapter instanceof TauriFsAdapter) {
        const s = await readAppSettings();
        const recent = Array.isArray(s.recentVaults) ? (s.recentVaults as string[]) : [];
        await writeAppSettings({ ...s, lastVault: adapter.root, recentVaults: [adapter.root, ...recent.filter((r) => r !== adapter.root)].slice(0, 8) });
      }
    } catch (err) {
      set({ busy: null, error: (err as Error).message });
    }
  },

  async openDemo() {
    const fs = new MemoryAdapter();
    await demoVault(fs);
    await actions.openVault(fs);
  },

  async reload() {
    if (!state.repo) return;
    set({ busy: "Reloading…" });
    const stats = await state.repo.load();
    set({ stats, busy: null });
  },

  closeVault() {
    unsubscribeRepo?.();
    unsubscribeRepo = null;
    set({ repo: null, stats: null, view: { kind: "welcome" }, history: [] });
  },
};

export async function lastVaultPath(): Promise<string | null> {
  if (!isTauri()) return null;
  const s = await readAppSettings();
  return typeof s.lastVault === "string" ? s.lastVault : null;
}

export async function recentVaultPaths(): Promise<string[]> {
  if (!isTauri()) return [];
  const s = await readAppSettings();
  return Array.isArray(s.recentVaults) ? (s.recentVaults as string[]) : [];
}
