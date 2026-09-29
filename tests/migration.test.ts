/**
 * Schema v2 migration and the preset regression gate (§9).
 *
 * The gate exists because the existing versioning mechanism upgrades *schema
 * files* and has never touched *record files*. A bump that moves a field would
 * silently orphan every record built on the old shape, and the failure would
 * show up as budget numbers quietly changing rather than as an error.
 *
 * `tests/fixtures/budget-baseline.json` was captured by
 * `scripts/capture-budget-baseline.ts` on the commit *before* the v2 schemas
 * landed. Comparing against it is the only version of this test that proves
 * anything.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryAdapter } from "../src/core/storage/memory";
import { Repository } from "../src/core/repo";
import { demoVault } from "../src/ui/demo";
import { analyseShip } from "../src/core/designer/ship";
import { migrateAll, migrateRecord, MIGRATABLE_TYPES } from "../src/core/schema/migrate";
import { readHull } from "../src/core/designer/hull/record";
import { hullAdvisories } from "../src/core/designer/hull/advisories";
import { BUILTIN_SCHEMAS } from "../src/core/schema/builtin/schemas";
import { BUILTIN_PRESETS } from "../src/core/schema/builtin/presets";
import { grossVolume } from "../src/core/designer/hull/geometry";
import type { Spine } from "../src/core/designer/hull/types";
import { isNote, type TypedRecord } from "../src/core/types";

const baseline = JSON.parse(readFileSync(join(__dirname, "fixtures", "budget-baseline.json"), "utf8")) as {
  budgets: Record<string, Record<string, unknown>>;
  presets: Record<string, string[]>;
};

/** A v1 hull exactly as the destroyer-hull preset shipped it. */
const v1Hull = (): TypedRecord => ({
  id: "h1",
  type: "hull",
  name: "Destroyer hull",
  slug: "destroyer-hull",
  tags: [],
  aliases: [],
  links: [],
  assets: [],
  created: "2026-01-01T00:00:00Z",
  updated: "2026-01-01T00:00:00Z",
  fields: {
    hull_class: "DD",
    length_m: 220,
    beam_m: 30,
    volume_m3: 60000,
    structural_mass_t: 1800,
    structural_cost: 400,
    slots: [
      { id: "spine", kind: "spinal", count: 1, x: 50, y: 50 },
      { id: "turrets", kind: "turret", count: 6, x: 50, y: 30 },
      { id: "drive", kind: "drive", count: 1, x: 5, y: 50 },
      { id: "radiators", kind: "radiator", count: 4, x: 30, y: 80 },
      { id: "bays", kind: "internal", count: 8, x: 60, y: 50 },
      { id: "hardpoints", kind: "external", count: 6, x: 70, y: 20 },
    ],
  },
});

describe("hull v1 → v2", () => {
  it("synthesises a spine that reproduces the authored volume exactly", () => {
    const { record, changed, notes } = migrateRecord(v1Hull());
    expect(changed).toBe(true);
    const spine = record.fields.spine as Spine;
    expect(spine.length_m).toBe(220);
    expect(spine.beam_m).toBe(30);
    expect(spine.datum).toBe("bow");
    // A wrong volume would propagate into every budget built on this hull, so
    // the synthesised barrel is sized to the authored figure, not to taste.
    expect(grossVolume(spine)).toBeCloseTo(60000, 6);
    expect(notes.join(" ")).toMatch(/reproducing the authored volume/);
  });

  it("migrates a v1 hull whose spine is nothing but schema defaults", () => {
    // `repo.create` fills defaults from the v2 schema, so a hull built from a
    // v1 preset arrives carrying an empty-but-present spine. Detecting v2 by
    // the presence of the key left these hulls unmigrated and drawing as
    // nothing at all — the editor showed a 0 m hull with 0 m³ of volume.
    const rec = v1Hull();
    rec.fields.spine = { station_pitch_m: 3, datum: "bow" };
    const { record, changed } = migrateRecord(rec);
    expect(changed).toBe(true);
    const spine = record.fields.spine as Spine;
    expect(spine.length_m).toBe(220);
    expect(grossVolume(spine)).toBeCloseTo(60000, 6);
  });

  it("keeps a station pitch the author already chose", () => {
    const rec = v1Hull();
    rec.fields.spine = { station_pitch_m: 2.5 };
    expect((migrateRecord(rec).record.fields.spine as Spine).station_pitch_m).toBe(2.5);
  });

  it("leaves a real v2 spine alone even when v1 fields are still beside it", () => {
    const rec = v1Hull();
    rec.fields.spine = { length_m: 180, beam_m: 16, stations: [{ x: 0, half_height_m: 4 }, { x: 180, half_height_m: 4 }] };
    const { record, changed } = migrateRecord(rec);
    expect(changed).toBe(false);
    expect((record.fields.spine as Spine).length_m).toBe(180);
  });

  it("treats a spine carrying only stations as already migrated", () => {
    const rec = v1Hull();
    rec.fields.spine = { stations: [{ x: 0, half_height_m: 4 }] };
    expect(migrateRecord(rec).changed).toBe(false);
  });

  it("flags the record for review rather than pretending it drew a ship", () => {
    const { record } = migrateRecord(v1Hull());
    expect(record.fields.migration_review).toBe(true);
  });

  it("leaves packing efficiency at 1 so the migration changes no volume", () => {
    const { record } = migrateRecord(v1Hull());
    expect(record.fields.packing_efficiency).toBe(1);
  });

  it("turns slot counts into positioned external slots and drops internal ones", () => {
    const { record, notes } = migrateRecord(v1Hull());
    const slots = record.fields.external_slots as { id: string; x: number; type: string; theta_deg: number }[];
    // 1 spinal + 6 turret + 1 drive + 4 radiator + 6 external = 18; the 8 internal are volume, not slots.
    expect(slots).toHaveLength(18);
    expect(slots.filter((s) => s.type === "turret")).toHaveLength(6);
    expect(slots.filter((s) => s.type === "internal")).toHaveLength(0);
    expect(notes.join(" ")).toMatch(/8 internal slots became section volume/);
    // x% of the silhouette becomes a station in metres.
    expect(slots.find((s) => s.type === "drive")?.x).toBeCloseTo(12, 9); // 5% of 220 m = 11, snapped to the 3 m grid
    // v1 recorded one x/y for a whole group and nothing about the individuals,
    // so the members are fanned about the angle the group was drawn at: the
    // mean is preserved, and no two share a position.
    const mean = (type: string) => {
      const g = slots.filter((s) => s.type === type);
      // Circular mean, so a group straddling 0 deg does not average to 180.
      const rad = (d: number) => (d * Math.PI) / 180;
      const x = g.reduce((a, s) => a + Math.cos(rad(s.theta_deg)), 0);
      const y = g.reduce((a, s) => a + Math.sin(rad(s.theta_deg)), 0);
      return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    };
    expect(mean("turret")).toBeCloseTo(0, 6); // y = 30, above the midline
    expect(mean("radiator")).toBeCloseTo(180, 6); // y = 80, below it
    for (const type of ["turret", "radiator"]) {
      const angles = slots.filter((s) => s.type === type).map((s) => s.theta_deg);
      expect(new Set(angles).size).toBe(angles.length);
    }
  });

  it("lands migrated slots on the station grid", () => {
    const { record } = migrateRecord(v1Hull());
    const spine = record.fields.spine as Spine;
    const slots = record.fields.external_slots as { x: number }[];
    const pitch = spine.station_pitch_m ?? 3;
    // 50% of 220 m is 110, which is not a multiple of 3. Left unsnapped, every
    // slot on every migrated hull raised an "off the station grid" advisory.
    for (const s of slots) expect(s.x % pitch).toBeCloseTo(0, 9);
  });

  it("fans a multi-mount group far enough apart that it does not read as fouling", () => {
    const hull = readHull(migrateRecord(v1Hull()).record.fields);
    // Stacking all six turrets on one spot made every pair of them a fit
    // advisory: fifteen per group, forty over the hull, on a record nobody
    // had touched.
    expect(hullAdvisories(hull).filter((v) => /will foul/.test(v.message))).toEqual([]);
  });

  it("puts the internal volume in one section spanning the hull", () => {
    const { record } = migrateRecord(v1Hull());
    expect(record.fields.sections).toEqual([{ id: "core", x0: 0, x1: 220, allowed: [] }]);
  });

  it("keeps the deprecated v1 slots so the budget engine is untouched", () => {
    const { record } = migrateRecord(v1Hull());
    expect(record.fields.slots).toEqual(v1Hull().fields.slots);
  });

  it("is idempotent — migrating twice changes nothing the second time", () => {
    const once = migrateRecord(v1Hull());
    const twice = migrateRecord(once.record);
    expect(twice.changed).toBe(false);
    expect(twice.record).toBe(once.record); // same object, no pointless rewrite
  });

  it("does not mutate the record it was given", () => {
    const original = v1Hull();
    migrateRecord(original);
    expect(original.fields.spine).toBeUndefined();
  });

  it("copes with a hull that recorded no volume", () => {
    const bare = v1Hull();
    bare.fields = { length_m: 100, beam_m: 10 };
    const { record, notes } = migrateRecord(bare);
    const spine = record.fields.spine as Spine;
    expect(spine.length_m).toBe(100);
    expect(spine.stations[0]?.half_height_m).toBe(5); // falls back to the beam
    expect(notes.join(" ")).toMatch(/no volume was recorded/);
  });

  it("takes the section as circular when no beam was recorded", () => {
    const bare = v1Hull();
    bare.fields = { length_m: 100, volume_m3: 3141.592653589793 }; // πr²L with r =
    const { record } = migrateRecord(bare);
    const spine = record.fields.spine as Spine;
    expect(spine.stations[0]?.half_height_m).toBeCloseTo(Math.sqrt(3141.592653589793 / (Math.PI * 100)), 9);
    expect(grossVolume(spine)).toBeCloseTo(3141.592653589793, 6);
  });
});

describe("module v1 → v2", () => {
  const v1Module = (): TypedRecord => ({ ...v1Hull(), type: "module", fields: { category: "drive", slot: "drive", mass_t: 40, crew: 2 } });

  it("adds crew_basis defaulting to per_watch, and moves nothing", () => {
    const { record, changed } = migrateRecord(v1Module());
    expect(changed).toBe(true);
    expect(record.fields.crew_basis).toBe("per_watch");
    // Every v1 field is exactly where it was: the stats nesting lands with editor 3.
    expect(record.fields.mass_t).toBe(40);
    expect(record.fields.crew).toBe(2);
    expect(record.fields.category).toBe("drive");
  });

  it("leaves a module that already declares its basis alone", () => {
    const seeded = v1Module();
    seeded.fields.crew_basis = "total";
    const { record, changed } = migrateRecord(seeded);
    expect(changed).toBe(false);
    expect(record.fields.crew_basis).toBe("total");
  });
});

describe("migrateAll", () => {
  it("reports what changed and leaves everything else alone", () => {
    const records = [
      v1Hull(),
      { ...v1Hull(), id: "c1", type: "craft", fields: { kind: "ship" } } as TypedRecord,
      // A polity has no migration at all, and must come back untouched.
      { ...v1Hull(), id: "p1", type: "polity", fields: { kind: "nation" } } as TypedRecord,
    ];
    const { records: out, report } = migrateAll(records);
    expect(out).toHaveLength(3);
    expect(report.migrated.map((m) => m.type).sort()).toEqual(["craft", "hull"]);
    expect(report.unchanged).toBe(1);
  });

  it("knows which types it can migrate", () => {
    expect(MIGRATABLE_TYPES.sort()).toEqual(["craft", "hull", "module"]);
  });
});

describe("schema versions", () => {
  it("bumps hull, module and craft, and ships bus and style", () => {
    const byId = Object.fromEntries(BUILTIN_SCHEMAS.map((s) => [s.id, s]));
    // 3: slot facing/tilt/ring count and the hull's internal density (2026-09-23).
    // 4: slot subtype, for flight decks (2026-09-24).
    // 5 (and one more on every type below): the record document layer — a
    // handling code prefix and core required fields (UI redesign step 4, 2026-09-25).
    expect(byId.hull?.version).toBe(5);
    // Editor 2 added the six fields the ship kernel reads: standby draw,
    // radiator temperature, radiated power, and the three weapon-scale figures.
    expect(byId.module?.version).toBe(4);
    // Fittings, manifest, tanks, modes, watch factor and endurance.
    // 3: the watch bill's fields, which changed on 2026-09-20 without a bump.
    expect(byId.craft?.version).toBe(4);
    expect(byId.bus?.version).toBe(2);
    // radiator_aspect, ruled 2026-09-20: radiators stay taller than wide, and
    // how much taller is the kit's to set (`gallery/09` §1.3).
    expect(byId.style?.version).toBe(3);
  });

  it("gives every built-in an explicit version and a handling code prefix", () => {
    for (const s of BUILTIN_SCHEMAS) {
      expect(s.version, s.id).toBeGreaterThanOrEqual(2);
      expect(s.handling?.code_prefix, s.id).toMatch(/^[A-Z]+$/);
      for (const k of s.fields.required ?? []) expect(s.fields.properties?.[k], `${s.id}.${k}`).toBeDefined();
    }
  });

  it("backs up each previous schema once when the step-4 bump reaches an existing vault", async () => {
    const fs = new MemoryAdapter();
    const repo = new Repository(fs);
    await repo.init();
    // An older Gallery's copies: the versions before the document-layer bump.
    const before: Record<string, number> = { note: 0, polity: 2, hull: 4, craft: 3 };
    for (const [id, v] of Object.entries(before)) {
      const cur = JSON.parse(await fs.readText(`_schemas/${id}.schema.json`)) as Record<string, unknown>;
      const old = { ...cur, handling: undefined, ...(v ? { version: v } : {}) };
      if (!v) delete old.version;
      await fs.writeText(`_schemas/${id}.schema.json`, JSON.stringify(old));
    }
    await repo.registry.seed(fs);
    for (const [id, v] of Object.entries(before)) {
      expect(await fs.exists(`_schemas/${id}.schema.v${v || 1}.json`), id).toBe(true);
      const now = JSON.parse(await fs.readText(`_schemas/${id}.schema.json`)) as { version: number; handling?: unknown };
      expect(now.handling, id).toBeDefined();
    }
    // Seeding again writes nothing: no schema is left re-seeding on every open.
    expect(await repo.registry.seed(fs)).toBe(0);
  });

  it("backs up the step-4 polity when step 5 adds its affiliation", async () => {
    const fs = new MemoryAdapter();
    const repo = new Repository(fs);
    await repo.init();
    const cur = JSON.parse(await fs.readText("_schemas/polity.schema.json")) as { version: number; fields: { properties: Record<string, unknown> } };
    delete cur.fields.properties.affiliation;
    await fs.writeText("_schemas/polity.schema.json", JSON.stringify({ ...cur, version: 3 }));
    await repo.registry.seed(fs);
    expect(await fs.exists("_schemas/polity.schema.v3.json")).toBe(true);
    const now = JSON.parse(await fs.readText("_schemas/polity.schema.json")) as { version: number; fields: { properties: Record<string, { enum?: string[] }> } };
    expect(now.version).toBe(4);
    expect(now.fields.properties.affiliation?.enum).toEqual(["friend", "hostile", "neutral", "unknown"]);
  });

  it("upgrades an on-disk schema and keeps the old copy, per the existing mechanism", async () => {
    const fs = new MemoryAdapter();
    const repo = new Repository(fs);
    await repo.init(); // writes the current schemas
    // Pretend an older Gallery had written v1 hull, then re-seed.
    await fs.writeText("_schemas/hull.schema.json", JSON.stringify({ id: "hull", version: 1, title: "Hull", folder: "hulls", fields: { type: "object", properties: {} } }));
    await repo.registry.seed(fs);
    const upgraded = JSON.parse(await fs.readText("_schemas/hull.schema.json")) as { version: number };
    expect(upgraded.version).toBe(5);
    expect(await fs.exists("_schemas/hull.schema.v1.json")).toBe(true);
  });

  it("leaves a schema marked custom alone", async () => {
    const fs = new MemoryAdapter();
    const repo = new Repository(fs);
    await repo.init();
    await fs.writeText("_schemas/hull.schema.json", JSON.stringify({ id: "hull", version: 1, custom: true, title: "Mine", folder: "hulls", fields: { type: "object", properties: {} } }));
    await repo.registry.seed(fs);
    const kept = JSON.parse(await fs.readText("_schemas/hull.schema.json")) as { version: number; title: string };
    expect(kept.version).toBe(1);
    expect(kept.title).toBe("Mine");
  });
});

describe("regression gate (§9)", () => {
  it("every built-in preset still creates a record", async () => {
    const fs = new MemoryAdapter();
    const repo = new Repository(fs);
    await repo.init();
    await repo.load();

    const failures: string[] = [];
    for (const preset of BUILTIN_PRESETS) {
      try {
        const record = repo.create(preset.type, `Test ${preset.id}`, preset);
        if (!record.id || !record.type) failures.push(`${preset.type}/${preset.id}: no id or type`);
        // Migration must accept anything a preset produces.
        migrateRecord(record);
      } catch (err) {
        failures.push(`${preset.type}/${preset.id}: ${(err as Error).message}`);
      }
    }
    expect(failures).toEqual([]);

    // The gate's job is that nothing DISAPPEARS, and that every preset that was
    // baselined still carries the fields it had. Counting presets instead
    // failed on every legitimate addition, which trains people to edit the
    // baseline rather than read it.
    const present = new Map(BUILTIN_PRESETS.map((p) => [`${p.type}/${p.id}`, p]));
    const missing = Object.keys(baseline.presets).filter((k) => !present.has(k));
    expect(missing, "a baselined preset was removed or renamed").toEqual([]);

    const lostFields: string[] = [];
    for (const [key, fields] of Object.entries(baseline.presets as Record<string, string[]>)) {
      const record = repo.create(present.get(key)!.type, "T", present.get(key)!);
      for (const field of fields) if (!(field in record.fields)) lostFields.push(`${key}.${field}`);
    }
    expect(lostFields, "a preset lost a field it used to set").toEqual([]);
  });

  it("no preset lost a field in the bump", () => {
    const now = Object.fromEntries(BUILTIN_PRESETS.map((p) => [`${p.type}/${p.id}`, Object.keys(p.fields ?? {}).sort()]));
    const lost: string[] = [];
    for (const [key, fields] of Object.entries(baseline.presets)) {
      const current = now[key];
      if (!current) {
        lost.push(`${key}: preset is gone`);
        continue;
      }
      for (const f of fields) if (!current.includes(f)) lost.push(`${key}: lost field ${f}`);
    }
    expect(lost).toEqual([]);
  });

/**
 * What editor 2 deliberately changed, and why the rest must not move.
 *
 * The baseline was captured with the phase-1 engine. Editor 2 replaced it, so
 * two of its entries are expected to differ — and only two. Naming them here,
 * rather than re-capturing the fixture, keeps the gate comparing the code to a
 * record of what it used to do instead of to itself.
 *
 * - **`crew`** — the phase-1 engine summed module `crew` raw, which is the
 *   number of people **on station**, not the complement. Under the 2026-09-20
 *   ruling a warship stands three sections with two manned, so the complement
 *   is 3/2 of that and two thirds of the complement is on watch. The old figure
 *   comes back exactly as `crewOnWatch`, which is the useful check: the model
 *   did not move the number, it worked out which number it was.
 * - **`warnings`** — a flat string list became the `Violation` currency, and
 *   the slot-fit check moved from counting v1 slot *kinds* to named, positioned
 *   slots. The two substantive warnings must survive that move; the third was
 *   an artefact of counting kinds and has no successor.
 * - **`heatOut_MW`** — the phase-1 engine summed every module's waste heat,
 *   including the NSWR's. An open-cycle drive throws its heat out with the
 *   propellant and needs no radiator for it (`docs/UNITS.md` §5), so 250 MW of
 *   exhaust left the rejection budget. The ships did not get cooler; the figure
 *   stopped counting heat no array ever had to shed.
 *
 * Every other key is compared exactly, which is the whole point.
 */
const DELIBERATE = new Set(["crew", "warnings", "heatOut_MW"]);

/** Waste heat that an array actually has to reject, now the drive is excluded. */
const EXPECTED_HEAT: Record<string, number> = {
  "Sword-of-State-class": 245,
  "Sword-of-Justice-class leader": 245,
};

/**
 * Baselined warnings that must still be reported, in some form, by the new
 * kernel. The wording moved; the finding must not. "Radiator deficit 295.0 MW"
 * is now a high-temperature deficit of the same 295 MW, which is the number
 * that matters.
 */
const MUST_SURVIVE: Record<string, string[]> = {
  "Sword-of-State-class": ["exceeds tank capacity", "short by 45 MW"],
  "Sword-of-Justice-class leader": ["exceeds tank capacity", "short by 45 MW"],
};

/** The complement each craft now reports, under the watch bill. */
const EXPECTED_CREW: Record<string, number> = {
  "Sword-of-State-class": 35,
  "Sword-of-Justice-class leader": 35,
};

  it("every craft in the demo vault produces identical budget numbers", async () => {
    const fs = new MemoryAdapter();
    await demoVault(fs);
    const repo = new Repository(fs);
    await repo.load();

    const drift: string[] = [];
    const seen = new Set<string>();
    for (const lr of repo.ofType("craft")) {
      const craft = lr.record;
      if (isNote(craft)) continue;
      const expected = baseline.budgets[craft.name];
      // Craft added after the baseline was captured are not regressions; the
      // gate's job is that nothing baselined has *drifted* or disappeared.
      if (!expected) continue;
      seen.add(craft.name);
      const { budget, advisories } = analyseShip(craft, { typed: (id) => repo.typed(id), tables: repo.tables, values: repo.effectiveConstraints().values });
      const numbers = budget as unknown as Record<string, unknown>;
      for (const [key, want] of Object.entries(expected)) {
        if (DELIBERATE.has(key)) continue;
        const got = numbers[key];
        const same = Array.isArray(want) ? JSON.stringify(got) === JSON.stringify(want) : got === want;
        if (!same) drift.push(`${craft.name}.${key}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
      }
      // The deliberate changes, asserted rather than waved through.
      expect(budget.crew, `${craft.name} complement`).toBe(EXPECTED_CREW[craft.name]);
      // The baselined figure was the watch all along.
      expect(budget.crewOnWatch, `${craft.name} on watch`).toBe(expected.crew);
      // Both are whole people, so the ratio only lands on 2/3 exactly when the
      // complement divides by three. Assert the rule, not the rounded quotient.
      expect(budget.crewOnWatch, `${craft.name} manned fraction`).toBe(Math.round((budget.crew * 2) / 3));
      expect(budget.heatOut_MW, `${craft.name} rejectable heat`).toBe(EXPECTED_HEAT[craft.name]);
      const text = advisories.map((v) => v.message).join(" | ");
      for (const fragment of MUST_SURVIVE[craft.name] ?? []) {
        expect(text, `${craft.name}: "${fragment}" was reported before and must still be`).toContain(fragment);
      }
    }
    expect(drift).toEqual([]);
    expect([...seen].sort(), "a baselined craft has disappeared from the demo vault").toEqual(Object.keys(baseline.budgets).sort());
  });

  it("budgets are still identical after every record is migrated", async () => {
    const fs = new MemoryAdapter();
    await demoVault(fs);
    const repo = new Repository(fs);
    await repo.load();

    // Migrate everything in place, the way opening a vault on a new version would.
    const typed = repo.all().map((lr) => lr.record).filter((r): r is TypedRecord => !isNote(r));
    const { records: migrated } = migrateAll(typed);
    const byId = new Map(migrated.map((r) => [r.id, r]));

    const drift: string[] = [];
    for (const record of migrated) {
      if (record.type !== "craft") continue;
      const { budget } = analyseShip(record, { typed: (id) => byId.get(id), tables: repo.tables, values: repo.effectiveConstraints().values });
      const numbers = budget as unknown as Record<string, unknown>;
      const expected = baseline.budgets[record.name];
      if (!expected) continue;
      for (const [key, want] of Object.entries(expected)) {
        if (DELIBERATE.has(key)) continue;
        const got = numbers[key];
        const same = Array.isArray(want) ? JSON.stringify(got) === JSON.stringify(want) : got === want;
        if (!same) drift.push(`${record.name}.${key} after migration: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
      }
    }
    expect(drift).toEqual([]);
  });
});
