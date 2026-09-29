/**
 * Derive everything computable for a body record in the context of its
 * system (parent chain, host star). This is what the Derived panel, the map
 * and the CSV export read.
 */
import type { TypedRecord } from "../types";
import * as W from "./worldsmith";
import * as E from "./ewocs";
import { glyphSpecFor, type GlyphSpec } from "./glyph";

export type Lookup = (id: string) => TypedRecord | undefined;

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export interface StarContext {
  star: TypedRecord;
  massSol: number;
  derived: W.StarDerived;
}

/** Walk the parent chain to the host star (or barycenter). */
export function hostStar(body: TypedRecord, lookup: Lookup): StarContext | undefined {
  let cur: TypedRecord | undefined = body;
  const seen = new Set<string>();
  for (let i = 0; i < 12 && cur; i++) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    const kind = str(cur.fields.kind);
    if ((kind === "star" || kind === "brown-dwarf" || kind === "barycenter") && cur.id !== body.id) {
      const massSol = num(cur.fields.mass_sol) ?? 1;
      return { star: cur, massSol, derived: W.deriveStar(massSol, num(cur.fields.age_gyr) ?? 4.5, { luminositySol: num(cur.fields.luminosity_sol), radiusSol: num(cur.fields.radius_sol) }) };
    }
    const pid = str(cur.fields.parent);
    cur = pid ? lookup(pid) : undefined;
  }
  return undefined;
}

/** Heliocentric distance in AU: own sma_au, or the parent's for moons. */
export function heliocentricAU(body: TypedRecord, lookup: Lookup): number | undefined {
  let cur: TypedRecord | undefined = body;
  for (let i = 0; i < 12 && cur; i++) {
    const a = num(cur.fields.sma_au);
    const kind = str(cur.fields.kind);
    if (a !== undefined && a > 0 && kind !== "moon") return a;
    if (a !== undefined && a > 0) return a;
    if (str(cur.fields.lagrange_of)) {
      const host = lookup(str(cur.fields.lagrange_of)!);
      if (host) return heliocentricAU(host, lookup);
    }
    const pid = str(cur.fields.parent);
    cur = pid ? lookup(pid) : undefined;
  }
  return undefined;
}

export interface BodyDerived {
  kind: string;
  isStar: boolean;
  star?: W.StarDerived & { massSol: number; name: string };
  hostStar?: StarContext;
  parent?: TypedRecord;
  heliocentricAU?: number;
  // orbit
  periodYears?: number;
  periodDays?: number;
  synodicDays?: number;
  periapsisAU?: number;
  apoapsisAU?: number;
  smaKm?: number;
  hillRadiusKm?: number;
  moonZoneInnerKm?: number;
  moonZoneOuterKm?: number;
  // physical
  massEarth?: number;
  terrestrial?: W.TerrestrialDerived;
  radiusKm?: number;
  densityGcc?: number;
  gravityG?: number;
  escapeVelocityKms?: number;
  fluxRelEarth?: number;
  equilibriumTempK?: number;
  surfaceTempK?: number;
  surfaceTempSource: "override" | "derived" | "none";
  // atmosphere
  meanMolarMass?: number;
  atmosphericDensity?: number;
  circulationCells?: number | null;
  gasRetention?: { gas: string; stability: number; retained: boolean }[];
  // locking / tides
  lockToParentGyr?: number;
  lockToParentLabel?: string;
  parentLockToThisGyr?: number;
  parentLockToThisLabel?: string;
  lockToStarGyr?: number;
  tidesEarth?: number;
  // classification
  ewocs: E.EwocsResult;
  aerosolGuess?: E.AerosolClass;
  tempSubtypeGuess?: E.Term;
  massClass?: E.MassClass;
  glyph: GlyphSpec;
  warnings: string[];
}

export function deriveBody(body: TypedRecord, lookup: Lookup): BodyDerived {
  const f = body.fields;
  const kind = str(f.kind) ?? "planet";
  const warnings: string[] = [];
  const isStar = kind === "star" || kind === "brown-dwarf" || kind === "barycenter";
  const parent = str(f.parent) ? lookup(str(f.parent)!) : undefined;
  const host = hostStar(body, lookup);

  const out: Partial<BodyDerived> = { kind, isStar, parent, hostStar: host, warnings, surfaceTempSource: "none" };

  if (isStar) {
    const massSol = num(f.mass_sol) ?? 1;
    const d = W.deriveStar(massSol, num(f.age_gyr) ?? 4.5, { luminositySol: num(f.luminosity_sol), radiusSol: num(f.radius_sol) });
    out.star = { ...d, massSol, name: body.name };
    if (num(f.age_gyr) !== undefined && num(f.age_gyr)! > d.maxAgeGyr) warnings.push(`Age ${f.age_gyr} Gyr exceeds main-sequence lifetime ${d.maxAgeGyr.toFixed(1)} Gyr`);
  }

  // ---- orbit -------------------------------------------------------------
  const smaAU = num(f.sma_au);
  const smaKm = num(f.sma_km);
  const e = num(f.eccentricity) ?? 0;
  const helio = heliocentricAU(body, lookup);
  out.heliocentricAU = helio;
  const parentKind = parent ? str(parent.fields.kind) : undefined;
  const parentIsStar = !parent || parentKind === "star" || parentKind === "brown-dwarf" || parentKind === "barycenter";

  if (parentIsStar && smaAU && host) {
    out.periodYears = W.orbitalPeriodYears(smaAU, host.massSol);
    out.periodDays = out.periodYears * W.YEAR_D;
    out.periapsisAU = smaAU * (1 - e);
    out.apoapsisAU = smaAU * (1 + e);
    if (smaAU < host.derived.innerLimitAU) warnings.push(`Inside the system inner limit (${host.derived.innerLimitAU.toFixed(3)} AU)`);
  }

  // ---- physical ------------------------------------------------------------
  const massEarth = num(f.mass_earth);
  out.massEarth = massEarth;
  const gas = str(f.gas_fraction);
  const isGiant = gas === "Jovian" || gas === "Neptunian";
  if (!isStar && massEarth !== undefined && massEarth > 0) {
    out.massClass = E.massClass(massEarth);
    const densityOverride = num(f.density_gcc);
    const radiusOverride = num(f.radius_km);
    if (isGiant || densityOverride !== undefined) {
      // giants / icy bodies: density given (or a giant default), radius from it unless overridden
      const density = densityOverride ?? (gas === "Jovian" ? 1.3 : 1.6);
      const radiusEarth = radiusOverride ? radiusOverride / W.R_EARTH_KM : Math.cbrt(massEarth / (density / 5.51));
      out.densityGcc = radiusOverride ? (5.51 * massEarth) / Math.pow(radiusEarth, 3) : density;
      out.radiusKm = radiusEarth * W.R_EARTH_KM;
      out.gravityG = massEarth / (radiusEarth * radiusEarth);
      out.escapeVelocityKms = Math.sqrt(massEarth / radiusEarth) * 11.186;
    } else {
      const t = W.deriveTerrestrial(massEarth, num(f.cmf_pct) ?? 33.4, num(f.axial_tilt_deg) ?? 0, 1.75, radiusOverride ? radiusOverride / W.R_EARTH_KM : undefined);
      out.terrestrial = t;
      out.densityGcc = t.densityGcc;
      out.radiusKm = t.radiusKm;
      out.gravityG = t.gravityG;
      out.escapeVelocityKms = t.escapeVelocityKms;
    }
  }

  // ---- temperature ---------------------------------------------------------
  if (!isStar && host && helio) {
    out.fluxRelEarth = W.relativeFlux(host.derived.luminositySol, helio);
    const albedo = num(f.albedo_bond) ?? 0.3;
    out.equilibriumTempK = W.equilibriumTemperatureK(host.derived.luminositySol, helio, albedo);
    const override = num(f.surface_temp_K);
    if (override !== undefined) {
      out.surfaceTempK = override;
      out.surfaceTempSource = "override";
    } else {
      out.surfaceTempK = W.surfaceTemperatureK(host.derived.luminositySol, helio, albedo, num(f.greenhouse) ?? 0);
      out.surfaceTempSource = "derived";
    }
  } else if (num(f.surface_temp_K) !== undefined) {
    out.surfaceTempK = num(f.surface_temp_K);
    out.surfaceTempSource = "override";
  }

  // ---- atmosphere ----------------------------------------------------------
  const mix = Array.isArray(f.atmosphere) ? (f.atmosphere as Array<{ gas?: string; percent?: number }>).filter((g) => g && typeof g.gas === "string").map((g) => ({ formula: g.gas!, percent: num(g.percent) ?? 0 })) : [];
  const pressure = num(f.pressure_atm);
  if (mix.length) {
    out.meanMolarMass = W.meanMolarMass(mix);
    if (pressure && out.surfaceTempK) out.atmosphericDensity = W.atmosphericDensity(pressure, out.meanMolarMass, out.surfaceTempK);
    if (out.surfaceTempK && out.escapeVelocityKms) {
      out.gasRetention = mix.map((g) => {
        const mm = W.GASES[g.formula]?.molarMassKgMol ?? 0.029;
        const s = W.gasStability(mm, out.surfaceTempK!, out.escapeVelocityKms!);
        return { gas: g.formula, stability: s, retained: s < 1 };
      });
      const lost = out.gasRetention.filter((g) => !g.retained).map((g) => g.gas);
      if (lost.length) warnings.push(`Atmosphere: ${lost.join(", ")} would escape (v_rms > v_esc/6)`);
    }
  }
  const rot = num(f.rotation_h);
  if (rot) out.circulationCells = W.circulationCells(rot);

  // ---- moons: zones, periods, locking, tides -------------------------------
  if (parent && !parentIsStar && massEarth !== undefined) {
    const pd = deriveBodyShallow(parent, lookup);
    const aKm = smaKm ?? (smaAU ? smaAU * W.AU_KM : undefined);
    out.smaKm = aKm;
    if (aKm && pd.massEarth) {
      const mP = pd.massEarth * W.M_EARTH_KG;
      const mM = massEarth * W.M_EARTH_KG;
      out.periodDays = W.orbitalPeriodDays(aKm, mP, mM);
      if (pd.periodDays) out.synodicDays = W.synodicPeriodDays(out.periodDays, pd.periodDays);
      if (pd.radiusKm && pd.densityGcc && out.densityGcc) {
        out.moonZoneInnerKm = W.moonZoneInnerKm(pd.radiusKm, pd.densityGcc, out.densityGcc);
        if (aKm < out.moonZoneInnerKm) warnings.push(`Inside the parent's Roche zone (${Math.round(out.moonZoneInnerKm).toLocaleString()} km)`);
      }
      if (host && pd.heliocentricAU) {
        out.moonZoneOuterKm = W.moonZoneOuterKm(pd.heliocentricAU, mP, host.massSol * W.M_SUN_KG);
        if (aKm > out.moonZoneOuterKm) warnings.push(`Beyond the parent's stable moon zone (${Math.round(out.moonZoneOuterKm).toLocaleString()} km)`);
      }
      if (out.radiusKm && out.densityGcc && out.gravityG && pd.radiusKm && pd.densityGcc && pd.gravityG) {
        const moon: W.TidalBody = { massKg: mM, radiusM: out.radiusKm * 1000, densityKgM3: out.densityGcc * 1000, gravityMs2: out.gravityG * 9.81, inertiaFactor: 0.5, q: 40, spinRadS: (2 * Math.PI) / ((rot ?? 12) * 3600) };
        const planet: W.TidalBody = { massKg: mP, radiusM: pd.radiusKm * 1000, densityKgM3: pd.densityGcc * 1000, gravityMs2: pd.gravityG * 9.81, inertiaFactor: 0.4, q: 13, spinRadS: (2 * Math.PI) / ((num(parent.fields.rotation_h) ?? 24) * 3600) };
        out.lockToParentGyr = W.lockingTimeGyr(moon, mP, aKm * 1000);
        out.lockToParentLabel = W.lockingLabel(out.lockToParentGyr);
        out.parentLockToThisGyr = W.lockingTimeGyr(planet, mM, aKm * 1000);
        out.parentLockToThisLabel = W.lockingLabel(out.parentLockToThisGyr);
        if (host && pd.heliocentricAU) {
          const tidal = W.tidalForce(mM, mP, aKm * 1000) + W.tidalForce(mP, host.massSol * W.M_SUN_KG, pd.heliocentricAU * W.AU_M);
          out.tidesEarth = tidal / W.EARTH_SYSTEM_TIDAL_FORCE;
        }
      }
    }
  } else if (parentIsStar && host && helio && out.radiusKm && out.densityGcc && out.gravityG && massEarth) {
    const planet: W.TidalBody = { massKg: massEarth * W.M_EARTH_KG, radiusM: out.radiusKm * 1000, densityKgM3: out.densityGcc * 1000, gravityMs2: out.gravityG * 9.81, inertiaFactor: 0.4, q: 13, spinRadS: (2 * Math.PI) / ((rot ?? 24) * 3600) };
    out.lockToStarGyr = W.lockingTimeGyr(planet, host.massSol * W.M_SUN_KG, helio * W.AU_M);
    out.hillRadiusKm = W.hillRadiusKm(helio * W.AU_KM, e, massEarth * W.M_EARTH_KG, host.massSol * W.M_SUN_KG);
  }

  // ---- classification ------------------------------------------------------
  const fluid = E.fluidById(str(f.fluid));
  if (out.surfaceTempK !== undefined) {
    out.aerosolGuess = E.aerosolGuess(out.surfaceTempK, /Carbon/.test(str(f.co_ratio) ?? ""), fluid?.id === "Aquatic" || !fluid);
    if (fluid) out.tempSubtypeGuess = E.tempSubtypeGuess(out.surfaceTempK, fluid.freezeK);
  }
  const locked = !!f.tidally_locked || (out.lockToParentGyr !== undefined && out.lockToParentGyr < (num(host?.star.fields.age_gyr) ?? 4.5));
  const ewocs = E.classify({
    massEarth,
    gasFraction: gas,
    volatiles: str(f.volatiles),
    coRatio: str(f.co_ratio),
    cmfPercent: num(f.cmf_pct),
    coreFraction: str(f.core_fraction),
    atmoComposition: str(f.atmo_composition),
    aerosol: str(f.aerosol) ?? out.aerosolGuess?.id,
    surfaceType: str(f.surface_type),
    tempSubtype: str(f.temp_subtype) ?? out.tempSubtypeGuess?.id,
    liquidCoverage: str(f.liquid_coverage),
    liquidPercent: num(f.liquid_pct),
    fluid: str(f.fluid),
    miscOrbit: str(f.misc_orbit),
    miscMultiworld: str(f.misc_multiworld),
    miscRotation: str(f.misc_rotation),
    miscLife: str(f.misc_life),
    miscHistory: str(f.misc_history),
    eccentricity: e,
    axialTiltDeg: num(f.axial_tilt_deg),
    tidallyLocked: locked,
    isSatellite: kind === "moon" || (!!parent && !parentIsStar),
  });
  out.ewocs = ewocs;
  const tundral = ewocs.terrestrial ? /Tundral|Glacial/.test(ewocs.terrestrial) : undefined;
  out.glyph = glyphSpecFor(body, { tempK: out.star?.temperatureK, tundral });
  return out as BodyDerived;
}

/** Cheap subset for parents (no recursion into their own parents' locking). */
function deriveBodyShallow(body: TypedRecord, lookup: Lookup): { massEarth?: number; radiusKm?: number; densityGcc?: number; gravityG?: number; periodDays?: number; heliocentricAU?: number } {
  const d = deriveBody(body, lookup);
  return { massEarth: d.massEarth, radiusKm: d.radiusKm, densityGcc: d.densityGcc, gravityG: d.gravityG, periodDays: d.periodDays, heliocentricAU: d.heliocentricAU };
}

/** Flat columns for CSV export. */
export function derivedColumns(body: TypedRecord, lookup: Lookup): Record<string, string> {
  const d = deriveBody(body, lookup);
  const r = (v: number | undefined, digits = 3) => (v === undefined ? "" : Number(v.toPrecision(digits + 2)).toString());
  const cols: Record<string, string> = {
    d_class: d.ewocs.shorthand,
    d_mass_class: d.massClass?.subclass ?? "",
    d_radius_km: r(d.radiusKm),
    d_density_gcc: r(d.densityGcc),
    d_gravity_g: r(d.gravityG),
    d_escape_kms: r(d.escapeVelocityKms),
    d_period_d: r(d.periodDays),
    d_surface_K: r(d.surfaceTempK),
    d_flux_rel: r(d.fluxRelEarth),
  };
  if (d.star) {
    cols.d_luminosity_sol = r(d.star.luminositySol);
    cols.d_spectral = d.star.spectral;
    cols.d_hz_au = `${r(d.star.hzInnerAU)}–${r(d.star.hzOuterAU)}`;
    cols.d_frost_au = r(d.star.frostLineAU);
  }
  return cols;
}
