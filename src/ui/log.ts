/**
 * The session's log, for the whole UI: one SessionLog per opened vault
 * (src/core/sessionLog.ts). Anything may append; the AdvisoryLog screen reads.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { AdvisoryTracker, SessionLog, type LogInput, type LogSession } from "../core/sessionLog";
import type { Violation } from "../core/designer/violations";

let current = new SessionLog();
let unbind = current.subscribe(notify);
const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}

/** Start a fresh log: a vault was opened. */
export function newSession(session: Partial<LogSession>): SessionLog {
  unbind();
  current = new SessionLog(session);
  unbind = current.subscribe(notify);
  notify();
  return current;
}

export const sessionLog = (): SessionLog => current;

export function logEvent(input: LogInput) {
  current.push(input);
}

/** Re-renders on every new line or state change. */
export function useSessionLog(): SessionLog {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => `${current.session.started}:${current.version}`,
  );
  return current;
}

/** The session number: one more than the last session this install opened. Per-install, not vault data. */
export function nextSessionNumber(): number {
  try {
    const n = Number(localStorage.getItem("gallery.session") ?? 0) + 1;
    localStorage.setItem("gallery.session", String(n));
    return n;
  } catch {
    return 1;
  }
}

/** Advisories are logged when an editor's edits settle, not on every drag step. */
const SETTLE_MS = 600;

/**
 * Log an editor's advisories: each once when first raised, cleared when no
 * longer raised, NOMINAL when a domain comes clean (AdvisoryTracker).
 */
export function useAdvisoryLog(source: string, subject: { id: string; name: string } | undefined, advisories: Violation[]) {
  const tracker = useRef<{ key: string; t: AdvisoryTracker } | null>(null);
  const latest = useRef(advisories);
  latest.current = advisories;
  const sig = advisories.map((a) => `${a.severity}|${a.message}`).join("\n");
  useEffect(() => {
    if (!subject) return;
    const key = `${current.session.started}:${source}:${subject.id}`;
    const first = tracker.current?.key !== key;
    if (first) tracker.current = { key, t: new AdvisoryTracker(current, source, subject) };
    const run = () => tracker.current?.t.evaluate(latest.current);
    if (first) return run();
    const h = window.setTimeout(run, SETTLE_MS);
    return () => window.clearTimeout(h);
  }, [sig, subject?.id, source]);
}
