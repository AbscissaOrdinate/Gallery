/**
 * Orion's Arm Extended World Classification System (EWoCS, prototype 0.9) —
 * the taxonomy as tables plus the classifiers that can be computed from
 * numbers (mass class, core class, temperature subtype, aerosol band, liquid
 * coverage) and the shorthand builder ("Marine Tundral AquaGaian").
 *
 * Categories that need judgement (terrestrial surface type, composition
 * fractions, life, history) stay as enum fields on the body record; this
 * module only provides the option lists and descriptions for them.
 */

export interface Term {
  id: string;
  label: string;
  description: string;
  examples?: string;
}

// ---- Mass (Mass sheet) ----------------------------------------------------

export interface MassClass {
  sizeClass: string;
  subclass: string;
  minEarth: number; // Mmin (M⊕)
  description?: string;
  examples?: string;
}

export const MASS_CLASSES: MassClass[] = [
  { sizeClass: "Planetesimal", subclass: "Microplanetesimal", minEarth: 0 },
  { sizeClass: "Planetesimal", subclass: "Subplanetesimal", minEarth: 1.68e-15, examples: "101955 Bennu" },
  { sizeClass: "Planetesimal", subclass: "Mesoplanetesimal", minEarth: 1.68e-12, description: "Rubble pile and solid body abundance crossover.", examples: "Phobos, Deimos" },
  { sizeClass: "Planetesimal", subclass: "Superplanetesimal", minEarth: 1.68e-9, description: "Too small to have undergone differentiation, unless a fragment of a larger body.", examples: "Elara, Pandora" },
  { sizeClass: "Planetoid", subclass: "Microplanetoid", minEarth: 2e-7, description: "May have formed a partially differentiated interior.", examples: "Hyperion, Amalthea, Janus" },
  { sizeClass: "Planetoid", subclass: "Subplanetoid", minEarth: 1e-6, description: "Hydrostatic equilibrium may have occurred in the past.", examples: "Psyche, Iris, Phoebe" },
  { sizeClass: "Planetoid", subclass: "Mesoplanetoid", minEarth: 5e-6, examples: "Miranda, Proteus, Mimas" },
  { sizeClass: "Planetoid", subclass: "Superplanetoid", minEarth: 1.3e-5, description: "Highest mass bodies that might never have been in HE.", examples: "Varda, Vesta, Pallas" },
  { sizeClass: "Dwarf", subclass: "Microdwarf", minEarth: 5e-5, description: "Lowest mass possible to maintain HE after formation.", examples: "Quaoar, Ceres, Varuna" },
  { sizeClass: "Dwarf", subclass: "Subdwarf", minEarth: 2.5e-4, examples: "Titania, Rhea, Makemake" },
  { sizeClass: "Dwarf", subclass: "Mesodwarf", minEarth: 1e-3, examples: "Triton, Pluto, Eris" },
  { sizeClass: "Dwarf", subclass: "Superdwarf", minEarth: 5e-3, examples: "Io, Luna, Europa" },
  { sizeClass: "Terrene", subclass: "Microterrene", minEarth: 0.02, description: "Too large to fall out of HE. Geologically active for 10s to 100s of Myr.", examples: "Mercury, Ganymede, Titan" },
  { sizeClass: "Terrene", subclass: "Subterrene", minEarth: 0.08, description: "Likely sustained geotectonic activity for around a billion years after formation.", examples: "Mars" },
  { sizeClass: "Terrene", subclass: "Mesoterrene", minEarth: 0.4, description: "Can maintain H/He envelopes. Sustained geotectonics are possible.", examples: "Venus, Earth" },
  { sizeClass: "Terrene", subclass: "Superterrene", minEarth: 2.5, description: "Tectonic plates become very unlikely in rocky worlds.", examples: "Janssen, Tartarus" },
  { sizeClass: "Giant", subclass: "Microgiant", minEarth: 10, description: "Largest bodies capable of lacking any H/He envelope.", examples: "Uranus, Neptune" },
  { sizeClass: "Giant", subclass: "Subgiant", minEarth: 50, description: "Past runaway gas accretion, but not massive enough to compress it well.", examples: "Saturn" },
  { sizeClass: "Giant", subclass: "Mesogiant", minEarth: 150, examples: "Jupiter" },
  { sizeClass: "Giant", subclass: "Supergiant", minEarth: 500, description: "Radius begins to decrease with mass." },
  { sizeClass: "Planetar", subclass: "Microplanetar", minEarth: 1430, description: "More likely to have formed through disk/gas instability.", examples: "HR 8799 c" },
  { sizeClass: "Planetar", subclass: "Subplanetar", minEarth: 4130, description: "Deuterium burning during formation." },
  { sizeClass: "Planetar", subclass: "Mesoplanetar", minEarth: 7950, description: "Large enough to support hydrogen burning with ultrahigh metallicity.", examples: "Luhman 16A/B" },
  { sizeClass: "Planetar", subclass: "Superplanetar", minEarth: 20660, description: "Massive enough for lithium burning; often stars rather than worlds.", examples: "15 Sge B" },
];

export function massClass(massEarth: number): MassClass {
  let best = MASS_CLASSES[0];
  for (const c of MASS_CLASSES) if (massEarth >= c.minEarth) best = c;
  return best;
}

// ---- Composition (Compositon sheet) ---------------------------------------

export const GAS_FRACTION: Term[] = [
  { id: "Jovian", label: "Jovian", description: "Mostly hydrogen and helium by mass.", examples: "Jupiter" },
  { id: "Neptunian", label: "Neptunian", description: "H/He make up 0.1–50% of the world by mass.", examples: "Uranus, GJ 436 b" },
  { id: "Terrestrial", label: "Terrestrial", description: "Less than 0.1% of the total mass is H or He.", examples: "Earth, Ganymede" },
];
export const VOLATILE_FRACTION: Term[] = [
  { id: "Ymirian", label: "Ymirian", description: "Volatiles > 67% of the solid mass.", examples: "Rhea, Iapetus, Uranus" },
  { id: "Gelidian", label: "Gelidian", description: "33–67% volatiles.", examples: "Eris, Ganymede, Pluto" },
  { id: "Cerean", label: "Cerean", description: "1–33% volatiles by mass, excluding H/He.", examples: "Europa, Ceres" },
  { id: "Lapidian", label: "Lapidian", description: "Volatiles < 1% of the non-gaseous mass.", examples: "Earth, Mercury" },
];
export const CO_RATIO: Term[] = [
  { id: "Carbonic", label: "Carbonic", description: "Enough excess carbon for a graphite/diamond-rich crust. C/O > 10." },
  { id: "Carbidic", label: "Carbidic", description: "Dominated by carbide minerals. C/O 1–10.", examples: "Janssen" },
  { id: "Carbonatic", label: "Carbonatic", description: "Blend of carbonate, oxide and carbide minerals. C/O 0.1–1.", examples: "Jupiter, Neptune" },
  { id: "Oxidic", label: "Oxidic", description: "Dominated by oxides / oxygen-rich volatiles. C/O < 0.1.", examples: "Earth" },
];
export const CORE_FRACTION: Term[] = [
  { id: "Ferrinian", label: "Ferrinian", description: "Siderophile core > 80% of non-volatile mass." },
  { id: "Hermian", label: "Hermian", description: "Siderophile metals 50–80%.", examples: "Mercury, 16 Psyche" },
  { id: "Telluric", label: "Telluric", description: "Metal core 15–50%.", examples: "Earth, Mars, Io, Vesta" },
  { id: "Selenian", label: "Selenian", description: "Siderophile metals 0–15%.", examples: "Luna, 7 Iris" },
];
export function coreClass(cmfPercent: number): Term {
  if (cmfPercent > 80) return CORE_FRACTION[0];
  if (cmfPercent > 50) return CORE_FRACTION[1];
  if (cmfPercent >= 15) return CORE_FRACTION[2];
  return CORE_FRACTION[3];
}
export const ATMO_COMPOSITION: Term[] = [
  { id: "Jotunnian", label: "Jotunnian", description: "Hydrogen-dominated atmosphere.", examples: "Neptune, Jupiter" },
  { id: "Helian", label: "Helian", description: "Helium-dominated atmosphere.", examples: "Kepler-10c" },
  { id: "Ydratian", label: "Ydratian", description: "Dominated by simple hydrides (CH4, NH3, H2O, HF)." },
  { id: "Rhean", label: "Rhean", description: "Dominated by diatomic non-metals (N2, O2, F2).", examples: "Earth, Titan" },
  { id: "Minervan", label: "Minervan", description: "Other non-metal compounds (CO, CO2, SO2, NO2…).", examples: "Venus, Mars, Io" },
  { id: "Hephaestian", label: "Hephaestian", description: "Metal / metalloid compound atmosphere (SiO2, MgO, Na, Fe).", examples: "Janssen" },
  { id: "Edelian", label: "Edelian", description: "Dominated by noble gases.", examples: "Luna" },
];

// ---- Aerosols (Aerosols sheet) — temperature bands -------------------------

export interface AerosolClass extends Term {
  regime: string;
  minK: number;
  maxK: number;
  minFlux: number;
  maxFlux?: number;
  composition: string;
  albedo?: string;
  /** Azurian (cloudless) variants are the fallback inside a regime. */
  azurian?: boolean;
}

export const AEROSOLS: AerosolClass[] = [
  { id: "CryoAzurian", label: "CryoAzurian", regime: "Cryothermal", minK: 0, maxK: 90, minFlux: 0, maxFlux: 0.008, composition: "n/a", description: "No visible clouds and faint organic hazes.", examples: "Neptune, Uranus", albedo: "0.25–0.35", azurian: true },
  { id: "Frigidian", label: "Frigidian", regime: "Cryothermal", minK: 5, maxK: 20, minFlux: 0, maxFlux: 1.8e-6, composition: "H2", description: "Extremely cold hydrogen clouds. Very rare." },
  { id: "Neonean", label: "Neonean", regime: "Cryothermal", minK: 15, maxK: 35, minFlux: 1.2e-7, maxFlux: 7.5e-5, composition: "Ne", description: "Very cold neon clouds.", albedo: "0.5–0.7" },
  { id: "Borean", label: "Borean", regime: "Cryothermal", minK: 35, maxK: 60, minFlux: 7.5e-5, maxFlux: 0.0012, composition: "N2, O2", description: "Minimal organic hazes; needs N/O enrichment.", albedo: "0.3–0.6" },
  { id: "Methanean", label: "Methanean", regime: "Cryothermal", minK: 60, maxK: 90, minFlux: 0.0012, maxFlux: 0.008, composition: "CH4, Ar", description: "Moderate organic hazes; sometimes argon clouds.", albedo: "0.4–0.6" },
  { id: "MesoAzurian", label: "MesoAzurian", regime: "Mesothermal", minK: 90, maxK: 550, minFlux: 0.008, maxFlux: 16, composition: "n/a", description: "No clouds and minimal organic / organosulfur haze.", examples: "Brahe", azurian: true },
  { id: "Tholian", label: "Tholian", regime: "Mesothermal", minK: 60, maxK: 400, minFlux: 0.0012, maxFlux: 4.4, composition: "Organic compounds", description: "Organic hazes dominate over cloud layers.", examples: "Titan", albedo: "0.2–0.3" },
  { id: "Sulfanian", label: "Sulfanian", regime: "Mesothermal", minK: 80, maxK: 180, minFlux: 0.0046, maxFlux: 0.16, composition: "H2S, NH3, (NH4)HS", description: "Sulfur-enriched ammonian worlds.", albedo: "0.3–0.4" },
  { id: "Ammonian", label: "Ammonian", regime: "Mesothermal", minK: 80, maxK: 190, minFlux: 0.0046, maxFlux: 0.2, composition: "NH3, NH4HS, H2O", description: "Moderate organic hazes; discoloured NH4HS clouds lower down.", examples: "Jupiter, Saturn", albedo: "0.3–0.6" },
  { id: "Hydronian", label: "Hydronian", regime: "Mesothermal", minK: 175, maxK: 350, minFlux: 0.14, maxFlux: 2.6, composition: "H2O", description: "Water clouds with little to no haze.", examples: "Earth", albedo: "0.7–0.85" },
  { id: "Acidian", label: "Acidian", regime: "Mesothermal", minK: 250, maxK: 500, minFlux: 0.64, maxFlux: 11, composition: "H2SO4, H3PO4, H2O", description: "Sulfuric / phosphoric acid clouds and dense sulfur hazes.", examples: "Venus", albedo: "0.6–0.8" },
  { id: "PyroAzurian", label: "PyroAzurian", regime: "Pyrothermal", minK: 550, maxK: 1300, minFlux: 16.5, maxFlux: 530, composition: "n/a", description: "No clouds; faint organosulfur and sulfur aerosols.", azurian: true },
  { id: "Sulfolian", label: "Sulfolian", regime: "Pyrothermal", minK: 400, maxK: 800, minFlux: 4.4, maxFlux: 75, composition: "Organosulfur, sulfur", description: "Dense sulfur and organosulfur haze.", albedo: "0.3–0.6" },
  { id: "Silicolean", label: "Silicolean", regime: "Pyrothermal", minK: 550, maxK: 1000, minFlux: 16.5, maxFlux: 175, composition: "Silicone oils, fluorosilicones", description: "Hazes of silicone oils and organometallics.", albedo: "0.1–0.2" },
  { id: "Chloridian", label: "Chloridian", regime: "Pyrothermal", minK: 620, maxK: 850, minFlux: 27, maxFlux: 95, composition: "CsCl, RbCl, KCl, ZnS", description: "Alkali chloride and zinc sulfide clouds." },
  { id: "Alkalinean", label: "Alkalinean", regime: "Pyrothermal", minK: 800, maxK: 1150, minFlux: 75, maxFlux: 325, composition: "LiF, Li2S, Na2S, NaCl", description: "Alkali and sulfide dominated clouds.", albedo: "0.01–0.05" },
  { id: "Erythronian", label: "Erythronian", regime: "Pyrothermal", minK: 1100, maxK: 1350, minFlux: 275, maxFlux: 620, composition: "Cr, MnO, MnS", description: "Chromium and manganese cloud species." },
  { id: "HyperpyroAzurian", label: "HyperpyroAzurian", regime: "Hyperpyrothermal", minK: 1300, maxK: 2200, minFlux: 530, maxFlux: 4400, composition: "n/a", description: "Hot worlds with no visible clouds or hazes.", azurian: true },
  { id: "Enstatian", label: "Enstatian", regime: "Hyperpyrothermal", minK: 1200, maxK: 1700, minFlux: 390, maxFlux: 1600, composition: "Fe, FeO, MgO, SiO2", description: "Silicate clouds; faint TiO haze.", examples: "51 Pegasi b", albedo: "0.2–0.5" },
  { id: "Rutilian", label: "Rutilian", regime: "Hyperpyrothermal", minK: 1400, maxK: 2000, minFlux: 720, maxFlux: 3000, composition: "TiO, TiO2, VO2", description: "Dense titanium / vanadium oxide haze.", albedo: "0–0.05" },
  { id: "Refractian", label: "Refractian", regime: "Hyperpyrothermal", minK: 1700, maxK: 2300, minFlux: 1600, maxFlux: 5300, composition: "Al2O3, CaO, perovskites", description: "No hazes; gaseous Ti/V oxides may invert the temperature profile.", examples: "Janssen" },
  { id: "Carbean", label: "Carbean", regime: "Hyperpyrothermal", minK: 2000, maxK: 2900, minFlux: 3000, maxFlux: 13400, composition: "TiC, CaC2, VC, TiN", description: "Carbon haze from dissociated SiC. Carbon-rich worlds only.", albedo: "0–0.1" },
  { id: "EpistellarAzurian", label: "EpistellarAzurian", regime: "Hyperpyrothermal", minK: 2200, maxK: 5000, minFlux: 4400, composition: "n/a", description: "Ultra-hot subset of HyperpyroAzurian worlds.", examples: "KELT-9b", azurian: true },
  { id: "Aithalian", label: "Aithalian", regime: "Hyperpyrothermal", minK: 2600, maxK: 3400, minFlux: 8700, maxFlux: 25000, composition: "C", description: "Fullerene / carbon allotrope haze overpowering any clouds.", albedo: "0–0.02" },
];

/** Candidate aerosol classes for a temperature (K); the cloudless "Azurian" of the regime is listed first. */
export function aerosolCandidates(tempK: number): AerosolClass[] {
  const hits = AEROSOLS.filter((a) => tempK >= a.minK && tempK < a.maxK);
  return hits.sort((a, b) => (a.azurian === b.azurian ? 0 : a.azurian ? -1 : 1));
}

/** Best-guess aerosol class: the most specific (narrowest) non-Azurian band containing T, else the Azurian one. */
export function aerosolGuess(tempK: number, carbonRich = false, hasWater = true): AerosolClass | undefined {
  const c = aerosolCandidates(tempK).filter((a) => !a.azurian && (carbonRich || !["Carbean", "Aithalian"].includes(a.id)));
  const preferred = hasWater ? c.find((a) => a.id === "Hydronian") : undefined;
  if (preferred) return preferred;
  c.sort((a, b) => a.maxK - a.minK - (b.maxK - b.minK));
  return c[0] ?? aerosolCandidates(tempK)[0];
}

// ---- Terrestrial types (Terrestrial Types sheet) --------------------------

export const SURFACE_TYPES: Term[] = [
  { id: "Gaian", label: "Gaian", description: "Earth-like worlds with liquids present on the surface.", examples: "Earth" },
  { id: "Abyssal", label: "Abyssal [Gaian]", description: "Gaian worlds with compressible liquids (supercritical pressures, subcritical temperatures)." },
  { id: "Thalassic", label: "Thalassic [Gaian]", description: "Gaian worlds with high-pressure ices covering the seafloor (> ~1 kbar).", examples: "Janssen" },
  { id: "Tohulian", label: "Tohulian [Gaian]", description: "Gaian worlds with a supercritical fluid layer atop surface liquids." },
  { id: "Calidian", label: "Calidian [Gaian]", description: "Gaian worlds with atmospheres primarily in the vapour phase.", examples: "Titan" },
  { id: "Cytherean", label: "Cytherean", description: "Venus-like: a supercritical fluid layer above a solid surface.", examples: "Venus" },
  { id: "Muspellian", label: "Muspellian [Cytherean]", description: "Cytherean worlds with high-pressure ices coating the surface." },
  { id: "Europan", label: "Europan", description: "Europa-like: subcrustal hydrosphere.", examples: "Europa, Ceres" },
  { id: "Ganymedean", label: "Ganymedean [Europan]", description: "Europan worlds with high-pressure ices below the subcrustal hydrosphere.", examples: "Ganymede, Callisto" },
  { id: "Phlegethean", label: "Phlegethean [Europan]", description: "Europan worlds with subsurface supercritical fluids." },
  { id: "Agonian", label: "Agonian", description: "Gaseous atmosphere above the triple pressure but no liquids or supercritical fluids." },
  { id: "Arean", label: "Arean", description: "Mars-like: surface pressure below the triple point of the atmosphere, but above vacuum.", examples: "Mars, Io" },
  { id: "Chionian", label: "Chionian [Arean]", description: "Arean worlds with an extensive surface cryosphere that flows glacially.", examples: "Pluto, Triton" },
  { id: "Apnean", label: "Apnean", description: "Airless worlds; surface pressure below 0.1 nanobar.", examples: "Luna, Mercury" },
];
export const TEMP_SUBTYPES: Term[] = [
  { id: "Thermal", label: "Thermal", description: "Too hot for frozen precipitation to reach the surface." },
  { id: "Tepidal", label: "Tepidal", description: "Snow and ice occur, but no permanent ice caps.", examples: "Titan, Io" },
  { id: "Tundral", label: "Tundral", description: "Permanent accumulation of snow and ice in glaciers and ice caps.", examples: "Earth, Mars, Pluto" },
  { id: "Glacial", label: "Glacial", description: "Global temperatures well below the freezing / deposition point.", examples: "Triton" },
];
export const LIQUID_COVERAGE: Term[] = [
  { id: "Pelagic", label: "Pelagic", description: "> 90% of the surface covered by liquid." },
  { id: "Marine", label: "Marine", description: "60–90% covered, often one interconnected ocean.", examples: "Earth" },
  { id: "Estuarine", label: "Estuarine", description: "40–60% covered.", examples: "Tohul" },
  { id: "Lacustrine", label: "Lacustrine", description: "10–40% covered, often shallow isolated bodies." },
  { id: "Conlectic", label: "Conlectic", description: "< 10% covered.", examples: "Titan" },
];
export function liquidCoverageClass(percent: number): Term {
  if (percent > 90) return LIQUID_COVERAGE[0];
  if (percent >= 60) return LIQUID_COVERAGE[1];
  if (percent >= 40) return LIQUID_COVERAGE[2];
  if (percent >= 10) return LIQUID_COVERAGE[3];
  return LIQUID_COVERAGE[4];
}

/**
 * Temperature subtype guess from mean surface temperature relative to the
 * surface fluid's freezing point (K). Bands are heuristic: ±~25 K around the
 * freezing point behaves like Earth's tundral/tepidal split.
 */
export function tempSubtypeGuess(surfaceTempK: number, fluidFreezeK: number): Term {
  const d = surfaceTempK - fluidFreezeK;
  if (d > 40) return TEMP_SUBTYPES[0];
  if (d > 20) return TEMP_SUBTYPES[1];
  if (d > -30) return TEMP_SUBTYPES[2];
  return TEMP_SUBTYPES[3];
}

// ---- Fluids (Terrestrial Fluid Types sheet) --------------------------------

export interface FluidType extends Term {
  prefix: string;
  fluids: string;
  /** Approximate 1-bar melting point (K) for the temperature-subtype guess. */
  freezeK: number;
}
export const FLUIDS: FluidType[] = [
  { id: "Aquatic", label: "Aquatic", prefix: "Aqua", fluids: "Water", freezeK: 273, description: "Usually pure or nearly pure water.", examples: "Earth, Europa" },
  { id: "Amunian", label: "Amunian", prefix: "Amuno", fluids: "Ammonia", freezeK: 195, description: "Typically with water as a dihydrate." },
  { id: "Titanian", label: "Titanian", prefix: "Titano", fluids: "Methane, ethane", freezeK: 91, description: "Methane/ethane with 1–10% propane.", examples: "Titan" },
  { id: "Capnian", label: "Capnian", prefix: "Capno", fluids: "Carbon dioxide", freezeK: 217, description: "Needs > 5.2 bar to be liquid; mostly Arean or Cytherean worlds.", examples: "Mars, Venus" },
  { id: "Azotian", label: "Azotian", prefix: "Azo", fluids: "Nitrogen", freezeK: 63, description: "Very cold icy bodies.", examples: "Pluto" },
  { id: "Monoxian", label: "Monoxian", prefix: "Monoxo", fluids: "Carbon monoxide", freezeK: 68, description: "Carbon-rich systems." },
  { id: "Petrolic", label: "Petrolic", prefix: "Petro", fluids: "Petroleum", freezeK: 220, description: "Hydrocarbon mix comparable to crude oil." },
  { id: "Bitumic", label: "Bitumic", prefix: "Bitumo", fluids: "Bitumen", freezeK: 320, description: "High-temperature petrolic worlds." },
  { id: "Dionysian", label: "Dionysian", prefix: "Diono", fluids: "Alcohols", freezeK: 175, description: "Methanol / ethanol." },
  { id: "Igneous", label: "Igneous", prefix: "Igneo", fluids: "Magma; metal oxides", freezeK: 1400, description: "SiO2, MgO, FeO, metallic iron.", examples: "Janssen" },
  { id: "Salific", label: "Salific", prefix: "Salifo", fluids: "Metal salts", freezeK: 1074, description: "NaCl, KCl, Na2SO4." },
  { id: "Hepatic", label: "Hepatic", prefix: "Hepa", fluids: "Hydrogen sulfide", freezeK: 187, description: "Cold sulfur-rich worlds." },
  { id: "Phosphanic", label: "Phosphanic", prefix: "Phosphano", fluids: "Phosphine", freezeK: 140, description: "Rare; usually in methanol solution." },
  { id: "Amylian", label: "Amylian", prefix: "Amy", fluids: "Nitrogen oxides", freezeK: 262, description: "NO2 / N2O4." },
  { id: "Ionean", label: "Ionean", prefix: "Io", fluids: "Sulfur oxides", freezeK: 200, description: "Cold Arean worlds; with CO2 on Cytherean ones.", examples: "Io" },
  { id: "Disulfian", label: "Disulfian", prefix: "Disulfo", fluids: "Carbon disulfide", freezeK: 162, description: "Volcanically active carbon-rich worlds." },
  { id: "Cyanic", label: "Cyanic", prefix: "Cyano", fluids: "Hydrogen cyanide", freezeK: 260, description: "In place of ammonia on carbon-rich worlds." },
  { id: "Vitriolic", label: "Vitriolic", prefix: "Vitrio", fluids: "Sulfuric acid", freezeK: 283, description: "Common as virga on Cytherean worlds; rare as surface liquid." },
  { id: "Phosphoric", label: "Phosphoric", prefix: "Phospho", fluids: "Phosphoric acid", freezeK: 315, description: "Extremely rare as a surface liquid." },
  { id: "Carbonylic", label: "Carbonylic", prefix: "Carbonylo", fluids: "Metal carbonyls", freezeK: 253, description: "Cold metallic worlds; iron pentacarbonyl." },
  { id: "Fortic", label: "Fortic", prefix: "Forto", fluids: "Nitric acid", freezeK: 231, description: "Aqueous or ammonious solution." },
  { id: "Formamian", label: "Formamian", prefix: "Forma", fluids: "Formamide", freezeK: 276, description: "With ammonia and/or formic acid." },
  { id: "Brimstonian", label: "Brimstonian", prefix: "Brimo", fluids: "Sulfur", freezeK: 388, description: "Active sulfur-rich worlds." },
  { id: "Neonic", label: "Neonic", prefix: "Neono", fluids: "Neon", freezeK: 25, description: "Only where internal heating and ambient temperature allow." },
  { id: "Hydrochloric", label: "Hydrochloric", prefix: "Chloro", fluids: "Hydrogen chloride", freezeK: 159, description: "Aqueous, from biology on chlorine-enriched worlds." },
  { id: "Hydrofluoric", label: "Hydrofluoric", prefix: "Fluoro", fluids: "Hydrogen fluoride", freezeK: 190, description: "Speculative analogue of hydrochloric worlds." },
];
export function fluidById(id: string | undefined): FluidType | undefined {
  return FLUIDS.find((f) => f.id === id);
}

// ---- Misc parameters (Misc Parameters sheet) -------------------------------

export const MISC_ORBIT: Term[] = [
  { id: "Ikarian", label: "Ikarian", description: "Eccentricity above 0.35." },
  { id: "Circumbinary", label: "Circumbinary", description: "Orbits multiple stars.", examples: "Kepler-47 b" },
  { id: "Stevensonian", label: "Stevensonian", description: "Orbits a galaxy or star cluster directly (rogue)." },
];
export const MISC_MULTIWORLD: Term[] = [
  { id: "Trojan", label: "Trojan", description: "At the L4 or L5 point of a world at least 25× its mass.", examples: "Hektor" },
  { id: "Janusian", label: "Janusian", description: "Momentum-exchanging co-orbital resonance of two worlds.", examples: "Janus + Epimetheus" },
  { id: "Satellite", label: "Satellite", description: "Orbits another world rather than a star.", examples: "Titan, Luna" },
  { id: "Dioscuran", label: "Dioscuran", description: "Satellite 0.1–10× the mass of its primary.", examples: "Pluto–Charon" },
  { id: "Rochean", label: "Rochean", description: "Contact / near-contact binary with a common envelope." },
];
export const MISC_ROTATION: Term[] = [
  { id: "Skolian", label: "Skolian", description: "Axial tilt greater than ~54°; poles get more heat than the equator.", examples: "Uranus, Pluto" },
  { id: "Vesperian", label: "Vesperian", description: "Tidally locked to its primary. Most satellites are Vesperian.", examples: "Luna" },
  { id: "Stilbonian", label: "Stilbonian", description: "Spin–orbit resonance with its primary.", examples: "Mercury" },
  { id: "Aeolian", label: "Aeolian", description: "Fast-spinning oblate world, flatness above 0.1." },
  { id: "Jacobian", label: "Jacobian", description: "Triaxial ellipsoid from very rapid spin.", examples: "Haumea" },
  { id: "Synestian", label: "Synestian", description: "Very rapid rotation with an extended toroidal atmosphere." },
];
export const MISC_LIFE: Term[] = [
  { id: "Protobiotic", label: "Protobiotic", description: "Prebiotic molecules, proto-life, life-like systems." },
  { id: "Microbiotic", label: "Microbiotic", description: "Microbial life." },
  { id: "Macrobiotic", label: "Macrobiotic", description: "Macroscopic colonial, multicellular or megacellular organisms." },
  { id: "Neobiotic", label: "Neobiotic", description: "Life introduced or heavily altered by sophonts.", examples: "Nova Terra" },
  { id: "Postbiotic", label: "Postbiotic", description: "Once hosted life; now completely dead." },
  { id: "Micromechanic", label: "Micromechanic", description: "Artificial mechanosystems on microscopic scales." },
  { id: "Macromechanic", label: "Macromechanic", description: "Artificial mechanosystems with macroscopic organisms." },
];
export const MISC_HISTORY: Term[] = [
  { id: "Chthonian", label: "Chthonian", description: "Former Jovian / Neptunian that lost most of its envelope." },
  { id: "Ragnarokian", label: "Ragnarokian", description: "Survived its host star becoming a remnant." },
  { id: "Odyssean", label: "Odyssean", description: "Originated in a different star system." },
  { id: "Phoenixian", label: "Phoenixian", description: "Formed around a non-main-sequence star." },
  { id: "Chaotian", label: "Chaotian", description: "Still immersed in a protoplanetary disk." },
  { id: "Genesian", label: "Genesian", description: "Artificially created planet or planet-like object." },
];

// ---- Shorthand -------------------------------------------------------------

export interface EwocsInput {
  massEarth?: number;
  gasFraction?: string; // Jovian | Neptunian | Terrestrial
  volatiles?: string;
  coRatio?: string;
  cmfPercent?: number;
  coreFraction?: string; // manual override
  atmoComposition?: string;
  aerosol?: string;
  surfaceType?: string; // Gaian, Arean, …
  tempSubtype?: string;
  liquidCoverage?: string;
  liquidPercent?: number;
  fluid?: string; // FluidType id
  miscOrbit?: string;
  miscMultiworld?: string;
  miscRotation?: string;
  miscLife?: string;
  miscHistory?: string;
  eccentricity?: number;
  axialTiltDeg?: number;
  tidallyLocked?: boolean;
  isSatellite?: boolean;
}

export interface EwocsResult {
  massClass?: MassClass;
  core?: Term;
  misc: string[];
  bulk: string[];
  atmo?: string;
  aerosol?: string;
  terrestrial?: string;
  /** e.g. "Marine Tundral AquaGaian" or "AmmoJovian" */
  shorthand: string;
  /** Full descriptor line, like the Examples sheet columns joined. */
  full: string;
}

export function classify(i: EwocsInput): EwocsResult {
  const mc = i.massEarth !== undefined && i.massEarth > 0 ? massClass(i.massEarth) : undefined;
  const core = i.coreFraction ? CORE_FRACTION.find((c) => c.id === i.coreFraction) : i.cmfPercent !== undefined ? coreClass(i.cmfPercent) : undefined;

  const misc: string[] = [];
  if (i.miscLife) misc.push(i.miscLife);
  if (i.miscHistory) misc.push(i.miscHistory);
  if (i.miscOrbit) misc.push(i.miscOrbit);
  else if (i.eccentricity !== undefined && i.eccentricity > 0.35) misc.push("Ikarian");
  if (i.miscRotation) misc.push(i.miscRotation);
  else if (i.axialTiltDeg !== undefined && i.axialTiltDeg > 54 && i.axialTiltDeg < 126) misc.push("Skolian");
  else if (i.tidallyLocked) misc.push("Vesperian");
  if (i.miscMultiworld) misc.push(i.miscMultiworld);
  else if (i.isSatellite) misc.push("Satellite");

  const bulk: string[] = [];
  if (i.gasFraction) bulk.push(i.gasFraction);
  if (i.coRatio) bulk.push(i.coRatio);
  if (i.volatiles) bulk.push(i.volatiles);
  if (core && i.gasFraction !== "Jovian" && i.gasFraction !== "Neptunian") bulk.push(core.id);

  const fluid = fluidById(i.fluid);
  let terrestrial: string | undefined;
  if (i.surfaceType && i.gasFraction !== "Jovian" && i.gasFraction !== "Neptunian") {
    const prefix = fluid && i.surfaceType !== "Apnean" && i.surfaceType !== "Agonian" ? fluid.prefix : "";
    const cov = i.liquidCoverage ?? (i.liquidPercent !== undefined && i.surfaceType.match(/Gaian|Abyssal|Thalassic|Tohulian|Calidian/) ? liquidCoverageClass(i.liquidPercent).id : undefined);
    const parts: string[] = [];
    if (cov && i.surfaceType.match(/Gaian|Abyssal|Thalassic|Tohulian|Calidian/)) parts.push(cov);
    if (i.tempSubtype && i.surfaceType !== "Apnean") parts.push(i.tempSubtype);
    parts.push(`${prefix}${i.surfaceType}`);
    terrestrial = parts.join(" ");
  }

  // Shorthand: giants → "<Aerosol> <GasFraction>" (merged for the common ones: "AmmoJovian");
  // terrestrials → the terrestrial string; otherwise the most specific bulk/mass term.
  let shorthand: string;
  const miscPrefix = misc.filter((m) => m !== "Satellite");
  if (i.gasFraction === "Jovian" || i.gasFraction === "Neptunian") {
    const merged = i.aerosol ? AEROSOL_MERGE[i.aerosol] : undefined;
    const giant = merged ? `${merged}${i.gasFraction}` : [i.aerosol, i.gasFraction].filter(Boolean).join(" ");
    shorthand = [...miscPrefix, giant].join(" ");
  } else {
    shorthand = [...miscPrefix, terrestrial ?? bulk[bulk.length - 1] ?? mc?.subclass ?? ""].filter(Boolean).join(" ");
  }
  if (i.isSatellite || i.miscMultiworld === "Satellite") shorthand += " Satellite";

  const full = [misc.join(" "), mc?.subclass, bulk.join(" "), i.atmoComposition, i.aerosol, terrestrial].filter(Boolean).join(" · ");
  return { massClass: mc, core, misc, bulk, atmo: i.atmoComposition, aerosol: i.aerosol, terrestrial, shorthand: shorthand.trim(), full };
}

/** Aerosol classes that read naturally as a merged prefix on Jovian/Neptunian. */
export const AEROSOL_MERGE: Record<string, string> = { Ammonian: "Ammo", Hydronian: "Hydro", Acidian: "Acido", Sulfanian: "Sulfo", Methanean: "Methano" };
