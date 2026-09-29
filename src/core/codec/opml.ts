/**
 * OPML codec (Dynalist-compatible).
 *
 * Notes are stored as OPML 2.0. The Gallery envelope (id, tags, links, …) is
 * kept in <head> as a single <galleryMeta> element containing JSON, so the file
 * still round-trips through Dynalist/Workflowy/OmniOutliner, which ignore
 * unknown head elements. Outline attributes (Dynalist `_note`, `collapsed`,
 * `complete`, `heading`) are preserved verbatim.
 */
import { compactHandling, parseHandling, parseRevisions } from "../handling";
import { XMLParser } from "fast-xml-parser";
import type { NoteRecord, OutlineNode, Link, AssetRef } from "../types";
import { newId, nowIso, slugify } from "../ids";

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

type XNode = Record<string, unknown> & { ":@"?: Record<string, string> };

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  allowBooleanAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: false, // we decode entities ourselves (fast-xml-parser skips numeric ones in attributes)
});

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Decode XML entities: named (amp/lt/gt/quot/apos) and numeric (&#10; &#x0A;). */
export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[body] ?? m;
  });
}

function children(n: XNode, tag: string): XNode[] {
  const arr = n[tag];
  return Array.isArray(arr) ? (arr as XNode[]) : [];
}

function tagOf(n: XNode): string | null {
  for (const k of Object.keys(n)) if (k !== ":@") return k;
  return null;
}

function textOf(n: XNode | undefined, tag: string): string {
  if (!n) return "";
  const kids = children(n, tag);
  const parts: string[] = [];
  for (const k of kids) if (typeof k["#text"] === "string") parts.push(decodeXml(k["#text"] as string));
  return parts.join("");
}

function outlineFrom(n: XNode): OutlineNode {
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(n[":@"] ?? {})) attrs[k] = decodeXml(String(v));
  const text = attrs.text ?? "";
  delete attrs.text;
  let note: string | undefined;
  if (attrs._note !== undefined) {
    note = attrs._note;
    delete attrs._note;
  }
  const kids = children(n, "outline")
    .filter((k) => tagOf(k) === "outline")
    .map(outlineFrom);
  const node: OutlineNode = { text, children: kids };
  if (note !== undefined && note !== "") node.note = note;
  if (Object.keys(attrs).length) node.attrs = attrs;
  return node;
}

export interface ParsedOpml {
  title: string;
  head: Record<string, string>;
  meta: Partial<NoteRecord> | null;
  outline: OutlineNode[];
}

export function parseOpml(text: string): ParsedOpml {
  const clean = text.replace(/^﻿/, "");
  const doc = parser.parse(clean) as XNode[];
  const opml = doc.find((n) => tagOf(n) === "opml");
  if (!opml) throw new Error("not an OPML document");
  const headNode = children(opml, "opml").find((n) => tagOf(n) === "head");
  const bodyNode = children(opml, "opml").find((n) => tagOf(n) === "body");
  const head: Record<string, string> = {};
  let meta: Partial<NoteRecord> | null = null;
  if (headNode) {
    for (const el of children(headNode, "head")) {
      const t = tagOf(el);
      if (!t || t === "#text") continue;
      const v = textOf(el, t);
      if (t === "galleryMeta") {
        try {
          meta = JSON.parse(v);
        } catch {
          meta = null;
        }
      } else head[t] = v;
    }
  }
  const outline = bodyNode ? children(bodyNode, "body").filter((n) => tagOf(n) === "outline").map(outlineFrom) : [];
  return { title: head.title ?? "", head, meta, outline };
}

/** Build a NoteRecord from OPML text. If no galleryMeta is present, a fresh envelope is generated. */
export function parseNoteOpml(text: string, fallbackName = "Untitled"): { record: NoteRecord; problems: string[] } {
  const p = parseOpml(text);
  const problems: string[] = [];
  const m = p.meta ?? {};
  if (!p.meta) problems.push("no galleryMeta (envelope generated)");
  const name = (typeof m.name === "string" && m.name) || p.title || fallbackName;
  const record: NoteRecord = {
    id: typeof m.id === "string" && m.id ? m.id : newId(),
    type: "note",
    name,
    slug: typeof m.slug === "string" && m.slug ? m.slug : slugify(name),
    tags: Array.isArray(m.tags) ? (m.tags as string[]).filter((t) => typeof t === "string") : [],
    aliases: Array.isArray(m.aliases) ? (m.aliases as string[]).filter((t) => typeof t === "string") : [],
    summary: typeof m.summary === "string" ? m.summary : undefined,
    links: Array.isArray(m.links) ? (m.links as Link[]).filter((l) => l && typeof l.to === "string") : [],
    assets: Array.isArray(m.assets) ? (m.assets as AssetRef[]).filter((a) => a && typeof a.path === "string") : [],
    created: typeof m.created === "string" ? m.created : nowIso(),
    updated: typeof m.updated === "string" ? m.updated : nowIso(),
    outline: p.outline,
  };
  const handling = parseHandling(m.handling);
  if (handling) record.handling = handling;
  const revisions = parseRevisions(m.revisions);
  if (revisions) record.revisions = revisions;
  if (!p.meta?.id) problems.push("missing id (generated)");
  return { record, problems };
}

// ---------------------------------------------------------------------------
// Serializing
// ---------------------------------------------------------------------------

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function serializeOutline(node: OutlineNode, depth: number, out: string[]): void {
  const pad = "  ".repeat(depth);
  const attrs: string[] = [`text="${escapeXml(node.text)}"`];
  if (node.note) attrs.push(`_note="${escapeXml(node.note)}"`);
  for (const [k, v] of Object.entries(node.attrs ?? {})) {
    if (k === "text" || k === "_note") continue;
    attrs.push(`${k}="${escapeXml(v)}"`);
  }
  if (node.children.length === 0) {
    out.push(`${pad}<outline ${attrs.join(" ")}/>`);
    return;
  }
  out.push(`${pad}<outline ${attrs.join(" ")}>`);
  for (const c of node.children) serializeOutline(c, depth + 1, out);
  out.push(`${pad}</outline>`);
}

/** Serialize a note record to OPML 2.0 with the envelope in <head><galleryMeta>. */
export function serializeNoteOpml(r: NoteRecord, extraHead: Record<string, string> = {}): string {
  const meta = {
    id: r.id,
    type: "note",
    name: r.name,
    slug: r.slug,
    tags: r.tags,
    aliases: r.aliases,
    ...(r.summary ? { summary: r.summary } : {}),
    links: r.links,
    assets: r.assets,
    created: r.created,
    updated: r.updated,
    ...(compactHandling(r.handling) ? { handling: compactHandling(r.handling) } : {}),
    ...(r.revisions?.length ? { revisions: r.revisions } : {}),
  };
  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="utf-8"?>`);
  out.push(`<opml version="2.0">`);
  out.push(`  <head>`);
  out.push(`    <title>${escapeText(r.name)}</title>`);
  out.push(`    <flavor>gallery</flavor>`);
  out.push(`    <dateCreated>${escapeText(r.created)}</dateCreated>`);
  out.push(`    <dateModified>${escapeText(r.updated)}</dateModified>`);
  for (const [k, v] of Object.entries(extraHead)) {
    if (["title", "flavor", "dateCreated", "dateModified", "galleryMeta"].includes(k)) continue;
    out.push(`    <${k}>${escapeText(v)}</${k}>`);
  }
  out.push(`    <galleryMeta>${escapeText(JSON.stringify(meta))}</galleryMeta>`);
  out.push(`  </head>`);
  out.push(`  <body>`);
  for (const n of r.outline) serializeOutline(n, 2, out);
  out.push(`  </body>`);
  out.push(`</opml>`);
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect #hashtags and @mentions used anywhere in an outline (Dynalist convention). */
export function collectOutlineTags(outline: OutlineNode[]): string[] {
  const found = new Set<string>();
  const re = /(?:^|\s)[#@]([A-Za-z][A-Za-z0-9_-]{1,40})/g;
  const visit = (n: OutlineNode) => {
    for (const s of [n.text, n.note ?? ""]) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) found.add(m[1]);
      re.lastIndex = 0;
    }
    n.children.forEach(visit);
  };
  outline.forEach(visit);
  return [...found].sort((a, b) => a.localeCompare(b));
}

export function countOutlineNodes(outline: OutlineNode[]): number {
  let n = 0;
  const visit = (x: OutlineNode) => {
    n++;
    x.children.forEach(visit);
  };
  outline.forEach(visit);
  return n;
}

/** Render an outline as an indented Markdown list (for previews / body export). */
export function outlineToMarkdown(outline: OutlineNode[], depth = 0): string {
  const lines: string[] = [];
  for (const n of outline) {
    const pad = "  ".repeat(depth);
    lines.push(`${pad}- ${n.text}`);
    if (n.note) for (const l of n.note.split("\n")) lines.push(`${pad}  ${l}`);
    if (n.children.length) lines.push(outlineToMarkdown(n.children, depth + 1));
  }
  return lines.join("\n");
}
