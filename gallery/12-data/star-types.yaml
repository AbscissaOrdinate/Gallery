# Doc 12 §2 — star-type presets for S4. Draft data, not code.
#
# Every preset PINS luminosity_sol and radius_sol (the schema's existing override fields),
# so Teff follows from Stefan–Boltzmann exactly as worldsmith.starTemperature() computes it.
# `teff_k` is the source's own figure, kept as the unit-test oracle (the derived Teff must
# land within 2% of it for stars, 10% for brown dwarfs; `teff_check` is the kernel's
# starTemperature() (5776 K solar) from the pinned L and R).
# `src` applies to every figure in the row unless `provisional:` names the field with a
# one-line rationale. Source ids resolve in sources.yaml.

meta:
  retrieved: 2026-09-29
  stages: [pre-ms, ms, subgiant, rgb, red-clump, agb, blue-supergiant, red-supergiant, wolf-rayet, hot-subdwarf, white-dwarf, neutron-star, black-hole, brown-dwarf]
  colour: "No hex colours are seeded. star_color stays empty and tints.starTint() derives it from Teff, as today. NS/BH get glyph variants instead (doc 12 §2.4)."

# ---- main sequence (luminosity class V) — Mamajek 2022.04.16 ---------------------------------
# logL is the table's; luminosity_sol = 10^logL. ms_lifetime_gyr = Worldsmith 10·M/L with these
# pinned values (derived, shown for review; the kernel computes it live).
main_sequence:
  - { id: star-ms-o5v,  replaces: null,           spt: O5V, mass_sol: 43,    radius_sol: 11.45, luminosity_sol: 3.467e+5, logL: 5.54,  teff_k: 41400, teff_check: 41420, age_gyr: 0.001,  ms_lifetime_gyr: 0.00124, src: mamajek2022, provisional: { age_gyr: "default age is a placeholder inside the MS lifetime, not a figure" } }
  - { id: star-ms-b0v,  replaces: null,           spt: B0V, mass_sol: 17.7,  radius_sol: 7.16,  luminosity_sol: 4.467e+4, logL: 4.65,  teff_k: 31400, teff_check: 31382, age_gyr: 0.002,  ms_lifetime_gyr: 0.00396, src: mamajek2022, provisional: { age_gyr: "placeholder inside MS lifetime" } }
  - { id: star-b,       replaces: star-b,         spt: B5V, mass_sol: 4.7,   radius_sol: 3.36,  luminosity_sol: 588.8,   logL: 2.77,  teff_k: 15700, teff_check: 15522, age_gyr: 0.05,   ms_lifetime_gyr: 0.0798,  src: mamajek2022, provisional: { age_gyr: "placeholder inside MS lifetime" } }
  - { id: star-a,       replaces: star-a,         spt: A0V, mass_sol: 2.18,  radius_sol: 2.193, luminosity_sol: 38.02,   logL: 1.58,  teff_k: 9700,  teff_check: 9685,  age_gyr: 0.3,    ms_lifetime_gyr: 0.573,   src: mamajek2022, provisional: { age_gyr: "placeholder inside MS lifetime" } }
  - { id: star-ms-a5v,  replaces: null,           spt: A5V, mass_sol: 1.88,  radius_sol: 1.785, luminosity_sol: 12.30,   logL: 1.09,  teff_k: 8100,  teff_check: 8096,  age_gyr: 0.5,    ms_lifetime_gyr: 1.53,    src: mamajek2022, provisional: { age_gyr: "placeholder inside MS lifetime" } }
  - { id: star-ms-f0v,  replaces: null,           spt: F0V, mass_sol: 1.61,  radius_sol: 1.728, luminosity_sol: 7.244,   logL: 0.86,  teff_k: 7220,  teff_check: 7209,  age_gyr: 1.0,    ms_lifetime_gyr: 2.22,    src: mamajek2022, provisional: { age_gyr: "placeholder inside MS lifetime" } }
  - { id: star-f-dwarf, replaces: star-f-dwarf,   spt: F5V, mass_sol: 1.33,  radius_sol: 1.473, luminosity_sol: 3.631,   logL: 0.56,  teff_k: 6550,  teff_check: 6570,  age_gyr: 2.0,    ms_lifetime_gyr: 3.66,    src: mamajek2022, provisional: { age_gyr: "placeholder inside MS lifetime" } }
  - { id: star-g-dwarf, replaces: star-g-dwarf,   spt: G2V, mass_sol: 1.00,  radius_sol: 1.012, luminosity_sol: 1.023,   logL: 0.01,  teff_k: 5770,  teff_check: 5774,  age_gyr: 4.5,    ms_lifetime_gyr: 9.77,    src: mamajek2022, provisional: { age_gyr: "placeholder; Sol's own age is sourced in systems/sol.yaml" } }
  - { id: star-ms-k0v,  replaces: null,           spt: K0V, mass_sol: 0.88,  radius_sol: 0.813, luminosity_sol: 0.4571,  logL: -0.34, teff_k: 5270,  teff_check: 5267,  age_gyr: 5,      ms_lifetime_gyr: 19.3,    src: mamajek2022, provisional: { age_gyr: "placeholder" } }
  - { id: star-k-dwarf, replaces: star-k-dwarf,   spt: K5V, mass_sol: 0.70,  radius_sol: 0.701, luminosity_sol: 0.1738,  logL: -0.76, teff_k: 4440,  teff_check: 4454,  age_gyr: 5,      ms_lifetime_gyr: 40.3,    src: mamajek2022, provisional: { age_gyr: "placeholder" } }
  - { id: star-ms-m0v,  replaces: null,           spt: M0V, mass_sol: 0.57,  radius_sol: 0.588, luminosity_sol: 0.06918, logL: -1.16, teff_k: 3850,  teff_check: 3863,  age_gyr: 5,      ms_lifetime_gyr: 82.4,    src: mamajek2022, provisional: { age_gyr: "placeholder" } }
  - { id: star-m-dwarf, replaces: star-m-dwarf,   spt: M4V, mass_sol: 0.23,  radius_sol: 0.274, luminosity_sol: 0.007244,logL: -2.14, teff_k: 3210,  teff_check: 3219,  age_gyr: 5,      ms_lifetime_gyr: 317,     src: mamajek2022, provisional: { age_gyr: "placeholder" } }
  - { id: star-ms-m8v,  replaces: null,           spt: M8V, mass_sol: 0.085, radius_sol: 0.114, luminosity_sol: 5.248e-4,logL: -3.28, teff_k: 2570,  teff_check: 2589,  age_gyr: 5,      ms_lifetime_gyr: 1620,    src: mamajek2022, provisional: { age_gyr: "placeholder" } }

# Worldsmith mass relations vs Mamajek (why presets pin L and R). ratio = Worldsmith L / Mamajek L.
worldsmith_divergence:
  - { spt: O5V, ratio_L: 2.11, R_ws: 8.53,  R_mam: 11.45 }
  - { spt: B5V, ratio_L: 0.54, R_ws: 2.42,  R_mam: 3.36 }
  - { spt: A0V, ratio_L: 0.56, R_ws: 1.56,  R_mam: 2.193 }
  - { spt: G2V, ratio_L: 0.98, R_ws: 1.00,  R_mam: 1.012 }
  - { spt: K5V, ratio_L: 1.38, R_ws: 0.752, R_mam: 0.701 }
  - { spt: M0V, ratio_L: 1.53, R_ws: 0.638, R_mam: 0.588 }
  - { spt: M8V, ratio_L: 1.51, R_ws: 0.139, R_mam: 0.114 }

# ---- evolved, pre-MS, compact, substellar — each anchored to a named exemplar ----------------
# stage_duration_myr: how long the stage lasts for THIS exemplar's mass where sourced; else null.
exemplar_presets:
  - id: star-pre-ms-ttauri
    title: "T Tauri / pre-main-sequence (TW Hya-like)"
    stage: pre-ms
    exemplar: TW Hydrae (K6)
    mass_sol: 0.8
    radius_sol: 1.11
    luminosity_sol: 0.28
    teff_k: 4000
    teff_check: 3988
    age_gyr: 0.008
    stage_duration_myr: 10
    src: twhya
    field_src: { stage_duration_myr: ttauri }
    provisional: { "*": "exemplar figures read from an unattributed Wikipedia infobox — verify against the primary before S4 merges" }
    notes: "Discs dissipate within ~10 Myr (ttauri). Pairs with the protoplanetary-disc belt in the Nursery showcase."

  - id: star-subgiant
    title: "Subgiant (β Hydri-like, 'the Sun in ~2 Gyr')"
    stage: subgiant
    exemplar: β Hydri (G2 IV)
    mass_sol: 1.107
    radius_sol: 1.831
    luminosity_sol: 3.45
    teff_k: 5917
    teff_check: 5818
    age_gyr: 6.8
    stage_duration_myr: 1000
    src: metcalfe2024
    field_src: { teff_k: soubiran2024, age_gyr: metcalfe2024, stage_duration_myr: schroeder2008 }
    provisional: { age_gyr: "midpoint of the sourced 6.1–7.5 Gyr range", stage_duration_myr: "solar-mass track (Schröder & Smith); scales with mass" }

  - id: star-red-giant
    title: "Red giant, RGB (Arcturus-like)"
    stage: rgb
    exemplar: Arcturus (K1.5 III)
    mass_sol: 1.08
    radius_sol: 25.4
    luminosity_sol: 196
    teff_k: 4286
    teff_check: 4288
    age_gyr: 7.1
    stage_duration_myr: 1000
    src: ramirez2011
    field_src: { luminosity_sol: derived, stage_duration_myr: schroeder2008 }
    derivations: { luminosity_sol: "R² (Teff/5772)⁴ from ramirez2011's R and Teff (the paper gives no L)" }
    provisional: { stage_duration_myr: "solar-mass track" }

  - id: star-red-clump
    title: "Red clump / core-helium-burning giant (Capella Aa-like)"
    stage: red-clump
    exemplar: Capella Aa (G8 III)
    mass_sol: 2.5687
    radius_sol: 11.98
    luminosity_sol: 78.7
    teff_k: 4970
    teff_check: 4970
    age_gyr: 0.62
    stage_duration_myr: null
    src: torres2015
    provisional: { age_gyr: "midpoint of 590–650 Myr" }
    notes: "The solar-track He-burning duration (~100 Myr, schroeder2008) does not transfer to a 2.6 M☉ star; left null rather than guessed."

  - id: star-agb
    title: "AGB giant (Mira-like); carbon star = same envelope with C/O > 1"
    stage: agb
    exemplar: Mira A (M7 IIIe, thermally pulsing AGB)
    mass_sol: 1.0
    radius_sol: 367
    luminosity_sol: 8880
    teff_k: 3055
    teff_check: 2927
    age_gyr: null
    stage_duration_myr: 20
    src: woodruff2004
    field_src: { stage_duration_myr: schroeder2008 }
    provisional: { mass_sol: "page gives '~1 M☉' with no citation", radius_sol: "midpoint of 332–402", luminosity_sol: "midpoint of 8,400–9,360", teff_k: "midpoint of 2,918–3,192", stage_duration_myr: "solar early-AGB figure" }
    notes: "Oracle exempt: all three are midpoints of independent ranges (kernel 2,927 K vs 3,055 K). Radius 367 R☉ ≈ 1.7 AU: inner planets are engulfed — the stage warning must fire. No separate carbon-star preset: no sourced exemplar was taken; a carbon star is this preset plus a note."

  - id: star-red-supergiant
    title: "Red supergiant (Betelgeuse-like)"
    stage: red-supergiant
    exemplar: Betelgeuse (M1–M2 Ia–ab)
    mass_sol: 17.75
    radius_sol: 764
    luminosity_sol: 87100
    teff_k: null
    teff_check: 3590
    age_gyr: 0.014
    stage_duration_myr: null
    src: joyce2020
    provisional: { mass_sol: "midpoint of Joyce 2020's 16.5–19", age_gyr: "Wikipedia infobox 14 Myr, unattributed" }
    notes: "Teff left to the kernel (3,587 K); the literature spread (3,600–3,800 K) spans that."

  - id: star-blue-supergiant
    title: "Blue supergiant (Rigel-like)"
    stage: blue-supergiant
    exemplar: Rigel A (B8 Ia)
    mass_sol: 21
    radius_sol: 74.1
    luminosity_sol: 120000
    teff_k: 12100
    teff_check: 12489
    age_gyr: 0.008
    stage_duration_myr: null
    src: przybilla2006
    field_src: { radius_sol: baines2018, luminosity_sol: moravveji2012 }
    notes: "L and R come from different papers; the kernel's Teff lands 3.2% above the observed 12,100 K. Accepted (within Rigel's radius uncertainty); the oracle test uses 4% for this row."

  - id: star-wolf-rayet
    title: "Wolf–Rayet (γ² Velorum WC8-like)"
    stage: wolf-rayet
    exemplar: γ² Velorum WR component (WC8)
    mass_sol: 8.3
    radius_sol: 3.4
    luminosity_sol: 110000
    teff_k: 57100
    teff_check: 57047
    age_gyr: 0.0068
    stage_duration_myr: null
    src: gamma2vel
    provisional: { "*": "secondary table, primary unattributed — verify (gamma2vel.verify)" }
    notes: "Spectral bands above 33,000 K read 'O' in worldsmith.spectralClass(); the stage label overrides it (WC/WN)."

  - id: star-hot-subdwarf
    title: "Hot subdwarf, sdB (core-He burner stripped of its envelope)"
    stage: hot-subdwarf
    exemplar: class average (no single star)
    mass_sol: 0.5
    radius_sol: 0.2
    luminosity_sol: 29.2
    teff_k: 30000
    teff_check: 30023
    age_gyr: null
    stage_duration_myr: 100
    src: heber2009
    field_src: { luminosity_sol: derived }
    provisional: { radius_sol: "midpoint of 0.15–0.25", teff_k: "midpoint of 20,000–40,000", luminosity_sol: "derived from the two midpoints" }
    notes: "Cool metal-poor 'red subdwarfs' (sdM/sdK) are main-sequence stars and are NOT this preset; use an MS preset."

  - id: white-dwarf
    title: "White dwarf (Sirius B-like)"
    stage: white-dwarf
    exemplar: Sirius B (DA2)
    replaces: white-dwarf
    mass_sol: 1.018
    radius_sol: 0.008098
    luminosity_sol: 0.02448
    teff_k: 25000
    teff_check: 25389
    age_gyr: 0.228
    stage_duration_myr: null
    src: bond2017
    provisional: { age_gyr: "Sirius B cooling age 228 Myr — the time since it became a WD, not the system age" }
    notes: "Replaces the current white-dwarf preset (0.6 M☉ / 0.001 L☉ / 0.012 R☉), whose figures carry no source. A 'typical 0.6 M☉ WD' can return once a DA mass-distribution source is taken."

  - id: star-neutron
    title: "Neutron star / pulsar (PSR J0030+0451-like)"
    stage: neutron-star
    exemplar: PSR J0030+0451 (NICER)
    mass_sol: 1.34
    radius_sol: 1.827e-5
    luminosity_sol: 0
    teff_k: null
    age_gyr: null
    stage_duration_myr: null
    src: riley2019
    field_src: { radius_sol: derived }
    derivations: { radius_sol: "12.71 km / 695,700 km" }
    notes: "L = 0 (no photospheric HZ). Pulsar-planet exemplar for a recipe: PSR B1257+12 (konacki2003) — A 0.020 M⊕ @0.19 AU, B 4.3 @0.36, C 3.9 @0.46."

  - id: star-black-hole
    title: "Stellar black hole, dormant (Gaia BH1-like)"
    stage: black-hole
    exemplar: Gaia BH1
    mass_sol: 9.27
    radius_sol: 3.935e-5
    luminosity_sol: 0
    teff_k: null
    age_gyr: null
    stage_duration_myr: null
    src: elbadry2023
    field_src: { radius_sol: derived }
    derivations: { radius_sol: "Schwarzschild r_s = 2GM/c² = 2.953 km per M☉ × 9.27 = 27.4 km → / 695,700 km" }
    notes: "Accretion luminosity is not modelled. Companion exemplar: G dwarf 0.93 M☉ at a = 1.40 AU, e 0.432, P 185.4 d."

  - id: brown-dwarf
    title: "Brown dwarf, L type (Luhman 16 A-like)"
    stage: brown-dwarf
    replaces: brown-dwarf
    exemplar: Luhman 16 A (L7.5)
    mass_sol: 0.03378
    radius_sol: 0.102
    luminosity_sol: 2.2e-5
    teff_k: 1305
    teff_check: 1239
    age_gyr: 0.51
    stage_duration_myr: null
    src: bedin2024
    field_src: { mass_sol: derived, luminosity_sol: bedin2024, teff_k: bedin2024 }
    derivations: { mass_sol: "35.4 M_J × 9.5425e-4 M☉/M_J" }
    notes: "Brown dwarfs cool for their whole life: L and Teff are age-dependent. Keep kind: brown-dwarf."

  - id: brown-dwarf-t
    title: "Brown dwarf, T type (T5V)"
    stage: brown-dwarf
    exemplar: Mamajek T5V row
    mass_sol: 0.028
    radius_sol: 0.101
    luminosity_sol: 1.122e-5
    teff_k: 1160
    teff_check: 1052
    age_gyr: 0.5
    src: mamajek2022
    provisional: { mass_sol: "Mamajek gives no mass for T5V; set to Luhman 16 B's 29.4 M_J (bedin2024) as a same-age neighbour", age_gyr: "placeholder", luminosity_sol: "row re-read verbatim 2026-09-29: the table's own logL −4.95 and R 0.101 give 1,052 K vs its 1,160 K (9%). Kept as published; Teff oracle exempt for this row" }

  - id: brown-dwarf-y
    title: "Brown dwarf, Y type (WISE 0855-like, planetary-mass)"
    stage: brown-dwarf
    exemplar: WISE 0855−0714 (Y4)
    mass_sol: 0.004132
    radius_sol: 0.1074
    luminosity_sol: 6.03e-8
    teff_k: 285
    teff_check: 276
    age_gyr: 5
    src: luhman2024
    field_src: { mass_sol: rowland2024, luminosity_sol: luhman2024 }
    derivations: { mass_sol: "4.33 M_J (rowland2024 upper) × 9.5425e-4" }
    provisional: { age_gyr: "sourced only as an assumed 1–10 Gyr range; midpoint-ish placeholder" }
    notes: "Below the deuterium-burning mass. Useful as a rogue-planet preset too."

# Cut, with the reason:
cut:
  - { what: "Separate carbon-star preset", why: "no sourced exemplar taken; AGB preset + note covers it" }
  - { what: "Blue horizontal branch", why: "metal-poor old populations only; red clump covers the worldbuilding use" }
  - { what: "Luminous blue variable, magnetar, Thorne–Żytkow, quark/strange stars", why: "no honest static L/R; variability or speculative physics the model can't represent" }
  - { what: "Accreting (X-ray) black holes and neutron stars", why: "accretion luminosity not modelled; dormant versions only" }
