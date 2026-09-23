/**
 * Built-in presets: starting values for new records. Written to
 * `<vault>/_presets/<type>/<id>.yaml` on first run; on-disk copies win.
 *
 * Numbers are order-of-magnitude placeholders for a mid-22nd-century hard-SF
 * baseline (fission/NSWR era); tune them per setting via the files.
 */
import type { Preset } from "../../types";
import type { ArmorZone, Spine } from "../../designer/hull/types";
import { ANCHOR_PRESET_ID, hullClassPresets } from "../../designer/hull/classes";
import { BODY_PRESETS } from "./bodyPresets";

const BASE_PRESETS: Preset[] = [
  ...BODY_PRESETS,
  // ---- polity ------------------------------------------------------------
  {
    id: "nation",
    type: "polity",
    title: "Nation-state",
    fields: { kind: "nation", government: "federal republic" },
  },
  {
    id: "megacorp",
    type: "polity",
    title: "Chartered company / megacorp",
    description: "East India Company pattern: charter from a sponsor state, Court of Directors, de facto sovereignty in the field.",
    fields: { kind: "corporation", government: "chartered company — Court of Directors, Governor-General" },
  },
  {
    id: "alliance",
    type: "polity",
    title: "Alliance / bloc",
    fields: { kind: "alliance", government: "treaty organisation" },
  },
  {
    id: "colony",
    type: "polity",
    title: "Chartered colony",
    description: "Pays a charter fee to a sponsor for currency, defense, courts, and representation.",
    fields: { kind: "colony", government: "chartered settlement under sponsor law" },
  },

  // ---- location ----------------------------------------------------------
  { id: "station", type: "location", title: "Orbital station", fields: { kind: "station", orbit_km: 400 } },
  { id: "lagrange-depot", type: "location", title: "Lagrange-point depot", fields: { kind: "depot", lagrange: "L1" } },
  { id: "surface-city", type: "location", title: "Surface city", fields: { kind: "city", lat: 0, lon: 0 } },
  { id: "shipyard", type: "location", title: "Shipyard", fields: { kind: "shipyard" } },
  { id: "skyhook", type: "location", title: "Skyhook / rotovator", fields: { kind: "skyhook", orbit_km: 600 } },

  // ---- module: drives & power -------------------------------------------
  {
    id: "nswr-drive",
    type: "module",
    title: "NSWR drive (nuclear salt-water rocket)",
    description:
      "Zubrin-style continuous-fission torch. Huge thrust and Isp; horrendous exhaust. The tank holds a uranium tetrabromide brine at about 20% enrichment; `propellant` names the water it is dissolved in, which is the propellants-table row the density comes from.",
    tags: ["drive", "nuclear"],
    fields: {
      category: "drive",
      slot: "drive",
      mass_t: 120,
      thrust_kN: 12000,
      isp_s: 6700,
      propellant: "water",
      cycle: "open",
      heat_out_MW: 250,
      cost: 900,
      crew: 6,
    },
  },
  {
    id: "ntr-drive",
    type: "module",
    title: "Solid-core NTR",
    tags: ["drive", "nuclear"],
    fields: { category: "drive", slot: "drive", mass_t: 40, thrust_kN: 330, isp_s: 900, propellant: "hydrogen-liquid", cycle: "open", heat_out_MW: 30, cost: 120, crew: 2 },
  },
  {
    id: "chemical-drive",
    type: "module",
    title: "Chemical engine (methalox)",
    tags: ["drive", "chemical"],
    fields: { category: "drive", slot: "drive", mass_t: 8, thrust_kN: 2200, isp_s: 360, propellant: "methane-liquid", cycle: "open", heat_out_MW: 2, cost: 15 },
  },
  {
    id: "fission-reactor",
    type: "module",
    title: "Fission reactor, 50 MWe",
    tags: ["power", "nuclear"],
    fields: { category: "reactor", slot: "internal", mass_t: 60, volume_m3: 900, power_out_MW: 50, heat_out_MW: 100, cost: 200, crew: 4 },
  },
  {
    id: "dhe3-fusion-reactor",
    type: "module",
    title: "D–He3 fusion reactor, 200 MWe",
    tags: ["power", "fusion"],
    fields: { category: "reactor", slot: "internal", mass_t: 180, volume_m3: 2400, power_out_MW: 200, heat_out_MW: 250, cost: 1200, crew: 8 },
  },
  {
    id: "droplet-radiator",
    type: "module",
    title: "Liquid-droplet radiator, 50 MW",
    tags: ["thermal"],
    fields: { category: "radiator", slot: "radiator", mass_t: 12, heat_reject_MW: 50, power_in_MW: 0.5, cost: 25 },
  },
  {
    id: "panel-radiator",
    type: "module",
    title: "Panel radiator, 10 MW",
    tags: ["thermal"],
    fields: { category: "radiator", slot: "radiator", mass_t: 8, heat_reject_MW: 10, cost: 6 },
  },
  {
    id: "propellant-tank",
    type: "module",
    title: "Propellant tank, 500 t",
    fields: { category: "tank", slot: "external", mass_t: 25, propellant_capacity_t: 500, cost: 10 },
  },

  // ---- module: weapons & defense ----------------------------------------
  {
    id: "spinal-railgun",
    type: "module",
    title: "Spinal railgun, 2 km/s class",
    tags: ["weapon", "kinetic"],
    fields: {
      category: "weapon-kinetic",
      slot: "spinal",
      mass_t: 90,
      power_in_MW: 40,
      heat_out_MW: 30,
      range_km: 2000,
      muzzle_velocity_kms: 2.5,
      rate_of_fire_rpm: 6,
      yield_MJ: 60,
      magazine: 200,
      cost: 150,
      crew: 5,
    },
  },
  {
    id: "clgg-turret",
    type: "module",
    title: "Combustion light-gas gun turret",
    tags: ["weapon", "kinetic"],
    fields: { category: "weapon-kinetic", slot: "turret", mass_t: 35, power_in_MW: 2, heat_out_MW: 4, range_km: 600, muzzle_velocity_kms: 1.6, rate_of_fire_rpm: 20, magazine: 400, cost: 45, crew: 3 },
  },
  {
    id: "laser-turret",
    type: "module",
    title: "Laser turret, 20 MW",
    tags: ["weapon", "laser"],
    fields: { category: "weapon-laser", slot: "turret", mass_t: 30, power_in_MW: 20, heat_out_MW: 16, range_km: 5000, cost: 220, crew: 2 },
  },
  {
    id: "pd-laser",
    type: "module",
    title: "Point-defense pulse laser",
    tags: ["defense", "laser"],
    fields: { category: "point-defense", slot: "pd", mass_t: 6, power_in_MW: 3, power_standby_MW: 0.2, heat_out_MW: 2.5, range_km: 300, rate_of_fire_rpm: 600, cost: 40 },
  },
  {
    id: "pd-flak",
    type: "module",
    title: "Point-defense flak cannon",
    tags: ["defense", "kinetic"],
    fields: { category: "point-defense", slot: "pd", mass_t: 9, power_in_MW: 0.5, power_standby_MW: 0.05, heat_out_MW: 0.3, range_km: 40, rate_of_fire_rpm: 1200, magazine: 5000, cost: 12 },
  },
  // ---- module: the UJCN fit ------------------------------------------------
  // Design figures, not sourced physical constants: these exist so the ship
  // editor has mounts whose *scale* reaches the silhouette, and so the two
  // radiator loops are distinguishable. `bore_mm`, `barrels` and `launch_cells`
  // are the columns `_tables/mounts.yaml` already carries as `ammo_mm` and
  // `cells_capacity`.
  {
    id: "mk66-twin",
    type: "module",
    title: "Mk66 450 mm twin",
    description: "The UJCN destroyer's main battery: a twin 450 mm coilgun in a barbette.",
    tags: ["weapon", "kinetic", "ujcn"],
    fields: {
      category: "weapon-kinetic",
      slot: "turret",
      weapon_family: "gun",
      bore_mm: 450,
      barrels: 2,
      mass_t: 95,
      volume_m3: 260,
      power_in_MW: 2,
      power_standby_MW: 0.2,
      heat_out_MW: 3,
      magazine: 240,
      crew: 12,
      bus_iface: "UJCN-M",
      cost: 120,
    },
  },
  {
    id: "mk81-single",
    type: "module",
    title: "Mk81 300 mm single",
    description: "The same gunhouse pattern two calibres down: the after mount and the export fit.",
    tags: ["weapon", "kinetic", "ujcn"],
    fields: {
      category: "weapon-kinetic",
      slot: "turret",
      weapon_family: "gun",
      bore_mm: 300,
      barrels: 1,
      mass_t: 34,
      volume_m3: 90,
      power_in_MW: 1,
      power_standby_MW: 0.1,
      heat_out_MW: 1.5,
      magazine: 180,
      crew: 6,
      bus_iface: "UJCN-S",
      cost: 45,
    },
  },
  {
    id: "vls-32",
    type: "module",
    title: "32-cell vertical launcher",
    tags: ["weapon", "missile", "ujcn"],
    fields: { category: "weapon-missile", slot: "turret", launch_cells: 32, magazine: 32, mass_t: 60, volume_m3: 220, power_in_MW: 0.4, crew: 4, bus_iface: "UJCN-L", cost: 70 },
  },
  {
    id: "beam-turret",
    type: "module",
    title: "Main-battery laser turret",
    tags: ["weapon", "laser", "ujcn"],
    fields: { category: "weapon-laser", slot: "turret", mass_t: 70, volume_m3: 180, power_in_MW: 40, power_standby_MW: 1.5, heat_out_MW: 36, crew: 5, bus_iface: "UJCN-L", cost: 160 },
  },
  {
    id: "rcs-cluster",
    type: "module",
    title: "Attitude thruster cluster",
    description: "A quad of bipropellant nozzles on a hardpoint. Fitted to a `thruster` slot, where its thrust turns the ship rather than pushing it, so it stays out of the Δv sum.",
    tags: ["propulsion", "attitude"],
    fields: { category: "drive", slot: "thruster", mass_t: 1.6, thrust_kN: 40, isp_s: 320, propellant: "methane-liquid", cycle: "open", heat_out_MW: 0.4, power_in_MW: 0.05, cost: 6 },
  },
  {
    id: "search-radar",
    type: "module",
    title: "Search radar",
    description: "The set an ESM receiver hears first — `radiated_power_kw` is what EMCON shuts down.",
    tags: ["sensor", "emitter"],
    fields: { category: "sensor", slot: "external", mass_t: 9, volume_m3: 40, power_in_MW: 3.6, power_standby_MW: 0.4, heat_out_MW: 3.2, radiated_power_kw: 4100, crew: 2, cost: 60 },
  },
  {
    id: "hot-loop-radiator",
    type: "module",
    title: "High-temperature radiator array",
    description: "The reactor and drive loop. Small for its rejection because it runs hot; useless for anything a crew lives next to.",
    tags: ["thermal"],
    fields: { category: "radiator", slot: "radiator", mass_t: 18, heat_reject_MW: 120, reject_temp_k: 1150, power_in_MW: 0.3, cost: 30 },
  },
  {
    id: "cold-loop-radiator",
    type: "module",
    title: "Low-temperature radiator array",
    description: "Life support and electronics at ~330 K. Rejects far less per tonne, and every crewed ship needs one — docs/UNITS.md §5.",
    tags: ["thermal"],
    fields: { category: "radiator", slot: "radiator", mass_t: 11, heat_reject_MW: 12, reject_temp_k: 330, power_in_MW: 0.2, cost: 14 },
  },
  {
    id: "missile-pod",
    type: "module",
    title: "Missile pod (8-cell)",
    tags: ["weapon", "missile"],
    fields: { category: "weapon-missile", slot: "external", mass_t: 40, magazine: 8, guidance: "cold-launch, delegated to missile", cost: 30 },
  },
  {
    id: "torpedo-tube",
    type: "module",
    title: "Torpedo tube (heavy)",
    tags: ["weapon", "missile"],
    fields: { category: "weapon-missile", slot: "internal", mass_t: 60, magazine: 4, cost: 50, crew: 2 },
  },
  {
    id: "sensor-suite",
    type: "module",
    title: "Sensor suite (radar/lidar/IR)",
    fields: { category: "sensor", slot: "external", mass_t: 15, power_in_MW: 4, heat_out_MW: 3, range_km: 200000, cost: 80, crew: 4 },
  },
  {
    id: "ew-suite",
    type: "module",
    title: "EW / decoy suite",
    fields: { category: "ew", slot: "internal", mass_t: 10, power_in_MW: 6, heat_out_MW: 5, cost: 70, crew: 3 },
  },
  {
    id: "whipple-armor",
    type: "module",
    title: "Whipple / spaced armor belt",
    fields: { category: "armor", slot: "external", mass_t: 200, cost: 40 },
  },
  {
    id: "habitat-ring",
    type: "module",
    title: "Crew habitat (spun)",
    fields: { category: "habitat", slot: "internal", mass_t: 150, volume_m3: 4000, power_in_MW: 2, heat_out_MW: 2, cost: 90 },
  },
  {
    id: "berthing",
    type: "module",
    title: "Berthing and messing",
    description: "Bunks, heads, galley and mess for a destroyer's watch bill. Supplies no crew of its own; what it *supports* is not modelled until modules can declare a capacity.",
    tags: ["crew"],
    fields: { category: "habitat", slot: "internal", mass_t: 55, volume_m3: 1400, power_in_MW: 0.9, heat_out_MW: 1.1, cost: 22 },
  },
  {
    id: "hangar-bay",
    type: "module",
    title: "Hangar bay (4 strike craft)",
    fields: { category: "hangar", slot: "hangar", mass_t: 120, volume_m3: 6000, power_in_MW: 1, cost: 60, crew: 20 },
  },

  // ---- bus and style -------------------------------------------------------
  // One worked example of each. Others are added as polities are authored; the
  // point of these is that the editor's conformance panel has something real to
  // check against, and that a hull preset can reference them.
  {
    id: "ujcn-mk2-bus",
    type: "bus",
    title: "UJCN Mk2 bus",
    fields: {
      core_diameter_m: 9,
      tank_barrel_m: 18,
      truss_pitch_m: 3,
      station_pitch_m: 3,
      ring_size: "UJCN standard ring, 1.4 m clear",
      // Named mounting standards a module is built *to*, by size class. The
      // earlier list repeated the hull's slot *types*, which are a different
      // thing: a slot's type says what goes there, an interface says whether it
      // bolts on. Editor 2's fit check is the first thing to read this.
      mount_ifaces: ["UJCN-S", "UJCN-M", "UJCN-L"],
      notes: "The yard dimensions every UJCN hull is built to. A tug, an oiler and a destroyer share tank barrels and ring sizes, which is what makes them look like one navy up close.",
    },
  },
  {
    id: "ujcn-style",
    type: "style",
    title: "UJCN style kit",
    fields: {
      construction: "mixed",
      ld_ratio_min: 6,
      ld_ratio_max: 16,
      max_beam_m: 34,
      part_radiator: "fin",
      radiator_panels: 3,
      radiator_sweep_deg: -25,
      part_turret: "barbette",
      part_tank: "barrel",
      part_thruster: "bell",
      part_antenna: "dish",
      code_format: "{PREFIX}-{TYPE}-{NUM}",
      greeble_density: "medium",
      doctrine_armour: "nose_heavy",
      crewed: true,
      notes:
        "Three aft-swept radiator fins per array, barbette mountings and barrel tankage. Nose-heavy armour: UJCN doctrine is to fight bow-on and accept the beam aspect.",
    },
  },

  // ---- hull --------------------------------------------------------------
  {
    // Hand-built to the v2 contract: a real profile with hard shoulders, a
    // slot inventory on the station grid, and sections that cover the hull.
    // This is what a hull authored in editor 1 looks like, as against the v1
    // presets below which exist to exercise the migrator.
    // It is also the anchor of the eleven hull classes (`hull/classes.ts`):
    // the DD entry, and the ship every other class is scaled from.
    id: "ujcn-destroyer-hull",
    type: "hull",
    title: "DD — destroyer hull (UJCN pattern, the class anchor)",
    tags: ["class", "DD"],
    fields: {
      hull_class: "DD",
      environment: "orbital",
      packing_efficiency: 0.78,
      structure_mass_fraction: 0.16,
      structural_mass_t: 1650,
      structural_cost: 380,
      armor: "Nose-heavy: spaced ceramic over the bow third, whipple elsewhere",
      spine: {
        length_m: 138,
        beam_m: 13,
        station_pitch_m: 3,
        datum: "bow",
        stations: [
          { x: 0, half_height_m: 0.9 },
          { x: 27, half_height_m: 5.2 }, // the armoured nose taper
          { x: 27, half_height_m: 6.5 }, // shoulder onto the forward block
          { x: 48, half_height_m: 6.5 },
          { x: 48, half_height_m: 4.2 }, // waist
          { x: 60, half_height_m: 4.2 },
          { x: 60, half_height_m: 6.8 }, // midships magazine block
          { x: 87, half_height_m: 6.8 },
          { x: 87, half_height_m: 5.4 },
          { x: 132, half_height_m: 5.4 }, // engineering
          { x: 138, half_height_m: 5.4 }, // blunt transom
        ],
        // Without these the beam stays at its nominal 13 m all the way to a
        // 0.9 m bow, and the hull renders as a blade wider than it is tall.
        // The advisory kernel catches it; this is the fix it points at.
        beam_overrides: [
          { x: 0, beam_m: 2.2 },
          { x: 27, beam_m: 13 },
          { x: 138, beam_m: 13 },
        ],
      },
      sections: [
        // Module categories, not archetypes: a module record carries a
        // `category` and will not carry an archetype until editor 3 authors
        // them, and a list in a vocabulary the other side cannot speak checks
        // nothing.
        { id: "forward", x0: 0, x1: 48, allowed: ["habitat", "sensor", "ew", "other"], pressurised: true },
        { id: "magazine", x0: 48, x1: 87, allowed: ["weapon-missile", "weapon-kinetic", "cargo", "other"] },
        { id: "engineering", x0: 87, x1: 138, allowed: ["reactor", "drive", "radiator", "tank", "other"] },
      ],
      armor_zones: [{ id: "bow", x0: 0, x1: 48, material: "composite", thickness_cm: 6 }],
      external_slots: [
        { id: "gun-a", x: 21, theta_deg: 0, type: "turret", size: "M" },
        { id: "gun-b", x: 36, theta_deg: 0, type: "turret", size: "M" },
        { id: "gun-y", x: 84, theta_deg: 180, type: "turret", size: "S" },
        { id: "eo", x: 30, theta_deg: 0, type: "optics", size: "S" },
        { id: "radar", x: 42, theta_deg: 0, type: "sensor", size: "M" },
        { id: "comms", x: 54, theta_deg: 0, type: "comms", size: "M" },
        { id: "cells", x: 66, theta_deg: 0, type: "turret", size: "L" },
        { id: "pd-p", x: 72, theta_deg: 180, type: "pd", size: "S" },
        { id: "rad-1", x: 96, theta_deg: 180, type: "radiator", size: "L" },
        { id: "rad-2", x: 114, theta_deg: 180, type: "radiator", size: "L" },
        { id: "tank", x: 108, theta_deg: 0, type: "tank", size: "L" },
        { id: "ring", x: 12, theta_deg: 180, type: "dock", size: "S" },
        // Attitude control fore and aft: a couple needs both ends, and the
        // arms are what set the slew rate.
        { id: "rcs-fwd-d", x: 15, theta_deg: 0, type: "thruster", size: "S" },
        { id: "rcs-fwd-v", x: 15, theta_deg: 180, type: "thruster", size: "S" },
        { id: "rcs-aft-d", x: 126, theta_deg: 0, type: "thruster", size: "S" },
        { id: "rcs-aft-v", x: 126, theta_deg: 180, type: "thruster", size: "S" },
        { id: "drive", x: 138, theta_deg: 0, type: "drive", size: "L" },
      ],
      design_notes:
        "Nose-heavy armour and a bow-on fighting doctrine: the beam aspect is accepted. Magazine amidships behind the waist, radiators ventral and aft so the dorsal arc stays clear for the fire-control radar.",
    },
  },

  {
    id: "destroyer-hull",
    type: "hull",
    title: "Destroyer hull",
    fields: {
      hull_class: "DD",
      length_m: 220,
      beam_m: 30,
      volume_m3: 60000,
      structural_mass_t: 1800,
      structural_cost: 400,
      slots: [
        { id: "spine", kind: "spinal", count: 1, x: 50, y: 50 },
        { id: "turrets", kind: "turret", count: 6, x: 50, y: 30 },
        { id: "drive", kind: "drive", count: 1, x: 5, y: 50 },
        { id: "radiators", kind: "radiator", count: 4, x: 30, y: 80 },
        { id: "bays", kind: "internal", count: 8, x: 60, y: 50 },
        { id: "hardpoints", kind: "external", count: 6, x: 70, y: 20 },
      ],
    },
  },
  {
    id: "cruiser-hull",
    type: "hull",
    title: "Cruiser hull",
    fields: {
      hull_class: "CC",
      length_m: 380,
      beam_m: 48,
      volume_m3: 180000,
      structural_mass_t: 5200,
      structural_cost: 1100,
      slots: [
        { id: "spine", kind: "spinal", count: 2, x: 50, y: 50 },
        { id: "turrets", kind: "turret", count: 12, x: 50, y: 30 },
        { id: "drive", kind: "drive", count: 2, x: 5, y: 50 },
        { id: "radiators", kind: "radiator", count: 8, x: 30, y: 80 },
        { id: "bays", kind: "internal", count: 16, x: 60, y: 50 },
        { id: "hardpoints", kind: "external", count: 12, x: 70, y: 20 },
        { id: "hangar", kind: "hangar", count: 1, x: 80, y: 50 },
      ],
    },
  },
  {
    id: "corvette-hull",
    type: "hull",
    title: "Corvette / patrol hull",
    fields: {
      hull_class: "PC",
      length_m: 90,
      beam_m: 14,
      volume_m3: 8000,
      structural_mass_t: 300,
      structural_cost: 60,
      slots: [
        { id: "turrets", kind: "turret", count: 2, x: 50, y: 30 },
        { id: "drive", kind: "drive", count: 1, x: 5, y: 50 },
        { id: "radiators", kind: "radiator", count: 2, x: 30, y: 80 },
        { id: "bays", kind: "internal", count: 3, x: 60, y: 50 },
        { id: "hardpoints", kind: "external", count: 2, x: 70, y: 20 },
      ],
    },
  },
  {
    id: "missile-body",
    type: "hull",
    title: "Missile body",
    fields: { hull_class: "MSL", length_m: 6, beam_m: 0.6, volume_m3: 1.5, structural_mass_t: 0.4, structural_cost: 0.5, slots: [{ id: "bus", kind: "internal", count: 3, x: 50, y: 50 }, { id: "motor", kind: "drive", count: 1, x: 5, y: 50 }] },
  },

  // ---- craft -------------------------------------------------------------
  {
    id: "destroyer",
    type: "craft",
    title: "Destroyer",
    fields: { kind: "ship", hull_class: "DD", role: "screen / escort", status: "concept", propellant_t: 3000, watch_sections: 3, watches_manned: 2 },
  },
  {
    id: "cruiser",
    type: "craft",
    title: "Cruiser",
    fields: { kind: "ship", hull_class: "CC", role: "independent operations / flag", status: "concept", propellant_t: 9000, watch_sections: 3, watches_manned: 2 },
  },
  {
    id: "frigate",
    type: "craft",
    title: "Frigate",
    fields: { kind: "ship", hull_class: "FF", role: "patrol / convoy escort", status: "concept", propellant_t: 1200, watch_sections: 3, watches_manned: 2 },
  },
  {
    id: "monitor",
    type: "craft",
    title: "Monitor",
    fields: { kind: "ship", hull_class: "BM", role: "orbital fire support / static defense", status: "concept", propellant_t: 400, watch_sections: 3, watches_manned: 2 },
  },
  {
    id: "carrier",
    type: "craft",
    title: "Carrier",
    fields: { kind: "ship", hull_class: "CV", role: "strike-craft carrier", status: "concept", propellant_t: 8000, watch_sections: 3, watches_manned: 2 },
  },
  {
    id: "station",
    type: "craft",
    title: "Station",
    fields: { kind: "station", hull_class: "ST", role: "orbital station", status: "concept", propellant_t: 0, watch_sections: 1, watches_manned: 1 },
  },
  {
    id: "strikecraft",
    type: "craft",
    title: "Strike craft",
    fields: { kind: "strikecraft", hull_class: "SC", role: "silocraft / interceptor", status: "concept", propellant_t: 40, watch_sections: 1, watches_manned: 1 },
  },
  {
    id: "missile",
    type: "craft",
    title: "Missile",
    fields: { kind: "missile", hull_class: "MSL", role: "anti-ship missile", status: "concept", propellant_t: 1.2, watch_sections: 1, watches_manned: 1 },
  },

  // ---- character ---------------------------------------------------------
  { id: "officer", type: "character", title: "Naval officer", fields: { role: "Commander", species: "human" } },
  { id: "executive", type: "character", title: "Company executive", fields: { role: "Director", species: "human" } },
];

/** The anchor every hull class is built against. */
const anchor = BASE_PRESETS.find((p) => p.id === ANCHOR_PRESET_ID);

/**
 * Every built-in preset. The hull classes are generated from the anchor
 * rather than typed out, so their derivation stays inspectable in
 * `designer/hull/classes.ts` — the measured figures there, the metres here.
 */
export const BUILTIN_PRESETS: Preset[] = [
  ...BASE_PRESETS,
  ...(anchor ? hullClassPresets({ spine: anchor.fields.spine as Spine, armor_zones: anchor.fields.armor_zones as ArmorZone[] }) : []),
];
