import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { MemoryAdapter } from "../src/core/storage/memory";
import { Repository } from "../src/core/repo";
import { parseNoteOpml, serializeNoteOpml, parseOpml, collectOutlineTags } from "../src/core/codec/opml";
import { parseRecordText, serializeRecord, typeFromFilename } from "../src/core/codec/record";
import { importDynalistOpml } from "../src/core/importers/dynalist";
import { computeBudget } from "../src/core/designer/budgets";
import { slugify } from "../src/core/ids";

describe("ids", () => {
  it("slugifies", () => {
    expect(slugify("Sword-of-State-Class Railgun Destroyer")).toBe("sword-of-state-class-railgun-destroyer");
    expect(slugify("  Émile’s   Depot!! ")).toBe("emiles-depot");
    expect(slugify("")).toBe("untitled");
  });
});

describe("record codec", () => {
  it("round-trips YAML and JSON with stable key order", () => {
    const { record } = parseRecordText(
      `type: craft\nname: Test\nfields:\n  kind: ship\n  loadout:\n    - {module: abc, count: 2}\n`,
      "yaml",
    );
    expect(record.slug).toBe("test");
    expect(record.id).toHaveLength(12);
    const yaml = serializeRecord(record, "yaml");
    expect(yaml.startsWith("id: ")).toBe(true);
    const back = parseRecordText(yaml, "yaml").record;
    expect(back).toEqual(record);
    const json = serializeRecord(record, "json");
    expect(parseRecordText(json, "json").record).toEqual(record);
  });
  it("derives type from filename", () => {
    expect(typeFromFilename("sword-of-state.craft.yaml")).toBe("craft");
    expect(typeFromFilename("mars.body.json")).toBe("body");
    expect(typeFromFilename("readme.yaml")).toBeNull();
  });
});

describe("opml codec", () => {
  const sample = `<?xml version="1.0" encoding="utf-8"?>
<opml version="2.0"><head><title>Doc</title><flavor>dynalist</flavor></head>
<body><outline text="Root"><outline text="A &amp; B" _note="line1&#10;line2" collapsed="true"><outline text="#tagged child @mention"/></outline></outline></body></opml>`;

  it("parses attributes, notes, entities, nesting", () => {
    const p = parseOpml(sample);
    expect(p.title).toBe("Doc");
    expect(p.outline[0].text).toBe("Root");
    const a = p.outline[0].children[0];
    expect(a.text).toBe("A & B");
    expect(a.note).toBe("line1\nline2");
    expect(a.attrs).toEqual({ collapsed: "true" });
    expect(a.children[0].text).toBe("#tagged child @mention");
    expect(collectOutlineTags(p.outline)).toEqual(["mention", "tagged"]);
  });

  it("round-trips a note with envelope in head", () => {
    const { record, problems } = parseNoteOpml(sample);
    expect(problems.length).toBeGreaterThan(0); // no galleryMeta yet
    record.tags = ["x"];
    record.links = [{ rel: "about", to: "zzz" }];
    const text = serializeNoteOpml(record);
    expect(text).toContain("<galleryMeta>");
    expect(text).toContain('_note="line1&#10;line2"');
    const again = parseNoteOpml(text);
    expect(again.problems).toEqual([]);
    expect(again.record).toEqual(record);
  });
});

describe("dynalist importer", () => {
  const sample = `<?xml version="1.0"?><opml version="2.0"><head><title></title></head><body>
<outline text="Fleets and Strikecraft"><outline text="Early USSF" _note="The Lunar War"><outline text="DD - Destroyer #UCN"/></outline><outline text="LDF Ships"/></outline></body></opml>`;

  it("imports as one document", () => {
    const r = importDynalistOpml(sample, { split: "document" });
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0].name).toBe("Fleets and Strikecraft");
    expect(r.notes[0].outline).toHaveLength(2);
    expect(r.notes[0].tags).toContain("UCN");
    expect(r.notes[0].tags).toContain("dynalist");
    expect(r.nodeCount).toBe(4);
  });
  it("splits by top-level node", () => {
    const r = importDynalistOpml(sample, { split: "top-level", prefixWithDocument: true });
    expect(r.notes.map((n) => n.name)).toEqual(["Fleets and Strikecraft › Early USSF", "Fleets and Strikecraft › LDF Ships"]);
    expect(r.notes[0].summary).toBe("The Lunar War");
    expect(r.notes[0].outline[0].text).toBe("The Lunar War");
  });
  it("handles a real Dynalist export if present", () => {
    const p = "/mnt/user-data/uploads/Worldbuilding/Fleets_and_Strikecraft_dynalist-2026-9-4.opml";
    if (!existsSync(p)) return;
    const r = importDynalistOpml(readFileSync(p, "utf8"), { split: "top-level" });
    expect(r.nodeCount).toBe(1460);
    expect(r.notes.length).toBeGreaterThan(3);
    // every note re-serializes and re-parses identically
    for (const n of r.notes) {
      const again = parseNoteOpml(serializeNoteOpml(n)).record;
      expect(again).toEqual(n);
    }
  });
});

describe("repository", () => {
  it("initializes, saves, loads, indexes and backlinks", async () => {
    const fs = new MemoryAdapter();
    const repo = new Repository(fs);
    await repo.init();
    expect(await fs.exists("gallery.config.yaml")).toBe(true);
    expect(await fs.exists("_schemas/craft.schema.json")).toBe(true);
    expect(await fs.exists("_presets/module/nswr-drive.yaml")).toBe(true);
    await repo.load();

    const drive = repo.create("module", "NSWR Mk3", repo.registry.presetsFor("module").find((p) => p.id === "nswr-drive"));
    await repo.save(drive);
    const rad = repo.create("module", "Droplet radiator", repo.registry.presetsFor("module").find((p) => p.id === "droplet-radiator"));
    rad.fields.heat_reject_MW = 200;
    await repo.save(rad);
    const reactor = repo.create("module", "Reactor", repo.registry.presetsFor("module").find((p) => p.id === "fission-reactor"));
    await repo.save(reactor);
    const hull = repo.create("hull", "Sword hull", repo.registry.presetsFor("hull").find((p) => p.id === "destroyer-hull"));
    await repo.save(hull);
    const ship = repo.create("craft", "Sword-of-State-class", repo.registry.presetsFor("craft").find((p) => p.id === "destroyer"));
    ship.fields.hull = hull.id;
    ship.fields.loadout = [
      { module: drive.id, count: 1 },
      { module: reactor.id, count: 1 },
      { module: rad.id, count: 2 },
    ];
    ship.fields.propellant_t = 3000;
    await repo.save(ship);

    const dump = fs.dump();
    expect(Object.keys(dump)).toContain("craft/sword-of-state-class.craft.yaml");
    expect(dump["_index.csv"]).toContain("Sword-of-State-class");
    expect(dump["_exports/craft.csv"]).toContain("hull_id");
    expect(dump["_exports/craft.csv"]).toContain("Sword hull");

    // reload from disk
    const repo2 = new Repository(fs);
    const stats = await repo2.load();
    expect(stats.records).toBe(5);
    expect(stats.problems).toEqual([]);
    const back = repo2.backlinks(hull.id);
    expect(back.map((b) => b.rel)).toEqual(["hull"]);
    expect(repo2.backlinks(drive.id)[0].rel).toBe("loadout.module");

    // budget
    const b = computeBudget(repo2.typed(ship.id)!, repo2.typed(hull.id), (id) => repo2.typed(id));
    expect(b.dryMass_t).toBeCloseTo(1800 + 120 + 60 + 2 * 12);
    expect(b.wetMass_t).toBeCloseTo(b.dryMass_t + 3000);
    expect(b.deltaV_kms).toBeGreaterThan(50);
    expect(b.heatMargin_MW).toBeCloseTo(400 - 350);
    expect(b.powerMargin_MW).toBeCloseTo(50 - 1);
    expect(b.warnings).toEqual([]);

    // notes
    const note = repo2.createNote("Scratch");
    note.outline = [{ text: "hello", children: [{ text: "world", children: [] }] }];
    note.links = [{ rel: "about", to: ship.id }];
    await repo2.save(note);
    expect(fs.dump()["notes/scratch.opml"]).toContain('text="world"');
    expect(repo2.backlinks(ship.id).some((b) => b.from.record.id === note.id)).toBe(true);

    // rename → file moves
    ship.name = "Sword of Justice";
    ship.slug = "sword-of-justice";
    await repo2.save(ship);
    expect(fs.dump()["craft/sword-of-justice.craft.yaml"]).toBeDefined();
    expect(fs.dump()["craft/sword-of-state-class.craft.yaml"]).toBeUndefined();

    // json format switch applies to new records only
    await repo2.saveConfig({ recordFormat: "json" });
    const p = repo2.create("polity", "UESC");
    await repo2.save(p);
    expect(fs.dump()["polities/uesc.polity.json"]).toContain('"type": "polity"');
  });
});
