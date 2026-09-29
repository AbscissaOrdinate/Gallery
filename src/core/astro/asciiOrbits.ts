/**
 * The boot screen's orbital idle (docs/design-book/components/BootSequence,
 * docs/STYLE.md §2): ASCII frames generated from the vault's own system, the
 * primary at the centre and up to five orbits, each body at its
 * `map_angle_deg` and advanced a little per frame. The book's three frames are
 * the style reference, and the fallback when the vault has no system.
 *
 * Glyphs: `*` primary · `o` body · `.` orbit · `' -` rim.
 */
import type { TypedRecord } from "../types";

export interface IdleSubject {
  primary: string;
  /** Innermost first. */
  orbits: { name: string; angleDeg: number }[];
}

/** The plate's frames, verbatim, for a vault with no system record. */
export const PLATE_FRAMES: string[][] = [
  ["     . - - - .", "   '           '", "  .    . - .    .", " .   .   *   .   .", " .   .   o   .   .", "  .    ' - '    .", "   .           .", "     ' - - - '"],
  ["     . - - - .", "   '           '", "  .    . - .    .", " .   o   *   .   .", " .   .   .   .   .", "  .    ' - '    o", "   .           .", "     ' - - - '"],
  ["     . - - - o", "   '           '", "  .    . o .    .", " .   .   *   .   .", " .   .   .   .   .", "  .    ' - '    .", "   .           .", "     ' - - - '"],
];

const MAX_ORBITS = 5;
const NOT_A_PLANET = /moon|belt|asteroid|comet|star|brown-dwarf|barycenter|ring|artificial/;
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * The system to draw: its primary and the (up to five) innermost bodies that
 * orbit it directly. Undefined when there is no system or it has no primary.
 */
export function idleSubject(systems: TypedRecord[], bodies: TypedRecord[]): IdleSubject | undefined {
  // The system with the most bodies is the vault's subject.
  const count = (s: TypedRecord) => bodies.filter((b) => b.fields.system === s.id).length;
  const system = [...systems].sort((a, b) => count(b) - count(a) || a.name.localeCompare(b.name))[0];
  if (!system) return undefined;
  const primaryId = typeof system.fields.primary === "string" ? system.fields.primary : undefined;
  const primary = bodies.find((b) => b.id === primaryId);
  if (!primary) return undefined;
  const orbits = bodies
    .filter((b) => b.fields.system === system.id && b.id !== primary.id && (b.fields.parent === primary.id || !b.fields.parent) && !NOT_A_PLANET.test(String(b.fields.kind ?? "")) && num(b.fields.sma_au) !== undefined)
    .sort((a, b) => num(a.fields.sma_au)! - num(b.fields.sma_au)!)
    .slice(0, MAX_ORBITS)
    .map((b) => ({ name: b.name, angleDeg: num(b.fields.map_angle_deg) ?? 0 }));
  return { primary: primary.name, orbits };
}

/**
 * Three frames of a schematic: evenly spaced rings (a character is about twice
 * as tall as it is wide, so rings are stretched across), each body advanced
 * 120° ÷ its ring number per frame, so the inner system turns fastest.
 */
export function orbitalFrames(subject: IdleSubject | undefined, frames = 3): string[][] {
  if (!subject || subject.orbits.length === 0) return PLATE_FRAMES;
  const n = subject.orbits.length;
  const RY = 2.2;
  const RX = RY * 2;
  const cy = Math.round(RY * n) + 1;
  const cx = Math.round(RX * n) + 1;
  const rows = cy * 2 + 1;
  const cols = cx * 2 + 1;
  const base: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => " "));
  const put = (g: string[][], col: number, row: number, ch: string) => {
    if (row >= 0 && row < rows && col >= 0 && col < cols) g[row][col] = ch;
  };
  const at = (k: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { col: cx + Math.round(RX * k * Math.cos(a)), row: cy - Math.round(RY * k * Math.sin(a)) };
  };
  // Each ring is a few evenly spaced marks, as in the plate: dashes across the top and bottom, a tick
  // at the lower shoulders, dots down the sides.
  for (let k = 1; k <= n; k++) {
    const marks = 4 + 6 * k;
    for (let i = 0; i < marks; i++) {
      const deg = (i * 360) / marks;
      const { col, row } = at(k, deg);
      if (base[row][col] !== " " || base[row][col - 1] !== " " || base[row][col + 1] !== " ") continue;
      const sn = Math.sin((deg * Math.PI) / 180);
      put(base, col, row, Math.abs(sn) >= 0.9 ? "-" : sn <= -0.5 ? "'" : ".");
    }
  }
  put(base, cx, cy, "*");
  const out: string[][] = [];
  for (let f = 0; f < frames; f++) {
    const g = base.map((r) => [...r]);
    subject.orbits.forEach((o, i) => {
      const { col, row } = at(i + 1, o.angleDeg + (f * 120) / (i + 1));
      put(g, col, row, "o");
    });
    out.push(g.map((r) => r.join("").trimEnd()));
  }
  return out;
}
