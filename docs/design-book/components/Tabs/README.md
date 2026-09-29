# Tabs

Three flat, square tab forms. None of them rounds, and none of them floats.

**Primary bar** is the workbench's top-level switch at `control-lg`. The active tab takes an `accent-700` ground, an `accent-300` label and a `border-3` `accent-500` rule along its bottom edge — that rule is the only thing in the bar that reads at a glance. Hover raises the ground to `surface-300`; a disabled section takes `opacity-disabled` and stays in place rather than disappearing.

**Panel tabs** sit on a panel's header at `control-md`, ground `surface-300`. The active tab inverts to the panel ground `surface-200` with a `border-2` `accent-500` rule along its top edge, so the tab visibly belongs to the body beneath it. Put a count after the label in `data-sm`: `ink-300` for a neutral count, `status-amber` or `status-red` when the count is of things needing attention.

**Segmented switch** is for mutually exclusive display modes — units, projections, zoom behaviours. The selected segment fills `accent-500` with an `on-accent` label. Keep it to four segments; beyond that use a select.

**Do.** Provide the labels and the counts. Keep each bar to one line and never wrap it. Give the active tab a visible state in colour *and* in a rule, so the bar survives a monochrome screenshot.

**Do not.** Do not nest a primary bar inside a panel, do not use a segmented switch for an action, and do not show a tab whose panel holds nothing — show it disabled with a zero count instead.
