/**
 * The document layer's primitives: ClassificationBanner, ClassificationBadge
 * and RedactionBar (docs/design-book/components/…, docs/STYLE.md §4).
 */
import type { ReactNode } from "react";
import type { HandlingLevel } from "../../core/types";
import { cx } from "./cx";
import type { UiSeverity } from "./severity";

/**
 * A banner-h strip carrying the record's marking, identical top and bottom.
 * One line; a long caveat list truncates with an ellipsis and the full marking
 * is on hover. Grounds by level; text on-accent only on top secret.
 */
export function ClassificationBanner({ text, level }: { text: string; level: HandlingLevel }) {
  return (
    <div className={cx("banner", `lvl-${level}`)} title={text} role="note" aria-label={`Classification: ${text}`}>
      {text}
    </div>
  );
}

export interface BadgeRow {
  key: string;
  value?: string;
  severity?: UiSeverity;
}

/**
 * The ACS-style block beside the record title: label-xs keys over stamp
 * values, clearance first, at most five rows. The only element at radius-2.
 * An unknown value is an em dash, never a dropped row.
 */
export function ClassificationBadge({ rows }: { rows: BadgeRow[] }) {
  return (
    <dl className="cbadge">
      {rows.slice(0, 5).map((r) => (
        <div key={r.key} className="cbadge-row">
          <dt>{r.key}</dt>
          <dd className={cx("stamp", r.value ? r.severity && `sev-text-${r.severity}` : "sev-text-pending")}>{r.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Bar widths that vary within a group so the block reads as data, not as a rule. */
const WIDTHS = ["w1", "w2", "w3", "w4"];

/**
 * A value the record does not yet hold: a `redact` bar at roughly the value's
 * natural width, DATA PENDING revealed on hover, no reflow. It means
 * incomplete, not restricted. In the editor a click reveals the field so the
 * gap can be filled (STYLE.md §7.1).
 */
export function RedactionBar({ seed, onReveal, label }: { seed: string; onReveal?: () => void; label?: ReactNode }) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <button type="button" className={cx("redact", WIDTHS[h % WIDTHS.length])} onClick={onReveal} title="Required, not yet on file. Click to fill it in.">
      <span className="pending">{label ?? "DATA PENDING"}</span>
    </button>
  );
}
