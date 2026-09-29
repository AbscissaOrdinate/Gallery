# RedactionBar

A `redact` bar with a `line-200` border, drawn over a value that the record does not yet hold.

Keep the field's `label-sm` label fully visible and bar only the value, at roughly the width the real value would occupy, so a reader can see how much is missing. On hover, reveal `DATA PENDING` in `stamp` on `ink-300` inside the bar; the bar itself stays. Do not reflow the row between states.

**A redaction means incomplete, not restricted.** It is the worldbuilder's own marker for a gap in their record. Access control is the classification banner's business, and a field the reader is not cleared for is simply absent from the record.

**Do.** Vary the bar widths within a group so the block reads as data rather than as a rule. Count barred fields in the record's completeness figure and surface that count on the record header.

**Do not.** Do not bar a whole group — if every field is empty, say so once in `stamp` and leave the labels bare. Do not use it as a loading skeleton; a pending fetch is a spinner, and this is a stated absence.
