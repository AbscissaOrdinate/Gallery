# SystemMapFarZoom

The same chart past the zoom threshold. Rendered bodies, station squares and fleet marks are replaced by affiliation-framed tactical symbols, and the left pane becomes the order of battle.

**What collapses.** Below roughly 0.2×, every object drops its rendered form and takes its `TacticalSymbols` frame at a fixed on-screen size — symbols do not scale with zoom, which is what makes the far view readable. Individual hulls merge into their task force: the frame gains an echelon mark above it (`III` for a task force) and its hull count and anchorage below, both `data-xs`. Moons, minor bodies and berthed hulls are dropped entirely and counted in the order of battle instead.

**Labels are minimal by rule.** One `data-xs` line per symbol, two only for a group that needs its strength shown. Hostile and unknown labels take their status text colour; everything else is `ink-200` or `ink-300`. When symbols collide, drop labels before dropping symbols, and never draw a leader line except for the selected object.

**Threat envelopes** are the affiliation colour at 16% behind the symbol, sized to the object's real engagement or sensor radius. Tracks are dashed `map-orbit` arcs. Orbits thin to plain `map-orbit` rings and the habitable band, frost line and belts are hidden — they say nothing at this scale.

**Order of battle** replaces the navigation rail at `inspector-w`: a `surface-300` group header per formation with its name in 12px semibold, commander and anchorage beneath in `data-xs` on `ink-300`, then one row per hull with a severity pip. A destroyed or unresponsive hull greys to `ink-400` and keeps its row. The selected hull takes the `accent-700` wash and its symbol takes the bracket on the chart; selection is shared between the two panes in both directions.

**Do.** Keep the scale reference and the zoom readout visible, and show the affiliation key bottom-right whenever symbols are on screen.

**Do not.** Do not mix rendered bodies and symbols in one view — the transition is a threshold, not a blend. Do not scale symbols with zoom, and do not label a symbol with more than its name and strength.
