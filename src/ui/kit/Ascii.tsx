/**
 * AsciiIndicators (docs/design-book/components/AsciiIndicators): progress,
 * capacity, waiting and hierarchy in monospace characters. There is no
 * graphical progress bar and no graphical spinner in Gallery. Only the spinner
 * and the indeterminate bar animate, and both stop under reduced motion
 * (theme.css).
 */
import type { ReactNode } from "react";
import { cx } from "./cx";
import { asciiBar, asciiMeter, ratioSeverity, type UiSeverity } from "./severity";

/** `[#######---] 71%` — bar and figure coloured together by severity. Ten cells always. */
export function AsciiBar({ fraction, severity, figure }: { fraction: number | undefined; severity?: UiSeverity; figure?: ReactNode }) {
  const sev = severity ?? ratioSeverity(fraction);
  const measured = fraction !== undefined && Number.isFinite(fraction);
  const bar = asciiBar(fraction);
  return (
    <span className={cx("ascii-bar", `sev-text-${measured ? sev : "pending"}`)}>
      {/* Brackets stay uncoloured (README: do not colour the frame). */}
      <span className="ascii-frame">[</span>
      <span className="ascii">{bar.slice(1, -1)}</span>
      <span className="ascii-frame">]</span>
      <span className="ascii-pct">{figure ?? (measured ? `${Math.round(fraction! * 100)}%` : "—")}</span>
    </span>
  );
}

/** `▮▮▮▯▯ 3 / 5` — one glyph per real thing. */
export function AsciiMeter({ filled, total }: { filled: number; total: number }) {
  return (
    <span className="ascii-meter">
      <span className="ascii">{asciiMeter(filled, total)}</span>
      <span className="ascii-count">
        {Math.round(filled)} / {Math.round(total)}
      </span>
    </span>
  );
}

/** `| / — \` at 120 ms a frame in accent-300, with a data-sm label on ink-200. */
export function Spinner({ label }: { label?: ReactNode }) {
  return (
    <span className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden />
      {label !== undefined && <span className="spinner-label">{label}</span>}
    </span>
  );
}

/** A three-cell block travelling inside the ten-cell frame. */
export function IndeterminateBar({ label }: { label?: ReactNode }) {
  return (
    <span className="ascii-bar" role="status">
      <span className="ascii-frame">[</span>
      <span className="ascii ascii-indeterminate" aria-hidden />
      <span className="ascii-frame">]</span>
      {label !== undefined && <span className="spinner-label">{label}</span>}
    </span>
  );
}
