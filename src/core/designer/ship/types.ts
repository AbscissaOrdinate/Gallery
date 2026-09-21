/**
 * Ship record shape (craft schema v2) — what a ship *puts into* a hull.
 *
 * Editor 1 authored the frozen contract: the spine, the sections, the external
 * slot inventory. A ship never changes any of it. What a ship owns is the
 * filling — which module sits in which slot, what the internal manifest spends
 * each section's volume on, how the tanks are loaded, what the magazines hold,
 * and how the whole thing is run in each operating mode.
 *
 * ## Why `fittings` and `manifest` rather than one `loadout`
 *
 * v1's `loadout` was a flat list of `{module, count, slot}` where `slot` was a
 * *kind* ("turret"), not a place. That cannot say which of six turrets carries
 * the 450 mm gun, so it cannot draw a silhouette and it cannot check a fit.
 * The two halves of `gallery/05` §2.5 are genuinely different — external
 * fittings are placed at a slot and consume no internal volume, internal
 * components are volume against a section budget and have no position beyond
 * the section — so they are two lists, not one list with a discriminator.
 *
 * ## Ids
 *
 * A fitting is identified by the hull slot it occupies: a slot holds one
 * fitting, so the slot id is the natural key and every advisory anchor,
 * silhouette part and mode duty already speaks in slot ids. Manifest entries
 * and tanks carry their own ids because a section holds many.
 */

/** One module in one external hull slot. */
export interface Fitting {
  /** The hull's `external_slots[].id`. The fitting's identity. */
  slot: string;
  /** Module record id. */
  module?: string;
  /** What this launcher or gun is loaded with. Counts only; see `Magazine`. */
  magazine?: Magazine[];
  /** Author's note, e.g. why a foreign fitting is here. */
  note?: string;
}

/**
 * A munition mix entry.
 *
 * **Rounds only — no mass and no volume.** `_tables/munitions.yaml` carries
 * calibre, velocity, penetration and a damage index, but no mass per round and
 * no round volume, and §0 forbids inventing either. So a magazine is checked
 * against the launcher's declared `magazine` round capacity and contributes
 * nothing to the mass budget. When a mass per round is sourced this becomes a
 * mass line without any other change.
 */
export interface Magazine {
  /** `_tables/munitions.yaml` row id. */
  munition: string;
  rounds: number;
}

/** One internal component, spending a section's volume budget. */
export interface ManifestEntry {
  id: string;
  /** The hull's `sections[].id`. */
  section?: string;
  module?: string;
  count: number;
}

/**
 * A propellant load.
 *
 * `module` supplies the tankage's own dry mass and capacity — per
 * `_tables/propellants.yaml`'s `tank_note`, tankage mass is a property of the
 * tank, not of what is in it, and cryogenic hydrogen is the case that proves
 * it. `propellant` picks the row whose density turns volume into mass.
 */
export interface TankEntry {
  id: string;
  /** Section the tank sits in, for the volume budget. Integral tanks only. */
  section?: string;
  /**
   * External slot the tank hangs on, for a drop tank. `gallery/05` §3 makes
   * drop tanks external modules, and an external module consumes no internal
   * volume — so a tank names a section *or* a slot, never both, and one on a
   * slot spends no section budget.
   */
  slot?: string;
  /** Tank module: its `mass_t` is the dry tankage, its `volume_m3` the capacity. */
  module?: string;
  /** `_tables/propellants.yaml` row id. */
  propellant?: string;
  /**
   * Tanks at this collar, 1–8.
   *
   * A single heavy tank bolted to the dorsal centreline has to be ballasted
   * against; a **collar** of them spaced evenly about the axis balances itself.
   * So a count above one is treated as radially symmetric: its mass sits on the
   * thrust line, and the silhouette draws the ring rather than one barrel. Eight
   * is the practical limit at one collar — past that the next lot go on another
   * station.
   */
  count: number;
  /** The count as authored, when it was above what one collar takes and had to be cut down. */
  count_authored?: number;
  /** Propellant volume carried, for the collar as a whole rather than per tank. */
  volume_m3: number;
  /**
   * Drop order. 0 is integral and never jettisoned; 1 is dropped first, then 2,
   * and so on (`gallery/05` §3).
   */
  jettison_order: number;
}

/**
 * What a component is doing in a mode (`gallery/05` §3.5.1).
 *
 * `standby` is only meaningful for a module that declares `power_standby_MW`;
 * for one that does not it is the same as `off`, and the budget says so rather
 * than inventing a standby draw.
 */
export type Duty = "off" | "standby" | "full" | number;

export interface OperatingMode {
  id: string;
  name: string;
  /** Component id (slot id, manifest id or tank id) → duty. Unnamed means `full`. */
  duties: Record<string, Duty>;
  note?: string;
}

/**
 * A v1 `loadout` line that has not been placed yet.
 *
 * v1 recorded `{module, count, slot}` where `slot` was a *kind* — "turret",
 * "internal" — not a place. Which of six turrets carries the 450 mm gun was
 * never written down, so the migrator cannot know it and will not guess: the
 * lines are carried forward whole, contribute to every budget total exactly as
 * they did before, and consume no section volume and no hull slot until
 * someone places them. One advisory says how many are waiting.
 */
export interface UnplacedLine {
  id: string;
  module?: string;
  count: number;
  /** The v1 slot *kind*, which narrows the slots it could be placed on. */
  slot_type?: string;
}

export interface ShipLoadout {
  hull?: string;
  kind: string;
  fittings: Fitting[];
  manifest: ManifestEntry[];
  unplaced: UnplacedLine[];
  tanks: TankEntry[];
  modes: OperatingMode[];
  /**
   * Watch sections the crew divides into, and how many are on station at once.
   *
   * RULED 2026-09-20: **the number on watch is two thirds of the complement.**
   * Three sections with two manned — one section asleep, the other two up —
   * which is what "only one of the watches is off for sleep" means. The two
   * numbers are stored rather than the ratio because that is how a watch bill
   * is actually written, and because 3-and-2 says something 1.5 does not.
   *
   * A station or a small craft stands no rotating watch: 1 and 1.
   *
   *   complement   = Σ total-basis + Σ per-watch-basis × sections / manned
   *   on watch now = complement × manned / sections
   */
  watch_sections: number;
  watches_manned: number;
  /**
   * The watch figures as authored, when they were out of range and had to be
   * clamped. The reader clamps so the complement stays finite; it keeps the
   * originals here so the advisory kernel can report what was actually
   * written, rather than silently correcting it.
   */
  watch_authored?: { sections: number; manned: number };
  /** Days of consumables carried. Needs `kg_per_crew_day` to become a mass. */
  endurance_days: number;
  /** Explicit complement, overriding the roll-up. */
  crew_override: number;
  /**
   * v1's bare propellant mass, with no tank and no propellant type. Read only
   * when `tanks` is empty, so a record that has been given tanks is never
   * double-counted.
   */
  propellant_t: number;
}
