/**
 * Hull record ↔ geometry.
 *
 * `record.fields` already has the shape of a `HullGeometry`, so this is mostly
 * a coercion layer — but it is the layer that makes `docs/CLAUDE.md`'s "nothing
 * is ever blocked from saving" true in the editor. A hull hand-edited in YAML,
 * half-migrated, or typed into by someone mid-thought has to *draw*, not throw:
 * a station whose `x` is the string "40" is worth 40, a `sections` key holding a
 * mapping instead of a list is worth an empty list, and `NaN` is worth nothing
 * at all rather than a chain of NaNs through every downstream budget.
 *
 * What this deliberately does not do is repair the record. It returns a clean
 * view for drawing and measuring; the stored fields stay exactly as authored
 * until the user changes them, so opening a hull never silently rewrites it.
 */
import type { Appendage, ArmorZone, BeamOverride, ExternalSlot, HullGeometry, HullSection, Spine, Station } from "./types";

/** A finite number, or `fallback` — the one guard that keeps NaN out of every budget. */
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

/**
 * Ids have to be unique for a loadout to reference them and for React to key on
 * them. A blank or duplicate id is reported by the advisory kernel, not fixed
 * here — but the *view* still needs something to key on, so a positional
 * fallback is supplied without touching the record.
 */
function idAt(v: unknown, prefix: string, i: number): string {
  const id = str(v).trim();
  return id || `${prefix}-${i + 1}`;
}

export function readSpine(fields: Record<string, unknown>): Spine {
  const s = obj(fields.spine);
  const stations: Station[] = list(s.stations).map((raw) => {
    const st = obj(raw);
    return { x: num(st.x), half_height_m: num(st.half_height_m) };
  });
  const overrides: BeamOverride[] = list(s.beam_overrides).map((raw) => {
    const o = obj(raw);
    return { x: num(o.x), beam_m: num(o.beam_m) };
  });
  return {
    length_m: num(s.length_m),
    beam_m: num(s.beam_m),
    station_pitch_m: s.station_pitch_m === undefined ? undefined : num(s.station_pitch_m, 3),
    datum: "bow",
    stations,
    ...(overrides.length ? { beam_overrides: overrides } : {}),
  };
}

/** The drawable, measurable view of a hull record. Never throws. */
export function readHull(fields: Record<string, unknown>): HullGeometry {
  const sections: HullSection[] = list(fields.sections).map((raw, i) => {
    const s = obj(raw);
    const section: HullSection = { id: idAt(s.id, "section", i), x0: num(s.x0), x1: num(s.x1) };
    const allowed = list(s.allowed).map((a) => str(a)).filter(Boolean);
    if (allowed.length) section.allowed = allowed;
    if (s.pressurised === true) section.pressurised = true;
    return section;
  });

  const external_slots: ExternalSlot[] = list(fields.external_slots).map((raw, i) => {
    const s = obj(raw);
    return {
      id: idAt(s.id, "slot", i),
      x: num(s.x),
      theta_deg: num(s.theta_deg),
      type: str(s.type, "external"),
      size: typeof s.size === "number" ? s.size : str(s.size, "M"),
    };
  });

  const armor_zones: ArmorZone[] = list(fields.armor_zones).map((raw, i) => {
    const z = obj(raw);
    const zone: ArmorZone = { id: idAt(z.id, "zone", i), x0: num(z.x0), x1: num(z.x1) };
    if (z.material !== undefined) zone.material = str(z.material);
    if (z.thickness_cm !== undefined) zone.thickness_cm = num(z.thickness_cm);
    return zone;
  });

  const appendages: Appendage[] = list(fields.appendages).map((raw, i) => {
    const a = obj(raw);
    // An outline point is a two-element list; anything else is dropped rather
    // than drawn at the origin, which would put a spike through the hull.
    const outline = list(a.outline)
      .map((p) => (Array.isArray(p) && p.length >= 2 ? ([num(p[0]), num(p[1])] as [number, number]) : null))
      .filter((p): p is [number, number] => p !== null);
    const app: Appendage = { id: idAt(a.id, "appendage", i), kind: str(a.kind, "greeble"), station: num(a.station), outline };
    if (a.attach_r !== undefined && Number.isFinite(num(a.attach_r, NaN))) app.attach_r = num(a.attach_r);
    if (a.mirror === "none" || a.mirror === "vertical") app.mirror = a.mirror;
    if (a.part !== undefined) app.part = str(a.part);
    return app;
  });

  const hull: HullGeometry = { spine: readSpine(fields) };
  if (sections.length) hull.sections = sections;
  if (external_slots.length) hull.external_slots = external_slots;
  if (armor_zones.length) hull.armor_zones = armor_zones;
  if (appendages.length) hull.appendages = appendages;

  // Packing efficiency is a fraction. A record carrying 78 means 78%, not 7800%
  // of the hull — but say so through the advisory list, not by guessing here;
  // the only thing clamped is the range that would make volumes negative.
  const packing = num(fields.packing_efficiency, NaN);
  if (Number.isFinite(packing) && packing > 0) hull.packing_efficiency = packing;
  const fraction = num(fields.structure_mass_fraction, NaN);
  if (Number.isFinite(fraction) && fraction >= 0) hull.structure_mass_fraction = fraction;
  return hull;
}

/**
 * Write geometry back into a fields object, preserving every key the geometry
 * does not own. Editor 1 authors the contract; it must not drop a field some
 * later editor added.
 */
export function writeHull(fields: Record<string, unknown>, hull: HullGeometry): Record<string, unknown> {
  const out: Record<string, unknown> = { ...fields };
  out.spine = {
    ...obj(fields.spine),
    length_m: hull.spine.length_m,
    beam_m: hull.spine.beam_m,
    ...(hull.spine.station_pitch_m === undefined ? {} : { station_pitch_m: hull.spine.station_pitch_m }),
    datum: "bow",
    stations: hull.spine.stations.map((s) => ({ x: s.x, half_height_m: s.half_height_m })),
    ...(hull.spine.beam_overrides?.length ? { beam_overrides: hull.spine.beam_overrides.map((o) => ({ x: o.x, beam_m: o.beam_m })) } : {}),
  };
  const put = (key: string, value: unknown[] | undefined) => {
    if (value && value.length) out[key] = value;
    else delete out[key];
  };
  put("sections", hull.sections);
  put("external_slots", hull.external_slots);
  put("armor_zones", hull.armor_zones);
  put("appendages", hull.appendages);
  if (hull.packing_efficiency !== undefined) out.packing_efficiency = hull.packing_efficiency;
  if (hull.structure_mass_fraction !== undefined) out.structure_mass_fraction = hull.structure_mass_fraction;
  return out;
}

/** Snap a station to the hull's grid. `pitch <= 0` means no grid. */
export function snapStation(x: number, pitch: number): number {
  if (!(pitch > 0) || !Number.isFinite(x)) return x;
  return Math.round(x / pitch) * pitch;
}

/** The grid the editor snaps to: the spine's own pitch, else the bus's, else 3 m. */
export function stationPitch(hull: HullGeometry, busPitch?: number): number {
  const pitch = hull.spine.station_pitch_m ?? busPitch ?? 3;
  return pitch > 0 ? pitch : 3;
}
