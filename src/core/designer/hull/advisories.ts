/**
 * Hull advisories — every geometric check editor 1 can make from the hull
 * record alone, before any loadout exists.
 *
 * All of these are advisory. `docs/CLAUDE.md`: nothing is ever blocked from
 * saving. A captured hull, an export variant or a deliberately strange design
 * has to save with a banner, never a refusal — so this module returns a list
 * and never throws.
 *
 * Editors 2–5 add checks that need a loadout (power, heat, Δv, fit of actual
 * modules). Those belong in the same kernel and the same `Violation` currency;
 * they are not here because the hull record does not carry the inputs yet.
 *
 * Severity is used consistently:
 *   error — the record cannot be drawn or measured correctly as written
 *   warn  — it draws, but a downstream budget will be wrong or a rule is broken
 *   info  — worth seeing, not wrong
 */
import { violation, type Violation } from "../violations";
import type { HullGeometry, ShadowCone } from "./types";
import { beamAt, halfHeightAt, hullMetrics, placeAppendages, sectionVolumes, sectionShadowing, sortedStations } from "./geometry";
import { familiesOf, partKindFor } from "./parts";

/** The polity style kit's proportion and doctrine rules (`gallery/06` §3.2). */
export interface StyleKit {
  id?: string;
  construction?: "truss" | "monocoque" | "mixed";
  ld_ratio_min?: number;
  ld_ratio_max?: number;
  max_beam_m?: number;
  doctrine_armour?: string;
  crewed?: boolean;
  /** The part families this polity builds to. See `parts.ts`. */
  part_radiator?: string;
  part_turret?: string;
  part_tank?: string;
  part_thruster?: string;
  part_antenna?: string;
}

/** The yard's shared dimensions (`gallery/06` §3.1). */
export interface BusStandard {
  id?: string;
  core_diameter_m?: number;
  station_pitch_m?: number;
  mount_ifaces?: string[];
}

export interface AdvisoryContext {
  style?: StyleKit;
  bus?: BusStandard;
  /** The reactor shield cone, when the hull declares one. */
  shadowCone?: ShadowCone;
  /** Snap grid; defaults to the spine's own pitch, then to 3 m (`docs/UNITS.md` §4). */
  stationPitch_m?: number;
}

const fmt = (n: number, d = 1) => n.toLocaleString(undefined, { maximumFractionDigits: d });
/** Floating-point slack for "on the grid" and "inside the hull" tests, in metres. */
const EPS = 1e-6;

/**
 * Every hull check, in one pass. Order is not significant; callers sort.
 *
 * A hull with no length makes every other check complain about something being
 * "off the hull", so the root cause is reported alone. Eight advisories from
 * one mistake is how an advisory pane gets ignored.
 */
export function hullAdvisories(hull: HullGeometry, ctx: AdvisoryContext = {}): Violation[] {
  const spine = spineAdvisories(hull);
  if (!(hull.spine.length_m > 0)) return spine;
  return [
    ...spine,
    ...sectionAdvisories(hull),
    ...slotAdvisories(hull, ctx),
    ...appendageAdvisories(hull),
    ...radiationAdvisories(hull, ctx),
    ...styleAdvisories(hull, ctx),
  ];
}

// ---------------------------------------------------------------------------
// Spine
// ---------------------------------------------------------------------------

function spineAdvisories(hull: HullGeometry): Violation[] {
  const out: Violation[] = [];
  const { spine } = hull;
  const length = spine.length_m ?? 0;
  const src = "hull.spine";

  if (!(length > 0)) {
    out.push(violation("error", "The hull has no length, so nothing can be placed on it or measured from it.", { field: "spine.length_m", domain: "geometry", source: src }));
    return out; // Every other spine check is meaningless without a length.
  }
  const stations = sortedStations(spine);
  if (stations.length < 2) {
    out.push(
      violation("error", `A profile needs at least two stations; this one has ${stations.length}. The hull renders as a slab of constant section.`, {
        field: "spine.stations",
        domain: "geometry",
        source: src,
      }),
    );
  }
  for (const s of stations) {
    if (s.x < -EPS || s.x > length + EPS) {
      out.push(
        violation("warn", `Station at ${fmt(s.x)} m lies outside the ${fmt(length)} m hull and is ignored beyond the ends.`, {
          field: "spine.stations",
          domain: "geometry",
          source: src,
          anchor: { station: s.x },
        }),
      );
    }
    if (s.half_height_m < 0) {
      out.push(
        violation("error", `Station at ${fmt(s.x)} m has a negative half-height, which inverts the profile there.`, {
          field: "spine.stations",
          domain: "geometry",
          source: src,
          anchor: { station: s.x },
        }),
      );
    }
  }
  // Two stations at one x is a deliberate vertical step — a bulkhead, a collar,
  // the flat face of a tank — and the geometry measures it as one. Three or
  // more is ambiguous: only the outermost pair can be drawn.
  const seen = new Map<number, number>();
  for (const s of stations) seen.set(s.x, (seen.get(s.x) ?? 0) + 1);
  for (const [x, n] of seen) {
    if (n > 2) {
      out.push(
        violation("warn", `${n} stations share x = ${fmt(x)} m. A step uses two; the ones between them are not drawn and not measured.`, {
          field: "spine.stations",
          domain: "geometry",
          source: src,
          anchor: { station: x },
        }),
      );
    }
  }
  if (!(spine.beam_m > 0)) {
    out.push(
      violation("error", "The hull has no beam, so its cross-section has no area and every internal volume is zero.", {
        field: "spine.beam_m",
        domain: "geometry",
        source: src,
      }),
    );
  }
  for (const o of spine.beam_overrides ?? []) {
    if (o.x < -EPS || o.x > length + EPS) {
      out.push(
        violation("warn", `Beam override at ${fmt(o.x)} m lies outside the hull.`, { field: "spine.beam_overrides", domain: "geometry", source: src, anchor: { station: o.x } }),
      );
    }
  }

  // A pointed bow with a constant beam renders as a blade: wider than it is
  // tall at the tip. That is what the data says and the geometry is right for
  // it, so this is information, not a fault — but it is almost never intended.
  // The beam AT the bow, not the nominal beam: a hull that already carries a
  // taper via beam_overrides was still being told to add one.
  const bow = halfHeightAt(spine, 0, "fore");
  const bowBeam = beamAt(spine, 0, "fore");
  if (bowBeam > 0 && bow > 0 && bowBeam / 2 > bow * 4) {
    out.push(
      violation("info", `At the bow the hull is ${fmt(bowBeam / 2 / bow)}× wider than it is tall. Add a beam override near the bow to taper the beam with the profile.`, {
        field: "spine.beam_overrides",
        domain: "geometry",
        source: src,
        anchor: { station: 0 },
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function sectionAdvisories(hull: HullGeometry): Violation[] {
  const out: Violation[] = [];
  const length = hull.spine.length_m ?? 0;
  const sections = hull.sections ?? [];
  const volumes = new Map(sectionVolumes(hull).map((s) => [s.id, s]));
  const src = "hull.sections";

  for (const s of sections) {
    const [lo, hi] = [Math.min(s.x0, s.x1), Math.max(s.x0, s.x1)];
    if (s.x1 <= s.x0) {
      out.push(
        violation("error", `Section “${s.id}” runs from ${fmt(s.x0)} m to ${fmt(s.x1)} m and encloses no volume.`, {
          field: "sections",
          domain: "fit",
          source: src,
          anchor: { station: s.x0, componentId: s.id },
        }),
      );
    }
    if (lo < -EPS || hi > length + EPS) {
      out.push(
        violation("warn", `Section “${s.id}” extends past the ${fmt(length)} m hull; the volume outside is not counted.`, {
          field: "sections",
          domain: "fit",
          source: src,
          anchor: { station: hi, componentId: s.id },
        }),
      );
    }
    const v = volumes.get(s.id);
    if (v && s.x1 > s.x0 && v.usable_m3 < 1) {
      out.push(
        violation("warn", `Section “${s.id}” has only ${fmt(v.usable_m3, 2)} m³ usable. Nothing meaningful fits.`, {
          field: "sections",
          domain: "fit",
          source: src,
          anchor: { station: (s.x0 + s.x1) / 2, componentId: s.id },
        }),
      );
    }
  }

  // Overlaps: two sections claiming the same metre both spend it.
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = sections[i]!;
      const b = sections[j]!;
      const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      if (overlap > EPS) {
        out.push(
          violation("error", `Sections “${a.id}” and “${b.id}” overlap over ${fmt(overlap)} m. That volume is budgeted twice.`, {
            field: "sections",
            domain: "fit",
            source: src,
            anchor: { station: Math.max(a.x0, b.x0), componentId: a.id },
          }),
        );
      }
    }
  }

  // Gaps: unclaimed hull volume is legal but is usually an oversight.
  if (sections.length > 0 && length > 0) {
    const claimed = [...sections].map((s) => [Math.max(0, Math.min(s.x0, s.x1)), Math.min(length, Math.max(s.x0, s.x1))] as [number, number]).sort((p, q) => p[0] - q[0]);
    let cursor = 0;
    const gaps: [number, number][] = [];
    for (const [a, b] of claimed) {
      if (a > cursor + EPS) gaps.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < length - EPS) gaps.push([cursor, length]);
    const unclaimed = gaps.reduce((sum, [a, b]) => sum + (b - a), 0);
    if (unclaimed > length * 0.05) {
      out.push(
        violation("info", `${fmt((unclaimed / length) * 100, 0)}% of the hull (${fmt(unclaimed)} m) is not in any section, so its volume is not available to anything.`, {
          field: "sections",
          domain: "fit",
          source: src,
          anchor: { station: gaps[0]?.[0] },
        }),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// External slots
// ---------------------------------------------------------------------------

/** Clock angles this close together at the same station are the same place on the hull. */
const SLOT_CLEAR_DEG = 15;

function slotAdvisories(hull: HullGeometry, ctx: AdvisoryContext): Violation[] {
  const out: Violation[] = [];
  const length = hull.spine.length_m ?? 0;
  const slots = hull.external_slots ?? [];
  const pitch = ctx.stationPitch_m ?? hull.spine.station_pitch_m ?? ctx.bus?.station_pitch_m ?? 3;
  const src = "hull.external_slots";

  const ids = new Set<string>();
  for (const s of slots) {
    if (ids.has(s.id)) {
      out.push(violation("error", `Two external slots share the id “${s.id}”. A loadout cannot tell them apart.`, { field: "external_slots", domain: "fit", source: src, anchor: { componentId: s.id } }));
    }
    ids.add(s.id);

    if (s.x < -EPS || s.x > length + EPS) {
      out.push(
        violation("error", `Slot “${s.id}” sits at ${fmt(s.x)} m, off the ${fmt(length)} m hull.`, { field: "external_slots", domain: "fit", source: src, anchor: { station: s.x, componentId: s.id } }),
      );
    }
    if (pitch > 0) {
      const off = Math.abs(s.x / pitch - Math.round(s.x / pitch)) * pitch;
      if (off > 1e-3) {
        out.push(
          violation("info", `Slot “${s.id}” is ${fmt(off, 2)} m off the ${fmt(pitch)} m station grid, so it does not land on a frame.`, {
            field: "external_slots",
            domain: "structure",
            source: src,
            anchor: { station: s.x, componentId: s.id },
          }),
        );
      }
    }
  }

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]!;
      const b = slots[j]!;
      if (Math.abs(a.x - b.x) > EPS) continue;
      // Shortest way round the clock: 0 deg and 180 deg are 180 apart, not 0.
      const raw = Math.abs(a.theta_deg - b.theta_deg) % 360;
      const gap = raw > 180 ? 360 - raw : raw;
      if (gap < SLOT_CLEAR_DEG) {
        out.push(
          violation("warn", `Slots “${a.id}” and “${b.id}” are ${fmt(gap, 0)}° apart at station ${fmt(a.x)} m. Anything mounted in both will foul.`, {
            field: "external_slots",
            domain: "fit",
            source: src,
            anchor: { station: a.x, componentId: a.id },
          }),
        );
      }
    }
  }

  // A hull built to a bus should offer that bus's mount interfaces.
  const ifaces = ctx.bus?.mount_ifaces;
  if (ifaces && ifaces.length > 0) {
    const types = new Set(slots.map((s) => s.type));
    const missing = ifaces.filter((i) => !types.has(i));
    if (missing.length > 0) {
      out.push(
        violation("info", `The ${ctx.bus?.id ?? "bus"} standard defines ${missing.join(", ")} interfaces this hull has no slot for.`, {
          field: "external_slots",
          domain: "fit",
          source: "hull.bus",
        }),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Appendages
// ---------------------------------------------------------------------------

function appendageAdvisories(hull: HullGeometry): Violation[] {
  const out: Violation[] = [];
  const length = hull.spine.length_m ?? 0;
  const src = "hull.appendages";

  for (const a of hull.appendages ?? []) {
    if (a.station < -EPS || a.station > length + EPS) {
      out.push(
        violation("error", `Appendage “${a.id}” attaches at ${fmt(a.station)} m, off the hull.`, { field: "appendages", domain: "fit", source: src, anchor: { station: a.station, componentId: a.id } }),
      );
      continue;
    }
    const profile = halfHeightAt(hull.spine, a.station);
    if (a.attach_r !== undefined && a.attach_r < profile - EPS) {
      out.push(
        violation("warn", `Appendage “${a.id}” attaches ${fmt(profile - a.attach_r)} m inside the hull surface at station ${fmt(a.station)} m.`, {
          field: "appendages",
          domain: "fit",
          source: src,
          anchor: { station: a.station, componentId: a.id },
        }),
      );
    }
    if ((a.outline?.length ?? 0) < 3) {
      out.push(
        violation("error", `Appendage “${a.id}” has ${a.outline?.length ?? 0} outline points and cannot be drawn.`, {
          field: "appendages",
          domain: "geometry",
          source: src,
          anchor: { station: a.station, componentId: a.id },
        }),
      );
    }
    // An unmirrored appendage puts its mass off the thrust axis, which shows up
    // as a torque the RCS has to hold against for the whole burn.
    if (a.mirror === "none") {
      out.push(
        violation("info", `Appendage “${a.id}” is not mirrored, so its mass sits off the thrust axis.`, {
          field: "appendages",
          domain: "mass",
          source: src,
          anchor: { station: a.station, componentId: a.id },
        }),
      );
    }
  }

  // Appendages that reach further out than the hull is long read as a mistake
  // in units far more often than as a design.
  for (const p of placeAppendages(hull).filter((p) => !p.mirrored)) {
    const reach = Math.max(...p.outline.map(([, y]) => Math.abs(y)), 0);
    if (length > 0 && reach > length) {
      const station = (hull.appendages ?? []).find((a) => a.id === p.id)?.station;
      out.push(
        violation("warn", `Appendage “${p.id}” reaches ${fmt(reach)} m from the axis, more than the hull's own ${fmt(length)} m length. Check the outline's units.`, {
          field: "appendages",
          domain: "structure",
          source: src,
          anchor: { station, componentId: p.id },
        }),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Radiation shadow
// ---------------------------------------------------------------------------

function radiationAdvisories(hull: HullGeometry, ctx: AdvisoryContext): Violation[] {
  const cone = ctx.shadowCone;
  if (!cone) return [];
  const out: Violation[] = [];
  for (const s of sectionShadowing(hull, cone)) {
    const section = (hull.sections ?? []).find((x) => x.id === s.id);
    if (!section?.pressurised) continue;
    if (!s.exposed) continue;
    const exposed = (1 - s.covered) * 100;
    out.push(
      violation(exposed > 50 ? "error" : "warn", `Pressurised section “${s.id}” is ${fmt(exposed, 0)}% outside the shield cone from the reactor at ${fmt(cone.x)} m.`, {
        field: "sections",
        domain: "radiation",
        source: "hull.shadow_cone",
        anchor: { station: section ? (section.x0 + section.x1) / 2 : cone.x, componentId: s.id },
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Style kit
// ---------------------------------------------------------------------------

/**
 * Conformance against the polity's kit. Every one of these is `info` or `warn`
 * and never `error`: a captured hull, an export model or a prototype is
 * *supposed* to be able to break the house style (`gallery/06` §3.2).
 */
function styleAdvisories(hull: HullGeometry, ctx: AdvisoryContext): Violation[] {
  const style = ctx.style;
  if (!style) return [];
  const out: Violation[] = [];
  const m = hullMetrics(hull);
  const src = "hull.style";
  const kit = style.id ? `the ${style.id} kit` : "the style kit";

  if (style.ld_ratio_min !== undefined && m.length_over_diameter < style.ld_ratio_min) {
    out.push(
      violation("warn", `Slenderness ${fmt(m.length_over_diameter, 2)} is below ${kit}'s minimum of ${fmt(style.ld_ratio_min, 2)} — the hull reads stubbier than the rest of the fleet.`, {
        field: "spine",
        domain: "style",
        source: src,
      }),
    );
  }
  if (style.ld_ratio_max !== undefined && m.length_over_diameter > style.ld_ratio_max) {
    out.push(
      violation("warn", `Slenderness ${fmt(m.length_over_diameter, 2)} exceeds ${kit}'s maximum of ${fmt(style.ld_ratio_max, 2)}.`, { field: "spine", domain: "style", source: src }),
    );
  }
  if (style.max_beam_m !== undefined && hull.spine.beam_m > style.max_beam_m) {
    out.push(
      violation("warn", `Beam ${fmt(hull.spine.beam_m)} m exceeds ${kit}'s ${fmt(style.max_beam_m)} m maximum, so the hull will not fit the yard's slips.`, {
        field: "spine.beam_m",
        domain: "style",
        source: src,
      }),
    );
  }
  // A slot that overrides its part is off-kit by construction. That is allowed
  // — a captured hull or an export model is supposed to be able to — so this
  // is a deviation to list and offer to conform, never a refusal.
  for (const slot of hull.external_slots ?? []) {
    if (!slot.part) continue;
    const fitted = partKindFor(slot);
    const standard = partKindFor({ ...slot, part: undefined });
    if (fitted === standard) continue;
    out.push(
      violation("info", `Slot “${slot.id}” carries a ${fitted ?? "nothing"} where ${kit} fits a ${standard ?? "nothing"}.`, {
        field: "external_slots",
        domain: "style",
        source: src,
        anchor: { station: slot.x, componentId: slot.id },
      }),
    );
  }
  if (style.crewed === false && (hull.sections ?? []).some((s) => s.pressurised)) {
    out.push(violation("info", `${kit} builds uncrewed hulls, but this one has pressurised sections.`, { field: "sections", domain: "doctrine", source: src }));
  }
  return out;
}
