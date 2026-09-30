/**
 * The draft a record editor works on (doc 11 §1.8, planned in doc 09 §3.3), extracted from the
 * autosave code `RecordEditor` and `HullEditor` each carried: the working copy, 900 ms autosave,
 * a flush on unmount, and a reload from the repository when something else changed the record.
 *
 * - **One step per burst.** Every save carries an `origin`; consecutive bursts from one origin
 *   coalesce into one undo step (§1.3). `checkpoint()` flushes what is pending and starts a new
 *   origin, so a canvas drag is exactly one step: call it on pointer-down and on pointer-up.
 * - **Reload on change.** When `repo.version(id)` moves (undo, redo, a map drag, Reload) and the
 *   draft has no unsaved edits, the draft is replaced from the repository. This replaces the old
 *   `loaded.record.updated` effect, which an undo to the same second could miss.
 * - **Registered** in `drafts.ts`, so `flushAll()` reaches it.
 * - **A taken slug** is adopted: `repo.save` puts the record under the next free slug, the draft
 *   takes it, and the toast names it (`SLUG TAKEN — a → a-2`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryRecord } from "../core/types";
import type { LoadedRecord } from "../core/types";
import type { SaveCollision } from "../core/repo";
import { sameValue } from "../core/equal";
import { actions, useApp } from "./state";
import { register, track } from "./drafts";

/** Autosave this long after the last edit. */
export const AUTOSAVE_MS = 900;

let instances = 0;

export interface UseRecordDraftOptions {
  /** Names the kind of editor in the step's origin (`record`, `hull`); a burst coalesces only with its own. */
  origin?: string;
  /** The save gave the record another slug, because the one asked for was taken. */
  onCollision?: (c: SaveCollision & { adopted: string }) => void;
}

export interface RecordDraft {
  loaded: LoadedRecord | undefined;
  /** The working copy, or null when the record is not in the repository. */
  draft: GalleryRecord | null;
  /** Merge a patch. A patch that changes nothing is not an edit: it must not dirty the record (F1). */
  edit(patch: Partial<GalleryRecord>): void;
  dirty: boolean;
  saving: boolean;
  /** Save now, if there are unsaved edits. Never rejects. */
  flush(): Promise<void>;
  /** Save what is pending as its own step, and start a new one: the next burst never coalesces with it. */
  checkpoint(): Promise<void>;
}

export function useRecordDraft(id: string, opts: UseRecordDraftOptions = {}): RecordDraft {
  const { repo } = useApp();
  const loaded = repo?.get(id);
  const [draft, setDraft] = useState<GalleryRecord | null>(() => (loaded ? structuredClone(loaded.record) : null));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const repoRef = useRef(repo);
  repoRef.current = repo;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const timer = useRef<number | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const token = useRef({ n: ++instances, rot: 0 });
  const newOrigin = () => `${optsRef.current.origin ?? "record"}:${id}:${token.current.n}.${++token.current.rot}`;
  const origin = useRef(`${opts.origin ?? "record"}:${id}:${token.current.n}.0`);

  /** The repository version this draft is known to reflect. */
  const seen = useRef(repo ? repo.version(id) : 0);

  /**
   * `fixed`: the origin a checkpoint's flush must save under — the edits it carries were made before the
   * checkpoint, so it keeps the old origin even while it waits for a running save. Any other flush reads
   * the origin after waiting, so edits made since a checkpoint are never filed under the one before it.
   */
  const flushUnder = useCallback(async (fixed?: string): Promise<void> => {
    while (inflight.current) await inflight.current;
    const o = fixed ?? origin.current;
    const r = repoRef.current;
    const d = draftRef.current;
    if (!r || !d || !dirtyRef.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const run = (async () => {
      setSaving(true);
      try {
        const saved = await r.save(d, { origin: o });
        seen.current = r.version(id);
        // Edits made while the save ran are still owed a save; this draft is only clean if nothing changed.
        const clean = draftRef.current === d;
        if (saved.collision) {
          const adopted = saved.record.slug;
          const cur = draftRef.current;
          if (cur && cur.slug !== adopted) {
            const next = { ...cur, slug: adopted } as GalleryRecord;
            draftRef.current = next;
            setDraft(next);
          } else if (cur) setDraft({ ...cur });
          actions.toast(`SLUG TAKEN — ${saved.collision.slug} → ${adopted}`);
          optsRef.current.onCollision?.({ ...saved.collision, adopted });
        }
        if (clean) {
          dirtyRef.current = false;
          setDirty(false);
        }
      } catch (err) {
        actions.error(`Save failed: ${(err as Error).message}`);
      } finally {
        setSaving(false);
      }
    })();
    inflight.current = run;
    track(run);
    try {
      await run;
    } finally {
      if (inflight.current === run) inflight.current = null;
    }
  }, [id]);
  const flush = useCallback(() => flushUnder(), [flushUnder]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Autosave 900 ms after the last edit.
  useEffect(() => {
    if (!dirty) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flushRef.current(), AUTOSAVE_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [draft, dirty]);

  // Registered for `flushAll`, and flushed on unmount.
  useEffect(() => {
    const unregister = register({ flush: () => flushRef.current(), dirty: () => dirtyRef.current });
    return () => {
      void flushRef.current();
      unregister();
    };
  }, []);

  // Pick up changes made elsewhere — undo, redo, a map drag, Reload — when there are no unsaved edits.
  const version = repo ? repo.version(id) : 0;
  useEffect(() => {
    if (!repo || version === seen.current) return;
    if (dirtyRef.current || inflight.current) return; // our own save, or edits pending: the draft stands
    seen.current = version;
    const now = repo.get(id);
    if (now) {
      const copy = structuredClone(now.record);
      draftRef.current = copy;
      setDraft(copy);
    }
  }, [repo, id, version]);

  const edit = useCallback((patch: Partial<GalleryRecord>) => {
    const cur = draftRef.current;
    if (!cur) return;
    if (Object.entries(patch).every(([k, v]) => sameValue((cur as unknown as Record<string, unknown>)[k], v))) return;
    const next = { ...cur, ...patch } as GalleryRecord;
    draftRef.current = next; // so two edits in one tick both land
    dirtyRef.current = true;
    setDraft(next);
    setDirty(true);
  }, []);

  const checkpoint = useCallback(() => {
    const p = flushUnder(origin.current); // saves what is pending under the origin as it is now…
    origin.current = newOrigin(); // …and everything after starts a step of its own
    return p;
  }, [id, flushUnder]);

  return { loaded, draft, edit, dirty, saving, flush, checkpoint };
}
