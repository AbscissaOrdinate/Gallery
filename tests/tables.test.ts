/**
 * Reference tables (§2.7) — structural parsing, row addressing, and the
 * provisional flag that §0 says must never be lost.
 */
import { describe, it, expect } from "vitest";
import { MemoryAdapter } from "../src/core/storage/memory";
import { loadTables, parseTableFile, TableSet } from "../src/core/designer/tables";
import { VAULT } from "../src/core/types";

/** Shaped like the real files: a meta block, several named row groups, some prose. */
const RADIATORS = `
meta:
  physical_source: "Atomic Rockets / Project Rho, Heat Radiators"
  constants:
    stefan_boltzmann_w_m2_k4: 5.670374e-8

physical:
  - { id: tin-droplet, name: "Tin droplet", heat_cap_kw_m2: 38.49, mass_kg_m2: 6.4154, op_temp_k: 1000, source: "Atomic Rockets" }
  - { id: mo-li-heat-pipe, name: "Mo/Li heat pipe", heat_cap_kw_m2: 453.54, mass_kg_m2: 151.18, source: "Atomic Rockets" }

physical_extras:
  - { id: ldr-fine-mist, name: "LDR, 50 um droplets", mass_kg_m2: 0.047, provisional: true, source: "ToughSF, excludes exchanger mass" }

game:
  - { id: tin-droplet, name: "Tin droplet", era: mid, mass_t_per_gw: 125, combat_vulnerability: 0.01, crew: 3 }

design_notes: "Two coplanar panels are 100% efficient; four are 71%."
`;

const STRUCTURES = `
meta:
  status: "PLACEHOLDER"
  provisional: true

rows:
  - { id: steel-frame, name: "Steel frame", structural_density_kg_m3: 7850, structure_mass_fraction: 0.25 }

packing_efficiency:
  note: "Usable fraction of gross internal volume."
  rows:
    - { id: warship, value: 0.78 }
`;

describe("table file parsing", () => {
  const radiators = parseTableFile("radiators", RADIATORS);

  it("finds every group of rows and leaves prose alone", () => {
    expect([...radiators.groups.keys()]).toEqual(["physical", "physical_extras", "game"]);
    expect(radiators.nonRowKeys).toEqual(["design_notes"]);
    expect(radiators.meta.physical_source).toMatch(/Atomic Rockets/);
  });

  it("reads rows nested under a group's own rows: key", () => {
    const structures = parseTableFile("structures", STRUCTURES);
    expect([...structures.groups.keys()]).toEqual(["rows", "packing_efficiency"]);
    expect(structures.groups.get("packing_efficiency")?.[0]?.id).toBe("warship");
  });

  it("inherits provisional from the file when meta declares it", () => {
    const structures = parseTableFile("structures", STRUCTURES);
    // No row carries the flag itself; all of them are provisional anyway.
    expect(structures.provisional).toBe(true);
    for (const row of [...structures.groups.values()].flat()) expect(row.provisional).toBe(true);
  });

  it("gives every row the file's meta.defaults, and lets a row override them", () => {
    // The mechanism exists for crew_basis: the 2026-09-19 ruling is that every
    // NEBULOUS crew figure is a total, which is true of the catalogue rather
    // than of any one row. Repeating the literal thirty times is how it drifts.
    const f = parseTableFile(
      "crew",
      `meta:
  source: "NEBULOUS wiki"
  defaults:
    crew_basis: total
rows:
  - { id: cic, crew: 40 }
  - { id: berth, crew: 12, crew_basis: per_watch }
`,
    );
    const rows = [...f.groups.values()].flat();
    expect(f.defaults).toEqual({ crew_basis: "total" });
    expect(rows.find((r) => r.id === "cic")?.values.crew_basis).toBe("total");
    // A row wins over the file, so one exception stays expressible.
    expect(rows.find((r) => r.id === "berth")?.values.crew_basis).toBe("per_watch");
  });

  it("does not let meta.defaults masquerade as provenance", () => {
    const f = parseTableFile("x", `meta:
  defaults:
    crew_basis: total
rows:
  - { id: a }
`);
    // provisional is a first-class flag, not a column; defaults do not touch it.
    expect(f.provisional).toBe(false);
    expect([...f.groups.values()].flat()[0]?.provisional).toBe(false);
  });

  it("keeps a row's own provisional flag in an otherwise sourced file", () => {
    expect(radiators.provisional).toBe(false);
    const byId = (id: string) => [...radiators.groups.values()].flat().find((r) => r.id === id);
    expect(byId("tin-droplet")?.provisional).toBe(false);
    expect(byId("ldr-fine-mist")?.provisional).toBe(true);
  });
});

describe("addressing rows", () => {
  const set = new TableSet();
  set.add(parseTableFile("radiators", RADIATORS));
  set.add(parseTableFile("structures", STRUCTURES));

  it("resolves a bare id when it is unique", () => {
    const got = set.find("radiators", "mo-li-heat-pipe");
    expect("row" in got && got.row.group).toBe("physical");
  });

  it("refuses a bare id that appears in two groups, and names both", () => {
    // tin-droplet is a physical panel in one group and a Terra Invicta balance
    // row in the other; they share nothing but the name.
    const got = set.find("radiators", "tin-droplet");
    expect("error" in got).toBe(true);
    if (!("error" in got)) return;
    expect(got.error).toMatch(/ambiguous/);
    expect(got.error).toMatch(/"physical\/tin-droplet"/);
    expect(got.error).toMatch(/"game\/tin-droplet"/);
  });

  it("resolves a group-qualified id to the right row", () => {
    const physical = set.lookup("radiators", "physical/tin-droplet", "mass_kg_m2");
    const game = set.lookup("radiators", "game/tin-droplet", "mass_t_per_gw");
    expect("lookup" in physical && physical.lookup.value).toBe(6.4154);
    expect("lookup" in game && game.lookup.value).toBe(125);
  });

  it("explains a missing file, group, row or column", () => {
    expect(set.find("nope", "x")).toEqual({ error: expect.stringMatching(/no table "nope"/) });
    expect(set.find("radiators", "nope/x")).toEqual({ error: expect.stringMatching(/no group "nope"/) });
    expect(set.find("radiators", "physical/nope")).toEqual({ error: expect.stringMatching(/has no row "nope"/) });
    const col = set.lookup("radiators", "physical/tin-droplet", "nope");
    expect("error" in col && col.error).toMatch(/has no "nope" \(has: heat_cap_kw_m2, mass_kg_m2, op_temp_k\)/);
  });

  it("carries provisional out on every lookup", () => {
    const clean = set.lookup("radiators", "physical/tin-droplet", "mass_kg_m2");
    const guess = set.lookup("radiators", "physical_extras/ldr-fine-mist", "mass_kg_m2");
    const inherited = set.lookup("structures", "steel-frame", "structural_density_kg_m3");
    expect("lookup" in clean && clean.lookup.provisional).toBe(false);
    expect("lookup" in guess && guess.lookup.provisional).toBe(true);
    expect("lookup" in inherited && inherited.lookup.provisional).toBe(true);
  });

  it("lists every provisional row for the 'what in here is a guess' report", () => {
    expect(set.provisionalRows().map((r) => `${r.file}/${r.group}/${r.id}`).sort()).toEqual([
      "radiators/physical_extras/ldr-fine-mist",
      "structures/packing_efficiency/warship",
      "structures/rows/steel-frame",
    ]);
  });
});

describe("loading from a vault", () => {
  const vaultWith = async (files: Record<string, string>) => {
    const fs = new MemoryAdapter();
    await fs.mkdirAll(VAULT.tablesDir);
    for (const [name, text] of Object.entries(files)) await fs.writeText(`${VAULT.tablesDir}/${name}`, text);
    return fs;
  };

  it("reads every yaml in _tables/", async () => {
    const set = await loadTables(await vaultWith({ "radiators.yaml": RADIATORS, "structures.yaml": STRUCTURES }));
    expect(set.fileNames()).toEqual(["radiators", "structures"]);
    expect(set.rows("radiators")).toHaveLength(4);
    expect(set.problems).toEqual([]);
  });

  it("treats a missing _tables/ as empty, not as an error", async () => {
    const set = await loadTables(new MemoryAdapter());
    expect(set.fileNames()).toEqual([]);
    expect(set.problems).toEqual([]);
  });

  it("reports a file it cannot use without losing the rest", async () => {
    const set = await loadTables(await vaultWith({ "radiators.yaml": RADIATORS, "broken.yaml": "meta:\n  only: metadata\n" }));
    expect(set.fileNames()).toEqual(["broken", "radiators"]);
    expect(set.problems).toEqual(["broken.yaml: no rows found"]);
    expect(set.rows("radiators")).toHaveLength(4); // unaffected
  });
});

describe("repository integration", () => {
  it("loads tables and constraint sets when the vault opens, and seeds the base set", async () => {
    const { Repository } = await import("../src/core/repo");
    const fs = new MemoryAdapter();
    const repo = new Repository(fs);
    await repo.init();
    await fs.writeText(`${VAULT.tablesDir}/radiators.yaml`, RADIATORS);
    await repo.load();

    expect(repo.tables.fileNames()).toEqual(["radiators"]);
    expect(repo.tables.rows("radiators")).toHaveLength(4);
    expect(repo.designProblems).toEqual([]);
    // init() seeded _constraints/default.yaml, and load() read it back.
    expect([...repo.constraintSets.keys()]).toEqual(["default"]);
    expect(repo.effectiveConstraints().values.T_ENV).toBe(2.725);
  });
});
