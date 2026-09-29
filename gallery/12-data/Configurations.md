# Doc 12 §3 — orbital configurations for S5a. Draft data, not code.
# One record type (`configuration`) covers every kind; kinds differ only in params,
# derived values, advisories and drawing. Owner ruling 2026-09-29: v1 = the "core set".

kinds:
  tadpole:
    what: "Member librates about the host's L4 or L5 (60° ahead/behind)."
    members: { host: 1, member: "1+" }
    params:  { point: "L4 | L5", libration_deg: "optional half-width of the swarm arc" }
    derive:  [ "mass ratio host.parent / host", "arc from point ± libration_deg" ]
    advise:  [ "unstable if M_parent / M_host ≤ 24.96 (lagrange)" ]
    existing: "Body/location `lagrange` + `lagrange_of` stay authoritative; a tadpole config only adds the libration arc and the advisory. No migration."
    examples: [ "Jupiter trojans (arcs)", "2010 TK7 at Earth L4 (tk7)", "Telesto/Calypso at Tethys L4/L5 (coorbital)" ]
  horseshoe:
    what: "Member librates about L3, its path enclosing L4 and L5; with comparable masses both bodies swap orbits (exchange)."
    members: { host: 1, member: 1 }
    params:  { delta_a_km: "mean semi-major-axis difference", swap_period_yr: "optional", exchange: "auto | true | false" }
    derive:  [ "exchange = auto → true when member/host mass ratio > 0.1 (display rule, not physics — provisional)" ]
    advise:  []
    examples: [ "Janus–Epimetheus (janus): Δa ≈ 50 km, swap ≈ 4 yr, mass ratio ≈ 1:4 → exchange", "3753 Cruithne (coorbital): 770 yr cycle, massless → plain horseshoe" ]
  quasi-satellite:
    what: "Member shares the host's orbit and appears to circle it retrograde, unbound (outside the Hill sphere)."
    members: { host: 1, member: 1 }
    params:  { loop_scale: "drawing only" }
    derive:  [ "member a = host a (warn if |Δa|/a > 1%)", "member e drives loop size: loop ≈ 2·e·a (drawing approximation, provisional)" ]
    advise:  [ "loop inside host Hill radius → 'this is a satellite, not a quasi-satellite'" ]
    examples: [ "469219 Kamoʻoalewa about Earth (kamooalewa)" ]
  barycentric-pair:
    what: "Two bodies orbiting their common barycentre: binary stars, double planets, binary asteroids, contact binaries, planet–moon pairs with the barycentre outside the primary. Hierarchical triples = nested pairs."
    members: { center: "1 barycenter body", member: 2 }
    params:  { separation_au: "or separation_km", eccentricity: "", periapsis_deg: "" }
    derive:  [ "a_i = a · m_j / (m_i + m_j)", "phases locked 180° apart", "P from Kepler on m_i + m_j", "barycentre-outside-primary flag: a_1 > R_1", "for star pairs: Holman–Wiegert S-type limit per member and P-type limit for the pair" ]
    advise:  [ "planet around a member beyond its S-type a_c → unstable", "planet around the pair inside the P-type a_c → unstable", "fits valid only for 0 ≤ e ≤ 0.7–0.8, 0.1 ≤ μ ≤ 0.9 (holman1999) — outside that, say so instead of a number", "contact binary (separation < R_1 + R_2) → label, no orbit" ]
    examples: [ "Pluto–Charon (charon): Pluto 2,415 km from the barycentre vs R 1,188 km", "α Cen AB (akeson2021)", "Sirius AB (bond2017)" ]
  rosette:
    what: "n bodies at the vertices of a regular polygon (optionally alternating heavy/light), all on one orbit shape, phase-locked."
    members: { center: "barycenter body (true Klemperer) or star (ring about a primary)", member: "3–9" }
    params:  { n: "", mass_pattern: "e.g. [H, L] repeating", shape: "circular | elliptical", a: "sma_au or sma_km", e: "elliptical only", maintained: "bool" }
    derive:  [ "member k at phase φ0 + k·360/n", "elliptical: every member on an ellipse of the same a and e, periapsis rotated by 360/n per member, one common focus at the centre (homographic central-configuration motion — S5a hand-checks this against a 3-body integration before shipping)" ]
    advise:  [ "Klemperer 1962: every rosette is vulnerable to destabilisation — advisory 'unstable; maintained by station-keeping' unless maintained: true, then 'maintained' note", "star-centred ring: stability depends on n and mass ratio — advisory 'unverified' (no source taken)" ]
    examples: [ "Barnard's Star habitat hexagon (speculative, maintained)", "Nursery elliptical rhombus (fictional, maintained)" ]
  resonance-chain:
    what: "Ordered members whose periods sit at small-integer ratios."
    members: { member: "2+" }
    params:  { ratios: "declared, e.g. ['1:2', '1:2'] or period ratio '1:2:4'", tolerance_pct: "default 2" }
    derive:  [ "periods from Kepler", "actual ratios vs declared" ]
    advise:  [ "declared vs actual differ by > tolerance → 'near-resonant, not in resonance'" ]
    examples: [ "Io:Europa:Ganymede 1:2:4 (resonance)", "Neptune:Pluto 2:3 (resonance)", "Barnard's b–e: ratios 1.348, 1.308, 1.634 — labelled near 4:3, 4:3, 5:3, NOT claimed resonant" ]
    ties: "S3's ASCII 2:1 loop can take any 2-member chain as its source."

# Ranked set. v1 = S5a. later = listed for a future doc. never = with the reason.
ranking:
  v1:
    - { item: "tadpole (arc + mass-ratio advisory over existing L4/L5)",   why: "exists; cheap to finish" }
    - { item: "horseshoe incl. exchange",                                    why: "owner-required; Sol has the real case" }
    - { item: "quasi-satellite",                                             why: "owner-required; Kamoʻoalewa" }
    - { item: "barycentric-pair (double planets, binary stars, binary asteroids, nested triples)", why: "owner-required; unblocks α Cen, Sirius, Pluto–Charon" }
    - { item: "rosette, circular + elliptical, maintained flag",           why: "owner-required" }
    - { item: "resonance-chain labels",                                      why: "Laplace chain, Barnard's; feeds S3 ASCII" }
    - { item: "S/P-type binary stability advisory",                          why: "α Cen and Sirius starters need it; derived from holman1999" }
    - { item: "nebula overlay (system-level)",                               why: "owner ruling: sixth showcase system" }
    - { item: "hyperbolic paths (e ≥ 1) for interstellar objects",          why: "owner ruling: sixth showcase system" }
  later:
    - { item: "periapsis/apoapsis, retrograde and high-inclination markers", why: "cheap; Caelum item 4 — pairs with doc 10 strip" }
    - { item: "Hill-sphere and Roche-limit overlays",                         why: "values already derived; overlay only" }
    - { item: "submoons (moon neighbourhood recursion)",                     why: "layout builds one neighbourhood level today" }
    - { item: "shepherd moons, rings with gaps and arcs",                    why: "needs a ring renderer with gaps" }
    - { item: "belt gaps (Kirkwood) and protoplanetary-disc gaps",           why: "belt field `gaps_au[]`; Sol draws the main belt between the 4:1 and 2:1 gaps today" }
    - { item: "irregular captured-moon swarms",                              why: "annotation arcs do it now" }
    - { item: "Oort shell",                                                  why: "only legible on the strip's log axis" }
    - { item: "rogue planets as first-class (no host)",                      why: "Nursery carries one as a body without parent; generalise later" }
    - { item: "hierarchical-triple stability (Mardling–Aarseth)",            why: "no source taken this round; nested pairs render fine without it" }
    - { item: "companion flux on S-type planets",                            why: "hostStar() uses one star; α Cen B adds flux at A's planets near periastron" }
    - { item: "statites (non-Keplerian hover)",                              why: "location with a flag; draw only" }
    - { item: "Dyson swarm band",                                            why: "an annotation ring does it now (Sirius starter uses one)" }
    - { item: "body presets: eyeball, hycean, super-puff, iron",             why: "move to S4 as presets (see doc §2.6); no EWoCS term for hycean or eyeball" }
  never:
    - { item: "Ringworld as a free orbit",                                   why: "a rigid ring is not in orbit and drifts into its star (ringworld) — only ever as a maintained megastructure location with an advisory, never as an orbit type" }
    - { item: "N-body integration / live dynamics",                         why: "schematic map; configurations are declarative" }
  already:
    - { item: "cyclers",                    how: "location with sma_au + eccentricity (Heliaris demo)" }
    - { item: "orbital rings, skyhooks",    how: "location kinds + annotations" }
    - { item: "sunshade / halo station at L1, L2", how: "location at lagrange L1/L2; name it halo" }
    - { item: "multiple debris belts",       how: "several belt bodies (ε Eri starter)" }
