/**
 * The ship kernel, assembled.
 *
 * Every caller — the ship editor, the budget panel, the fleet sheet, a test —
 * needs the same four things from a craft record: the loadout, the hull it
 * fills, the budget and the advisories. Assembling them by hand in each place
 * is how two callers end up passing slightly different contexts and reporting
 * slightly different numbers for the same ship.
 *
 * `analyseShip` takes a narrow view of the vault rather than the `Repository`
 * class, so `src/core/designer/` keeps its one-way dependency on the rest of
 * core and tests can hand it three functions instead of a filesystem.
 */
import { readHull } from "../hull/record";
import type { HullGeometry } from "../hull/types";
import { sortViolations, type Violation } from "../violations";
import { shipAdvisories, type ShipAdvisoryContext } from "./advisories";
import { shipBudget, type ShipBudget, type ShipContext, type TableLookupLike } from "./budget";
import { readShip } from "./record";
import { shipSilhouette, type ShipSilhouette } from "./silhouette";
import type { ShipLoadout } from "./types";

/** A record as the vault stores it, reduced to what the kernel reads. */
export interface SourceRecord {
  id: string;
  type: string;
  name: string;
  fields: Record<string, unknown>;
}

/** What the kernel needs from a vault. `Repository` satisfies this as it stands. */
export interface ShipSource {
  typed(id: string): SourceRecord | undefined;
  tables?: TableLookupLike;
  /** Bare parameter values from the effective constraint set. */
  values?: Record<string, number>;
  /** Which of those values are provisional, so what is derived from them keeps the marker. */
  provisionalParams?: string[];
}

export interface ShipAnalysis {
  ship: ShipLoadout;
  hull?: HullGeometry;
  hullRecord?: SourceRecord;
  styleRecord?: SourceRecord;
  busRecord?: SourceRecord;
  budget: ShipBudget;
  /** Budget and loadout advisories together, worst first. */
  advisories: Violation[];
  silhouette?: ShipSilhouette;
}

/**
 * Read a craft, measure it, and say what is wrong with it.
 *
 * Never throws: a craft with no hull, a hull that has been deleted and a module
 * reference into thin air all produce a budget and an advisory saying so, per
 * `docs/CLAUDE.md`'s "nothing is ever blocked from saving".
 */
export function analyseShip(craft: SourceRecord, source: ShipSource): ShipAnalysis {
  const ship = readShip(craft.fields);
  const hullRecord = ship.hull ? source.typed(ship.hull) : undefined;
  const hull = hullRecord ? readHull(hullRecord.fields) : undefined;
  const styleId = typeof hullRecord?.fields.style === "string" ? hullRecord.fields.style : undefined;
  const busId = typeof hullRecord?.fields.bus === "string" ? hullRecord.fields.bus : undefined;
  const styleRecord = styleId ? source.typed(styleId) : undefined;
  const busRecord = busId ? source.typed(busId) : undefined;
  const moduleFields = (id: string): Record<string, unknown> | undefined => {
    const record = source.typed(id);
    return record && record.type === "module" ? record.fields : undefined;
  };

  const ctx: ShipContext = { module: moduleFields };
  if (hull) ctx.hull = hull;
  if (hullRecord) ctx.hullFields = hullRecord.fields;
  if (source.tables) ctx.tables = source.tables;
  if (source.values) ctx.params = source.values;
  if (source.provisionalParams) ctx.provisionalParams = source.provisionalParams;

  const budget = shipBudget(ship, ctx);
  const advisoryCtx: ShipAdvisoryContext = { ...ctx };
  if (busRecord) advisoryCtx.bus = { id: busRecord.id, ...(busRecord.fields as Record<string, unknown>) };
  const advisories = sortViolations([...budget.advisories, ...shipAdvisories(ship, budget, advisoryCtx)]);

  const analysis: ShipAnalysis = { ship, budget, advisories };
  if (hull) {
    analysis.hull = hull;
    const options: Parameters<typeof shipSilhouette>[2] = { module: moduleFields };
    if (styleRecord) options.style = styleRecord.fields;
    analysis.silhouette = shipSilhouette(hull, ship, options);
  }
  if (hullRecord) analysis.hullRecord = hullRecord;
  if (styleRecord) analysis.styleRecord = styleRecord;
  if (busRecord) analysis.busRecord = busRecord;
  return analysis;
}

export { shipBudget, shipAdvisories, readShip, shipSilhouette };
export type { ShipBudget, ShipContext, ShipLoadout, ShipSilhouette };
