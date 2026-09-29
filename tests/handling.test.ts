/**
 * The record document layer (docs/STYLE.md §4): handling marks round-trip
 * through every format, the banner string, computed redaction and
 * completeness, and the revision log the repository keeps on save.
 */
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { MemoryAdapter } from "../src/core/storage/memory";
import { Repository } from "../src/core/repo";
import { bannerString, completeness, describeChange, isEmptyValue, nextRevisions, parseHandling, recordCode, REVISION_CAP } from "../src/core/handling";
import { parseRecordText, serializeRecord } from "../src/core/codec/record";
import { parseNoteOpml, serializeNoteOpml } from "../src/core/codec/opml";
import { HULL_SCHEMA } from "../src/core/schema/builtin/schemas";
import { HANDLING_VOCAB_SEED } from "../src/core/schema/builtin/handlingVocab";
import type { NoteRecord, TypedRecord } from "../src/core/types";

const hull = (extra: Partial<TypedRecord> = {}): TypedRecord => ({
  id: "h1",
  type: "hull",
  name: "Sword hull",
  slug: "sword-hull",
  tags: [],
  aliases: [],
  links: [],
  assets: [],
  created: "2026-09-01T00:00:00.000Z",
  updated: "2026-09-01T00:00:00.000Z",
  fields: {},
  ...extra,
});
const polity = (fields: Record<string, unknown>): TypedRecord => ({ ...hull(), id: "p1", type: "polity", name: "United Jovian Confederacy", slug: "ujc", fields });

describe("banner", () => {
  it("reads UNCLASSIFIED when a record has no handling — never no banner", () => {
    expect(bannerString(hull(), HULL_SCHEMA, undefined)).toBe("UNCLASSIFIED — HULL-SWORD-HULL");
  });

  it("joins level and caveats, then code, then programme, with em dashes", () => {
    const r = hull({ handling: { level: "secret", caveats: ["SI", "REL TO CMW"], code: "ONI-TECH-0412", programme: "p1" } });
    expect(bannerString(r, HULL_SCHEMA, polity({ acronym: "UJCN" }))).toBe("SECRET//SI//REL TO CMW — ONI-TECH-0412 — UJCN");
  });

  it("derives the code from the type's prefix and the slug, and the programme from the name when there is no acronym", () => {
    expect(recordCode(hull(), HULL_SCHEMA)).toBe("HULL-SWORD-HULL");
    expect(bannerString(hull({ handling: { programme: "p1" } }), HULL_SCHEMA, polity({}))).toBe("UNCLASSIFIED — HULL-SWORD-HULL — UNITED JOVIAN CONFEDERACY");
  });

  it("keeps only the known handling shape from file data", () => {
    expect(parseHandling({ level: "cosmic", caveats: ["SI", 4, ""], badge: { risk: "DANGER" }, rogue: 1 })).toEqual({ caveats: ["SI"], badge: { risk: "DANGER" } });
    expect(parseHandling({ level: "unclassified" })).toBeUndefined();
    expect(parseHandling("secret")).toBeUndefined();
  });
});

describe("completeness", () => {
  it("counts filled required fields; zero and false are values, blanks are not", () => {
    expect([undefined, null, "", "  ", [], {}].every(isEmptyValue)).toBe(true);
    expect([0, false, "x", [1], { a: 1 }].some(isEmptyValue)).toBe(false);
    const fields = { type: "object", required: ["a", "b", "c", "hidden"], properties: { a: { type: "number" }, b: { type: "string" }, c: { type: "boolean" }, hidden: { type: "string", "x-hidden": true } } } as const;
    const c = completeness(hull({ fields: { a: 0, b: "" } }), fields as never);
    expect(c).toEqual({ required: 3, filled: 1, pending: ["b", "c"], fraction: 1 / 3 });
  });

  it("is undefined, not 100%, for a type that requires nothing", () => {
    expect(completeness(hull(), { type: "object", properties: {} }).fraction).toBeUndefined();
  });
});

describe("codec", () => {
  const handling = { level: "top-secret" as const, caveats: ["TK"], badge: { clearance: "LEVEL 4" }, derived_from: ["ONI-TECH-0387"] };
  const revisions = [{ at: "2026-09-02T00:00:00.000Z", change: "fields: hull_class" }];

  it("round-trips handling and revisions through YAML and JSON", () => {
    for (const fmt of ["yaml", "json"] as const) {
      const text = serializeRecord(hull({ handling, revisions }), fmt);
      const back = parseRecordText(text, fmt).record;
      expect(back.handling).toEqual(handling);
      expect(back.revisions).toEqual(revisions);
    }
  });

  it("writes no handling block for an unmarked record", () => {
    expect(YAML.parse(serializeRecord(hull({ handling: { level: "unclassified" } }), "yaml")).handling).toBeUndefined();
  });

  it("round-trips handling and revisions through a note's OPML head", () => {
    const note: NoteRecord = { ...hull(), type: "note", outline: [{ text: "a", children: [] }], handling, revisions };
    const back = parseNoteOpml(serializeNoteOpml(note)).record;
    expect(back.handling).toEqual(handling);
    expect(back.revisions).toEqual(revisions);
  });
});

describe("revision log", () => {
  it("describes what changed in a few words", () => {
    expect(describeChange(undefined, hull())).toEqual(["created"]);
    expect(describeChange(hull(), hull({ name: "Axe hull", tags: ["x"], fields: { hull_class: "DD" } }))).toEqual(["renamed", "tags", "fields: hull_class"]);
    expect(describeChange(hull(), hull())).toEqual([]);
  });

  it("widens the last entry within one editing session and starts a new one after", () => {
    // As the repository does: each save diffs against the record as last saved, log included.
    let stored: TypedRecord | undefined;
    const save = (next: TypedRecord, at: string) => {
      stored = { ...next, revisions: nextRevisions(stored, next, at) };
      return stored.revisions!.map((r) => r.change);
    };
    save(hull(), "2026-09-01T10:00:00.000Z");
    save(hull({ fields: { hull_class: "DD" } }), "2026-09-01T10:05:00.000Z");
    expect(save(hull({ fields: { hull_class: "DD", spine: 1 } }), "2026-09-01T10:10:00.000Z")).toEqual(["created", "fields: hull_class, spine"]);
    expect(save(hull({ name: "Axe", fields: { hull_class: "DD", spine: 1 } }), "2026-09-01T12:00:00.000Z")).toEqual(["created", "fields: hull_class, spine", "renamed"]);
  });

  it("keeps at most the last entries", () => {
    let prev = hull();
    let log = nextRevisions(undefined, prev, "2026-01-01T00:00:00.000Z");
    for (let i = 1; i <= 40; i++) {
      const next = hull({ revisions: log, fields: { n: i } });
      log = nextRevisions(prev, next, new Date(Date.UTC(2026, 0, 1, i)).toISOString());
      prev = next;
    }
    expect(log).toHaveLength(REVISION_CAP);
  });

  it("is kept by the repository on save, including edits made to the stored object in place", async () => {
    const repo = new Repository(new MemoryAdapter());
    await repo.init();
    await repo.load();
    const r = repo.create("hull", "Probe");
    await repo.save(r);
    expect(repo.typed(r.id)!.revisions?.map((x) => x.change)).toEqual(["created"]);
    const stored = repo.typed(r.id)!;
    stored.fields = { ...stored.fields, hull_class: "CG" }; // as the map does
    await repo.save(stored);
    expect(repo.typed(r.id)!.revisions?.at(-1)?.change).toMatch(/hull_class/);
    // Imports and other untouched saves add nothing.
    const before = repo.typed(r.id)!.revisions!.length;
    await repo.save(repo.typed(r.id)!, { touch: false });
    expect(repo.typed(r.id)!.revisions).toHaveLength(before);
  });
});

describe("vocabularies", () => {
  it("are seeded into gallery.config.yaml once and never overwritten", async () => {
    const fs = new MemoryAdapter({ "gallery.config.yaml": YAML.stringify({ name: "Mine", handling: { clearance: ["MINE"], caveats: [], disruption: [], risk: [] }, version: 1 }) });
    const repo = new Repository(fs);
    await repo.init();
    await repo.load();
    expect(repo.config.handling?.clearance).toEqual(["MINE"]);

    const fresh = new Repository(new MemoryAdapter());
    await fresh.init();
    await fresh.load();
    expect(fresh.config.handling).toEqual(HANDLING_VOCAB_SEED);
  });
});
