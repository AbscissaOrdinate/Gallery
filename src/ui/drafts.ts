/**
 * The editors' unsaved drafts, as one registry (doc 11 §1.8). Each `useRecordDraft` instance
 * registers here, so anything that must not run over a pending edit — undo, redo, reload, closing
 * the vault — can `await flushAll()` first. Flushing makes a pending edit its own top step, so
 * undo always undoes the user's most recent action, whichever editor holds it.
 *
 * Pure: no React, no repository. A flush that is already running when an editor unmounts is
 * tracked too (`track`), so `flushAll` waits for it.
 */
export interface DraftHandle {
  /** Save the draft now, if it has unsaved edits. Never rejects: a failed save is the editor's error banner. */
  flush(): Promise<void>;
  /** Whether the draft has unsaved edits. */
  dirty(): boolean;
}

const handles = new Set<DraftHandle>();
const running = new Set<Promise<unknown>>();

/** Add a draft; the returned function removes it. */
export function register(h: DraftHandle): () => void {
  handles.add(h);
  return () => void handles.delete(h);
}

/** Note a save in flight, so `flushAll` waits for it even after its editor is gone. */
export function track(p: Promise<unknown>): void {
  running.add(p);
  const done = () => void running.delete(p);
  p.then(done, done);
}

/** Save every dirty draft and wait for every save in flight. */
export async function flushAll(): Promise<void> {
  await Promise.all([...handles].map((h) => h.flush().catch(() => undefined)));
  // A flush started by an unmount, or by a draft that was edited while we waited.
  while (running.size) await Promise.all([...running].map((p) => p.catch(() => undefined)));
}

/** How many drafts have unsaved edits (the save indicator, S3). */
export function dirtyCount(): number {
  let n = 0;
  for (const h of handles) if (h.dirty()) n++;
  return n;
}
