# SystemMap

The orbital schematic at working zoom: a window onto `map-void`, flanked by the navigation rail and the inspector.

**Canvas.** The map sits on `map-void`, one step below the whole surface ramp, so it reads as a viewport rather than a panel. Range rings and the graticule are `map-grid`; orbits are `map-orbit` at 1px, dashed where the orbit is a belt's mean radius rather than a body's. The habitable band is a wide `map-zone` stroke and the frost line a dashed one, each with a `data-xs` label in `ink-300` — the band is never the only cue. Belts and Trojan camps are `map-belt` at low opacity.

**Bodies are rendered glyphs, not art and not ASCII.** A body is a filled disc in a single flat tint drawn from its own record, at a size that does not scale with the orbit; a ringed body adds one ellipse stroke; a moon system draws a small `map-orbit` ring around its parent. Body tints are record data rather than tokens, and they are the only colours in Gallery that do not come from the palette — keep them desaturated enough to sit under `ink-100` labels.

**Labels.** A named body takes `title-sm` in `ink-100` with its classification beneath in `data-xs` on `ink-300`; a minor body or station takes one `data-xs` line in `ink-200`. Stations are 9px `glyph-navy` squares. Drop labels before dropping marks when the view crowds.

**Selection** is the screen's only accent: a 12% `accent-500` halo, a `border-2` `accent-500` frame, a dashed `accent-500` bracket, and a `accent-600` leader line to the object's name in `accent-300`. One object is selected at a time and it drives the inspector.

**Inspector** is `inspector-w` wide: the selected object's name on an `accent-700` header, then groups for orbit, facility and the schematic's own parameters, then overlay checkboxes. Distances are shown in the unit the toolbar's segmented switch is set to — light-time, AU or km — and the switch changes every figure on the screen at once.

**Chrome.** The toolbar carries the map name in `title-sm`, the body count and span in `data-sm`, the unit and render-mode switches, and the add commands pushed right. A zoom readout sits bottom-left and a scale bar bottom-right, both `data-sm` on `ink-300`.

**Do.** Keep the schematic legible at 0.5× by mapping radius logarithmically and holding body size constant.

**Do not.** Do not texture a body, do not draw a starfield, and do not use `accent-500` for anything but the selection.
