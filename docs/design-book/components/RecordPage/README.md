# RecordPage

The page a typed record is read on: navigation rail, classification banners, a document header with the badge block, nested field groups, and a backlinks column.

**Frame.** A 34px application bar on `surface-300` carries the wordmark, the breadcrumb in `data-sm`, the search field and no more than two commands. The `rail-w` navigation rail on `surface-200` lists record kinds with a `glyph-navy` kind glyph, the name in `label-md` and the count in `data-sm` on `ink-300`; the current kind takes the `accent-700` wash and a `border-3` `accent-500` left rule. The document between the banners scrolls; the rail, the bars and the banners do not.

**Header.** `title-lg` record name, `title-md` subtitle in `ink-200`, `radius-pill` tag chips beneath, and the badge block flush right. Survey completeness lives in the badge as a percentage, not as a bar.

**Fields.** Group by subject inside the CHARACTERISTICS panel, one group per box on `surface-300`. Each row is a `label-sm` label at a fixed 172px against a `data-md` value, rows separated by `line-100`, units in `ink-300` after the figure. A group holding withheld values states the count in `stamp` on `status-amber` in its header, and each withheld row shows a redaction bar at the value's natural width. A prose field is the exception: `body` on `ink-200`, no label column.

**Side column.** `inspector-w` wide, three panels: backlinks (kind glyph, name, kind in `ink-300`, sorted by kind then name), handling (originator, declassify-on, derived-from), and revisions (date in `data-xs`, change in `data-sm`, newest first).

**Footer** repeats the record code, kind, backlink count and pending-field count in `data-sm`, with the node and timestamp pushed right.

**Do.** Keep the same field order across every record of a kind, showing an unknown as an em dash and a withheld value as a bar, so two records of a kind can be read side by side.

**Do not.** Do not collapse an empty group out of the page, do not put the classification in the header (it belongs in the banner), and do not let the document width exceed the space between the rail and the side column.
