# Button

A square, bordered control at one of three fixed heights, used for every command in the workbench.

Provide the label yourself, uppercase for a command that changes state (`MOUNT`, `COMMIT`, `PURGE`) and sentence case for navigation. Labels are `label-md`; at `control-sm` drop to 11px.

**Variants.** Default sits on `surface-300` with a `line-200` border and `ink-100` text — use it for everything. Primary fills with `accent-500` and sets its label in `on-accent`; exactly one primary appears in a pane, and it is the action that writes. Danger keeps the default ground and takes a `status-red-mark` border with `status-red` text, so a destructive command is legible as a warning before it is legible as a button.

**Sizes.** `control-md` (26px) is the default. `control-lg` (32px) is for a pane's single committing action and for the top-level tab bar. `control-sm` (22px) is for inline commands inside a dense table row.

**States.** Hover raises the border to `line-300` and the ground to `surface-400`. Pressed keeps the fill and takes an `accent-600` border. Focus adds a `border-2` ring in `focus`, offset by `space-1`, and is never suppressed. Disabled applies `opacity-disabled` to the whole element and changes no colour — a disabled danger button stays red so the reader knows what it would have done.

**Do.** Put adjacent buttons `space-2` apart and align a group flush with the panel's content edge. Give a command that cannot be undone a confirmation step rather than a louder colour.

**Do not.** Do not round a button — `radius-0` is the only correct value. Do not put an icon where the word fits. Do not use `accent-500` for a destructive action; orange means attention, red means consequence.
