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
import { computeBudget } from "../src/core/designer/budgets";
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
    const records = [v1Hull(), { ...v1Hull(), id: "h2", type: "craft" } as TypedRecord];
    const { records: out, report } = migrateAll(records);
    expect(out).toHaveLength(2);
    expect(report.migrated).toHaveLength(1);
    expect(report.migrated[0]?.type).toBe("hull");
    expect(report.unchanged).toBe(1); // craft has no migration yet
  });

  it("knows which types it can migrate", () => {
    expect(MIGRATABLE_TYPES.sort()).toEqual(["hull", "module"]);
  });
});

describe("schema versions", () => {
  it("bumps hull and module, and ships bus and style", () => {
    const byId = Object.fromEntries(BUILTIN_SCHEMAS.map((s) => [s.id, s]));
    expect(byId.hull?.version).toBe(2);
    expect(byId.module?.version).toBe(2);
    expect(byId.bus?.version).toBe(1);
    expect(byId.style?.version).toBe(1);
  });

  it("upgrades an on-disk schema and keeps the old copy, per the existing mechanism", async () => {
    const fs = new MemoryAdapter();
    const repo = new Repository(fs);
    await repo.init(); // writes v2 schemas
    // Pretend an older Gallery had written v1 hull, then re-seed.
    await fs.writeText("_schemas/hull.schema.json", JSON.stringify({ id: "hull", version: 1, title: "Hull", folder: "hulls", fields: { type: "object", properties: {} } }));
    await repo.registry.seed(fs);
    const upgraded = JSON.parse(await fs.readText("_schemas/hull.schema.json")) as { version: number };
    expect(upgraded.version).toBe(2);
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

  it("every craft in the demo vault produces identical budget numbers", async () => {
    const fs = new MemoryAdapter();
    await demoVault(fs);
    const repo = new Repository(fs);
    await repo.load();

    const drift: string[] = [];
    for (const lr of repo.ofType("craft")) {
      const craft = lr.record;
      if (isNote(craft)) continue;
      const hull = typeof craft.fields.hull === "string" ? repo.typed(craft.fields.hull) : undefined;
      const budget = computeBudget(craft, hull, (id) => repo.typed(id)) as unknown as Record<string, unknown>;
      const expected = baseline.budgets[craft.name];
      expect(expected, `${craft.name} is missing from the baseline`).toBeDefined();
      if (!expected) continue;
      for (const [key, want] of Object.entries(expected)) {
        const got = budget[key];
        const same = Array.isArray(want) ? JSON.stringify(got) === JSON.stringify(want) : got === want;
        if (!same) drift.push(`${craft.name}.${key}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
      }
    }
    expect(drift).toEqual([]);
    expect(repo.ofType("craft")).toHaveLength(Object.keys(baseline.budgets).length);
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
      const hull = typeof record.fields.hull === "string" ? byId.get(record.fields.hull) : undefined;
      const budget = computeBudget(record, hull, (id) => byId.get(id)) as unknown as Record<string, unknown>;
      const expected = baseline.budgets[record.name];
      if (!expected) continue;
      for (const [key, want] of Object.entries(expected)) {
        const got = budget[key];
        const same = Array.isArray(want) ? JSON.stringify(got) === JSON.stringify(want) : got === want;
        if (!same) drift.push(`${record.name}.${key} after migration: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
      }
    }
    expect(drift).toEqual([]);
  });
});
