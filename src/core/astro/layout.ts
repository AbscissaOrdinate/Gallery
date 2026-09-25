/**
 * Schematic system-map layout.
 *
 * Two coordinate spaces:
 *   • MAP units — orbit radii and heliocentric positions (origin at the primary,
 *     +y up). They scale with zoom.
 *   • SCREEN px — everything drawn *around* a body: its glyph, its moons and
 *     their orbits, orbital stations, L1/L2 dots, labels. The renderer wraps
 *     each body's neighbourhood in `translate(pos) scale(1/zoom)`, so these
 *     stay a constant size while the orbits zoom (JPL-poster behaviour).
 *
 * Lagrange semantics: `lagrange_of` names the SECONDARY body of a pair; the
 * primary is that body's parent. Earth–Sun L4 → lagrange_of = Earth;
 * Earth–Moon L4 → lagrange_of = Luna.
 */
import type { TypedRecord } from "../types";
import { deriveBody, type BodyDerived, type Lookup } from "./derive";
import type { GlyphSpec } from "./glyph";
import { AU_KM, M_EARTH_KG, M_SUN_KG } from "./worldsmith";

export interface Pt {
  x: number;
  y: number;
}
export interface OrbitShape {
  focus: Pt;
  center: Pt;
  a: number;
  b: number;
  rotationDeg: number;
  e: number;
}
export type LPoint = "L1" | "L2" | "L3" | "L4" | "L5";

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const d2r = (d: number) => (d * Math.PI) / 180;
const r2d = (r: number) => (r * 180) / Math.PI;

export function pointOnOrbit(o: OrbitShape, angleDeg: number): Pt {
  const theta = d2r(angleDeg) - d2r(o.rotationDeg);
  const p = o.a * (1 - o.e * o.e);
  const r = o.e > 0 ? p / (1 + o.e * Math.cos(theta)) : o.a;
  return { x: o.focus.x + r * Math.cos(d2r(angleDeg)), y: o.focus.y + r * Math.sin(d2r(angleDeg)) };
}
export function orbitShape(focus: Pt, rPeri: number, rApo: number, periapsisDeg: number): OrbitShape {
  const a = (rPeri + rApo) / 2;
  const c = (rApo - rPeri) / 2;
  const e = a > 0 ? c / a : 0;
  const b = Math.sqrt(Math.max(0, a * a - c * c));
  const center = { x: focus.x - c * Math.cos(d2r(periapsisDeg)), y: focus.y - c * Math.sin(d2r(periapsisDeg)) };
  return { focus, center, a, b, rotationDeg: periapsisDeg, e };
}

// ---------------------------------------------------------------------------
// Element types
// ---------------------------------------------------------------------------

/** Something drawn in a body's neighbourhood (screen px, relative to the body). */
export interface Satellite {
  kind: "moon" | "station" | "lpoint" | "lobject" | "annotation";
  id: string;
  record?: TypedRecord;
  name: string;
  /** Offset from the host in screen px (+y up). */
  off: Pt;
  /** Orbit radius in screen px (circle around the host) when it orbits the host. */
  orbitR?: number;
  orbitShape?: OrbitShape; // for eccentric moon orbits (screen px, focus at 0,0)
  artificial?: boolean;
  glyph?: GlyphSpec;
  r?: number; // glyph radius (screen px)
  symbol?: string;
  sublabel?: string;
  derived?: BodyDerived;
  /** For lpoint: which point and of which secondary. */
  lpoint?: LPoint;
  secondaryId?: string;
  occupied?: boolean;
  /** For annotations: arc data. */
  arc?: { startDeg?: number; endDeg?: number; width: number; color?: string; label?: string; ring: boolean };
  /** Distance from host in km (for tooltips). */
  distKm?: number;
  /** Nested neighbourhood (a moon's own L-points / stations). */
  children?: Satellite[];
}

export interface BodyNode {
  type: "body";
  id: string;
  record: TypedRecord;
  name: string;
  kind: string;
  pos: Pt; // map units
  r: number; // glyph radius, screen px
  glyph: GlyphSpec;
  sublabel: string; // general type ("Jovian", "Arean", "G2.8V")
  detail: string; // full classification for hover
  derived: BodyDerived;
  orbit?: OrbitShape; // map units
  orbitFocus: Pt;
  priority: number; // label priority (higher first)
  minor: boolean; // asteroid/comet: hidden at overview
  neighbourhood: Satellite[];
  /** Star–body Lagrange points on the orbit (map units): L3/L4/L5. L1/L2 are in the neighbourhood. */
  lpoints: { point: LPoint; pos: Pt; occupied: boolean }[];
  distKm?: number; // from the primary
  portrait?: string;
}
export interface HelioLocation {
  type: "location";
  id: string;
  record: TypedRecord;
  name: string;
  symbol: string;
  pos: Pt; // map units
  orbit?: OrbitShape;
  orbitFocus?: Pt;
  distKm?: number;
  /** When parked at a star–planet Lagrange point (L3/L4/L5). */
  lpoint?: { secondaryId: string; point: LPoint };
  priority: number;
}
export interface LagrangeBody {
  type: "lbody";
  id: string;
  record: TypedRecord;
  name: string;
  pos: Pt;
  r: number;
  glyph: GlyphSpec;
  sublabel: string;
  detail: string;
  derived: BodyDerived;
  lpoint: { secondaryId: string; point: LPoint };
  priority: number;
}
export interface OrbitEl {
  id: string;
  owner: "body" | "location";
  shape: OrbitShape;
  artificial: boolean; // stations/cyclers: hidden unless hovered/selected
  dashed: boolean;
}
export interface BeltEl {
  id: string;
  record: TypedRecord;
  name: string;
  rInner: number;
  rOuter: number;
  color?: string;
}
export interface ZoneEl {
  kind: "hz" | "frost";
  rInner: number;
  rOuter: number;
}
export interface AnnotationEl {
  id: string;
  index: number;
  kind: "arc" | "ring" | "label" | "line";
  center: Pt; // map units (primary) — annotations around bodies live in neighbourhoods
  r: number;
  startDeg?: number;
  endDeg?: number;
  width: number;
  color?: string;
  label?: string;
  link?: string;
}

export interface Layout {
  primary?: TypedRecord;
  primaryNode?: BodyNode;
  bodies: BodyNode[];
  lbodies: LagrangeBody[];
  locations: HelioLocation[];
  orbits: OrbitEl[];
  belts: BeltEl[];
  zones: ZoneEl[];
  annotations: AnnotationEl[];
  extent: number;
  mapAU: (au: number) => number;
  aMin: number;
  aMax: number;
  mapping: string;
  warnings: string[];
  /** id → derived, for tooltips. */
  derived: Map<string, BodyDerived>;
}

export interface LayoutOptions {
  /** Override the system's radius mapping (toolbar toggle). */
  mapping?: "log" | "sqrt" | "linear" | "manual";
}

// ---------------------------------------------------------------------------

function glyphRadius(kind: string, radiusKm: number | undefined, isMoon: boolean): number {
  if (kind === "star" || kind === "brown-dwarf") return 20;
  if (kind === "barycenter") return 6;
  if (kind === "asteroid" || kind === "comet") return 3;
  if (kind === "artificial" || kind === "ring") return 4;
  const rk = radiusKm ?? 3000;
  const r = 3 + 3.6 * Math.log10(Math.max(1, rk / 300));
  return isMoon ? Math.max(2.4, r * 0.72) : r;
}

/** One-word general type for the sublabel. */
export function generalType(record: TypedRecord, d: BodyDerived): string {
  const f = record.fields;
  const kind = str(f.kind) ?? "";
  if (d.star) return d.star.spectral;
  if (kind === "belt") return "belt";
  if (kind === "comet") return "comet";
  if (kind === "asteroid") return d.massClass?.subclass ?? "asteroid";
  const gas = str(f.gas_fraction);
  if (gas === "Jovian" || gas === "Neptunian") return gas;
  const surface = str(f.surface_type);
  if (surface) return surface.replace(/\s*\[.*\]$/, "");
  return d.massClass?.subclass ?? kind;
}

const LOCATION_SYMBOL: Record<string, string> = {
  station: "station",
  depot: "depot",
  shipyard: "shipyard",
  skyhook: "skyhook",
  elevator: "elevator",
  ring: "ring",
  base: "base",
  city: "city",
  settlement: "city",
  megastructure: "ring",
  site: "beacon",
  region: "beacon",
  other: "beacon",
};
function symbolFor(l: TypedRecord): string {
  const s = str(l.fields.map_symbol);
  if (s && s !== "auto") return s;
  return LOCATION_SYMBOL[str(l.fields.kind) ?? "station"] ?? "station";
}

/** Hill-ish L1/L2 distance in km for a secondary of mass m orbiting M at a (km). */
export function l12DistanceKm(aKm: number, mKg: number, MKg: number): number {
  return aKm * Math.cbrt(mKg / (3 * MKg));
}

export function layoutSystem(system: TypedRecord, records: TypedRecord[], lookup: Lookup, opts: LayoutOptions = {}): Layout {
  const f = system.fields;
  const warnings: string[] = [];
  const primaryId = str(f.primary);
  const primary = primaryId ? lookup(primaryId) : undefined;
  const bodies = records.filter((r) => r.type === "body" && (str(r.fields.system) === system.id || r.id === primaryId));
  const locations = records.filter((r) => r.type === "location");
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const derivedCache = new Map<string, BodyDerived>();
  const D = (b: TypedRecord) => {
    let d = derivedCache.get(b.id);
    if (!d) {
      d = deriveBody(b, lookup);
      derivedCache.set(b.id, d);
    }
    return d;
  };
  if (!primary) warnings.push("System has no primary body yet.");
  const origin: Pt = { x: 0, y: 0 };

  const isPrimaryLike = (b: TypedRecord) => b.id === primaryId || (!str(b.fields.parent) && /star|barycenter|brown-dwarf/.test(str(b.fields.kind) ?? ""));
  const helio = bodies.filter((b) => !isPrimaryLike(b) && !str(b.fields.lagrange_of) && (str(b.fields.parent) === primaryId || !str(b.fields.parent) || !byId.has(str(b.fields.parent)!)));
  const moonsOf = new Map<string, TypedRecord[]>();
  for (const b of bodies) {
    const pid = str(b.fields.parent);
    if (pid && pid !== primaryId && byId.has(pid) && !str(b.fields.lagrange_of)) moonsOf.set(pid, [...(moonsOf.get(pid) ?? []), b]);
  }
  const lagrangeBodies = bodies.filter((b) => str(b.fields.lagrange_of) && str(b.fields.lagrange));

  // ---- radius mapping ----------------------------------------------------
  const aus: number[] = [];
  for (const b of helio) {
    if (str(b.fields.kind) === "belt") {
      const i = num(b.fields.belt_inner_au);
      const o = num(b.fields.belt_outer_au);
      if (i) aus.push(i);
      if (o) aus.push(o);
    } else {
      const a = num(b.fields.sma_au);
      if (a) {
        const e = num(b.fields.eccentricity) ?? 0;
        aus.push(a * (1 - e), a * (1 + e));
      }
    }
  }
  for (const l of locations) {
    const a = num(l.fields.sma_au);
    if (a && (!str(l.fields.body) || byId.has(str(l.fields.body)!))) {
      const e = num(l.fields.eccentricity) ?? 0;
      aus.push(a * (1 - e), a * (1 + e));
    }
  }
  const aMin = aus.length ? Math.min(...aus) : 0.3;
  const aMax = aus.length ? Math.max(...aus) : 30;
  const innerPx = num(f.inner_px) ?? 90;
  const outerPx = num(f.outer_px) ?? 520;
  const mapping = opts.mapping ?? (str(f.radius_mapping) as LayoutOptions["mapping"]) ?? "log";
  const manual = mapping === "manual";
  const mapAU = (au: number): number => {
    if (au <= 0) return 0;
    if (aMax <= aMin) return (innerPx + outerPx) / 2;
    let t: number;
    if (mapping === "linear") t = au / aMax;
    else if (mapping === "sqrt") t = Math.sqrt(au / aMax);
    else t = Math.log(au / aMin) / Math.log(aMax / aMin);
    if (mapping === "linear" || mapping === "sqrt") return outerPx * Math.max(0, Math.min(1.2, t));
    return innerPx + (outerPx - innerPx) * Math.max(-0.2, Math.min(1.2, t));
  };
  const moonScale = num(f.moon_scale_px) ?? 64;
  const showLagrange = f.show_lagrange !== false;
  const showZones = f.show_zones !== false;
  const starMassKg = (primary ? (num(primary.fields.mass_sol) ?? 1) : 1) * M_SUN_KG;

  const L: Layout = { primary, bodies: [], lbodies: [], locations: [], orbits: [], belts: [], zones: [], annotations: [], extent: outerPx, mapAU, aMin, aMax, mapping, warnings, derived: derivedCache };

  // ---- zones ---------------------------------------------------------------
  const star = primary ? D(primary).star : undefined;
  if (showZones && star && !manual) {
    L.zones.push({ kind: "hz", rInner: mapAU(star.hzInnerAU), rOuter: mapAU(star.hzOuterAU) });
    L.zones.push({ kind: "frost", rInner: mapAU(star.frostLineAU), rOuter: mapAU(star.frostLineAU) });
  }

  // ---- primary -------------------------------------------------------------
  if (primary) {
    const d = D(primary);
    const kind = str(primary.fields.kind) ?? "star";
    L.primaryNode = {
      type: "body",
      id: primary.id,
      record: primary,
      name: primary.name,
      kind,
      pos: origin,
      r: glyphRadius(kind, undefined, false),
      glyph: d.glyph,
      sublabel: generalType(primary, d),
      detail: d.ewocs.full || d.star?.spectral || "",
      derived: d,
      orbitFocus: origin,
      priority: 100,
      minor: false,
      neighbourhood: [],
      lpoints: [],
      portrait: primary.assets.find((a) => a.role === "portrait")?.path,
    };
    L.bodies.push(L.primaryNode);
  }

  // ---- neighbourhood builder (screen px around a host) --------------------
  const buildNeighbourhood = (host: TypedRecord, hostR: number, hostD: BodyDerived, depth: number): Satellite[] => {
    const out: Satellite[] = [];
    const moons = moonsOf.get(host.id) ?? [];
    const orbitals = locations.filter((l) => str(l.fields.body) === host.id && num(l.fields.orbit_km) && !str(l.fields.lagrange));
    const anns = Array.isArray(f.annotations) ? (f.annotations as Array<Record<string, unknown>>) : [];
    const hostAnns = anns.map((a, i) => ({ a, i })).filter(({ a }) => str(a.around) === host.id && (num(a.radius_km) || str(a.kind) === "label"));
    const smas = [...moons.map((m) => num(m.fields.sma_km) ?? (num(m.fields.sma_au) ?? 0) * AU_KM), ...orbitals.map((l) => num(l.fields.orbit_km)!), ...hostAnns.map(({ a }) => num(a.radius_km) ?? 0)].filter((v) => v > 0);
    if (!smas.length && !hostAnns.length) return out;
    const mn = smas.length ? Math.min(...smas) : 1;
    const mx = smas.length ? Math.max(...smas) : 1;
    const r0 = hostR + 9;
    const r1 = Math.max(r0 + 10, depth === 0 ? moonScale : moonScale * 0.45);
    const mapKm = (km: number) => (mx <= mn * 1.0001 ? (r0 + r1) / 2 : r0 + (r1 - r0) * (Math.log(km / mn) / Math.log(mx / mn)));
    const hostMassKg = (hostD.massEarth ?? 1) * M_EARTH_KG;

    for (const m of moons) {
      const km = num(m.fields.sma_km) ?? (num(m.fields.sma_au) ?? 0) * AU_KM;
      if (!km) {
        warnings.push(`${m.name}: moon needs a semi-major axis (km)`);
        continue;
      }
      const e = num(m.fields.eccentricity) ?? 0;
      const shape = orbitShape({ x: 0, y: 0 }, mapKm(km * (1 - e)), mapKm(km * (1 + e)), num(m.fields.periapsis_deg) ?? 0);
      const d = D(m);
      const off = pointOnOrbit(shape, num(m.fields.map_angle_deg) ?? 0);
      const kind = str(m.fields.kind) ?? "moon";
      const r = glyphRadius(kind, d.radiusKm, true);
      const sat: Satellite = { kind: "moon", id: m.id, record: m, name: m.name, off, orbitShape: shape, glyph: d.glyph, r, sublabel: generalType(m, d), derived: d, distKm: km, children: [] };
      // moon's own L-points about the host (planet–moon pairs)
      if (showLagrange) {
        const ang = r2d(Math.atan2(off.y, off.x));
        const rHere = Math.hypot(off.x, off.y);
        const offPx = Math.max(6, Math.min(14, r * 2));
        const mMass = (d.massEarth ?? 0.01) * M_EARTH_KG;
        const l12km = l12DistanceKm(km, mMass, hostMassKg);
        const pts: [LPoint, Pt, number][] = [
          ["L1", { x: off.x * ((rHere - offPx) / rHere), y: off.y * ((rHere - offPx) / rHere) }, l12km],
          ["L2", { x: off.x * ((rHere + offPx) / rHere), y: off.y * ((rHere + offPx) / rHere) }, l12km],
          ["L3", pointOnOrbit(shape, ang + 180), km],
          ["L4", pointOnOrbit(shape, ang + 60), km],
          ["L5", pointOnOrbit(shape, ang - 60), km],
        ];
        for (const [pt, p, dist] of pts) {
          const objs = [...lagrangeBodies, ...locations].filter((o) => str(o.fields.lagrange_of) === m.id && str(o.fields.lagrange) === pt);
          const occupied = objs.length > 0;
          if (pt === "L3" && !occupied) continue;
          out.push({ kind: "lpoint", id: `${m.id}:${pt}`, name: `${m.name} ${pt}`, off: p, lpoint: pt, secondaryId: m.id, occupied, distKm: dist });
          for (const o of objs) {
            if (o.type === "body") {
              const od = D(o);
              out.push({ kind: "lobject", id: o.id, record: o, name: o.name, off: p, glyph: od.glyph, r: glyphRadius(str(o.fields.kind) ?? "asteroid", od.radiusKm, true), sublabel: generalType(o, od), derived: od, lpoint: pt, secondaryId: m.id, distKm: dist });
            } else {
              out.push({ kind: "lobject", id: o.id, record: o, name: o.name, off: p, symbol: symbolFor(o), lpoint: pt, secondaryId: m.id, distKm: dist });
            }
          }
        }
      }
      out.push(sat);
    }
    for (const l of orbitals) {
      const km = num(l.fields.orbit_km)!;
      const rr = mapKm(km);
      const ang = num(l.fields.map_angle_deg) ?? 45;
      out.push({ kind: "station", id: l.id, record: l, name: l.name, off: { x: rr * Math.cos(d2r(ang)), y: rr * Math.sin(d2r(ang)) }, orbitR: rr, artificial: true, symbol: symbolFor(l), distKm: km });
    }
    for (const { a, i } of hostAnns) {
      const kind = (str(a.kind) ?? "arc") as AnnotationEl["kind"];
      const rKm = num(a.radius_km);
      const rr = rKm ? Math.max(hostR + 3, mapKm(rKm)) : hostR + 6;
      out.push({ kind: "annotation", id: `ann:${i}`, name: str(a.label) ?? "", off: { x: 0, y: 0 }, orbitR: rr, arc: { startDeg: num(a.start_deg), endDeg: num(a.end_deg), width: num(a.width_px) ?? 3, color: str(a.color), label: str(a.label), ring: kind === "ring" || kind === "label" }, distKm: rKm });
    }
    return out;
  };

  // ---- heliocentric bodies ---------------------------------------------------
  for (const b of helio) {
    const kind = str(b.fields.kind) ?? "planet";
    if (kind === "belt") {
      const i = num(b.fields.belt_inner_au);
      const o = num(b.fields.belt_outer_au);
      if (!i || !o) {
        warnings.push(`${b.name}: belt needs inner and outer edges`);
        continue;
      }
      const rIn = manual ? (num(b.fields.map_radius_px) ?? innerPx) : mapAU(i);
      const rOut = manual ? rIn + 24 : mapAU(o);
      L.belts.push({ id: b.id, record: b, name: b.name, rInner: rIn, rOuter: rOut, color: str(b.fields.glyph_color) });
      L.extent = Math.max(L.extent, rOut);
      continue;
    }
    const a = num(b.fields.sma_au);
    if (!a && !manual) {
      warnings.push(`${b.name}: needs a semi-major axis (AU) to be drawn`);
      continue;
    }
    const e = num(b.fields.eccentricity) ?? 0;
    const rp = manual ? (num(b.fields.map_radius_px) ?? innerPx) : mapAU(a! * (1 - e));
    const ra = manual ? (num(b.fields.map_radius_px) ?? innerPx) * (1 + e) : mapAU(a! * (1 + e));
    const shape = orbitShape(origin, rp, ra, num(b.fields.periapsis_deg) ?? 0);
    const d = D(b);
    const ang = num(b.fields.map_angle_deg) ?? 0;
    const pos = pointOnOrbit(shape, ang);
    const r = glyphRadius(kind, d.radiusKm, false);
    const minor = kind === "asteroid" || kind === "comet";
    L.orbits.push({ id: b.id, owner: "body", shape, artificial: false, dashed: kind === "comet" });
    const node: BodyNode = {
      type: "body",
      id: b.id,
      record: b,
      name: b.name,
      kind,
      pos,
      r,
      glyph: d.glyph,
      sublabel: generalType(b, d),
      detail: d.ewocs.full,
      derived: d,
      orbit: shape,
      orbitFocus: origin,
      priority: minor ? 30 : 60 + Math.min(20, r),
      minor,
      neighbourhood: buildNeighbourhood(b, r, d, 0),
      lpoints: [],
      distKm: a ? a * AU_KM : undefined,
      portrait: b.assets.find((x) => x.role === "portrait")?.path,
    };
    // star–body L-points: L1/L2 in the neighbourhood (screen px), L3/L4/L5 on the orbit (map units)
    if (showLagrange && !minor) {
      const rHere = Math.hypot(pos.x, pos.y);
      const ux = pos.x / rHere;
      const uy = pos.y / rHere;
      const offPx = Math.max(12, Math.min(28, r * 2.4));
      const mKg = (d.massEarth ?? 1) * M_EARTH_KG;
      const l12km = a ? l12DistanceKm(a * AU_KM, mKg, starMassKg) : undefined;
      const occ = (pt: LPoint) => [...lagrangeBodies, ...locations].filter((o) => str(o.fields.lagrange_of) === b.id && str(o.fields.lagrange) === pt);
      for (const [pt, off] of [
        ["L1", { x: -ux * offPx, y: -uy * offPx }],
        ["L2", { x: ux * offPx, y: uy * offPx }],
      ] as [LPoint, Pt][]) {
        const objs = occ(pt);
        node.neighbourhood.push({ kind: "lpoint", id: `${b.id}:${pt}`, name: `${b.name} ${pt}`, off, lpoint: pt, secondaryId: b.id, occupied: objs.length > 0, distKm: l12km });
        for (const o of objs) {
          if (o.type === "body") {
            const od = D(o);
            node.neighbourhood.push({ kind: "lobject", id: o.id, record: o, name: o.name, off, glyph: od.glyph, r: glyphRadius(str(o.fields.kind) ?? "asteroid", od.radiusKm, true), sublabel: generalType(o, od), derived: od, lpoint: pt, secondaryId: b.id, distKm: l12km });
          } else node.neighbourhood.push({ kind: "lobject", id: o.id, record: o, name: o.name, off, symbol: symbolFor(o), lpoint: pt, secondaryId: b.id, distKm: l12km });
        }
      }
      for (const [pt, dAng] of [
        ["L3", 180],
        ["L4", 60],
        ["L5", -60],
      ] as [LPoint, number][]) {
        const objs = occ(pt);
        const p = pointOnOrbit(shape, ang + dAng);
        if (pt === "L3" && objs.length === 0) continue;
        node.lpoints.push({ point: pt, pos: p, occupied: objs.length > 0 });
        for (const o of objs) {
          if (o.type === "body") {
            const od = D(o);
            L.lbodies.push({ type: "lbody", id: o.id, record: o, name: o.name, pos: p, r: glyphRadius(str(o.fields.kind) ?? "asteroid", od.radiusKm, true), glyph: od.glyph, sublabel: generalType(o, od), detail: od.ewocs.full, derived: od, lpoint: { secondaryId: b.id, point: pt }, priority: 40 });
          } else {
            L.locations.push({ type: "location", id: o.id, record: o, name: o.name, symbol: symbolFor(o), pos: p, distKm: a ? a * AU_KM : undefined, lpoint: { secondaryId: b.id, point: pt }, priority: 45 });
          }
        }
      }
    }
    L.bodies.push(node);
    L.extent = Math.max(L.extent, ra + 4);
  }

  // orphaned Lagrange objects (host not drawn)
  for (const o of [...lagrangeBodies, ...locations.filter((l) => str(l.fields.lagrange_of) && str(l.fields.lagrange))]) {
    const host = str(o.fields.lagrange_of)!;
    const placed = L.lbodies.some((x) => x.id === o.id) || L.locations.some((x) => x.id === o.id) || L.bodies.some((b) => b.neighbourhood.some((s) => s.id === o.id));
    if (!placed && (byId.has(host) || locations.some((l) => l.id === host))) warnings.push(`${o.name}: its Lagrange host isn't drawn (turn on Lagrange points or check the host's orbit)`);
    else if (!placed) warnings.push(`${o.name}: Lagrange host not found`);
  }

  // ---- heliocentric locations (cyclers, free stations) ------------------------
  for (const l of locations) {
    if (str(l.fields.lagrange)) continue;
    const bodyId = str(l.fields.body);
    const a = num(l.fields.sma_au);
    if (a && (!bodyId || bodyId === primaryId)) {
      const e = num(l.fields.eccentricity) ?? 0;
      const shape = orbitShape(origin, manual ? innerPx : mapAU(a * (1 - e)), manual ? innerPx : mapAU(a * (1 + e)), num(l.fields.periapsis_deg) ?? 0);
      const pos = pointOnOrbit(shape, num(l.fields.map_angle_deg) ?? 0);
      L.orbits.push({ id: l.id, owner: "location", shape, artificial: true, dashed: true });
      L.locations.push({ type: "location", id: l.id, record: l, name: l.name, symbol: symbolFor(l), pos, orbit: shape, orbitFocus: origin, distKm: a * AU_KM, priority: 50 });
      L.extent = Math.max(L.extent, shape.a * (1 + shape.e));
    }
  }

  // ---- annotations around the primary (map units) ------------------------------
  const anns = Array.isArray(f.annotations) ? (f.annotations as Array<Record<string, unknown>>) : [];
  anns.forEach((an, i) => {
    const around = str(an.around);
    if (around && around !== primaryId && byId.has(around)) return; // handled in neighbourhoods
    const kind = (str(an.kind) ?? "arc") as AnnotationEl["kind"];
    const rAU = num(an.radius_au);
    const r = rAU ? (manual ? innerPx : mapAU(rAU)) : 30;
    L.annotations.push({ id: `ann:${i}`, index: i, kind, center: origin, r, startDeg: num(an.start_deg), endDeg: num(an.end_deg), width: num(an.width_px) ?? 4, color: str(an.color), label: str(an.label), link: str(an.link) });
    L.extent = Math.max(L.extent, r);
  });

  return L;
}

// ---------------------------------------------------------------------------
// Label placement (screen space, greedy)
// ---------------------------------------------------------------------------

export interface LabelReq {
  id: string;
  /** Anchor in screen px. */
  x: number;
  y: number;
  /** Clearance radius around the anchor (glyph). */
  r: number;
  text: string;
  sub?: string;
  fontPx: number;
  /** The sublabel's own size when it is set in a different type token; unset, it is ¾ of fontPx. */
  subPx?: number;
  /** Monospaced text measures a little wider per character. */
  mono?: boolean;
  priority: number;
}
export interface LabelPlacement {
  id: string;
  /** Offset from the anchor in screen px (text start, baseline). */
  dx: number;
  dy: number;
  anchor: "start" | "end" | "middle";
  hidden: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Greedy placement: highest priority first; try right, left, above, below; hide if nothing fits. */
export function placeLabels(reqs: LabelReq[], occupied: Rect[] = []): Map<string, LabelPlacement> {
  const out = new Map<string, LabelPlacement>();
  const taken: Rect[] = [...occupied];
  // every glyph is reserved up front so no label — however important — covers an icon
  for (const q of reqs) taken.push({ x: q.x - q.r, y: q.y - q.r, w: q.r * 2, h: q.r * 2 });
  const sorted = [...reqs].sort((a, b) => b.priority - a.priority);
  for (const q of sorted) {
    const cw = q.mono ? 0.62 : 0.58;
    const subW = !q.sub ? 0 : q.subPx ? q.sub.length * q.subPx * 0.62 : q.sub.length * 0.78 * q.fontPx * 0.58;
    const subH = !q.sub ? 0 : q.subPx ? q.subPx * 1.4 : q.fontPx * 0.95;
    const w = Math.max(q.text.length * q.fontPx * cw, subW) + 4;
    const h = q.fontPx * 1.25 + subH;
    const candidates: [number, number, LabelPlacement["anchor"], Rect][] = [];
    // right, left, above, below — first snug, then pushed out a little further
    for (const gap of [3, 14]) {
      candidates.push(
        [q.r + gap, -q.fontPx * 0.15, "start", { x: q.x + q.r + gap, y: q.y - q.fontPx * 0.95, w, h }],
        [-(q.r + gap), -q.fontPx * 0.15, "end", { x: q.x - q.r - gap - w, y: q.y - q.fontPx * 0.95, w, h }],
        [0, -(q.r + gap + subH + 2), "middle", { x: q.x - w / 2, y: q.y - q.r - gap - h, w, h }],
        [0, q.r + gap + q.fontPx, "middle", { x: q.x - w / 2, y: q.y + q.r + gap, w, h }],
      );
    }
    let placed = false;
    for (const [dx, dy, anchor, rect] of candidates) {
      if (taken.some((t) => overlaps(t, rect))) continue;
      out.set(q.id, { id: q.id, dx, dy, anchor, hidden: false });
      taken.push(rect);
      placed = true;
      break;
    }
    if (!placed) out.set(q.id, { id: q.id, dx: q.r + 3, dy: 0, anchor: "start", hidden: true });
  }
  return out;
}
