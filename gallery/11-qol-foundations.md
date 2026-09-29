# Gallery — 11 · QoL foundations: undo, wiki links, QoL shell, motion + ASCII (2026-09-29)

Status: spec for Code. Consumers: **S1** (§1), **S2** (§2.1–2.11), **S3** (§2.12–2.13, §3, §4).
Written by C1 against `main` at `7dc5179`. Authority: `UNITS.md` → `CLAUDE.md` → `STYLE.md` →
this doc; `ROADMAP.md` §5 rulings are binding on it. A Code session implements its sections
cold; anything this doc does not settle is a **stop-and-ask**, never an improvisation.

## 0. Decisions

**Owner answers (2026-09-29)**

| Question | Answer |
|---|---|
| Wiki link storage form | **Both accepted, `[[Name]]` written.** The parser resolves `[[Name]]` and `[[id\|Name]]`; autocomplete and rewrites write `[[Name]]`. |
| How prose shows links | **Rendered when not editing**, click/Enter to edit in place; a small CommonMark **subset in core** (tokenizer → AST), no new dependency, never `innerHTML`. |
| Rename with inbound links | **Preview, then rewrite.** Dialog lists affected lines; REWRITE is the default; "keep old name as alias" checked by default; snapshot first; one undo step. |

**Taken by C1** (reasons inline in each section): history lives in `Repository`, not a command
bus (§1.1) · a step stores exact file text, so undo is byte-identical (§1.2) · the external-change
rule compares file text, no mtime or new Rust command (§1.5) · config, assets and CSV are exempt
from undo (§1.6) · every delete and every transaction over ≥ 10 records snapshots first (§1.7) ·
cross-type name clashes use a type prefix `[[hull:Sword]]` (§2.3) · external Markdown links copy
their URL instead of navigating (§2.6) · motion preference is per install, not vault data (§4.1) ·
pinned records are vault config, recent records per install (§3).

**Corrections to the C1 brief's "facts"** (re-checked in code): Ctrl/Cmd+K (focus rail search) and
Alt+← (back) already exist in `src/App.tsx` l.21–35 — S3 replaces them, it does not add them.
Vitest includes only `tests/**/*.test.ts`; jsdom UI tests need `.test.tsx` added to `include`
(S1 PR2 does this for the guard; if it has not, S1 PR3b does). Map drag mutates the live record
(`repo.typed()`) before `save`, so a step's *before* must come from `Repository.saved`, never
from `byId`. The map's L-point park writes `lagrange_of`/`lagrange`, not only `map_angle_deg`.

---

## 1. Undo / history layer (→ S1 PR 3a core, PR 3b UI)

### 1.1 Where it sits

**Inside `Repository`'s write API**, with the stack in a new framework-free `src/core/history.ts`.
Not a command bus.

| Option | For | Against | Verdict |
|---|---|---|---|
| History in the repository write path | Every existing caller (`save`/`delete`, 15 UI call sites) is covered with no rewrite; before-images already exist (`saved` map); one place to enforce the external-change rule | Steps are whole records, not semantic intents | **Chosen** |
| Command bus (every UI mutation a `do/undo` object) | Semantic labels, fine-grained | Rewrites every editor; drafts and autosave fight it; two sources of truth for a record | Rejected |

### 1.2 Step representation

Whole-record before/after **plus the exact file text** on each side. Finer diffs buy nothing:
records are small, the depth is capped, and text lets undo restore the file byte-for-byte
(including a migrated record's original on-disk shape, and its `updated`/`revisions`).

```ts
// src/core/history.ts — no React, no DOM
export interface FileSide { path: string; text: string; record: GalleryRecord } // text = bytes as last read/written
export interface Entry { id: string; before: FileSide | null; after: FileSide | null } // null = absent (create/delete)
export interface Step {
  seq: number; at: number;               // epoch ms
  label: string;                         // "EDIT MARS — fields: sma_au" · "DELETE SWORD" · "RENAME A → B (7 records)"
  origin?: string;                       // coalescing key: editor instance token (§1.3)
  entries: Entry[];                      // in write order; undo applies in reverse
  snapshot?: string;                     // snapshot id taken before the step (§1.7)
}
export class History {                   // pure; tests drive it without a repository
  readonly depth = 200;                  // oldest step dropped beyond this
  past: Step[]; future: Step[];
  push(step: Step, now: number): void;   // clears `future`; coalesces per §1.3; trims to depth
  peekUndo(): Step | undefined; peekRedo(): Step | undefined;
  commitUndo(): void; commitRedo(): void; // move the step between stacks once applied
  clear(): void; subscribe(fn: () => void): () => void; version: number;
}
```

The label comes from `describeChange` (`core/handling.ts` l.151), prefixed by a verb and the
record name upper-cased: `EDIT`, `CREATE`, `DELETE`, `RENAME`, `MOVE` (map drag / park), or the
transaction's own label.

### 1.3 What one step is

| Action | One step = | How |
|---|---|---|
| Typing in a record/hull form | one autosave burst (edits before a 900 ms pause) | `useRecordDraft` flush → `repo.save(r, {origin})` |
| Consecutive bursts on the same record | **coalesced** into the previous step when all hold: previous step is top of `past`, `future` empty, same `origin`, single entry for the same id, same `describeChange` parts, and `now − prev.at < 4000 ms` | `History.push` keeps the earlier `before`, takes the new `after` |
| Canvas drag, hull editor | exactly the drag | hull canvas calls `draft.checkpoint()` on pointer-down (flushes prior edits as their own step) and on pointer-up (flushes the drag) |
| Canvas drag, system map | exactly the drag or park | existing single `repo.save` on pointer-up, `origin: "map-drag"`, label `MOVE <NAME>` / `PARK <NAME> AT <L-POINT>`; never coalesced (origin gets a per-drag suffix) |
| Map settings panel (400 ms debounce) | one debounce burst, coalesced as above | `origin: "map-settings:<systemId>"` |
| Create (new-record menu, map ADD, duplicate, redlink create) | one step, `before: null` | plain `save` |
| Delete | one step, `after: null` | `repo.delete` (§1.7 snapshot) |
| Name change that moves the file | same step as the edit; the entry's `before.path ≠ after.path` | existing rename in `save` |
| Multi-record operation (skeleton generate, import, rename rewrite, bulk tag/delete, snapshot restore) | one step, many entries | `repo.transaction` (§1.4) |

### 1.4 Repository API changes

```ts
save(r, opts?: { touch?: boolean; history?: false; origin?: string; tx?: Tx }): Promise<LoadedRecord>
delete(id, opts?: { history?: false; tx?: Tx }): Promise<void>
transaction<T>(label: string, fn: (tx: Tx) => Promise<T>,
               opts?: { snapshot?: { cause: string; ids: string[] } }): Promise<T>
undo(): Promise<ApplyResult>;  redo(): Promise<ApplyResult>
readonly history: History
version(id: string): number    // bumps on every write or apply touching id; drafts reload on change
// ApplyResult = { ok: true; label } | { ok: false; label; refused: { path: string; reason: string }[] }
```

- `lastText: Map<id, {path, text}>`: filled by `load()` from the text it already reads, and by
  every write. It is the `before.text` of the next step. `saved` stays the `before.record`.
- `tx.save` / `tx.delete` append entries to the open transaction; one `Step` is pushed on
  success. Writes made outside `tx` during a transaction are separate steps (an editor's autosave
  never leaks into a transaction). Nested `transaction` calls are a programming error: throw.
- If `fn` throws after some writes, push the partial step (label suffixed `— INCOMPLETE`), log a
  violation, rethrow. The user can undo what was written.
- CSV regeneration (`writeCsv`) runs **once** at the end of a transaction or apply, not per entry.
- `history: false` is for startup/seeding writes only (`demo.ts` seeding runs on its own
  `Repository`, so it needs nothing). Every opt-out carries a `// history: exempt — <reason>`.
- `load()` (Reload) **keeps** the history: the external-change rule makes stale steps refuse
  safely. `openVault`/`closeVault` create/drop the repository, so history ends with it. Nothing
  is persisted across restart (ruling 2).

### 1.5 Applying undo/redo — the external-change rule

`apply(step, dir)` preflights **every** entry, then writes; any preflight failure refuses the
whole step, writes nothing, leaves both stacks unchanged.

| Entry (undo direction) | Preflight: refuse unless… | Write |
|---|---|---|
| edit, same path | `readText(after.path) === after.text` | write `before.text` to `before.path` |
| edit that moved the file | as above, and `before.path` does not exist | write `before.text` at `before.path`, then `remove(after.path)` |
| create (`before: null`) | `readText(after.path) === after.text` | `remove(after.path)` |
| delete (`after: null`) | `before.path` does not exist and no loaded record has `id` | write `before.text` at `before.path` |

Redo is the mirror (swap before/after). After writing: `byId`/`saved`/`lastText` take
`structuredClone(side.record)`, the wiki index updates (§2.4), `emit()`, `writeCsv()` once,
`version(id)` bumps. A read error on a path that should exist counts as "changed". An I/O error
mid-write logs a violation naming the files written so far and leaves the step on its stack.

Refusal: toast `UNDO REFUSED — <file> CHANGED ON DISK`, one caution log line per refused path
(source `history`, prefix `HIS`), remedy in the detail note: "Reload to see the change; the step
stays available." Never clobber, never partially apply.

### 1.6 Undoable vs exempt

| Write path | Undo | Reason |
|---|---|---|
| `repo.save` / `repo.delete` (every UI caller) | **undoable** | world data |
| Map drag / L-point park (`map_angle_deg`, `lagrange_of`, `lagrange`, `orbit_km`) | **undoable** | ruling 2: drags are single steps; still the one write allowed from a view (guard) |
| `repo.saveConfig` (Settings, caveat vocab, distance unit, boot, operator, pinned) | exempt | vault settings and view config, not world data; several controls write per keystroke; edited in place where shown |
| `repo.putTextAsset` (asset upload, SVG export) | exempt | the asset file stays; the record's `assets[]` change *is* undoable, so undo leaves at worst an orphan file, never a dangling ref to a missing file |
| `repo.writeCsv` | exempt | derived; regenerated after every apply |
| `init()` seeding, schema upgrade backups, `_tables` seeds | exempt | startup; schema migration snapshots (S1 PR2) |
| Snapshot restore | **undoable** (a transaction) | it is itself snapshotted first; undo returns to the pre-restore files |

### 1.7 Delete, rename, snapshots, session log

- **Every** `delete` (single or bulk) snapshots the file(s) first, cause `Before delete` /
  `Before bulk delete`. Cheap, and undo is lost at restart.
- Any transaction declaring ≥ 10 ids snapshots first (`opts.snapshot`); rename rewrite always
  does (§2.9). The step records the snapshot id; a refusal message names it: "the pre-change
  files are in snapshot <id>".
- Undo never reads from a snapshot; snapshots are the across-restart recovery.
- Log: each undo/redo writes one info line `UNDONE — <label>` / `REDONE — <label>` (source
  `history`); refusals are caution lines. Ordinary steps are not logged (the record events
  already are). Add `history: "HIS"` to `PREFIX` in `sessionLog.ts`.
- Rename (file move) needs nothing special: it is an edit entry whose paths differ (§1.5).

### 1.8 Drafts and keyboard routing (UI, PR 3b)

- Extract `useRecordDraft(id)` (planned in doc 09 §3.3) from the duplicated code in
  `RecordEditor` and `HullEditor`: `{draft, edit, dirty, saving, flush, checkpoint}`, 900 ms
  autosave, flush on unmount, and reload from the repository when `repo.version(id)` changes
  and the draft is not dirty (replaces the `loaded?.record.updated` effect). Each hook instance
  registers in `src/ui/drafts.ts` (`register`, `flushAll(): Promise<void>`, `dirtyCount()`).
- `actions.undo()` / `actions.redo()` (state.ts): `await flushAll()` → `repo.undo()` → toast
  `UNDONE — <label>`. Flushing first makes a pending edit its own top step, so undo always
  undoes the user's most recent action, whichever editor holds it.
- `reload`, `reopenVault`, `closeVault` also `await flushAll()` first.
- Key routing lives in one dispatcher, `src/ui/keys.ts`, installed once in `App.tsx`
  (replacing the current listener); S3 extends it with the §3 keymap.

| Focus | Ctrl/Cmd+Z | Ctrl/Cmd+Shift+Z, Ctrl+Y |
|---|---|---|
| Text entry (`input` of text/number/search, `textarea`, `[contenteditable]`) | native text undo — not intercepted | native redo |
| Anywhere else (body, buttons, canvases, lists) | `preventDefault`, app undo | app redo |
| Boot screen showing, or an overlay with its own text field open | ignored | ignored |

Esc in a text entry blurs it (S2 prose editors already leave edit mode on Esc), so the next
Ctrl+Z reaches app undo. A native undo inside a field changes the draft and autosaves as a new
step — consistent, not a conflict.

### 1.9 Tests (S1)

Core, node (`tests/history.test.ts`, `tests/repo-undo.test.ts`, `MemoryAdapter` + `demoVault()`):
push/undo/redo pointers; redo cleared by a new step; depth 200 trims oldest; coalescing on and
off each condition of §1.3; save → undo leaves the file **byte-identical** to before; undo then
redo byte-identical to after; name change → undo restores the old path and removes the new;
create → undo removes; delete → undo restores bytes and id; a transaction of 3 saves + 1 delete
undoes as one step; external write via `fs.writeText` → undo refused, file untouched, stacks
unchanged; same for redo; first save of a migrated record → undo restores the unmigrated text;
`writeCsv` called once per apply; reload keeps history.

UI: one jsdom test (`tests/undo-record.test.tsx`): edit a field, advance timers 900 ms, blur,
Ctrl+Z → field shows the old value and the file is restored. Smoke (`scripts/ui-smoke-undo.mjs`):
hull editor drag → Ctrl+Z → silhouette and file restored; map drag → Ctrl+Z → angle restored;
record form edit + map drag + hull edit → three Ctrl+Z → all three reverted in reverse order.

---

## 2. Wiki link layer (→ S2; §2.12–2.13 → S3)

### 2.1 Syntax

| Form | Meaning |
|---|---|
| `[[Target]]` | link; label = target text |
| `[[Target\|label]]` | link with label |
| `[[Target#Heading]]`, `[[Target#Heading\|label]]` | link to a heading in the target's prose |
| `![[Target]]`, `![[Target#Heading]]` | transclusion (§2.13) |
| `[[type:Target]]` | restrict to a registered type id (e.g. `[[hull:Sword]]`); prefix ignored if not a type id |
| `\[[` | literal `[[` |

Grammar: `!?\[\[ target ( '#' anchor )? ( '|' label )? \]\]`, where target and anchor exclude
`[ ] | # newline`, label excludes `] newline`, target ≤ 200 chars. Not recognised inside inline
code or fenced code. The prose parser (§2.6) is the only tokenizer; indexing and rewriting both
walk its AST, and every wiki node carries `{start, end}` source offsets (plus `targetStart/End`,
`labelStart/End`) so rewrites splice text without re-serialising Markdown.

### 2.2 Storage form (owner ruling)

Both `[[Name]]` and `[[id|Name]]` resolve (the id form is simply a target that matches an id).
Everything Gallery writes — autocomplete, redlink create, rename rewrite, ambiguity fix-up — writes
`[[Name]]` (qualified `[[type:Name]]` only when the bare name would be ambiguous at write time).

| Form | On rename of the target |
|---|---|
| `[[Old]]`, `[[type:Old]]`, `[[Old#H]]`, `![[Old]]`, `[[Old\|label]]` | target text rewritten to the new name; anchor and custom label kept |
| `[[id]]`, `[[id\|Old]]` | target untouched; a label equal to the old name (normalised) becomes the new name |
| `[[Alias]]` (resolved through an alias) | untouched |

### 2.3 Where links live and how they resolve

Scanned fields: typed records — `summary`, `body`, every string field (top level or inside
array items) whose schema has `x-multiline`; notes — every outline node's `text` and `note`.
Paths are recorded as `body`, `fields.history`, `outline.2.children.0.text`.

`norm(s)` = NFKC → trim → collapse internal whitespace to one space → `toLocaleLowerCase("en")`.
Resolution of a target, first tier that yields a hit wins:

1. `/^[0-9a-z]{12}$/` and a record has that id → that record.
2. Type prefix present → steps 3–4 restricted to that type.
3. `norm(name)` matches → those records.
4. `norm(alias)` matches → those records.
5. Nothing → **redlink**.

More than one record in the winning tier → **ambiguous**: rendered as a link with a `?` stamp
after it; the hover card lists candidates; click opens a chooser whose pick rewrites the link to
`[[type:Name]]` (an ordinary draft edit). The record page's LOAD/advisory row reports
`N AMBIGUOUS LINKS` (caution).

### 2.4 Link index (core)

`src/core/wiki/index.ts`, owned by `Repository` as `repo.wiki`, React-free.

```ts
interface WikiRef { sourceId: string; path: string; target: string; type?: string;
                    anchor?: string; label?: string; embed: boolean; start: number; end: number }
class WikiIndex {
  build(records: GalleryRecord[]): void            // at the end of load()
  update(prev: GalleryRecord | undefined, next: GalleryRecord | undefined): void // save/delete/apply
  outgoing(id): WikiRef[]
  incoming(id): WikiRef[]                          // refs whose resolution includes id
  resolve(ref): { status: "ok" | "ambiguous" | "red"; ids: string[] }
  unresolved(): { target: string; refs: WikiRef[] }[]  // the WANTED list
  renameImpact(id, oldName, newName): RewritePlan  // §2.9
}
```

Incoming refs are keyed by **normalised target text**, not by resolved id, so creating a record
that matches a redlink resolves it with no re-scan of sources, and a rename is O(affected).
`update` re-scans only the saved record and, when its name or aliases changed, its name table
entries. No I/O: the index reads records the repository already holds.

Backlinks: `repo.backlinks(id)` (typed) is unchanged; add `repo.mentions(id)` = `incoming(id)`.
The BACKLINKS panel shows two labelled groups, **LINKED** (typed: rel as today) and
**MENTIONED** (wiki: field path on hover), each row once per record. Doc 10 §6 later regroups by
relation with `mention` as one more relation; it extends this, it does not replace it.

### 2.5 Autocomplete

Where: every prose field in edit mode (§2.6) and outliner node text/note. Trigger: typing `[[`.
Popup anchored under the caret (mirror-element caret measurement; fall back to below the field),
`--menu-max-h`, surface-300, `line-300` border, `elev-2`.

- Rows (max 8): kind icon, name (`text-body`), type chip, and `alias: <hit>` in `ink-300` when the
  match was an alias. Last row always `CREATE "<query>"…` → the create dialog (§2.8).
- Ranking: match tier (exact-prefix of name 0 · word-start 1 · substring 2 · alias hit 3 ·
  subsequence 4), then last opened this session (desc), then `updated` (desc), then name.
  The matcher is `src/core/fuzzy.ts` (pure, shared with the S3 switcher).
- Keys: ↑/↓ move, Enter/Tab insert `[[Name]]` (qualified if ambiguous now) and place the caret
  after `]]`; typing `|` or `#` after a chosen name keeps the popup closed and lets the user type
  a label or anchor (`#` opens a heading list for a resolved target); Esc closes, text stays.
- Closes when the caret leaves the `[[…` span or a newline is typed.

### 2.6 Prose view and the Markdown subset (owner ruling)

`src/core/wiki/prose.ts`: `parseProse(text): Block[]`, `parseInline(text): Inline[]` — a
tokenizer → AST, no regex-to-HTML, no dependency. UI renders the AST as React elements only.

| Supported | Syntax |
|---|---|
| Blocks | ATX headings `#`–`######`; paragraphs; `-`/`*`/`+` and `1.` lists, nesting by indentation ≥ 2 spaces; `>` quote; fenced code ```` ``` ````; thematic break `---`/`***` |
| Inline | `**strong**`, `*em*`/`_em_`, `` `code` ``, `~~strike~~`, `[text](url)`, wiki refs, `\` escapes |
| Line breaks | **a single newline is a hard break** (deliberate deviation from CommonMark: matches how text is authored in a textarea and in Dynalist) |
| Everything else (HTML, images, tables, reference links, setext headings) | rendered as literal text |

- Headings get anchors `slugify(heading text)`; duplicate headings get `-2`, `-3`.
- `[text](url)` renders with the link style; click **copies the URL** (toast `URL COPIED`) —
  navigating the webview would leave the app and the opener plugin is not installed. Only
  `http`, `https`, `mailto` are linkified; anything else is literal text.
- `ProseField` (`src/ui/ProseField.tsx`) replaces the NOTES textarea, `x-multiline` fields in
  `SchemaForm` and the page subtitle. Not editing: rendered, `tabIndex=0`; click on a link follows
  it (Ctrl/Cmd+click too); click elsewhere, Enter or F2 enters edit mode (textarea, caret at end).
  Esc or blur leaves edit mode. Empty: the placeholder in `ink-300`.
- Outliner: a node's `text` and `note` render inline (`parseInline`) when the node's textarea is
  not focused; the existing keyboard model is unchanged while focused.
- Ctrl/Cmd+Enter in edit mode follows the link under the caret.
- Rendering never writes (the S1 guard covers `ProseField`).

### 2.7 Link rendering

| State | Rendering |
|---|---|
| Resolved | existing `.link` style (`accent-300`, dotted underline); label or target text; `#anchor` scrolls to the heading |
| Ambiguous | `.link` + a `?` in `stamp`/`status-amber` after it |
| **Redlink** | label in `ink-300` with a dotted `line-300` underline (`.redlink`) — the "unknown" ink, no new colour; hover card is a **fully redacted card** (§2.10) stamped `NO RECORD` |

### 2.8 Redlink → create

Click a redlink (or the autocomplete CREATE row): a dialog at `--dialog-w`:
`NAME` (prefilled with the target text, editable), `KIND` (type select; the `type:` prefix
preselects it, else the last kind created this session), `PRESET` (optional, as NewRecordMenu),
`HOST` (optional `RefPicker`, shown for body/location: sets `parent`/`body` like the map's ADD).
CREATE saves the record (one step), does **not** navigate, and every ref whose normalised target
matches the name now resolves (index keyed by text, §2.4). CREATE AND OPEN navigates.
If the name was edited, the originating link is rewritten to the new name in the same
transaction. Tools rail: `REDLINKS` lists `repo.wiki.unresolved()` (target, count, sources;
CREATE per row).

### 2.9 Rename rewrite (owner ruling: preview, then rewrite)

Trigger: the name commit in `RecordEditor` (title blur/Enter, page and compact inspector) when
the normalised name changed. Sequence:

1. `await flushAll()`; `plan = repo.wiki.renameImpact(id, old, new)`.
2. `plan` empty → ordinary save; no dialog, no alias added.
3. Otherwise dialog `RENAME — <OLD> → <NEW>`, `N LINKS IN M RECORDS`: rows grouped by source
   record (icon, name, field path, one-line excerpt with old/new), plus `SKIPPED` rows:
   ambiguous-before links (never rewritten). Checkbox `KEEP "<OLD>" AS ALIAS` (default on).
   Commands: **REWRITE** (primary), **RENAME ONLY** (links resolve through the alias if kept,
   else become redlinks — say so in a caution line), **CANCEL** (restores the old name in the
   draft; nothing written).
4. REWRITE = `repo.transaction("RENAME <OLD> → <NEW> (M RECORDS)", …, {snapshot: {cause:
   "Before rename rewrite", ids: [id, ...sources]}})`: save the renamed record (with alias), then
   for each source splice each ref's target/label span by offset (§2.2 table) into the **saved**
   record's field and `tx.save` it. If the bare new name would now be ambiguous, write
   `[[type:New]]`. Progress bar per §4.3 when M ≥ 10.
5. One undo step restores every file; redo reapplies. Drafts reload via `version(id)`.

### 2.10 RecordCard, hover preview, classification header (minimum for S2)

S2 builds the three primitives doc 10a extends. Each is data-driven from core so 10a adds
fields, badges and figures without replacing anything.

- `src/core/card.ts` → `cardModel(record, schema, lookup)`: `{ code, name, type, icon, summary,
  level, header, rows: {key, label, value, unit?, redacted}[], backlinks, pending }`. Rows:
  schema `x-card` order if present (doc 10 §3), else the schema's `required` fields, else the
  first 4 non-empty fields in schema order; max 6. Values formatted as the form's read-only value
  (units shown, refs as names, unknown `—` in `ink-300`); required + empty → `redacted: true`.
- `ClassificationHeader` (`src/ui/kit/Document.tsx`): one line, `data-xs`, `ink-300`:
  `GALLERY // <PROGRAMME ACRONYM or VAULT NAME> // <TYPE>` left, level word (`LEVEL_WORD[levelOf]`)
  right in `stamp`. Reuses `programmeLabel`/`levelOf` from `core/handling.ts`. Doc 10's
  provenance summary and EDITING/TOPOLOGY cards come later.
- `RecordCard` (`src/ui/kit/RecordCard.tsx`), `size: "hover" | "full"`: header → icon + name
  (`title-sm`) + code (`data-xs`) → summary (2 lines, `ink-200`) → rows (label `label-xs`,
  value `data-sm`, `RedactionBar` for redacted) → footer `N BACKLINKS · M FIELDS PENDING`.
  Width `--inspector-w`, `surface-200`, `border-1 line-300`, `elev-2`, radius 0. Redlink variant:
  target text as name, `NO RECORD` stamp, four redaction rows, footer `CLICK TO CREATE`.
- Hover: open after 350 ms on pointer rest or immediately on keyboard focus; close 150 ms after
  leave or on Esc; one card at a time; placed below the link, flipped above at the viewport edge;
  portal to `body`. Also on backlink rows and RefPicker values.

### 2.11 Tests (S2)

Node: grammar table (every §2.1 form, code-span exclusion, escapes, offsets); prose subset (each
supported construct + literal fallbacks + hard breaks + heading anchors); `norm`; resolution
tiers incl. id-first, type prefix, alias, ambiguity; index `update` keeps incoming correct after
create/rename/delete (redlink becomes resolved without re-scan); `renameImpact` + rewrite for each
§2.2 row; rewrite transaction undoes byte-identical; fuzzy ranking order. jsdom: `ProseField`
view ↔ edit, autocomplete insert, redlink click opens dialog. Smoke `scripts/ui-smoke-wiki.mjs`:
demo vault gets a note with links (resolved, red, ambiguous, id form); screenshot view mode,
hover card, autocomplete open, rename dialog; zero page errors.

### 2.12 Tag pages (→ S3)

- View `{kind: "tag", tag}`; tag chips everywhere navigate here (replacing today's query-filter).
- Header `TAG · <tag>` + count; records grouped by rail section/kind (sections.ts order), rows as
  the record list; `/`-separated tags (`fleet/uesc`) list child tags on treelines, and the parent
  page includes children's records under a `INCLUDING SUBTAGS` toggle (default on).
- Commands: `RENAME TAG…` and `MERGE INTO…` (transaction, snapshot when ≥ 10 records),
  `REMOVE FROM ALL` (transaction + snapshot). Matching is case-insensitive; display uses the most
  frequent casing. Tag index is derived in core (`repo.tags()`), never stored.
- Tools rail `TAGS` lists all tags with counts.

### 2.13 Transclusion (→ S3)

- `![[Target]]` renders the target's prose read-only in a block: `surface-300`, `border-1
  line-200`, header row = kind icon + name as a link + `EMBED` in `stamp`/`ink-300`. Typed
  record → its `body`; note → its outline as a `.tree`. `#Heading` → that heading through the
  next heading of the same or higher level.
- Depth limit 2: an embed inside an embed renders; a third level renders as a plain link.
  Cycle guard: a target already in the embed ancestry renders `↻ <name>` as a link.
- Redlinked embed → a redacted block (`NO RECORD`); missing anchor → whole prose plus
  `SECTION NOT FOUND` in `stamp`/`ink-300`.
- Read-only: clicking inside navigates to the target; nothing writes.

---

## 3. QoL shell (→ S3)

| Feature | Pri | Rationale | Acceptance |
|---|---|---|---|
| **Quick switcher** (Ctrl/Cmd+K) | must | fastest path to any record; replaces "focus rail search" | overlay input; `fuzzy.ts` ranking of §2.5 over name/alias; Enter opens, Ctrl/Cmd+Enter opens the map for a system/body; Esc closes; empty query lists recent |
| **Command palette** (`>` in the switcher, or Ctrl/Cmd+Shift+K) | must | every command reachable by name; discoverability for undo, pin, duplicate… | registry `src/ui/commands.ts` `{id, title, keys?, when(ctx), run(ctx)}`; lists title + key hint; every keymap entry is a command |
| **Shortcut sheet** (`?`) | must | one place to learn keys | dialog rendered **from the keymap table** (single source); grouped GLOBAL / RECORD / LIST / PROSE / MAP |
| **Undo/redo commands** | must | palette + sheet entries for §1 | `UNDO — <label>` shows the label of `peekUndo()`; disabled when empty |
| **Ctrl/Cmd+S flush** | must | habit; forces autosave now | `flushAll()`; toast `SAVED`; never the browser save dialog |
| **Save/dirty indicator** | must | one truth across editors | app bar right: `SAVED` nominal · `UNSAVED n` caution · `SAVING` + spinner · `SAVE FAILED` violation, from `drafts.ts`; hover lists dirty record names |
| **Back / forward** (Alt+←/→, mouse buttons 4/5) | must | forward is missing today | `state.future: View[]`, cleared on navigate; `actions.forward()` |
| **Flush before reload/close** | must | Reload while a draft is dirty can race autosave | covered by §1.8; smoke: edit then Reload → edit persists |
| **Duplicate record** (Ctrl/Cmd+Shift+D) | must | variants of hulls, bodies, characters | `repo.duplicate(id)` (core): new id, name `<name> (copy)`, unique slug, `created/updated` now, revisions reset, fields/links/tags/handling/assets kept, backlinks not copied; one step; opens the copy with the name selected |
| **Recent records** | must | return to work | rail section `RECENT` (last 8 opened), per install per vault path (`writeAppSettings` in Tauri; memory in browser/demo); switcher empty state |
| **Pinned records** | should | curated working set | `PIN`/`UNPIN` in the record command row + palette; `gallery.config.yaml` `pinned: [id]` (vault config: syncs across machines; exempt from undo §1.6); rail `PINNED` above RECENT; a pinned id that no longer resolves is shown as a redlink row with REMOVE |
| **Multi-select + bulk** | must | tagging and cleanup at scale | RecordList: Ctrl/Cmd+click toggles, Shift+click range, Ctrl/Cmd+A selects visible (focus in list), checkbox column when any selected; bar `N SELECTED · ADD TAG · REMOVE TAG · DELETE · CLEAR`; each op one transaction; DELETE inline-confirms `CONFIRM DELETE N` and snapshots (§1.7); Delete key = DELETE |
| **Find in page** (Ctrl/Cmd+F) | should | long record pages and logs; WebView2 offers no find bar | bar at top of the main pane: input, `n / m`, ↑ ↓ (Enter/Shift+Enter, F3/Shift+F3), Esc; TreeWalker over rendered text + input/textarea values; highlights with the CSS Custom Highlight API (`::highlight(find)` `accent-700`, current `accent-500`/`on-accent`); an input match focuses the field and selects the range; no API → scroll + focus ring only (verify in smoke; confidence moderate) |
| **Copy link** | should | paste `[[Name]]` into notes elsewhere | palette + record commands `COPY LINK` → clipboard `[[Name]]` (qualified if ambiguous); toast |
| **Undo hint on destructive toasts** | should | undo is invisible otherwise | `DELETED — CTRL+Z TO UNDO` (⌘ on macOS) |
| **Focus search** (`/`) | should | keep the rail filter reachable | focuses `#global-search` |
| **Rename** (F2 on a record page, not in a field) | could | keyboard rename | focuses and selects the title |
| **Jump to field** (`@` in the switcher on a record page) | could | long schemas | lists the page's field labels; Enter scrolls and focuses |
| **Show on map** | could | body/location → its system map with it selected | adds `select?: id` to the `map` view |

### 3.1 Keymap (single table; `src/ui/keys.ts` is generated from it)

"Outside text" = focus is not a text entry (§1.8). Cmd replaces Ctrl on macOS throughout.
Chromium-reserved chords (Ctrl+N/T/W/Shift+T/Tab/Shift+C) are deliberately unused so browser
mode behaves like the desktop app.

| Keys | Scope | Command | Session |
|---|---|---|---|
| Ctrl+Z | outside text | UNDO | S1 |
| Ctrl+Shift+Z · Ctrl+Y | outside text | REDO | S1 |
| Ctrl+Z / Ctrl+Shift+Z | in text | native text undo/redo (not intercepted) | — |
| Esc | in text | blur; leave prose edit mode | S2 |
| Ctrl+S | global | SAVE ALL (flush drafts) | S3 |
| Ctrl+K | global | QUICK SWITCHER | S3 |
| Ctrl+Shift+K · `>` in switcher | global | COMMAND PALETTE | S3 |
| `?` | outside text | SHORTCUTS | S3 |
| `/` | outside text | FOCUS SEARCH | S3 |
| Alt+← · mouse 4 | global | BACK | exists → S3 |
| Alt+→ · mouse 5 | global | FORWARD | S3 |
| Ctrl+F · F3 · Shift+F3 | global | FIND IN PAGE · next · previous | S3 |
| Ctrl+Shift+D | record page | DUPLICATE | S3 |
| F2 | record page, outside text | RENAME | S3 |
| Ctrl+A · Delete | list, outside text | SELECT ALL · DELETE SELECTED | S3 |
| `[[` | prose edit | LINK AUTOCOMPLETE | S2 |
| Ctrl+Enter | prose edit | FOLLOW LINK AT CARET | S2 |
| Enter · F2 | focused prose view | EDIT PROSE | S2 |
| ↑ ↓ Enter Tab Esc | any popup/overlay | move · accept · accept · close | S2/S3 |

---

## 4. Motion and ASCII (→ S3; edits `STYLE.md`, `CLAUDE.md`, `theme.css`)

### 4.1 `STYLE.md` — text to insert verbatim as a new §10 "Motion", and the §1 edit

In §1 (and its mirror in `CLAUDE.md` "Visual system"), replace the bullet "Nothing animates
except the ASCII spinner…" with:

> - Motion follows §10: two durations, one easing, a short list of things that may move, and a
>   per-install MOTION setting (FULL / REDUCED / OFF, default from the OS). Nothing else moves.

Insert:

> ## 10. Motion
>
> Adopted 2026-09-29 (ROADMAP §5.5) from doc 10 §7.8. Motion confirms a change; it never
> decorates, never loops except an ASCII indicator while work is really in progress, and never
> delays input.
>
> **Tokens** (`theme.css`): `--m-fast: 130ms` (hover, fades, popovers) · `--m-med: 260ms`
> (section entrance) · `--m-ease: cubic-bezier(0.2, 0, 0, 1)` (the only curve) ·
> `--m-rise: 8px` · `--m-stagger: 35ms`, capped at 8 steps (280 ms). Existing `--dur-spinner`,
> `--dur-idle-frame`, `--dur-boot-line` stay; add `--dur-resonance-frame: 150ms`.
>
> **May move**
> | What | How |
> |---|---|
> | Section entrance on navigating to a page (record page panels, overview panels, settings panels) | opacity 0→1 and `translateY(var(--m-rise))`→0 over `--m-med`; children stagger `--m-stagger`, the 9th onward start with the 8th |
> | Hover and focus state changes (background, border, ink) | `transition` of colour properties over `--m-fast` |
> | Tab or segmented-switch content change | content fades in over `--m-fast`; no slide |
> | Popovers, hover cards, autocomplete, dialogs, toasts | fade in over `--m-fast`; out instantly |
> | ASCII indicators (spinner, indeterminate bar, orbital idle, resonance loop, boot replay) | their own frame tokens |
>
> **Never moves:** layout size or position (no width/height/collapse animation), scrolling (no
> smooth scroll), the map and hull canvases (pan and zoom are immediate), data values (no
> count-up), severity changes (no flash or pulse), classification banners, the rail tree fold.
>
> **Setting.** Settings → DISPLAY → MOTION: `SYSTEM` (default) · `FULL` · `REDUCED` · `OFF`,
> stored per install (app settings in the desktop shell, `localStorage` in browser mode), never
> in the vault. SYSTEM resolves to REDUCED under `prefers-reduced-motion: reduce`, else FULL, and
> follows OS changes live. The resolved tier is `<html data-motion="full|reduced|off">`, set
> before first render.
>
> | Tier | Entrance | Hover/fades | ASCII indicators | Boot replay |
> |---|---|---|---|---|
> | FULL | rise + stagger | yes | animate | line by line |
> | REDUCED | opacity only, no rise, no stagger | yes | static frame | all lines at once |
> | OFF | none | none (instant) | static frame | all lines at once |
>
> CSS keys everything off `[data-motion]`; JS reads `motionTier()` (`src/ui/motion.ts`) — never
> `matchMedia` directly. A static frame is frame 0 (the spinner shows `|`, the bar its first cell).

`theme.css`: replace the `@media (prefers-reduced-motion: reduce)` blanket block with
`[data-motion="off"] *, …::before, …::after { animation: none !important; transition: none
!important; }` and `[data-motion="reduced"]` rules that drop `transform` and ASCII animations.
Motion classes: `.m-enter` on a container animates its direct children per the table.

### 4.2 ASCII set

Frames live in `src/core/astro/asciiOrbits.ts` (pure, tested); CSS keyframes that carry literal
frames are checked against them by a test.

**Spinner** — `Spinner kind="line" | "orbit"` (default `line`).
- `line`: the book's `| / — \`, 4 frames at `--dur-spinner`. Inline waits beside a label.
- `orbit`: **12 frames**, 7 cells, a body passing in front of (`o`) and behind (`.`) the
  primary `*`, edge-on: position `x = round½away(3·cos(30°·k))`, far side when `sin > 0`,
  hidden behind the star at x = 0 far side, covering it at x = 0 near side. Frames, k = 0…11:
  `"   *  o"`, `"   *  ."`, `"   * . "`, `"   *   "`, `" . *   "`, `".  *   "`, `"o  *   "`,
  `"o  *   "`, `" o *   "`, `"   o   "`, `"   * o "`, `"   *  o"` — 1.44 s per cycle at
  `--dur-spinner`. Used for panel-level waits (a panel's content loading, the switcher's first
  index build, `SAVING` in the app bar).

**2:1 resonance loop** — `resonanceFrames(p = 2, q = 1, frames = 24)`:
- Two rings drawn with `orbitalFrames`' geometry (ring marks, `RX = 2·RY` for the character
  aspect), primary `*` at centre, inner body `o` on ring 1, outer body `O` on ring 2.
- Inner advances `360·p/frames` = 30° per frame, outer `360·q/frames` = 15°: 24 frames = one
  outer orbit = two inner orbits, a closed loop; both start at 0° (conjunction at frame 0).
- Cadence `--dur-resonance-frame` (150 ms) → 3.6 s per loop. Caption line `RESONANCE 2:1` in
  `label-xs`/`ink-300`. Colours as the orbital idle (bodies `glyph-navy`, primary `accent-300`).
- Refactor, not fork: `orbitalFrames(subject, frames, stepDeg?: (ring: number) => number)`; the
  default keeps today's `120 / ring` so `ascii-orbits.test.ts` stays green.
- Appears: (1) the **WorkPanel** (§4.3); (2) the **full boot's orbital idle when the vault has no
  system** — replaces the plate frames as the animated fallback; the plate's first frame remains
  the static frame under REDUCED/OFF (edit STYLE.md §2's BootSequence row and §7.1 "Boot modes"
  accordingly); (3) the **welcome screen**, right of the command lines, as its idle.

### 4.3 Progress for long operations

Core operations take an optional reporter, like `LoadReporter`:
`type Progress = (done: number, total: number | undefined, note?: string) => void`.
`WorkPanel` (`src/ui/kit/WorkPanel.tsx`): appears only if the operation is still running after
400 ms; resonance loop left; right: operation title (`label-sm`), `AsciiBar` 32 cells (as boot)
with `done / total` figure, or `IndeterminateBar` when `total` is undefined; current note in
`data-sm`/`ink-300`; elapsed `data-xs`. Non-modal, docked at the top of the main pane; closes on
completion with a toast.

| Operation | Units | Determinate |
|---|---|---|
| Import (Dynalist/OPML) | files | yes |
| Snapshot create / restore | files | yes |
| Record migration (on a save-all or explicit migrate) | records | yes |
| Rename rewrite, tag rename/merge, bulk tag/delete | records | yes |
| CSV regenerate (Settings REGENERATE) | types | yes |
| Skeleton generate | bodies | yes |
| Reopen vault | — | boot handles it |

---

## 5. Work breakdown and acceptance

Every PR: `npm run typecheck`, `npm test`, the listed smoke scripts, the view-never-writes guard
(from S1 PR2), review subagent on the opposite model. New write paths go through history (§1.6).

### S1 — PR 3a (core) and PR 3b (UI) — replaces S1 brief "PR 3"

Splitting keeps the review of the write path separate from the editor rewiring. Same session.

| PR | Files | Acceptance (reviewer runs) |
|---|---|---|
| 3a history core | `src/core/history.ts` (new), `src/core/repo.ts`, `src/core/sessionLog.ts`, `tests/history.test.ts`, `tests/repo-undo.test.ts` | every §1.9 node case green; `grep -n "history: false"` shows only commented exemptions; no React under `src/core` |
| 3b UI wiring | `src/ui/useRecordDraft.ts`, `src/ui/drafts.ts`, `src/ui/keys.ts` (new); `App.tsx`, `state.ts`, `RecordEditor.tsx`, `hull/HullEditor.tsx`, `hull/HullCanvas.tsx`, `SystemMap.tsx`, `SystemBuilder.tsx`, `ImportDialog.tsx`, `NewRecordMenu.tsx`; `vitest.config.ts` include `.test.tsx` if PR2 did not; `tests/undo-record.test.tsx`; `scripts/ui-smoke-undo.mjs` | jsdom test green; smoke: three editors undo in reverse order in one history; skeleton generate undoes as one step; external edit → toast `UNDO REFUSED` and file unchanged; Ctrl+Z in a text field does not trigger app undo; `RecordEditor`/`HullEditor` no longer contain their own autosave timers |

Routing (§3.1): B3 A1 P1 U2 R1 C3 = **11**, but blast radius 3 on the write path; S1 stays on
Fable as planned (the session also carries PR1–2). If S1 splits, 3b alone is Sonnet @ high.

### S2 — wiki core

| PR | Scope | Files | Acceptance |
|---|---|---|---|
| S2.1 | prose parser, wiki grammar, `norm`, resolution, index, `mentions`, fuzzy | `src/core/wiki/{prose,refs,index}.ts`, `src/core/fuzzy.ts`, `repo.ts` (index hooks), tests | §2.11 node cases; index updates on save/delete/undo apply without a full rebuild (spy) |
| S2.2 | `ProseField`, outliner inline render, link/redlink/ambiguous rendering, BACKLINKS LINKED/MENTIONED | `src/ui/ProseField.tsx`, `SchemaForm.tsx`, `RecordEditor.tsx`, `Outliner.tsx`, `styles.css` | smoke screenshots; guard green; `theme-tokens` test green (no new colours) |
| S2.3 | `cardModel`, `ClassificationHeader`, `RecordCard`, hover | `src/core/card.ts`, `src/ui/kit/{Document,RecordCard}.tsx` | card for each built-in type; redacted rows for required-empty; redlink card |
| S2.4 | autocomplete, redlink create dialog, REDLINKS tool, ambiguity chooser | `src/ui/{WikiAutocomplete,CreateFromLink}.tsx`, `Sidebar.tsx` | jsdom insert test; created record resolves every matching redlink with no reload |
| S2.5 | rename impact + dialog + rewrite transaction | `src/core/wiki/index.ts` (`renameImpact`, splice), `src/ui/RenameDialog.tsx`, `RecordEditor.tsx` | every §2.2 row; one Ctrl+Z restores all files byte-identical; snapshot exists before; alias kept when checked |

Smoke: add `scripts/ui-smoke-wiki.mjs`; widen `ui-smoke-screens.mjs` to a record page whose body
has links. Split point if context runs high: after S2.3 (S2b = S2.4–2.5).
Routing: B3 A1 P1 U3 R3 C2 = **13** → Opus 5.5 @ high (unchanged).

### S3 — QoL shell, tag pages, transclusion, motion, ASCII

| PR | Scope | Files | Acceptance |
|---|---|---|---|
| S3.1 | keymap + command registry + switcher + palette + shortcut sheet + forward + Ctrl+S + `/` | `src/ui/{keys,commands}.ts`, `src/ui/{Switcher,ShortcutSheet}.tsx`, `App.tsx`, `state.ts` | every §3.1 row reachable from the palette; sheet generated from the table (test compares); browser-reserved chords unused |
| S3.2 | save indicator, duplicate, recent, pinned, copy link, undo hint toasts, F2 | `src/core/repo.ts` (`duplicate`), `Sidebar.tsx`, `RecordEditor.tsx`, `types.ts` (`pinned?`) | duplicate: new id/slug, same fields, one undo step; pinned survives reopen; recent is per vault |
| S3.3 | multi-select + bulk tag/delete; tag pages; TAGS tool | `RecordList.tsx`, `src/ui/TagPage.tsx`, `src/core/tags.ts` | bulk delete snapshots then undoes as one step; tag rename across ≥ 10 records snapshots first |
| S3.4 | transclusion | `ProseField.tsx`, `src/core/wiki/prose.ts` (embed nodes) | depth 2; cycle `↻`; section embed; nothing writes |
| S3.5 | find in page | `src/ui/FindBar.tsx` | counts match rendered text + field values; Esc restores focus |
| S3.6 | motion tokens + tiers + Settings DISPLAY; STYLE/CLAUDE edits (§4.1) | `theme.css`, `styles.css`, `src/ui/motion.ts`, `main.tsx`, `Settings.tsx`, `Boot.tsx`, `docs/STYLE.md`, `docs/CLAUDE.md` | no `matchMedia("(prefers-reduced` outside `motion.ts`; OFF → computed `transition-duration` 0 on a hovered button; tier survives restart |
| S3.7 | ASCII set + WorkPanel + progress reporters | `asciiOrbits.ts`, `kit/Ascii.tsx`, `kit/WorkPanel.tsx`, `Boot.tsx`, `Welcome.tsx`, importer/snapshot/rewrite callers, `tests/ascii-orbits.test.ts` | orbit frames equal §4.2 list; resonance: 24 frames; inner at its start angle on frames 0 and 12, outer only on 0; frame 23 → 0 is one step of each; CSS keyframes match core frames; WorkPanel not shown for a 100 ms op, shown for a 2 s op |

Smoke: widen `ui-smoke-screens.mjs` (switcher, palette, sheet, tag page, bulk bar, find bar,
WorkPanel under a slowed import); `ui-smoke-log-boot.mjs` for the resonance fallback (vault with
no system) under FULL and OFF.
Routing: B2 A1 P1 U3 R1 C3 = **11** → Sonnet 5.5 @ high (unchanged). Tag pages and transclusion
moved here per ROADMAP §2 (they are specified in §2). Split point: after S3.4.

No section scores ≥ 16.
