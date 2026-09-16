# Gallery

A file-first worldbuilding workbench: Tauri 2 shell, TypeScript + React inside.
The vault is a plain folder of YAML/OPML records (see `README.md` for the layout).

## Commands

```bash
npm ci                 # install (Node 22+)
npm run typecheck      # tsc --noEmit
npm test               # vitest run  — tests/**/*.test.ts, environment: node
npm run build          # tsc --noEmit && vite build
npm run dev            # browser mode, in-memory demo vault
npm run app:dev        # Tauri dev window (needs Rust + WebView2)
```

Both `npm run typecheck` and `npm test` must be clean before any commit.

The headless-Chromium UI smoke checks are **not** part of vitest — they are
standalone scripts run against a preview server:

```bash
npm run build && npx vite preview     # then, in another shell:
node scripts/ui-smoke.mjs             # also ui-smoke-map{,2,3,4,5}.mjs
```

## Layout

```
src/core/           pure logic, no React imports anywhere in here
  astro/            Worldsmith + EWoCS body physics, map layout, display modes, units
  codec/            record YAML/JSON, OPML, CSV
  schema/           type registry + built-in schemas and presets
  designer/         craft budget roll-up   (note: designer/, not design/)
  storage/          StorageAdapter: tauri (desktop), memory (browser/tests), node (CLI)
  repo.ts           load/save/index/backlinks
src/ui/             React. `demo.ts` is pure and is imported by tests.
src-tauri/          Rust shell (fsops.rs)
scripts/            CLI importer, headless UI smoke scripts
tests/              vitest
gallery/            project docs 01–05; each phase adds one
```

## Conventions

- **`src/core/` stays framework-free.** No React import may appear under it.
- **Metric on disk, always.** Unit conversion is display-only, the way
  `x-distance` fields already work.
- **No `eval`, no `new Function`, no dynamic code execution** in the expression
  layer or anywhere else.
- Schemas carry a `version`; a newer built-in replaces the on-disk copy and backs
  the old one up as `<type>.schema.v<N>.json`. `"custom": true` opts a file out.
  This upgrades *schema files only* — it does not migrate record files.
- Reference tables in `<vault>/_tables/*.yaml` carry a `source` per row, and
  `provisional: true` where the figure is a guess. **A provisional value must
  render with a visible marker everywhere it reaches the UI.**
- Do not seed physical constants from recall. If a figure is missing, ask.

## Vault

The working vault is the OneDrive folder
`Documents/Worldbuilding/Gallery Fleet Builder/gallery-vault`.
Tests do not use it — they build vaults with `MemoryAdapter` plus `demoVault()`.
