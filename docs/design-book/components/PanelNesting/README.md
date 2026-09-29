# PanelNesting

The structural rule the whole interface is built from: an outer panel contains groups, and a group contains fields, each one step up the surface ramp.

Provide the panel header, the groups and the field rows. The panel is `surface-200` with a `line-200` border; its header strip is `surface-300` at `control-md`, holding a `title-sm` uppercase name on the left and a `data-sm` count in `ink-300` on the right. A group inside it is `surface-300` with its own `line-200` border and `space-4` padding, headed by a `label-sm` name in `ink-200`. A field value is inset on `surface-400` with a `line-200` border.

Separate field rows with a `line-100` hairline, never with space alone. Panel padding is `space-5`, the gap between groups `space-4`.

**Three levels is the limit.** Panel → group → field. A fourth level has nowhere to go on the ramp and will read as noise; when the content demands one, split the panel into two panes instead.

**Do.** Keep every box square and bordered. Let the border carry the boundary and the surface step carry the depth — set `elev-0` on all of it.

**Do not.** Do not skip a surface step (a group directly on `surface-100` looks broken), do not use shadow to separate panels, and do not create a borderless card.
