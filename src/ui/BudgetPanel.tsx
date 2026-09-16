import { useApp } from "./state";
import type { TypedRecord } from "../core/types";
import { computeBudget } from "../core/designer/budgets";

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "—");

export function BudgetPanel({ craft }: { craft: TypedRecord }) {
  const { repo } = useApp();
  if (!repo) return null;
  const hull = typeof craft.fields.hull === "string" ? repo.typed(craft.fields.hull) : undefined;
  const b = computeBudget(craft, hull, (id) => repo.typed(id));
  const Stat = ({ k, v, unit, warn }: { k: string; v: string; unit?: string; warn?: boolean }) => (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={"v" + (warn ? " warn" : "")}>
        {v}
        {unit && <small>{unit}</small>}
      </div>
    </div>
  );
  return (
    <div className={"card" + (b.warnings.length ? " warn" : "")}>
      <h3 style={{ marginTop: 0 }}>Budget (computed from hull + loadout)</h3>
      <div className="budget">
        <Stat k="Dry mass" v={fmt(b.dryMass_t, 0)} unit="t" />
        <Stat k="Wet mass" v={fmt(b.wetMass_t, 0)} unit="t" />
        <Stat k="Propellant" v={`${fmt(b.propellant_t, 0)}${b.propellantCapacity_t ? ` / ${fmt(b.propellantCapacity_t, 0)}` : ""}`} unit="t" warn={b.propellantCapacity_t > 0 && b.propellant_t > b.propellantCapacity_t} />
        <Stat k="Δv" v={fmt(b.deltaV_kms, 1)} unit="km/s" />
        <Stat k="Thrust" v={fmt(b.thrust_kN, 0)} unit="kN" />
        <Stat k="Isp" v={fmt(b.isp_s, 0)} unit="s" />
        <Stat k="Accel (wet → dry)" v={`${fmt(b.accelWet_g, 2)} → ${fmt(b.accelDry_g, 2)}`} unit="g" />
        <Stat k="Power" v={`${fmt(b.powerOut_MW, 1)} − ${fmt(b.powerIn_MW, 1)}`} unit={`= ${fmt(b.powerMargin_MW, 1)} MW`} warn={b.powerIn_MW > 0 && b.powerMargin_MW < 0} />
        <Stat k="Heat" v={`${fmt(b.heatReject_MW, 0)} − ${fmt(b.heatOut_MW, 0)}`} unit={`= ${fmt(b.heatMargin_MW, 0)} MW`} warn={b.heatOut_MW > 0 && b.heatMargin_MW < 0} />
        <Stat k="Cost" v={fmt(b.cost, 0)} unit="M$" />
        <Stat k="Crew" v={fmt(b.crew, 0)} />
      </div>
      {Object.keys(b.slotUse).length > 0 && (
        <div className="chips" style={{ marginTop: 8 }}>
          {Object.entries(b.slotUse).map(([k, v]) => (
            <span key={k} className={"chip" + (v.used > v.available && hull ? " warn" : "")}>
              {k}: {v.used}
              {hull ? ` / ${v.available}` : ""}
            </span>
          ))}
        </div>
      )}
      {b.warnings.length > 0 && (
        <ul className="warn" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {b.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {b.lines.length === 0 && <div className="muted">Add modules to the loadout above to see budgets.</div>}
    </div>
  );
}
