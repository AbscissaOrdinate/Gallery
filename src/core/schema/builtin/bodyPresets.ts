/**
 * Body presets — EWoCS archetypes with Worldsmith inputs. Every preset is a
 * starting point: mass, core fraction, albedo/greenhouse, atmosphere and the
 * classification enums, plus the low-fi map glyph ("auto" picks from the
 * classification). Numbers are Solar-System analogues where one exists.
 */
import type { Preset } from "../../types";

const P = (id: string, title: string, description: string, tags: string[], fields: Record<string, unknown>): Preset => ({ id, type: "body", title, description, tags, fields });

export const BODY_PRESETS: Preset[] = [
  // ---- stars ---------------------------------------------------------------
  P("star-m-dwarf", "M dwarf (red dwarf)", "0.3 M☉ · ~0.015 L☉ · 3400 K. Tidally locked habitable-zone worlds at ~0.1 AU.", ["star"], { kind: "star", mass_sol: 0.3, age_gyr: 5 }),
  P("star-k-dwarf", "K dwarf (orange)", "0.7 M☉ · 0.24 L☉ · ~4900 K. Long-lived, quiet; HZ at ~0.5 AU.", ["star"], { kind: "star", mass_sol: 0.7, age_gyr: 5 }),
  P("star-g-dwarf", "G dwarf (Sun-like)", "1.0 M☉ · 1 L☉ · 5776 K · 10 Gyr lifetime. The Worldsmith default.", ["star"], { kind: "star", mass_sol: 1.0, age_gyr: 4.5 }),
  P("star-f-dwarf", "F dwarf (yellow-white)", "1.3 M☉ · 2.9 L☉ · ~6500 K · ~4.5 Gyr lifetime. HZ at ~1.6–2.3 AU.", ["star"], { kind: "star", mass_sol: 1.3, age_gyr: 2 }),
  P("star-a", "A star (white)", "2.0 M☉ · 16 L☉ · ~8500 K · ~1.2 Gyr lifetime. Too short-lived for Earth-like biospheres.", ["star"], { kind: "star", mass_sol: 2.0, age_gyr: 0.5 }),
  P("star-b", "B star (blue-white)", "5 M☉ · ~390 L☉ · ~16000 K · ~130 Myr lifetime.", ["star"], { kind: "star", mass_sol: 5, age_gyr: 0.05 }),
  P("brown-dwarf", "Brown dwarf", "0.05 M☉ (~50 M♃). Deuterium burner; feeble luminosity — override L to taste.", ["star", "substellar"], { kind: "brown-dwarf", mass_sol: 0.05, luminosity_sol: 0.00002, radius_sol: 0.1, star_color: "#b04a3a" }),
  P("white-dwarf", "White dwarf", "0.6 M☉ remnant, Earth-sized. Luminosity and radius overridden; survivors are Ragnarokian.", ["star", "remnant"], { kind: "star", mass_sol: 0.6, luminosity_sol: 0.001, radius_sol: 0.012, star_color: "#dfe8ff", age_gyr: 8 }),
  P("barycenter", "Barycenter (binary)", "Centre of mass for a binary: give it the combined mass and luminosity; stars orbit it.", ["system"], { kind: "barycenter", mass_sol: 2.0, luminosity_sol: 2.0 }),

  // ---- terrestrial planets ------------------------------------------------
  P("earthlike", "Earth-like — Marine Tundral AquaGaian", "Mesoterrene · Oxidic Lapidian Telluric · Rhean · Hydronian. 1 M⊕, 24 h, 23.5° tilt, 1 atm N2/O2.", ["terrestrial", "habitable"], {
    kind: "planet", mass_earth: 1, cmf_pct: 33.4, albedo_bond: 0.29, greenhouse: 1, rotation_h: 24, axial_tilt_deg: 23.5, eccentricity: 0.017,
    pressure_atm: 1, atmosphere: [{ gas: "N2", percent: 78.08 }, { gas: "O2", percent: 20.95 }, { gas: "Ar", percent: 0.93 }, { gas: "CO2", percent: 0.04 }],
    gas_fraction: "Terrestrial", volatiles: "Lapidian", co_ratio: "Oxidic", atmo_composition: "Rhean", surface_type: "Gaian", fluid: "Aquatic", liquid_pct: 71, misc_life: "Macrobiotic", glyph: "auto",
  }),
  P("venuslike", "Venus-like — CapnoCytherean", "Mesoterrene · Minervan · Acidian. Supercritical CO2 ocean over rock, 737 K, 92 atm.", ["terrestrial", "hot"], {
    kind: "planet", mass_earth: 0.815, cmf_pct: 31, albedo_bond: 0.76, greenhouse: 218, rotation_h: -5832, axial_tilt_deg: 177, pressure_atm: 92,
    atmosphere: [{ gas: "CO2", percent: 96.5 }, { gas: "N2", percent: 3.5 }],
    gas_fraction: "Terrestrial", volatiles: "Lapidian", co_ratio: "Oxidic", atmo_composition: "Minervan", surface_type: "Cytherean", fluid: "Capnian", aerosol: "Acidian", glyph: "auto",
  }),
  P("marslike", "Mars-like — Tundral CapnoArean", "Subterrene · Minervan. Thin CO2, 0.006 atm, polar caps, 210 K.", ["terrestrial", "cold"], {
    kind: "planet", mass_earth: 0.107, cmf_pct: 24, albedo_bond: 0.25, greenhouse: 0.15, rotation_h: 24.6, axial_tilt_deg: 25.2, eccentricity: 0.093, pressure_atm: 0.006,
    atmosphere: [{ gas: "CO2", percent: 95 }, { gas: "N2", percent: 2.7 }, { gas: "Ar", percent: 1.6 }],
    gas_fraction: "Terrestrial", volatiles: "Lapidian", co_ratio: "Oxidic", atmo_composition: "Minervan", surface_type: "Arean", fluid: "Capnian", temp_subtype: "Tundral", glyph: "auto",
  }),
  P("mercurylike", "Mercury-like — Stilbonian Hermian Apnean", "Microterrene · 70% iron core · 3:2 spin–orbit resonance · airless.", ["terrestrial", "airless", "hot"], {
    kind: "planet", mass_earth: 0.055, cmf_pct: 70, albedo_bond: 0.12, greenhouse: 0, rotation_h: 1407.5, axial_tilt_deg: 0.03, eccentricity: 0.206, spin_resonance: "3:2",
    gas_fraction: "Terrestrial", volatiles: "Lapidian", co_ratio: "Oxidic", atmo_composition: "Edelian", surface_type: "Apnean", misc_rotation: "Stilbonian", glyph: "auto",
  }),
  P("ocean-superearth", "Ocean super-Earth — Pelagic AquaThalassic", "Superterrene · deep global ocean over high-pressure ice · 5 atm humid N2/O2.", ["terrestrial", "habitable", "ocean"], {
    kind: "planet", mass_earth: 4, cmf_pct: 25, albedo_bond: 0.35, greenhouse: 1.6, rotation_h: 20, axial_tilt_deg: 10, pressure_atm: 5,
    atmosphere: [{ gas: "N2", percent: 80 }, { gas: "O2", percent: 17 }, { gas: "H2O", percent: 3 }],
    gas_fraction: "Terrestrial", volatiles: "Cerean", co_ratio: "Oxidic", atmo_composition: "Rhean", surface_type: "Thalassic", fluid: "Aquatic", liquid_pct: 100, glyph: "ocean",
  }),
  P("ammonia-world", "Ammonia world — Lacustrine Tundral AmunoGaian", "Mesoterrene · cold Gaian with ammonia–water lakes · Ammonian clouds.", ["terrestrial", "exotic"], {
    kind: "planet", mass_earth: 1.2, cmf_pct: 30, albedo_bond: 0.4, greenhouse: 1.5, rotation_h: 30, axial_tilt_deg: 15, pressure_atm: 2,
    atmosphere: [{ gas: "N2", percent: 90 }, { gas: "NH3", percent: 4 }, { gas: "CH4", percent: 3 }, { gas: "H2", percent: 3 }],
    gas_fraction: "Terrestrial", volatiles: "Cerean", co_ratio: "Oxidic", atmo_composition: "Minervan", surface_type: "Gaian", fluid: "Amunian", liquid_pct: 25, aerosol: "Ammonian", glyph: "auto",
  }),
  P("desert-world", "Desert world — Conlectic Tepidal AquaGaian", "Mesoterrene · scattered seas (< 10% cover) · thin dry atmosphere.", ["terrestrial", "marginal"], {
    kind: "planet", mass_earth: 0.7, cmf_pct: 30, albedo_bond: 0.22, greenhouse: 0.6, rotation_h: 27, axial_tilt_deg: 12, pressure_atm: 0.5,
    atmosphere: [{ gas: "N2", percent: 85 }, { gas: "O2", percent: 12 }, { gas: "CO2", percent: 2 }, { gas: "Ar", percent: 1 }],
    gas_fraction: "Terrestrial", volatiles: "Lapidian", co_ratio: "Oxidic", atmo_composition: "Rhean", surface_type: "Gaian", fluid: "Aquatic", liquid_pct: 6, glyph: "auto", glyph_color: "#c9a25e",
  }),
  P("snowball", "Snowball — Glacial AquaGaian", "Mesoterrene · ice-covered ocean, high albedo, sub-ice life possible.", ["terrestrial", "cold"], {
    kind: "planet", mass_earth: 0.9, cmf_pct: 32, albedo_bond: 0.62, greenhouse: 0.8, rotation_h: 22, axial_tilt_deg: 20, pressure_atm: 0.8,
    atmosphere: [{ gas: "N2", percent: 96 }, { gas: "O2", percent: 3 }, { gas: "CO2", percent: 1 }],
    gas_fraction: "Terrestrial", volatiles: "Lapidian", co_ratio: "Oxidic", atmo_composition: "Rhean", surface_type: "Gaian", fluid: "Aquatic", liquid_pct: 65, temp_subtype: "Glacial", glyph: "auto", glyph_color: "#dfe9f2",
  }),
  P("lava-world", "Lava world — IgneoGaian", "Superterrene at 0.02 AU · magma ocean · Hephaestian rock-vapour atmosphere · Refractian clouds.", ["terrestrial", "hot", "exotic"], {
    kind: "planet", mass_earth: 8, cmf_pct: 33, albedo_bond: 0.1, sma_au: 0.02, surface_temp_K: 2000, tidally_locked: true, pressure_atm: 0.5,
    gas_fraction: "Terrestrial", volatiles: "Lapidian", co_ratio: "Carbidic", atmo_composition: "Hephaestian", surface_type: "Gaian", fluid: "Igneous", liquid_pct: 40, aerosol: "Refractian", temp_subtype: "Thermal", glyph: "lava",
  }),
  P("carbon-world", "Carbon world — Marine Tepidal PetroCalidian", "Subterrene · C/O > 10 · tar seas under a tholin haze · graphite crust.", ["terrestrial", "exotic"], {
    kind: "planet", mass_earth: 0.5, cmf_pct: 20, albedo_bond: 0.15, greenhouse: 2, rotation_h: 40, pressure_atm: 3,
    atmosphere: [{ gas: "N2", percent: 70 }, { gas: "CO", percent: 20 }, { gas: "CH4", percent: 10 }],
    gas_fraction: "Terrestrial", volatiles: "Lapidian", co_ratio: "Carbonic", atmo_composition: "Minervan", surface_type: "Calidian", fluid: "Petrolic", liquid_pct: 65, aerosol: "Tholian", glyph: "carbon",
  }),
  P("chthonian", "Chthonian core — Superterrene Apnean", "Former giant stripped to its core by a close orbit. History: Chthonian.", ["terrestrial", "hot", "exotic"], {
    kind: "planet", mass_earth: 5, cmf_pct: 40, albedo_bond: 0.1, greenhouse: 0, sma_au: 0.03, tidally_locked: true,
    gas_fraction: "Terrestrial", volatiles: "Lapidian", co_ratio: "Oxidic", atmo_composition: "Hephaestian", surface_type: "Apnean", misc_history: "Chthonian", glyph: "auto", glyph_color: "#5a4a48",
  }),

  // ---- giants --------------------------------------------------------------
  P("jupiterlike", "Jupiter-like — AmmoJovian", "Mesogiant · 318 M⊕ · ρ 1.33 · Jotunnian · Ammonian clouds.", ["giant"], {
    kind: "planet", mass_earth: 317.8, density_gcc: 1.33, albedo_bond: 0.34, rotation_h: 9.9, axial_tilt_deg: 3.1,
    gas_fraction: "Jovian", volatiles: "Ymirian", co_ratio: "Carbonatic", atmo_composition: "Jotunnian", aerosol: "Ammonian", glyph: "gas-giant",
  }),
  P("saturnlike", "Saturn-like — AmmoJovian, ringed", "Subgiant · 95 M⊕ · ρ 0.69 · prominent ring system.", ["giant", "rings"], {
    kind: "planet", mass_earth: 95.2, density_gcc: 0.69, albedo_bond: 0.34, rotation_h: 10.7, axial_tilt_deg: 26.7, has_rings: true,
    gas_fraction: "Jovian", volatiles: "Ymirian", co_ratio: "Carbonatic", atmo_composition: "Jotunnian", aerosol: "Ammonian", glyph: "gas-giant", glyph_color: "#e3cf9d",
  }),
  P("uranuslike", "Uranus-like — Skolian CryoAzurian Neptunian", "Microgiant · 14.5 M⊕ · 98° tilt · cloudless cyan.", ["giant", "ice-giant"], {
    kind: "planet", mass_earth: 14.5, density_gcc: 1.27, albedo_bond: 0.3, rotation_h: 17.2, axial_tilt_deg: 97.8,
    gas_fraction: "Neptunian", volatiles: "Ymirian", co_ratio: "Carbonatic", atmo_composition: "Jotunnian", aerosol: "CryoAzurian", glyph: "ice-giant",
  }),
  P("neptunelike", "Neptune-like — CryoAzurian Neptunian", "Microgiant · 17 M⊕ · deep blue · fastest winds.", ["giant", "ice-giant"], {
    kind: "planet", mass_earth: 17.1, density_gcc: 1.64, albedo_bond: 0.29, rotation_h: 16.1, axial_tilt_deg: 28.3,
    gas_fraction: "Neptunian", volatiles: "Ymirian", co_ratio: "Carbonatic", atmo_composition: "Jotunnian", aerosol: "CryoAzurian", glyph: "ice-giant", glyph_color: "#3f6fd8",
  }),
  P("mini-neptune", "Mini-Neptune — Tholian Neptunian", "Superterrene 8 M⊕ with a hazy H/He envelope · ρ 2.5.", ["giant", "exotic"], {
    kind: "planet", mass_earth: 8, density_gcc: 2.5, albedo_bond: 0.3, rotation_h: 30,
    gas_fraction: "Neptunian", volatiles: "Cerean", co_ratio: "Carbonatic", atmo_composition: "Jotunnian", aerosol: "Tholian", glyph: "tholin",
  }),
  P("hot-jupiter", "Hot Jupiter — Enstatian Jovian", "Mesogiant at 0.05 AU · inflated ρ 0.5 · silicate clouds · tidally locked.", ["giant", "hot"], {
    kind: "planet", mass_earth: 300, density_gcc: 0.5, albedo_bond: 0.1, sma_au: 0.05, tidally_locked: true,
    gas_fraction: "Jovian", volatiles: "Ymirian", co_ratio: "Carbonatic", atmo_composition: "Jotunnian", aerosol: "Enstatian", glyph: "hot-jupiter",
  }),

  // ---- moons & dwarfs ------------------------------------------------------
  P("lunalike", "Luna-like — Vesperian Selenian Apnean", "Superdwarf moon · 0.0123 M⊕ · tiny core · locked · noble-gas exosphere.", ["moon", "airless"], {
    kind: "moon", mass_earth: 0.0123, cmf_pct: 2, density_gcc: 3.34, albedo_bond: 0.12, greenhouse: 0, sma_km: 384400, eccentricity: 0.055, inclination_deg: 5.1, tidally_locked: true,
    gas_fraction: "Terrestrial", volatiles: "Lapidian", co_ratio: "Oxidic", atmo_composition: "Edelian", surface_type: "Apnean", glyph: "auto",
  }),
  P("europalike", "Europa-like — AquaEuropan", "Superdwarf icy moon · subcrustal ocean · Cerean · locked.", ["moon", "icy", "ocean"], {
    kind: "moon", mass_earth: 0.008, density_gcc: 3.01, albedo_bond: 0.67, greenhouse: 0, sma_km: 671000, tidally_locked: true,
    gas_fraction: "Terrestrial", volatiles: "Cerean", co_ratio: "Oxidic", atmo_composition: "Rhean", surface_type: "Europan", fluid: "Aquatic", glyph: "auto",
  }),
  P("ganymedelike", "Ganymede-like — Ganymedean", "Microterrene icy moon · high-pressure ice under a buried ocean · Gelidian.", ["moon", "icy"], {
    kind: "moon", mass_earth: 0.025, density_gcc: 1.94, albedo_bond: 0.43, greenhouse: 0, sma_km: 1070000, tidally_locked: true,
    gas_fraction: "Terrestrial", volatiles: "Gelidian", co_ratio: "Oxidic", atmo_composition: "Rhean", surface_type: "Ganymedean", fluid: "Aquatic", glyph: "auto",
  }),
  P("titanlike", "Titan-like — Conlectic Tepidal TitanoCalidian", "Microterrene moon · 1.45 atm N2/CH4 · methane lakes · Tholian haze.", ["moon", "icy", "atmosphere"], {
    kind: "moon", mass_earth: 0.0225, density_gcc: 1.88, albedo_bond: 0.22, greenhouse: 0.3, sma_km: 1221870, tidally_locked: true, pressure_atm: 1.45,
    atmosphere: [{ gas: "N2", percent: 95 }, { gas: "CH4", percent: 5 }],
    gas_fraction: "Terrestrial", volatiles: "Gelidian", co_ratio: "Oxidic", atmo_composition: "Rhean", surface_type: "Calidian", fluid: "Titanian", liquid_pct: 2, aerosol: "Tholian", temp_subtype: "Tepidal", glyph: "calidian",
  }),
  P("iolike", "Io-like — Tepidal IoArean", "Superdwarf moon · tidally heated · sulfur volcanism · SO2 atmosphere.", ["moon", "volcanic"], {
    kind: "moon", mass_earth: 0.015, cmf_pct: 20, density_gcc: 3.53, albedo_bond: 0.63, greenhouse: 0, sma_km: 421700, tidally_locked: true, pressure_atm: 1e-9,
    gas_fraction: "Terrestrial", volatiles: "Lapidian", co_ratio: "Oxidic", atmo_composition: "Minervan", surface_type: "Arean", fluid: "Ionean", temp_subtype: "Tepidal", glyph: "auto", glyph_color: "#d9c24a",
  }),
  P("enceladuslike", "Enceladus-like — AquaEuropan (small)", "Superplanetoid icy moon · cryovolcanic plumes · Ymirian.", ["moon", "icy"], {
    kind: "moon", mass_earth: 1.8e-5, density_gcc: 1.61, albedo_bond: 0.81, greenhouse: 0, sma_km: 238000, tidally_locked: true,
    gas_fraction: "Terrestrial", volatiles: "Ymirian", co_ratio: "Oxidic", surface_type: "Europan", fluid: "Aquatic", glyph: "auto", glyph_color: "#f3f6fa",
  }),
  P("plutolike", "Pluto-like — Skolian Dioscuran AzoChionian", "Mesodwarf · nitrogen-ice glaciers · 120° tilt · large moon (Dioscuran).", ["dwarf", "cold"], {
    kind: "dwarf", mass_earth: 0.0022, cmf_pct: 30, density_gcc: 1.86, albedo_bond: 0.5, greenhouse: 0, sma_au: 39.5, eccentricity: 0.25, axial_tilt_deg: 120, rotation_h: 153.3, pressure_atm: 1e-5,
    atmosphere: [{ gas: "N2", percent: 98 }, { gas: "CH4", percent: 2 }],
    gas_fraction: "Terrestrial", volatiles: "Gelidian", co_ratio: "Oxidic", atmo_composition: "Rhean", surface_type: "Chionian", fluid: "Azotian", misc_multiworld: "Dioscuran", glyph: "auto",
  }),
  P("cereslike", "Ceres-like — Cerean dwarf", "Microdwarf · 0.00016 M⊕ · ice-rich · brine cryovolcanism.", ["dwarf", "belt"], {
    kind: "dwarf", mass_earth: 0.00016, density_gcc: 2.16, albedo_bond: 0.09, greenhouse: 0, sma_au: 2.77,
    gas_fraction: "Terrestrial", volatiles: "Cerean", co_ratio: "Oxidic", surface_type: "Europan", fluid: "Aquatic", glyph: "auto", glyph_color: "#8f8a80",
  }),

  // ---- small bodies, belts, artificial ------------------------------------
  P("asteroid-vesta", "Asteroid (Vesta-like)", "Superplanetoid · differentiated · basaltic crust.", ["small-body", "belt"], {
    kind: "asteroid", mass_earth: 4.3e-5, density_gcc: 3.46, albedo_bond: 0.42, sma_au: 2.36, eccentricity: 0.09,
    gas_fraction: "Terrestrial", volatiles: "Lapidian", co_ratio: "Oxidic", surface_type: "Apnean", glyph: "asteroid",
  }),
  P("asteroid-rubble", "Asteroid (rubble pile)", "Mesoplanetesimal · loosely bound · resource target.", ["small-body"], {
    kind: "asteroid", mass_earth: 1e-11, density_gcc: 1.2, albedo_bond: 0.05, sma_au: 1.3, eccentricity: 0.2,
    gas_fraction: "Terrestrial", volatiles: "Cerean", surface_type: "Apnean", glyph: "asteroid",
  }),
  P("comet", "Comet", "Mesoplanetesimal ice nucleus · e ≈ 0.9 · Ymirian.", ["small-body"], {
    kind: "comet", mass_earth: 1e-13, density_gcc: 0.6, albedo_bond: 0.04, sma_au: 18, eccentricity: 0.9, volatiles: "Ymirian", glyph: "comet",
  }),
  P("main-belt", "Asteroid belt", "Belt drawn as an annulus between the inner and outer edges.", ["belt"], { kind: "belt", belt_inner_au: 2.1, belt_outer_au: 3.3, glyph: "belt" }),
  P("kuiper-belt", "Kuiper belt", "Outer icy belt, typically at the 2:3 and 1:2 resonances of the outermost giant (see the system's debris-disk estimate).", ["belt"], {
    kind: "belt", belt_inner_au: 30, belt_outer_au: 50, glyph: "belt",
  }),
  P("orbital-ring", "Orbital ring (artificial)", "Megastructure ring around a body; drawn as a thick arc. Link it to a location for the wiki page.", ["artificial", "megastructure"], {
    kind: "artificial", sma_km: 6800, glyph: "ring", misc_history: "Genesian",
  }),
  P("trojan", "Trojan asteroid / station", "Body at a Lagrange point of another world (set 'Lagrange point of' and L4/L5).", ["small-body", "lagrange"], {
    kind: "asteroid", mass_earth: 1e-9, density_gcc: 2, lagrange: "L4", misc_multiworld: "Trojan", surface_type: "Apnean", glyph: "asteroid",
  }),
];
