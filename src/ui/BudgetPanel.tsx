import { useApp } from "./state";
import type { TypedRecord } from "../core/types";
import { analyseShip } from "../core/designer/ship";
import { byDomain } from "../core/designer/violations";
import { provisionalParams } from "../core/designer/constraints";

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "—");

/**
 * The craft record's budget rail.
 *
 * The three-pane ship editor is the next pass; this keeps the record editor's
 * existing panel working against the new kernel, and adds the two things the
 * kernel made possible that the old panel could not show: the per-mode power
 * and heat columns, and which numbers rest on a provisional figure.
 */
export function BudgetPanel({ craft }: { craft: TypedRecord }) {
  const { repo } = useApp();
  if (!repo) return null;
  const eff = repo.effectiveConstraints();
  const { budget: b, advisories } = analyseShip(craft, {
    typed: (id) => repo.typed(id),
    tables: repo.tables,
    values: eff.values,
    provisionalParams: provisionalParams(eff),
  });
  /** `mark` puts the provisional marker on the figure itself, not only in the note below. */
  const Stat = ({ k, v, unit, warn, mark }: { k: string; v: string; unit?: string; warn?: boolean; mark?: boolean }) => (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={"v" + (warn ? " warn" : "")}>
        {mark && <span className="provisional inline" title="Rests on a provisional figure" />}
        {v}
        {unit && <small>{unit}</small>}
      </div>
    </div>
  );
  const ratedProvisional = b.provisional.includes("rated displacement and structure fraction");
  // `flagged`, not `warn`: `.warn` sets a colour, and on a card this size that
  // inherits down into every stat and every table cell, so the one figure that
  // is actually in trouble stops standing out. `flagged` only borders.
  const worst = advisories[0]?.severity;
  return (
    <div className={"card" + (worst === "error" || worst === "warn" ? " flagged" : "")}>
      <h3 style={{ marginTop: 0 }}>Budget (computed from hull + loadout)</h3>
      <div className="budget">
        <Stat k="Dry mass" v={fmt(b.dryMass_t, 0)} unit="t" />
        <Stat k="Wet mass" v={fmt(b.wetMass_t, 0)} unit="t" />
        <Stat k={b.structureSource === "hand" ? "Structure (hand-set)" : "Structure"} v={fmt(b.structuralMass_t, 0)} unit={b.armorMass_t > 0 ? `t · ${fmt(b.armorMass_t, 0)} t armour` : "t"} />
        {b.ratedMass_t !== undefined && (
          <Stat
            k="Rated full load"
            v={fmt(b.ratedMass_t, 0)}
            unit={b.structureFraction !== undefined ? `t · ${fmt(b.structureFraction * 100, 0)}% hull` : "t"}
            warn={(b.structureFraction ?? 0) >= 1}
            mark={ratedProvisional}
          />
        )}
        <Stat
          k="Propellant"
          v={`${fmt(b.propellant_t, 0)}${b.propellantCapacity_t ? ` / ${fmt(b.propellantCapacity_t, 0)}` : ""}`}
          unit="t"
          warn={b.propellantCapacity_t > 0 && b.propellant_t > b.propellantCapacity_t}
        />
        <Stat k={b.stages.length > 1 ? `Δv (${b.stages.length} stages)` : "Δv"} v={fmt(b.deltaV_kms, 1)} unit="km/s" />
        <Stat k="Thrust" v={fmt(b.thrust_kN, 0)} unit="kN" />
        <Stat k="Isp" v={fmt(b.isp_s, 0)} unit="s" />
        <Stat k="Accel (wet → dry)" v={`${fmt(b.accelWet_g, 2)} → ${fmt(b.accelDry_g, 2)}`} unit="g" />
        <Stat k="Power" v={`${fmt(b.powerOut_MW, 1)} − ${fmt(b.powerIn_MW, 1)}`} unit={`= ${fmt(b.powerMargin_MW, 1)} MW`} warn={b.powerIn_MW > 0 && b.powerMargin_MW < 0} />
        <Stat k="Heat" v={`${fmt(b.heatReject_MW, 0)} − ${fmt(b.heatOut_MW, 0)}`} unit={`= ${fmt(b.heatMargin_MW, 0)} MW`} warn={b.heatOut_MW > 0 && b.heatMargin_MW < 0} />
        <Stat k="Cost" v={fmt(b.cost, 0)} unit="M$" />
        <Stat k="Crew" v={fmt(b.crew, 0)} unit={b.crewOnWatch > 0 ? `· ${fmt(b.crewOnWatch, 0)} on watch` : undefined} />
        {b.attitude && <Stat k="Turn 90° (pitch/yaw)" v={b.attitude.slew90_s > 0 ? fmt(b.attitude.slew90_s, 0) : "—"} unit="s" warn={b.attitude.slew90_s === 0} />}
        {b.attitude?.roll && <Stat k="Roll 90°" v={b.attitude.roll.slew90_s > 0 ? fmt(b.attitude.roll.slew90_s, 0) : "—"} unit="s" />}
      </div>

      {b.modes.length > 1 && (
        <table className="tbl modes" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Mode</th>
              <th>Power in / out</th>
              <th>Heat, low-T</th>
              <th>Heat, high-T</th>
              <th>Radiated</th>
            </tr>
          </thead>
          <tbody>
            {b.modes.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td className={m.powerMargin_MW < 0 ? "warn" : undefined}>
                  {fmt(m.powerIn_MW)} / {fmt(m.powerOut_MW)} MW
                </td>
                <td className={m.marginLow_MW < 0 ? "warn" : undefined}>{fmt(m.heatLow_MW)} MW</td>
                <td className={m.marginHigh_MW < 0 ? "warn" : undefined}>{fmt(m.heatHigh_MW)} MW</td>
                <td>{fmt(m.radiated_kw, 0)} kW</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {b.sections.length > 0 && (
        <div className="chips" style={{ marginTop: 8 }}>
          {b.sections.map((s) => (
            <span key={s.id} className={"chip" + (s.over_m3 > 0 ? " warn" : "")}>
              {s.id}: {fmt(s.used_m3, 0)} / {fmt(s.usable_m3, 0)} m³
            </span>
          ))}
        </div>
      )}

      {b.provisional.length > 0 && <div className="muted provisional">Provisional: {b.provisional.join("; ")}.</div>}
      {b.assumptions.map((a, i) => (
        <div key={i} className="muted" style={{ marginTop: 4 }}>
          {a}
        </div>
      ))}

      {advisories.length > 0 &&
        byDomain(advisories).map((group) => (
          <div key={group.domain}>
            <div className="muted" style={{ marginTop: 6 }}>
              {group.domain}
            </div>
            <ul className="advisories" style={{ margin: "2px 0 0", paddingLeft: 18 }}>
              {group.violations.map((v, i) => (
                <li key={i} className={v.severity}>
                  {v.message}
                </li>
              ))}
            </ul>
          </div>
        ))}
      {b.lines.length === 0 && <div className="muted">Add modules to the loadout above to see budgets.</div>}
    </div>
  );
}
