# S2 — Wiki core (three sessions: S2a · S2b · S2c)

**Spec:** `gallery/11-qol-foundations.md` §0, §2.1–2.11 and the §5 "S2" table — that table's
PR rows, files and acceptance **govern**; this brief only sequences them for the Pro plan.
**Needs:** S1 merged (history layer, snapshots, view-never-writes guard).
**Smoke browser:** ROADMAP §7 (`SMOKE_CHROME`).

| Session | Doc 11 PRs | Model @ effort | Branch |
|---|---|---|---|
| S2a | S2.1 — prose parser, wiki grammar, `norm`, resolution, link index, `mentions`, `fuzzy.ts`, repo index hooks | Opus 5.5 @ high | `feat/wiki-core` |
| S2b | S2.2 + S2.3 — `ProseField`, outliner inline render, link/redlink/ambiguous rendering, BACKLINKS LINKED/MENTIONED; `cardModel`, `ClassificationHeader`, `RecordCard`, hover | Sonnet 5.5 @ high | `feat/wiki-render` |
| S2c | S2.4 + S2.5 — autocomplete, redlink create dialog, REDLINKS tool, ambiguity chooser; rename impact + dialog + rewrite transaction | Opus 5.5 @ high | `feat/wiki-rename` |

Why this cut: S2a and S2c carry the two risky pieces (the tokenizer/index every later feature
walks, and the vault-wide rename rewrite); S2b is rendering over a finished model.

## Every session

1. Read `docs/ROADMAP.md`, this brief, doc 11 §0 and the sections above, `docs/AUDIT.md`,
   and the previous session's `docs/sessions/S2-handoff.md` if it exists.
2. Branch from current `main`; one PR per doc 11 row (S2b and S2c may each be two PRs or one
   PR with two commits — state which).
3. Anything doc 11 leaves open → stop and ask; never improvise grammar or storage form
   (owner ruling: both `[[Name]]` and `[[id|Name]]` resolve; Gallery writes `[[Name]]`).
4. Checks: `npm run typecheck`, `npm test`, the view-never-writes guard, the smoke scripts doc 11
   §5 names (`scripts/ui-smoke-wiki.mjs` is new in S2b; widen `ui-smoke-screens.mjs`).
5. Review subagent on the opposite model (Opus → Sonnet @ high; Sonnet → Opus @ medium).
6. End: update `docs/sessions/S2-handoff.md` (done / not done / next / open questions) and the
   ROADMAP §2 row; open the PR; stop.

## Session-specific notes

- **S2a:** `src/core/wiki/**` and `fuzzy.ts` are core — no React, no DOM. Index updates on
  save / delete / undo-apply must be incremental (spy test). Every AST wiki node carries source
  offsets; S2c's rewrite splices on them.
- **S2b:** `RecordCard`, `ClassificationHeader` and redaction are the **minimum** doc 11 §2.10
  defines; doc 10a later extends them, so keep their props additive. No new colours
  (`theme-tokens` test). Links render from the AST — never `innerHTML`.
- **S2c:** rename rewrite = snapshot first, then one history transaction; one Ctrl+Z restores
  every touched file byte-identical. "Keep old name as alias" defaults on. Test every row of
  doc 11 §2.2's rename table.
