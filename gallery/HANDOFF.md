# Handoff — start here on the new machine

Paste the block below as the first message of the new session. Everything it refers to is in
this repo.

---

## The prompt

> I'm continuing work on Gallery, a file-first worldbuilding workbench (Tauri 2 + React 18 +
> TypeScript strict). Clone is at `<path>`, working branch `feat/design-suite`. The working
> vault is the OneDrive folder `Documents/Worldbuilding/Gallery Fleet Builder/gallery-vault`.
>
> **Read these first, in this order, before touching anything:**
>
> 1. `docs/CLAUDE.md` — conventions. `src/core/` stays React-free; nothing is ever blocked
>    from saving; no `eval`; reuse `src/theme.css`, no new colours.
> 2. `docs/UNITS.md` — **authoritative over every other doc.** §4 cells and crew basis,
>    §5 the two thermal arrays and open-cycle drives, §6 the module fields the ship budget
>    reads, §7 the watch bill, §8 round mass.
> 3. `gallery/08-deviations.md` — every place the implementation departs from the specs, and
>    why. Also the two known bugs listed below.
> 4. `gallery/09-ui-and-editor-2b.md` — **the plan you are executing.** Four strands, ordered.
> 5. `gallery/07-editor-suit-spec.md` §2 and §3 — the UI shell and the editor-1/editor-2
>    boundary the plan is measured against.
>
> **Binding rules from the vault owner, which override convenience:**
>
> - Do not invent physical figures. If a figure you need is missing, **stop and ask**. Several
>   tables are deliberately unfilled — `reference_targets.yaml` especially — and must stay so.
> - Any value read from a table row marked `provisional: true` must render with a visible
>   marker wherever it reaches the UI, including inside values derived from it.
> - Core logic stays pure and framework-free in `src/core/`.
> - If a checkpoint outgrows one comfortable pass, **split it and say where you split**,
>   rather than thinning the tests.
> - `npm run typecheck` and `npm test` must both be clean before any commit.
>
> **Start with `gallery/09` §4 step 1** — the label fix and the armour-zone inspector branch.
> Both are small, self-contained and immediately visible, and the label bug is the one the
> vault owner actually hit. Then work down §4.
>
> Before you begin, confirm you can read `docs/refs/Weapons/` (12 PNGs: side and top views of
> bandit, beam, CIWS, laser, plasma, rocket) and `docs/refs/SolarSystem_Fleet_Deployment.png`.
> Say so immediately if you cannot.

---

## Where things stand (2026-09-21)

**Done and pushed** on `feat/design-suite`:

- **Editor 1** — hull geometry contract, three-pane hull editor, style kits, parts,
  conformance panel, presets, migration.
- **Editor 2a** — the whole ship kernel in `src/core/designer/ship/`: budget, advisories,
  operating modes, munitions, silhouette. Craft schema v2 (`fittings` / `manifest` / `tanks`
  / `modes`), module schema v3.
- **The 2026-09-20/21 rulings** — the watch bill (on watch is two thirds of the complement),
  round mass from four calibre anchors, tank collars, attitude control, radiators drawn to
  what they reject, open-cycle drives excluded from rejection.

**449 vitest tests, typecheck and build clean, hull and ship smoke green.**

**Not done** — this is the plan in `gallery/09`:

1. Label fix and armour-zone inspector branch (both bugs below).
2. Glyphs: six weapon redraws, per-family growth, radiator aspect, plan views for beam
   mounts, spinal fallback.
3. Eleven hull-class presets.
4. Shared shell extraction.
5. The ship editor UI — **there is none today**; a craft is a generic form plus a budget card.
6. Doc 07 §2 gap closure.

## The two bugs, precisely

**Hull-canvas labels are 2.2–3 CSS pixels at every zoom level.**
`src/ui/hull/HullCanvas.tsx:325` is `fontSize={scale(el.size ?? 11)}`. `scale(n) = n / perMetre`
converts *screen pixels → scene metres*, but `src/core/designer/hull/render.ts` authors
`el.size` in **metres** (section 3, slot 2.2, CG 2.5, ruler tick 2.2). The round trip cancels,
so zooming in grows everything and shrinks the font by exactly the same factor. The same scene
through `toSvg()` renders at 12–18 px and is legible — the export path and the screen path
disagree about the unit, and `HullCanvas`'s `?? 11` against `toSvg`'s `?? 3` is the fingerprint.
**Fix both consumers in one change**, or the export regresses the other way.

**Clicking an armour belt blanks the hull inspector.**
`HullCanvas.tsx:25` and `:346` make zones pickable as `kind: "zone"`; `Inspector`
(`HullEditor.tsx:309-395`) has no `zone` branch, so it falls through to the appendage lookup
at `:377` and returns `null`. Armour is the only thing doc 07 §3 lists as *owned by editor 1*
with no editor at all.

## What the tests do and do not protect

- The **449 vitest tests are core-only** — `vitest.config.ts` is `environment: node`,
  `include: ["tests/**/*.test.ts"]`. They will stay green through a total UI rewrite. They are
  not the safety net for any UI work.
- The real regression surface is the headless-Chromium scripts, run against a preview server:

  ```bash
  npm run build && npx vite preview     # then, in another shell:
  node scripts/ui-smoke-hull.mjs
  node scripts/ui-smoke-ship.mjs
  ```

  `ui-smoke-ship.mjs` drives `BudgetPanel` **inside the record editor**, not a ship editor —
  so keep `BudgetPanel` mounted on the craft record until a replacement check exists.
- `ui-smoke-hull.mjs` is selector-coupled to `.hullsvg .hullrail .hulladv .hullplate .hullpane
  .hullrow .hullside`, `[data-handle="station"]`, and the button names `Export SVG / Fit /
  Schematic / Sections / Slots / Scale / Beam`. Renaming CSS without updating it fails loudly.
- **Widen `ui-smoke-hull.mjs` against the current code before refactoring anything**, per
  `gallery/09`. Assertions written after a refactor only encode whatever the refactor did.
- `npx tsx scripts/hull-style-probe.mts out.html` renders the glyph swatch gallery. Not a
  test — a scratch tool, and the quickest way to check a glyph change against the references.

## Open questions for the vault owner

- The hull ladder in `gallery/09` §2 is anchored on the existing 138 m destroyer but is not a
  measurement. `gallery/09` records how to measure `docs/refs/SolarSystem_Fleet_Deployment.png`
  — including that the labels are the same blue as the silhouettes and must be filtered by
  band height.
- `max_gimbal_deg` is still unsupplied, so the thrust-line check reports the angle a design
  needs and asserts nothing.
- Magazine **stowage volume** is computed but not charged to a section, because which
  compartment holds the rounds is not in the record.

## Things that are deliberately not built

Listed in full at the end of `gallery/08-deviations.md`. The big ones: thermal shadow
(view-factor blocking and plume impingement), the four variant deltas, the fleet sheet, the
`vessel` and `fleet` types, and roll rate (structurally zero for radial thrusters).
