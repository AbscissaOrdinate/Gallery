/**
 * Craft record ↔ ship loadout.
 *
 * The same contract as `hull/record.ts`: a coercion layer that makes "nothing
 * is ever blocked from saving" true. A craft hand-edited in YAML, half-migrated
 * or typed into mid-thought has to budget, not throw. It does not repair the
 * record — the stored fields stay exactly as authored until the user changes
 * them.
 */
import type { Duty, Fitting, Magazine, ManifestEntry, OperatingMode, ShipLoadout, TankEntry, UnplacedLine } from "./types";

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;
}
function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const id = (v: unknown, prefix: string, i: number): string => str(v).trim() || `${prefix}-${i + 1}`;

/** A ref field is a record id, or absent. Blank strings are absent, not ids. */
function ref(v: unknown): string | undefined {
  const s = str(v).trim();
  return s || undefined;
}

function readMagazine(v: unknown): Magazine[] {
  return list(v)
    .map((raw) => {
      const m = obj(raw);
      const munition = str(m.munition).trim();
      return munition ? { munition, rounds: Math.max(0, Math.round(num(m.rounds))) } : undefined;
    })
    .filter((m): m is Magazine => m !== undefined);
}

/**
 * Duties are authored as words or as a fraction. Anything else is dropped
 * rather than coerced: a typo that silently became `full` would quietly change
 * a power budget.
 */
function readDuty(v: unknown): Duty | undefined {
  if (v === "off" || v === "standby" || v === "full") return v;
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.min(1, Math.max(0, n));
}

export function readShip(fields: Record<string, unknown>): ShipLoadout {
  const fittings: Fitting[] = [];
  const seenSlots = new Set<string>();
  for (const [i, raw] of list(fields.fittings).entries()) {
    const f = obj(raw);
    const slot = str(f.slot).trim() || `slot-${i + 1}`;
    // Two fittings on one slot is an advisory, not a silent merge — but the
    // *view* needs distinct keys, so the duplicate keeps a distinguishable id
    // and the advisory kernel reports the collision from the raw record.
    const key = seenSlots.has(slot) ? `${slot}#${i + 1}` : slot;
    seenSlots.add(slot);
    const fitting: Fitting = { slot: key };
    const module = ref(f.module);
    if (module) fitting.module = module;
    const magazine = readMagazine(f.magazine);
    if (magazine.length) fitting.magazine = magazine;
    const note = str(f.note).trim();
    if (note) fitting.note = note;
    fittings.push(fitting);
  }

  const manifest: ManifestEntry[] = list(fields.manifest).map((raw, i) => {
    const m = obj(raw);
    const entry: ManifestEntry = { id: id(m.id, "item", i), count: Math.max(1, Math.floor(num(m.count, 1)) || 1) };
    const section = ref(m.section);
    if (section) entry.section = section;
    const module = ref(m.module);
    if (module) entry.module = module;
    return entry;
  });

  // v1's flat loadout. Read whenever it is present: the migrator deliberately
  // leaves it alone rather than inventing placements, so this is the only path
  // by which a pre-v2 craft keeps its budget.
  const unplaced: UnplacedLine[] = list(fields.loadout)
    .map((raw, i) => {
      const l = obj(raw);
      const module = ref(l.module);
      if (!module) return undefined;
      const line: UnplacedLine = { id: id(l.id, "line", i), module, count: Math.max(1, Math.floor(num(l.count, 1)) || 1) };
      const slotType = ref(l.slot);
      if (slotType) line.slot_type = slotType;
      return line;
    })
    .filter((l): l is UnplacedLine => l !== undefined);

  const tanks: TankEntry[] = list(fields.tanks).map((raw, i) => {
    const t = obj(raw);
    const tank: TankEntry = { id: id(t.id, "tank", i), volume_m3: Math.max(0, num(t.volume_m3)), jettison_order: Math.max(0, Math.floor(num(t.jettison_order))) };
    const slot = ref(t.slot);
    if (slot) tank.slot = slot;
    // A tank is in a section or on a slot. A record naming both is taking the
    // volume out of the hull *and* hanging it outside, so the slot wins and the
    // advisory kernel says so.
    const section = slot ? undefined : ref(t.section);
    if (section) tank.section = section;
    const module = ref(t.module);
    if (module) tank.module = module;
    const propellant = ref(t.propellant);
    if (propellant) tank.propellant = propellant;
    return tank;
  });

  const modes: OperatingMode[] = list(fields.modes).map((raw, i) => {
    const m = obj(raw);
    // Authored as a list of `{component, duty}` so the schema can describe it
    // and a form can render it. A hand-written mapping is read too, because
    // that is what someone editing the YAML directly will reach for.
    const duties: Record<string, Duty> = {};
    for (const entry of list(m.duties)) {
      const d = obj(entry);
      const component = str(d.component).trim();
      const duty = readDuty(d.duty);
      if (component && duty !== undefined) duties[component] = duty;
    }
    for (const [k, v] of Object.entries(obj(m.duties))) {
      const duty = readDuty(v);
      if (duty !== undefined) duties[k] = duty;
    }
    const mode: OperatingMode = { id: id(m.id, "mode", i), name: str(m.name).trim() || id(m.id, "Mode", i), duties };
    const note = str(m.note).trim();
    if (note) mode.note = note;
    return mode;
  });

  // A watch factor outside 1–3 is out of the range the model is defined over
  // (`gallery/05` §3). Clamping keeps the complement finite; the advisory
  // kernel reports the authored value.
  const watch = num(fields.watch_factor, 0);
  const ship: ShipLoadout = {
    kind: str(fields.kind, "ship"),
    fittings,
    manifest,
    unplaced,
    tanks,
    modes,
    watch_factor: watch > 0 ? Math.min(3, watch) : 1,
    endurance_days: Math.max(0, num(fields.endurance_days)),
    crew_override: Math.max(0, num(fields.crew_override)),
    propellant_t: Math.max(0, num(fields.propellant_t)),
  };
  const hull = ref(fields.hull);
  if (hull) ship.hull = hull;
  if (fields.watch_factor !== undefined && watch !== ship.watch_factor) ship.watch_factor_authored = watch;
  return ship;
}

/**
 * Write a loadout back into a fields object, preserving every key it does not
 * own. A ship must not drop a field the hull editor or a later editor added.
 */
export function writeShip(fields: Record<string, unknown>, ship: ShipLoadout): Record<string, unknown> {
  const out: Record<string, unknown> = { ...fields };
  const put = (key: string, value: unknown[]) => {
    if (value.length) out[key] = value;
    else delete out[key];
  };
  put(
    "fittings",
    ship.fittings.map((f) => ({
      slot: f.slot,
      ...(f.module ? { module: f.module } : {}),
      ...(f.magazine?.length ? { magazine: f.magazine.map((m) => ({ munition: m.munition, rounds: m.rounds })) } : {}),
      ...(f.note ? { note: f.note } : {}),
    })),
  );
  put(
    "manifest",
    ship.manifest.map((m) => ({ id: m.id, ...(m.section ? { section: m.section } : {}), ...(m.module ? { module: m.module } : {}), count: m.count })),
  );
  put(
    "tanks",
    ship.tanks.map((t) => ({
      id: t.id,
      ...(t.slot ? { slot: t.slot } : {}),
      ...(t.section ? { section: t.section } : {}),
      ...(t.module ? { module: t.module } : {}),
      ...(t.propellant ? { propellant: t.propellant } : {}),
      volume_m3: t.volume_m3,
      jettison_order: t.jettison_order,
    })),
  );
  put(
    "modes",
    ship.modes.map((m) => ({
      id: m.id,
      name: m.name,
      duties: Object.entries(m.duties).map(([component, duty]) => ({ component, duty })),
      ...(m.note ? { note: m.note } : {}),
    })),
  );
  out.watch_factor = ship.watch_factor;
  if (ship.endurance_days > 0) out.endurance_days = ship.endurance_days;
  if (ship.hull) out.hull = ship.hull;
  return out;
}

/** Every component id a mode can carry a duty for, in display order. */
export function componentIds(ship: ShipLoadout): string[] {
  return [...ship.fittings.map((f) => f.slot), ...ship.manifest.map((m) => m.id), ...ship.unplaced.map((u) => u.id), ...ship.tanks.map((t) => t.id)];
}
