/**
 * Dynalist importer.
 *
 * Dynalist exports one OPML file per document, with the document title as a
 * single root <outline>. Two strategies:
 *   - "document":   one note per OPML file (root node becomes the note; its children the outline)
 *   - "top-level":  one note per child of the root (good for big documents like "Fleets and Strikecraft")
 *
 * Tags: every #tag / @tag found in the outline is added to the note's tags,
 * plus a `dynalist` provenance tag. Node attributes (`collapsed`, `complete`,
 * `heading`) are preserved so the file still opens in Dynalist.
 */
import type { NoteRecord, OutlineNode } from "../types";
import { collectOutlineTags, countOutlineNodes, parseOpml } from "../codec/opml";
import { newId, nowIso, slugify } from "../ids";

export type SplitStrategy = "document" | "top-level";

export interface ImportOptions {
  split: SplitStrategy;
  /** Fallback title when the OPML <title> is empty and the root has no text. */
  fallbackTitle?: string;
  /** Extra tags to add to every imported note. */
  tags?: string[];
  /** Prefix note names with the document title when splitting (e.g. "Fleets › Early USSF"). */
  prefixWithDocument?: boolean;
}

export interface ImportResult {
  notes: NoteRecord[];
  documentTitle: string;
  nodeCount: number;
}

function stripLeadingEmptyTitle(t: string): string {
  return t.replace(/_dynalist-\d{4}-\d{1,2}-\d{1,2}$/i, "").replace(/[_-]+/g, " ").trim();
}

/** Dynalist allows bold / italic / code markdown in item text; names read better without it. */
function plainName(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`(.+?)`/g, "$1").trim();
}

function makeNote(name: string, outline: OutlineNode[], extraTags: string[]): NoteRecord {
  const now = nowIso();
  const tags = new Set<string>(["dynalist", ...extraTags, ...collectOutlineTags(outline)]);
  return {
    id: newId(),
    type: "note",
    name,
    slug: slugify(name),
    tags: [...tags],
    aliases: [],
    links: [],
    assets: [],
    created: now,
    updated: now,
    outline,
  };
}

export function importDynalistOpml(text: string, opts: ImportOptions): ImportResult {
  const parsed = parseOpml(text);
  const roots = parsed.outline;
  // Dynalist: a single root outline whose text is the document name.
  const single = roots.length === 1 ? roots[0] : null;
  const documentTitle = (parsed.title && parsed.title.trim()) || single?.text || stripLeadingEmptyTitle(opts.fallbackTitle ?? "") || "Imported";
  const nodeCount = countOutlineNodes(roots);
  const extra = opts.tags ?? [];

  if (opts.split === "top-level" && single && single.children.length > 0) {
    const notes = single.children.map((child) => {
      const childName = plainName(child.text) || "Untitled";
      const name = opts.prefixWithDocument ? `${plainName(documentTitle)} › ${childName}` : childName;
      // The child itself becomes the note; keep its note text as the first outline item if present.
      const body: OutlineNode[] = [];
      if (child.note) body.push({ text: child.note, children: [] });
      body.push(...child.children);
      const n = makeNote(name, body.length ? body : [{ text: "", children: [] }], extra);
      if (child.note) n.summary = child.note.slice(0, 280);
      return n;
    });
    return { notes, documentTitle, nodeCount };
  }

  const outline = single ? single.children : roots;
  const n = makeNote(plainName(documentTitle), outline.length ? outline : [{ text: "", children: [] }], extra);
  if (single?.note) n.summary = single.note.slice(0, 280);
  return { notes: [n], documentTitle, nodeCount };
}

/** Make slugs unique within one import batch and against existing ones. */
export function dedupeSlugs(notes: NoteRecord[], taken: Set<string>): void {
  const seen = new Set(taken);
  for (const n of notes) {
    let s = n.slug;
    let i = 2;
    while (seen.has(s)) s = `${n.slug}-${i++}`;
    n.slug = s;
    seen.add(s);
  }
}
