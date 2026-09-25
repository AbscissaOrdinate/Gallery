/**
 * Tabs (docs/design-book/components/Tabs): three flat, square forms.
 *
 * - Primary bar: top-level switch at control-lg; active = accent-700 ground,
 *   accent-300 label and a border-3 accent-500 underline.
 * - Panel tabs: on a panel header at control-md; the active tab inverts to the
 *   panel ground with a border-2 accent-500 rule on top. Counts follow in data-sm.
 * - Segmented switch: mutually exclusive display modes, at most four segments;
 *   the selected segment fills accent-500 with an on-accent label. Never an action.
 *
 * A tab whose panel holds nothing is shown disabled with a zero count, not hidden.
 */
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  count?: number;
  /** Colour the count when it counts things needing attention. */
  tone?: "caution" | "violation";
  disabled?: boolean;
  title?: string;
}

export function PrimaryTabs<T extends string>({ items, active, onChange }: { items: TabItem<T>[]; active: T; onChange: (id: T) => void }) {
  return (
    <nav className="tabs-primary" role="tablist">
      {items.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === active} disabled={t.disabled} title={t.title} className={cx("tab", t.id === active && "is-active")} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export function PanelTabs<T extends string>({ items, active, onChange, trailing }: { items: TabItem<T>[]; active: T; onChange: (id: T) => void; trailing?: ReactNode }) {
  return (
    <div className="tabs-panel" role="tablist">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          disabled={t.disabled || t.count === 0}
          title={t.title}
          className={cx("ptab", t.id === active && "is-active")}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count !== undefined && <span className={cx("count", t.tone && `tone-${t.tone}`)}>{t.count}</span>}
        </button>
      ))}
      {trailing !== undefined && <span className="tabs-trailing">{trailing}</span>}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  /** Accessible name for the group. */
  label: string;
}) {
  return (
    <span className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} disabled={o.disabled} title={o.title} className={cx("seg-item", o.value === value && "is-active")} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </span>
  );
}
