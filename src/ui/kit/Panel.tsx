/**
 * PanelNesting (docs/design-book/components/PanelNesting): panel → group →
 * field, each one step up the surface ramp. Three levels is the limit; a
 * fourth means split the pane. Everything is square and bordered, elev-0.
 */
import type { ReactNode } from "react";
import { cx } from "./cx";

/** Outer panel on surface-200 with a surface-300 header strip. */
export function Panel({
  title,
  meta,
  actions,
  tabs,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  /** Right side of the header, in data-sm on ink-300 (a count, a status). */
  meta?: ReactNode;
  /** Commands in the header, pushed right after `meta`. */
  actions?: ReactNode;
  /** Panel tabs replace the plain header. */
  tabs?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section className={cx("panel", className)} id={id}>
      {tabs}
      {!tabs && (title !== undefined || meta !== undefined || actions !== undefined) && (
        <header className="panel-head">
          <span className="panel-title">{title}</span>
          {meta !== undefined && <span className="panel-meta">{meta}</span>}
          {actions}
        </header>
      )}
      {children !== undefined && <div className={cx("panel-body", bodyClassName)}>{children}</div>}
    </section>
  );
}

/** A group inside a panel, on surface-300, headed by a label-sm name. */
export function Group({ title, meta, children, className }: { title?: ReactNode; meta?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx("group", className)}>
      {(title !== undefined || meta !== undefined) && (
        <div className="group-head">
          <span className="group-title">{title}</span>
          {meta !== undefined && <span className="group-meta">{meta}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/** A label/value row; rows are separated by line-100 hairlines, never by space alone. */
export function Row({ label, children, title, className }: { label: ReactNode; children?: ReactNode; title?: string; className?: string }) {
  return (
    <div className={cx("frow", className)} title={title}>
      <span className="flabel">{label}</span>
      <span className="fvalue">{children}</span>
    </div>
  );
}

/**
 * A measured value in mono with its unit in ink-300. An unknown value is an
 * em dash in ink-300, never "N/A" and never blank (STYLE.md §1).
 */
export function Value({ v, unit, provisional, tone, title }: { v: ReactNode | undefined; unit?: ReactNode; provisional?: boolean; tone?: "violation" | "caution"; title?: string }) {
  if (v === undefined || v === null || v === "" || v === "—") return <span className="val unknown">—</span>;
  return (
    <span className={cx("val", tone && `tone-${tone}`)} title={title}>
      {provisional && <span className="provisional inline" title="Rests on a provisional figure" />}
      {v}
      {unit !== undefined && unit !== "" && <span className="unit">{unit}</span>}
    </span>
  );
}

/** One line of fact and remedy (voice rules): "No survey on file. Attach a record to populate." */
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
