# Input

A 26px inset field on `surface-400` holding a value in mono, with its label above it in `label-sm` on `ink-200`.

Provide the label, the value and, for a measured quantity, the unit. Values are `data-md`; push the unit to the right edge of the field in `ink-300` so a column of numbers stays aligned on its digits. Placeholder text is `ink-300` and states the expected format (`YYYY-MM-DD`), never an example value a reader might mistake for real data.

**States.** Rest is a `line-200` border. Hover raises it to `line-300`. Focus adds the `border-2` `focus` ring at `space-1` offset and shows a 1px caret in `accent-300`. Invalid takes a `status-red-mark` border and a `status-red-wash` ground, with the reason beneath the field in `data-sm` on `status-red`, beginning with the word `VIOLATION`. Disabled takes `opacity-disabled` and keeps its value visible — a locked registry number is still a fact.

**Select** is the same field with a `▾` in `ink-200` at the right edge. **Checkbox** is a 13px square that fills with `accent-500` and carries a `✕` in `on-accent` when set; there is no indeterminate state.

**Do.** Right-align numeric fields inside a column. Keep the label visible even when the value is withheld — use a redaction bar for the value rather than removing the row.

**Do not.** Do not round a field, do not float a label inside it, and do not use colour alone to mark an error; the word `VIOLATION` carries it.
