/**
 * The session log behind the AdvisoryLog (docs/design-book/components/
 * AdvisoryLog, docs/STYLE.md §4.3, §5): every advisory and event the workbench
 * raised this session, in time order. Framework-free; the UI subscribes.
 *
 * Rules the book sets and this keeps: lines are never collapsed or merged —
 * a log that hides repetition hides the pattern — and nothing is removed by a
 * filter without the reader being able to count it. The log lives in memory
 * for the session; it is not vault data.
 */
import type { Violation } from "./designer/violations";

export type LogSeverity = "violation" | "caution" | "nominal" | "info";
export const LOG_SEVERITIES: LogSeverity[] = ["violation", "caution", "nominal", "info"];
/** Rank for `severity:>=…` queries; higher is more severe. */
export const SEVERITY_RANK: Record<LogSeverity, number> = { info: 0, nominal: 1, caution: 2, violation: 3 };

export interface LogDetail {
  /** The record the line is about. */
  subject?: string;
  subjectId?: string;
  /** Components or fields the advisory points at. */
  components?: string[];
  /** Kernel domain, shown beside the source in the detail pane. */
  domain?: string;
  /** Operating mode an advisory is scoped to. */
  mode?: string;
  /** A vault-relative file the line is about. */
  path?: string;
  /** Longer text beneath the message. */
  note?: string;
}

export interface LogLine {
  seq: number;
  /** Epoch ms. */
  at: number;
  severity: LogSeverity;
  /** Lower-case source: vault, record, map, hull, craft, export, schema, tables… */
  source: string;
  /** `VLT-0003`: the source's prefix and its own line count. */
  code: string;
  message: string;
  /** How long the step took, when the line closes one. */
  elapsedMs?: number;
  detail?: LogDetail;
  /** An advisory later evaluations no longer raise: when it cleared. */
  clearedAt?: number;
}

export interface LogSession {
  started: number;
  number: number;
  operator?: string;
  node?: string;
}

const PREFIX: Record<string, string> = { vault: "VLT", record: "REC", map: "MAP", hull: "HUL", craft: "CRF", export: "EXP", schema: "SCH", tables: "TBL", import: "IMP" };
export const sourcePrefix = (source: string): string => PREFIX[source] ?? source.slice(0, 3).toUpperCase();

export type LogInput = Omit<LogLine, "seq" | "at" | "code"> & { at?: number };

export class SessionLog {
  lines: LogLine[] = [];
  session: LogSession;
  private perSource = new Map<string, number>();
  private listeners = new Set<() => void>();
  private seq = 0;
  /** Bumped on every change, for useSyncExternalStore. */
  version = 0;

  constructor(session: Partial<LogSession> = {}, private now: () => number = Date.now) {
    this.session = { started: now(), number: 1, ...session };
  }

  push(input: LogInput): LogLine {
    const n = (this.perSource.get(input.source) ?? 0) + 1;
    this.perSource.set(input.source, n);
    const line: LogLine = { ...input, seq: ++this.seq, at: input.at ?? this.now(), code: `${sourcePrefix(input.source)}-${String(n).padStart(4, "0")}` };
    this.lines = [...this.lines, line];
    this.emit();
    return line;
  }

  /** Mark lines cleared (an advisory no longer raised). The line stays; only its state changes. */
  clear(seqs: number[], at = this.now()) {
    if (!seqs.length) return;
    const set = new Set(seqs);
    this.lines = this.lines.map((l) => (set.has(l.seq) && l.clearedAt === undefined ? { ...l, clearedAt: at } : l));
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.version++;
    for (const l of this.listeners) l();
  }
}

/** Counts by severity. Open counts leave out cleared advisories. */
export function countLines(lines: LogLine[], open = false): Record<LogSeverity, number> {
  const c: Record<LogSeverity, number> = { violation: 0, caution: 0, nominal: 0, info: 0 };
  for (const l of lines) if (!open || l.clearedAt === undefined) c[l.severity]++;
  return c;
}

// ---------------------------------------------------------------------------
// Query: `source:hull severity:>=caution since:06:00 free text`
// ---------------------------------------------------------------------------

export interface LogQuery {
  sources: string[];
  severity?: { op: ">=" | "<=" | "="; level: LogSeverity };
  /** Minutes after local midnight. */
  since?: number;
  text: string[];
  /** Terms that did not parse, shown back to the reader rather than ignored. */
  unknown: string[];
}

const SEV_WORD: Record<string, LogSeverity> = { violation: "violation", error: "violation", caution: "caution", warn: "caution", warning: "caution", nominal: "nominal", info: "info" };

export function parseLogQuery(q: string): LogQuery {
  const out: LogQuery = { sources: [], text: [], unknown: [] };
  for (const term of q.trim().split(/\s+/).filter(Boolean)) {
    const m = /^(\w+):(.*)$/.exec(term);
    if (!m) {
      out.text.push(term.toLowerCase());
      continue;
    }
    const [, key, val] = m;
    if (key === "source" && val) out.sources.push(val.toLowerCase());
    else if (key === "severity") {
      const s = /^(>=|<=|=)?(\w+)$/.exec(val ?? "");
      const level = s ? SEV_WORD[s[2].toLowerCase()] : undefined;
      if (level) out.severity = { op: (s![1] as ">=" | "<=" | "=" | undefined) ?? "=", level };
      else out.unknown.push(term);
    } else if (key === "since") {
      const t = /^(\d{1,2}):(\d{2})$/.exec(val ?? "");
      if (t) out.since = Number(t[1]) * 60 + Number(t[2]);
      else out.unknown.push(term);
    } else out.unknown.push(term);
  }
  return out;
}

export function matchesQuery(l: LogLine, q: LogQuery): boolean {
  if (q.sources.length) {
    const hay = [l.source, l.detail?.domain ?? ""].map((s) => s.toLowerCase());
    if (!q.sources.some((s) => hay.includes(s))) return false;
  }
  if (q.severity) {
    const a = SEVERITY_RANK[l.severity];
    const b = SEVERITY_RANK[q.severity.level];
    if (q.severity.op === ">=" ? a < b : q.severity.op === "<=" ? a > b : a !== b) return false;
  }
  if (q.since !== undefined) {
    const d = new Date(l.at);
    if (d.getHours() * 60 + d.getMinutes() < q.since) return false;
  }
  if (q.text.length) {
    const hay = `${l.message} ${l.code} ${l.detail?.subject ?? ""}`.toLowerCase();
    if (!q.text.every((t) => hay.includes(t))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Advisories: log what an evaluation newly raises, clear what it no longer does
// ---------------------------------------------------------------------------

export const logSeverityOf = (v: Violation): LogSeverity => (v.severity === "error" ? "violation" : v.severity === "warn" ? "caution" : "info");
export const advisoryKey = (v: Violation): string => [v.severity, v.domain ?? v.source ?? "", v.mode ?? "", v.field ?? "", v.anchor?.componentId ?? "", v.message].join("|");

/**
 * Tracks one editor's advisories for one subject. Each evaluation logs the
 * advisories it raises that were not open before, and marks cleared the ones
 * it no longer raises. A domain that had advisories and now has none logs one
 * NOMINAL line. Opening logs every advisory once, or NOMINAL when there are none.
 */
export class AdvisoryTracker {
  private open = new Map<string, number>(); // key → line seq
  private started = false;

  constructor(
    private log: SessionLog,
    private source: string,
    private subject: { id: string; name: string },
  ) {}

  evaluate(advisories: Violation[]) {
    const seen = new Set<string>();
    const raisedDomains = new Set<string>();
    for (const v of advisories) {
      const k = advisoryKey(v);
      seen.add(k);
      raisedDomains.add(v.domain ?? v.source ?? "");
      if (this.open.has(k)) continue;
      const line = this.log.push({
        severity: logSeverityOf(v),
        source: this.source,
        message: v.message,
        detail: {
          subject: this.subject.name,
          subjectId: this.subject.id,
          domain: v.domain ?? v.source,
          mode: v.mode,
          components: [v.anchor?.componentId, v.field].filter((x): x is string => !!x),
        },
      });
      this.open.set(k, line.seq);
    }
    const gone: number[] = [];
    const clearedDomains = new Set<string>();
    for (const [k, seq] of this.open) {
      if (seen.has(k)) continue;
      gone.push(seq);
      this.open.delete(k);
      clearedDomains.add(k.split("|")[1] ?? "");
    }
    this.log.clear(gone);
    for (const d of clearedDomains) {
      if (raisedDomains.has(d)) continue;
      this.log.push({ severity: "nominal", source: this.source, message: `${d || "advisories"} nominal — ${this.subject.name}`, detail: { subject: this.subject.name, subjectId: this.subject.id, domain: d || undefined } });
    }
    if (!this.started && advisories.length === 0) this.log.push({ severity: "nominal", source: this.source, message: `No advisories — ${this.subject.name}`, detail: { subject: this.subject.name, subjectId: this.subject.id } });
    this.started = true;
  }
}

// ---------------------------------------------------------------------------
// Text export
// ---------------------------------------------------------------------------

export function logTimestamp(at: number): string {
  const d = new Date(at);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/** Relative to the session start: `+00:12:03.118`. */
export function logRelative(at: number, started: number): string {
  const ms = Math.max(0, at - started);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return `+${p(h)}:${p(m)}:${p(s)}.${p(ms % 1000, 3)}`;
}

export const SEVERITY_WORD_LOG: Record<LogSeverity, string> = { violation: "VIOLATION", caution: "CAUTION", nominal: "NOMINAL", info: "INFO" };

/** One line per entry, columns fixed, tab-separated. */
export function exportLog(lines: LogLine[]): string {
  return lines
    .map((l) => [logTimestamp(l.at), SEVERITY_WORD_LOG[l.severity], l.source, l.code, l.message, l.elapsedMs !== undefined ? `${(l.elapsedMs / 1000).toFixed(2)} s` : "—", l.clearedAt !== undefined ? `cleared ${logTimestamp(l.clearedAt)}` : ""].join("\t").trimEnd())
    .join("\n");
}
