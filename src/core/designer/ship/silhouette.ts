/**
 * The ship's silhouette.
 *
 * Editor 2 never changes geometry, but it **does** change the drawing: a hull
 * is a set of empty slots, and a ship is what is bolted into them. So the
 * silhouette a ship renders is not the hull's — an unfitted slot draws nothing,
 * a fitted one draws the part the module calls for, and a 450 mm twin draws
 * bigger than a 300 mm single without either being hand-drawn.
 *
 * ## Three things decide what a slot draws, in order
 *
 * 1. **The slot's own `part` override**, if the hull carries one. That is how a
 *    captured or export hull keeps a foreign fitting, and the author's explicit
 *    choice outranks anything inferred.
 * 2. **The slot's type**, where it has an appearance of its own. Editor 1 typed
 *    that slot `comms` on purpose, and a ship filling it does not get to
 *    overrule the hull.
 * 3. **The fitted module's category**, which fills in the generic cases: a
 *    `sensor` in a slot typed merely `external` is a radar, not a nondescript
 *    box, and that is information only the ship has.
 *
 * Nothing here is stored. `docs/CLAUDE.md`: the hull SVG is generated from the
 * record at render time, never kept as an asset.
 */
import { familiesOf, partKindFor, partsForHull, type FittedWeapon, type PartFamilies, type WeaponFamily } from "../hull/parts";
import type { Appendage, ExternalSlot, HullGeometry } from "../hull/types";
import { readModule, type ModuleSpec } from "./module";
import type { ShipLoadout } from "./types";

/**
 * Module category → the part a fitted slot draws.
 *
 * Only categories with an *external* appearance appear here. A habitat or a
 * magazine is internal: it has a section, not a slot, and drawing a box for it
 * on the silhouette would assert a position the record does not have.
 */
const CATEGORY_PART: Record<string, string | undefined> = {
  radiator: "radiator",
  "weapon-kinetic": "turret",
  "weapon-laser": "turret",
  "weapon-particle": "turret",
  "weapon-missile": "turret",
  "point-defense": "pd",
  sensor: "radar",
  ew: "antenna",
  tank: "tank",
  drive: "thruster",
  docking: "dock",
};

/**
 * Module category → weapon family, for the families a category determines on
 * its own. `weapon-kinetic` covers a railgun, a rocket tube bundle and a
 * one-armed bandit, which do not look alike, so a module that is one of those
 * says so with `weapon_family`; `gun` is the honest default for the rest.
 */
const CATEGORY_WEAPON: Record<string, WeaponFamily | undefined> = {
  "weapon-kinetic": "gun",
  "weapon-laser": "laser",
  "weapon-particle": "particle",
  "weapon-missile": "cell",
  "point-defense": "ciws",
};

const WEAPON_FAMILIES: WeaponFamily[] = ["gun", "cell", "rocket", "arm", "laser", "plasma", "particle", "ciws"];

/** What the silhouette generator needs to know about the weapon in a slot. */
export function fittedWeapon(spec: ModuleSpec): FittedWeapon | undefined {
  const declared = spec.weapon_family && WEAPON_FAMILIES.includes(spec.weapon_family as WeaponFamily) ? (spec.weapon_family as WeaponFamily) : undefined;
  const weapon = declared ?? CATEGORY_WEAPON[spec.category];
  if (!weapon) return undefined;
  const fitted: FittedWeapon = { weapon };
  if (spec.bore_mm !== undefined && spec.bore_mm > 0) fitted.bore_mm = spec.bore_mm;
  if (spec.barrels !== undefined && spec.barrels > 0) fitted.barrels = spec.barrels;
  if (spec.launch_cells !== undefined && spec.launch_cells > 0) fitted.cells = spec.launch_cells;
  return fitted;
}

export interface ShipSilhouette {
  /** Parts to hand the renderer's `fitted` option. */
  parts: Appendage[];
  /** Hull slots with nothing in them — drawn as bare slot markers, not as parts. */
  emptySlots: string[];
}

export interface SilhouetteOptions {
  /** The polity's style kit fields, for the part families. */
  style?: Record<string, unknown>;
  /** Module record fields by id. */
  module?: (id: string) => Record<string, unknown> | undefined;
  /** Override the families the style kit gives, for a preview. */
  families?: PartFamilies;
}

/**
 * Every fitted slot on a ship, as a positioned part.
 *
 * Empty slots are filtered out rather than drawn with the hull's default part:
 * a destroyer with two of its six mounts fitted should look like a destroyer
 * with two mounts, which is the whole reason three loadout variants on one hull
 * read as three different ships.
 */
export function shipSilhouette(hull: HullGeometry, ship: ShipLoadout, options: SilhouetteOptions = {}): ShipSilhouette {
  const families = options.families ?? familiesOf(options.style);
  const bySlot = new Map<string, ModuleSpec | undefined>();
  // A drop tank occupies a slot as surely as a turret does, and has to appear.
  for (const t of ship.tanks) {
    if (!t.slot || bySlot.has(t.slot)) continue;
    const fields = t.module ? options.module?.(t.module) : undefined;
    bySlot.set(t.slot, fields ? readModule(fields) : undefined);
  }
  for (const f of ship.fittings) {
    const base = f.slot.includes("#") ? (f.slot.split("#")[0] as string) : f.slot;
    // First fitting wins on a doubled slot; the advisory kernel reports the
    // collision, and drawing both would just overprint.
    if (bySlot.has(base)) continue;
    const fields = f.module ? options.module?.(f.module) : undefined;
    bySlot.set(base, fields ? readModule(fields) : undefined);
  }

  const fitted: ExternalSlot[] = [];
  const emptySlots: string[] = [];
  for (const slot of hull.external_slots ?? []) {
    if (!bySlot.has(slot.id)) {
      emptySlots.push(slot.id);
      continue;
    }
    const spec = bySlot.get(slot.id);
    // The module's category only fills in where the slot type has no appearance
    // of its own — `external`, `pod`, `spinal`. Where editor 1 typed the slot
    // `comms` or `radiator`, that stands.
    const inferred = !slot.part && !partKindFor({ ...slot, part: undefined }) && spec ? CATEGORY_PART[spec.category] : undefined;
    fitted.push(inferred ? { ...slot, part: inferred } : { ...slot });
  }

  /**
   * Radiators drawn in proportion to what they reject.
   *
   * The scale is **relative to the largest array on this ship**, not to an
   * absolute area: a true area needs a working temperature and an emissivity,
   * and inventing either would put a made-up constant into a drawing. What can
   * be said without inventing anything is that a 12 MW loop next to a 120 MW
   * loop should look like a tenth of it — and since the part scales in both
   * dimensions, that means √(1/10) on the span.
   *
   * The biggest array keeps its slot's size class, so a ship with one radiator
   * draws exactly as it did before.
   */
  const scales: Record<string, number> = {};
  let peak = 0;
  for (const spec of bySlot.values()) if (spec?.category === "radiator") peak = Math.max(peak, spec.heat_reject_MW);
  if (peak > 0) {
    for (const [id, spec] of bySlot) {
      if (spec?.category !== "radiator" || !(spec.heat_reject_MW > 0)) continue;
      scales[id] = Math.sqrt(spec.heat_reject_MW / peak);
    }
  }

  const weapons: Record<string, FittedWeapon> = {};
  for (const [id, spec] of bySlot) {
    if (!spec) continue;
    const weapon = fittedWeapon(spec);
    if (weapon) weapons[id] = weapon;
  }

  const parts = partsForHull({ ...hull, external_slots: fitted }, { families, weapons, scales });
  return { parts, emptySlots };
}
