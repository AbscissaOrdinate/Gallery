/**
 * CLI: initialize a vault folder (if needed) and import Dynalist OPML exports.
 *
 *   npm run import:dynalist -- --out "C:/Users/you/OneDrive/Documents/Worldbuilding/gallery" \
 *        --split top-level --tag heliaris  ./Fleets_and_Strikecraft_dynalist-2026-9-4.opml ...
 *
 * Options: --out <dir> (required) · --split top-level|document (default top-level)
 *          --no-prefix (don't prefix note names with the document title) · --tag <t> (repeatable)
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { NodeFsAdapter } from "../src/core/storage/node";
import { Repository } from "../src/core/repo";
import { importDynalistOpml, dedupeSlugs, type SplitStrategy } from "../src/core/importers/dynalist";

const args = process.argv.slice(2);
let out = "";
let split: SplitStrategy = "top-level";
let prefix = true;
const tags: string[] = [];
const files: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--out") out = args[++i];
  else if (a === "--split") split = args[++i] as SplitStrategy;
  else if (a === "--no-prefix") prefix = false;
  else if (a === "--tag") tags.push(args[++i]);
  else files.push(a);
}
if (!out || files.length === 0) {
  console.error("usage: import-dynalist --out <vault dir> [--split top-level|document] [--no-prefix] [--tag t]... <file.opml>...");
  process.exit(2);
}

const repo = new Repository(new NodeFsAdapter(path.resolve(out)));
await repo.init();
await repo.load();
const taken = new Set(repo.ofType("note").map((r) => r.record.slug));
let total = 0;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const r = importDynalistOpml(text, { split, prefixWithDocument: prefix, fallbackTitle: path.basename(f, ".opml"), tags });
  dedupeSlugs(r.notes, taken);
  for (const n of r.notes) {
    await repo.save(n, { touch: false });
    taken.add(n.slug);
  }
  total += r.notes.length;
  console.log(`${path.basename(f)} → "${r.documentTitle}": ${r.nodeCount} nodes → ${r.notes.length} note(s)`);
}
await repo.writeCsv();
console.log(`done: ${total} notes written to ${out}`);
