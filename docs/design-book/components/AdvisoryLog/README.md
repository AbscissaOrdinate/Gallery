# AdvisoryLog

The session stream: every advisory and event the workbench raised, in time order, with a detail pane.

**Columns are fixed and never reorder**: timestamp in `data-sm` on `ink-300` to the millisecond, severity in `stamp` in its status colour, source in `data-sm` on `glyph-navy`, code in `data-sm` on `ink-300`, message in `data-md` on `ink-100`, elapsed right-aligned in `data-sm`. A message that does not fit is truncated — wrapping is off by default, because a log is read down the left edge.

**The stream sits on `surface-sunk`**, a step below the panel ramp, so it reads as a trough. Lines carry their `-wash` ground and a `border-3` left rule; an INFO line takes no wash and a `line-200` rule, which is what lets the coloured lines carry the eye. Rows are `control-sm` and separated by `line-100`. A session boundary is a `surface-200` strip in `label-xs` naming date, session and operator.

**This is the one place ordered by time.** The advisory list in an editor groups by severity; the log never does. Filtering is by severity toggle, and a toggled-off severity dims to `opacity-disabled` in the filter bar with its count still visible, so a reader always knows what is being hidden. The query field takes a typed filter (`source:hull severity:>=caution since:06:00`) in `data-sm`.

**Selection** is a `border-2` `accent-500` outline drawn inside the row, not a wash — the row's severity wash must survive selection. The detail pane at 420px gives the raised time, source, subject, affected components, state and history, then the message and remedy in `body`, then an `code` evaluation trace using the tree glyphs.

**Footer** carries the session, line count, open counts by severity, the follow state with its spinner, and the node and clock pushed right.

**Do.** Keep `FOLLOWING TAIL` visible whenever the view is pinned to the newest line, and break the pin the moment the reader scrolls.

**Do not.** Do not collapse repeated lines into a count — a log that hides repetition hides the pattern. Do not colour a line by source, and do not let a severity filter remove lines silently.
