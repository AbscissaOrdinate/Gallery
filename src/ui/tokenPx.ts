/**
 * Pixel sizes read from theme tokens, for SVG geometry that has to do
 * arithmetic with them (label boxes, symbol sizes). `src/theme.css` stays the
 * only place the numbers live (docs/STYLE.md §1).
 *
 * A size token (`--station-mark: 9px`) reads as its px value; a type token
 * (`--text-data-xs: 400 10px/14px …`) reads as its font size. Anything
 * unreadable is 0, which only happens outside a browser.
 */
export function tokenPx(name: string, el?: Element): number {
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") return 0;
  const v = getComputedStyle(el ?? document.documentElement).getPropertyValue(name);
  const m = /(-?\d*\.?\d+)px/.exec(v);
  return m ? Number(m[1]) : 0;
}

/** The map's token sizes, read once per theme. */
export interface MapSizes {
  /** `title-sm`: a named body's label. */
  title: number;
  /** `data-sm`: the selected object's label. */
  dataSm: number;
  /** `data-xs`: every other label and sublabel. */
  dataXs: number;
  /** `station-mark`: the station square. */
  station: number;
  /** `tac-frame-w` × `tac-frame-h`: a tactical frame at far zoom. */
  frameW: number;
  frameH: number;
  /** `border-1`, `border-2`: stroke widths, for strokes drawn in map units. */
  b1: number;
  b2: number;
  /** `scale-bar-w`: the scale bar's target length. */
  scaleBar: number;
}

export function mapSizes(el?: Element): MapSizes {
  return {
    title: tokenPx("--text-title-sm", el),
    dataSm: tokenPx("--text-data-sm", el),
    dataXs: tokenPx("--text-data-xs", el),
    station: tokenPx("--station-mark", el),
    frameW: tokenPx("--tac-frame-w", el),
    frameH: tokenPx("--tac-frame-h", el),
    b1: tokenPx("--border-1", el),
    b2: tokenPx("--border-2", el),
    scaleBar: tokenPx("--scale-bar-w", el),
  };
}

/** A duration token (`--dur-idle-frame: 900ms`) in milliseconds; 0 when unreadable. */
export function tokenMs(name: string, el?: Element): number {
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") return 0;
  const v = getComputedStyle(el ?? document.documentElement).getPropertyValue(name).trim();
  const m = /^(\d*\.?\d+)(ms|s)$/.exec(v);
  return m ? Number(m[1]) * (m[2] === "s" ? 1000 : 1) : 0;
}
