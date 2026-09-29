import type { ReactNode } from "react";
import { useApp } from "./state";
import type { TypedRecord } from "../core/types";
import { analyseShip } from "../core/designer/ship";
import { provisionalParams } from "../core/designer/constraints";
import { AdvisoryList, AsciiBar, Empty, Group, Panel, Row, Value, ratioSeverity } from "./kit";

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : undefined);

/**
 * The craft record's budget panel.
 *
 * The three-pane ship editor is a later pass; this keeps the record editor's
 * panel working against the kernel: grouped figures, per-mode power and heat,
 * section fill as ASCII bars, which numbers rest on a provisional figure, and
 * the advisories grouped by severity. Nothing here refuses a save.
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
  const S = ({ k, v, unit, bad, mark, extra }: { k: string; v: string | undefined; unit?: string; bad?: boolean; mark?: boolean; extra?: ReactNode }) => (
    <Row label={k}>
      <Value v={v} unit={unit} tone={bad ? "violation" : undefined} provisional={mark} />
      {extra}
    </Row>
  );
  const ratedProvisional = b.provisional.includes("rated displacement and structure fraction");
  const propFraction = b.propellantCapacity_t > 0 ? b.propellant_t / b.propellantCapacity_t : undefined;

  return (
    <Panel title="BUDGET" meta="computed from hull + loadout" className="budget-panel">
      {b.lines.length === 0 && <Empty>NO MODULES IN THE LOADOUT. ADD MODULES ABOVE TO SEE BUDGETS.</Empty>}
      <Group title="MASS">
        <S k="DRY MASS" v={fmt(b.dryMass_t, 0)} unit="t" />
        <S k="WET MASS" v={fmt(b.wetMass_t, 0)} unit="t" />
        <S k={b.structureSource === "hand" ? "STRUCTURE (HAND-SET)" : "STRUCTURE"} v={fmt(b.structuralMass_t, 0)} unit={b.armorMass_t > 0 ? `t · ${fmt(b.armorMass_t, 0)} t armour` : "t"} />
        {b.ratedMass_t !== undefined && (
          <S
            k="RATED FULL LOAD"
            v={fmt(b.ratedMass_t, 0)}
            unit="t"
            bad={(b.structureFraction ?? 0) > 1}
            mark={ratedProvisional}
            extra={b.structureFraction !== undefined && <AsciiBar fraction={b.structureFraction} />}
          />
        )}
        <S
          k="PROPELLANT"
          v={`${fmt(b.propellant_t, 0)}${b.propellantCapacity_t ? ` / ${fmt(b.propellantCapacity_t, 0)}` : ""}`}
          unit="t"
          bad={propFraction !== undefined && propFraction > 1}
          extra={propFraction !== undefined && <AsciiBar fraction={propFraction} />}
        />
      </Group>

      <Group title="PROPULSION">
        <S k={b.stages.length > 1 ? `ΔV (${b.stages.length} STAGES)` : "ΔV"} v={fmt(b.deltaV_kms, 1)} unit="km/s" />
        <S k="THRUST" v={fmt(b.thrust_kN, 0)} unit="kN" />
        <S k="ISP" v={fmt(b.isp_s, 0)} unit="s" />
        <S k="ACCEL (WET → DRY)" v={`${fmt(b.accelWet_g, 2)} → ${fmt(b.accelDry_g, 2)}`} unit="g" />
        {b.attitude && <S k="TURN 90° (PITCH/YAW)" v={b.attitude.slew90_s > 0 ? fmt(b.attitude.slew90_s, 0) : undefined} unit="s" bad={b.attitude.slew90_s === 0} />}
        {b.attitude?.roll && <S k="ROLL 90°" v={b.attitude.roll.slew90_s > 0 ? fmt(b.attitude.roll.slew90_s, 0) : undefined} unit="s" />}
      </Group>

      <Group title="POWER & HEAT">
        <S k="POWER OUT − IN" v={`${fmt(b.powerOut_MW, 1)} − ${fmt(b.powerIn_MW, 1)} = ${fmt(b.powerMargin_MW, 1)}`} unit="MW" bad={b.powerIn_MW > 0 && b.powerMargin_MW < 0} />
        <S k="HEAT REJECTED − MADE" v={`${fmt(b.heatReject_MW, 0)} − ${fmt(b.heatOut_MW, 0)} = ${fmt(b.heatMargin_MW, 0)}`} unit="MW" bad={b.heatOut_MW > 0 && b.heatMargin_MW < 0} />
        {b.modes.length > 1 && (
          <table className="tbl modes">
            <thead>
              <tr>
                <th>MODE</th>
                <th className="num">POWER IN / OUT</th>
                <th className="num">HEAT, LOW-T</th>
                <th className="num">HEAT, HIGH-T</th>
                <th className="num">RADIATED</th>
              </tr>
            </thead>
            <tbody>
              {b.modes.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td className={"num" + (m.powerMargin_MW < 0 ? " tone-violation" : "")}>
                    {fmt(m.powerIn_MW)} / {fmt(m.powerOut_MW)} <span className="unit">MW</span>
                  </td>
                  <td className={"num" + (m.marginLow_MW < 0 ? " tone-violation" : "")}>
                    {fmt(m.heatLow_MW)} <span className="unit">MW</span>
                  </td>
                  <td className={"num" + (m.marginHigh_MW < 0 ? " tone-violation" : "")}>
                    {fmt(m.heatHigh_MW)} <span className="unit">MW</span>
                  </td>
                  <td className="num">
                    {fmt(m.radiated_kw, 0)} <span className="unit">kW</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Group>

      <Group title="CREW & COST">
        <S k="CREW" v={fmt(b.crew, 0)} unit={b.crewOnWatch > 0 ? `· ${fmt(b.crewOnWatch, 0)} on watch` : undefined} />
        <S k="COST" v={fmt(b.cost, 0)} unit="M$" />
      </Group>

      {b.sections.length > 0 && (
        <Group title="SECTIONS" meta={`${b.sections.length}`}>
          {b.sections.map((s) => {
            const f = s.usable_m3 > 0 ? s.used_m3 / s.usable_m3 : undefined;
            return (
              <Row key={s.id} label={s.id.toLocaleUpperCase("en")}>
                <AsciiBar fraction={f} severity={s.over_m3 > 0 ? "violation" : ratioSeverity(f)} />
                <Value v={`${fmt(s.used_m3, 0)} / ${fmt(s.usable_m3, 0)}`} unit="m³" tone={s.over_m3 > 0 ? "violation" : undefined} />
              </Row>
            );
          })}
        </Group>
      )}

      {b.provisional.length > 0 && <div className="provisional">Provisional: {b.provisional.join("; ")}.</div>}
      {b.assumptions.map((a, i) => (
        <div key={i} className="help">
          {a}
        </div>
      ))}

      <AdvisoryList advisories={advisories} detailOf={(v) => (v.field ? `field ${v.field}${v.mode ? ` · mode ${v.mode}` : ""}` : v.mode ? `mode ${v.mode}` : undefined)} />
    </Panel>
  );
}
