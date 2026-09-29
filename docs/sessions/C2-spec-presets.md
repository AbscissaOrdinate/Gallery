# C2 — Research + spec doc 12: star types, orbital configurations, starter systems

**Surface:** Cowork (separate session, attached to the Gallery project, web search on)
· **Model:** Opus 5.5 @ high · **Output:** `gallery/12-presets-and-starter-systems.md` plus
sourced data drafts under `gallery/12-data/` in the project. You do not edit the repo.

Doc 12 feeds three Code sessions: **S4** (star types), **S5a** (orbital configurations),
**S5b** (starter systems as recipes). The binding rule from `docs/CLAUDE.md` applies with full
force: **no invented physical figures.** Every real value carries a source; every
speculative or assumed value is marked `provisional: true` with a one-line rationale.

## Read first

- Project: `ROADMAP.md` (§5 rulings 6–7), `gallery/03`/`04` (system map, bodies, map
  preferences), `gallery/10` §4 (strip; α Cen is its fixture), `gallery/reviews/caelum-review.md`
  (items 4, 5, 6, F, G).
- Repo (clone `https://github.com/AbscissaOrdinate/Gallery`): `docs/UNITS.md`,
  `src/core/schema/builtin/bodyPresets.ts` (8 star presets today: M/K/G/F dwarfs, A, B, brown
  dwarf, white dwarf), `src/core/schema/builtin/body.ts`, `src/core/astro/{worldsmith,derive,layout,ewocs}.ts`,
  `src/ui/demo.ts` (Heliaris demo vault = the record format to match).

## Part A — Star types (→ S4)

1. Catalogue with typical mass, radius, luminosity, T_eff, main-sequence or stage lifetime,
   and colour for: O/B/A/F/G/K/M main sequence (fill gaps in the existing eight), subgiant,
   red giant, red clump / horizontal branch, AGB / carbon star, red and blue supergiants,
   Wolf–Rayet, T Tauri / pre-main-sequence, subdwarf, white dwarf (exists), neutron star /
   pulsar, stellar black hole, brown dwarfs split L/T/Y. Treat the list as a category —
   add what a worldbuilder would reach for, cut what the model can't represent honestly.
2. The **model change**: Worldsmith's relations are main-sequence only. Specify an
   `evolutionary_stage` / luminosity-class field whose presets override the MS derivation
   (the white-dwarf preset already overrides L and R), which derived quantities stay valid
   (HZ from L; frost line; lifetimes) and which must be suppressed or flagged per stage.
3. Sources: a standard MS table (e.g. Mamajek's) and textbook/review values for evolved and
   compact objects. Cite each row.

## Part B — Orbital configurations (→ S5a)

Owner-required: **co-orbital** configurations; **double planets** via barycenter (the
barycenter kind exists but is only treated as a system primary today — verify in
`layout.ts`); **Klemperer rosettes, circular and elliptical**.

Propose one data model that covers these as cases rather than one-offs — e.g. a
`configuration` group record or field: `{kind: tadpole | horseshoe | quasi-satellite |
exchange | rosette | resonance-chain | barycentric-pair, members[], params}` — and how
each renders on the schematic map, the true-scale view and the future strip (doc 10 §4).
Physically unstable arrangements (Klemperer rosettes are, per the literature — verify) render
with an **advisory, never a block**, and a "maintained" note for artificial ones.

Then evaluate this candidate list (coordinator's, from recall — verify, cut or extend) and
return a ranked **v1 / later / never** set for the owner:

| Area | Candidates |
|---|---|
| Co-orbital | tadpole (L4/L5 exists), horseshoe (Janus–Epimetheus), quasi-satellite (Kamoʻoalewa), exchange orbits, trojan moons (Telesto/Calypso) |
| Barycentric | double planets (Pluto–Charon), binary asteroids, contact binaries, planet–moon pairs whose barycenter lies outside the primary |
| Multi-star | S-type vs P-type (circumbinary) planets with a stability-limit advisory, hierarchical triples |
| Resonance | mean-motion resonance chains (Laplace 1:2:4, TRAPPIST-1-style), labelled period ratios; ties to the ASCII 2:1 loop |
| Orbit shape | retrograde / high-inclination markers, periapsis/apoapsis markers, eccentric orbit crossings, Hill sphere and Roche limit overlays |
| Hierarchy | submoons, shepherd moons, irregular captured-moon swarms |
| Discs | rings with gaps and arcs, multiple debris belts, Kirkwood gaps, Oort shell, protoplanetary disc |
| Unbound | rogue planets, interstellar objects on hyperbolic paths |
| Nebulae | emission / planetary / dark nebula as a system- or region-level overlay rather than a body |
| Artificial | statites, halo/Lissajous orbits at L-points, cyclers (exist), Dyson swarm band, sunshades at L1, orbital rings/skyhooks (exist), ringworld/Bishop ring |
| Body types | eyeball, hycean, lava, super-puff, carbon, iron, chthonian worlds — check EWoCS coverage first |

## Part C — Five starter systems (→ S5b)

For **Sol, α Centauri, Barnard's Star, Sirius, ε Eridani**: real, sourced bodies first
(NASA Exoplanet Archive and the discovery papers; state confirmation status and date — the
α Cen A candidate and Proxima's disputed planet are provisional), then **speculative
additions chosen to showcase features Sol lacks**. The owner wants double planets,
horseshoe orbits, nebulae, cyclers, interesting candidate planets and megastructures to
appear somewhere across the five. Sol carries basic Heliaris features: ecliptic stations,
Lagrange fleetyards, limited megastructures (see `demo.ts` for the Heliaris set; these are
generic starters, not canon — no Heliaris names or polities).

Deliver per system: a showcase table (feature → body → real/speculative), a record list in
the vault format, and every figure with source or `provisional: true`. Flag physically
implausible asks honestly (e.g. a planetary nebula around Sirius B would have dispersed long
ago — if nebulae need a showcase, propose where they honestly fit, or a sixth generic
"showcase" skeleton). Starter systems install as doc 10 §7.4 **recipes** (multi-record
presets); specify the recipe file shape S5b builds.

## Hand back

1. Ask the owner once (≤ 5 questions, recommended defaults) for: the v1 configuration set,
   the showcase assignment per system, and whether a sixth generic showcase system is wanted.
2. Write doc 12 (≤ ~600 lines, tables over prose) and the data drafts to the project.
3. Include a §Work breakdown for S4 / S5a / S5b with acceptance criteria and a ROADMAP §3.1
   routing score each.
4. Post a ≤ 10-line summary.
