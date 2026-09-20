/**
 * Cross-source conflict scan for `<vault>/_tables/` — doc 07 task 0.
 *
 *   node scripts/scan-table-conflicts.mjs [path/to/_tables]
 *
 * The rows in `_tables/` come from three incompatible systems: NEBULOUS is a
 * gameplay-tuned component catalogue, Terra Invicta is an internally consistent
 * ladder built for a different tech ceiling, and Atomic Rockets is engineering
 * literature with no balance at all. This script reduces quantities that appear
 * in more than one of them to a common unit and reports every pair that
 * disagrees by more than 2x.
 *
 * It reads the tables and writes nothing. It does NOT pick a winner — that is
 * an authorial decision, and the standing findings live in
 * `_tables/RECONCILIATION.md`. Re-run it after editing any table; a new
 * CONFLICT line that is not in that document is a conflict nobody has ruled on.
 *
 * Which quantities are "the same quantity" is a judgement, not something a
 * machine can infer from a YAML key, so the probes below are declared by hand.
 * The script's job is the arithmetic and the bookkeeping.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const DIR =
  process.argv[2] ??
  join(process.env.USERPROFILE ?? process.env.HOME ?? ".", "OneDrive/Documents/Worldbuilding/Gallery Fleet Builder/gallery-vault/_tables");

/** Provisional, `docs/UNITS.md` §4. Every NEBULOUS volume figure scales off it. */
const CELL_M3 = 27;
/** Ratio above which a pair is reported. Doc 07 task 0. */
const THRESHOLD = 2;

const files = {};
for (const f of readdirSync(DIR).filter((f) => f.endsWith(".yaml"))) {
  files[f.replace(/\.yaml$/, "")] = parse(readFileSync(join(DIR, f), "utf8"));
}

/** Row groups, detected structurally — the same rule as `src/core/designer/tables.ts`. */
function groups(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc ?? {})) {
    if (Array.isArray(v) && v.length && v.every((r) => r && typeof r === "object" && "id" in r)) out[k] = v;
    else if (v && typeof v === "object" && Array.isArray(v.rows)) out[k] = v.rows;
  }
  return out;
}
const rowsOf = (file, group) => groups(files[file])[group] ?? [];
function row(file, group, id) {
  const r = rowsOf(file, group).find((r) => r.id === id);
  if (!r) throw new Error(`no row ${file}/${group}/${id}`);
  return r;
}
/** Every row in every file, flattened, for the sweeps that are not name-matched. */
function* allRows(fileNames) {
  for (const file of fileNames) for (const [g, rs] of Object.entries(groups(files[file]))) for (const r of rs) yield { file, g, ...r };
}

const findings = [];
const gaps = [];
const compare = ({ quantity, unit, a, b, note }) =>
  findings.push({ quantity, unit, a, b, ratio: Math.max(a.value, b.value) / Math.min(a.value, b.value), note });

// --- 1. Reactor specific mass, in three systems ------------------------------
const ti = rowsOf("reactors", "rows").filter((r) => r.specific_mass_t_per_gw);
const best = ti.reduce((m, r) => (r.specific_mass_t_per_gw < m.specific_mass_t_per_gw ? r : m));
const worstFission = ti
  .filter((r) => r.class !== "fuel-cell")
  .reduce((m, r) => (r.specific_mass_t_per_gw > m.specific_mass_t_per_gw ? r : m));
const plant = (id) => {
  const r = row("internal_modules", "powerplants", id);
  return { r, t_per_gw: r.mass_t / (r.power_out_kw / 1e6) };
};

compare({
  quantity: "reactor specific mass, best fission plant in the set",
  unit: "t/GW",
  a: { source: "terra-invicta", where: `reactors.rows/${best.id}`, value: best.specific_mass_t_per_gw },
  b: { source: "literature", where: "reactors.cross_check, arXiv:2110.15198 §3.2", value: 10000 },
  note: "Literature band is 10,000–30,000 t/GW (10–30 kg/kWe); the optimistic end is used.",
});
compare({
  quantity: "reactor specific mass, best fission plant in the set",
  unit: "t/GW",
  a: { source: "terra-invicta", where: `reactors.rows/${best.id}`, value: best.specific_mass_t_per_gw },
  b: { source: "nfc", where: "internal_modules.powerplants/fr4800", value: plant("fr4800").t_per_gw },
});
compare({
  quantity: "reactor specific mass, worst fission plant in the set",
  unit: "t/GW",
  a: { source: "terra-invicta", where: `reactors.rows/${worstFission.id}`, value: worstFission.specific_mass_t_per_gw },
  b: { source: "nfc", where: "internal_modules.powerplants/fr3300-micro", value: plant("fr3300-micro").t_per_gw },
});

// --- 2. Radiators: the file's own two parallel systems ------------------------
// mass per GW rejected = (1e6 kW/GW / heat_cap_kw_m2) * mass_kg_m2 / 1000
const asTPerGw = (r) => (1000 * r.mass_kg_m2) / r.heat_cap_kw_m2;
for (const [physicalId, gameId, why] of [
  ["tin-droplet", "tin-droplet", "same technology, same name"],
  ["curie-point", "cobalt-dust", "both are a cobalt droplet sheet cycled about the Curie point"],
  ["buckytube-filament", "nanotube-filament", "both are a moving-filament loop"],
  ["ether-charged-dust", "ionic-dust", "both are an electrostatically confined dust sheet"],
]) {
  compare({
    quantity: `radiator specific mass, ${physicalId}`,
    unit: "t/GW",
    a: { source: "atomic-rockets", where: `radiators.physical/${physicalId}`, value: asTPerGw(row("radiators", "physical", physicalId)) },
    b: { source: "terra-invicta", where: `radiators.game/${gameId}`, value: row("radiators", "game", gameId).mass_t_per_gw },
    note: why,
  });
}
// Not one probe per row: different radiator technologies at different operating
// temperatures are *supposed* to differ in areal density. What is worth reporting
// is the spread of the set, and where the one piece of flown hardware sits in it.
const areal = rowsOf("radiators", "physical").slice().sort((a, b) => a.mass_kg_m2 - b.mass_kg_m2);
compare({
  quantity: "radiator areal density, spread of the physical set",
  unit: "kg/m²",
  a: { source: "atomic-rockets", where: `radiators.physical/${areal[0].id}, lightest`, value: areal[0].mass_kg_m2 },
  b: { source: "atomic-rockets", where: `radiators.physical/${areal.at(-1).id}, heaviest`, value: areal.at(-1).mass_kg_m2 },
  note: "One source, one column, no operating temperature on most rows to tell them apart by.",
});
compare({
  quantity: "radiator areal density, flown hardware against the median of the set",
  unit: "kg/m²",
  a: { source: "flown hardware", where: "radiators.physical_extras/iss-panels", value: row("radiators", "physical_extras", "iss-panels").mass_kg_m2 },
  b: { source: "atomic-rockets", where: `radiators.physical, median of ${areal.length} rows`, value: areal[Math.floor(areal.length / 2)].mass_kg_m2 },
});
compare({
  quantity: "radiator specific mass, LDR fine mist against the best whole-system row",
  unit: "t/GW",
  a: { source: "atomic-rockets", where: "radiators.physical_extras/ldr-fine-mist", value: asTPerGw(row("radiators", "physical_extras", "ldr-fine-mist")) },
  b: { source: "terra-invicta", where: "radiators.game/dusty-plasma", value: row("radiators", "game", "dusty-plasma").mass_t_per_gw },
  note: "The row's own note says it excludes heat exchanger, emitter and collector mass.",
});

// --- 3. Crew per installed component -----------------------------------------
compare({
  quantity: "crew for the most demanding single component",
  unit: "people",
  a: { source: "terra-invicta", where: "reactors.rows/molten-salt-1, a whole GW-class plant", value: row("reactors", "rows", "molten-salt-1").crew },
  b: { source: "nfc", where: "compartments.command/citadel-cic", value: row("compartments", "command", "citadel-cic").crew },
  note: "Both read as a total complement after the 2026-09-19 crew_basis ruling.",
});

// --- 4. Material densities shared between files -------------------------------
for (const [structureId, armorId] of [
  ["titanium-frame", "titanium"],
  ["steel-frame", "steel"],
  ["nanotube-frame", "nanotube"],
]) {
  compare({
    quantity: `material density, ${armorId}`,
    unit: "kg/m³",
    a: { source: "original", where: `structures.rows/${structureId}`, value: row("structures", "rows", structureId).structural_density_kg_m3 },
    b: { source: "terra-invicta", where: `armor.rows/${armorId}`, value: row("armor", "rows", armorId).density_kg_m3 },
  });
}

// --- 5. Propellant densities against standard references ----------------------
// propellants.yaml is flagged UNVERIFIED in its own header; this is that check.
const REFERENCE = {
  "hydrogen-liquid": [70.85, "NIST Chemistry WebBook, saturated liquid at 20.3 K"],
  "methane-liquid": [422.6, "NIST Chemistry WebBook, saturated liquid at 111.7 K"],
  ammonia: [681.9, "NIST Chemistry WebBook, saturated liquid at 239.8 K"],
  water: [999.0, "NIST Chemistry WebBook, 288 K"],
  lox: [1141, "NIST Chemistry WebBook, saturated liquid at 90.2 K"],
  rp1: [810, "MIL-DTL-25576, 0.799–0.815 at 288 K"],
  n2o4: [1443, "NIST Chemistry WebBook, 293 K"],
  mmh: [875, "NIST Chemistry WebBook, 293 K"],
  argon: [1395.4, "NIST Chemistry WebBook, saturated liquid at 87.3 K"],
  lithium: [534, "CRC Handbook, solid at 293 K"],
  "tungsten-pellet": [19250, "CRC Handbook, solid at 293 K"],
};
for (const [id, [value, where]] of Object.entries(REFERENCE)) {
  compare({
    quantity: `propellant density, ${id}`,
    unit: "kg/m³",
    a: { source: "original", where: `propellants.rows/${id}`, value: row("propellants", "rows", id).density_kg_m3 },
    b: { source: "reference", where, value },
  });
}

// --- 6. Power scale: what a drive draws against what a plant makes -------------
const drives = rowsOf("drives", "rows");
const powerGw = (d) => (d.thrust_n * d.ev_kps * 0.5e-6) / d.efficiency; // README, TI Fleets
const cheapest = drives.filter((d) => d.family !== "chemical").reduce((m, d) => (powerGw(d) < powerGw(m) ? d : m));
compare({
  quantity: "propulsion power, least demanding powered drive against total installed generation",
  unit: "GW",
  a: { source: "terra-invicta", where: `drives.rows/${cheapest.id}`, value: powerGw(cheapest) },
  b: {
    source: "nfc",
    where: "internal_modules.powerplants, every ANS reactor running at once",
    value: rowsOf("internal_modules", "powerplants").reduce((s, r) => s + r.power_out_kw, 0) / 1e6,
  },
});

// --- 7. Gaps: rows that carry no mass at all ----------------------------------
const withCells = [...allRows(["compartments", "internal_modules", "mounts"])]
  .filter((r) => Array.isArray(r.cells) && typeof r.mass_t === "number")
  .map((r) => ({ ...r, cells_n: r.cells.reduce((a, b) => a * b, 1) }));
const densities = withCells.filter((r) => r.mass_t > 0).map((r) => (r.mass_t * 1000) / (r.cells_n * CELL_M3)).sort((a, b) => a - b);
const median = densities[Math.floor(densities.length / 2)];
for (const r of withCells.filter((r) => r.mass_t === 0).sort((a, b) => b.cells_n - a.cells_n)) {
  gaps.push({
    what: `${r.file}.${r.g}/${r.id} carries mass_t: 0 over ${r.cells_n} cells (${(r.cells_n * CELL_M3).toLocaleString()} m³)`,
    implied: `${Math.round((r.cells_n * CELL_M3 * median) / 1000).toLocaleString()} t at the median NEBULOUS component density of ${median.toFixed(1)} kg/m³`,
  });
}

// --- Report -------------------------------------------------------------------
const conflicts = findings.filter((f) => f.ratio > THRESHOLD).sort((a, b) => b.ratio - a.ratio);
const fmt = (n) => (n >= 10000 || (n > 0 && n < 0.01) ? n.toPrecision(4) : n >= 10 ? n.toFixed(1) : n.toFixed(3));
console.log(`${findings.length} probes, ${conflicts.length} over ${THRESHOLD}x, ${gaps.length} gaps\n`);
for (const f of conflicts) {
  console.log(`CONFLICT  ${f.ratio.toPrecision(4).padStart(10)}x  ${f.quantity} [${f.unit}]`);
  for (const s of [f.a, f.b]) console.log(`              ${s.source.padEnd(14)} ${fmt(s.value).padStart(11)}  ${s.where}`);
  if (f.note) console.log(`              ${f.note}`);
}
for (const f of findings.filter((f) => f.ratio <= THRESHOLD)) console.log(`   agrees  ${f.ratio.toFixed(3).padStart(10)}x  ${f.quantity}`);
for (const g of gaps) console.log(`\nGAP       ${g.what}\n              implies ${g.implied}`);
process.exitCode = 0;
