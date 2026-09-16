/**
 * Violations — the single currency the designer reports problems in.
 *
 * Every layer (expression derivation, tables, constraint sets, and later the
 * budget engine) returns values *plus* a list of these. Nothing throws at the
 * caller and nothing blocks a save: per §2.8 of the designer spec an
 * experimental craft that breaks its era's ceilings still saves, loudly.
 */

export type Severity = "error" | "warn" | "info";

export interface Violation {
  severity: Severity;
  /** Human-readable, complete on its own — these are shown inline, never in a dialog. */
  message: string;
  /** The stat/field the violation points at, when it points at one. */
  field?: string;
  /**
   * Operating mode this is scoped to (§3.5.1). Absent means it holds in every
   * mode. A mode-scoped error must not colour a row the user is not looking at.
   */
  mode?: string;
  /** Where the problem came from, e.g. "expr", "tables", "constraints". */
  source?: string;
}

export const violation = (severity: Severity, message: string, extra: Omit<Violation, "severity" | "message"> = {}): Violation => ({
  severity,
  message,
  ...extra,
});

export const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

/** Most severe first, then by field, so lists render stably. */
export function sortViolations(vs: Violation[]): Violation[] {
  return [...vs].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.field ?? "").localeCompare(b.field ?? "") || a.message.localeCompare(b.message));
}

export function worstSeverity(vs: Violation[]): Severity | undefined {
  return vs.length ? sortViolations(vs)[0].severity : undefined;
}
