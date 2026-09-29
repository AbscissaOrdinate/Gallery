/**
 * Ship advisories — every check that needs a loadout.
 *
 * `hull/advisories.ts` judges a hull on its own, before anything is fitted to
 * it. This is the other half: does what the ship puts *into* the hull fit,
 * balance, power itself, cool itself and move?
 *
 * Same currency as everything else — `Violation`, with a domain and an anchor,
 * and nothing here blocks a save. An experimental craft that cannot cool itself
 * is still a craft; it just says so, loudly, in the thermal group.
 *
 * ## What is deliberately not checked, and why
 *
 * - **Berthing.** `gallery/05` §3 wants a shortfall against berthing capacity,
 *   but no module field supplies capacity and NEBULOUS has no berthing
 *   compartment at all (`docs/UNITS.md` §4). Inventing a bunks-per-module
 *   figure would make the check say something untrue, so it waits for editor 3.
 * - **Magazine stowage volume.** Round mass reached the budget on 2026-09-20
 *   (see `munitions.ts`), and the volume is computed alongside it — but which
 *   *section* holds the rounds is not in the record, so the volume is reported
 *   rather than charged against a section's budget.
 * - **Spinal length.** A spinal weapon's axial run has to fit the hull, but a
 *   module record carries no length, only a volume. Editor 3 adds it.
 */
import { halfHeightAt } from "../hull/geometry";
import type { BusStandard } from "../hull/advisories";
import { violation, type Violation } from "../violations";
import type { ShipBudget, ShipContext } from "./budget";
import { readModule, type ModuleSpec } from "./module";
import type { ShipLoadout } from "./types";

export interface ShipAdvisoryContext extends ShipContext {
  /** The yard standard the hull is built to, for the mount-interface check. */
  bus?: BusStandard;
}

/**
 * The module categories a section's `allowed` list can name.
 *
 * `gallery/05` §2.2 describes section `allowed` lists in **archetype**
 * vocabulary — `cic`, `magazine`, `weapon_support` — but no module record
 * carries an archetype, because archetypes are authored by editor 3. Until then
 * the only vocabulary both sides share is the module category, so a list
 * written in the other one is reported as such rather than failing every module
 * in the section.
 */
const MODULE_CATEGORIES = new Set([
  "drive",
  "reactor",
  "radiator",
  "tank",
  "weapon-kinetic",
  "weapon-laser",
  "weapon-particle",
  "weapon-missile",
  "point-defense",
  "sensor",
  "ew",
  "armor",
  "habitat",
  "cargo",
  "docking",
  "hangar",
  "other",
]);

const fmt = (n: number, d = 1) => n.toLocaleString(undefined, { maximumFractionDigits: d });
/** Slack for "over budget" in m³: floating-point noise is not an overflow. */
const EPS = 1e-6;

export function shipAdvisories(ship: ShipLoadout, budget: ShipBudget, ctx: ShipAdvisoryContext = {}): Violation[] {
  const specOf = (id: string | undefined): ModuleSpec | undefined => {
    if (!id) return undefined;
    const fields = ctx.module?.(id);
    return fields ? readModule(fields) : undefined;
  };
  if (!ship.hull) {
    return [
      violation("warn", "This craft names no hull, so it has no slots to fill, no sections to spend and no geometry to balance. Only the flat totals are meaningful.", {
        field: "hull",
        domain: "fit",
        source: "ship",
      }),
    ];
  }
  if (!ctx.hull) {
    return [
      violation("error", `Hull "${ship.hull}" is not in the vault. Every fit, volume and balance check is unavailable until it is.`, { field: "hull", domain: "fit", source: "ship" }),
    ];
  }
  return [
    ...fitAdvisories(ship, ctx, specOf),
    ...volumeAdvisories(budget),
    ...magazineAdvisories(ship, specOf),
    ...powerAdvisories(budget),
    ...thermalAdvisories(budget),
    ...propulsionAdvisories(ship, budget, specOf, ctx),
    ...balanceAdvisories(budget, ctx),
    ...crewAdvisories(ship),
  ];
}

// ---------------------------------------------------------------------------
// Fit
// ---------------------------------------------------------------------------

function fitAdvisories(ship: ShipLoadout, ctx: ShipAdvisoryContext, specOf: (id?: string) => ModuleSpec | undefined): Violation[] {
  const out: Violation[] = [];
  const src = "ship.fittings";
  const slots = new Map((ctx.hull?.external_slots ?? []).map((s) => [s.id, s]));
  const sections = new Map((ctx.hull?.sections ?? []).map((s) => [s.id, s]));
  const ifaces = ctx.bus?.mount_ifaces ?? [];

  const occupied = new Map<string, number>();
  for (const t of ship.tanks) if (t.slot) occupied.set(t.slot, (occupied.get(t.slot) ?? 0) + 1);
  for (const f of ship.fittings) {
    // `readShip` renames a duplicate to `slot#n`; the original is what the hull
    // knows, so the collision is reported against that.
    const base = f.slot.includes("#") ? (f.slot.split("#")[0] as string) : f.slot;
    occupied.set(base, (occupied.get(base) ?? 0) + 1);
    const slot = slots.get(base);
    if (!slot) {
      out.push(
        violation("error", `Fitting on slot "${base}", which this hull does not have. It contributes mass and power but is not drawn and not placed.`, {
          field: "fittings",
          domain: "fit",
          source: src,
          anchor: { componentId: f.slot },
        }),
      );
      continue;
    }
    const spec = specOf(f.module);
    if (!spec) continue;
    // A module declares the slot *kind* it is built for. `external` is the
    // wildcard both sides use for "some fitting goes here".
    if (spec.slot !== slot.type && spec.slot !== "external" && slot.type !== "external") {
      out.push(
        violation("warn", `Slot "${slot.id}" is a ${slot.type} mount but carries a module built for a ${spec.slot} slot.`, {
          field: "fittings",
          domain: "fit",
          source: src,
          anchor: { componentId: slot.id, station: slot.x },
        }),
      );
    }
    if (spec.bus_iface && ifaces.length && !ifaces.includes(spec.bus_iface)) {
      out.push(
        violation("warn", `The module on "${slot.id}" is built to the ${spec.bus_iface} interface, which this hull's bus does not list (${ifaces.join(", ")}). It needs an adapter.`, {
          field: "fittings",
          domain: "fit",
          source: src,
          anchor: { componentId: slot.id, station: slot.x },
        }),
      );
    }
  }
  for (const [id, count] of occupied) {
    if (count > 1) {
      const slot = slots.get(id);
      out.push(
        violation("error", `${count} fittings are assigned to slot "${id}". A slot carries one.`, {
          field: "fittings",
          domain: "fit",
          source: src,
          anchor: { componentId: id, ...(slot ? { station: slot.x } : {}) },
        }),
      );
    }
  }

  for (const m of ship.manifest) {
    if (!m.section) {
      out.push(
        violation("warn", `"${m.id}" is in the manifest but in no section, so it spends no volume budget.`, {
          field: "manifest",
          domain: "fit",
          source: "ship.manifest",
          anchor: { componentId: m.id },
        }),
      );
      continue;
    }
    const section = sections.get(m.section);
    if (!section) {
      out.push(
        violation("error", `"${m.id}" is assigned to section "${m.section}", which this hull does not have.`, {
          field: "manifest",
          domain: "fit",
          source: "ship.manifest",
          anchor: { componentId: m.id },
        }),
      );
      continue;
    }
    const spec = specOf(m.module);
    if (!spec) continue;
    const speaksCategories = section.allowed?.some((a) => MODULE_CATEGORIES.has(a)) ?? false;
    if (section.allowed?.length && speaksCategories && !section.allowed.includes(spec.category)) {
      out.push(
        violation("warn", `Section "${section.id}" allows ${section.allowed.join(", ")}; "${m.id}" is a ${spec.category}.`, {
          field: "manifest",
          domain: "fit",
          source: "ship.manifest",
          anchor: { componentId: m.id, station: (section.x0 + section.x1) / 2 },
        }),
      );
    }
    if (spec.category === "habitat" && section.pressurised !== true) {
      out.push(
        violation("warn", `"${m.id}" is a habitat in section "${section.id}", which is not marked pressurised.`, {
          field: "manifest",
          domain: "fit",
          source: "ship.manifest",
          anchor: { componentId: m.id, station: (section.x0 + section.x1) / 2 },
        }),
      );
    }
    if (!(spec.volume_m3 > 0)) {
      out.push(
        violation("info", `"${m.id}" declares no volume, so it spends none of section "${section.id}"'s budget. The fit check cannot see it.`, {
          field: "manifest",
          domain: "fit",
          source: "ship.manifest",
          anchor: { componentId: m.id },
        }),
      );
    }
  }

  // One note per section whose allowed list is in the other vocabulary, rather
  // than one per module in it.
  for (const section of sections.values()) {
    if (!section.allowed?.length || section.allowed.some((a) => MODULE_CATEGORIES.has(a))) continue;
    if (!ship.manifest.some((m) => m.section === section.id)) continue;
    out.push(
      violation("info", `Section "${section.id}" lists ${section.allowed.join(", ")}, none of which is a module category, so nothing in it can be checked against the list. Archetypes arrive with the module editor.`, {
        field: "sections",
        domain: "fit",
        source: "ship.manifest",
        anchor: { componentId: section.id },
      }),
    );
  }

  for (const t of ship.tanks) {
    if (t.count_authored !== undefined) {
      out.push(
        violation("warn", `Tank "${t.id}" asks for ${fmt(t.count_authored, 0)} tanks at one collar; eight is as many as will go round, so the rest need a collar of their own at another station.`, {
          field: "tanks",
          domain: "fit",
          source: "ship.tanks",
          anchor: { componentId: t.id },
        }),
      );
    }
    if (t.slot && !slots.has(t.slot)) {
      out.push(
        violation("error", `Drop tank "${t.id}" hangs on slot "${t.slot}", which this hull does not have.`, {
          field: "tanks",
          domain: "fit",
          source: "ship.tanks",
          anchor: { componentId: t.id },
        }),
      );
    }
    if (t.section && !sections.has(t.section)) {
      out.push(
        violation("error", `Tank "${t.id}" is in section "${t.section}", which this hull does not have.`, {
          field: "tanks",
          domain: "fit",
          source: "ship.tanks",
          anchor: { componentId: t.id },
        }),
      );
    }
    const spec = specOf(t.module);
    if (spec && spec.volume_m3 > 0 && t.volume_m3 > spec.volume_m3 * t.count + EPS) {
      out.push(
        violation("error", `Tank "${t.id}" is loaded with ${fmt(t.volume_m3)} m³ but its tankage holds ${fmt(spec.volume_m3 * t.count)} m³${t.count > 1 ? ` across ${fmt(t.count, 0)} tanks` : ""}.`, {
          field: "tanks",
          domain: "fit",
          source: "ship.tanks",
          anchor: { componentId: t.id },
        }),
      );
    }
  }

  if (ship.unplaced.length) {
    const units = ship.unplaced.reduce((sum, u) => sum + u.count, 0);
    out.push(
      violation("info", `${ship.unplaced.length} loadout ${ship.unplaced.length === 1 ? "line" : "lines"} (${units} modules) carried over from the v1 shape are not placed on a slot or in a section. They count in every total but are not drawn and not checked for fit.`, {
        field: "loadout",
        domain: "fit",
        source: "ship.loadout",
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

function volumeAdvisories(budget: ShipBudget): Violation[] {
  const out: Violation[] = [];
  for (const s of budget.sections) {
    if (s.over_m3 > EPS) {
      out.push(
        violation("error", `Section "${s.id}" holds ${fmt(s.used_m3)} m³ against a usable ${fmt(s.usable_m3)} m³ — over by ${fmt(s.over_m3)} m³.`, {
          field: "manifest",
          domain: "fit",
          source: "ship.volume",
          anchor: { componentId: s.id },
        }),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Magazines
// ---------------------------------------------------------------------------

function magazineAdvisories(ship: ShipLoadout, specOf: (id?: string) => ModuleSpec | undefined): Violation[] {
  const out: Violation[] = [];
  for (const f of ship.fittings) {
    if (!f.magazine?.length) continue;
    const rounds = f.magazine.reduce((sum, m) => sum + m.rounds, 0);
    const spec = specOf(f.module);
    if (!spec) continue;
    if (!(spec.magazine > 0)) {
      out.push(
        violation("info", `"${f.slot}" is loaded with ${rounds} rounds, but its module declares no magazine capacity, so there is nothing to check them against.`, {
          field: "fittings",
          domain: "fit",
          source: "ship.magazine",
          anchor: { componentId: f.slot },
        }),
      );
      continue;
    }
    if (rounds > spec.magazine) {
      out.push(
        violation("warn", `"${f.slot}" is loaded with ${rounds} rounds against a magazine of ${fmt(spec.magazine, 0)}.`, {
          field: "fittings",
          domain: "fit",
          source: "ship.magazine",
          anchor: { componentId: f.slot },
        }),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Power
// ---------------------------------------------------------------------------

/** `gallery/05` §3: a deficit is an error; a sustained surplus under 5% is a warn. */
const THIN_MARGIN = 0.05;

function powerAdvisories(budget: ShipBudget): Violation[] {
  const out: Violation[] = [];
  for (const mode of budget.modes) {
    if (mode.powerIn_MW <= 0) continue;
    if (mode.powerMargin_MW < 0) {
      out.push(
        violation("error", `${mode.name}: ${fmt(mode.powerIn_MW)} MW drawn against ${fmt(mode.powerOut_MW)} MW generated — short by ${fmt(-mode.powerMargin_MW)} MW.`, {
          field: "modes",
          domain: "power",
          mode: mode.id,
          source: "ship.power",
        }),
      );
    } else if (mode.powerOut_MW > 0 && mode.powerMargin_MW / mode.powerOut_MW < THIN_MARGIN) {
      out.push(
        violation("warn", `${mode.name}: only ${fmt(mode.powerMargin_MW)} MW of power margin, under 5% of generation. Nothing can be switched on.`, {
          field: "modes",
          domain: "power",
          mode: mode.id,
          source: "ship.power",
        }),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Thermal
// ---------------------------------------------------------------------------

/**
 * Heat, in two regimes, never summed (`docs/UNITS.md` §5).
 *
 * A ship with 500 MW of 1,200 K reactor radiators and nothing at 300 K cannot
 * cool its habitat, and a single total would show it comfortably in the black.
 * That is the failure this split exists to catch.
 */
function thermalAdvisories(budget: ShipBudget): Violation[] {
  const out: Violation[] = [];
  const label = { low: "low-temperature (life support, electronics)", high: "high-temperature (reactor, drive, weapons)" } as const;
  for (const mode of budget.modes) {
    for (const band of ["low", "high"] as const) {
      const load = band === "low" ? mode.heatLow_MW : mode.heatHigh_MW;
      const margin = band === "low" ? mode.marginLow_MW : mode.marginHigh_MW;
      if (load <= 0) continue;
      if (margin < 0) {
        out.push(
          violation("error", `${mode.name}: ${fmt(load)} MW of ${label[band]} heat with only ${fmt(load + margin)} MW of rejection for it — short by ${fmt(-margin)} MW.`, {
            field: "modes",
            domain: "thermal",
            mode: mode.id,
            source: "ship.thermal",
          }),
        );
      }
    }
    if (mode.rejectUnclassed_MW > 0 && mode.heatOut_MW > 0) {
      out.push(
        violation("info", `${mode.name}: ${fmt(mode.rejectUnclassed_MW)} MW of rejection comes from radiators that declare no \`reject_temp_k\`, so it is counted against whichever array needs it. Give them a working temperature to separate the arrays properly.`, {
          field: "modes",
          domain: "thermal",
          mode: mode.id,
          source: "ship.thermal",
        }),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Propulsion
// ---------------------------------------------------------------------------

function propulsionAdvisories(ship: ShipLoadout, budget: ShipBudget, specOf: (id?: string) => ModuleSpec | undefined, ctx: ShipAdvisoryContext): Violation[] {
  const out: Violation[] = [];
  const src = "ship.propulsion";

  if (budget.thrust_kN === 0 && ship.kind !== "station" && budget.lines.length) {
    out.push(violation("warn", "No drive module, so this craft has no thrust and no Δv.", { field: "manifest", domain: "deltav", source: src }));
  }

  // Attitude thrusters at one end of the centre of gravity and none at the
  // other cannot make a couple: they shove the ship sideways as much as they
  // turn it.
  const rcs = budget.attitude;
  if (rcs && rcs.torque_kNm <= 0 && rcs.forward + rcs.aft > 0) {
    const end = rcs.forward > 0 ? "forward of" : "aft of";
    out.push(
      violation("warn", `Every attitude thruster is ${end} the centre of gravity, so firing them translates the ship as much as it turns it. A couple needs thrusters at both ends.`, {
        field: "fittings",
        domain: "structure",
        source: src,
      }),
    );
  }
  if (budget.propellantCapacity_t > 0 && budget.propellant_t > budget.propellantCapacity_t) {
    out.push(
      violation("warn", `Propellant ${fmt(budget.propellant_t, 0)} t exceeds tank capacity ${fmt(budget.propellantCapacity_t, 0)} t.`, { field: "propellant_t", domain: "deltav", source: src }),
    );
  }

  // A drive burning something no tank carries is an error (`gallery/05` §3).
  // Matching is by the propellant row id; a drive naming a propellant in prose
  // rather than by row id cannot be matched, and says so once rather than
  // accusing every tank.
  const carried = new Set(ship.tanks.map((t) => t.propellant).filter((p): p is string => !!p));
  if (carried.size) {
    const unmatched = new Set<string>();
    const unnameable = new Set<string>();
    for (const line of budget.lines) {
      const spec = line.spec;
      if (!spec || spec.thrust_kN <= 0 || !spec.propellant) continue;
      if (carried.has(spec.propellant)) continue;
      // Only a drive whose propellant *is* a table row can be said to disagree
      // with a tank. One that names its propellant in prose — "uranium
      // tetrabromide brine (20% enriched)" — is not carrying the wrong fuel,
      // it is written in a vocabulary the tanks do not speak, and calling that
      // an error would mark every honestly-described drive in the vault wrong.
      const known = ctx.tables?.lookup("propellants", spec.propellant, "density_kg_m3");
      if (known && !("error" in known)) unmatched.add(spec.propellant);
      else unnameable.add(spec.propellant);
    }
    for (const p of unmatched) {
      out.push(
        violation("error", `A drive burns "${p}", which no tank on this ship carries (${[...carried].join(", ")}).`, { field: "tanks", domain: "deltav", source: src }),
      );
    }
    for (const p of unnameable) {
      out.push(
        violation("info", `A drive names its propellant as "${p}", which is not a row in \`_tables/propellants.yaml\`, so it cannot be matched against the tanks.`, {
          field: "tanks",
          domain: "deltav",
          source: src,
        }),
      );
    }
  }

  // Jettison order should be a sequence. A gap is not wrong, but a duplicate
  // order shared by tanks in different sections usually means one was meant to
  // go later.
  for (const t of ship.tanks) {
    if (t.jettison_order > 0 && t.volume_m3 <= 0) {
      out.push(
        violation("info", `Drop tank "${t.id}" is empty, so it is jettisoned without having contributed any Δv.`, { field: "tanks", domain: "deltav", source: src, anchor: { componentId: t.id } }),
      );
    }
    const spec = specOf(t.module);
    if (t.module && !spec) continue;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

/**
 * A thrust line that misses the centre of gravity torques the ship on every
 * burn, and the drive has to vector to aim through it.
 *
 * Two checks, because they need different things:
 *
 * - **The gimbal check** needs to know how far the drive can vector, which is a
 *   design figure no table in the vault supplies. So it runs only when a
 *   constraint set gives `max_gimbal_deg`; otherwise the required angle sits in
 *   the budget's `assumptions` and nothing is asserted. This is the same
 *   discipline as `automation_factor` and `kg_per_crew_day`: a missing figure
 *   makes a check unavailable, never invented.
 * - **The geometric backstop** needs no figure at all: when the arm exceeds the
 *   hull's own half-height at the drive, no gimbal *inside the hull* could
 *   reach it, whatever its range.
 */
function balanceAdvisories(budget: ShipBudget, ctx: ShipAdvisoryContext): Violation[] {
  if (!ctx.hull || budget.thrustOffset_m <= 0 || budget.thrust_kN <= 0) return [];
  const drive = budget.lines.find((l) => !l.attitude && (l.spec?.thrust_kN ?? 0) > 0 && l.x !== undefined);
  const station = drive?.x ?? ctx.hull.spine.length_m;
  const limit = halfHeightAt(ctx.hull.spine, station);
  const anchor = { station };

  if (limit > 0 && budget.thrustOffset_m > limit) {
    return [
      violation("warn", `The centre of gravity sits ${fmt(budget.thrustOffset_m, 2)} m off the thrust line, more than the hull's ${fmt(limit, 2)} m half-height at the drive. No gimbal inside the hull can trim that out.`, {
        field: "fittings",
        domain: "mass",
        source: "ship.balance",
        anchor,
      }),
    ];
  }
  const max = ctx.params?.max_gimbal_deg;
  if (max !== undefined && budget.gimbalRequired_deg > max) {
    return [
      violation("warn", `The drive needs ${fmt(budget.gimbalRequired_deg)}° of gimbal to aim through the centre of gravity, ${fmt(budget.thrustOffset_m, 2)} m off the thrust line, against the ${fmt(max)}° this design era allows.`, {
        field: "fittings",
        domain: "mass",
        source: "ship.balance",
        anchor,
      }),
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Crew
// ---------------------------------------------------------------------------

function crewAdvisories(ship: ShipLoadout): Violation[] {
  const out: Violation[] = [];
  const authored = ship.watch_authored;
  if (authored) {
    out.push(
      violation("warn", `A watch bill of ${fmt(authored.manned)} manned out of ${fmt(authored.sections)} sections is not a rotation that can be stood; it has been read as ${fmt(ship.watches_manned)} of ${fmt(ship.watch_sections)}.`, {
        field: "watch_sections",
        domain: "doctrine",
        source: "ship.crew",
      }),
    );
  }
  // Every section manned at once is a statement about the ship rather than a
  // mistake — a drone or a fully-automated station stands no rotating watch —
  // but it is worth saying out loud, because it means nobody is ever asleep.
  if (ship.watch_sections > 1 && ship.watch_sections === ship.watches_manned) {
    out.push(
      violation("info", `All ${fmt(ship.watch_sections)} watch sections are manned at once, so the whole complement is on station and none of it is off watch.`, {
        field: "watches_manned",
        domain: "doctrine",
        source: "ship.crew",
      }),
    );
  }
  if (ship.crew_override > 0) {
    out.push(
      violation("info", `Complement is overridden at ${fmt(ship.crew_override, 0)}; the roll-up from the modules is ignored.`, { field: "crew_override", domain: "doctrine", source: "ship.crew" }),
    );
  }
  return out;
}
