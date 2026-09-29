/**
 * Worldsmith-derived physics (after Artifexian's "The WorldSmith" 8.0).
 *
 * Pure functions, SI-ish inputs in the units the sheet uses (M☉, L☉, R☉, AU,
 * M⊕, R⊕, km, g/cm³, K, atm). Every function is a direct port of the
 * spreadsheet formula named in its doc comment so results match the sheet;
 * where the sheet's model is a rule of thumb, it is a rule of thumb here too.
 * Nothing in this file is authoritative science — it is a consistent skeleton.
 */

export const AU_KM = 149_597_870.7;
export const AU_M = AU_KM * 1000;
export const M_SUN_KG = 1.989e30;
export const L_SUN_W = 3.828e26;
export const R_SUN_KM = 696_340;
export const M_EARTH_KG = 5.972e24;
export const R_EARTH_KM = 6371;
export const M_MOON_KG = 7.35e22;
export const R_MOON_KM = 1737.4;
/** The sheet uses 6.67e-11; kept so ported results match it to the digit. */
export const G = 6.67e-11;
export const DAY_S = 86400;
export const YEAR_D = 365.256;

// ---------------------------------------------------------------------------
// Stars (STAR sheet)
// ---------------------------------------------------------------------------

/** STAR!C10 — mass–luminosity relation (piecewise). */
export function starLuminosity(massSol: number): number {
  if (massSol < 0.43) return 0.23 * Math.pow(massSol, 2.3);
  if (massSol < 2) return Math.pow(massSol, 4);
  return 1.4 * Math.pow(massSol, 3.5);
}

/** STAR!C9 — mass–radius relation. */
export function starRadius(massSol: number): number {
  return massSol < 1 ? Math.pow(massSol, 0.8) : Math.pow(massSol, 0.57);
}

/** STAR!C12 — effective temperature from L and R (5776 K solar). */
export function starTemperature(lumSol: number, radSol: number): number {
  return Math.pow(lumSol / (radSol * radSol), 0.25) * 5776;
}

/** STAR!C8 — main-sequence lifetime in Gyr. */
export function starMaxAgeGyr(massSol: number, lumSol: number): number {
  return (massSol / lumSol) * 10;
}

/** Calculations!B4:C10 — spectral class from temperature, e.g. "G2.8V". */
export function spectralClass(tempK: number): string {
  const bands: [string, number, number][] = [
    ["M", 2000, 3700],
    ["K", 3700, 5200],
    ["G", 5200, 6000],
    ["F", 6000, 7500],
    ["A", 7500, 10000],
    ["B", 10000, 33000],
    ["O", 33000, 95000],
  ];
  for (const [letter, lo, hi] of bands) {
    if (tempK > lo && tempK < hi) {
      const sub = Math.floor((1 - (tempK - lo) / (hi - lo)) * 10 * 10) / 10;
      return `${letter}${sub}V`;
    }
  }
  return "—";
}

export interface StarDerived {
  luminositySol: number;
  radiusSol: number;
  temperatureK: number;
  densitySol: number;
  spectral: string;
  maxAgeGyr: number;
  hzInnerAU: number;
  hzOuterAU: number;
  frostLineAU: number;
  innerLimitAU: number;
  earthlikeLife: "Yes" | "Star Too Young" | "No";
}

/** STAR + PLANETARY SYSTEM sheets. Overrides let a record pin L or R by hand. */
export function deriveStar(massSol: number, ageGyr = 4.5, overrides: { luminositySol?: number; radiusSol?: number } = {}): StarDerived {
  const L = overrides.luminositySol ?? starLuminosity(massSol);
  const R = overrides.radiusSol ?? starRadius(massSol);
  const density = massSol / (R * R * R);
  const T = starTemperature(L, R);
  return {
    luminositySol: L,
    radiusSol: R,
    temperatureK: T,
    densitySol: density,
    spectral: spectralClass(T),
    maxAgeGyr: starMaxAgeGyr(massSol, L),
    hzInnerAU: Math.sqrt(L / 1.1),
    hzOuterAU: Math.sqrt(L / 0.53),
    frostLineAU: 4.85 * Math.sqrt(L),
    // PLANETARY SYSTEM!C15
    innerLimitAU: (2.455 * (R * R_SUN_KM) * Math.pow((density * 1408) / 5400, 1 / 3)) / 149_600_000,
    earthlikeLife: massSol >= 0.5 && massSol <= 1.4 ? (ageGyr >= 3.5 ? "Yes" : "Star Too Young") : "No",
  };
}

/** PLANETARY SYSTEM!C17… — Titius–Bode-style spacing: a_n = a_1 + s·2^(n-1). */
export function orbitSpacing(firstAU: number, spacing: number, count: number): number[] {
  const out = [firstAU];
  for (let n = 1; n < count; n++) out.push(Math.round((firstAU + spacing * Math.pow(2, n - 1)) * 1e6) / 1e6);
  return out;
}

/** Calculations!C119–C123 — where a debris disk sits (2:3 and 1:2 resonances of the outermost giant). */
export function debrisDisk(outerGiantAU: number, starMassSol: number): { innerAU: number; outerAU: number } {
  const P = Math.sqrt(Math.pow(outerGiantAU, 3) / starMassSol);
  const p23 = (P / 2) * 3;
  const p12 = P * 2;
  return { innerAU: Math.cbrt(p23 * p23 * starMassSol), outerAU: Math.cbrt(p12 * p12 * starMassSol) };
}

// ---------------------------------------------------------------------------
// Orbits
// ---------------------------------------------------------------------------

/** Kepler's third law around a star: period in years for a in AU. */
export function orbitalPeriodYears(smaAU: number, centralMassSol: number): number {
  return Math.sqrt(Math.pow(smaAU, 3) / centralMassSol);
}

/** General two-body period in days (SI masses in kg, a in km). MOON!C38. */
export function orbitalPeriodDays(smaKm: number, m1Kg: number, m2Kg: number): number {
  return (2 * Math.PI * Math.sqrt(Math.pow(smaKm * 1000, 3) / (G * (m1Kg + m2Kg)))) / DAY_S;
}

/** MOON!C39 — synodic period given two sidereal periods. */
export function synodicPeriodDays(pMoonDays: number, pPlanetDays: number): number {
  return 1 / Math.abs(1 / pMoonDays - 1 / pPlanetDays);
}

/** Hill sphere radius (km). Used for moon zones and Lagrange sketching. */
export function hillRadiusKm(smaKm: number, e: number, mKg: number, MKg: number): number {
  return smaKm * (1 - e) * Math.cbrt(mKg / (3 * MKg));
}

/** MOON!C30 — inner moon zone (fluid Roche limit, 2.44 factor), km. */
export function moonZoneInnerKm(planetRadiusKm: number, planetDensity: number, moonDensity: number): number {
  return 2.44 * planetRadiusKm * Math.cbrt(planetDensity / moonDensity);
}

/** MOON!C31 — outer moon zone (Hill/3-ish as the sheet computes it), km. */
export function moonZoneOuterKm(planetSmaAU: number, planetMassKg: number, starMassKg: number): number {
  return planetSmaAU * 150_000_000 * Math.cbrt(planetMassKg / (3 * starMassKg));
}

// ---------------------------------------------------------------------------
// Terrestrial bodies (PLANET sheet)
// ---------------------------------------------------------------------------

/** PLANET!C13 — density (g/cm³) from mass (M⊕) and core-mass fraction (%). */
export function planetDensity(massEarth: number, cmfPercent: number): number {
  const cmf = cmfPercent / 100;
  const compressed = (5.51 * Math.pow(massEarth, 0.189)) / Math.pow(1.07 - 0.21 * cmf, 3);
  if (massEarth > 0.6) return compressed;
  const uncompressed = 3.5 + 4.37 * cmf;
  return compressed > uncompressed ? compressed : uncompressed;
}

export interface TerrestrialDerived {
  densityGcc: number;
  radiusEarth: number;
  radiusKm: number;
  gravityG: number;
  escapeVelocityKms: number;
  rotationDirection: "Prograde" | "Retrograde" | "Undefined";
  tropicsDeg: number;
  polarCircleDeg: number;
  horizonKm: number;
}

/** PLANET!C11–C27. `radiusEarthOverride` lets a record pin radius (density is then back-computed). */
export function deriveTerrestrial(
  massEarth: number,
  cmfPercent = 33.4,
  axialTiltDeg = 23.5,
  observerHeightM = 1.75,
  radiusEarthOverride?: number,
): TerrestrialDerived {
  let density = planetDensity(massEarth, cmfPercent);
  let radius = Math.cbrt(massEarth / (density / 5.51));
  if (radiusEarthOverride && radiusEarthOverride > 0) {
    radius = radiusEarthOverride;
    density = (5.51 * massEarth) / Math.pow(radius, 3);
  }
  const gravity = massEarth / (radius * radius);
  const tilt = axialTiltDeg;
  return {
    densityGcc: density,
    radiusEarth: radius,
    radiusKm: radius * R_EARTH_KM,
    gravityG: gravity,
    escapeVelocityKms: Math.sqrt(massEarth / radius) * 11.186,
    rotationDirection: tilt === 90 ? "Undefined" : tilt >= 0 && tilt < 90 ? "Prograde" : "Retrograde",
    tropicsDeg: tilt < 90 ? tilt : 180 - tilt,
    polarCircleDeg: tilt < 90 ? 90 - tilt : 90 - (180 - tilt),
    horizonKm: Math.sqrt(2 * radius * R_EARTH_KM * 1000 * observerHeightM + observerHeightM * observerHeightM) / 1000,
  };
}

/** Calculations!C127–C135 — average surface temperature (K). */
export function surfaceTemperatureK(lumSol: number, distanceAU: number, bondAlbedo: number, greenhouse: number): number {
  const sigma = 5.6703e-5; // erg cm⁻² s⁻¹ K⁻⁴
  const L = 3.846e33 * lumSol; // erg/s
  const d = 1.496e13 * distanceAU; // cm
  const tau = greenhouse * 0.5841;
  const X = Math.sqrt(((1 - bondAlbedo) * L) / (16 * Math.PI * sigma));
  const tEff = Math.sqrt(X) / Math.sqrt(d);
  const tEq4 = Math.pow(tEff, 4) * (1 + (3 * tau) / 4);
  const tSur4 = tEq4 / 0.9;
  return Math.round(Math.sqrt(Math.sqrt(tSur4)));
}

/** Equilibrium temperature without greenhouse, for classification (K). */
export function equilibriumTemperatureK(lumSol: number, distanceAU: number, bondAlbedo: number): number {
  return 278.5 * Math.pow((1 - bondAlbedo) * lumSol, 0.25) / Math.sqrt(distanceAU);
}

/** Stellar flux relative to Earth (EWoCS aerosol bands use this). */
export function relativeFlux(lumSol: number, distanceAU: number): number {
  return lumSol / (distanceAU * distanceAU);
}

export interface GasSpec {
  name: string;
  formula: string;
  molarMassKgMol: number;
  percent: number;
}

/** Common gases, for the composition editor and retention check. */
export const GASES: Record<string, { name: string; molarMassKgMol: number }> = {
  H2: { name: "Hydrogen", molarMassKgMol: 0.002 },
  He: { name: "Helium", molarMassKgMol: 0.004 },
  CH4: { name: "Methane", molarMassKgMol: 0.016 },
  NH3: { name: "Ammonia", molarMassKgMol: 0.017 },
  H2O: { name: "Water vapour", molarMassKgMol: 0.018 },
  Ne: { name: "Neon", molarMassKgMol: 0.020 },
  N2: { name: "Nitrogen", molarMassKgMol: 0.028 },
  CO: { name: "Carbon monoxide", molarMassKgMol: 0.028 },
  O2: { name: "Oxygen", molarMassKgMol: 0.032 },
  H2S: { name: "Hydrogen sulfide", molarMassKgMol: 0.034 },
  Ar: { name: "Argon", molarMassKgMol: 0.040 },
  CO2: { name: "Carbon dioxide", molarMassKgMol: 0.044 },
  SO2: { name: "Sulfur dioxide", molarMassKgMol: 0.064 },
};

/** Calculations!C138 — mean molar mass (kg/mol) of a percent-by-volume mix. */
export function meanMolarMass(mix: { formula: string; percent: number }[]): number {
  let total = 0;
  let sum = 0;
  for (const g of mix) {
    const m = GASES[g.formula]?.molarMassKgMol;
    if (!m) continue;
    sum += m * g.percent;
    total += g.percent;
  }
  return total > 0 ? sum / total : 0.029;
}

/** PLANET!C56 — atmospheric density at the surface (kg/m³). */
export function atmosphericDensity(pressureAtm: number, molarMassKgMol: number, tempK: number): number {
  return (pressureAtm * 101325 * molarMassKgMol) / (8.3145 * tempK);
}

/**
 * Calculations!C141–C144 — gas retention rule of thumb. Returns v_rms/(v_esc/6):
 * < 1 means the gas is retained over geological time; ≥ 1 it escapes.
 * Exosphere temperature is scaled from Earth's 1500 K by T/287.
 */
export function gasStability(molarMassKgMol: number, surfaceTempK: number, escapeVelocityKms: number): number {
  const tExo = (surfaceTempK / 287) * 1500;
  const vRms = Math.sqrt((3 * 8.3145 * tExo) / molarMassKgMol);
  // the sheet scales Earth's escape velocity as 11200 m/s × (v_esc / v_esc,⊕)
  const vEsc = (escapeVelocityKms / 11.186) * 11200;
  return vRms / (vEsc / 6);
}

/** PLANET!C60 — Hadley-cell count from rotation period (hours). */
export function circulationCells(rotationHours: number): number | null {
  if (rotationHours >= 48) return 1;
  if (rotationHours >= 6) return 3;
  if (rotationHours >= 3) return 7;
  if (rotationHours > 0) return 5;
  return null;
}

// ---------------------------------------------------------------------------
// Tides & locking (Calculations!B237–C273)
// ---------------------------------------------------------------------------

export interface TidalBody {
  massKg: number;
  radiusM: number;
  densityKgM3: number;
  gravityMs2: number;
  /** Moment-of-inertia factor: 0.4 for a differentiated planet, 0.5 uniform sphere (sheet uses 0.5 for the moon). */
  inertiaFactor: number;
  /** Tidal dissipation factor Q (sheet: moon 40, planet 13). */
  q: number;
  /** Initial spin rate rad/s. */
  spinRadS: number;
}

const RIGIDITY = 3e10;

export function loveNumberK2(b: TidalBody): number {
  return 1.5 / (1 + (19 * RIGIDITY) / (2 * b.densityKgM3 * b.gravityMs2 * b.radiusM));
}

/** Time (Gyr) for `body` to become tidally locked to `perturberMassKg` at separation `aM`. */
export function lockingTimeGyr(body: TidalBody, perturberMassKg: number, aM: number): number {
  const I = body.inertiaFactor * body.massKg * body.radiusM * body.radiusM;
  const k2 = loveNumberK2(body);
  const t = (body.spinRadS * Math.pow(aM, 6) * I * body.q) / (3 * G * perturberMassKg * perturberMassKg * k2 * Math.pow(body.radiusM, 5));
  return t * 3.171e-17;
}

export function lockingLabel(gyr: number): string {
  if (gyr < 0.001) return "Very likely locked";
  if (gyr < 0.01) return "Possibly locked in millions of years";
  if (gyr < 0.1) return "Possibly locked in 10s of millions of years";
  if (gyr < 1) return "Possibly locked in 100s of millions of years";
  if (gyr < 10) return "Possibly locked in billions of years";
  if (gyr < 100) return "Possibly locked in 10s of billions of years";
  return "Possibly locked in 100s of billions of years";
}

/** Calculations!C270 — tidal force term 2·G·m1·m2/a³ (N·m as the sheet labels it). */
export function tidalForce(m1Kg: number, m2Kg: number, aM: number): number {
  return (2 * G * m1Kg * m2Kg) / Math.pow(aM, 3);
}

/** Earth–Moon–Sun total for normalising "Earth tides". */
export const EARTH_SYSTEM_TIDAL_FORCE = 1_501_373_691_439.3;
