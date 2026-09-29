# S5 — Orbital configurations and starter systems (S5a-1 · S5a-2 · S5b · C3)

**Spec:** `gallery/12-presets-and-starter-systems.md` §1, §3, §4 and §5 — scope and acceptance
there **govern**. **Data:** `gallery/12-data/configurations.yaml`, `systems/*.yaml`,
`sources.yaml`. **Needs:** S4 merged (body v5 `status`/`provenance`, `eyeball`, new stellar
presets). S5b also needs S1 (history + snapshots) — installs are one undoable step.

| Session | Scope (doc 12 §5) | Model @ effort | Branch |
|---|---|---|---|
| S5a-1 | `configuration` v1 type; barycentric pair + fixes B1–B6; S/P-type advisory; tadpole; horseshoe/exchange; quasi-satellite | Opus 5.5 @ high (extra-high only if stuck) | `feat/orbital-configs` |
| S5a-2 | rosette circular + elliptical (maintained), resonance labels, system v5 `nebula`, body v6 hyperbolic + unbound placement | Opus 5.5 @ high, or Sonnet 5.5 @ high if the S4 A/B favours Sonnet | `feat/orbital-configs-2` |
| S5b | record-set loader + install dialog ("Starters") + installer; six recipes; `_tables/sources-astro.yaml`; minimal provenance tooltip | Sonnet 5.5 @ high | `feat/starter-systems` |
| C3 | data review of the six recipes against `sources.yaml` before S5b merges | Cowork, Opus 5.5 @ high | — |

## Every session

1. Read `docs/ROADMAP.md`, this brief, doc 12 §1 (binding number rules) and the sections for
   your scope, `docs/UNITS.md`, `docs/sessions/S5-handoff.md` if it exists.
2. Branch from current `main`; one PR (S5b may be two: loader/installer, then recipes).
3. Configurations **derive** geometry; they never write members' fields. The only drag write
   is the configuration's `params.phase_deg`, undoable as one step.
4. Checks: typecheck, tests (the Holman–Wiegert oracles in doc 12 §3.4 — the coordinator
   re-computed them: α Cen 2.74 / 2.49 / 86.6 AU, Sirius 2.17 / 1.48 / 78.9 AU), guard,
   map smoke scripts (`ui-smoke-map*.mjs`, `ui-smoke-map-lod.mjs`), schema backups and
   migration round trips for every bump.
5. Review subagent on the opposite model. End: update `docs/sessions/S5-handoff.md` and the
   ROADMAP §2 row; open the PR; stop.

## Session-specific notes

- **S5a-1:** B1–B6 change derivations for existing vaults only where a barycentre is
  non-primary or a star is non-primary — add a test that the Heliaris demo's derived CSV is
  byte-identical before/after.
- **S5a-2:** the elliptical-rosette geometry check against a short 3-body integration lives in
  a test script with its tolerance stated; no new runtime dependency for the integrator.
- **S5b — data fix before loading (coordinator review, 2026-09-30):** `systems/sol.yaml`
  gives Pluto `sma_km: 2415` and Charon `sma_km: 17181.0`, which imply a mass ratio of 0.141.
  The file's own masses (0.002178 and 0.0002662 M⊕, ratio 0.1222) give Pluto **2,134 km** and
  Charon **17,462 km** from the barycentre (a_i = 19,595.764 · m_j / (m_P + m_C)); the cited
  page's own ratio 0.1218 agrees within 7 km. The page's 17,181 km is internally inconsistent.
  Use the mass-derived values with `fsrc: derived` and that formula in `derive_note`; the
  "barycentre outside Pluto" showcase still holds (2,134 > 1,188 km).
- **S5b:** every installed numeric field must carry provenance (the test fails on a bare
  number; the coordinator's scan found none today, and every `src` id resolves). The
  installer writes through the history layer as one step after a snapshot.
- **C3** runs after S5b's PR is open and before merge: check each recipe against
  `sources.yaml`, especially the `verify: true` rows (`acen-orbit`, `gamma2vel`, `twhya`), and
  post findings on the PR.
