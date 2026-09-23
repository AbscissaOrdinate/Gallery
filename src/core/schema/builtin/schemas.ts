/**
 * Built-in type schemas. Written to `<vault>/_schemas/<type>.schema.json` on
 * first run so they can be edited; the on-disk copy wins afterwards.
 */
import type { TypeSchema } from "../../types";
import { BODY_SCHEMA } from "./body";
import { SYSTEM_SCHEMA } from "./system";
export { BODY_SCHEMA, SYSTEM_SCHEMA };

const num = (title: string, unit?: string, extra: Record<string, unknown> = {}) => ({
  type: "number" as const,
  title,
  ...(unit ? { "x-unit": unit } : {}),
  ...extra,
});
const str = (title: string, extra: Record<string, unknown> = {}) => ({ type: "string" as const, title, ...extra });
const text = (title: string) => ({ type: "string" as const, title, "x-multiline": true });
const ref = (title: string, types: string[], rel?: string) => ({
  type: "string" as const,
  title,
  "x-ref": { types, ...(rel ? { rel } : {}) },
});
const refs = (title: string, types: string[], rel?: string) => ({
  type: "array" as const,
  title,
  items: { type: "string" as const, "x-ref": { types, ...(rel ? { rel } : {}) } },
  "x-ref": { types, ...(rel ? { rel } : {}) },
});
const strs = (title: string) => ({ type: "array" as const, title, items: { type: "string" as const } });

export const NOTE_SCHEMA: TypeSchema = {
  id: "note",
  title: "Note",
  description: "Free-form outline (Dynalist-style). Stored as .opml.",
  folder: "notes",
  icon: "≣",
  fields: { type: "object", properties: {} },
  rels: ["about", "mentions", "source"],
};

export const POLITY_SCHEMA: TypeSchema = {
  id: "polity",
  version: 2,
  title: "Polity",
  description: "Nations, corporations, alliances, colonies, religious factions — anything with agency and territory.",
  folder: "polities",
  icon: "⚑",
  rels: ["member-of", "ally", "rival", "client-of", "successor-of", "operates"],
  indexColumns: ["kind", "government", "population_m"],
  fields: {
    type: "object",
    properties: {
      kind: str("Kind", {
        enum: ["nation", "alliance", "corporation", "colony", "condominium", "religious", "movement", "criminal", "other"],
        default: "nation",
      }),
      government: str("Government", { description: "e.g. federal republic, chartered company, theocracy" }),
      color: str("Map colour", { description: "Hex colour used by the political map mode, e.g. #c9663a. Auto-assigned if empty." }),
      ideology: str("Ideology / outlook"),
      capital: ref("Capital", ["location"], "capital"),
      parent: ref("Parent polity", ["polity"], "member-of"),
      founded: str("Founded", { description: "Date or era, free text" }),
      population_m: num("Population", "M"),
      economy: text("Economy"),
      military: text("Military posture"),
      territory: refs("Territory", ["location", "body"], "controls"),
      leaders: refs("Leaders", ["character"], "led-by"),
      naming: text("Naming conventions", ),
    },
  },
};

export const LOCATION_SCHEMA: TypeSchema = {
  id: "location",
  version: 3,
  title: "Location",
  description: "Cities, stations, bases, regions, megastructures — a place you can point at on a map.",
  folder: "locations",
  icon: "⌖",
  rels: ["on", "orbits", "owned-by", "connected-to", "part-of", "at-lagrange-of"],
  indexColumns: ["kind", "body", "owner", "population_k"],
  fields: {
    type: "object",
    properties: {
      kind: str("Kind", {
        enum: ["city", "settlement", "station", "base", "depot", "shipyard", "region", "megastructure", "skyhook", "ring", "elevator", "site", "other"],
        default: "settlement",
      }),
      body: ref("On / around body", ["body"], "on"),
      owner: ref("Owner", ["polity"], "owned-by"),
      parent: ref("Part of", ["location"], "part-of"),
      lat: num("Latitude", "°", { minimum: -90, maximum: 90, "x-group": "Position" }),
      lon: num("Longitude", "°", { minimum: -180, maximum: 180, "x-group": "Position" }),
      orbit_km: num("Orbit altitude", "km", { "x-distance": true, "x-group": "Position" }),
      lagrange: str("Lagrange point", { enum: ["", "L1", "L2", "L3", "L4", "L5"], "x-group": "Position" }),
      lagrange_of: ref("Lagrange point of", ["body"], "at-lagrange-of"),
      sma_au: num("Heliocentric orbit", "AU", { minimum: 0, "x-distance": true, "x-group": "Position", description: "For free-flying stations/cyclers orbiting the star directly." }),
      eccentricity: num("Eccentricity", undefined, { minimum: 0, maximum: 0.99, "x-group": "Position" }),
      periapsis_deg: num("Longitude of periapsis", "°", { "x-group": "Position" }),
      map_angle_deg: num("Position on orbit", "°", { "x-group": "Position", description: "Where the map draws this location along its orbit." }),
      map_symbol: str("Map symbol", { enum: ["auto", "station", "depot", "shipyard", "skyhook", "elevator", "ring", "telescope", "base", "city", "beacon"], default: "auto", "x-group": "Position" }),
      population_k: num("Population", "k"),
      industry: num("Industrial strength", "0–10", { minimum: 0, maximum: 10, "x-group": "Strength", description: "Economic map mode: 0 outpost … 10 core industrial world" }),
      garrison: num("Military strength", "0–10", { minimum: 0, maximum: 10, "x-group": "Strength", description: "Military map mode; bases, shipyards and craft based here add to it" }),
      purpose: text("Purpose / economy"),
      established: str("Established"),
    },
  },
};

export const CHARACTER_SCHEMA: TypeSchema = {
  id: "character",
  title: "Character",
  description: "People (and uplifts, AIs, …).",
  folder: "characters",
  icon: "☺",
  rels: ["affiliated-with", "commands", "born-on", "knows", "rival-of"],
  indexColumns: ["role", "affiliation", "born"],
  fields: {
    type: "object",
    properties: {
      role: str("Role / rank"),
      affiliation: ref("Affiliation", ["polity"], "affiliated-with"),
      home: ref("Home", ["location", "body"], "born-on"),
      born: str("Born"),
      species: str("Species", { default: "human" }),
      traits: strs("Traits"),
      commands: refs("Commands", ["craft", "location"], "commands"),
      bio: text("Biography"),
    },
  },
};

export const MODULE_SCHEMA: TypeSchema = {
  id: "module",
  version: 3,
  title: "Module",
  description:
    "A component class that goes on a craft: drives, reactors, radiators, weapons, point defense, sensors, armor, habitats, tanks. Numbers feed the craft budget roll-up.",
  folder: "modules",
  icon: "▣",
  rels: ["derived-from", "made-by"],
  indexColumns: ["category", "slot", "mass_t", "power_out_MW", "power_in_MW", "heat_out_MW", "thrust_kN", "isp_s", "cost"],
  fields: {
    type: "object",
    required: ["category", "slot", "mass_t"],
    properties: {
      category: str("Category", {
        enum: [
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
        ],
        default: "other",
      }),
      slot: str("Slot type", {
        // The same vocabulary as a hull's `external_slots[].type`, plus
        // `internal`. Before this a point-defence module could only call itself
        // a turret, so every PD mount on every hull reported a mismatch.
        enum: ["internal", "external", "spinal", "turret", "pd", "radiator", "comms", "sensor", "optics", "tank", "drive", "thruster", "dock", "pod", "hangar"],
        default: "internal",
      }),
      tech_level: str("Tech level / era"),
      maker: ref("Manufacturer", ["polity"], "made-by"),
      mass_t: num("Mass", "t", { minimum: 0, "x-group": "Budget" }),
      volume_m3: num("Volume", "m³", { minimum: 0, "x-group": "Budget" }),
      power_out_MW: num("Power generated", "MW", { minimum: 0, "x-group": "Budget" }),
      power_in_MW: num("Power drawn", "MW", { minimum: 0, "x-group": "Budget" }),
      heat_out_MW: num("Waste heat produced", "MW", { minimum: 0, "x-group": "Budget" }),
      heat_reject_MW: num("Heat rejected (radiators)", "MW", { minimum: 0, "x-group": "Budget" }),
      reject_temp_k: num("Radiator working temperature", "K", {
        minimum: 0,
        "x-group": "Budget",
        description:
          "Which array this radiator is. Life-support heat (~300 K) and reactor/weapon heat (800–1500 K) need separate arrays and are never summed into one rejection figure — docs/UNITS.md §5. A radiator that leaves this blank is counted against whichever array still needs it.",
      }),
      power_standby_MW: num("Power drawn on standby", "MW", {
        minimum: 0,
        "x-group": "Budget",
        description: "Draw when idling but available. Without it, an operating mode's `standby` setting is budgeted as off rather than as a guessed fraction.",
      }),
      radiated_power_kw: num("Radiated RF power", "kW", {
        minimum: 0,
        "x-group": "Budget",
        description: "What this module puts into space. Anything above zero is an emitter, and the EMCON mode template shuts it down.",
      }),
      crew: num("Crew required", undefined, { minimum: 0, "x-group": "Budget" }),
      crew_basis: str("Crew basis", {
        enum: ["per_watch", "total"],
        default: "per_watch",
        "x-group": "Budget",
        description:
          "Whether `crew` is the people on station in one watch, or the whole complement for this module. Per-watch figures get the watch multiplier; totals do not. The NEBULOUS catalogue is `total` \u2014 see docs/UNITS.md \u00a74.",
      }),
      bus_iface: str("Bus interface", {
        "x-group": "Budget",
        description: "Mounting standard this module is built to. A module on a hull built to a different standard raises a fit advisory.",
      }),
      cost: num("Cost", "M$", { minimum: 0, "x-group": "Budget" }),
      thrust_kN: num("Thrust", "kN", { minimum: 0, "x-group": "Propulsion" }),
      isp_s: num("Specific impulse", "s", { minimum: 0, "x-group": "Propulsion" }),
      propellant: str("Propellant", { "x-group": "Propulsion", description: "A `_tables/propellants.yaml` row id, so the tanks that feed this drive can be identified." }),
      cycle: str("Cycle", {
        enum: ["", "open", "closed"],
        "x-group": "Propulsion",
        description:
          "Open-cycle drives carry their propulsion waste heat away in the exhaust and need no radiator for it; closed-cycle drives do — docs/UNITS.md §5. A drive that leaves this blank is treated as closed, which is the conservative half.",
      }),
      propellant_capacity_t: num("Propellant capacity (tanks)", "t", { minimum: 0, "x-group": "Propulsion" }),
      range_km: num("Effective range", "km", { minimum: 0, "x-group": "Weapon" }),
      muzzle_velocity_kms: num("Muzzle / terminal velocity", "km/s", { minimum: 0, "x-group": "Weapon" }),
      rate_of_fire_rpm: num("Rate of fire", "rpm", { minimum: 0, "x-group": "Weapon" }),
      yield_MJ: num("Yield per shot", "MJ", { minimum: 0, "x-group": "Weapon" }),
      magazine: num("Magazine / rounds", undefined, { minimum: 0, "x-group": "Weapon" }),
      weapon_family: str("Weapon family", {
        enum: ["", "gun", "cell", "rocket", "arm", "laser", "plasma", "particle", "ciws"],
        "x-group": "Weapon",
        description:
          "What this mounting looks like on the silhouette. Weapons that work the same way share a shape and differ by scale — every barrel weapon is `gun` — so this is only needed where the category does not decide it, e.g. a rocket bundle or a one-armed bandit among the kinetics.",
      }),
      bore_mm: num("Bore", "mm", { minimum: 0, "x-group": "Weapon", description: "From a mount's `ammo_mm`. Sets barrel length and thickness in the silhouette." }),
      barrels: { type: "integer" as const, title: "Barrels", minimum: 0, "x-group": "Weapon", description: "Tubes in the mounting. Widens the gunhouse and draws one barrel each." },
      launch_cells: { type: "integer" as const, title: "Launch cells", minimum: 0, "x-group": "Weapon", description: "Cells or tubes, from a launcher's `cells_capacity`. Sets how many hatches are drawn." },
      guidance: str("Guidance / seeker", { "x-group": "Weapon" }),
      description: text("Description"),
    },
  },
};

export const HULL_SCHEMA: TypeSchema = {
  id: "hull",
  version: 2,
  title: "Hull",
  description:
    "A reusable hull: the spine and its stations, the volumetric sections, the external slot inventory, armour zones and appendages. This is the frozen contract \u2014 a ship built on the hull fills it but never reshapes it.",
  folder: "hulls",
  icon: "\u2b20",
  rels: ["derived-from", "built-by", "variant-of", "uses-bus", "uses-style"],
  indexColumns: ["hull_class", "spine.length_m", "structural_mass_t"],
  fields: {
    type: "object",
    properties: {
      hull_class: str("Hull class code", { description: "e.g. DD, CL, FF, PC, SC" }),
      environment: str("Environment", {
        enum: ["orbital", "aerobrake", "lander"],
        default: "orbital",
        description: "Aerodynamic parts are only available to a hull that meets an atmosphere.",
      }),
      bus: ref("Bus standard", ["bus"], "uses-bus"),
      style: ref("Style kit", ["style"], "uses-style"),
      parent: ref("Variant of", ["hull"], "variant-of"),
      spine: {
        type: "object",
        title: "Spine",
        "x-group": "Geometry",
        description:
          "Side profile mirrored about the long axis, with an independent beam giving an elliptical cross-section. x is metres from the bow.",
        properties: {
          length_m: num("Length", "m", { minimum: 0 }),
          beam_m: num("Beam", "m", { minimum: 0, description: "Nominal beam where no override applies." }),
          station_pitch_m: num("Station pitch", "m", { minimum: 0, default: 3, description: "Snap grid and in-universe frame spacing. Defaults to the constraint set's cell_pitch_m." }),
          datum: str("Datum", { enum: ["bow"], default: "bow" }),
          stations: {
            type: "array",
            title: "Stations",
            items: {
              type: "object",
              properties: {
                x: num("Station", "m", { minimum: 0 }),
                half_height_m: num("Half-height", "m", { minimum: 0 }),
              },
            },
          },
          beam_overrides: {
            type: "array",
            title: "Beam overrides",
            items: {
              type: "object",
              properties: { x: num("Station", "m", { minimum: 0 }), beam_m: num("Beam", "m", { minimum: 0 }) },
            },
          },
        },
      },
      packing_efficiency: num("Packing efficiency", undefined, { minimum: 0, maximum: 1, "x-group": "Geometry", description: "Usable fraction of gross internal volume." }),
      structure_mass_fraction: num("Structure mass fraction", undefined, { minimum: 0, "x-group": "Budget" }),
      sections: {
        type: "array",
        title: "Sections",
        "x-group": "Geometry",
        description: "Internal volumetric budgets along the hull. Placement is volume totals against the allowed list \u2014 there is no bin-packing.",
        items: {
          type: "object",
          properties: {
            id: str("Id"),
            x0: num("From", "m", { minimum: 0 }),
            x1: num("To", "m", { minimum: 0 }),
            allowed: strs("Allowed module categories"),
            pressurised: { type: "boolean" as const, title: "Pressurised" },
          },
        },
      },
      external_slots: {
        type: "array",
        title: "External slots",
        "x-group": "Geometry",
        items: {
          type: "object",
          properties: {
            id: str("Id"),
            x: num("Station", "m", { minimum: 0 }),
            theta_deg: num("Clock angle", "\u00b0", { description: "0 dorsal, 90 starboard beam, 180 ventral." }),
            type: str("Slot type", {
              enum: ["spinal", "turret", "pd", "radiator", "comms", "sensor", "optics", "tank", "drive", "thruster", "dock", "pod", "hangar", "external"],
              description: "What the slot is for. Decides the part drawn in the silhouette; `spinal`, `hangar` and `external` have no external appearance.",
            }),
            size: str("Size", { enum: ["S", "M", "L", "XL"] }),
            part: str("Part override", {
              description: "Draw this part instead of the one the style kit gives this slot type — a captured or export hull carrying a foreign fitting. Reported as a deviation, never blocked.",
            }),
          },
        },
      },
      armor_zones: {
        type: "array",
        title: "Armour zones",
        "x-group": "Budget",
        items: {
          type: "object",
          properties: {
            id: str("Id"),
            x0: num("From", "m", { minimum: 0 }),
            x1: num("To", "m", { minimum: 0 }),
            material: str("Material"),
            thickness_cm: num("Thickness", "cm", { minimum: 0 }),
          },
        },
      },
      appendages: {
        type: "array",
        title: "Appendages",
        "x-group": "Geometry",
        description: "Flat parts in the silhouette plane, mirrored vertically \u2014 never swept.",
        items: {
          type: "object",
          properties: {
            id: str("Id"),
            kind: str("Kind", { enum: ["radiator", "pylon", "sponson", "boom", "antenna", "tank_strap", "greeble"] }),
            station: num("Station", "m", { minimum: 0 }),
            attach_r: num("Attach height", "m", { minimum: 0 }),
            mirror: str("Mirror", { enum: ["vertical", "none"], default: "vertical" }),
            part: str("Style-kit part"),
          },
        },
      },
      structural_mass_t: num("Structural mass", "t", { minimum: 0, "x-group": "Budget" }),
      structural_cost: num("Structural cost", "M$", { minimum: 0, "x-group": "Budget" }),
      armor: str("Armour scheme"),
      migration_review: {
        type: "boolean" as const,
        title: "Needs geometry review",
        "x-hidden": true,
        description: "Set by the v1 to v2 migration: the spine was synthesised to preserve the authored volume and the real profile still needs drawing.",
      },
      slots: {
        type: "array",
        title: "Slots (v1, deprecated)",
        "x-hidden": true,
        description: "Kept so the phase-1 budget engine keeps producing identical numbers. Editor 2 moves the budget engine onto external_slots and sections, and this goes.",
        items: {
          type: "object",
          properties: {
            id: str("Slot id"),
            kind: str("Kind", { enum: ["internal", "external", "spinal", "turret", "drive", "radiator", "hangar"] }),
            count: { type: "integer" as const, title: "Count", default: 1, minimum: 1 },
            x: num("x (silhouette %)"),
            y: num("y (silhouette %)"),
          },
        },
      },
      design_notes: text("Design notes"),
    },
  },
};

export const BUS_SCHEMA: TypeSchema = {
  id: "bus",
  version: 1,
  title: "Bus standard",
  description:
    "The shared dimensions a yard builds to: core diameters, tank barrel lengths, truss pitch, docking-ring sizes, mount interface sizes. This is what makes a nation's tug, oiler and frigate visibly share parts.",
  folder: "buses",
  icon: "\u2500",
  rels: ["derived-from", "adopted-by"],
  indexColumns: ["core_diameter_m", "ring_size"],
  fields: {
    type: "object",
    properties: {
      core_diameter_m: num("Core diameter", "m", { minimum: 0 }),
      tank_barrel_m: num("Tank barrel length", "m", { minimum: 0 }),
      truss_pitch_m: num("Truss pitch", "m", { minimum: 0 }),
      station_pitch_m: num("Station pitch", "m", { minimum: 0, default: 3 }),
      ring_size: str("Docking ring standard"),
      mount_ifaces: strs("Mount interfaces"),
      notes: text("Notes"),
    },
  },
};

export const STYLE_SCHEMA: TypeSchema = {
  id: "style",
  version: 2, // 2: radiator_aspect
  title: "Style kit",
  description:
    "A polity's kit of parts and proportions. New hulls for that polity start from it; anything off-kit is listed as a deviation and never blocked, since a captured or export hull should be able to violate it.",
  folder: "styles",
  icon: "\u25e7",
  rels: ["used-by"],
  indexColumns: ["construction"],
  fields: {
    type: "object",
    properties: {
      construction: str("Construction", { enum: ["truss", "monocoque", "mixed"], default: "mixed" }),
      ld_ratio_min: num("Slenderness, min", undefined, { minimum: 0, "x-group": "Proportions" }),
      ld_ratio_max: num("Slenderness, max", undefined, { minimum: 0, "x-group": "Proportions" }),
      max_beam_m: num("Maximum beam", "m", { minimum: 0, "x-group": "Proportions" }),
      part_radiator: str("Radiators", { enum: ["fin", "panel", "droplet-boom", "spine-array", "hoop", "membrane"], default: "panel", "x-group": "Parts" }),
      radiator_panels: num("Panels per array", undefined, {
        minimum: 1,
        maximum: 8,
        default: 1,
        "x-group": "Parts",
        description: "How many panels an array is built from. Two classes in the same navy differ by this rather than by changing family.",
      }),
      radiator_sweep_deg: num("Radiator sweep", "°", {
        minimum: -60,
        maximum: 60,
        default: 0,
        "x-group": "Parts",
        description: "Rake of the array. Positive leans forward, negative aft.",
      }),
      radiator_aspect: num("Radiator aspect", undefined, {
        minimum: 1,
        default: 1.35,
        "x-group": "Parts",
        description:
          "Height over length along the hull, at size M. Never below 1: radiators stay taller than wide. Each family keeps its own character around this — fins run taller, membranes squatter.",
      }),
      part_turret: str("Turrets", { enum: ["box", "barbette", "cupola"], default: "box", "x-group": "Parts" }),
      part_tank: str("Tanks", { enum: ["barrel", "spherical", "conformal"], default: "barrel", "x-group": "Parts" }),
      part_thruster: str("Thrusters", { enum: ["bell", "block", "cluster"], default: "bell", "x-group": "Parts" }),
      part_antenna: str("Antennas", { enum: ["dish", "phased-panel", "whip"], default: "dish", "x-group": "Parts" }),
      code_format: str("Hull code format", { "x-group": "Markings", description: "e.g. {PREFIX}-{TYPE}-{NUM}" }),
      greeble_density: str("Greeble density", { enum: ["low", "medium", "high"], default: "medium", "x-group": "Markings" }),
      doctrine_drives: strs("Doctrinal drive families"),
      doctrine_armour: str("Armour doctrine", { enum: ["none", "nose_heavy", "uniform", "belt"], default: "nose_heavy" }),
      crewed: { type: "boolean" as const, title: "Crewed", default: true },
      notes: text("Notes"),
    },
  },
};

export const CRAFT_SCHEMA: TypeSchema = {
  id: "craft",
  version: 2,
  title: "Craft",
  description:
    "Ships, stations, strike craft, missiles, drones: what fills a hull. Slot assignments, the internal manifest, tank fill, magazines, crew and operating modes. Geometry belongs to the hull and is never changed here.",
  folder: "craft",
  icon: "➤",
  rels: ["operated-by", "built-by", "variant-of", "carries", "based-at", "successor-of"],
  indexColumns: ["kind", "hull_class", "role", "operator", "status"],
  fields: {
    type: "object",
    required: ["kind"],
    properties: {
      kind: str("Kind", { enum: ["ship", "station", "strikecraft", "missile", "drone", "torpedo", "silocraft"], default: "ship" }),
      hull_class: str("Hull classification", { description: "e.g. DDL, CLCN, CV, BM" }),
      role: str("Role"),
      hull: ref("Hull", ["hull"], "uses-hull"),
      operator: ref("Operator", ["polity"], "operated-by"),
      builder: ref("Builder", ["polity", "location"], "built-by"),
      parent: ref("Variant of", ["craft"], "variant-of"),
      status: str("Status", { enum: ["concept", "prototype", "in service", "reserve", "retired", "lost"], default: "concept" }),
      introduced: str("Introduced"),
      fittings: {
        type: "array",
        title: "Fittings",
        "x-group": "Loadout",
        description: "External modules, one per hull slot. A slot holds one fitting, so the hull's slot id is the fitting's identity.",
        items: {
          type: "object",
          properties: {
            slot: str("Hull slot", { description: "The id of an `external_slots` entry on the hull." }),
            module: ref("Module", ["module"], "carries"),
            magazine: {
              type: "array",
              title: "Munition mix",
              description:
                "Rounds loaded, by munitions-table row. Counts only: `_tables/munitions.yaml` carries no mass per round, so a magazine is checked against the launcher's capacity and adds no mass.",
              items: {
                type: "object",
                properties: {
                  munition: str("Munition", { description: "`_tables/munitions.yaml` row id." }),
                  rounds: { type: "integer" as const, title: "Rounds", minimum: 0, default: 0 },
                },
              },
            },
            note: str("Note"),
          },
        },
      },
      manifest: {
        type: "array",
        title: "Internal manifest",
        "x-group": "Loadout",
        description: "Internal components, spending a section's volume budget. Volume totals against the section's `allowed` list — there is no bin-packing.",
        items: {
          type: "object",
          properties: {
            id: str("Id"),
            section: str("Hull section", { description: "The id of a `sections` entry on the hull." }),
            module: ref("Module", ["module"], "carries"),
            count: { type: "integer" as const, title: "Count", default: 1, minimum: 1 },
          },
        },
      },
      tanks: {
        type: "array",
        title: "Tanks",
        "x-group": "Loadout",
        description: "Propellant loads. The tank module carries the dry tankage mass and the capacity; the propellant row carries the density that turns volume into mass.",
        items: {
          type: "object",
          properties: {
            id: str("Id"),
            section: str("Hull section"),
            module: ref("Tank module", ["module"], "carries"),
            propellant: str("Propellant", { description: "`_tables/propellants.yaml` row id." }),
            volume_m3: num("Load", "m³", { minimum: 0 }),
            jettison_order: {
              type: "integer" as const,
              title: "Jettison order",
              minimum: 0,
              default: 0,
              description: "0 is integral and burns last; 1 is dropped first, then 2. Staging recomputes the rocket equation at each drop.",
            },
          },
        },
      },
      modes: {
        type: "array",
        title: "Operating modes",
        "x-group": "Loadout",
        description:
          "Power and heat are reported per mode. A component a mode does not name runs at full, so a craft with no modes budgets exactly as it did before modes existed.",
        items: {
          type: "object",
          properties: {
            id: str("Id"),
            name: str("Name"),
            duties: {
              type: "array" as const,
              title: "Duties",
              description: "What each component is doing in this mode. Anything not listed runs at full.",
              items: {
                type: "object" as const,
                properties: {
                  component: str("Component", { description: "A fitting's slot id, a manifest entry's id, or a tank's id." }),
                  duty: str("Duty", { description: "`off`, `standby`, `full`, or a fraction between 0 and 1." }),
                },
              },
            },
            note: str("Note"),
          },
        },
      },
      loadout: {
        type: "array",
        title: "Loadout (v1, unplaced)",
        "x-group": "Loadout",
        description:
          "The pre-v2 flat loadout. `slot` here was a slot *kind*, not a place, so these lines count in every total but are not drawn and not checked for fit until they are moved onto a slot or into a section. The migrator deliberately leaves them alone rather than guessing a placement.",
        items: {
          type: "object",
          properties: {
            module: ref("Module", ["module"], "carries"),
            count: { type: "integer", title: "Count", default: 1, minimum: 1 },
            slot: str("Slot kind"),
          },
        },
      },
      propellant_t: num("Propellant loaded", "t", { minimum: 0, "x-group": "Budget", description: "The pre-v2 bare propellant mass, with no tank and no propellant type. Read only while `tanks` is empty." }),
      watch_sections: {
        type: "integer" as const,
        title: "Watch sections",
        minimum: 1,
        maximum: 6,
        default: 3,
        "x-group": "Budget",
        description: "How many sections the crew divides into. 3 for a warship; 1 for a station or small craft that stands no rotating watch.",
      },
      watches_manned: {
        type: "integer" as const,
        title: "Sections manned",
        minimum: 1,
        maximum: 6,
        default: 2,
        "x-group": "Budget",
        description:
          "How many sections are on station at once. Two of three is the standard bill — one section asleep, the other two up — which puts two thirds of the complement on watch. Only modules whose `crew_basis` is `per_watch` are scaled by the ratio; the NEBULOUS-seeded catalogue is `total` and is exempt (docs/UNITS.md §4).",
      },
      endurance_days: num("Endurance", "days", { minimum: 0, "x-group": "Budget", description: "Needs a constraint set's `kg_per_crew_day` to become a consumables mass." }),
      crew_override: num("Crew (override)", undefined, { minimum: 0, "x-group": "Budget" }),
      carried: refs("Carried craft", ["craft"], "carries"),
      units: strs("Named units"),
      naming_theme: str("Naming theme"),
      doctrine: text("Doctrine / employment"),
    },
  },
};

export const BUILTIN_SCHEMAS: TypeSchema[] = [
  NOTE_SCHEMA,
  POLITY_SCHEMA,
  LOCATION_SCHEMA,
  BODY_SCHEMA,
  SYSTEM_SCHEMA,
  CHARACTER_SCHEMA,
  MODULE_SCHEMA,
  HULL_SCHEMA,
  BUS_SCHEMA,
  STYLE_SCHEMA,
  CRAFT_SCHEMA,
];
