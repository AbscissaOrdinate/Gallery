/**
 * Operating modes (`gallery/05` §3.5.1).
 *
 * A mode is a per-component duty setting, and the budget reports power, heat
 * and (later) signature per mode. This replaces the ad-hoc peak/sustained
 * split: "peak" is the mode where everything that can run is running, and
 * "sustained" is whatever mode the ship actually cruises in.
 *
 * ## One rule in the engine, one opinion in the template
 *
 * The **engine**'s rule is plain and has no policy in it: a component a mode
 * does not name runs at `full`. So a ship with no modes at all budgets exactly
 * as it did before modes existed, which is what keeps the regression gate
 * meaningful.
 *
 * The opinion — that a cruising ship's guns are cold and an EMCON ship's
 * emitters are off — lives in `modeTemplates()`, which the editor uses to
 * *seed the record*. Once seeded it is authored data: visible, editable and
 * saved. An assumption on the record is a thing the user can argue with; the
 * same assumption buried in the engine is not.
 *
 * ## Thrust is not a mode
 *
 * Duty scales power and heat. It does not scale thrust or Isp: Δv is a
 * manoeuvre figure, not a steady state, and a drive listed `off` in EMCON is
 * off because it is not burning, not because it burns at reduced thrust.
 */
import type { ModuleSpec } from "./module";
import type { Duty, OperatingMode, ShipLoadout } from "./types";

/** The duty a mode gives a component. Unnamed components run at `full`. */
export function dutyFor(mode: OperatingMode | undefined, componentId: string): Duty {
  const d = mode?.duties[componentId];
  return d === undefined ? "full" : d;
}

export interface DutyDraw {
  /** Fraction of the module's declared draw and heat this duty represents. */
  fraction: number;
  /** Power drawn in MW, which is not always `fraction × power_in_MW`. */
  draw_MW: number;
  /** True when `standby` was asked for and the module declares no standby draw. */
  standbyUnknown: boolean;
}

/**
 * What a duty costs.
 *
 * `standby` is the only setting that is not a fraction: a module idling but
 * available draws whatever it declares, which is not a share of its full draw.
 * A module that declares no standby figure is modelled as **off** and the
 * caller is told, because the alternative — picking a fraction — would put an
 * invented number into a power budget.
 */
export function dutyDraw(spec: ModuleSpec, duty: Duty): DutyDraw {
  if (duty === "off") return { fraction: 0, draw_MW: 0, standbyUnknown: false };
  if (duty === "standby") {
    const declared = spec.power_standby_MW;
    if (declared === undefined) return { fraction: 0, draw_MW: 0, standbyUnknown: spec.power_in_MW > 0 };
    const fraction = spec.power_in_MW > 0 ? declared / spec.power_in_MW : 0;
    return { fraction, draw_MW: declared, standbyUnknown: false };
  }
  const fraction = duty === "full" ? 1 : duty;
  return { fraction, draw_MW: spec.power_in_MW * fraction, standbyUnknown: false };
}

/** The implicit mode a ship with no modes runs in: everything at full. */
export const FULL_MODE: OperatingMode = { id: "full", name: "Full", duties: {} };

/** The modes a budget reports, which is the record's own set or the implicit one. */
export function modesOf(ship: ShipLoadout): OperatingMode[] {
  return ship.modes.length ? ship.modes : [FULL_MODE];
}

/**
 * Starting duties for the three default modes, by module category.
 *
 * This is the opinion, stated once. A weapon is cold in cruise; point defence
 * idles rather than sleeping, because a PD mount that needs a spin-up is not
 * point defence; drives, reactors and radiators run in both. EMCON is defined
 * by emission, not by category — see `modeTemplates`.
 */
const TEMPLATE: Record<string, { cruise: Duty; combat: Duty }> = {
  drive: { cruise: "full", combat: "full" },
  reactor: { cruise: "full", combat: "full" },
  radiator: { cruise: "full", combat: "full" },
  "weapon-kinetic": { cruise: "off", combat: "full" },
  "weapon-laser": { cruise: "off", combat: "full" },
  "weapon-particle": { cruise: "off", combat: "full" },
  "weapon-missile": { cruise: "off", combat: "full" },
  "point-defense": { cruise: "standby", combat: "full" },
  sensor: { cruise: "full", combat: "full" },
  ew: { cruise: "off", combat: "full" },
};

export interface TemplateComponent {
  id: string;
  spec?: ModuleSpec;
}

/**
 * The three default modes as a starting point, written onto the record.
 *
 * EMCON is the one that earns its keep: everything that radiates goes off,
 * decided by the module's own `radiated_power_kw` rather than by guessing which
 * categories emit. A passive sensor keeps running; the radar that shares its
 * category does not.
 */
export function modeTemplates(components: TemplateComponent[]): OperatingMode[] {
  const cruise: Record<string, Duty> = {};
  const combat: Record<string, Duty> = {};
  const emcon: Record<string, Duty> = {};
  for (const { id, spec } of components) {
    if (!spec) continue;
    const t = TEMPLATE[spec.category];
    if (t) {
      if (t.cruise !== "full") cruise[id] = t.cruise;
      if (t.combat !== "full") combat[id] = t.combat;
    }
    // EMCON silences emitters and anything a cruising ship already shuts down.
    if (spec.radiated_power_kw > 0) emcon[id] = "off";
    else if (t && t.cruise !== "full") emcon[id] = t.cruise;
  }
  return [
    { id: "cruise", name: "Cruise", duties: cruise, note: "Transit: weapons cold, sensors up." },
    { id: "combat", name: "Combat", duties: combat, note: "Everything that can run, running." },
    { id: "emcon", name: "EMCON (silent)", duties: emcon, note: "Passive only — every module that radiates is off." },
  ];
}
