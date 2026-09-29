# Gallery — 05 · Lessons from Caelum (external review, 2026-09-14)

Reviewed: `github.com/JudasBrennan/caelum_public` @ v3.10.0 (MPL-2.0). **Concepts only — no code, strings, prose, or data tables may be copied from it into Gallery.** See "Legal boundary" at the end.

## What Caelum is
A browser worldbuilding toolkit (vanilla-ish ESM + Three.js, esbuild-bundled, IndexedDB storage, single current world + backup library), also ported from WorldSmith 8.0. Scope is *deeper but narrower* than Gallery: stars → planetary system → planets/moons/comets/Oort/debris → local cluster → calendar/population/climate/system-fate, plus Lessons and a Science-and-Maths reference. It has **no** record/wiki layer, no polities or territories, no artificial infrastructure, no craft/module design, no file vault.

The public repo is **build output only** (143 minified chunks, no sourcemaps, no `src/`, no `package.json`); the development repo is private. Everything below was read off bundled strings, the README, and the shipped reports — behaviour is verified, internal implementation is inferred.

## Where Caelum is ahead of us, and what to do about it

Ranked by value-per-effort for Gallery.

**1. A science verification matrix as a build artifact.** They ship `reports/science-verification-matrix.{json,md,html}`, regenerated in the release gate and rendered in-app on a Validation page. 554 rows over 36 model areas; each row carries `family` (anchor / invariant / metamorphic-trend / boundary / cross-system / unit / formula-oracle / population / browser / release-gate), `status` (PASS/WARN/FAIL/**GAP**/BLOCKED), `confidence`, `calibrationTier` (strict / calibrated / exploratory), `sourceUrls`, `assumptions`, `limitations`, `downstreamConsumers`, and a recommended `action`. Known model weaknesses are first-class **GAP** rows ("independent calibration required before stronger physical claims"), not buried caveats.
→ *Gallery:* our 37 tests prove we reproduce the WorldSmith sheet; they say nothing about whether the sheet is right. Add `_reports/astro-verification.md` generated from the same fixtures, with GAP rows for the things we already know are wrong — e.g. the exosphere gas-retention rule (1500 K × T/287) that flags Titan's N₂. A GAP row with a source and an action is a better answer than a tooltip.

**2. Uniform provenance on every derived value.** `Auto / Guided / Manual` tri-state on model inputs; sparse overrides with per-field locks that survive reset/preset/import/export; outputs that distinguish **requested vs constrained vs rendered** with a short model reason; "unavailable" and "pressure-only caution" as explicit, degraded results rather than a confident number.
→ *Gallery:* we have ad-hoc `*_override` fields scattered through body v3. Normalise to one provenance chip per derived row (auto / seeded / locked-manual) plus confidence, and make the derived panel say *why* a value is missing.

**3. Progressive disclosure in dense panels.** Plain-language **Result Summary** first, then shared tabs with matching section names, then an **All** view for people who want the original long column. Tooltips follow a fixed overview / source / caveat structure from a written style guide.
→ *Gallery:* our body derived panel is one long column and will only grow. Tabs + summary-first, same tab names on every record type, "All" as an option.

**4. Map controls we simply don't have.** Decoupled **body scale** and **physical size scale** sliders, a logarithmic-scale toggle, **label leader lines**, Hill spheres, periapsis/apoapsis markers, Lagrange toggle, per-overlay checkboxes, reset-view, PNG **and GIF** export, and a continuous zoom from system view out to the local cluster.
→ *Gallery:* leader lines are already on our known-limits list — take their approach. The decoupled scale sliders matter more: our semantic zoom is currently the only lever, so a user who wants big glyphs on a wide system has no move. A system → cluster zoom tier is a natural extension of our log/sqrt/linear mapping.

**5. Seeded generation with preserve/reroll strategies.** Goal templates ("habitable single", "wide binary S-type homeworld", "gas-giant-rich outer system"), a guarantee flag for a temperate rocky world, preserve-selected-homeworld, and partial rerolls — *keep stars reroll planets*, *keep planets reroll moons*, *reroll names only* — plus draft diagnostics that say why a draft under-filled the requested body mix.
→ *Gallery:* our **Skeleton…** generator is all-or-nothing. Partial reroll + a stated failure reason is the whole difference between a toy and a tool.

**6. Slot editing semantics.** Drag-to-assign and drag-to-reassign parent, drop-zones for moons, **lock parent** with "unlock parent to move", manual-to-guided slot inference, and an explicit message that manual orbit mode disables slot dragging.
→ *Gallery:* we have drag-along-orbit and L-point snapping; add lock semantics and mode-conflict messaging before the map gets more editable.

**7. Destructive-action discipline.** Automatic restore points named for their cause ("Before import", "Before restore", "Before starter world"); a managed backup library separate from the current world; consequence-aware confirmations that state what will change; a recovery flow that clears only a broken current save; and a stated policy that **an old data path is never removed as cleanup** — decommissioning needs a product decision, a changelog entry, round-trip coverage, and a migration story.
→ *Gallery:* we write into the user's OneDrive-synced vault, so this is more load-bearing for us than for them. We have atomic writes and `.v<N>.json` schema backups; add a pre-import/pre-migration vault snapshot and round-trip tests per schema version bump.

**8. Architecture guardrails enforced as scripts, not conventions.** A declared import direction (engine independent → store/compat may use engine → UI may use store/engine → route shells on top) checked in CI; line-count budgets on route shells with named extraction seams; separate guardrails for legacy-compat boundaries and for accidental compat removal; bundle-size budgets.
→ *Gallery:* cheap and worth it now. Enforce that `src/core/**` never imports React, and set a line budget on `SystemMap.tsx` before it becomes the god file.

**9. Third-party provenance discipline.** `THIRD_PARTY_NOTICES.md` pins each borrowed dataset by upstream repo, revision hash, SHA-256 of the source bytes, retrieval date, the regeneration script, and an explicit statement of what the data does *not* validate.
→ *Gallery:* we ported WorldSmith 8.00 and OA EWoCS 0.9 formula-for-formula. Record version, retrieval date, a hash of the source workbook, and the port's scope limits the same way.

**10. Teaching surfaces.** A 20-lesson curriculum with embedded mini-calculators and a searchable Science-and-Maths page carrying the equations the app actually implements, with citations.
→ *Gallery:* cheap for us, because `worldsmith.ts` *is* the formula set — a "show the formula and source behind this number" link from each derived row gets most of the value without a curriculum.

## Where Gallery is ahead — don't regress chasing the above
The map is the **editor**, not a render. Records on disk in a plain vault (theirs is browser storage with JSON export). Cross-referenced wiki, tags, backlinks. Artificial infrastructure as first-class objects (stations, rings, skyhooks, cyclers, fleetyards) with proper Lagrange semantics. Political / economic / habitability / military display modes. Schema-driven types, so a new type is a file not a release. Neighbourhood-gated semantic zoom. Schematic ↔ true-scale toggle. Configurable units incl. light-time. Craft/module/hull design, which nothing else in this space does.

**Why their zoom fails for minor bodies** (inference, worth confirming before we copy anything): the System Poster is a fixed-layout Three.js render — radial mapping log or √, body radii compressed by a power law (~r^0.42) with min-scale floors and a "Not to scale" stamp — so small bodies bottom out at the floor and stay there. There is no neighbourhood-gap gating like ours, and editing lives in the form/slot list rather than on the canvas, so the render never had to survive being zoomed into. Our approach is the better one; take their *controls*, not their layout model.

## Legal boundary for agents working on Gallery
Caelum is MPL-2.0, which is file-level copyleft: any Caelum file we copied or derived from would stay MPL and would have to be published in source form once Gallery is distributed. Nothing usable is actually available — the public repo ships bundled output, not Source Code Form — and parts of it are not Caelum's to license (MIT and a noncommercial "Wolf License" dataset, plus attribution-required tables).

Therefore: read it for behaviour and ideas, which are not copyrightable, and reimplement independently. **Do not** vendor chunks, lift code, copy lesson or tooltip prose, or transcribe their curated tables, name lists, presets, or reference data.

---

# Addendum · Live app walkthrough (v3.10.0, Sol preset)

The Chrome extension wasn't reachable, so the deployed build was served locally and driven headless — same bundle as `thebrokenwheel.co.uk/caelum`, every route loaded with the Sol preset. Items below are additional to the ten above and were only visible in the running UI.

**A. The app surfaces its own dependency graph.** Every editor page opens with a `CONTROLS / AFFECTS / START WITH` triplet, plus a collapsible **"How this affects other pages"** ("topology, default host, and stellar context feed later workflows"). Local Cluster carries a **"Feeds the 3D Visualiser"** banner with a jump button. The formula reference lists **"RELATED APP PAGES"** per topic, and each editor ends with next-step buttons (Planetary System · Moons · Climate). Nothing is left for the user to infer.
→ *Gallery:* we have a real dependency graph and hide it — a body's `controller` feeds political display mode, `industry`/`garrison` feed economic and military modes, hull slots feed the budget panel, records feed `_exports/*.csv`. Surface it as an "affects" line per record type and a jump row.

**B. Persistent context strip on every editor.** A row of small labelled cards pinned above the form: `EDITING · Star A (Sol) · G2V | 1 Msol`, `TOPOLOGY · Single`, `DEFAULT HOST`, `CLASSIFICATION · Rocky world · high confidence — Surface model full`, and a `SOURCE: Authored inputs + solver` provenance banner. You always know what you are editing, in what frame, and where the current classification came from.

**C. Three authoring depths on one form:** `Quick / Guided / Advanced` (+ `Recipes` on planets) — archetype, goal-fitting, direct edit. Better than our presets-or-nothing.

**D. Output panel shape.** Plain-prose **Result Summary** first ("Sol is a G-type main-sequence star at 0.984 Lsol… Earth-like life is plausible…"), then KPI chips (FOCUS / TEMPERATE ZONE / LIFE SIGNAL), then **filter pills** — All · Key Numbers · Identity & Class · Lifecycle Timeline · Environment · Habitability · Derived Details. Pills, not tabs: cheaper to build than what I suggested in item 3 above, and it keeps the "All" long-column view for free.

**E. Input and output micro-patterns.** Every numeric input is slider + number box + unit chip + min/max endpoint labels + an `i` button. Every derived number carries a one-line qualifier beneath it ("Dwarf sequence estimate; no extinction or individual-star uncertainty model"). Our `x-distance` fields already show a unit equivalent — extend to the qualifier line.

**F. The System Poster is a 1-D distance strip, not a top-down map** — a side elevation with an AU ruler along the top, log/linear toggle, habitable-zone and frost-line bands, belts as shaded bands, starfield, per-overlay checkboxes (Labels · Moons · Habitable zone · Frost line · Debris disks · Orbital guides · Starfield · Multistar info), Export PNG, Fullscreen. This is the one genuinely novel *visual* idea in the app: an orbit ladder is far more legible than a top-down plot for spacing, and it never has the inner-system pile-up problem.
→ *Gallery:* add it as a third view mode beside Schematic and True scale. Cheap — it reuses `layout.ts`'s radius mapping on one axis — and it is the right thing to hand to a reader or paste into a document.

**G. Their top-down visualiser confirms the diagnosis.** At default zoom the inner system is an unreadable pile: Sol, Mercury, Venus, Earth, Mars, Ceres and Jupiter labels all overlapping at the centre, no leader lines, no collision handling. Our greedy label placement is already better — don't copy this. One thing worth taking: moons are deferred with an explicit **"4 moons · zoom in for detail"** label, so hidden content announces itself. We hide gated content silently.

**H. System Fate as a model for any analysis page.** Superlative cards (BEST CURRENT · LONGEST WINDOW · LARGEST RISK · ENDPOINT), a NOW / LATER / WATCH triage line, one confidence chip for the whole analysis, a `Definitions` tab, and a **Report** tab that emits copy-ready text.
→ *Gallery:* a copy-ready system or craft brief — for pasting into notes, Dynalist, or a document — is a small feature with a high payoff for the way this vault actually gets used.

**I. World state vs view state is stated in the UI:** "The current world snapshot supplies the data; viewing controls stay local." Worth adopting as a rule: zoom, display mode, and units are session or vault-config state and never touch records — `map_angle_deg` on drag is the deliberate exception.

**J. The Validation page is genuinely user-facing,** not a dev artifact: headline count cards, quick filters (Issues · Failures · Warnings · Gaps · Release gates · NASA anchors · User-visible · All rows), free-text search plus model-area/family/status/severity/source facets, 554 paginated rows with per-row Details, Standalone-HTML and Markdown exports — and the honesty line "Pass counts describe checks, not an accuracy percentage," echoed on the reference page by "Passing an implementation check does not establish independent physical accuracy."

**K. Unbuilt routes fail gracefully.** `#/hazards` renders "Coming soon — this section is not available in the current release" rather than a blank page or an error. Relevant to us: the planet surface editor and site maps will be visible-but-unbuilt for a while.

**L. Import/Export details worth copying:** a storage-health card, the current save's size shown in characters, "Start fresh, keep backups" as a distinct action from a full wipe, and an automatic pre-restore backup before any restore.

**Still absent live, so not a source of envy:** one world at a time, no records/wiki/tags, no territories or polities, no artificial infrastructure, no craft design, and no vault — the whole app is a single IndexedDB world with JSON export.
