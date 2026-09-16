/**
 * Built-in presets: starting values for new records. Written to
 * `<vault>/_presets/<type>/<id>.yaml` on first run; on-disk copies win.
 *
 * Numbers are order-of-magnitude placeholders for a mid-22nd-century hard-SF
 * baseline (fission/NSWR era); tune them per setting via the files.
 */
import type { Preset } from "../../types";
import { BODY_PRESETS } from "./bodyPresets";

export const BUILTIN_PRESETS: Preset[] = [
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
    description: "Zubrin-style continuous-fission torch. Huge thrust and Isp; horrendous exhaust; needs uranium brine.",
    tags: ["drive", "nuclear"],
    fields: {
      category: "drive",
      slot: "drive",
      mass_t: 120,
      thrust_kN: 12000,
      isp_s: 6700,
      propellant: "uranium tetrabromide brine (20% enriched)",
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
    fields: { category: "drive", slot: "drive", mass_t: 40, thrust_kN: 330, isp_s: 900, propellant: "LH2", heat_out_MW: 30, cost: 120, crew: 2 },
  },
  {
    id: "chemical-drive",
    type: "module",
    title: "Chemical engine (methalox)",
    tags: ["drive", "chemical"],
    fields: { category: "drive", slot: "drive", mass_t: 8, thrust_kN: 2200, isp_s: 360, propellant: "CH4/LOX", heat_out_MW: 2, cost: 15 },
  },
  {
    id: "fission-reactor",
    type: "module",
    title: "Fission reactor, 50 MWe",
    tags: ["power", "nuclear"],
    fields: { category: "reactor", slot: "internal", mass_t: 60, power_out_MW: 50, heat_out_MW: 100, cost: 200, crew: 4 },
  },
  {
    id: "dhe3-fusion-reactor",
    type: "module",
    title: "D–He3 fusion reactor, 200 MWe",
    tags: ["power", "fusion"],
    fields: { category: "reactor", slot: "internal", mass_t: 180, power_out_MW: 200, heat_out_MW: 250, cost: 1200, crew: 8 },
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
    fields: { category: "point-defense", slot: "turret", mass_t: 6, power_in_MW: 3, heat_out_MW: 2.5, range_km: 300, rate_of_fire_rpm: 600, cost: 40 },
  },
  {
    id: "pd-flak",
    type: "module",
    title: "Point-defense flak cannon",
    tags: ["defense", "kinetic"],
    fields: { category: "point-defense", slot: "turret", mass_t: 9, power_in_MW: 0.5, heat_out_MW: 0.3, range_km: 40, rate_of_fire_rpm: 1200, magazine: 5000, cost: 12 },
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
    id: "hangar-bay",
    type: "module",
    title: "Hangar bay (4 strike craft)",
    fields: { category: "hangar", slot: "hangar", mass_t: 120, volume_m3: 6000, power_in_MW: 1, cost: 60, crew: 20 },
  },

  // ---- hull --------------------------------------------------------------
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
    fields: { kind: "ship", hull_class: "DD", role: "screen / escort", status: "concept", propellant_t: 3000 },
  },
  {
    id: "cruiser",
    type: "craft",
    title: "Cruiser",
    fields: { kind: "ship", hull_class: "CC", role: "independent operations / flag", status: "concept", propellant_t: 9000 },
  },
  {
    id: "frigate",
    type: "craft",
    title: "Frigate",
    fields: { kind: "ship", hull_class: "FF", role: "patrol / convoy escort", status: "concept", propellant_t: 1200 },
  },
  {
    id: "monitor",
    type: "craft",
    title: "Monitor",
    fields: { kind: "ship", hull_class: "BM", role: "orbital fire support / static defense", status: "concept", propellant_t: 400 },
  },
  {
    id: "carrier",
    type: "craft",
    title: "Carrier",
    fields: { kind: "ship", hull_class: "CV", role: "strike-craft carrier", status: "concept", propellant_t: 8000 },
  },
  {
    id: "station",
    type: "craft",
    title: "Station",
    fields: { kind: "station", hull_class: "ST", role: "orbital station", status: "concept", propellant_t: 0 },
  },
  {
    id: "strikecraft",
    type: "craft",
    title: "Strike craft",
    fields: { kind: "strikecraft", hull_class: "SC", role: "silocraft / interceptor", status: "concept", propellant_t: 40 },
  },
  {
    id: "missile",
    type: "craft",
    title: "Missile",
    fields: { kind: "missile", hull_class: "MSL", role: "anti-ship missile", status: "concept", propellant_t: 1.2 },
  },

  // ---- character ---------------------------------------------------------
  { id: "officer", type: "character", title: "Naval officer", fields: { role: "Commander", species: "human" } },
  { id: "executive", type: "character", title: "Company executive", fields: { role: "Director", species: "human" } },
];
