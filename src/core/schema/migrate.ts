/**
 * Record migration.
 *
 * The existing versioning mechanism (`Registry.seed`) upgrades **schema files**
 * — it backs the old one up as `<type>.schema.v<N>.json` and writes the new
 * built-in, unless the file says `"custom": true`. It has never touched record
 * files, so a schema bump that moves or renames a field silently orphans every
 * record built on the old shape. This module is the missing half.
 *
 * ## Shape detection, not a version stamp
 *
 * Records carry no schema version in their envelope, and adding one would
 * change the serialisation of every record in the vault for the benefit of a
 * migration that can detect the shape perfectly well on its own. So each
 * migration asks "is this the old shape?" and is **idempotent**: running it on
 * an already-migrated record is a no-op.
 *
 * ## Nothing is lost and nothing is invented
 *
 * A migration only ever adds or restructures. Where the new shape needs a
 * figure the old one never carried, the record is flagged `migration_review`
 * rather than given a plausible-looking guess — the hull profile below is the
 * case that matters, and it is synthesised to preserve the authored volume
 * exactly rather than to look like a ship.
 */
import type { TypedRecord } from "../types";

export interface MigrationResult {
  record: TypedRecord;
  changed: boolean;
  /** What was done, in the order it was done. Shown to the user, not swallowed. */
  notes: string[];
}

type Migration = (fields: Record<string, unknown>, notes: string[]) => boolean;

const isArray = (v: unknown): v is unknown[] => Array.isArray(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// ---------------------------------------------------------------------------
// hull v1 → v2
// ---------------------------------------------------------------------------

/**
 * v1 hulls carry `length_m`, `beam_m`, a single `volume_m3` and an abstract
 * `slots` list of `{kind, count, x%, y%}`. v2 wants a spine of stations, named
 * volumetric sections and positioned external slots.
 *
 * The profile is the honest problem: v1 never recorded one. Rather than invent
 * a silhouette, this synthesises the **constant section that reproduces the
 * authored volume exactly** — a plain barrel — and flags the record for review.
 * A wrong volume would propagate into every budget; a boring shape will not.
 *
 *   V = π · a · (beam/2) · L   ⟹   a = V / (π · (beam/2) · L)
 *
 * With no beam recorded, the section is taken as circular: a = √(V / (πL)).
 *
 * `slots` is **kept alongside** `external_slots`. The budget engine still reads
 * it, and the regression gate requires byte-identical budget numbers across the
 * migration; editor 2 moves the budget engine over and drops it then.
 */
const hullV1toV2: Migration = (f, notes) => {
  // Shape detection has to be about content, not the presence of a key.
  // `repo.create` fills schema defaults, so a hull built from a v1 preset under
  // the v2 schema arrives carrying `spine: { station_pitch_m: 3, datum: "bow" }`
  // — an object, but an empty one. Treating that as "already v2" left the v1
  // length, beam and volume unmigrated and the hull drew as nothing at all.
  const existing = isObject(f.spine) ? f.spine : undefined;
  const hasProfile = existing !== undefined && (num(existing.length_m) > 0 || (isArray(existing.stations) && existing.stations.length > 0));
  if (hasProfile) return false; // already v2

  const length = num(f.length_m);
  const beam = num(f.beam_m);
  const volume = num(f.volume_m3);

  let halfHeight = 0;
  if (length > 0 && volume > 0) {
    halfHeight = beam > 0 ? volume / (Math.PI * (beam / 2) * length) : Math.sqrt(volume / (Math.PI * length));
  } else if (beam > 0) {
    halfHeight = beam / 2;
  }

  f.spine = {
    // Keep anything the schema or the author already put there.
    ...existing,
    length_m: length,
    station_pitch_m: existing && num(existing.station_pitch_m) > 0 ? num(existing.station_pitch_m) : 3.0,
    datum: "bow",
    beam_m: beam > 0 ? beam : halfHeight * 2,
    stations: [
      { x: 0, half_height_m: halfHeight },
      { x: length, half_height_m: halfHeight },
    ],
  };
  notes.push(
    volume > 0
      ? `spine synthesised as a constant section reproducing the authored volume (${volume} m³) exactly; the real profile needs drawing`
      : "spine synthesised from length and beam; no volume was recorded",
  );

  if (!isArray(f.sections)) {
    f.sections = [{ id: "core", x0: 0, x1: length, allowed: [] }];
    notes.push("internal volume placed in a single `core` section spanning the hull");
  }

  if (!isArray(f.external_slots)) {
    const slots = isArray(f.slots) ? f.slots : [];
    const pitch = num((f.spine as Record<string, unknown>).station_pitch_m);
    const external: Record<string, unknown>[] = [];
    let internalSlots = 0;
    for (const raw of slots) {
      if (!isObject(raw)) continue;
      const kind = typeof raw.kind === "string" ? raw.kind : "external";
      const count = Math.max(1, Math.floor(num(raw.count) || 1));
      if (kind === "internal") {
        internalSlots += count;
        continue; // internal capacity is a section volume in v2, not a slot
      }
      const id = typeof raw.id === "string" ? raw.id : kind;
      // v1 x/y were silhouette percentages for drawing a whole *group*. x maps
      // to a station; y above the midline reads as dorsal, below as ventral.
      // A v1 x was a drawing percentage, not a survey, so it has no precision
      // to lose by landing on a frame. Leaving it unsnapped produced one "off
      // the station grid" advisory per slot on every migrated hull.
      const x = pitch > 0 ? Math.round(((num(raw.x) / 100) * length) / pitch) * pitch : (num(raw.x) / 100) * length;
      const y = num(raw.y);
      const base = y === 0 || y === 50 ? 0 : y < 50 ? 0 : 180;
      // v1 never recorded where the individual mounts of a group sat. Stacking
      // all six turrets on one spot asserts something definitely false and
      // makes every pair foul; fanning them about the angle the group was drawn
      // at asserts only that they are distinct, which is definitely true. The
      // record is flagged for review either way.
      const step = Math.min(30, 360 / count);
      for (let i = 0; i < count; i++) {
        const theta = count === 1 ? base : (((base + (i - (count - 1) / 2) * step) % 360) + 360) % 360;
        external.push({ id: count === 1 ? id : `${id}-${i + 1}`, x, theta_deg: Math.round(theta * 100) / 100, type: kind, size: "M" });
      }
    }
    f.external_slots = external;
    if (external.length) notes.push(`${external.length} external slot${external.length === 1 ? "" : "s"} placed from the v1 slot counts; positions are approximate`);
    if (internalSlots) notes.push(`${internalSlots} internal slot${internalSlots === 1 ? "" : "s"} became section volume rather than positioned slots`);
  }

  if (!isArray(f.armor_zones)) f.armor_zones = [];
  if (!isArray(f.appendages)) f.appendages = [];
  if (f.packing_efficiency === undefined) {
    f.packing_efficiency = 1;
    notes.push("packing efficiency left at 1 so the migrated volume is unchanged; set it once the profile is drawn");
  }
  f.migration_review = true;
  return true;
};

// ---------------------------------------------------------------------------
// module v1 → v2
// ---------------------------------------------------------------------------

/**
 * Additive only. v2 adds `bus_iface` (so editor 1 can warn when a module meets
 * a hull built to a different standard) and `crew_basis`.
 *
 * `crew_basis` records whether a module's `crew` figure is a per-watch station
 * count or a whole complement — see `docs/UNITS.md` §4. It defaults to
 * `per_watch`, which is what an author writing by hand means; the
 * NEBULOUS-seeded catalogue is `total` and is exempt from the watch multiplier.
 *
 * No field is moved or renamed here. The nested `stats` / `recipe` / `locks`
 * block from `gallery/05` §2.1 lands with editor 3, which is the first thing
 * that reads it.
 */
const moduleV1toV2: Migration = (f, notes) => {
  let changed = false;
  if (f.crew_basis === undefined) {
    f.crew_basis = "per_watch";
    notes.push("crew_basis defaulted to per_watch");
    changed = true;
  }
  return changed;
};

// ---------------------------------------------------------------------------
// craft v1 → v2
// ---------------------------------------------------------------------------

/**
 * The only thing a craft migration can honestly do.
 *
 * v2 splits the flat `loadout` into `fittings` (one module per *named hull
 * slot*) and `manifest` (volume in a *named section*). v1 recorded neither: its
 * `slot` was a kind — "turret", "internal" — and which of six turrets carried
 * the 450 mm gun was never written down. Converting would mean inventing a
 * placement for every line, and a wrong placement is worse than none: it draws
 * a silhouette that is not the ship and passes a fit check that means nothing.
 *
 * So the loadout is **left exactly as it is**. `ship/record.ts` reads it as
 * unplaced lines, which count in every budget total precisely as they did
 * before and are reported as waiting to be placed. Moving them onto real slots
 * needs the hull open in front of someone, which is the ship editor's job.
 *
 * What does migrate is the **watch bill**, because the crew model needs it and
 * the default is not one number: `gallery/05` §3 gives a rotating watch for
 * warships and none for stations and small craft, and only the record knows
 * which it is.
 *
 * RULED 2026-09-20: a warship stands **three sections with two manned** — one
 * asleep, two up — which puts two thirds of the complement on watch. An earlier
 * pass stored this as a single `watch_factor` of 3, which multiplied the
 * complement by three instead of by 3/2; that field is converted here.
 */
const CREWED_BILL: Record<string, { sections: number; manned: number }> = { ship: { sections: 3, manned: 2 } };
const NO_ROTATION = { sections: 1, manned: 1 };

const craftV1toV2: Migration = (f, notes) => {
  if (f.watch_sections !== undefined && f.watches_manned !== undefined) return false;
  const kind = typeof f.kind === "string" ? f.kind : "ship";
  const bill = CREWED_BILL[kind] ?? NO_ROTATION;
  const hadFactor = f.watch_factor !== undefined;
  f.watch_sections = bill.sections;
  f.watches_manned = bill.manned;
  delete f.watch_factor;
  notes.push(
    bill.sections > 1
      ? hadFactor
        ? `watch bill converted from a bare factor to ${bill.manned} of ${bill.sections} sections manned, so two thirds of the complement is on watch rather than one third (docs/UNITS.md §4)`
        : `watch bill set to ${bill.manned} of ${bill.sections} sections manned for a crewed warship; module crew figures marked per_watch are scaled by the ratio (docs/UNITS.md §4)`
      : `watch bill set to 1 of 1: a ${kind} stands no rotating watch`,
  );
  return true;
};

const MIGRATIONS: Record<string, Migration[]> = {
  hull: [hullV1toV2],
  module: [moduleV1toV2],
  craft: [craftV1toV2],
};

/** Types this module knows how to migrate. */
export const MIGRATABLE_TYPES = Object.keys(MIGRATIONS);

/**
 * Bring one record up to the current shape. Returns a new record when anything
 * changed and the original untouched when nothing did, so callers can skip a
 * pointless write.
 */
export function migrateRecord(record: TypedRecord): MigrationResult {
  const steps = MIGRATIONS[record.type];
  if (!steps) return { record, changed: false, notes: [] };

  const fields = structuredClone(record.fields ?? {}) as Record<string, unknown>;
  const notes: string[] = [];
  let changed = false;
  for (const step of steps) if (step(fields, notes)) changed = true;

  return changed ? { record: { ...record, fields }, changed: true, notes } : { record, changed: false, notes: [] };
}

export interface VaultMigrationReport {
  /** Records that changed, with what was done to each. */
  migrated: { id: string; name: string; type: string; notes: string[] }[];
  /** Records that were already current. */
  unchanged: number;
}

/**
 * Migrate a whole set of records. Pure: it returns the new records and a
 * report, and writes nothing — the caller decides whether to persist, so a dry
 * run costs nothing.
 */
export function migrateAll(records: TypedRecord[]): { records: TypedRecord[]; report: VaultMigrationReport } {
  const out: TypedRecord[] = [];
  const report: VaultMigrationReport = { migrated: [], unchanged: 0 };
  for (const record of records) {
    const result = migrateRecord(record);
    out.push(result.record);
    if (result.changed) report.migrated.push({ id: record.id, name: record.name, type: record.type, notes: result.notes });
    else report.unchanged++;
  }
  return { records: out, report };
}
