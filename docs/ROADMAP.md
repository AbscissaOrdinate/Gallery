# Gallery — Roadmap and session plan

Owner: vault owner (Sean). Coordinator: Cowork PM session. Last revised 2026-09-29 (S1b).

This file is the **single entry point** for every Code or Cowork session. It holds the queue,
the routing rules, the owner's rulings for the current round, and the Fable spend ledger.
Authority order for anything technical is unchanged: `docs/UNITS.md` → `docs/CLAUDE.md` →
`docs/STYLE.md` → numbered `gallery/` docs → this file. This file wins only on **sequencing,
scope, and owner rulings** recorded in §5.

---

## 1. Where things stand

- `main` has the UI refresh (PRs #1–7) and the design suite through editor 2a plus doc 09
  steps 1–3 (label fix, armour inspector, glyph redraws, eleven hull classes) (#9).
- **Not built:** undo, wiki links, QoL shell, extra star types, starter systems, orbital
  configurations beyond L-points, doc 10 (record views), shell extraction, ship editor UI,
  doc 07 gap closure, Editors 3–5, planet (Mollweide/globe) editor, mobile capture.
- Already exists (do not rebuild): global search (`repo.search`), backlinks, back navigation
  (`state.history`), per-session revision log, barycenter kind, megastructure/cycler body kinds.

## 2. Queue

Serial by default: one Code session at a time. Cowork spec sessions (C*) never touch the
repo and may run beside a Code session. Parallel Code work only when a session asks for it
and the owner agrees.

| ID | Work | Surface | Model @ effort | Branch | Needs | Brief | Status |
|---|---|---|---|---|---|---|---|
| C0 | Plan, rulings, this file, first briefs | Cowork | Opus 5.5 @ high | — | — | — | done |
| S0 | Prep: docs drop, renames, doc 10 reconciliation, routing section, cloud env check | Cloud Code | Sonnet 5.5 @ medium | `chore/s0-prep` | drop uploaded | `sessions/S0-prep.md` | done (PR #10) |
| C1 | Spec doc 11 — undo, wiki link layer, QoL shell, motion + ASCII | Cowork | Opus 5.5 @ high | — | — | `sessions/C1-spec-qol.md` | done — `gallery/11-qol-foundations.md` |
| C2 | Research + spec doc 12 — star types, orbital configurations, five starter systems | Cowork | Opus 5.5 @ high + web | — | — | `sessions/C2-spec-presets.md` | done — `gallery/12-presets-and-starter-systems.md` and `gallery/12-data/` |
| S1a | Foundations — audit | Cloud Code | Sonnet @ medium | `feat/foundations-audit` | S0, C1 | `sessions/S1-foundations.md` | done (`docs/AUDIT.md`; deviations + units not audited) |
| S1b | Foundations — snapshots + view-never-writes guard | Cloud Code | Sonnet @ high | `feat/foundations-snapshots` | S1a | `sessions/S1-foundations.md` | in review — PR "S1b — snapshots + guard" |
| S1c | Foundations — history core (PR 3a) | Cloud Code | Opus 5.5 @ high | `feat/foundations-history-core` | S1b | `sessions/S1-foundations.md` | — |
| S1d | Foundations — UI wiring (PR 3b) | Cloud Code | Sonnet @ high | `feat/foundations-history-ui` | S1c | `sessions/S1-foundations.md` | — |
| S4-A | Star types — body v5 `stage`/`spectral_type`/`status`/`provenance`, stage-aware `deriveStar`, presets from `star-types.yaml`, NS/BH glyphs, `eyeball`. **A/B run** (§3.4); PR marked "do not merge" | Cloud Code | Sonnet 5.5 @ medium | `feat/star-types-sonnet` | S1, C2 | `sessions/S4-star-types.md` | — |
| S4-B | Star types — same brief, second run. **A/B run** (§3.4); PR marked "do not merge". Owner may skip the A/B and run S4-A only | Cloud Code | Opus 5.5 @ medium | `feat/star-types-opus` | S1, C2 | `sessions/S4-star-types.md` | — |
| S4-J | Judge both S4 diffs against doc 12 §5, recommend one to merge, append the result to §3.4, close the other PR | Cloud Code | Sonnet 5.5 @ high | — | S4-A, S4-B | `sessions/S4-star-types.md` | — |
| H1 | Audit fixes F8, F9, F11, F12, F15 — provisional markers on the budget panel and hull STRUCTURE figures; hull-render font sizes and literal stroke/opacity values from tokens; delete unused `--radius-1` | Cloud Code | Sonnet @ medium | `fix/audit-h1` | S1d | to write from `docs/AUDIT.md` | — |
| S2a | Wiki core — prose parser, wiki grammar, link index, `mentions`, `fuzzy.ts`, repo index hooks (doc 11 S2.1) | Cloud Code | Opus 5.5 @ high | `feat/wiki-core` | S1 | `sessions/S2-wiki.md` | — |
| S2b | Wiki render — `ProseField`, link/redlink/ambiguous rendering, BACKLINKS LINKED/MENTIONED; `cardModel`, `ClassificationHeader`, `RecordCard`, hover (S2.2 + S2.3) | Cloud Code | Sonnet 5.5 @ high | `feat/wiki-render` | S2a | `sessions/S2-wiki.md` | — |
| S2c | Wiki authoring — autocomplete, redlink create, REDLINKS tool, ambiguity chooser; rename impact + dialog + rewrite transaction (S2.4 + S2.5) | Cloud Code | Opus 5.5 @ high | `feat/wiki-rename` | S2b | `sessions/S2-wiki.md` | — |
| S3a | QoL shell — keymap + command registry, switcher, palette, shortcut sheet, save indicator, duplicate, recent/pinned, multi-select + bulk tag/delete, tag pages (S3.1–S3.3) | Cloud Code | Sonnet 5.5 @ high | `feat/qol-shell` | S2c | `sessions/S3-qol-shell.md` | — |
| S3b | Transclusion, find in page, motion tokens + tiers + Settings DISPLAY (`STYLE.md` §10), ASCII set + `WorkPanel` + progress reporters (S3.4–S3.7) | Cloud Code | Sonnet 5.5 @ high | `feat/qol-shell-2` | S3a | `sessions/S3-qol-shell.md` | — |
| S5a-1 | Orbital configurations — `configuration` v1; barycentric pair + fixes B1–B6; S/P-type advisory; tadpole; horseshoe/exchange; quasi-satellite | Cloud Code | Opus 5.5 @ high (extra-high only if stuck; Fable reserve #3) | `feat/orbital-configs` | S4 | `sessions/S5-orbits-and-starters.md` | — |
| S5a-2 | Orbital configurations 2 — rosettes (circular + elliptical), resonance labels, system v5 `nebula`, body v6 hyperbolic + unbound placement | Cloud Code | Opus 5.5 @ high (Sonnet 5.5 @ high if the S4 A/B favours Sonnet) | `feat/orbital-configs-2` | S5a-1 | `sessions/S5-orbits-and-starters.md` | — |
| S5b | Starter systems ("Starters") — record-set loader, install dialog, installer (one undoable step after a snapshot); six recipes; `_tables/sources-astro.yaml`; provenance tooltip. Pluto/Charon data fix first (brief) | Cloud Code | Sonnet 5.5 @ high | `feat/starter-systems` | S5a-2, S1 | `sessions/S5-orbits-and-starters.md` | — |
| C3 | Data review of the six recipes against `sources.yaml` (esp. `verify: true` rows); runs after the S5b PR is open, before merge | Cowork | Opus 5.5 @ high | — | S5b PR | `sessions/S5-orbits-and-starters.md` | — |
| R2 | Doc 10: rest of 10a → 10b (strip; starter systems are fixtures) → 10c → trimmed 10d/10e | Cloud Code | Sonnet @ high; Opus @ high for 10b | `feat/record-views-*` | S5b | later | — |
| R3 | Design suite: shell extraction → ship editor 2b → doc 09 §3.5 gaps → Editor 3 | Cloud Code | Opus 5.5 @ medium/high | `feat/design-suite-*` | R2 | later | — |
| R4 | Doc 13 planet editor spec (Cowork) → core build | Cowork → Cloud Code | Opus @ high → **Fable 5.1** (#2) | `feat/planet-editor` | R3 | later | — |

Branch rule: every session branches from current `main`; one PR per checkpoint; merge
before the next session starts. **Branch names are advisory** (a cloud session is assigned its
own); **the PR title carries the session ID** (e.g. "S1b — snapshots + guard").

> The S2–S5 rows follow their briefs in `docs/sessions/` (S2 three sessions, S3 two, S4 an A/B
> pair plus a judge, S5 three plus the C3 data review). S4 runs directly after S1 and does not
> depend on S2/S3 (its brief lets the owner run it earlier still). The local Windows/Tauri
> checkpoint `sessions/L-local-checkpoint.md` runs after S1d, S3b and S5b.

## 3. Routing rubric (Gallery-specific)

### 3.1 Score each task 1–3 on six axes

| Axis | 1 | 2 | 3 |
|---|---|---|---|
| **Blast radius** | one module | 2 subsystems | a write path (`repo.save/delete/saveConfig`, drafts, autosave) or ≥ 3 subsystems |
| **Ambiguity** | spec answers every choice | a few local choices | open architecture choices |
| **Physics / data risk** | none | reuses existing derived quantities | new derived quantity or sourced figures (`UNITS.md`, provenance) |
| **UI verification burden** | vitest covers it | smoke covers it | only smoke + eyeballing catch regressions |
| **Reversibility** | pure code | schema bump | migration or vault-wide writes |
| **Context depth** | a few files | one subsystem end to end | large slice of the repo |

### 3.2 Route by total

| Total | Route |
|---|---|
| ≤ 8 | Sonnet 5.5 @ medium (low for pure data entry) |
| 9–12 | Sonnet 5.5 @ high; Opus 5.5 @ medium when ambiguity = 3 |
| 13–15 | Opus 5.5 @ high |
| ≥ 16, or blast radius **and** reversibility both 3 | Fable 5.1 candidate — owner approves against the ledger (§6). Fable 5.1 needs paid usage credits on the Pro plan; default to Opus 5.5 @ high (extra-high only if stuck) and split finer. |

Surface: **Cowork** for research, specs, owner decisions, data review. **Cloud Code** for
builds (sees only GitHub). **Local Code** only when a task needs the OneDrive vault or a
Tauri/Rust build.

### 3.3 Session hygiene

- **Split** at ~50% context used, at a checkpoint boundary, or past ~1,500 net lines across
  two subsystems — whichever first. Before stopping, write
  `docs/sessions/<ID>-handoff.md` (done / not done / next step / open questions).
- **Subagents:** Explore @ low for grep and contract lookups; one review subagent on the
  **opposite model** at the end of every PR. Ultracode (workflow fan-out) only for
  independent read-heavy work: audits, smoke widening, preset data checks.
- **Stop and ask** on architecture that looks wrong, a missing physical figure, or anything
  in §5's open queue. Never guess an owner decision.

### 3.4 Calibration

S4 runs the same brief twice (Sonnet @ medium, Opus @ medium) on separate branches; the
reviewer scores both on tests passed first time, review findings, and diff size. Adjust the
§3.2 thresholds from the result and log it here.

| Task | Scores (B/A/P/U/R/C) | Total | Route |
|---|---|---|---|
| S0 prep | 1/1/1/1/1/2 | 7 | Sonnet @ medium |
| S1 foundations | 3/2/1/2/3/3 | 14 + B&R = 3 | Fable |
| S2 wiki core (S2a, S2c; S2b is rendering) | 3/2/1/2/3/2 | 13 | Opus @ high (S2b Sonnet @ high) |
| S3 QoL shell (S3a, S3b) | 2/1/1/3/1/2 | 10 | Sonnet @ high |
| S4 star types | 1/1/3/1/2/1 | 9 | A/B |
| S5a-1 orbital configs | 3/2/3/3/2/2 | 15 | Opus @ high |
| S5a-2 orbital configs 2 | 2/2/2/3/2/2 | 13 | Opus @ high (Sonnet @ high if S4 A/B says so) |
| S5b starter systems (new bulk write path) | 3/1/2/2/2/2 | 12 | Sonnet @ high |
| R4 planet editor core | 3/3/3/3/2/3 | 17 | Fable |

## 4. Check plan (every PR)

- `npm run typecheck` and `npm test` clean (vitest is core-only; it does not cover UI).
- Headless-Chromium smoke for every touched surface; **widen the smoke against current code
  before** any UI refactor. Pure extractions: identical screenshots.
- Schema touched → version bump + `.v<N>.json` backup + migration round-trip test.
- Any migration or bulk write runs only after a snapshot exists (from S1 on).
- From S1 on: the view-never-writes test passes (only a map drag or L-point park writing `map_angle_deg`, `lagrange_of`, `lagrange`, `orbit_km` may write).
- From S1 on: every new write path goes through the history layer (undoable or explicitly
  exempt with a reason in code).
- Review pass by a fresh session or subagent on the opposite model. Refactors reviewed via
  `git diff -M --stat`.
- Kernel additions: hand-computed unit tests; each derived quantity gets a verification row
  once `docs/VERIFICATION.md` exists.
- After any Fable session: log spend in §6.

## 5. Owner rulings — round of 2026-09-29

1. **Round priority:** QoL (undo, wiki, shell) + presets (star types, starter systems) before
   doc 10; foundations and undo first. Then doc 10, then design suite, then planet editor.
2. **Undo:** app-wide, one history across records for the session; canvas drags are single
   steps; **not** persisted across restart. Snapshots cover destructive operations.
3. **Wiki:** all of `[[link]]` autocomplete, hover previews, redlinks, rename-updates-links,
   tag pages, transclusion. Top three: `[[link]]`, redlinks, rename rewrite.
4. **QoL (open category):** command palette / quick switcher, shortcut sheet, duplicate,
   recent/pinned, bulk tag, save indicator, find-in-page, and similar productivity affordances.
5. **Motion:** doc 10 §7.8's motion is **adopted into `STYLE.md`**, behind a Settings toggle
   covering section stagger, hover and change transitions (default follows
   `prefers-reduced-motion`). **More ASCII animation** is wanted: more spinner frames, a full
   2:1 resonance loop of two orbiting bodies, additional ASCII loading bars where work takes
   time.
6. **Starter systems:** real systems, with reasonable assumptions and speculative bodies
   welcome — especially ones that exercise features Sol lacks (double planets, horseshoe
   orbits, nebulae, cyclers, interesting candidate planets, megastructures). Sol carries basic
   Heliaris features (ecliptic stations, Lagrange fleetyards, limited megastructures). They
   are generic starters, not canon.
7. **Orbital features:** co-orbital configurations are required; double planets via
   barycenter; Klemperer rosettes, circular and elliptical.
8. **Workflow:** serial Code sessions; parallel only on request. Ultracode where it pays.
   Spec and requirement drafting delegated to separate Cowork sessions.
9. **Doc reconciliation:** `trust` → `provisional` everywhere doc 10 uses it; the strip
   renderer lives under `src/core/astro/`, not `src/render/`; the Caelum review lives at
   `gallery/reviews/caelum-review.md`.

10. **Wiki (C1, 2026-09-29):** both `[[Name]]` and `[[id|Name]]` resolve; Gallery writes `[[Name]]`.
    Prose renders when not editing, via a small Markdown subset in core (no new dependency).
    Rename with inbound links: preview, then rewrite; old name kept as alias by default.

11. **Doc 12 §6 items 1–4 accepted** (2026-09-29): (1) S5a splits into S5a-1 / S5a-2, replacing
    the one S5a row; (2) S5b's routing moves from 8 to 12 (Sonnet @ high), and S5a-1 at 15 stays
    Opus @ high with the Fable reserve as its fallback; (3) the `white-dwarf` and `brown-dwarf`
    preset ids take the figures of Sirius B and Luhman 16 A — existing records are untouched,
    since presets are copied at creation; (4) record-set recipes are called "Starters" in the UI.

12. **Audit findings (`docs/AUDIT.md`, S1a) — the owner's F-list, 2026-09-29:**
    - **F1:** the title's blur edits only when the slug actually changes, and `edit()` does
      nothing when the patch changes nothing.
    - **F2:** opening a vault is maintenance, not viewing. Creating missing seed files needs no
      snapshot. Overwriting an existing file (schema upgrade, config rewrite) snapshots first
      with cause "Before vault upgrade", writes only if the content differs, and logs one
      session-log line. Opening twice writes nothing the second time (tested).
    - **F19:** the view-never-writes guard spies on the storage adapter's writes under the vault
      root, and only those. `settings.json` and `localStorage` are out of scope.
    - **F7:** the core-purity check is added (S1b).
    - **F13, F14:** `STYLE.md` §1 amended — shadows are allowed on floating elements (toast,
      menus, map tooltip), not docked panels; severity left rules are allowed on rows, not cards.
    - **F16:** stored portrait SVGs are user assets and are never used as a craft's silhouette
      (`docs/CLAUDE.md`).
    - **F8, F9, F11, F12, F15** move to session H1 (§2), after S1d.
    - The snapshot API takes a cause and a list of ids, for S1c (doc 11 §1.7); `ImportDialog`
      gets a smoke test. Import keeps its snapshot but only of files it could overwrite (the
      derived index is left out), so an import onto no existing file takes none.
    - **View-never-writes exception (doc 11 §1.6):** a map drag or L-point park writing
      `map_angle_deg`, `lagrange_of`, `lagrange` or `orbit_km`.
    - **Distance unit:** becomes a per-install preference (Settings + the map's quick switch),
      **deferred to S3**. Until then it stays `saveConfig({ distanceUnit })` from the map, and the
      guard exempts it by name.

### Open — owner decides (batch; never guessed by Code)

- v1 orbital-configuration set and per-system showcase list — C2 proposes.
- F17 (audit): the paced boot-log replay is not one of the three permitted animations — add it
  to `STYLE.md` / the doc 11 motion tiers, or cut it.
- Standing: `_tables/RECONCILIATION.md` conflicts; `max_gimbal_deg`; planet-map storage
  format (R4); any doc 10 items to cut.

## 6. Budget and billing

Verified 2026-09-29 against Anthropic docs (links in the C0 transcript):
- Cloud Code sessions **share rate limits with all other Claude and Claude Code usage** on the
  account; parallel tasks consume proportionately more. No separate charge for the cloud VM.
- Fable 5.1: on Max (and premium Team/Enterprise seats) it counts against the plan, up to 50%
  of the weekly limit, then usage credits; on Pro / standard seats it runs on usage credits
  from the first token. Usage credits bill at API rates ($10 / $50 per Mtok in/out for Fable
  5.1). Set a monthly spend cap in Settings → Usage before any Fable session.

Fable ledger (target: 3 sessions, ≤ $100):

| # | Session | Estimate | Actual | Notes |
|---|---|---|---|---|
| 1 | S1 foundations | $25–35 | not used — Pro plan | audit readers on Sonnet @ low |
| 2 | R4 planet editor core | $35–45 | | after doc 13; Opus unless owner buys credits |
| 3 | Reserve | ~$25 | | stuck bug, or S5a escalation |

## 7. Environment

Filled in by S0 (2026-09-29, cloud container, Node 22.22.2, Claude Code 2.1.284):

| Command | Result | Wall time | Notes |
|---|---|---|---|
| `npm ci` | pass | 6 s | |
| `npm run typecheck` | pass | 8 s | |
| `npm test` | pass | 13 s | 649 tests, 11.7 s in vitest |
| `npm run build` | pass | 10 s | chunk-size warning only |
| `npx vite preview` (background) | pass | — | serves `http://localhost:4173/` |
| `node scripts/ui-smoke.mjs` | pass | 5 s | one console 404 (missing resource, not a page error) |
| `node scripts/ui-smoke-hull.mjs` | pass | 10 s | 11 classes; no page errors |
| `cargo test` (src-tauri) | **unavailable** | — | build fails: needs system GTK (`gdk-3.0.pc`); expected in cloud, not fixed |

- **Smoke browser:** Playwright wants `chromium-1243`, which is not installed. Working value:
  `SMOKE_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  (`/opt/pw-browsers/chromium` is a directory, not the executable).
- **Fable 5.1 in `/model`:** not verified — `/model` is interactive and could not be run from a
  cloud session. The owner should check in the app before S1.
- **Known gaps:** no Tauri/Rust build in the cloud (Local Code only); the other smoke scripts
  (`-map*`, `-ship`, `-screens`, `-map-lod`, `-log-boot`) were not run in S0.
