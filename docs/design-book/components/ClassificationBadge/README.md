# ClassificationBadge

The ACS-style block in a record header giving the handling facts a reader needs before reading the record.

Provide two to five rows, each a `label-xs` key in `ink-300` on the left and a `stamp` value right-aligned. Clearance is always first. Disruption class and risk class follow, coloured by severity — `status-green` for nominal, `status-amber` for caution, `status-red` for critical — and each value is a word, so the block survives without colour. Separate rows with a `line-100` hairline.

The block sits on `surface-300` with a `line-200` border and `radius-2`. It is the **only** rounded element in the interface; that is deliberate, and nothing else may take `radius-2`.

Place it flush right in the record header, beside the `title-lg` record name and its `title-md` subtitle. Tag chips belong under the title in `radius-pill`, never inside the badge.

**Do.** Keep the value vocabulary closed and short enough to stay on one line. Repeat the same rows on every record of a type, showing an unknown as `—` rather than dropping the row.

**Do not.** Do not use the badge for the classification marking — that is the banner's job. Do not add a sixth row; if the record needs more handling facts, they belong in a field group.
