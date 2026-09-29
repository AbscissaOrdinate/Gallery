# Starter system recipe — Sol. Recipe format: doc 12 §4.1. Draft data for S5b.
# `$key` = reference to another record in this recipe, resolved to its new id at install.
# `src` = default source id for every figure in the record; `fsrc` = per-field override;
# `prov` = provisional fields with a one-line rationale; `gate` = option that must be on.
# Figures inherited from a preset and not overridden here keep the preset's standing
# (badge P); presets' Solar-System-analogue values are NOT re-sourced by this recipe.

recipe: 1
id: starter-sol
kind: record-set
title: "Sol (starter)"
summary: "The Solar System with its real co-orbital zoo and a light, generic layer of infrastructure: ecliptic station, Earth–Sun L4/L5 fleetyards, an L1 halo station, one orbital ring and an Aldrin cycler. Generic starter, not canon."
options:
  candidates:  { default: true, label: "Include candidate and disputed bodies" }
  speculative: { default: true, label: "Include speculative / artificial showcase records" }
showcases: [tadpole, horseshoe-exchange, trojan-moons, quasi-satellite, barycentric-pair, resonance-chain, cycler, lagrange-fleetyards, ecliptic-station, orbital-ring]

records:
  - { key: sys, type: system, name: "Sol", status: confirmed, fields: { primary: $sun, radius_mapping: log, show_lagrange: true, show_zones: true } }

  # ---- star ------------------------------------------------------------------------------
  - key: sun
    type: body
    name: "Sun"
    preset: star-g-dwarf
    status: confirmed
    src: definition
    fields: { kind: star, system: $sys, stage: ms, mass_sol: 1, luminosity_sol: 1, radius_sol: 1, age_gyr: 4.5682, spectral_type: "G2V" }
    fsrc: { age_gyr: bouvier2010 }

  # ---- planets (NASA fact sheet; sma = distance 10^6 km / 149.598) ---------------------------
  - { key: mercury, type: body, name: "Mercury", preset: mercurylike, status: confirmed, src: nasa-fact, fields: { system: $sys, parent: $sun, mass_earth: 0.05528, sma_au: 0.3870, eccentricity: 0.206, inclination_deg: 7.0, rotation_h: 1407.6, axial_tilt_deg: 0.034 } }
  - { key: venus,   type: body, name: "Venus",   preset: venuslike,   status: confirmed, src: nasa-fact, fields: { system: $sys, parent: $sun, mass_earth: 0.8157, sma_au: 0.7233, eccentricity: 0.007, inclination_deg: 3.4, rotation_h: -5832.5, axial_tilt_deg: 177.4 } }
  - { key: earth,   type: body, name: "Earth",   preset: earthlike,   status: confirmed, src: nasa-fact, fields: { system: $sys, parent: $sun, mass_earth: 1, sma_au: 1.0, eccentricity: 0.017, inclination_deg: 0.0, rotation_h: 23.9, axial_tilt_deg: 23.4 }, fsrc: { mass_earth: definition, sma_au: definition } }
  - { key: mars,    type: body, name: "Mars",    preset: marslike,    status: confirmed, src: nasa-fact, fields: { system: $sys, parent: $sun, mass_earth: 0.1075, sma_au: 1.5241, eccentricity: 0.094, inclination_deg: 1.8, rotation_h: 24.6, axial_tilt_deg: 25.2 } }
  - { key: jupiter, type: body, name: "Jupiter", preset: jupiterlike, status: confirmed, src: nasa-fact, fields: { system: $sys, parent: $sun, mass_earth: 317.9, density_gcc: 1.326, sma_au: 5.2040, eccentricity: 0.049, inclination_deg: 1.3, rotation_h: 9.9, axial_tilt_deg: 3.1 } }
  - { key: saturn,  type: body, name: "Saturn",  preset: saturnlike,  status: confirmed, src: nasa-fact, fields: { system: $sys, parent: $sun, mass_earth: 95.14, density_gcc: 0.687, sma_au: 9.5723, eccentricity: 0.052, inclination_deg: 2.5, rotation_h: 10.7, axial_tilt_deg: 26.7 } }
  - { key: uranus,  type: body, name: "Uranus",  preset: uranuslike,  status: confirmed, src: nasa-fact, fields: { system: $sys, parent: $sun, mass_earth: 14.54, density_gcc: 1.270, sma_au: 19.1647, eccentricity: 0.047, inclination_deg: 0.8, rotation_h: -17.2, axial_tilt_deg: 97.8 } }
  - { key: neptune, type: body, name: "Neptune", preset: neptunelike, status: confirmed, src: nasa-fact, fields: { system: $sys, parent: $sun, mass_earth: 17.09, density_gcc: 1.638, sma_au: 30.1809, eccentricity: 0.010, inclination_deg: 1.8, rotation_h: 16.1, axial_tilt_deg: 28.3 } }

  # ---- Pluto–Charon: barycentric pair (the "double planet" showcase, real) --------------------
  - key: pc-bary
    type: body
    name: "Pluto–Charon barycentre"
    preset: barycenter
    status: confirmed
    src: nasa-fact
    fields: { kind: barycenter, system: $sys, parent: $sun, mass_sol: 7.335e-9, luminosity_sol: 0, sma_au: 39.4818, eccentricity: 0.244, inclination_deg: 17.2 }
    fsrc: { mass_sol: derived }
    derive_note: "mass_sol = (0.0130e24 kg + 1.5897e21 kg) / 1.989e30 kg"
  - { key: pluto,  type: body, name: "Pluto",  preset: plutolike, status: confirmed, src: charon, fields: { system: $sys, parent: $pc-bary, sma_au: null, sma_km: 2415, eccentricity: 0, mass_earth: 0.002178, rotation_h: -153.3, axial_tilt_deg: 119.5 }, fsrc: { mass_earth: nasa-fact, rotation_h: nasa-fact, axial_tilt_deg: nasa-fact, sma_km: derived }, derive_note: "sma_km = 19,595.764 − 17,181.0 (Pluto's barycentric a); exceeds Pluto's radius 1,188 km" }
  - { key: charon, type: body, name: "Charon", preset: plutolike, status: confirmed, src: jpl-phys, fields: { kind: moon, system: $sys, parent: $pc-bary, sma_au: null, sma_km: 17181.0, eccentricity: 0, mass_earth: 0.0002662, radius_km: 606.0, density_gcc: 1.853, tidally_locked: true, misc_multiworld: Dioscuran, pressure_atm: null, atmosphere: null }, fsrc: { sma_km: charon }, prov: { classification: "Pluto-like preset reused for surface/EWoCS fields; Charon has no N2 atmosphere — atmosphere cleared, rest unreviewed" } }

  # ---- belts: edges derived from resonances ---------------------------------------------------
  - { key: main-belt,   type: body, name: "Main belt",   preset: main-belt,   status: confirmed, src: derived, fields: { system: $sys, parent: $sun, belt_inner_au: 2.065, belt_outer_au: 3.278 }, derive_note: "Jupiter 4:1 and 2:1 Kirkwood gaps: 5.204·(1/4)^(2/3), 5.204·(1/2)^(2/3)" }
  - { key: kuiper-belt, type: body, name: "Kuiper belt (classical)", preset: kuiper-belt, status: confirmed, src: derived, fields: { system: $sys, parent: $sun, belt_inner_au: 39.55, belt_outer_au: 47.91 }, derive_note: "Neptune 3:2 and 2:1 MMR: 30.18·(3/2)^(2/3), 30.18·2^(2/3) (Worldsmith debrisDisk)" }

  # ---- moons (JPL mean elements; mass_earth = GM / 398,600.435) --------------------------------
  - { key: luna,     type: body, name: "Moon",     preset: lunalike,     status: confirmed, src: jpl-elem, fields: { system: $sys, parent: $earth,   sma_km: 384400,  eccentricity: 0.0554, inclination_deg: 5.16, mass_earth: 0.0123 },  fsrc: { mass_earth: jpl-phys } }
  - { key: io,       type: body, name: "Io",       preset: iolike,       status: confirmed, src: jpl-elem, fields: { system: $sys, parent: $jupiter, sma_km: 421800,  eccentricity: 0.004, mass_earth: 0.01495, density_gcc: 3.5276 },  fsrc: { mass_earth: jpl-phys, density_gcc: jpl-phys } }
  - { key: europa,   type: body, name: "Europa",   preset: europalike,   status: confirmed, src: jpl-elem, fields: { system: $sys, parent: $jupiter, sma_km: 671100,  eccentricity: 0.009, mass_earth: 0.008035, density_gcc: 3.0130 }, fsrc: { mass_earth: jpl-phys, density_gcc: jpl-phys } }
  - { key: ganymede, type: body, name: "Ganymede", preset: ganymedelike, status: confirmed, src: jpl-elem, fields: { system: $sys, parent: $jupiter, sma_km: 1070400, eccentricity: 0.001, mass_earth: 0.02481, density_gcc: 1.9416 },  fsrc: { mass_earth: jpl-phys, density_gcc: jpl-phys } }
  - { key: callisto, type: body, name: "Callisto", preset: ganymedelike, status: confirmed, src: jpl-elem, fields: { system: $sys, parent: $jupiter, sma_km: 1882700, eccentricity: 0.007, mass_earth: 0.01801, density_gcc: 1.8340 },  fsrc: { mass_earth: jpl-phys, density_gcc: jpl-phys } }
  - { key: titan,    type: body, name: "Titan",    preset: titanlike,    status: confirmed, src: jpl-elem, fields: { system: $sys, parent: $saturn,  sma_km: 1221900, eccentricity: 0.029, mass_earth: 0.02252, density_gcc: 1.8814 },  fsrc: { mass_earth: jpl-phys, density_gcc: jpl-phys } }
  - { key: tethys,   type: body, name: "Tethys",   preset: enceladuslike, status: confirmed, src: jpl-elem, fields: { system: $sys, parent: $saturn, sma_km: 295000,  eccentricity: 0.001, mass_earth: 0.0001034, density_gcc: 0.9840 }, fsrc: { mass_earth: jpl-phys, density_gcc: jpl-phys } }
  - { key: telesto,  type: body, name: "Telesto",  preset: trojan,       status: confirmed, src: jpl-elem, fields: { kind: moon, system: $sys, parent: $saturn, lagrange: L4, lagrange_of: $tethys, sma_km: 295000, mass_earth: null }, fsrc: { lagrange: coorbital }, prov: { mass_earth: "not in JPL table; left unset rather than the trojan preset's 1e-9" } }
  - { key: calypso,  type: body, name: "Calypso",  preset: trojan,       status: confirmed, src: jpl-elem, fields: { kind: moon, system: $sys, parent: $saturn, lagrange: L5, lagrange_of: $tethys, sma_km: 295000, mass_earth: null }, fsrc: { lagrange: coorbital }, prov: { mass_earth: "not in JPL table; left unset" } }
  - { key: janus,      type: body, name: "Janus",      preset: asteroid-rubble, status: confirmed, src: jpl-elem, fields: { kind: moon, system: $sys, parent: $saturn, sma_au: null, sma_km: 151500, eccentricity: 0.007, mass_earth: 3.177e-7, density_gcc: 0.6381, radius_km: 89.2 },  fsrc: { mass_earth: jpl-phys, density_gcc: jpl-phys, radius_km: jpl-phys } }
  - { key: epimetheus, type: body, name: "Epimetheus", preset: asteroid-rubble, status: confirmed, src: jpl-elem, fields: { kind: moon, system: $sys, parent: $saturn, sma_au: null, sma_km: 151400, eccentricity: 0.020, mass_earth: 8.816e-8, density_gcc: 0.6375, radius_km: 58.2 }, fsrc: { mass_earth: jpl-phys, density_gcc: jpl-phys, radius_km: jpl-phys } }

  # ---- small bodies ----------------------------------------------------------------------------
  - { key: tk7,  type: body, name: "2010 TK7", preset: trojan, status: confirmed, src: tk7, fields: { system: $sys, parent: $sun, lagrange: L4, lagrange_of: $earth, eccentricity: 0.191, inclination_deg: 21, mass_earth: null, radius_km: 0.15 }, prov: { radius_km: "'about 300 m' diameter halved", mass_earth: "unmeasured; left unset" } }
  - { key: kamo, type: body, name: "Kamoʻoalewa", preset: asteroid-rubble, status: confirmed, src: kamooalewa, fields: { system: $sys, parent: $sun, sma_au: 1.00094, eccentricity: 0.10269, inclination_deg: 7.79605, mass_earth: null }, prov: { mass_earth: "unmeasured; left unset" } }
  - { key: greeks,  type: body, name: "Jupiter trojans — Greek camp (L4)",  preset: trojan, status: confirmed, src: coorbital, fields: { system: $sys, parent: $sun, lagrange: L4, lagrange_of: $jupiter, mass_earth: null, glyph: belt } }
  - { key: trojans, type: body, name: "Jupiter trojans — Trojan camp (L5)", preset: trojan, status: confirmed, src: coorbital, fields: { system: $sys, parent: $sun, lagrange: L5, lagrange_of: $jupiter, mass_earth: null, glyph: belt } }

  # ---- configurations -------------------------------------------------------------------------
  - { key: cfg-pc,       type: configuration, name: "Pluto–Charon pair",           status: confirmed, src: charon,     fields: { kind: barycentric-pair, system: $sys, center: $pc-bary, members: [$pluto, $charon], params: { separation_km: 19595.764, eccentricity: 0 } } }
  - { key: cfg-janepi,   type: configuration, name: "Janus–Epimetheus exchange",   status: confirmed, src: janus,      fields: { kind: horseshoe, system: $sys, host: $janus, members: [$epimetheus], params: { delta_a_km: 50, swap_period_yr: 4, exchange: true } } }
  - { key: cfg-telesto,  type: configuration, name: "Tethys L4 (Telesto)",         status: confirmed, src: coorbital,  fields: { kind: tadpole, system: $sys, host: $tethys, members: [$telesto], params: { point: L4 } } }
  - { key: cfg-calypso,  type: configuration, name: "Tethys L5 (Calypso)",         status: confirmed, src: coorbital,  fields: { kind: tadpole, system: $sys, host: $tethys, members: [$calypso], params: { point: L5 } } }
  - { key: cfg-greeks,   type: configuration, name: "Jupiter L4 swarm",            status: confirmed, src: coorbital,  fields: { kind: tadpole, system: $sys, host: $jupiter, members: [$greeks], params: { point: L4, libration_deg: 25 } }, prov: { libration_deg: "drawing half-width, matches the Heliaris demo arcs; not a measured libration" } }
  - { key: cfg-trojans,  type: configuration, name: "Jupiter L5 swarm",            status: confirmed, src: coorbital,  fields: { kind: tadpole, system: $sys, host: $jupiter, members: [$trojans], params: { point: L5, libration_deg: 25 } }, prov: { libration_deg: "drawing half-width" } }
  - { key: cfg-tk7,      type: configuration, name: "Earth L4 trojan",             status: confirmed, src: tk7,        fields: { kind: tadpole, system: $sys, host: $earth, members: [$tk7], params: { point: L4 } } }
  - { key: cfg-kamo,     type: configuration, name: "Kamoʻoalewa quasi-satellite", status: confirmed, src: kamooalewa, fields: { kind: quasi-satellite, system: $sys, host: $earth, members: [$kamo] } }
  - { key: cfg-laplace,  type: configuration, name: "Laplace resonance",           status: confirmed, src: resonance,  fields: { kind: resonance-chain, system: $sys, members: [$io, $europa, $ganymede], params: { ratios: "1:2:4" } } }
  - { key: cfg-nep-plu,  type: configuration, name: "Neptune–Pluto 2:3",           status: confirmed, src: resonance,  fields: { kind: resonance-chain, system: $sys, members: [$neptune, $pc-bary], params: { ratios: "2:3" } } }

  # ---- generic infrastructure (speculative; Heliaris-like, no Heliaris names or polities) ----
  - { key: fy-l4,   type: location, name: "Earth–Sun L4 Fleetyard",  gate: speculative, status: speculative, fields: { kind: shipyard, body: $earth, lagrange: L4, lagrange_of: $earth, industry: 7 }, prov: { "*": "invented infrastructure" } }
  - { key: fy-l5,   type: location, name: "Earth–Sun L5 Fleetyard",  gate: speculative, status: speculative, fields: { kind: shipyard, body: $earth, lagrange: L5, lagrange_of: $earth, industry: 6 }, prov: { "*": "invented infrastructure" } }
  - { key: halo-l1, type: location, name: "L1 Halo Observatory",     gate: speculative, status: speculative, fields: { kind: station, map_symbol: telescope, body: $earth, lagrange: L1, lagrange_of: $earth }, prov: { "*": "invented; halo orbits need station-keeping (lagrange)" } }
  - { key: em-l5,   type: location, name: "Earth–Moon L5 Station",   gate: speculative, status: speculative, fields: { kind: station, body: $earth, lagrange: L5, lagrange_of: $luna }, prov: { "*": "invented infrastructure" } }
  - { key: ven-ecl, type: location, name: "Venus Ecliptic Station",  gate: speculative, status: speculative, fields: { kind: station, body: $venus, orbit_km: 9000, map_angle_deg: 200 }, prov: { "*": "invented; orbit_km copied from the Heliaris demo's ecliptic station as a drawing value" } }
  - { key: ring,    type: location, name: "Equatorial Orbital Ring", gate: speculative, status: speculative, fields: { kind: ring, body: $earth, orbit_km: 6800 }, prov: { "*": "invented; orbit_km is the orbital-ring preset's drawing value" } }
  - key: aldrin
    type: location
    name: "Aldrin Cycler"
    gate: speculative
    status: speculative
    src: aldrin
    fields: { kind: station, map_symbol: beacon, sma_au: 1.598, eccentricity: 0.396, periapsis_deg: 0 }
    fsrc: { sma_au: derived, eccentricity: derived }
    derive_note: "a = 2.02^(2/3) AU from P = 2.02 yr; e = Q/a − 1 with aphelion Q = 2.23 AU. The station is invented; the orbit family is real."
