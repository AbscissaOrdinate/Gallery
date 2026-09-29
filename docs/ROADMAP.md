# Gallery — Roadmap and session plan

Owner: vault owner (Sean). Coordinator: Cowork PM session. Last revised 2026-09-29.

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
| S0 | Prep: docs drop, renames, doc 10 reconciliation, routing section, cloud env check | Cloud Code | Sonnet 5.5 @ medium | `chore/s0-prep` | drop uploaded | `sessions/S0-prep.md` | done (PR: [#10](https://github.com/AbscissaOrdinate/Gallery/pull/10)) |
| C1 | Spec doc 11 — undo, wiki link layer, QoL shell, motion + ASCII | Cowork | Opus 5.5 @ high | — | — | `sessions/C1-spec-qol.md` | ready |
| C2 | Research + spec doc 12 — star types, orbital configurations, five starter systems | Cowork | Opus 5.5 @ high + web | — | — | `sessions/C2-spec-presets.md` | ready |
| S1 | Foundations — audit, snapshots, view-never-writes guard, undo/history layer | Cloud Code | **Fable 5.1** (#1) | `feat/foundations` | S0, C1 | `sessions/S1-foundations.md` | blocked on C1 |
| S2 | Wiki core — `[[links]]`, index, autocomplete, redlinks, rename rewrite, hover preview (pulls RecordCard + redaction + classification header from 10a) | Cloud Code | Opus 5.5 @ high | `feat/wiki` | S1 | to write after C1 | — |
| S3 | QoL shell — palette, switcher, shortcuts, duplicate, recent/pinned, bulk tag, save indicator, tag pages, transclusion; motion tiers + Settings toggle; ASCII set | Cloud Code | Sonnet 5.5 @ high | `feat/qol-shell` | S2 | to write after C1 | — |
| S4 | Star types — evolutionary-stage/luminosity-class override + presets. **Routing A/B** (§3.4) | Cloud Code | Sonnet @ medium vs Opus @ medium | `feat/star-types` | S1, C2 | to write after C2 | — |
| S5a | Orbital configurations — co-orbital, barycentric pairs, rosettes, resonance chains, … (v1 set from doc 12) | Cloud Code | Opus 5.5 @ high (Fable reserve if stuck) | `feat/orbital-configs` | S4 | to write after C2 | — |
| S5b | Starter systems as recipes — Sol, α Cen, Barnard's, Sirius, ε Eri | Cloud Code | Sonnet 5.5 @ medium; Cowork reviews data | `feat/starter-systems` | S5a | to write after C2 | — |
| R2 | Doc 10: rest of 10a → 10b (strip; starter systems are fixtures) → 10c → trimmed 10d/10e | Cloud Code | Sonnet @ high; Opus @ high for 10b | `feat/record-views-*` | S5b | later | — |
| R3 | Design suite: shell extraction → ship editor 2b → doc 09 §3.5 gaps → Editor 3 | Cloud Code | Opus 5.5 @ medium/high | `feat/design-suite-*` | R2 | later | — |
| R4 | Doc 13 planet editor spec (Cowork) → core build | Cowork → Cloud Code | Opus @ high → **Fable 5.1** (#2) | `feat/planet-editor` | R3 | later | — |

Branch rule: every session branches from current `main`; one PR per checkpoint; merge
before the next session starts.

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
| ≥ 16, or blast radius **and** reversibility both 3 | Fable 5.1 candidate — owner approves against the ledger (§6) |

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
| S2 wiki core | 3/2/1/2/3/2 | 13 | Opus @ high |
| S3 QoL shell | 2/1/1/3/1/2 | 10 | Sonnet @ high |
| S4 star types | 1/1/3/1/2/1 | 9 | A/B |
| S5a orbital configs | 2/3/3/3/1/3 | 15 | Opus @ high |
| S5b starter systems | 1/1/2/1/1/2 | 8 | Sonnet @ medium |
| R4 planet editor core | 3/3/3/3/2/3 | 17 | Fable |

## 4. Check plan (every PR)

- `npm run typecheck` and `npm test` clean (vitest is core-only; it does not cover UI).
- Headless-Chromium smoke for every touched surface; **widen the smoke against current code
  before** any UI refactor. Pure extractions: identical screenshots.
- Schema touched → version bump + `.v<N>.json` backup + migration round-trip test.
- Any migration or bulk write runs only after a snapshot exists (from S1 on).
- From S1 on: the view-never-writes test passes (only `map_angle_deg` on drag may write).
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

### Open — owner decides (batch; never guessed by Code)

- Wiki link storage form (`[[Name]]` vs `[[id|Name]]`) — C1 proposes.
- v1 orbital-configuration set and per-system showcase list — C2 proposes.
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
| 1 | S1 foundations | $25–35 | | audit readers on Sonnet @ low |
| 2 | R4 planet editor core | $35–45 | | after doc 13 |
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
