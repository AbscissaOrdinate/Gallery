/**
 * StatusBadge (docs/design-book/components/StatusBadge): the severities and
 * the three shapes they take — pip, badge, row. Every severity carries its
 * word; colour is the second channel, never the only one. Pips are square
 * (radius-0, STYLE.md §8). `border-3` appears only on rows.
 */
import type { ReactNode } from "react";
import type { Violation } from "../../core/designer/violations";
import { cx } from "./cx";
import { groupBySeverity, SEVERITY_WORD, uiSeverity, type UiSeverity } from "./severity";

export function Pip({ severity, title }: { severity: UiSeverity; title?: string }) {
  return <span className={cx("pip", `sev-${severity}`)} title={title ?? SEVERITY_WORD[severity]} aria-hidden={title ? undefined : true} />;
}

/** A pip with its word: the smallest form that still survives a monochrome screen. */
export function PipLabel({ severity, children }: { severity: UiSeverity; children?: ReactNode }) {
  return (
    <span className="pip-label">
      <Pip severity={severity} />
      {children ?? <span className={cx("stamp", `sev-text-${severity}`)}>{SEVERITY_WORD[severity]}</span>}
    </span>
  );
}

export function StatusBadge({ severity, count, children }: { severity: UiSeverity; count?: number; children?: ReactNode }) {
  return (
    <span className={cx("badge", `sev-text-${severity}`)}>
      {children ?? SEVERITY_WORD[severity]}
      {count !== undefined && <span className="badge-count">{count}</span>}
    </span>
  );
}

/** Wash ground and a border-3 left rule in the severity's mark colour. */
export function StatusRow({
  severity,
  id,
  message,
  detail,
  word = true,
  onClick,
  title,
}: {
  severity: UiSeverity;
  id?: ReactNode;
  message: ReactNode;
  detail?: ReactNode;
  /** Show the severity word at the right edge. Off inside a severity-grouped list, whose header carries it. */
  word?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <div className={cx("srow", `sev-row-${severity}`, onClick && "is-clickable")} onClick={onClick} title={title} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}>
      {id !== undefined && <span className="srow-id">{id}</span>}
      <span className="srow-body">
        <span className="srow-msg">{message}</span>
        {detail !== undefined && <span className="srow-detail">{detail}</span>}
      </span>
      {word && <span className={cx("stamp", `sev-text-${severity}`)}>{SEVERITY_WORD[severity]}</span>}
    </div>
  );
}

/** Identifier for a kernel advisory: its domain, else its source, else GENERAL. */
export const advisoryId = (v: Violation): string => (v.domain ?? v.source ?? "general").toLocaleUpperCase("en");

/**
 * An editor's advisory list: grouped by severity in fixed order (violation,
 * caution, info), counts in stamp in each group header. Never sorted by time —
 * time belongs to the log. An empty list reads NOMINAL.
 */
export function AdvisoryList({
  advisories,
  onGo,
  detailOf,
  empty = "Nothing to report. Advisories never block a save.",
}: {
  advisories: Violation[];
  onGo?: (v: Violation) => void;
  detailOf?: (v: Violation) => ReactNode;
  empty?: ReactNode;
}) {
  if (advisories.length === 0) return <StatusRow severity="nominal" id="ALL" message={empty} word />;
  return (
    <div className="adv-list">
      {groupBySeverity(advisories).map((g) => (
        <div key={g.severity} className="adv-group">
          <div className="adv-group-head">
            <PipLabel severity={g.severity} />
            <span className={cx("stamp", `sev-text-${g.severity}`)}>{g.violations.length}</span>
          </div>
          {g.violations.map((v, i) => (
            <StatusRow
              key={i}
              severity={uiSeverity(v.severity)}
              id={advisoryId(v)}
              message={v.message}
              detail={detailOf?.(v)}
              word={false}
              onClick={onGo ? () => onGo(v) : undefined}
              title={v.anchor?.station !== undefined ? `Show station ${v.anchor.station} m` : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
