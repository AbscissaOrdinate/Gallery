Gallery is a naval intelligence and research terminal: a workbench where a worldbuilder reads and edits typed records the way an analyst reads a file. Build every screen as if it were rendered on a hardened console in a darkened compartment — dense, unlit, legible at a glance, and completely without ornament. If an element does not carry data, a state, or a boundary, do not draw it.

## Voice and content

Write labels as an operator would log them. Field labels are uppercase and terse — `HULL CLASS`, `DISPLACEMENT`, `LAST SURVEY` — in `label-sm`. Sentence-case is for prose only: advisory text, guidelines, help panels, all in `body`.

Never address the reader as "you" in chrome. A control says what it does (`MOUNT`, `REVERT`, `EXPORT SVG`), not what the reader wants. Empty states state the fact and the remedy in one line: "No survey on file. Attach a record to populate." Never apologise, never exclaim, never use an emoji anywhere in the interface.

Numbers always carry their unit, always in a `Data` style, always right-aligned in a column. Write unknown values as `—` in `ink-300`, not as `N/A` and not as a blank cell. Write a withheld value as a redaction bar, never as text.

## Colour

Set the application ground in `surface-100`. Raise in steps and never skip one: `surface-200` for an outer panel, `surface-300` for a group inside it or for a panel header, `surface-400` for a field inset or a hovered row. Put the map and any canvas on `map-void`, which sits below the whole surface ramp so a schematic reads as a window rather than a panel. Never use pure black and never use pure white.

Text is `ink-100` for values, `ink-200` for labels, `ink-300` for meta such as timestamps, units and counts. `ink-400` is for disabled text alone — it does not meet contrast and must never carry information a reader needs.

Spend `accent-500` sparingly: one active tab, one selected row, one primary action per screen. Its text is `on-accent` and never `ink-100`. Use `accent-300` when the accent must be text or an icon on a dark surface, `accent-700` as the wash behind a selected row, and `accent-600` as a rule or pressed-state border — never as a ground for text.

Status is three muted hues and always carries a word beside it. `status-red` means a violation that blocks, `status-amber` a caution that does not, `status-green` nominal. Use the `-mark` variants for bars, pips and tracks, and the `-wash` variants for the row behind an advisory. Colour alone never conveys severity: every severity is also a word and a glyph.

Glyphs and icons are `glyph-navy`, on `glyph-navy-wash` when they sit in a catalog tile. This is the same blue that means friendly on the map, which is deliberate — navy is the system's own colour, orange is the system's attention.

## Type

Two families, split by kind. Every value, code, timestamp, coordinate and log line is mono: `data-sm` in inspector rows, `data-md` in record fields and log bodies, `data-lg` for a headline figure, `data-xl` for the one or two totals on a screen. Every label, button, tab, heading and sentence of prose is sans: `label-sm` for uppercase field labels, `label-md` for control text, `body` for prose, `title-sm` for panel headers, `title-md` and `title-lg` in a record header.

Set `banner` on classification strips, `stamp` on badge fields and redaction placeholders, `ascii` on progress bars, spinners and terminal art, `code` on typed record paths. Reserve `display` for the boot screen and the cover; it never appears inside the workbench.

Uppercase is applied in the copy, not by a CSS transform, so that abbreviations stay readable and copy-paste keeps its case.

## Space, borders and elevation

Lay everything on the 4px grid. Panel padding is `space-5`, inner group padding `space-4`, the gap between field rows `space-3`, the gap between panes `space-6`, the document margin inside a record `space-8`.

Every box has a border and almost no box has a corner. Use `border-1` in `line-200` on panels, groups, fields and controls; `line-100` for hairline rules inside a group; `line-300` for a hovered or focused boundary. `border-3` in a status mark is the left severity rule on a log line or advisory row, and appears nowhere else. Radius is `radius-0` everywhere except the classification badge block, which takes `radius-2`, and record tag chips, which take `radius-pill`.

Depth is a surface step plus a border. Reach for `shadow` only when something genuinely floats over the canvas — `elev-2` for a dropdown or map tooltip, `elev-3` for a modal. Panels take `elev-0`.

Structure by nesting. An outer panel on `surface-200` contains groups on `surface-300`, each of which contains fields inset on `surface-400`. Three levels is the limit; a fourth means the panel should be split.

## States

Give every interactive element a visible border in `line-200` at rest, `line-300` on hover, and on focus a `border-2` ring in `focus` offset by `space-1`. The focus ring is solid, never dashed and never removed. A pressed control keeps its fill and takes an `accent-600` border. A disabled control takes `opacity-disabled` on the whole element, including its border and glyph, and does not change colour.

Selection is a `accent-700` wash with an `accent-500` left rule at `border-3`, and its label in `accent-300`. Never mark selection with colour alone in a list where rows also carry severity.

## Classification and the document layer

Every record page carries a classification banner at the top and the bottom, `banner-h` tall, in `banner` type, uppercase, in the ground for its level: `class-top-secret`, `class-secret`, `class-confidential` or `class-unclassified`. The line reads level, then caveats, then the record code, then the originating programme, separated by em dashes: `SECRET//SI//REL TO CMW — ONI-TECH-0412 — UJCN`. Both banners carry the same string. Text on `class-top-secret` is `on-accent`; on the other three it is `ink-100`.

Beside the record title, set a badge block on `surface-300` with `radius-2` giving clearance, disruption class and risk class as `label-xs` keys over `stamp` values. It is the only rounded element in the interface, which is how a reader finds it.

Redact an incomplete field, never hide it. Keep the label in `label-sm`, draw a `redact` bar with a `line-200` border across the full width the value would occupy, and reveal `DATA PENDING` in `stamp` on `ink-300` when the reader hovers it. A redaction means the record is incomplete, not that access is denied; do not use it to mark permissions.

## Symbols, ASCII and the map

Symbols in the interface are line glyphs in `glyph-navy`, drawn on the same 4px grid as everything else, never filled illustrations.

Progress, load and wait are ASCII and monospace: `[####------]` for a determinate bar, `▮▮▮▯▯▯` for a discrete count, a rotating `|/-\` for a spinner, `├─` and `»` for tree and continuation. Do not animate anything else, and never use a graphical spinner.

The orbital map draws on `map-void` with orbits and arcs in `map-orbit`, range rings and graticule in `map-grid`, the habitable band in `map-zone` and belts in `map-belt`. At normal zoom, bodies are simple rendered glyphs — a filled disc with a single flat tint and, where a body has them, a ring — not ASCII and not textured art. At far zoom, every object collapses to a tactical symbol on MIL-STD-2525 frames: friend is a rectangle in `glyph-navy`, hostile a diamond in `status-red-mark`, neutral a square in `status-green-mark`, unknown a quatrefoil in `status-amber-mark` — shape carries the affiliation and colour only repeats it — each with a one-line label in `data-xs` and nothing else. A selected object takes a `border-2` `accent-500` bracket and raises the inspector.

## Do not

Do not add a neon colour, a gradient, a glow, a drop shadow on a panel, or a rounded card with a coloured left edge. Do not animate a transition longer than a state change needs. Do not use an icon where a word fits in the same space. Do not let decoration occupy a pixel that could carry a value.

Reference screenshots under `assets/` are third-party material held for visual comparison only; they are not Gallery assets and nothing in them should be reproduced.
