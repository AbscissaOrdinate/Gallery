# StatusBadge

The four severities and the three shapes they take: a pip, a badge and a row.

The severities are **VIOLATION** in `status-red` (blocks the operation), **CAUTION** in `status-amber` (does not block), **NOMINAL** in `status-green`, and **PENDING** in `ink-300` for anything not yet evaluated. Every severity carries its word. Colour is a second channel, never the only one — a reader on a monochrome console must lose nothing.

**Pip** is an 8px square at `radius-1` in the `-mark` colour, `space-3` before its label. Use it inside dense rows and legends.

**Badge** is a `control-sm` box on `surface-300` with a `line-200` border, the severity word in `stamp` in the text colour, and an optional count after it. Use it in headers and tab labels.

**Row** takes the `-wash` ground and a `border-3` left rule in the `-mark` colour, with an identifier in `data-sm` on `ink-300`, the message in `data-md`, and the severity word pushed to the right edge in `stamp`. This is the only place `border-3` appears.

**Do.** Sort a list of rows by severity descending, then by identifier. Keep the message to one line and put detail behind selection.

**Do not.** Do not invent a fifth severity, do not use `accent-500` as a severity (orange is attention, not state), and do not show a bare coloured dot with no word.
