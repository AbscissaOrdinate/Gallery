# AsciiIndicators

Progress, capacity, waiting and hierarchy, all drawn in monospace characters in `ascii`. There is no graphical progress bar and no graphical spinner in Gallery.

**Determinate progress** is `[` then ten cells of `#` and `-` then `]`, with the percentage right-aligned after it in `data-sm`. Colour the bar and the figure together by severity — `status-green` at or above target, `status-amber` when marginal, `status-red` when it fails a limit, `ink-300` and an em dash when nothing has been measured. Ten cells always, regardless of the value's precision.

**Discrete meters** use `▮` for a filled unit and `▯` for an empty one, one glyph per real thing — a VLS cell, a hardpoint, a damage-control team — followed by `n / total` in `ink-300`. Use these wherever the count is small enough to draw; above sixteen units, switch to a determinate bar.

**Spinner** is `|`, `/`, `—`, `\` in `accent-300` at 120 ms a frame, with a label beside it in `data-sm` on `ink-200`. An indeterminate bar is a three-cell `■` block travelling inside the same ten-cell frame. Nothing else in the interface animates.

**Tree and continuation** use `├─`, `│`, `└─` for structure and `»` before a count or an elision, all in `code` on `ink-200` with the values in `ink-100`.

**Do.** Keep every bar the same cell count so a column of them scans as a chart. Set the label in sans and everything measured in mono.

**Do not.** Do not colour the frame brackets, do not vary the cell count to suggest scale, and do not spin anything while a determinate figure is available.
