# S4 — Star types (routing A/B calibration)

**Spec:** `gallery/12-presets-and-starter-systems.md` §1, §2 and §5 "S4" — scope and
acceptance there **govern**. **Data:** `gallery/12-data/star-types.yaml`, `sources.yaml`.
**Needs:** S1 merged. Independent of S2/S3 (may run before them if the owner prefers).

## A/B procedure (ROADMAP §3.4)

The same brief runs twice from the same `main` commit:

| Run | Model @ effort | Branch |
|---|---|---|
| S4-A | Sonnet 5.5 @ medium | `feat/star-types-sonnet` |
| S4-B | Opus 5.5 @ medium | `feat/star-types-opus` |

Each run opens its own PR marked **A/B — do not merge** and records in its PR description:
tests passing on the first full run (y/n), fix-up iterations, net lines, and the owner's
usage-bar delta for the session (Settings → Usage, before/after). Then a **judge** session
(Sonnet 5.5 @ high, fresh) reviews both diffs against doc 12 §5 acceptance, lists findings by
severity, recommends one to merge, and appends the result to ROADMAP §3.4. The other PR is
closed. If the owner skips the A/B to save usage, run S4-A only.

## Scope reminders

- Body schema **v5**: `stage`, `spectral_type`, `stage_duration_myr`, `status`, `provenance`
  (additive; **no migration** — a record without `stage` derives exactly as today).
- Stage-aware `deriveStar` / `spectralClass` / warnings per doc 12 §2.2's validity table;
  engulfment warning; NS/BH glyphs; `eyeball` preset.
- Presets come from `star-types.yaml`; every figure keeps its `src`/`prov` in the preset's
  provenance.
- **Data fix (coordinator review, 2026-09-30):** the `brown-dwarf` (Luhman 16 A, L7.5)
  preset's pinned L and R give a kernel T_eff of ~1,238 K, which is under doc 12's L/T boundary
  (1,255 K) — the kernel would label it **T**. Set `spectral_type: "L7.5"` on that preset and
  add a test that its label is `L7.5`. Do not change the pinned L or R.
- `verify: true` sources used here (`gamma2vel`, `twhya`): confirm against the primary
  paper if reachable; otherwise leave the preset's affected fields under `prov` with the
  reason "secondary source, unverified". Never substitute a remembered value.

## Every run

Read `docs/ROADMAP.md`, this brief, doc 12 §1–2 and §5, `docs/UNITS.md` §1 and rule 6.
Checks: typecheck, tests (the generated per-row T_eff oracle test, tolerances per doc 12 §5),
the Heliaris derived-CSV byte-identical test, body-editor smoke. End: handoff note in the PR
description; ROADMAP row untouched until the judge merges.
