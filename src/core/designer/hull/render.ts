/**
 * Hull renderer — record in, scene out. Pure: no React, no DOM, no measuring.
 *
 * **The hull SVG is generated from the record every time it is drawn and never
 * stored as an asset** (`docs/CLAUDE.md`). Editor 2 adds external modules that
 * have to appear in the silhouette, so a hand-authored or cached drawing would
 * go stale the moment a turret moved.
 *
 * Two modes, as `gallery/06` §4 specifies:
 *
 *  - **silhouette** — the solid fleet-sheet plate, for recognition at a glance
 *  - **schematic** — sections tinted by kind, stations and slots labelled,
 *    advisory anchors marked
 *
 * and, independently of the mode, two **views**: the side elevation
 * (`profile`, the default) and the view from above (`plan`), where the hull's
 * outline is its half-beam rather than its half-height. A plan schematic and
 * a plan silhouette are both meaningful, which is why the view is its own axis
 * rather than a third mode.
 *
 * ## Colour
 *
 * Nothing here names a colour. Every element carries a `token` naming a CSS
 * custom property from `src/theme.css`, and `toSvg` emits `var(--token)`. The
 * palette stays in one place and the drawing follows the app's theme, including
 * anywhere a second palette would otherwise creep in.
 *
 * ## Coordinates
 *
 * Scene coordinates are **metres, hull frame**: x from the bow, y above the
 * axis (so up is positive and the mirror line is y = 0). The SVG transform
 * flips y and applies the scale, so callers never do arithmetic on screen
 * pixels to know where a station is.
 */
import type { Appendage, ExternalSlot, HullGeometry, ShadowCone } from "./types";
import type { View } from "./parts";
import { breakpoints, halfHeightAt, beamAt, placeAppendage, placeAppendages, sectionVolumes, shadowRadiusAt } from "./geometry";

export type RenderMode = "silhouette" | "schematic";

/** A theme token from `src/theme.css`. No literal colours anywhere in this module. */
export type Token =
  | "navy-200"
  | "navy-300"
  | "navy-600"
  | "navy-700"
  | "navy-800"
  | "navy-900"
  | "rust-300"
  | "rust-500"
  | "accent"
  | "accent-tint"
  | "line"
  | "line-faded"
  | "line-strong"
  | "ok"
  // Type, not structure. Labels were drawn in navy-200/300, which are surface
  // tints and sit at too low a contrast to read as annotation over a tinted
  // section (`gallery/09` §3.1).
  | "text"
  | "text-muted";

export interface SceneStyle {
  fill?: Token;
  stroke?: Token;
  strokeWidth?: number;
  opacity?: number;
  dashed?: boolean;
}

export type SceneElement =
  | ({ kind: "path"; id: string; d: string; role: string } & SceneStyle)
  | ({ kind: "polygon"; id: string; points: [number, number][]; role: string } & SceneStyle)
  | ({ kind: "line"; id: string; x1: number; y1: number; x2: number; y2: number; role: string } & SceneStyle)
  | ({ kind: "circle"; id: string; cx: number; cy: number; r: number; role: string } & SceneStyle)
  /**
   * `size` is in **screen pixels**, not scene metres — see `LABEL_PX`.
   *
   * `owner` names the element whose hover should enlarge this label, the way
   * `SystemMap` enlarges a body's label when the body is hovered. A label is
   * never itself a pointer target, so without it a label has no hover state.
   */
  | ({ kind: "text"; id: string; x: number; y: number; text: string; anchor?: "start" | "middle" | "end"; size?: number; owner?: string; role: string } & SceneStyle);

/**
 * Label sizes, in **screen pixels**.
 *
 * Not metres. A label is type, and type is measured in pixels: it stays the
 * same size as the view zooms, which is what a technical drawing's annotation
 * wants and what `SystemMap` already does. Every consumer converts — the canvas
 * divides by its px/metre, `toSvg` divides by `pxPerMetre` — so the glyph lands
 * at this size however the scene is scaled.
 *
 * These were authored in metres until 2026-09-22, while `HullCanvas` read them
 * as pixels. The round trip cancelled, so every on-screen label rendered at
 * 2.2-3 CSS pixels at every zoom level while the same scene exported legibly:
 * the two consumers disagreed about the unit and nothing asserted which was
 * right. `gallery/09` §3.1. The values follow theme.css's `--fs-*` ramp
 * (11/12/13/15/20); a ruler tick sits just under it, being the quietest thing
 * on the canvas.
 */
export const LABEL_PX = {
  section: 13,
  slot: 11,
  cg: 12,
  rulerTick: 10,
  /** What a text element that carries no size of its own is drawn at. */
  fallback: 11,
} as const;

/**
 * Which way the ship points on screen.
 *
 * This is presentation only. The record is always bow-at-zero, x increasing
 * aft (`docs/UNITS.md` §2), and every coordinate in a scene is in that frame.
 * `bowSide` says how to look at it, and the fleet plates in
 * `docs/refs/SolarSystem_Fleet_Deployment+Ship_Vector_Images.png` are drawn
 * bow-right — nose and armour to the right, engineering and radiators to the
 * left — so that is the default. Drawing +x rightward put the bow on the left
 * and silently mirrored every ship against the established art.
 */
export type BowSide = "left" | "right";

export interface HullScene {
  mode: RenderMode;
  /** Side elevation or from above. */
  view: View;
  /** Hull-frame bounds in metres: everything drawn fits inside these. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  /** How a consumer should orient the scene. The coordinates are unaffected. */
  bowSide: BowSide;
  elements: SceneElement[];
}

export interface RenderOptions {
  mode?: RenderMode;
  /**
   * Side elevation (`profile`, the default) or from above (`plan`). In plan
   * the outline is the beam, `showBeam` draws the height as the secondary
   * outline, and only appendages authored in that plane are drawn.
   */
  view?: View;
  /** Draw the station ruler and its ticks. */
  stations?: boolean;
  /** Draw the beam as a second, lighter outline — the hull is elliptical, not a slab. */
  showBeam?: boolean;
  /** Mark external slots. */
  slots?: boolean;
  /** Shade each section and label its volume. */
  sections?: boolean;
  /** Overlay the reactor shield's shadow. */
  shadowCone?: ShadowCone;
  /** Mark the centre of gravity at this station. */
  cgStation?: number;
  /** Draw the parent hull's profile behind this one, for variant editing. */
  ghost?: HullGeometry;
  /** A 1.8 m figure and a docking ring at true size — the guard against scale drift. */
  scaleFigures?: boolean;
  /** Sampling density for the profile path. */
  samples?: number;
  /** Which way the ship points on screen. Presentation only; defaults to bow-right. */
  bowSide?: BowSide;
  /**
   * Parts fitted to the hull that the hull record does not own: the turrets,
   * radiator wings and tankage editor 2 hangs on the external slots.
   *
   * This is the seam the "never store the SVG" rule exists to protect. They
   * arrive as ordinary appendages so they mirror, measure and bound exactly
   * like hull structure, and they are drawn under their own id prefix and role
   * so an editor can tint or hide them and a click never mistakes a module for
   * the hull.
   */
  fitted?: Appendage[];
}

const round = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Profile sample points: every breakpoint, plus even samples so curves read smoothly. */
function profileXs(hull: HullGeometry, samples: number): number[] {
  const length = Math.max(0, hull.spine.length_m ?? 0);
  const xs = new Set<number>(breakpoints(hull.spine));
  if (length > 0) for (let i = 0; i <= samples; i++) xs.add((i / samples) * length);
  return [...xs].sort((a, b) => a - b);
}

/**
 * The closed outline of the mirrored side profile: along the top from bow to
 * stern, back along the bottom. `scale` lets the same code draw the beam
 * outline by substituting beam/2 for the half-height.
 */
function outlinePath(hull: HullGeometry, samples: number, useBeam = false): string {
  const xs = profileXs(hull, samples);
  if (xs.length < 2) return "";
  // Two points at the same x where the profile steps, so the outline carries a
  // real vertical edge instead of cutting the corner off a bulkhead.
  const at = (x: number, side: "aft" | "fore") => (useBeam ? beamAt(hull.spine, x, side) / 2 : halfHeightAt(hull.spine, x, side));
  const top: [number, number][] = [];
  for (const x of xs) {
    const aft = at(x, "aft");
    const fore = at(x, "fore");
    top.push([x, aft]);
    if (fore !== aft) top.push([x, fore]);
  }
  const parts: string[] = [];
  top.forEach(([x, y], i) => parts.push(`${i === 0 ? "M" : "L"} ${round(x)} ${round(y)}`));
  for (let i = top.length - 1; i >= 0; i--) {
    const [x, y] = top[i] as [number, number];
    parts.push(`L ${round(x)} ${round(-y)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/**
 * Where a slot sits in a view, in scene metres: on the ellipse at its clock
 * angle, projected. Side-on that is `a·cos θ` — dorsal at the top of the
 * profile, beam on the axis, 15° very nearly at the top. From above it is
 * `−b·sin θ`, starboard (θ = 90) below the centreline with the bow to the
 * right.
 *
 * One function, because the renderer's slot markers and the canvas's drag
 * handles each used to work this out for themselves and disagreed: a slot at
 * 15° drew its marker on the axis and its handle on the skin.
 */
export function slotAnchor(hull: HullGeometry, slot: Pick<ExternalSlot, "x" | "theta_deg">, view: View = "profile"): { x: number; y: number } {
  const rad = (((slot.theta_deg % 360) + 360) % 360) * (Math.PI / 180);
  if (view === "plan") return { x: slot.x, y: round(-(beamAt(hull.spine, slot.x) / 2) * Math.sin(rad)) };
  return { x: slot.x, y: round(halfHeightAt(hull.spine, slot.x) * Math.cos(rad)) };
}

/** Build the drawable scene for a hull. */
export function renderHull(hull: HullGeometry, options: RenderOptions = {}): HullScene {
  const mode = options.mode ?? "silhouette";
  const schematic = mode === "schematic";
  const view: View = options.view ?? "profile";
  const plan = view === "plan";
  const samples = options.samples ?? 120;
  const spine = hull.spine;
  const length = Math.max(0, spine.length_m ?? 0);
  const elements: SceneElement[] = [];
  /** The hull's extent across the drawing at a station: half-height side-on, half-beam from above. */
  const extent = (x: number): number => (plan ? beamAt(spine, x) / 2 : halfHeightAt(spine, x));

  let maxY = 0;
  for (const x of breakpoints(spine)) maxY = Math.max(maxY, halfHeightAt(spine, x), beamAt(spine, x) / 2);

  // --- parent ghost, behind everything -------------------------------------
  if (options.ghost) {
    const d = outlinePath(options.ghost, samples, plan);
    if (d) elements.push({ kind: "path", id: "ghost", role: "ghost", d, fill: undefined, stroke: "line-faded", strokeWidth: 1, dashed: true, opacity: 0.6 });
    for (const x of breakpoints(options.ghost.spine)) maxY = Math.max(maxY, halfHeightAt(options.ghost.spine, x), beamAt(options.ghost.spine, x) / 2);
  }

  // --- the other extent, drawn first so the outline sits over it -----------
  // Side-on that is the beam; from above it is the height. Either way it is
  // the reminder that the section is an ellipse, not a slab.
  if (options.showBeam ?? schematic) {
    const d = outlinePath(hull, samples, !plan);
    const id = plan ? "height" : "beam";
    if (d) elements.push({ kind: "path", id, role: id, d, fill: "navy-700", stroke: "line-faded", strokeWidth: 1, opacity: 0.45, dashed: true });
  }

  // --- the hull itself ------------------------------------------------------
  const hullPath = outlinePath(hull, samples, plan);
  if (hullPath) {
    elements.push({
      kind: "path",
      id: "hull",
      role: "hull",
      d: hullPath,
      fill: schematic ? "navy-800" : "navy-200",
      stroke: schematic ? "line-strong" : "line",
      strokeWidth: schematic ? 1.5 : 1,
    });
  }

  // --- mirror line ----------------------------------------------------------
  if (schematic && length > 0) {
    elements.push({ kind: "line", id: "axis", role: "axis", x1: 0, y1: 0, x2: length, y2: 0, stroke: "line-faded", strokeWidth: 0.5, dashed: true });
  }

  // --- sections -------------------------------------------------------------
  if ((options.sections ?? schematic) && hull.sections?.length) {
    const volumes = new Map(sectionVolumes(hull).map((v) => [v.id, v]));
    for (const section of hull.sections) {
      const x0 = Math.min(section.x0, section.x1);
      const x1 = Math.max(section.x0, section.x1);
      const yTop = Math.max(extent(x0), extent(x1));
      elements.push({
        kind: "polygon",
        id: `section-${section.id}`,
        role: "section",
        points: [
          [x0, yTop],
          [x1, yTop],
          [x1, -yTop],
          [x0, -yTop],
        ],
        fill: section.pressurised ? "accent-tint" : "navy-600",
        stroke: "line-faded",
        strokeWidth: 0.5,
        opacity: 0.35,
      });
      const volume = volumes.get(section.id);
      elements.push({
        kind: "text",
        id: `section-label-${section.id}`,
        role: "section-label",
        x: (x0 + x1) / 2,
        y: 0,
        text: volume ? `${section.id} · ${Math.round(volume.usable_m3).toLocaleString()} m³` : section.id,
        anchor: "middle",
        size: LABEL_PX.section,
        owner: `section-${section.id}`,
        fill: "text-muted",
      });
    }
  }

  // --- armour zones ---------------------------------------------------------
  if (schematic) {
    for (const zone of hull.armor_zones ?? []) {
      const x0 = Math.min(zone.x0, zone.x1);
      const x1 = Math.max(zone.x0, zone.x1);
      const xs = profileXs(hull, samples).filter((x) => x >= x0 && x <= x1);
      if (xs.length < 2) continue;
      for (const sign of [1, -1]) {
        const d = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${round(x)} ${round(sign * extent(x))}`).join(" ");
        elements.push({ kind: "path", id: `armor-${zone.id}-${sign > 0 ? "top" : "bottom"}`, role: "armor", d, stroke: "rust-500", strokeWidth: 2, fill: undefined });
      }
    }
  }

  // --- appendages: flat parts, mirrored, never swept ------------------------
  // Only those authored in this view: a hand-drawn outline says nothing about
  // what the part looks like from anywhere else.
  const inView = (a: Appendage) => (a.plane ?? "profile") === view;
  for (const placed of placeAppendages({ ...hull, appendages: (hull.appendages ?? []).filter(inView) })) {
    elements.push({
      kind: "polygon",
      id: `appendage-${placed.id}${placed.mirrored ? "-m" : ""}`,
      role: `appendage:${placed.kind}`,
      points: placed.outline,
      fill: schematic ? "navy-600" : "navy-300",
      stroke: "line",
      strokeWidth: 1,
    });
    for (const [, y] of placed.outline) maxY = Math.max(maxY, Math.abs(y));
  }

  // --- parts fitted to the hull but not owned by it -------------------------
  // Editor 2's modules. Same geometry as an appendage so they mirror, measure
  // and bound identically; a distinct id prefix and role so an editor can tint
  // or hide them, and so they never look like hull structure to a click.
  //
  // A `far` part — behind or inside the hull from here — is outline-only and
  // dashed, the drawing convention for a hidden line, so it reads as a fitting
  // and never as structure (`fitted:far:<kind>`).
  for (const part of options.fitted ?? []) {
    for (const placed of placeAppendage(spine, part)) {
      const style: SceneStyle = part.far
        ? { fill: undefined, stroke: "line-strong", strokeWidth: 1, dashed: true, opacity: 0.9 }
        : { fill: schematic ? "navy-700" : "navy-200", stroke: "line-strong", strokeWidth: 1 };
      elements.push({
        kind: "polygon",
        id: `fitted-${placed.id}${placed.mirrored ? "-m" : ""}`,
        role: part.far ? `fitted:far:${placed.kind}` : `fitted:${placed.kind}`,
        points: placed.outline,
        ...style,
      });
      for (const [, y] of placed.outline) maxY = Math.max(maxY, Math.abs(y));
    }
  }

  // --- external slots -------------------------------------------------------
  if (options.slots ?? schematic) {
    for (const slot of hull.external_slots ?? []) {
      const { y } = slotAnchor(hull, slot, view);
      elements.push({ kind: "circle", id: `slot-${slot.id}`, role: `slot:${slot.type}`, cx: slot.x, cy: y, r: 1.2, fill: "rust-300", stroke: "line-strong", strokeWidth: 0.5 });
      if (schematic) {
        elements.push({
          kind: "text",
          id: `slot-label-${slot.id}`,
          role: "slot-label",
          x: slot.x,
          y: y + (y >= 0 ? 3 : -3),
          text: `${slot.type} ${slot.size}`,
          anchor: "middle",
          size: LABEL_PX.slot,
          owner: `slot-${slot.id}`,
          fill: "text-muted",
        });
      }
    }
  }

  // --- radiation shadow -----------------------------------------------------
  if (options.shadowCone) {
    const cone = options.shadowCone;
    const aft = (cone.facing ?? "aft") === "aft";
    const far = aft ? length : 0;
    // Clip the wedge to a little beyond the hull envelope. Drawn to its true
    // width a 15-degree cone over a 180 m ship reaches +/-48 m and dwarfs a 19 m
    // hull, burying the one thing the overlay is for: where the cone stops
    // covering the ship. Past the clip everything is shadowed anyway.
    const clip = Math.max(maxY * 1.25, 1);
    const reachesClipAt = cone.x + (aft ? 1 : -1) * (clip / Math.max(1e-9, Math.tan((cone.half_angle_deg * Math.PI) / 180)));
    const edge = aft ? Math.min(far, reachesClipAt) : Math.max(far, reachesClipAt);
    const rEdge = Math.min(clip, shadowRadiusAt(cone, edge));
    const points: [number, number][] = [[cone.x, 0], [edge, rEdge]];
    // Once the cone is wider than the clip it keeps running to the hull end.
    if (edge !== far) points.push([far, rEdge]);
    points.push([far, -rEdge]);
    if (edge !== far) points.push([edge, -rEdge]);
    elements.push({ kind: "polygon", id: "shadow-cone", role: "overlay:radiation", points, fill: "ok", opacity: 0.12, stroke: "ok", strokeWidth: 0.5, dashed: true });
    maxY = Math.max(maxY, rEdge);
  }

  // --- centre of gravity ----------------------------------------------------
  if (typeof options.cgStation === "number" && Number.isFinite(options.cgStation)) {
    const x = options.cgStation;
    elements.push({ kind: "circle", id: "cg", role: "overlay:cg", cx: x, cy: 0, r: 1.6, fill: "accent", stroke: "line-strong", strokeWidth: 0.6 });
    elements.push({ kind: "text", id: "cg-label", role: "overlay:cg", x, y: -4, text: "CG", anchor: "middle", size: LABEL_PX.cg, owner: "cg", fill: "accent" });
  }

  // --- station ruler --------------------------------------------------------
  if (options.stations ?? schematic) {
    const pitch = spine.station_pitch_m && spine.station_pitch_m > 0 ? spine.station_pitch_m : 3;
    const rulerY = -(maxY + 4);
    elements.push({ kind: "line", id: "ruler", role: "ruler", x1: 0, y1: rulerY, x2: length, y2: rulerY, stroke: "line", strokeWidth: 0.6 });
    const step = Math.max(pitch, Math.ceil(length / 40 / pitch) * pitch); // never more than ~40 ticks
    for (let x = 0, n = 0; x <= length + 1e-9; x += step, n++) {
      const major = n % 5 === 0;
      elements.push({ kind: "line", id: `tick-${n}`, role: "ruler-tick", x1: x, y1: rulerY, x2: x, y2: rulerY - (major ? 2 : 1), stroke: "line", strokeWidth: 0.4 });
      if (major) elements.push({ kind: "text", id: `tick-label-${n}`, role: "ruler-label", x, y: rulerY - 3.5, text: `${Math.round(x)}`, anchor: "middle", size: LABEL_PX.rulerTick, fill: "text-muted" });
    }
    maxY = Math.max(maxY, Math.abs(rulerY) + 6);
  }

  // --- true-scale references ------------------------------------------------
  if (options.scaleFigures) {
    // A 1.8 m person and a 1.4 m docking ring, drawn at true size. The single
    // best guard against a hull drifting an order of magnitude off scale.
    const baseY = maxY + 3;
    elements.push({ kind: "line", id: "figure", role: "scale:figure", x1: 2, y1: baseY, x2: 2, y2: baseY + 1.8, stroke: "navy-200", strokeWidth: 0.6 });
    elements.push({ kind: "circle", id: "figure-head", role: "scale:figure", cx: 2, cy: baseY + 2.1, r: 0.3, fill: "navy-200" });
    elements.push({ kind: "circle", id: "ring", role: "scale:ring", cx: 8, cy: baseY + 0.7, r: 0.7, fill: undefined, stroke: "navy-200", strokeWidth: 0.6 });
    maxY = baseY + 3;
  }

  const pad = Math.max(2, maxY * 0.08);
  return {
    mode,
    view,
    bounds: { x0: -pad, y0: -(maxY + pad), x1: length + pad, y1: maxY + pad },
    bowSide: options.bowSide ?? "right",
    elements,
  };
}

/**
 * A scene element's style as SVG attributes, at `k` pixels per metre.
 *
 * Stroke widths and dashes are **screen pixels**, like label sizes: the canvas
 * converts them with its px/metre so a line stays a line at any zoom. This
 * divides by `k` for the same reason. It used to write them out raw, into a
 * viewBox in metres, so every outline in an export was `k` pixels thick — 7 px
 * at the style probe's scale, which drowned the part detail the way the labels
 * once vanished (`gallery/08`, "Known bugs").
 */
const attr = (style: SceneStyle, k: number): string => {
  const parts: string[] = [];
  parts.push(`fill="${style.fill ? `var(--${style.fill})` : "none"}"`);
  if (style.stroke) parts.push(`stroke="var(--${style.stroke})"`);
  if (style.strokeWidth !== undefined) parts.push(`stroke-width="${round(style.strokeWidth / k)}"`);
  if (style.opacity !== undefined) parts.push(`opacity="${style.opacity}"`);
  // The canvas's dash, 5 px on and 4 off, in the same units.
  if (style.dashed) parts.push(`stroke-dasharray="${round(5 / k)} ${round(4 / k)}"`);
  return parts.join(" ");
};

const escapeText = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Serialise a scene to standalone SVG, for the existing asset export path.
 *
 * The y axis is flipped by the group transform so that scene coordinates stay
 * "metres above the axis" everywhere else. Text is counter-flipped so it reads
 * the right way up.
 *
 * The viewBox is in metres and the width/height in pixels, so one user unit is
 * `pxPerMetre` pixels — which is why `fontPx` below divides by it. `LABEL_PX`
 * is in screen pixels and this is the conversion that honours it. The canvas
 * does the same division against its own px/metre, so both consumers put a
 * label on the glass at the size the renderer asked for.
 */
export function toSvg(scene: HullScene, opts: { pxPerMetre?: number; title?: string } = {}): string {
  const k = opts.pxPerMetre ?? 4;
  /** A label's size in user units (metres), so it lands at `size` pixels once scaled. */
  const fontPx = (size: number | undefined): number => round((size ?? LABEL_PX.fallback) / k);
  const { x0, y0, x1, y1 } = scene.bounds;
  const w = Math.max(1, (x1 - x0) * k);
  const h = Math.max(1, (y1 - y0) * k);
  const mirrored = scene.bowSide !== "left";
  const body: string[] = [];

  for (const el of scene.elements) {
    const style = attr(el, k);
    switch (el.kind) {
      case "path":
        body.push(`<path d="${el.d}" ${style} />`);
        break;
      case "polygon":
        body.push(`<polygon points="${el.points.map(([x, y]) => `${round(x)},${round(y)}`).join(" ")}" ${style} />`);
        break;
      case "line":
        body.push(`<line x1="${round(el.x1)}" y1="${round(el.y1)}" x2="${round(el.x2)}" y2="${round(el.y2)}" ${style} />`);
        break;
      case "circle":
        body.push(`<circle cx="${round(el.cx)}" cy="${round(el.cy)}" r="${el.r}" ${style} />`);
        break;
      case "text":
        // Counter-flip so the glyphs come out upright whichever way the group
        // is mirrored: the element transform is the inverse of the group's
        // linear part, and the anchor is negated on each flipped axis.
        body.push(
          mirrored
            ? `<text x="${round(-el.x)}" y="${round(-el.y)}" transform="scale(-1,-1)" text-anchor="${el.anchor ?? "middle"}" font-size="${fontPx(el.size)}" ${style}>${escapeText(el.text)}</text>`
            : `<text x="${round(el.x)}" y="${round(-el.y)}" transform="scale(1,-1)" text-anchor="${el.anchor ?? "middle"}" font-size="${fontPx(el.size)}" ${style}>${escapeText(el.text)}</text>`,
        );
        break;
    }
  }

  const title = opts.title ? `<title>${escapeText(opts.title)}</title>` : "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="0 0 ${round(x1 - x0)} ${round(y1 - y0)}">`,
    title,
    // Bow-left maps scene (x,y) to (x - x0, y1 - y); bow-right to (x1 - x, y1 - y).
    mirrored ? `<g transform="translate(${round(x1)} ${round(y1)}) scale(-1,-1)">` : `<g transform="translate(${round(-x0)} ${round(y1)}) scale(1,-1)">`,
    ...body,
    `</g>`,
    `</svg>`,
  ].join("");
}
