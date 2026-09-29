# S1 handoff

Updated at the end of every S1 session (S1a → S1d). Newest first.

## S1a — audit (Sonnet @ medium) — done, PR open

**Done**
- `docs/AUDIT.md`: exact write-path inventory, 19 findings, coverage map. Deviations and units
  readers were **not run** (listed under "Not audited" there).
- ROADMAP §2 split into S1a–d; §3.2, §6 updated for the Pro-plan Fable constraint; S1 brief
  header and split rule updated.
- Branch used: `claude/foundations-audit-roadmap-0og005` (the session's assigned branch), not
  `feat/foundations-audit`.

**Not done**
- No code changed (audit only). F1 and F2 are the two high findings; neither is fixed.

**Next step (S1b — snapshots + guard, Sonnet @ high)**
- Fix F1 (title `onBlur` dirties the record) so the guard test can pass; it is the one known
  view-time write.
- Snapshot service per doc 10 §7.7; wire it before `registry.seed` overwrites (F2), import,
  Skeleton regenerate, migration, bulk delete, restore.
- Guard test needs `.test.tsx` in the vitest include; add the core-purity check (F7).
- Widen the smoke write counter to `SystemMap` and `HullEditor` if they cannot mount in jsdom.

**Open questions for the owner**
- F2: is open-time seeding/schema overwrite "viewing" (must not write) or exempt-with-snapshot?
- F19: guard scope — vault writes only, or also `settings.json` / `localStorage`?
- F13, F14, F16, F17: STYLE.md exceptions (severity left-borders, floating-element shadows,
  demo hand-authored SVG, boot log replay).

**Constraints for S1c/S1d**
- F3: `RecordEditor` re-syncs `draft` from the loaded record when not dirty; undo must not race it.
- F4: map drag mutates `rec.fields` in place before saving — capture the pre-image first.
- F5: `SystemBuilder` does up to 6 saves + a CSV write per save; needs one transaction step.
