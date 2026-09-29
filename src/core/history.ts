/**
 * The session's undo history (doc 11 §1). Framework-free: the Repository records a step for every
 * write it makes through `save`/`delete`/`transaction`, and applies steps back on undo/redo; the UI
 * only calls `repo.undo()`/`repo.redo()` and subscribes here for the menu state.
 *
 * A step holds whole records *and the exact file text* on each side, so undo puts a file back
 * byte-for-byte — including a migrated record's original on-disk shape and its `updated` and
 * `revisions` (§1.2). Nothing here is persisted: history ends with the Repository (ruling 2).
 * Snapshots are the recovery across restarts; undo never reads them (§1.7).
 */
import type { GalleryRecord } from "./types";
import { describeChange, renderChange } from "./handling";

/** One side of a file change. `text` is the file's bytes as last read or written. */
export interface FileSide {
  path: string;
  text: string;
  record: GalleryRecord;
}

/** One record's change within a step. `null` = the file is absent on that side (create / delete). */
export interface Entry {
  id: string;
  before: FileSide | null;
  after: FileSide | null;
}

export interface Step {
  seq: number;
  /** Epoch ms of the last write folded into the step. */
  at: number;
  /** "EDIT MARS — fields: sma_au" · "DELETE SWORD" · a transaction's own label. */
  label: string;
  /** Coalescing key: the editor instance that made the write (§1.3). */
  origin?: string;
  /** In write order; undo applies them in reverse. */
  entries: Entry[];
  /** The snapshot taken before the step (§1.7), named in a refusal. */
  snapshot?: string;
}

/** A step as the Repository hands it over; `push` numbers and times it. */
export type NewStep = Omit<Step, "seq" | "at">;

/** Oldest steps are dropped beyond this many. */
export const HISTORY_DEPTH = 200;
/** Consecutive autosave bursts closer together than this coalesce into one step (§1.3). */
export const COALESCE_MS = 4000;

const upper = (s: string) => s.toLocaleUpperCase("en");

/**
 * The label for a single-record step (§1.2): a verb, the record's name upper-cased, and what
 * changed. A transaction supplies its own label instead.
 */
export function entryLabel(e: Entry): string {
  if (!e.before) return `CREATE ${upper(e.after!.record.name)}`;
  if (!e.after) return `DELETE ${upper(e.before.record.name)}`;
  const parts = describeChange(e.before.record, e.after.record);
  const rest = parts.filter((p) => p !== "renamed");
  const head = parts.includes("renamed") ? `RENAME ${upper(e.before.record.name)} → ${upper(e.after.record.name)}` : `EDIT ${upper(e.after.record.name)}`;
  return rest.length ? `${head} — ${renderChange(rest)}` : head;
}

const sameParts = (a: string[], b: string[]) => a.length === b.length && a.every((p, i) => p === b[i]);

/**
 * Whether `next` folds into `prev` (§1.3): `prev` is the top of `past` and nothing has been undone
 * since, both come from the same editor (`origin`), each is one edit of the same record, the edits
 * touch the same parts, and `next` follows within `COALESCE_MS` of the last write in `prev`.
 */
function coalesces(prev: Step, next: NewStep, now: number, futureEmpty: boolean): boolean {
  if (!futureEmpty || prev.origin === undefined || prev.origin !== next.origin) return false;
  if (prev.entries.length !== 1 || next.entries.length !== 1) return false;
  const [a, b] = [prev.entries[0], next.entries[0]];
  if (a.id !== b.id || !a.before || !a.after || !b.before || !b.after) return false;
  if (!sameParts(describeChange(a.before.record, a.after.record), describeChange(b.before.record, b.after.record))) return false;
  return now - prev.at < COALESCE_MS;
}

/** Undo and redo stacks. Pure: tests drive it without a repository. */
export class History {
  readonly depth = HISTORY_DEPTH;
  /** Oldest first; the last item is what undo reverts. */
  past: Step[] = [];
  /** Oldest undone last; the last item is what redo re-applies. */
  future: Step[] = [];
  /** Bumped on every change, for useSyncExternalStore. */
  version = 0;
  private seq = 0;
  private listeners = new Set<() => void>();

  /**
   * Record a step. It clears `future`, folds into the previous step when §1.3 allows (keeping the
   * earlier `before`, taking the new `after`), and trims `past` to `depth`. Returns the step as it
   * now stands on top of `past`.
   */
  push(step: NewStep, now: number): Step {
    const top = this.past[this.past.length - 1];
    if (top && coalesces(top, step, now, this.future.length === 0)) {
      const [a, b] = [top.entries[0], step.entries[0]];
      const merged: Step = { ...top, at: now, label: step.label, entries: [{ id: a.id, before: a.before, after: b.after }] };
      this.past[this.past.length - 1] = merged;
      this.emit();
      return merged;
    }
    const s: Step = { ...step, seq: ++this.seq, at: now };
    this.past.push(s);
    this.future = [];
    if (this.past.length > this.depth) this.past.splice(0, this.past.length - this.depth);
    this.emit();
    return s;
  }

  peekUndo(): Step | undefined {
    return this.past[this.past.length - 1];
  }
  peekRedo(): Step | undefined {
    return this.future[this.future.length - 1];
  }

  /**
   * Move a step that has been undone from `past` to `future`. `step` defaults to the top of `past`;
   * naming it keeps the move right when a write landed on top while the undo was being applied.
   */
  commitUndo(step: Step | undefined = this.peekUndo()): void {
    if (!step) return;
    const i = this.past.lastIndexOf(step);
    if (i < 0) return;
    this.past.splice(i, 1);
    this.future.push(step);
    this.emit();
  }

  /** Move a step that has been redone from `future` back to `past`. */
  commitRedo(step: Step | undefined = this.peekRedo()): void {
    if (!step) return;
    const i = this.future.lastIndexOf(step);
    if (i < 0) return;
    this.future.splice(i, 1);
    this.past.push(step);
    if (this.past.length > this.depth) this.past.splice(0, this.past.length - this.depth);
    this.emit();
  }

  clear(): void {
    this.past = [];
    this.future = [];
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
