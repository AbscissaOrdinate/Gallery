/**
 * Constraint sets — `<vault>/_constraints/*.yaml` (§2.8).
 *
 * Two jobs in one file. A constraint set carries:
 *
 *  - **rules** the designer checks a craft against (tech ceilings, slot
 *    compatibility, mass-fraction limits), each with a severity; and
 *  - **engine parameters** the budget engine and the expression layer read —
 *    `T_ENV`, the target-acceleration and closing-speed assumptions, the
 *    automation factor, life-support consumption, and the reference sensor
 *    thresholds signature ranges are quoted against.
 *
 * A craft's metadata names an **era**, a **faction** and a **corporation /
 * design bureau**; the effective set is the composition of all three, bureau
 * overriding faction overriding era. Each named set may also `extends` another,
 * resolved ancestors-first before the set itself applies.
 *
 * **Nothing is ever blocked from saving.** A rule produces a violation, and a
 * craft that breaks its era's ceilings saves with a banner and can carry an
 * `experimental: true` flag deliberately.
 *
 * Every parameter is an object, not a bare number, so it can carry the `source`
 * §0 demands and a `provisional` flag when it is an assumption rather than a
 * looked-up figure. An assumption that silently looks like a measurement is
 * exactly the failure mode §0 exists to prevent.
 */
import YAML from "yaml";
import type { StorageAdapter } from "../storage/adapter";
import { joinPath } from "../storage/adapter";
import { VAULT } from "../types";
import { violation, type Severity, type Violation } from "./violations";
import { DIMENSIONLESS, dimName, type Dim } from "./expr/dimension";

export type ConstraintScope = "base" | "era" | "faction" | "bureau";

export interface ConstraintParam {
  value: number;
  unit?: string;
  /** Citation, per §0. Absent on a pure design assumption. */
  source?: string;
  /** True when the figure is an assumption rather than a sourced measurement. */
  provisional?: boolean;
  note?: string;
}

export interface ConstraintRule {
  id: string;
  severity: Severity;
  /** Stat this rule judges, e.g. "isp_s". */
  field?: string;
  min?: number;
  max?: number;
  /** Shown instead of the generated message when present. */
  message?: string;
  note?: string;
}

export interface ConstraintSet {
  id: string;
  name: string;
  scope: ConstraintScope;
  /** Another set's id, applied before this one. */
  extends?: string;
  params: Record<string, ConstraintParam>;
  rules: ConstraintRule[];
}

export interface EffectiveConstraints {
  params: Record<string, ConstraintParam>;
  /** Parameter name → id of the set that supplied the winning value. */
  provenance: Record<string, string>;
  rules: ConstraintRule[];
  /** Bare numbers, which is what the expression layer wants. */
  values: Record<string, number>;
  /** Set ids in the order they were applied, lowest precedence first. */
  applied: string[];
  violations: Violation[];
}

// ---------------------------------------------------------------------------
// The engine parameters the rest of phase 3 will read
// ---------------------------------------------------------------------------

export interface EngineParamSpec {
  name: string;
  dim: Dim;
  unit: string;
  /** What breaks without it. */
  usedBy: string;
  /**
   * True when it is a physical figure that can be cited; false when it is a
   * campaign assumption someone has to choose. The distinction matters: §0
   * forbids inventing the first kind, and nobody can look up the second.
   */
  physical: boolean;
}

/**
 * Declared here rather than invented in a seed file. A parameter that is
 * declared but unset is visible (`missingParams`) instead of silently
 * defaulting to a number nobody chose.
 */
export const ENGINE_PARAMS: EngineParamSpec[] = [
  { name: "T_ENV", dim: [0, 0, 0, 1], unit: "K", usedBy: "radiator rejection, hull re-radiation, IR signature", physical: true },
  { name: "target_accel_g", dim: [0, 1, -2, 0], unit: "g", usedBy: "weapon effective range (§3), missile reach (§5)", physical: false },
  { name: "closing_speed_kps", dim: [0, 1, -1, 0], unit: "km/s", usedBy: "missile reach, warning-receiver warning time", physical: false },
  { name: "automation_factor", dim: DIMENSIONLESS, unit: "×", usedBy: "crew total (§3)", physical: false },
  { name: "kg_per_crew_day", dim: [1, 0, 0, 0], unit: "kg/crew-day", usedBy: "consumables mass, endurance (§3)", physical: false },
  { name: "max_topoff_count", dim: DIMENSIONLESS, unit: "transfers", usedBy: "fleet tender solver (§6)", physical: false },
  { name: "ref_ir_min_flux_w_m2", dim: [1, 0, -3, 0], unit: "W/m²", usedBy: "EO/IR detection range (§3)", physical: false },
  { name: "ref_radar_power_mw", dim: [1, 2, -3, 0], unit: "MW", usedBy: "radar detection range (§3)", physical: false },
  { name: "ref_esm_sensitivity_w", dim: [1, 2, -3, 0], unit: "W", usedBy: "passive RF detection range (§3)", physical: false },
  {
    name: "max_gimbal_deg",
    dim: DIMENSIONLESS,
    unit: "°",
    usedBy: "thrust-line balance (§3): how far a drive can vector to aim through the centre of gravity",
    physical: false,
  },
  { name: "cell_pitch_m", dim: [0, 1, 0, 0], unit: "m", usedBy: "laying NEBULOUS-catalogue mounts out along the spine", physical: false },
  { name: "structure_density_kg_m3", dim: [1, -3, 0, 0], unit: "kg/m³", usedBy: "structural mass from internal density (docs/UNITS.md §9)", physical: true },
  { name: "design_density_t_m3", dim: [1, -3, 0, 0], unit: "t/m³", usedBy: "rated full-load displacement and structure fraction (docs/UNITS.md §9)", physical: false },
  { name: "structure_cost_per_t", dim: DIMENSIONLESS, unit: "cost/t", usedBy: "structural cost (docs/UNITS.md §9)", physical: false },
  { name: "cell_volume_m3", dim: [0, 3, 0, 0], unit: "m³", usedBy: "internal volume budgets for NEBULOUS-catalogue compartments", physical: false },
];

const PARAM_BY_NAME = new Map(ENGINE_PARAMS.map((p) => [p.name, p]));

/** Declared engine parameters that no set in scope supplies. */
export function missingParams(eff: EffectiveConstraints): EngineParamSpec[] {
  return ENGINE_PARAMS.filter((p) => eff.params[p.name] === undefined);
}

// ---------------------------------------------------------------------------
// Built-in default
// ---------------------------------------------------------------------------

/**
 * The base set. It carries only figures that can be cited. The campaign
 * assumptions in `ENGINE_PARAMS` are deliberately absent — see §0, and
 * `missingParams()` for what still needs a decision.
 */
export const DEFAULT_CONSTRAINT_SET: ConstraintSet = {
  id: "default",
  name: "Default — sourced physical figures only",
  scope: "base",
  params: {
    T_ENV: {
      value: 2.725,
      unit: "K",
      source: "Fixsen 2009, 'The Temperature of the Cosmic Microwave Background', ApJ 707:916 — T_CMB = 2.72548 ± 0.00057 K",
      note: "The coldest sink a radiator can see, with no nearby body or star in view. A set modelling a ship close to a planet or the sun should raise this.",
    },
    // The two NEBULOUS-import conventions, decided 2026-09-19. Provisional because they
    // are inferences about an abstract game grid, not cited figures — so every volume
    // derived from them carries the provisional marker. Reasoning in docs/UNITS.md §4.
    // Delegated 2026-09-20. Neither is a physical constant; both are campaign
    // assumptions, so both are provisional and both are stated rather than
    // buried in the engine.
    automation_factor: {
      value: 1.0,
      unit: "×",
      provisional: true,
      note: "No adjustment. Module crew figures are authored for their own era — the NEBULOUS and Terra Invicta catalogues already reflect the automation their settings assume — so a global multiplier on top of them would count the same automation twice. An era or faction set that wants a deliberately leaner or heavier bill should override this; the base set does not guess one.",
    },
    kg_per_crew_day: {
      value: 3.0,
      unit: "kg/crew-day",
      provisional: true,
      note: "A design assumption sitting between open-loop resupply and a closed water/air loop, not a measured figure. Verify against NASA's Baseline Values and Assumptions Document (BVAD) before trusting a consumables mass or an endurance figure that depends on it.",
    },
    cell_pitch_m: {
      value: 3.0,
      unit: "m",
      provisional: true,
      note: "Bounded above by the C90 600 mm gun (12 cells on its long axis; a 600 mm L/50 barrel plus breech is ~36 m) and corroborated by height-1 compartments reading as 3 m decks. Only for placing mounts along the spine — never as a bounding box, since a cells triple's axis order is unreliable.",
    },
    cell_volume_m3: {
      value: 27,
      unit: "m³",
      provisional: true,
      note: "Floored by NEBULOUS's own magazine capacities: capacity_per_slot_size is m3 per cell (a 4x1x8 Reinforced Magazine reads 320 m3 = 32 cells x 10), and bulk-magazine is 15 m3 per cell, so a cell cannot be under 15 m3. This falsifies the earlier 2 m/cell (8 m3). At 27 m3 a bulk magazine runs at 56% stowage efficiency.",
    },
    // The structural-mass law, ruled 2026-09-23 (docs/UNITS.md §9).
    structure_density_kg_m3: {
      value: 7850,
      unit: "kg/m³",
      source: "_tables/armor.yaml row `steel` — Terra Invicta Official Wiki, Ship Armor List (retrieved 2026-09-14)",
      note: "The plate the decks and bulkheads are made of. Internal density (cm/m) is the share of the volume that is plate; times this, its mass.",
    },
    design_density_t_m3: {
      value: 0.715,
      unit: "t/m³",
      provisional: true,
      note: "Rated full-load mass per m³ of usable volume. Calibrated so the 138 m DD anchor rates at 8,000 t — the NEBULOUS example destroyer, ruled the baseline by the vault owner on 2026-09-24 over the Arleigh Burke Flight III's ~9,900 t (which would make it 0.885). Provisional because it is a calibration, not a measurement. A set for a lighter or denser-built navy should override it.",
    },
    structure_cost_per_t: {
      value: 0.14,
      unit: "cost/t",
      provisional: true,
      note: "Calibrated so the DD anchor's structure and armour (2,706 t under the law) cost the 380 its hand-set structural_cost used to say. Carries that placeholder's authority, no more.",
    },
  },
  rules: [],
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const SCOPES: ConstraintScope[] = ["base", "era", "faction", "bureau"];
const SEVERITIES: Severity[] = ["error", "warn", "info"];

function parseParam(raw: unknown): ConstraintParam | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return { value: raw, provisional: true, note: "Written as a bare number, so it carries no source." };
  if (!isObject(raw) || typeof raw.value !== "number" || !Number.isFinite(raw.value)) return undefined;
  return {
    value: raw.value,
    unit: typeof raw.unit === "string" ? raw.unit : undefined,
    source: typeof raw.source === "string" ? raw.source : undefined,
    provisional: raw.provisional === true || typeof raw.source !== "string",
    note: typeof raw.note === "string" ? raw.note : undefined,
  };
}

export function parseConstraintSet(id: string, text: string): { set?: ConstraintSet; problems: string[] } {
  const problems: string[] = [];
  const doc = YAML.parse(text);
  if (!isObject(doc)) return { problems: [`${id}: not a mapping`] };

  const params: Record<string, ConstraintParam> = {};
  if (isObject(doc.params)) {
    for (const [name, raw] of Object.entries(doc.params)) {
      const p = parseParam(raw);
      if (!p) {
        problems.push(`${id}: parameter "${name}" has no usable numeric value`);
        continue;
      }
      const spec = PARAM_BY_NAME.get(name);
      if (spec && p.unit && p.unit !== spec.unit) problems.push(`${id}: parameter "${name}" is declared in ${spec.unit} (${dimName(spec.dim)}) but this set gives ${p.unit}`);
      params[name] = p;
    }
  }

  const rules: ConstraintRule[] = [];
  if (Array.isArray(doc.rules)) {
    for (const [i, raw] of doc.rules.entries()) {
      if (!isObject(raw)) {
        problems.push(`${id}: rule ${i + 1} is not a mapping`);
        continue;
      }
      const severity = SEVERITIES.includes(raw.severity as Severity) ? (raw.severity as Severity) : "warn";
      if (!SEVERITIES.includes(raw.severity as Severity)) problems.push(`${id}: rule ${i + 1} has no valid severity, treating it as "warn"`);
      rules.push({
        id: typeof raw.id === "string" ? raw.id : `${id}-rule-${i + 1}`,
        severity,
        field: typeof raw.field === "string" ? raw.field : undefined,
        min: typeof raw.min === "number" ? raw.min : undefined,
        max: typeof raw.max === "number" ? raw.max : undefined,
        message: typeof raw.message === "string" ? raw.message : undefined,
        note: typeof raw.note === "string" ? raw.note : undefined,
      });
    }
  }

  const scope = SCOPES.includes(doc.scope as ConstraintScope) ? (doc.scope as ConstraintScope) : "base";
  return {
    set: {
      id: typeof doc.id === "string" ? doc.id : id,
      name: typeof doc.name === "string" ? doc.name : id,
      scope,
      extends: typeof doc.extends === "string" ? doc.extends : undefined,
      params,
      rules,
    },
    problems,
  };
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export interface ConstraintSelection {
  /** Base set, applied first. Defaults to "default". */
  base?: string;
  era?: string;
  faction?: string;
  bureau?: string;
}

/**
 * Compose the sets a craft is judged by: base, then era, then faction, then
 * bureau — each one's `extends` ancestors applied before it, and each later
 * layer overriding the earlier ones parameter by parameter.
 */
export function composeConstraints(sets: ConstraintSet[] | Map<string, ConstraintSet>, selection: ConstraintSelection = {}): EffectiveConstraints {
  const byId = sets instanceof Map ? sets : new Map(sets.map((s) => [s.id, s]));
  const violations: Violation[] = [];
  const params: Record<string, ConstraintParam> = {};
  const provenance: Record<string, string> = {};
  const rules: ConstraintRule[] = [];
  const applied: string[] = [];
  const seen = new Set<string>();

  const apply = (id: string, chain: string[], role: string): void => {
    if (chain.includes(id)) {
      violations.push(violation("warn", `Constraint set "${id}" extends itself (${[...chain, id].join(" → ")}); the loop is ignored.`, { source: "constraints" }));
      return;
    }
    const set = byId.get(id);
    if (!set) {
      violations.push(violation("warn", `This craft names the ${role} constraint set "${id}", which is not in _constraints/.`, { source: "constraints" }));
      return;
    }
    if (set.extends) apply(set.extends, [...chain, id], `${role} (inherited by "${id}")`);
    if (seen.has(id)) return;
    seen.add(id);
    for (const [name, param] of Object.entries(set.params)) {
      params[name] = param;
      provenance[name] = id;
    }
    for (const rule of set.rules) {
      const at = rules.findIndex((r) => r.id === rule.id);
      if (at >= 0) rules[at] = rule;
      else rules.push(rule);
    }
    applied.push(id);
  };

  apply(selection.base ?? DEFAULT_CONSTRAINT_SET.id, [], "base");
  if (selection.era) apply(selection.era, [], "era");
  if (selection.faction) apply(selection.faction, [], "faction");
  if (selection.bureau) apply(selection.bureau, [], "bureau");

  const values: Record<string, number> = {};
  for (const [name, p] of Object.entries(params)) values[name] = p.value;

  return { params, provenance, rules, values, applied, violations };
}

/** Parameters in force that are assumptions rather than cited figures. */
export function provisionalParams(eff: EffectiveConstraints): string[] {
  return Object.entries(eff.params)
    .filter(([, p]) => p.provisional)
    .map(([name]) => name)
    .sort();
}

// ---------------------------------------------------------------------------
// Vault I/O
// ---------------------------------------------------------------------------

export async function loadConstraints(fs: StorageAdapter, dir: string = VAULT.constraintsDir): Promise<{ sets: Map<string, ConstraintSet>; problems: string[] }> {
  const sets = new Map<string, ConstraintSet>([[DEFAULT_CONSTRAINT_SET.id, DEFAULT_CONSTRAINT_SET]]);
  const problems: string[] = [];
  let entries;
  try {
    entries = await fs.list(dir);
  } catch {
    return { sets, problems };
  }
  for (const e of entries) {
    if (e.isDir || !/\.ya?ml$/i.test(e.name)) continue;
    const id = e.name.replace(/\.ya?ml$/i, "");
    try {
      const { set, problems: p } = parseConstraintSet(id, await fs.readText(joinPath(dir, e.name)));
      problems.push(...p);
      // The vault's copy of the base set wins parameter by parameter, not
      // wholesale. It is seeded once and never overwritten, so a vault seeded
      // before a parameter existed would otherwise never see it — which is
      // exactly how automation_factor and kg_per_crew_day, delegated on
      // 2026-09-20, never reached a vault seeded on the 19th.
      if (set && set.id === DEFAULT_CONSTRAINT_SET.id) sets.set(set.id, { ...set, params: { ...DEFAULT_CONSTRAINT_SET.params, ...set.params } });
      else if (set) sets.set(set.id, set);
    } catch (err) {
      problems.push(`${e.name}: ${(err as Error).message}`);
    }
  }
  return { sets, problems };
}

/** Write the built-in default where it is missing. Never overwrites. */
export async function seedConstraints(fs: StorageAdapter, dir: string = VAULT.constraintsDir): Promise<number> {
  await fs.mkdirAll(dir);
  const path = joinPath(dir, `${DEFAULT_CONSTRAINT_SET.id}.yaml`);
  if (await fs.exists(path)) return 0;
  const header = [
    "# Base constraint set.",
    "#",
    "# Per section 0 of the designer spec this carries only figures with a citation.",
    "# The campaign assumptions the engine also needs -- target acceleration, closing",
    "# speed, automation factor, life-support consumption, the reference sensor",
    "# thresholds -- are deliberately absent: they are choices, not measurements, and",
    "# the designer lists them as unset rather than invent them.",
    "",
  ].join("\n");
  await fs.writeText(path, header + YAML.stringify(DEFAULT_CONSTRAINT_SET, { lineWidth: 100 }));
  return 1;
}
