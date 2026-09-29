/**
 * Minimal app store (no external state lib). One Repository at a time; the UI
 * subscribes with useSyncExternalStore.
 */
import { useSyncExternalStore } from "react";
import { Repository, peekConfig, type VaultStats } from "../core/repo";
import { BOOT_MODES, DEFAULT_BOOT_MODE, type BootMode, type OperatorConfig } from "../core/types";
import { LEVEL_WORD } from "../core/handling";
import type { UiSeverity } from "./kit/severity";
import { logEvent, newSession, nextSessionNumber } from "./log";
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
  | { kind: "map"; id: string }
  | { kind: "hull"; id: string }
  | { kind: "log"; query?: string };

/** One line of the boot log: the real load step, in-world phrasing (docs/STYLE.md §2). */
export interface BootLine {
  at: number;
  message: string;
  verdict?: string;
  severity?: UiSeverity;
  /** The step in flight: accent message and the spinner. */
  inFlight?: boolean;
}
export interface BootState {
  mode: Exclude<BootMode, "off">;
  lines: BootLine[];
  /** Records read, 0–1, once the record walk starts. */
  progress?: number;
  /** Loading finished; a full boot now waits for any key or click. */
  done: boolean;
  node: string;
  operator?: OperatorConfig;
}

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
  /** The boot screen, while it shows. Cosmetic: it never gates the vault. */
  boot: BootState | null;
}

let state: AppState = { repo: null, stats: null, view: { kind: "welcome" }, query: "", busy: null, error: null, toast: null, history: [], boot: null };
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
    const t0 = Date.now();
    // The boot mode and operator are read before anything else, so "off" never flashes a boot screen.
    const peek = await peekConfig(adapter);
    const mode: BootMode = BOOT_MODES.includes(peek?.boot as BootMode) ? (peek!.boot as BootMode) : DEFAULT_BOOT_MODE;
    newSession({ number: nextSessionNumber(), operator: peek?.operator?.name, node: adapter.label });
    let boot: BootState | null = mode === "off" ? null : { mode, lines: [], done: false, node: adapter.label, operator: peek?.operator };
    const bootSet = (patch: Partial<BootState>) => {
      if (!boot) return;
      boot = { ...boot, ...patch };
      set({ boot });
    };
    const begin = (message: string) => bootSet({ lines: [...(boot?.lines ?? []), { at: Date.now(), message, inFlight: true }] });
    const end = (verdict: string, severity: UiSeverity = "nominal", message?: string) => {
      if (!boot) return;
      const lines = [...boot.lines];
      const last = lines[lines.length - 1];
      if (last) lines[lines.length - 1] = { ...last, message: message ?? last.message, verdict, severity, inFlight: false };
      bootSet({ lines });
    };
    const step = (message: string, verdict: string, severity: UiSeverity = "nominal") => {
      begin(message);
      end(verdict, severity);
    };
    set({ busy: "Opening vault…", error: null, boot });
    try {
      const repo = new Repository(adapter);
      begin(`HANDSHAKE — ${adapter.label.toLocaleUpperCase("en")}`);
      const isVault = await repo.isVault();
      if (!isVault && !opts.create) {
        end("REFUSED", "violation");
        throw new Error("No gallery.config.yaml here. Choose 'Create vault here' to initialize the folder.");
      }
      end(isVault ? "OK" : "NEW");
      begin("RECONCILING VAULT DEFAULTS");
      await repo.init(); // seeds anything missing (new built-in types/presets)
      end("OK");
      let pct = -1;
      const stats = await repo.load({
        config: (cfg) => {
          const level = cfg.operator?.level ?? "unclassified";
          step(`AUTHORIZATION: ${LEVEL_WORD[level] ?? "UNCLASSIFIED"}`, "GRANTED");
        },
        schemas: (kinds, problems) => step(`RECONCILING TYPED SCHEMA — ${kinds} KINDS`, problems ? "CAUTION" : "OK", problems ? "caution" : "nominal"),
        tables: (problems) => step("LOADING REFERENCE TABLES", problems ? "CAUTION" : "OK", problems ? "caution" : "nominal"),
        records: (done, total) => {
          if (done === 0) begin("MOUNTING VAULT…");
          const p = total ? Math.floor((done / total) * 100) : 100;
          if (p !== pct) {
            pct = p;
            bootSet({ progress: total ? done / total : 1 });
          }
          if (done === total) end("OK", "nominal", `MOUNTING VAULT — ${total} FILES`);
        },
      });
      if (stats.problems.length) step(`${stats.problems.length} RECORDS CARRY LOAD PROBLEMS`, "CAUTION", "caution");
      // The session log opens with what the boot saw.
      const kinds = Object.keys(stats.byType).length;
      logEvent({ severity: "info", source: "vault", message: `Vault mounted — ${stats.records} records, ${kinds} kinds`, elapsedMs: Date.now() - t0, detail: { path: adapter.label } });
      for (const p of repo.registry.problems) logEvent({ severity: "caution", source: "schema", message: p });
      for (const p of repo.designProblems) logEvent({ severity: "caution", source: "tables", message: p });
      for (const p of stats.problems) logEvent({ severity: "caution", source: "vault", message: p.problems.join("; "), detail: { path: p.path } });
      if (repo.migrationReport.length) logEvent({ severity: "info", source: "vault", message: `${repo.migrationReport.length} record${repo.migrationReport.length === 1 ? "" : "s"} upgraded in memory — written on the next save` });
      bindRepo(repo);
      set({ repo, stats, view: { kind: "list" }, busy: null, history: [], boot: boot && boot.mode === "full" ? { ...boot, done: true } : null });
      if (isTauri() && adapter instanceof TauriFsAdapter) {
        const s = await readAppSettings();
        const recent = Array.isArray(s.recentVaults) ? (s.recentVaults as string[]) : [];
        await writeAppSettings({ ...s, lastVault: adapter.root, recentVaults: [adapter.root, ...recent.filter((r) => r !== adapter.root)].slice(0, 8) });
      }
    } catch (err) {
      logEvent({ severity: "violation", source: "vault", message: (err as Error).message, detail: { path: adapter.label } });
      set({ busy: null, error: (err as Error).message, boot: null });
    }
  },

  /** Open the current vault again, boot and all (Settings → Session). */
  async reopenVault() {
    if (state.repo) await actions.openVault(state.repo.fs);
  },

  /** A full boot, once loaded, goes on any key or click. */
  dismissBoot() {
    if (state.boot?.done) set({ boot: null });
  },

  /** ABORT on the boot panel: back to the welcome screen. Nothing is written. */
  abortBoot() {
    actions.closeVault();
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
    set({ repo: null, stats: null, view: { kind: "welcome" }, history: [], boot: null });
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
