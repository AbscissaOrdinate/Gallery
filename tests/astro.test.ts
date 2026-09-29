import { describe, it, expect } from "vitest";
import * as W from "../src/core/astro/worldsmith";
import * as E from "../src/core/astro/ewocs";

describe("worldsmith star (sheet defaults: 1 M☉, 4.5 Gyr)", () => {
  const s = W.deriveStar(1, 4.5);
  it("matches STAR sheet", () => {
    expect(s.luminositySol).toBeCloseTo(1);
    expect(s.radiusSol).toBeCloseTo(1);
    expect(s.temperatureK).toBeCloseTo(5776, 0);
    expect(s.spectral).toBe("G2.8V");
    expect(s.maxAgeGyr).toBeCloseTo(10);
    expect(s.hzInnerAU).toBeCloseTo(0.9534625892, 6);
    expect(s.hzOuterAU).toBeCloseTo(1.373605639, 6);
    expect(s.frostLineAU).toBeCloseTo(4.85);
    expect(s.innerLimitAU).toBeCloseTo(0.007300358894, 6);
    expect(s.earthlikeLife).toBe("Yes");
  });
  it("orbit spacing reproduces PLANETARY SYSTEM orbits", () => {
    expect(W.orbitSpacing(0.4, 0.3, 8)).toEqual([0.4, 0.7, 1, 1.6, 2.8, 5.2, 10, 19.6]);
  });
  it("debris disk from outermost giant", () => {
    const d = W.debrisDisk(30.07, 1);
    expect(d.innerAU).toBeCloseTo(39.40284686, 5);
    expect(d.outerAU).toBeCloseTo(47.73314963, 5);
  });
  it("spectral classes across the sequence", () => {
    expect(W.spectralClass(3000)).toMatch(/^M/);
    expect(W.spectralClass(9000)).toMatch(/^A/);
    expect(W.deriveStar(0.3).luminositySol).toBeCloseTo(0.23 * Math.pow(0.3, 2.3));
    expect(W.deriveStar(3).luminositySol).toBeCloseTo(1.4 * Math.pow(3, 3.5));
  });
});

describe("worldsmith terrestrial (sheet defaults: 1 M⊕, CMF 33.4%)", () => {
  const t = W.deriveTerrestrial(1, 33.4, 23.5, 1.75);
  it("matches PLANET sheet", () => {
    expect(t.densityGcc).toBeCloseTo(5.512314848, 6);
    expect(t.radiusEarth).toBeCloseTo(0.99986, 5);
    expect(t.radiusKm).toBeCloseTo(6370.10806, 3);
    expect(t.gravityG).toBeCloseTo(1.000280059, 6);
    expect(t.escapeVelocityKms).toBeCloseTo(11.1867831, 5);
    expect(t.rotationDirection).toBe("Prograde");
    expect(t.tropicsDeg).toBe(23.5);
    expect(t.polarCircleDeg).toBe(66.5);
    expect(t.horizonKm).toBeCloseTo(4.721798521, 5);
  });
  it("small-body density floor applies below 0.6 M⊕", () => {
    expect(W.planetDensity(0.107, 25)).toBeCloseTo(3.5 + 4.37 * 0.25, 6); // Mars-ish uncompressed floor wins
  });
  it("surface temperature 288 K for Earth", () => {
    expect(W.surfaceTemperatureK(1, 1, 0.29, 1)).toBe(288);
  });
  it("atmosphere: mean molar mass and density", () => {
    const mix = [
      { formula: "O2", percent: 20.95 },
      { formula: "CO2", percent: 0.04 },
      { formula: "Ar", percent: 0.93 },
      { formula: "N2", percent: 78.08 },
    ];
    const mm = W.meanMolarMass(mix);
    expect(mm).toBeCloseTo(0.028956, 5);
    expect(W.atmosphericDensity(1, mm, 288)).toBeCloseTo(1.225255202, 5);
  });
  it("gas retention: N2 and O2 kept on Earth, H2 lost", () => {
    expect(W.gasStability(0.028, 288, 11.1867831)).toBeCloseTo(0.6203023558, 4);
    expect(W.gasStability(0.032, 288, 11.1867831)).toBeCloseTo(0.5802397229, 3);
    expect(W.gasStability(0.002, 288, 11.1867831)).toBeGreaterThan(1);
  });
  it("circulation cells", () => {
    expect(W.circulationCells(24)).toBe(3);
    expect(W.circulationCells(60)).toBe(1);
    expect(W.circulationCells(4)).toBe(7);
    expect(W.circulationCells(2)).toBe(5);
  });
});

describe("worldsmith moon (sheet defaults: Luna)", () => {
  it("moon zones, periods, locking", () => {
    expect(W.moonZoneInnerKm(6370.10806, 5.512314848, 3.34)).toBeCloseTo(18368.16656, 2);
    expect(W.moonZoneOuterKm(1, 5.97e24, 1.99e30)).toBeCloseTo(1_500_000, -2);
    const pMoon = W.orbitalPeriodDays(384748, 5.972e24, 7.342e22);
    expect(pMoon).toBeCloseTo(27.33093732, 4);
    expect(W.synodicPeriodDays(pMoon, 365.256)).toBeCloseTo(29.5414278, 4);

    const moon: W.TidalBody = { massKg: 7.35e22, radiusM: 1737400, densityKgM3: 3340, gravityMs2: 1.622574, inertiaFactor: 0.5, q: 40, spinRadS: (2 * Math.PI) / (12 * 3600) };
    const planet: W.TidalBody = { massKg: 5.972e24, radiusM: 6370108.06, densityKgM3: 5512.314848, gravityMs2: 9.812747377, inertiaFactor: 0.4, q: 13, spinRadS: (2 * Math.PI) / (24 * 3600) };
    expect(W.loveNumberK2(moon)).toBeCloseTo(0.0479712625, 6);
    expect(W.loveNumberK2(planet)).toBeCloseTo(0.8209599434, 6);
    expect(W.lockingTimeGyr(moon, 5.972e24, 384748000)).toBeCloseTo(0.01224900008, 4);
    expect(W.lockingTimeGyr(planet, 7.35e22, 384748000)).toBeCloseTo(1.012650551, 2);
    expect(W.lockingTimeGyr(planet, 1.989e30, 149.6e9)).toBeCloseTo(4.778549077, 2);
    expect(W.lockingLabel(1.01)).toBe("Possibly locked in billions of years");
    const total = W.tidalForce(7.35e22, 5.972e24, 384748000) + W.tidalForce(5.972e24, 1.989e30, 149.6e9);
    expect(total / W.EARTH_SYSTEM_TIDAL_FORCE).toBeCloseTo(1, 3);
  });
});

describe("ewocs", () => {
  it("mass classes", () => {
    expect(E.massClass(1).subclass).toBe("Mesoterrene");
    expect(E.massClass(0.107).subclass).toBe("Subterrene");
    expect(E.massClass(0.0123).subclass).toBe("Superdwarf");
    expect(E.massClass(317.8).subclass).toBe("Mesogiant");
    expect(E.massClass(14.5).subclass).toBe("Microgiant");
    expect(E.massClass(0.00016).subclass).toBe("Microdwarf");
  });
  it("core class from CMF", () => {
    expect(E.coreClass(33.4).id).toBe("Telluric");
    expect(E.coreClass(70).id).toBe("Hermian");
    expect(E.coreClass(5).id).toBe("Selenian");
  });
  it("aerosol band guess", () => {
    expect(E.aerosolGuess(288)?.id).toBe("Hydronian");
    expect(E.aerosolGuess(735, false, false)?.id).toBe("Chloridian");
    expect(E.aerosolGuess(60)?.id).toBe("Methanean");
  });
  it("Earth shorthand matches the Examples sheet", () => {
    const r = E.classify({
      massEarth: 1,
      gasFraction: "Terrestrial",
      coRatio: "Oxidic",
      volatiles: "Lapidian",
      cmfPercent: 33.4,
      atmoComposition: "Rhean",
      aerosol: "Hydronian",
      surfaceType: "Gaian",
      tempSubtype: "Tundral",
      liquidPercent: 71,
      fluid: "Aquatic",
      miscLife: "Macrobiotic",
    });
    expect(r.shorthand).toBe("Macrobiotic Marine Tundral AquaGaian");
    expect(r.massClass?.subclass).toBe("Mesoterrene");
    expect(r.bulk).toEqual(["Terrestrial", "Oxidic", "Lapidian", "Telluric"]);
  });
  it("Jupiter, Titan, Pluto shorthands", () => {
    expect(E.classify({ massEarth: 317.8, gasFraction: "Jovian", coRatio: "Carbonatic", aerosol: "Ammonian" }).shorthand).toBe("AmmoJovian");
    expect(
      E.classify({ massEarth: 0.0225, gasFraction: "Terrestrial", surfaceType: "Calidian", tempSubtype: "Tepidal", liquidPercent: 2, fluid: "Titanian", isSatellite: true, tidallyLocked: true }).shorthand,
    ).toBe("Vesperian Conlectic Tepidal TitanoCalidian Satellite");
    expect(E.classify({ massEarth: 0.0022, gasFraction: "Terrestrial", surfaceType: "Arean", tempSubtype: "Tundral", fluid: "Azotian", axialTiltDeg: 120, miscMultiworld: "Dioscuran" }).shorthand).toBe(
      "Skolian Dioscuran Tundral AzoArean",
    );
    expect(E.classify({ massEarth: 0.0123, gasFraction: "Terrestrial", surfaceType: "Apnean", cmfPercent: 5, tidallyLocked: true, isSatellite: true }).shorthand).toBe("Vesperian Apnean Satellite");
    expect(E.classify({ massEarth: 14.5, gasFraction: "Neptunian", aerosol: "CryoAzurian", axialTiltDeg: 98 }).shorthand).toBe("Skolian CryoAzurian Neptunian");
  });
});
