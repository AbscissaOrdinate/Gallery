/**
 * The hull canvas.
 *
 * All the drawing decisions live in `core/designer/hull/render.ts`, which is
 * pure and has no idea React exists. This file does three things that module
 * cannot: it puts the scene on screen, it lets you drag the geometry, and it
 * shows which advisory you clicked. The scene is rebuilt from the record on
 * every render — `docs/CLAUDE.md`: the hull SVG is generated at render time,
 * never stored.
 *
 * Coordinates: the scene is in hull-frame metres with **y up and x aft from the
 * bow**. SVG is y-down, so one flip on the root group handles that and
 * everything inside stays in the units the geometry uses. The same group also
 * mirrors x when the scene is drawn bow-right, which is the default and matches
 * the fleet plates; the record is bow-at-zero either way. Text counter-flips so
 * the glyphs stay upright, and the pointer mapping inverts the same transform
 * so a drag lands where it is aimed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { renderHull, type RenderOptions, type SceneElement } from "../../core/designer/hull/render";
import { halfHeightAt } from "../../core/designer/hull/geometry";
import { snapStation } from "../../core/designer/hull/record";
import type { HullGeometry } from "../../core/designer/hull/types";

export type Selection = { kind: "station" | "section" | "slot" | "appendage" | "zone"; id: string } | null;

/** A geometry edit the canvas asks the editor to make. The canvas holds no state of its own. */
export type CanvasEdit =
  | { kind: "station"; index: number; x: number; half_height_m: number }
  | { kind: "slot"; id: string; x: number }
  | { kind: "appendage"; id: string; station: number };

interface Props {
  hull: HullGeometry;
  options: RenderOptions;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onEdit: (edit: CanvasEdit) => void;
  /** Station the advisory list last asked to be shown; drawn as a marker. */
  focus?: number;
  /** Snap grid in metres. */
  pitch: number;
  /** Drag handles off — used by the read-only fleet strip. */
  readOnly?: boolean;
}

type Drag =
  | { kind: "station"; index: number }
  | { kind: "slot"; id: string }
  | { kind: "appendage"; id: string }
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number };

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 0.08; // fraction of the drawing added as margin when fitting

export function HullCanvas({ hull, options, selection, onSelect, onEdit, focus, pitch, readOnly }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const userMoved = useRef(false);

  const scene = renderHull(hull, options);
  const b = scene.bounds;
  // Presentation only: the scene stays bow-at-zero. `flip` mirrors the view so
  // the ship points right, matching the fleet plates.
  const flip = scene.bowSide !== "left";
  /** Scene x to outer (pre-group) x, and back — the mirror is its own inverse. */
  const ox = (x: number) => (flip ? -x : x);

  /** Frame the whole drawing. Called on mount and whenever the hull's extent changes. */
  const fit = useCallback(() => {
    const el = wrapRef.current;
    const w = Math.max(1, b.x1 - b.x0);
    const h = Math.max(1, b.y1 - b.y0);
    const padX = w * PAD;
    const padY = h * PAD;
    let vw = w + padX * 2;
    let vh = h + padY * 2;
    // Match the pane's aspect so the hull is never stretched.
    const aspect = el && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : vw / vh;
    if (vw / vh > aspect) vh = vw / aspect;
    else vw = vh * aspect;
    const left = flip ? -b.x1 : b.x0;
    setView({ x: left - padX - (vw - w - padX * 2) / 2, y: -b.y1 - padY - (vh - h - padY * 2) / 2, w: vw, h: vh });
  }, [b.x0, b.x1, b.y0, b.y1, flip]);

  useEffect(() => {
    if (!userMoved.current) fit();
  }, [fit]);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!userMoved.current) fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  /** Client pixels → hull-frame metres (y up). */
  const toHull = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(m.inverse());
    return { x: flip ? -p.x : p.x, y: -p.y };
  }, [flip]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !view) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const k = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const p = toHull(e.clientX, e.clientY);
      const [ax, ay] = [ox(p.x), -p.y]; // anchor the zoom in outer coordinates
      userMoved.current = true;
      setView((v) => (v ? { x: ax - (ax - v.x) * k, y: ay - (ay - v.y) * k, w: v.w * k, h: v.h * k } : v));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toHull, !!view]);

  if (!view) return <div className="hullwrap" ref={wrapRef} />;

  const perMetre = (wrapRef.current?.clientWidth ?? 800) / view.w;
  /** A screen-constant size, in metres, so handles stay grabbable at any zoom. */
  const px = (n: number) => n / perMetre;

  const stations = hull.spine.stations;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const handle = (e.target as Element).closest("[data-handle]");
    if (handle && !readOnly) {
      const kind = handle.getAttribute("data-handle")!;
      const key = handle.getAttribute("data-id")!;
      if (kind === "station") {
        onSelect({ kind: "station", id: key });
        setDrag({ kind: "station", index: Number(key) });
      } else if (kind === "slot") {
        onSelect({ kind: "slot", id: key });
        setDrag({ kind: "slot", id: key });
      } else if (kind === "appendage") {
        onSelect({ kind: "appendage", id: key });
        setDrag({ kind: "appendage", id: key });
      }
      return;
    }
    const pick = (e.target as Element).closest("[data-pick]");
    if (pick) {
      const [kind, id] = pick.getAttribute("data-pick")!.split(":");
      onSelect({ kind: kind as NonNullable<Selection>["kind"], id: id! });
      return;
    }
    onSelect(null);
    setDrag({ kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === "pan") {
      const scale = view.w / (wrapRef.current?.clientWidth || 1);
      userMoved.current = true;
      setView((v) => (v ? { ...v, x: drag.vx - (e.clientX - drag.sx) * scale, y: drag.vy - (e.clientY - drag.sy) * scale } : v));
      return;
    }
    const p = toHull(e.clientX, e.clientY);
    // Clamp to the hull. Dragging a station past the stern would silently make
    // the profile longer than the length the budgets use; lengthening the hull
    // is the Length field's job, not a side effect of a drag.
    const span = hull.spine.length_m > 0 ? hull.spine.length_m : Infinity;
    const x = Math.min(span, Math.max(0, snapStation(p.x, e.altKey ? 0 : pitch))); // Alt overrides the grid
    if (drag.kind === "station") {
      // Vertical drag shapes the profile; the mirror means we only ever edit the
      // upper half, so a drag below the axis reads as its absolute value.
      onEdit({ kind: "station", index: drag.index, x, half_height_m: Math.max(0, Math.abs(p.y)) });
    } else if (drag.kind === "slot") {
      onEdit({ kind: "slot", id: drag.id, x });
    } else if (drag.kind === "appendage") {
      onEdit({ kind: "appendage", id: drag.id, station: x });
    }
  };

  const endDrag = () => setDrag(null);

  const selKey = selection ? `${selection.kind}:${selection.id}` : "";
  const length = hull.spine.length_m || 0;
  const ticks: number[] = [];
  if (pitch > 0 && length > 0 && length / pitch < 400) for (let x = 0; x <= length + 1e-9; x += pitch) ticks.push(x);

  return (
    <div className="hullwrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className="hullsvg"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        style={{ cursor: drag?.kind === "pan" ? "grabbing" : drag ? "grabbing" : "default" }}
      >
        <g transform={flip ? "scale(-1,-1)" : "scale(1,-1)"}>
          {/* Station grid, behind everything. */}
          {ticks.map((x) => (
            <line key={"g" + x} x1={x} y1={b.y0} x2={x} y2={b.y1} stroke="var(--line-faded)" strokeWidth={px(0.5)} opacity={0.5} />
          ))}
          {scene.elements.map((el) => (
            <SceneNode key={el.id} el={el} scale={px} selectedKey={selKey} hover={hover} onHover={setHover} flip={flip} />
          ))}

          {/* Focused advisory: a full-height marker at the anchor station. */}
          {focus !== undefined && Number.isFinite(focus) && (
            <line x1={focus} y1={b.y0} x2={focus} y2={b.y1} stroke="var(--warn)" strokeWidth={px(1.5)} strokeDasharray={`${px(6)} ${px(4)}`} pointerEvents="none" />
          )}

          {!readOnly &&
            stations.map((s, i) => {
              const on = selection?.kind === "station" && selection.id === String(i);
              return (
                <g key={"h" + i} data-handle="station" data-id={String(i)} style={{ cursor: "move" }}>
                  {/* An invisible disc gives a comfortable grab target at any zoom. */}
                  <circle cx={s.x} cy={s.half_height_m} r={px(9)} fill="transparent" />
                  <circle cx={s.x} cy={s.half_height_m} r={px(3.5)} fill={on ? "var(--accent)" : "var(--surface)"} stroke="var(--accent)" strokeWidth={px(1.2)} />
                </g>
              );
            })}

          {!readOnly &&
            (hull.external_slots ?? []).map((s) => {
              // Dorsal slots sit above the axis, ventral below; the beam slots
              // are drawn on the axis because a side view cannot show them.
              const r = halfHeightAt(hull.spine, s.x);
              const t = ((s.theta_deg % 360) + 360) % 360;
              const y = t < 90 || t > 270 ? r : t > 90 && t < 270 ? -r : 0;
              const on = selection?.kind === "slot" && selection.id === s.id;
              return (
                <g key={"s" + s.id} data-handle="slot" data-id={s.id} style={{ cursor: "ew-resize" }}>
                  <circle cx={s.x} cy={y} r={px(10)} fill="transparent" />
                  <rect x={s.x - px(4)} y={y - px(4)} width={px(8)} height={px(8)} fill={on ? "var(--rust-300)" : "var(--surface)"} stroke="var(--rust-300)" strokeWidth={px(1.2)} />
                </g>
              );
            })}
        </g>
      </svg>
      <div className="hullzoom muted mono">
        {length ? `${length.toLocaleString(undefined, { maximumFractionDigits: 1 })} m` : "—"} · {pitch} m grid · {perMetre.toFixed(2)} px/m
        {userMoved.current && (
          <button
            className="ghost"
            style={{ marginLeft: 8, height: 20, padding: "0 6px", fontSize: 11 }}
            onClick={() => {
              userMoved.current = false;
              fit();
            }}
          >
            Fit
          </button>
        )}
      </div>
    </div>
  );
}

/** One scene element as SVG. Colours are theme tokens — the renderer never emits a literal. */
function SceneNode({
  el,
  scale,
  selectedKey,
  hover,
  onHover,
  flip,
}: {
  el: SceneElement;
  scale: (n: number) => number;
  selectedKey: string;
  hover: string | null;
  onHover: (id: string | null) => void;
  flip: boolean;
}) {
  const pickKey = pickable(el);
  const on = pickKey !== undefined && pickKey === selectedKey;
  const hot = hover === el.id;
  const common = {
    fill: el.fill ? `var(--${el.fill})` : "none",
    stroke: on ? "var(--accent)" : el.stroke ? `var(--${el.stroke})` : "none",
    strokeWidth: scale((el.strokeWidth ?? 1) * (on ? 2.2 : hot ? 1.6 : 1)),
    opacity: el.opacity,
    strokeDasharray: el.dashed ? `${scale(5)} ${scale(4)}` : undefined,
    ...(pickKey !== undefined
      ? { "data-pick": pickKey, style: { cursor: "pointer" }, onPointerEnter: () => onHover(el.id), onPointerLeave: () => onHover(null) }
      : { pointerEvents: "none" as const }),
  };
  switch (el.kind) {
    case "path":
      return <path d={el.d} {...common} />;
    case "polygon":
      return <polygon points={el.points.map(([x, y]) => `${x},${y}`).join(" ")} {...common} />;
    case "line":
      return <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} {...common} />;
    case "circle":
      return <circle cx={el.cx} cy={el.cy} r={el.r} {...common} />;
    case "text":
      // Counter-flip so glyphs read upright whichever way the group is
      // mirrored: the element transform inverts the group's linear part, and
      // the anchor is negated on each flipped axis.
      return (
        <text
          x={flip ? -el.x : el.x}
          y={-el.y}
          transform={flip ? "scale(-1,-1)" : "scale(1,-1)"}
          textAnchor={el.anchor ?? "start"}
          fontSize={scale(el.size ?? 11)}
          fill={el.fill ? `var(--${el.fill})` : "var(--text-muted)"}
          stroke="none"
          pointerEvents="none"
        >
          {el.text}
        </text>
      );
  }
}

/**
 * Which scene elements are clickable, and what they select. Anything else is
 * decoration and stays out of the way of a pan.
 */
function pickable(el: SceneElement): string | undefined {
  if (el.kind === "text") return undefined; // labels are decoration, never targets
  for (const [prefix, kind] of [
    ["section-", "section"],
    ["slot-", "slot"],
    ["appendage-", "appendage"],
    ["armor-", "zone"],
  ] as const) {
    if (!el.id.startsWith(prefix)) continue;
    const id = el.id
      .slice(prefix.length)
      .replace(/-m$/, "") // an appendage's mirror selects its original
      .replace(/-(top|bottom)$/, ""); // both halves of an armour belt select the zone
    return `${kind}:${id}`;
  }
  return undefined;
}
