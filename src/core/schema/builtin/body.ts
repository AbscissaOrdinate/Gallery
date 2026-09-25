/**
 * Body schema — Worldsmith inputs in EWoCS order:
 * orbit → mass → composition → terrestrial type → fluid → aerosols → misc.
 * Everything derivable is computed live (see astro/derive.ts) and shown in
 * the editor's Derived panel; an "override" field pins a value by hand.
 */
import type { TypeSchema } from "../../types";
import * as E from "../../astro/ewocs";
import { GASES } from "../../astro/worldsmith";

const num = (title: string, unit?: string, extra: Record<string, unknown> = {}) => ({ type: "number" as const, title, ...(unit ? { "x-unit": unit } : {}), ...extra });
const str = (title: string, extra: Record<string, unknown> = {}) => ({ type: "string" as const, title, ...extra });
const text = (title: string, extra: Record<string, unknown> = {}) => ({ type: "string" as const, title, "x-multiline": true, ...extra });
const ref = (title: string, types: string[], rel?: string, extra: Record<string, unknown> = {}) => ({ type: "string" as const, title, "x-ref": { types, ...(rel ? { rel } : {}) }, ...extra });
const enumOf = (title: string, terms: E.Term[], group: string, description?: string) => ({
  type: "string" as const,
  title,
  enum: ["", ...terms.map((t) => t.id)],
  "x-group": group,
  ...(description ? { description } : {}),
});

export const GLYPH_MOTIFS = [
  "auto",
  "star",
  "gaian",
  "amuno-gaian",
  "cytherean",
  "arean",
  "chionian",
  "apnean",
  "europan",
  "ganymedean",
  "calidian",
  "gas-giant",
  "ice-giant",
  "hot-jupiter",
  "lava",
  "carbon",
  "tholin",
  "ocean",
  "asteroid",
  "comet",
  "belt",
  "ring",
  "barycenter",
] as const;

export const BODY_SCHEMA: TypeSchema = {
  id: "body",
  version: 4, // 4: handling code prefix and core required fields (UI redesign step 4, 2026-09-25).
  handling: { code_prefix: "BODY" },
  title: "Body",
  description: "Stars, planets, moons, asteroids, comets, belts, artificial bodies. Worldsmith physics + EWoCS classification are derived from these inputs.",
  folder: "bodies",
  icon: "●",
  rels: ["orbits", "in-system", "trojan-of", "co-orbital-with", "controlled-by"],
  indexColumns: ["kind", "parent", "sma_au", "mass_earth"],
  fields: {
    type: "object",
    required: ["kind", "system"],
    properties: {
      kind: str("Kind", {
        enum: ["star", "brown-dwarf", "barycenter", "planet", "dwarf", "moon", "asteroid", "comet", "belt", "ring", "artificial"],
        default: "planet",
      }),
      system: ref("System", ["system"], "in-system"),
      parent: ref("Orbits (parent)", ["body"], "orbits", { description: "The star, barycenter, or planet this body orbits. Leave empty for the primary." }),

      // ---- Orbit -----------------------------------------------------------
      sma_au: num("Semi-major axis", "AU", { minimum: 0, "x-distance": true, "x-group": "Orbit", description: "For bodies orbiting a star or barycenter." }),
      sma_km: num("Semi-major axis (moons)", "km", { minimum: 0, "x-distance": true, "x-group": "Orbit", description: "For bodies orbiting a planet. Either AU or km; km wins for moons." }),
      eccentricity: num("Eccentricity", undefined, { minimum: 0, maximum: 0.99, default: 0, "x-group": "Orbit" }),
      inclination_deg: num("Inclination", "°", { "x-group": "Orbit" }),
      periapsis_deg: num("Longitude of periapsis", "°", { "x-group": "Orbit", description: "Direction of closest approach on the map (0° = right, counter-clockwise)." }),
      map_angle_deg: num("Position on orbit", "°", { "x-group": "Orbit", description: "Where the map draws this body along its orbit. Drag on the map to change." }),
      map_radius_px: num("Map radius (manual mapping)", "px", { minimum: 0, "x-group": "Orbit", description: "Only used when the system's radius mapping is 'manual'." }),
      lagrange_of: ref("Lagrange point of", ["body"], "trojan-of", { "x-group": "Orbit", description: "For Trojans / stations at a Lagrange point: the smaller body of the pair." }),
      lagrange: str("Lagrange point", { enum: ["", "L1", "L2", "L3", "L4", "L5"], "x-group": "Orbit" }),
      belt_inner_au: num("Belt inner edge", "AU", { minimum: 0, "x-distance": true, "x-group": "Orbit", description: "Belts and rings only." }),
      belt_outer_au: num("Belt outer edge", "AU", { minimum: 0, "x-distance": true, "x-group": "Orbit" }),
      rotation_h: num("Rotation period", "h", { "x-group": "Orbit" }),
      axial_tilt_deg: num("Axial tilt", "°", { minimum: 0, maximum: 180, "x-group": "Orbit" }),
      tidally_locked: { type: "boolean", title: "Tidally locked", "x-group": "Orbit" },
      spin_resonance: str("Spin–orbit resonance", { "x-group": "Orbit", description: "e.g. 3:2 (Stilbonian)" }),

      // ---- Star ------------------------------------------------------------
      mass_sol: num("Mass", "M☉", { minimum: 0, "x-group": "Star", description: "Stars, brown dwarfs and barycenters (total mass)." }),
      age_gyr: num("Age", "Gyr", { minimum: 0, "x-group": "Star" }),
      luminosity_sol: num("Luminosity (override)", "L☉", { minimum: 0, "x-group": "Star", description: "Leave empty to derive from mass." }),
      radius_sol: num("Radius (override)", "R☉", { minimum: 0, "x-group": "Star" }),
      star_color: str("Colour (override)", { "x-group": "Star", description: "Hex colour for the map; derived from temperature if empty." }),

      // ---- Mass & physical -------------------------------------------------
      mass_earth: num("Mass", "M⊕", { minimum: 0, "x-group": "Mass & physical", description: "Planets, moons, small bodies. 1 M⊕ = 5.972e24 kg; Luna = 0.0123; Jupiter = 317.8." }),
      cmf_pct: num("Core mass fraction", "%", { minimum: 0, maximum: 100, "x-group": "Mass & physical", description: "Earth 33.4, Mercury ~70, Luna ~2. Drives density → radius → gravity." }),
      radius_km: num("Radius (override)", "km", { minimum: 0, "x-group": "Mass & physical", description: "Leave empty to derive from mass + CMF (terrestrials)." }),
      density_gcc: num("Density (override)", "g/cm³", { minimum: 0, "x-group": "Mass & physical", description: "Giants, ices and small bodies: set directly." }),
      albedo_bond: num("Bond albedo", undefined, { minimum: 0, maximum: 1, "x-group": "Mass & physical", description: "Earth 0.29, Venus 0.76, Mars 0.25, Luna 0.12" }),
      greenhouse: num("Greenhouse factor", undefined, { minimum: 0, "x-group": "Mass & physical", description: "Worldsmith scale: Earth 1, Mars ~0.2, Venus ~200" }),
      surface_temp_K: num("Surface temperature (override)", "K", { minimum: 0, "x-group": "Mass & physical" }),

      // ---- Composition (EWoCS) --------------------------------------------
      gas_fraction: enumOf("Gas fraction", E.GAS_FRACTION, "Composition", "Jovian ≫ H/He · Neptunian 0.1–50% · Terrestrial < 0.1%"),
      volatiles: enumOf("Volatile fraction", E.VOLATILE_FRACTION, "Composition", "Ymirian > 67% · Gelidian 33–67% · Cerean 1–33% · Lapidian < 1%"),
      co_ratio: enumOf("C/O ratio", E.CO_RATIO, "Composition", "Carbonic > 10 · Carbidic 1–10 · Carbonatic 0.1–1 · Oxidic < 0.1"),
      core_fraction: enumOf("Core fraction (override)", E.CORE_FRACTION, "Composition", "Derived from CMF if empty."),
      atmo_composition: enumOf("Atmosphere class", E.ATMO_COMPOSITION, "Composition"),

      // ---- Atmosphere ------------------------------------------------------
      pressure_atm: num("Surface pressure", "atm", { minimum: 0, "x-group": "Atmosphere" }),
      atmosphere: {
        type: "array",
        title: "Composition by volume",
        "x-group": "Atmosphere",
        items: {
          type: "object",
          properties: {
            gas: str("Gas", { enum: Object.keys(GASES) }),
            percent: num("%", "%", { minimum: 0, maximum: 100 }),
          },
        },
      },

      // ---- Terrestrial type ------------------------------------------------
      surface_type: enumOf("Surface type", E.SURFACE_TYPES, "Terrestrial type", "Gaian (surface liquids) · Cytherean (supercritical layer) · Europan (subcrustal ocean) · Agonian · Arean · Apnean (airless)"),
      fluid: enumOf("Surface fluid", E.FLUIDS, "Terrestrial type", "Prefix for the type: Aqua-, Amuno-, Titano-, Capno-, Azo-, Igneo-…"),
      liquid_pct: num("Liquid coverage", "%", { minimum: 0, maximum: 100, "x-group": "Terrestrial type", description: "Pelagic > 90 · Marine 60–90 · Estuarine 40–60 · Lacustrine 10–40 · Conlectic < 10" }),
      liquid_coverage: enumOf("Coverage class (override)", E.LIQUID_COVERAGE, "Terrestrial type"),
      temp_subtype: enumOf("Temperature subtype (override)", E.TEMP_SUBTYPES, "Terrestrial type", "Derived from surface temperature vs the fluid's freezing point if empty."),

      // ---- Aerosols --------------------------------------------------------
      aerosol: enumOf("Aerosol / cloud class (override)", E.AEROSOLS, "Aerosols", "Guessed from temperature if empty."),

      // ---- Misc (EWoCS) ----------------------------------------------------
      misc_orbit: enumOf("Orbit class", E.MISC_ORBIT, "Misc classification"),
      misc_multiworld: enumOf("Multi-world interaction", E.MISC_MULTIWORLD, "Misc classification"),
      misc_rotation: enumOf("Rotation class (override)", E.MISC_ROTATION, "Misc classification", "Skolian / Vesperian derived from tilt and locking if empty."),
      misc_life: enumOf("Life", E.MISC_LIFE, "Misc classification"),
      misc_history: enumOf("History", E.MISC_HISTORY, "Misc classification"),

      // ---- Control & strength (map modes) ----------------------------------
      controller: ref("Controlling polity", ["polity"], "controlled-by", { "x-group": "Control & strength", description: "Political map mode. Empty → derived from the owners of locations on/around this body." }),
      population_m: num("Population (override)", "M", { minimum: 0, "x-group": "Control & strength", description: "Empty → sum of locations' populations." }),
      industry: num("Industrial strength (override)", "0–10", { minimum: 0, maximum: 10, "x-group": "Control & strength", description: "Empty → sum of locations' industry (capped at 10)." }),
      habitability: num("Habitability (override)", "0–1", { minimum: 0, maximum: 1, "x-group": "Control & strength", description: "Empty → estimated from class, temperature, gravity and pressure." }),

      // ---- Appearance ------------------------------------------------------
      glyph: str("Map glyph", { enum: [...GLYPH_MOTIFS], default: "auto", "x-group": "Appearance", description: "Low-fidelity portrait used on maps. 'auto' picks from the classification. A portrait asset overrides it." }),
      glyph_color: str("Glyph colour (override)", { "x-group": "Appearance", description: "Hex colour" }),
      has_rings: { type: "boolean", title: "Ring system", "x-group": "Appearance" },
      surface: text("Surface / environment", { "x-group": "Notes" }),
      resources: { type: "array", title: "Notable resources", items: { type: "string" }, "x-group": "Notes" },
    },
  },
};
