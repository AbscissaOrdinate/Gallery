/**
 * Pure helpers behind the status primitives: severity words, grouping, ASCII
 * bars and the commit-state line. No React here, so tests can import it.
 *
 * Kernel severities are `error | warn | info` (core/designer/violations.ts);
 * the UI speaks VIOLATION / CAUTION / INFO, plus NOMINAL for a domain that was
 * evaluated and came back clean and PENDING for one not yet evaluated
 * (docs/STYLE.md §4.3, §8). Nothing here — or anywhere — blocks a save.
 */
import type { Severity, Violation } from "../../core/designer/violations";
import { sortViolations } from "../../core/designer/violations";

export type UiSeverity = "violation" | "caution" | "info" | "nominal" | "pending";

export const SEVERITY_WORD: Record<UiSeverity, string> = {
  violation: "VIOLATION",
  caution: "CAUTION",
  info: "INFO",
  nominal: "NOMINAL",
  pending: "PENDING",
};

export function uiSeverity(s: Severity): UiSeverity {
  return s === "error" ? "violation" : s === "warn" ? "caution" : "info";
}

/** Editors group advisories by severity in this fixed order; only the log orders by time. */
export const EDITOR_ORDER: UiSeverity[] = ["violation", "caution", "info"];

export function groupBySeverity(vs: Violation[]): { severity: UiSeverity; violations: Violation[] }[] {
  const sorted = sortViolations(vs);
  return EDITOR_ORDER.map((severity) => ({ severity, violations: sorted.filter((v) => uiSeverity(v.severity) === severity) })).filter((g) => g.violations.length > 0);
}

export function countBySeverity(vs: Violation[]): Record<"violation" | "caution" | "info", number> {
  const out = { violation: 0, caution: 0, info: 0 };
  for (const v of vs) out[uiSeverity(v.severity) as "violation" | "caution" | "info"]++;
  return out;
}

/**
 * The commit-state line for a budget bar or footer. Saving is never refused:
 * a violated budget is stated in words beside a save that went through
 * (STYLE.md §2).
 */
export function commitState(state: { saving?: boolean; dirty?: boolean }, vs: Violation[]): { text: string; severity: UiSeverity } {
  const n = countBySeverity(vs).violation;
  if (state.saving) return { text: "SAVING", severity: "pending" };
  const base = state.dirty ? "UNSAVED" : "SAVED";
  if (n > 0) return { text: `${base} WITH ${n} VIOLATION${n === 1 ? "" : "S"}`, severity: "violation" };
  return { text: base, severity: state.dirty ? "pending" : "nominal" };
}

/** Ten cells always (AsciiIndicators README), so a column of bars scans as a chart. */
export const ASCII_CELLS = 10;

/** `[#######---]` for a fraction; values over 1 fill the frame. Undefined → an empty frame. */
export function asciiBar(fraction: number | undefined, cells = ASCII_CELLS): string {
  if (fraction === undefined || !Number.isFinite(fraction)) return `[${"-".repeat(cells)}]`;
  const filled = Math.max(0, Math.min(cells, Math.round(fraction * cells)));
  return `[${"#".repeat(filled)}${"-".repeat(cells - filled)}]`;
}

/** `▮▮▮▯▯` — one glyph per real thing. Above sixteen, callers switch to a bar. */
export const METER_MAX = 16;
export function asciiMeter(filled: number, total: number): string {
  const t = Math.max(0, Math.round(total));
  const f = Math.max(0, Math.min(t, Math.round(filled)));
  return "▮".repeat(f) + "▯".repeat(t - f);
}

/**
 * Severity of a ratio against a limit: at or under `caution` is nominal,
 * between `caution` and 1 is caution, over 1 is a violation. `undefined` means
 * nothing was measured.
 */
export function ratioSeverity(fraction: number | undefined, caution = 0.9): UiSeverity {
  if (fraction === undefined || !Number.isFinite(fraction)) return "pending";
  if (fraction > 1) return "violation";
  if (fraction >= caution) return "caution";
  return "nominal";
}

/** Operator labels are uppercase in the copy (STYLE.md §1). Schema titles carry no units, so this is safe for them. */
export const caps = (s: string): string => s.toLocaleUpperCase("en");

/** Build a treeline prefix: `├─ `, `└─ `, and `│  ` for ancestors that continue. */
export function treePrefix(ancestorsContinue: boolean[], last: boolean): string {
  return ancestorsContinue.map((c) => (c ? "│  " : "   ")).join("") + (last ? "└─ " : "├─ ");
}
