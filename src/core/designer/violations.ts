/**
 * Violations — the single currency the designer reports problems in.
 *
 * Every layer (expression derivation, tables, constraint sets, and later the
 * budget engine) returns values *plus* a list of these. Nothing throws at the
 * caller and nothing blocks a save: per §2.8 of the designer spec an
 * experimental craft that breaks its era's ceilings still saves, loudly.
 */

export type Severity = "error" | "warn" | "info";

/**
 * What kind of check produced this. `gallery/07` §1 proposes a separate
 * `Advisory` type carrying exactly these, plus a severity and an anchor. It is
 * the same thing as a Violation with two more optional fields, and two parallel
 * currencies mean two code paths and two renderers, so it is folded in here.
 * Doc 07's `info | caution | violation` maps onto `info | warn | error`.
 */
export type Domain =
  | "geometry"
  | "fit"
  | "mass"
  | "power"
  | "thermal"
  | "radiation"
  | "deltav"
  | "structure"
  | "style"
  | "doctrine";

/** Where in the drawing this points, so a click can highlight it. */
export interface Anchor {
  /** Metres from the bow. */
  station?: number;
  /** A section, slot, appendage or module id. */
  componentId?: string;
}

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
  /** Which family of check this is, for grouping the advisory list. */
  domain?: Domain;
  /** Click-to-highlight target in the canvas. */
  anchor?: Anchor;
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

/**
 * Group by domain for the advisory pane, most severe domain first. Violations
 * with no domain collect under `general` so nothing is ever dropped from view.
 */
export function byDomain(vs: Violation[]): { domain: Domain | "general"; violations: Violation[] }[] {
  const groups = new Map<Domain | "general", Violation[]>();
  for (const v of sortViolations(vs)) {
    const key = v.domain ?? "general";
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  return [...groups]
    .map(([domain, violations]) => ({ domain, violations }))
    .sort((a, b) => SEVERITY_ORDER[worstSeverity(a.violations) ?? "info"] - SEVERITY_ORDER[worstSeverity(b.violations) ?? "info"] || String(a.domain).localeCompare(String(b.domain)));
}

export function worstSeverity(vs: Violation[]): Severity | undefined {
  return vs.length ? sortViolations(vs)[0].severity : undefined;
}
