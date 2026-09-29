/**
 * What Gallery is running on, for the boot log and the welcome footnote: the
 * shell (Tauri or a browser), the web engine, the Vite build and React. Every
 * line is read from the running app, never written in.
 */
import { version as reactVersion } from "react";
import { isTauri } from "../core/storage/tauri";

/** `EDGE 131`, `CHROME 131`, `FIREFOX 132`, `SAFARI 18`: the engine the UI draws in. */
export function engineLabel(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): string {
  // Most specific first: Edge's agent also names Chrome, and Chrome's also names Safari.
  const engines: [RegExp, string][] = [
    [/Edg\/(\d+)/, "EDGE"],
    [/Firefox\/(\d+)/, "FIREFOX"],
    [/Chrome\/(\d+)/, "CHROME"],
    [/Version\/(\d+)/, "SAFARI"],
  ];
  for (const [re, name] of engines) {
    const m = re.exec(ua);
    if (m) return `${name} ${m[1]}`;
  }
  return "UNKNOWN ENGINE";
}

export const viteLabel = (): string => `VITE ${typeof __VITE_VERSION__ === "string" ? __VITE_VERSION__ : "—"} · ${String(import.meta.env?.MODE ?? "—").toUpperCase()}`;
export const reactLabel = (): string => `REACT ${reactVersion}`;

/** `TAURI 2.8.0` in the desktop app, `BROWSER` otherwise. */
export async function shellLabel(): Promise<string> {
  if (!isTauri()) return "BROWSER";
  try {
    const { getTauriVersion } = await import("@tauri-apps/api/app");
    return `TAURI ${await getTauriVersion()}`;
  } catch {
    return "TAURI";
  }
}

/** The boot's first lines: the real stack, top to bottom. */
export async function runtimeLines(): Promise<string[]> {
  return [`RUNTIME — ${await shellLabel()} · ${engineLabel()}`, `BUILD — ${viteLabel()}`, `INTERFACE — ${reactLabel()}`];
}
