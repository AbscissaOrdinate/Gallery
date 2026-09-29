# ClassificationBanner

A `banner-h` strip carrying a record's marking, repeated at the top and the bottom of every record page.

Provide the four parts of the string and join them with em dashes: level and caveats first in NATO/USN order (`SECRET//SI//REL TO CMW`), then the record code (`ONI-TECH-0412`), then the originating programme (`UJCN`). Set the whole line uppercase in `banner`, centred. The top and bottom banners always carry the identical string; if they can differ, the record is modelled wrong.

**Grounds.** `class-top-secret` for TOP SECRET and COSMIC, with its text in `on-accent`. `class-secret`, `class-confidential` and `class-unclassified` carry their text in `ink-100`. These are the only four; an unmarked record shows the UNCLASSIFIED banner rather than none.

**Placement.** The banner spans the full content width, flush to the document edges, with no border and no radius. The document body sits between the two, bordered left and right in `line-200`. Lay out long records so at least one banner is on screen at every scroll position.

**Do.** Keep the string on one line; truncate the caveat list with an ellipsis and reveal the full marking on hover rather than wrapping.

**Do not.** Do not put a banner on a panel, a dialog or a list — it marks a record, not a surface. Do not restyle the ground for emphasis, and do not use the banner as a page heading; the record title sits below it.
