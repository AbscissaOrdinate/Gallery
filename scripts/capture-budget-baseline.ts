/**
 * Capture the pre-migration budget baseline.
 *
 * Run this on the commit *before* a schema migration lands. It walks the demo
 * vault, computes every craft's budget with the code as it stands, and writes
 * `tests/fixtures/budget-baseline.json`. The migration gate in
 * `tests/migration.test.ts` then asserts the migrated records still produce
 * exactly these numbers — which is only a real regression test if the baseline
 * was taken before the change.
 *
 *   npx tsx scripts/capture-budget-baseline.ts
 *
 * **Do not re-run it to make a failing gate pass.** The fixture in the repo was
 * captured before the schema v2 bumps; overwriting it with today's numbers
 * would leave a test that compares the code to itself. Re-run it only when
 * starting a *new* baseline for a migration that has not landed yet.
 *
 * The advisory list it captures is the new `Violation` currency, not the old
 * flat `warnings` array — see the gate in `tests/migration.test.ts` for how the
 * two are compared across that change.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MemoryAdapter } from "../src/core/storage/memory";
import { Repository } from "../src/core/repo";
import { demoVault } from "../src/ui/demo";
import { analyseShip } from "../src/core/designer/ship";
import { isNote, type TypedRecord } from "../src/core/types";

const fs = new MemoryAdapter();
await demoVault(fs);
const repo = new Repository(fs);
await repo.load();

const crafts = repo
  .ofType("craft")
  .map((lr) => lr.record)
  .filter((r) => !isNote(r))
  .sort((a, b) => a.name.localeCompare(b.name));

const budgets: Record<string, unknown> = {};
for (const craft of crafts) {
  if (isNote(craft)) continue;
  const { budget: b, advisories } = analyseShip(craft as TypedRecord, {
    typed: (id: string) => repo.typed(id),
    tables: repo.tables,
    values: repo.effectiveConstraints().values,
  });
  budgets[craft.name] = {
    structuralMass_t: b.structuralMass_t,
    moduleMass_t: b.moduleMass_t,
    dryMass_t: b.dryMass_t,
    propellant_t: b.propellant_t,
    propellantCapacity_t: b.propellantCapacity_t,
    wetMass_t: b.wetMass_t,
    powerOut_MW: b.powerOut_MW,
    powerIn_MW: b.powerIn_MW,
    heatOut_MW: b.heatOut_MW,
    heatReject_MW: b.heatReject_MW,
    thrust_kN: b.thrust_kN,
    isp_s: b.isp_s,
    accelWet_g: b.accelWet_g,
    accelDry_g: b.accelDry_g,
    deltaV_kms: b.deltaV_kms,
    cost: b.cost,
    crew: b.crew,
    advisories: advisories.map((v) => `${v.severity}: ${v.message}`),
  };
}

/** Preset id → the field keys it sets, so a migration that drops one is caught. */
const presets: Record<string, string[]> = {};
for (const p of repo.registry.presets.slice().sort((a, b) => `${a.type}/${a.id}`.localeCompare(`${b.type}/${b.id}`))) {
  presets[`${p.type}/${p.id}`] = Object.keys(p.fields ?? {}).sort();
}

const out = join(process.cwd(), "tests", "fixtures", "budget-baseline.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ capturedFrom: "demoVault()", budgets, presets }, null, 2) + "\n");
console.log(`wrote ${out}`);
console.log(`  ${Object.keys(budgets).length} craft, ${Object.keys(presets).length} presets`);
