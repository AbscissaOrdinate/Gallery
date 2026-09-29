# TacticalSymbols

The symbol set the orbital map collapses to at far zoom, and the glyph vocabulary the rest of the interface borrows from.

**Affiliation is the frame**, following MIL-STD-2525: friend is a rectangle in `glyph-navy`, hostile a diamond in `status-red-mark`, neutral a square in `status-green-mark`, unknown a quatrefoil in `status-amber-mark`. Shape carries the meaning and colour repeats it, so the map still reads when printed or when a viewer cannot separate the hues. Suspect is the friend or hostile frame dashed at `opacity-muted`. Draw frames at `border-2`, 30×20px for a rectangle at the map's base scale.

Note that neutral green here is the standard's affiliation green and has nothing to do with `status-green` as a severity — the two never appear in the same panel.

**Space objects** sit inside the frame when something owns them and bare when nothing does. A star is an asterisk in `ink-200`; a planet a filled disc in `ink-300`; a moon a small disc on a `map-orbit` ring; a station an anchor inside its frame; a fleet a hull mark inside its frame. A track is a dashed `map-orbit` arc ending in a pip in its affiliation colour. A belt is a stippled band in `map-belt`.

**Modifiers.** Echelon goes above the frame in `data-xs` on `ink-200` — `III` for a task force, a bare numeral for a hull count. The label goes below in `data-xs`, one line, never two. A threat envelope is the affiliation colour at 16% opacity behind the symbol. Nothing else attaches to a symbol.

**Selection** is a `border-2` `accent-500` bracket drawn clear of the frame, and it raises the inspector.

**Do.** Show at most one label per symbol at far zoom, and drop labels before dropping symbols when the view gets crowded.

**Do not.** Do not fill an affiliation frame, do not tint a frame with `accent-500` (that colour means selection, not a side), and do not invent a shape for a new affiliation — an unrecognised side is unknown.
