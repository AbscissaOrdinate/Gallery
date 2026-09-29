# L — Local checkpoint (owner's PC)

Cloud sessions cannot build Tauri/Rust (no GTK) and never see the real vault. Run this on the
owner's Windows PC **after S1d, after S3b, and after S5b** (and before any release zip), either
by hand or as a **local Code session (Sonnet 5.5 @ medium)** with the repo cloned locally.

**Never point a checkpoint at the live OneDrive vault.** Copy it first:
`Documents/Worldbuilding/Gallery Fleet Builder/gallery-vault` → a scratch folder outside
OneDrive, e.g. `%USERPROFILE%/gallery-checkpoint/vault-<date>`.

## Steps

1. `git pull` on `main`; `npm ci`; `npm run typecheck`; `npm test`.
2. `cd src-tauri && cargo test` — the fsops tests (atomic write, rename) must pass on Windows.
3. `npm run app:dev` — the Tauri window opens; boot completes; no console errors.
4. Open the **vault copy** in the app. Check, and note anything odd:
   - First open after an upgrade: a `_snapshots/<timestamp>/` "Before vault upgrade" exists if
     any schema/config was overwritten; a **second open writes nothing** (compare folder
     modified times or `git status` if the copy is a git repo).
   - Browse records, maps, hull editor without editing → no file under the vault changes.
   - Edit a record, a hull and a map position; Ctrl+Z three times → all three revert in order;
     files byte-identical to before (from S1d on).
   - Delete a record → snapshot appears; undo restores it.
   - Install a starter system (from S5b on) → one undo removes it.
5. `npm run app:build` once per checkpoint — the installer builds.
6. Record results (pass/fail per step, versions, anything odd) in ROADMAP §7 under a
   "Local checkpoints" table via the next Code session's prompt, or paste them to the review desk.

## Why this matters

It is the only check of: Windows file semantics under OneDrive (atomic rename over a synced
file), the Rust side of every write path, snapshot/restore on real data volumes, and the
upgrade path on a vault created by older builds.
