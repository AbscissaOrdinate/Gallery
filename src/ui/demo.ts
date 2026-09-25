/**
 * Demo vault for browser mode: the Heliaris system as sketched in
 * "Heliaris Solar System.png" — inner worlds with their stations, skyhooks,
 * Lagrange castles, cyclers on eccentric orbits, the main belt, Jupiter with
 * Trojan swarms, Saturn with rings — plus the ship-design sample records.
 * Names come from the drawing; numbers are Solar-System analogues.
 */
import { Repository } from "../core/repo";
import type { StorageAdapter } from "../core/storage/adapter";
import { serializeNoteOpml } from "../core/codec/opml";
import type { TypedRecord } from "../core/types";

const NL = String.fromCharCode(10);

export async function demoVault(fs: StorageAdapter): Promise<void> {
  const repo = new Repository(fs);
  await repo.init();
  await repo.load();
  const P = (type: string, id: string) => repo.registry.presetsFor(type).find((p) => p.id === id);
  const save = async (r: TypedRecord) => {
    await repo.save(r, { touch: false });
    return r;
  };
  const body = async (name: string, preset: string, fields: Record<string, unknown>, extra: Partial<TypedRecord> = {}) => {
    const b = repo.create("body", name, P("body", preset));
    Object.assign(b.fields, fields);
    Object.assign(b, extra);
    return save(b);
  };
  const loc = async (name: string, preset: string | undefined, fields: Record<string, unknown>, extra: Partial<TypedRecord> = {}) => {
    const l = repo.create("location", name, preset ? P("location", preset) : undefined);
    Object.assign(l.fields, fields);
    Object.assign(l, extra);
    return save(l);
  };

  // ---- polities -------------------------------------------------------------
  const uesc = repo.create("polity", "United Earth Space Company (UESC)", P("polity", "megacorp"));
  uesc.summary = "Chartered colonial trading company; Lord Proprietor, Governor-General, Court of Directors.";
  uesc.tags = ["earth", "company"];
  uesc.fields.color = "#c9663a";
  uesc.fields.affiliation = "friend";
  const ujcn = repo.create("polity", "United Jovian Confederacy", P("polity", "nation"));
  ujcn.summary = "Outer-system confederation; operates the UJCN.";
  ujcn.fields.color = "#4f8fd6";
  ujcn.fields.affiliation = "hostile";
  const ldf = repo.create("polity", "Lunar Defense Force", P("polity", "alliance"));
  ldf.fields.kind = "condominium";
  ldf.fields.government = "International Mandates of Luna — condominium";
  ldf.fields.color = "#6fbf95";
  ldf.fields.affiliation = "neutral";
  for (const p of [uesc, ujcn, ldf]) await save(p);
  // Who the boot screen names (display only). The demo keeps the default brief boot.
  await repo.saveConfig({ operator: { name: "DEMO OPERATOR / UESC-R1", clearance: "LEVEL 4", level: "top-secret", caveats: ["ORCON"], programme: "UESC" } });

  // ---- system & star --------------------------------------------------------
  const system = repo.create("system", "Heliaris system");
  system.fields.radius_mapping = "log";
  system.fields.inner_px = 80;
  system.fields.outer_px = 560;
  system.fields.moon_scale_px = 64;
  await save(system);
  const sun = await body("Heliaris", "star-g-dwarf", { system: system.id, age_gyr: 4.6 });
  system.fields.primary = sun.id;
  const S = { system: system.id, parent: sun.id };

  // ---- inner system ---------------------------------------------------------
  const mercury = await body("Mercury", "mercurylike", { ...S, sma_au: 0.387, map_angle_deg: 262, controller: uesc.id });
  await loc("Mercury Space Gun", "surface-city", { kind: "base", body: mercury.id, lat: 0, lon: 0, owner: uesc.id, industry: 6, garrison: 2, purpose: "Equatorial mass driver launching refined metals sunward and out." });
  await loc("Aesculanus", "station", { kind: "station", body: mercury.id, lagrange: "L4", lagrange_of: mercury.id, owner: uesc.id, industry: 2, purpose: "Solar-power relay and Mercury L4 waystation." });
  await loc("Argentinus", "station", { kind: "station", body: mercury.id, lagrange: "L5", lagrange_of: mercury.id, owner: uesc.id, industry: 2, purpose: "Mercury L5 depot; silver-trade counterpart of Aesculanus." });

  const venus = await body("Venus", "venuslike", { ...S, sma_au: 0.723, map_angle_deg: 5 });
  await loc("Aglaea Ecliptic", "station", { kind: "station", body: venus.id, orbit_km: 9000, map_angle_deg: 200, owner: uesc.id, industry: 4, population_k: 120, purpose: "Cloud-city logistics hub; ecliptic-plane transfer station." });

  const earth = await body("Earth", "earthlike", { ...S, sma_au: 1.0, map_angle_deg: 88, misc_life: "Macrobiotic", population_m: 9800, industry: 10 });
  const luna = await body("Luna", "lunalike", { system: system.id, parent: earth.id, sma_km: 384400, map_angle_deg: 80, controller: ldf.id });
  // Earth–Sun Lagrange stations: 'lagrange_of' names the secondary of the pair (Earth)
  const phoebe = await loc("Phoebe Solar Research", "station", { kind: "station", map_symbol: "telescope", body: earth.id, lagrange: "L1", lagrange_of: earth.id, owner: uesc.id, purpose: "Heliophysics observatory at Earth–Sun L1." });
  await loc("Asteria Deep Space Telescope", "station", { kind: "station", map_symbol: "telescope", body: earth.id, lagrange: "L2", lagrange_of: earth.id, owner: uesc.id, purpose: "Interferometer array at Earth–Sun L2, shaded from the Sun." });
  await loc("Pallas Fleetyard", "station", { kind: "shipyard", body: earth.id, lagrange: "L4", lagrange_of: earth.id, owner: uesc.id, industry: 7, garrison: 4, purpose: "Earth–Sun L4 fleetyard, leading Earth by 60°." });
  await loc("Styx Fleetyard", "station", { kind: "shipyard", body: earth.id, lagrange: "L5", lagrange_of: earth.id, owner: ujcn.id, industry: 6, garrison: 5, purpose: "Earth–Sun L5 fleetyard, trailing Earth by 60°." });
  await loc("Eos and Selene Space Elevators", "station", { kind: "elevator", body: earth.id, orbit_km: 35786, map_angle_deg: 300, owner: uesc.id, industry: 8, garrison: 3, purpose: "Twin equatorial elevators anchored to the orbital ring." });
  // Earth–Moon Lagrange castles: 'lagrange_of' names the secondary of the pair (Luna)
  const hyperion = await loc("Hyperion", "station", { kind: "base", body: earth.id, lagrange: "L4", lagrange_of: luna.id, owner: ldf.id, garrison: 6, purpose: "Earth–Moon L4 castle: fleet anchorage and lunar-mandate watch." });
  await loc("Theia", "station", { kind: "base", body: earth.id, lagrange: "L5", lagrange_of: luna.id, owner: ldf.id, garrison: 5, purpose: "Earth–Moon L5 castle; sister to Hyperion." });
  await loc("Shackleton", "surface-city", { kind: "city", body: luna.id, lat: -89.9, lon: 0, owner: ldf.id, industry: 5, population_k: 850, purpose: "Polar ice mining; the first lunar ice rush." });

  const mars = await body("Mars", "marslike", { ...S, sma_au: 1.524, map_angle_deg: 180 });
  await loc("Port Kirin Superskyhook", "skyhook", { body: mars.id, orbit_km: 5800, map_angle_deg: 100, owner: uesc.id, industry: 5, population_k: 400, purpose: "Rotating tether; surface-to-orbit for Tharsis." });
  await loc("Port Tarlessos Superskyhook", "skyhook", { body: mars.id, orbit_km: 6200, map_angle_deg: 280, owner: uesc.id, industry: 4, population_k: 300, purpose: "Second skyhook, Hellas side." });
  const ares = await loc("Ares Depot", "station", { kind: "depot", body: mars.id, orbit_km: 17000, map_angle_deg: 20, owner: uesc.id, industry: 3, garrison: 2, purpose: "Propellant depot and cycler transfer node above Mars." });
  await loc("Nerio Castle", "station", { kind: "base", body: mars.id, lagrange: "L5", lagrange_of: mars.id, owner: ujcn.id, garrison: 7, purpose: "Mars–Sun L5 castle — Jovian forward anchorage." });
  await loc("Harmonia Ecliptic", undefined, { kind: "station", map_symbol: "beacon", sma_au: 1.27, eccentricity: 0.22, periapsis_deg: 200, map_angle_deg: 165, owner: uesc.id, purpose: "Earth–Mars cycler habitat on a 1.27 AU × e0.22 orbit." });
  await loc("Bellona Castle", undefined, { kind: "base", sma_au: 1.35, eccentricity: 0.3, periapsis_deg: 60, map_angle_deg: 130, owner: ujcn.id, purpose: "Armed cycler-fortress; crosses both Earth and Mars orbits." });

  // ---- belt & the middle system ------------------------------------------------
  await body("Main belt", "main-belt", { ...S, belt_inner_au: 2.1, belt_outer_au: 3.3 });
  await body("Eros", "asteroid-rubble", { ...S, sma_au: 1.458, eccentricity: 0.223, periapsis_deg: 120, map_angle_deg: 128, mass_earth: 1.1e-9 });
  await loc("Zeus", undefined, { kind: "station", map_symbol: "beacon", sma_au: 2.4, eccentricity: 0.55, periapsis_deg: 270, map_angle_deg: 275, owner: ujcn.id, purpose: "Long-period cycler between the belt and Jupiter." });
  await loc("Antares", undefined, { kind: "station", map_symbol: "beacon", sma_au: 2.2, eccentricity: 0.4, periapsis_deg: 230, map_angle_deg: 215, owner: uesc.id, purpose: "Sunward cycler; red-flagged salvage station." });

  // ---- outer system -----------------------------------------------------------
  const jupiter = await body("Jupiter", "jupiterlike", { ...S, sma_au: 5.2, map_angle_deg: 270, controller: ujcn.id });
  await body("Io", "iolike", { system: system.id, parent: jupiter.id, sma_km: 421700, map_angle_deg: 10, controller: ujcn.id });
  const europa = await body("Europa", "europalike", { system: system.id, parent: jupiter.id, sma_km: 671000, map_angle_deg: 120, controller: ujcn.id });
  const ganymede = await body("Ganymede", "ganymedelike", { system: system.id, parent: jupiter.id, sma_km: 1070000, map_angle_deg: 230, controller: ujcn.id });
  await loc("Galileo Station", "station", { kind: "station", body: ganymede.id, orbit_km: 4000, map_angle_deg: 30, owner: ujcn.id, industry: 7, garrison: 6, population_k: 2200, purpose: "Confederacy capital station over Ganymede." });
  await loc("Europa Deep", "surface-city", { kind: "city", body: europa.id, lat: 10, lon: -40, owner: ujcn.id, industry: 3, population_k: 300, purpose: "Sub-ice research and aquaculture." });
  await body("Callisto", "ganymedelike", { system: system.id, parent: jupiter.id, sma_km: 1883000, map_angle_deg: 320, mass_earth: 0.018, density_gcc: 1.83, glyph_color: "#6f665b" });
  const saturn = await body("Saturn", "saturnlike", { ...S, sma_au: 9.58, map_angle_deg: 0 });
  await body("Titan", "titanlike", { system: system.id, parent: saturn.id, sma_km: 1221870, map_angle_deg: 60 });
  await body("Rhea", "enceladuslike", { system: system.id, parent: saturn.id, sma_km: 527000, map_angle_deg: 200, mass_earth: 0.00039, density_gcc: 1.24, volatiles: "Ymirian", glyph_color: "#d8d2c8" });
  await body("Uranus", "uranuslike", { ...S, sma_au: 19.2, map_angle_deg: 140 });
  await body("Neptune", "neptunelike", { ...S, sma_au: 30.1, map_angle_deg: 320 });
  await body("Outer belt", "kuiper-belt", { ...S, belt_inner_au: 39.4, belt_outer_au: 47.7 });

  // ---- annotations: Earth's orbital ring, Venus transit network, Jupiter Trojan swarms
  system.fields.annotations = [
    { kind: "ring", label: "Orbital Ring & Exonesia", around: earth.id, radius_km: 6800, width_px: 3, color: "#8b7355" },
    { kind: "ring", label: "Amor, Xenia & Urania transit network", around: venus.id, radius_km: 30000, width_px: 1.5, color: "#c9663a" },
    { kind: "arc", label: "Greek camp (L4)", around: sun.id, radius_au: 5.2, start_deg: 300, end_deg: 355, width_px: 10, color: "#6b5a44" },
    { kind: "arc", label: "Trojan camp (L5)", around: sun.id, radius_au: 5.2, start_deg: 185, end_deg: 240, width_px: 10, color: "#6b5a44" },
  ];
  system.summary = "Hard-SF home system: chartered company inner worlds, Jovian confederacy outward, cyclers between.";
  system.tags = ["heliaris"];
  await save(system);

  // ---- ships ----------------------------------------------------------------
  const nswr = repo.create("module", "NSWR Mk3 torch", P("module", "nswr-drive"));
  const reactor = repo.create("module", "Fission reactor 50 MWe", P("module", "fission-reactor"));
  const droplet = repo.create("module", "Droplet radiator 50 MW", P("module", "droplet-radiator"));
  const railgun = repo.create("module", "Cruciform spinal railgun", P("module", "spinal-railgun"));
  const pd = repo.create("module", "Pulse-laser PDC", P("module", "pd-laser"));
  const pods = repo.create("module", "Side missile pod", P("module", "missile-pod"));
  const tank = repo.create("module", "Brine tank 500 t", P("module", "propellant-tank"));
  const sensors = repo.create("module", "Sensor suite", P("module", "sensor-suite"));
  const hab = repo.create("module", "Crew habitat", P("module", "habitat-ring"));
  for (const m of [nswr, reactor, droplet, railgun, pd, pods, tank, sensors, hab]) {
    m.fields.maker = uesc.id;
    await save(m);
  }
  // The yard standard and the house style, so the hull editor's conformance
  // panel has something real to check against.
  const bus = repo.create("bus", "UJCN Mk2 bus", P("bus", "ujcn-mk2-bus"));
  await save(bus);
  const style = repo.create("style", "UJCN style kit", P("style", "ujcn-style"));
  await save(style);

  // A hull authored to the v2 contract, so the editor has a real ship to open
  // and the fleet strip has something to sit beside. Deliberately not the hull
  // the Sword craft uses: that one stays on the v1 preset so the migration
  // regression gate keeps testing the migrator.
  const pattern = repo.create("hull", "Halberd hull (DD, UJCN pattern)", P("hull", "ujcn-destroyer-hull"));
  pattern.fields.bus = bus.id;
  pattern.fields.style = style.id;
  pattern.summary = "The UJCN yard pattern destroyer hull: armoured nose, magazine amidships, ventral radiators.";
  pattern.tags = ["ujcn", "destroyer"];
  await save(pattern);

  // ---- three loadouts on one hull -----------------------------------------
  // The acceptance criterion for editor 2 (`gallery/07` §3): one hull, three
  // fits, three visibly different silhouettes. They share a bus, a style kit
  // and every slot; what differs is what is bolted into them.
  // A slice of the working vault's `_tables/propellants.yaml`, rows and header
  // verbatim, so the demo exercises the whole chain: tank volume → density →
  // mass → Δv, and the provisional marker that rides along with it. Every row
  // in that file is unverified and says so; nothing here is a new figure.
  await fs.writeText(
    "_tables/propellants.yaml",
    [
      "# Propellants — tank sizing and drive compatibility.",
      "#",
      "# WARNING: every density below is a recalled standard value, NOT taken from a cited source.",
      "# Per section 0 of the spec they are all marked provisional and must render with the",
      "# provisional marker until verified against the NIST Chemistry WebBook or an equivalent.",
      "meta:",
      '  status: "UNVERIFIED — verify every row before trusting a Delta-v number that depends on tank volume."',
      '  verify_against: "NIST Chemistry WebBook (https://webbook.nist.gov/chemistry/)"',
      "rows:",
      '  - { id: hydrogen-liquid, name: "Liquid hydrogen", density_kg_m3: 70.8, storage: "cryogenic, ~20 K", boiloff: high, provisional: true }',
      '  - { id: methane-liquid,  name: "Liquid methane",  density_kg_m3: 422,  storage: "cryogenic, ~111 K", boiloff: moderate, provisional: true }',
      '  - { id: water,           name: "Water",           density_kg_m3: 1000, storage: "ambient", boiloff: none, provisional: true }',
      '  - { id: lox,             name: "Liquid oxygen",   density_kg_m3: 1141, storage: "cryogenic, ~90 K", boiloff: moderate, provisional: true }',
      '  - { id: fissiles,        name: "Fissile fuel",    density_kg_m3: 18000, storage: "solid, shielded", boiloff: none, provisional: true }',
      "",
    ].join(NL),
  );

  // The calibres the Halberds load, plus the three round-mass anchors ruled
  // 2026-09-20. Without these a magazine is a list of counts that weighs
  // nothing, which was the largest hole left in the mass budget.
  await fs.writeText(
    "_tables/munitions.yaml",
    [
      "# Gun munitions — a slice of the working vault's table.",
      "meta:",
      '  source: "NEBULOUS: Fleet Command Official Wiki, Munitions & Missiles (retrieved 2026-09-14)"',
      "  round_scale:",
      "    note: >",
      "      RULED 2026-09-20. Mass and volume per round are interpolated from these three",
      "      anchors along straight lines in log-log space. The implied stowage density",
      "      climbs from 100 to 1644 kg/m3 and then falls to 1486 for a thin-walled siege",
      "      round, which is why one scaling law will not cover the range.",
      "    anchors:",
      "      - { calibre_mm: 20,  mass_kg: 0.25, volume_m3: 0.0025 }",
      "      - { calibre_mm: 120, mass_kg: 22,   volume_m3: 0.05 }",
      "      - { calibre_mm: 450, mass_kg: 1315, volume_m3: 0.8 }",
      "      - { calibre_mm: 600, mass_kg: 2170, volume_m3: 1.46 }",
      "ballistic:",
      '  - { id: 120mm-he,  name: "120mm HE Shell",  calibre_mm: 120, type: "ballistic/chemical", role: offensive }',
      '  - { id: 250mm-he,  name: "250mm HE Shell",  calibre_mm: 250, type: "ballistic/chemical", role: offensive }',
      '  - { id: 450mm-ap,  name: "450mm AP Shell",  calibre_mm: 450, type: "ballistic/chemical", role: offensive }',
      '  - { id: 450mm-he,  name: "450mm HE Shell",  calibre_mm: 450, type: "ballistic/chemical", role: offensive }',
      "point_defense:",
      '  - { id: 20mm-slug, name: "20mm Slug",       calibre_mm: 20,  type: "ballistic/chemical" }',
      "",
    ].join(NL),
  );

  const mk66 = repo.create("module", "Mk66 450 mm twin", P("module", "mk66-twin"));
  const mk81 = repo.create("module", "Mk81 300 mm single", P("module", "mk81-single"));
  const vls = repo.create("module", "Mk41 32-cell VLS", P("module", "vls-32"));
  const beam = repo.create("module", "Type 7 beam turret", P("module", "beam-turret"));
  const radar = repo.create("module", "SR-12 search radar", P("module", "search-radar"));
  const hotLoop = repo.create("module", "Hot-loop radiator", P("module", "hot-loop-radiator"));
  const coldLoop = repo.create("module", "Cold-loop radiator", P("module", "cold-loop-radiator"));
  const flak = repo.create("module", "PD flak mount", P("module", "pd-flak"));
  const berthing = repo.create("module", "Berthing and messing", P("module", "berthing"));
  const rcs = repo.create("module", "RCS quad", P("module", "rcs-cluster"));
  for (const m of [mk66, mk81, vls, beam, radar, hotLoop, coldLoop, flak, berthing, rcs]) {
    m.fields.maker = uesc.id;
    await save(m);
  }

  /** Everything the three fits share: plant, cooling, sensors, tankage, crew. */
  const halberdCommon = () => ({
    hull: pattern.id,
    operator: ujcn.id,
    builder: uesc.id,
    watch_sections: 3,
    watches_manned: 2,
    endurance_days: 90,
    fittings: [
      { slot: "radar", module: radar.id },
      { slot: "comms", module: radar.id },
      { slot: "eo", module: sensors.id },
      { slot: "pd-p", module: flak.id },
      // Two loops, because life support and a reactor do not share an array
      // (docs/UNITS.md §5).
      { slot: "rad-1", module: hotLoop.id },
      { slot: "rad-2", module: coldLoop.id },
      { slot: "drive", module: nswr.id },
      // Fore and aft, dorsal and ventral: four clusters that can make a couple
      // in pitch rather than just shoving the bow around.
      { slot: "rcs-fwd-d", module: rcs.id },
      { slot: "rcs-fwd-v", module: rcs.id },
      { slot: "rcs-aft-d", module: rcs.id },
      { slot: "rcs-aft-v", module: rcs.id },
    ],
    manifest: [
      // One plant, not two: the hull has a single high-temperature radiator
      // slot, and 100 MW of reactor is what 120 MW of hot loop can cool.
      { id: "reactor-1", section: "engineering", module: reactor.id, count: 1 },
      { id: "hab", section: "forward", module: berthing.id, count: 1 },
    ],
    tanks: [
      { id: "main", section: "engineering", module: tank.id, propellant: "water", volume_m3: 500, jettison_order: 0 },
      // The attitude thrusters burn their own propellant, so the ship carries a
      // little of it separately — which is what stops the drive-versus-tank
      // check from being a formality.
      { id: "rcs-tank", section: "engineering", module: tank.id, propellant: "methane-liquid", volume_m3: 40, jettison_order: 0 },
      // A drop tank on the ventral hardpoint: external, so it spends no
      // internal volume, and it takes its own dry mass with it when it goes.
      // A collar of four rather than one barrel bolted to the spine: spaced
      // about the axis it balances itself, so no ballast is needed against it.
      { id: "drop", slot: "tank", module: tank.id, propellant: "water", count: 4, volume_m3: 500, jettison_order: 1 },
    ],
    modes: [
      { id: "cruise", name: "Cruise", duties: [{ component: "gun-a", duty: "off" }, { component: "gun-b", duty: "off" }, { component: "cells", duty: "off" }, { component: "pd-p", duty: "standby" }] },
      { id: "combat", name: "Combat", duties: [] },
      // EMCON silences what radiates and keeps what cruise already shut down.
      {
        id: "emcon",
        name: "EMCON (silent)",
        duties: [
          { component: "radar", duty: "off" },
          { component: "comms", duty: "off" },
          { component: "gun-a", duty: "off" },
          { component: "gun-b", duty: "off" },
          { component: "cells", duty: "off" },
          { component: "pd-p", duty: "standby" },
        ],
      },
    ],
  });

  const halberdGun = repo.create("craft", "Halberd-class (DD)", P("craft", "destroyer"));
  Object.assign(halberdGun.fields, halberdCommon(), {
    hull_class: "DD",
    role: "gun destroyer",
    status: "in service",
    fittings: [
      ...halberdCommon().fittings,
      { slot: "gun-a", module: mk66.id, magazine: [{ munition: "450mm-ap", rounds: 140 }, { munition: "450mm-he", rounds: 100 }] },
      { slot: "gun-b", module: mk66.id, magazine: [{ munition: "450mm-ap", rounds: 140 }, { munition: "450mm-he", rounds: 100 }] },
      { slot: "gun-y", module: mk81.id, magazine: [{ munition: "250mm-he", rounds: 180 }] },
    ],
  });
  halberdGun.summary = "The baseline fit: two 450 mm twins forward, a 300 mm single aft.";
  halberdGun.tags = ["ujcn", "destroyer", "halberd"];
  await save(halberdGun);

  const halberdMissile = repo.create("craft", "Halberd-class (DDG)", P("craft", "destroyer"));
  Object.assign(halberdMissile.fields, halberdCommon(), {
    hull_class: "DDG",
    role: "guided-missile destroyer",
    status: "in service",
    fittings: [
      ...halberdCommon().fittings,
      { slot: "gun-a", module: mk81.id, magazine: [{ munition: "250mm-he", rounds: 180 }] },
      { slot: "cells", module: vls.id, magazine: [{ munition: "450mm-ap", rounds: 32 }] },
    ],
  });
  halberdMissile.summary = "The magazine fit: one gun forward, thirty-two cells amidships.";
  halberdMissile.tags = ["ujcn", "destroyer", "halberd"];
  await save(halberdMissile);

  const halberdBeam = repo.create("craft", "Halberd-class (DDL)", P("craft", "destroyer"));
  Object.assign(halberdBeam.fields, halberdCommon(), {
    hull_class: "DDL",
    role: "beam-armed escort",
    status: "prototype",
    fittings: [
      ...halberdCommon().fittings,
      { slot: "gun-a", module: beam.id },
      { slot: "cells", module: beam.id },
    ],
  });
  halberdBeam.summary = "The experimental fit: two beam turrets on a hull sized for guns. It cruises, and in combat it runs out of both power and radiator — which is what the prototype exists to find out.";
  halberdBeam.tags = ["ujcn", "destroyer", "halberd", "experimental"];
  await save(halberdBeam);

  const hull = repo.create("hull", "Sword hull (DD)", P("hull", "destroyer-hull"));
  hull.fields.armor = "Whipple bumper + spaced ceramic belt over the spine";
  hull.fields.bus = bus.id;
  hull.fields.style = style.id;
  hull.assets = [{ role: "portrait", path: "assets/sword-hull.svg" }];
  await repo.putTextAsset(
    "sword-hull.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120"><polygon points="10,60 60,30 300,30 390,60 300,90 60,90" fill="none" stroke="currentColor" stroke-width="2"/><rect x="80" y="10" width="200" height="8" fill="currentColor" opacity=".5"/><rect x="80" y="102" width="200" height="8" fill="currentColor" opacity=".5"/><circle cx="330" cy="60" r="10" fill="none" stroke="currentColor"/></svg>`,
  );
  await save(hull);
  const sword = repo.create("craft", "Sword-of-State-class", P("craft", "destroyer"));
  sword.summary = "Railgun destroyer: four cruciform spinal railguns, NSWR drive, radiators along the four spines.";
  sword.tags = ["destroyer", "railgun", "ujcn"];
  Object.assign(sword.fields, {
    hull_class: "DDL",
    role: "railgun destroyer",
    hull: hull.id,
    operator: ujcn.id,
    builder: uesc.id,
    status: "in service",
    propellant_t: 3000,
    naming_theme: "Swords of state and regalia; capitals",
    units: ["Sovereign", "Joyeuse", "Curtana", "Belfast", "Edinburgh", "London", "Stockholm", "Vienna", "Columbia", "Mysore", "Shangfang", "Mercy", "Justice", "Victory", "Valor", "Honor"],
    loadout: [
      { module: nswr.id, count: 1, slot: "drive" },
      { module: reactor.id, count: 2, slot: "internal" },
      { module: droplet.id, count: 4, slot: "radiator" },
      { module: railgun.id, count: 1, slot: "spinal" },
      { module: pd.id, count: 4, slot: "turret" },
      { module: pods.id, count: 2, slot: "external" },
      { module: tank.id, count: 4, slot: "external" },
      { module: sensors.id, count: 1, slot: "external" },
      { module: hab.id, count: 1, slot: "internal" },
    ],
  });
  sword.assets = [{ role: "portrait", path: "assets/sword-hull.svg" }];
  sword.links = [{ rel: "based-at", to: hyperion.id }, { rel: "based-at", to: ares.id }];
  await save(sword);
  const justice = repo.create("craft", "Sword-of-Justice-class leader", P("craft", "destroyer"));
  Object.assign(justice.fields, { hull_class: "DL", role: "destroyer leader / hunter-killer", hull: hull.id, operator: ujcn.id, parent: sword.id, status: "prototype", propellant_t: 3600, loadout: structuredClone(sword.fields.loadout) });
  justice.summary = "Expanded NSWR and hull, added torpedo tubes, attachable outriders, laser PDCs.";
  await save(justice);

  // ---- a note -----------------------------------------------------------------
  const note = repo.createNote("Fleets and Strikecraft › Early USSF");
  note.tags = ["dynalist", "ussf"];
  note.summary = "The Lunar War. Eventually hull classification flips: chemical (-H) specified, nuclear assumed.";
  note.links = [{ rel: "about", to: sword.id }, { rel: "mentions", to: phoebe.id }];
  note.outline = [
    { text: "DR - Drone", children: [] },
    {
      text: "SC - Silocraft",
      note: "Rapid Response Ground to Space Asset",
      children: [
        { text: "SCN - Nuclear Powered", children: [] },
        { text: "SCI - Interceptor", children: [{ text: "SCIN - Nuclear Powered Interceptor", children: [] }] },
      ],
      attrs: { collapsed: "true" },
    },
    { text: "AT - Tug", note: "Redeployment vessel for smaller craft with limited delta-v", children: [{ text: "ATN - Nuclear Tug", children: [] }] },
    { text: "DD - Destroyer #UJCN", children: [{ text: "DDL - Laser Destroyer", children: [] }, { text: "DDG - Guided Missile Destroyer", children: [] }] },
  ];
  await fs.writeText(repo.pathFor(note), serializeNoteOpml(note));
  await repo.load();
  await repo.writeCsv();
}
