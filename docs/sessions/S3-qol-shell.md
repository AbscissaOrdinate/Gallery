# S3 — QoL shell, tag pages, transclusion, motion, ASCII (two sessions: S3a · S3b)

**Spec:** `gallery/11-qol-foundations.md` §2.12–2.13, §3 (feature table + §3.1 keymap), §4
(motion + ASCII) and the §5 "S3" table — its PR rows, files and acceptance **govern**.
**Needs:** S2 merged (S3.4 transclusion walks the S2 AST; the palette lists wiki commands).
**Smoke browser:** ROADMAP §7.

| Session | Doc 11 PRs | Model @ effort | Branch |
|---|---|---|---|
| S3a | S3.1 keymap + command registry + switcher + palette + shortcut sheet + forward + Ctrl+S + `/` · S3.2 save indicator, duplicate, recent, pinned, copy link, undo-hint toasts, F2 · S3.3 multi-select + bulk tag/delete, tag pages, TAGS tool | Sonnet 5.5 @ high | `feat/qol-shell` |
| S3b | S3.4 transclusion · S3.5 find in page · S3.6 motion tokens + tiers + Settings DISPLAY + `STYLE.md`/`CLAUDE.md` edits · S3.7 ASCII set + `WorkPanel` + progress reporters | Sonnet 5.5 @ high | `feat/qol-shell-2` |

## Every session

1. Read `docs/ROADMAP.md`, this brief, the doc 11 sections above, `docs/STYLE.md`, and
   `docs/sessions/S3-handoff.md` if it exists.
2. Branch from current `main`; one PR per doc 11 row, in order.
3. Checks: typecheck, tests, view-never-writes guard, and the smoke scripts doc 11 §5 names
   (widen `ui-smoke-screens.mjs`; `ui-smoke-log-boot.mjs` under FULL and OFF motion).
4. Review subagent: Opus 5.5 @ medium.
5. End: update `docs/sessions/S3-handoff.md` and the ROADMAP §2 row; open the PR; stop.

## Session-specific notes

- **S3a:** `src/ui/keys.ts` is generated from the §3.1 table and the shortcut sheet renders
  from it (test compares). Every bulk op is one history transaction; bulk delete and any
  transaction of ≥ 10 records snapshot first. Pinned = vault config (exempt from undo),
  recent = per install.
- **S3b:** S3.6 inserts doc 11 §4.1's `STYLE.md` §10 "Motion" text **verbatim** and makes the
  §1 edit; the motion preference is per install, never vault data; `prefers-reduced-motion`
  is read only in `motion.ts`. S3.7's resonance loop acceptance (24 frames; inner at its
  start angle on frames 0 and 12, outer only on 0) is a core test in `tests/ascii-orbits.test.ts`.
  Everything animated goes static under Reduced/Off.
