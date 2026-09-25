# HullEditor

Three panes and a budget bar. The catalog on the left, the profile canvas in the middle, the inspector and advisories on the right, and the hull's budgets across the bottom.

**Catalog** is 340px: a filter field, then collapsible groups on `surface-300` with a fitted count in `data-sm`. Each module row carries a 14px `glyph-navy-wash` tile with its class letter, the name in `data-md`, and its footprint pushed right in `data-sm` on `ink-300`. A module the current hull cannot take shows in `status-red` with the reason in place of the footprint, and stays in the list rather than being filtered out. The selected row takes the `accent-700` wash and the `accent-500` left rule.

**Canvas** sits on `map-void`. Draw the hull envelope in `surface-200` with a `line-300` outline, armour bands as a `map-grid` hatch, station frames as `line-100` verticals, and the centreline as a chain-dashed `map-orbit` rule. A fitted module is a `glyph-navy-wash` box with a `glyph-navy` border and a `data-md` label; a module with an open caution takes the `status-amber-wash` and `status-amber-mark` border; an empty bay is a dashed `line-200` outline labelled in `ink-400`. Selection is the `accent-700` fill, a `border-2` `accent-500` frame, a dashed bracket and an `accent-600` dimension line showing the station span.

**Station ruler** runs under the canvas on `surface-sunk`: major ticks per even station in `map-orbit` with `data-xs` numbers in `ink-300`, minor ticks in `line-100`, and the selected module's span drawn as an `accent-500` bar with its station range beneath in `accent-300`. The ruler is how placement is read; the canvas never shows a coordinate label.

**Inspector** is 380px: an `accent-700` header naming the selection, then placement and performance groups, then the advisory list. A figure that violates a budget takes `status-red` inline.

**Advisories are grouped by severity, in fixed order** — violation, caution, nominal — with the per-severity counts in `stamp` in the group header. Each row takes its `-wash` ground and `border-3` left rule, carries an identifier in `data-sm`, a one-line message in `data-md`, and the affected components plus the remedy in `data-xs` on `ink-300` beneath. Never sort advisories by time here; time belongs in the log.

**Budget bar** is 56px, cells separated by `line-100` hairlines: totals in `data-xl` or `data-lg`, ratios as `ascii` bars coloured by severity, and the commit state pushed right in `stamp`. When any budget is violated the bar says so in words and `COMMIT` is blocked — the bar is the authority on whether the hull can be saved.

**Do.** Keep the three panes fixed and scroll only their bodies. Keep selection shared between catalog, canvas, ruler and inspector.

**Do not.** Do not hide a violated budget behind a tab, do not colour a module box by anything but its advisory state, and do not let the canvas draw anything the ruler cannot explain.
