/**
 * Schematic system map: SVG canvas + inspector.
 *
 * Orbits live in map units and zoom; every body's neighbourhood (glyph, moons,
 * stations, L-points, labels) is drawn in screen pixels so it keeps a constant
 * size. Semantic zoom: moons/stations/minor bodies appear past thresholds.
 * Labels are placed greedily in screen space; artificial orbits show only on
 * hover/selection; the full classification and distances live in the tooltip.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { actions, useApp } from "./state";
import type { TypedRecord, GalleryRecord } from "../core/types";
import { isNote } from "../core/types";
import { layoutSystem, placeLabels, pointOnOrbit, type BodyNode, type HelioLocation, type LagrangeBody, type Layout, type LabelReq, type OrbitShape, type Satellite } from "../core/astro/layout";
import { glyphMarkup } from "../core/astro/glyph";
import { formatKm, DISTANCE_UNITS, type DistanceUnit } from "../core/astro/units";
import { AU_KM } from "../core/astro/worldsmith";
import { bodyModes, locationModes, polityColor, rampColor, greenRamp, MAP_MODES, type MapMode, type BodyModes } from "../core/astro/modes";
import { RecordEditor } from "./RecordEditor";
import { SchemaForm } from "./SchemaForm";
import { SystemBuilder } from "./SystemBuilder";
import { isTauri } from "../core/storage/tauri";

/** Literal colours (not CSS vars) so exported SVGs look the same outside the app. */
const C = {
  bg: "#141829",
  orbit: "#3d4861",
  orbitFaint: "#2c364c",
  orbitLoc: "#6a7793",
  hz: "#6fbf95",
  frost: "#7fd0d8",
  belt: "#8a7f70",
  label: "#e9e9ed",
  sublabel: "#8792a8",
  loc: "#e6a684",
  lagrange: "#6a7793",
  lagrangeOn: "#d9865c",
  select: "#c9663a",
  hover: "#e6a684",
  ring: "#8b7355",
};
const FONT = "Inter, system-ui, sans-serif";

/** Zoom thresholds (screen px per map px). */
const Z = { neighbourhood: 1.8, moonLabels: 2.6, minor: 1.3 };
/** Station / location labels are small until hovered. */
const LOC_FONT = 6.4;

type Sel = { kind: "body" | "location" | "annotation"; id: string } | null;
interface DragState {
  id: string;
  type: "body" | "location";
  hostMap: { x: number; y: number };
  shape?: OrbitShape;
  angle: number;
  moved: boolean;
}
interface Tip {
  x: number;
  y: number;
  title: string;
  lines: string[];
}
interface LDot {
  name: string;
  secondaryId: string;
  point: string;
  sx: number;
  sy: number;
}

export function SystemMap({ id }: { id: string }) {
  const { repo } = useApp();
  const system = repo?.typed(id);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: -700, y: -560, w: 1400, h: 1120 });
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const [sel, setSel] = useState<Sel>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pan, setPan] = useState<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const [builder, setBuilder] = useState(false);
  const [adding, setAdding] = useState<"body" | "location" | null>(null);
  const [liveAngle, setLiveAngle] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<MapMode>("plain");
  const [scaleMode, setScaleMode] = useState<"schematic" | "true" | null>(null);
  const dragged = useRef(false);
  const lpointDots = useRef<LDot[]>([]);
  const version = repo?.all().map((r) => r.record.updated).join("|");
  const unit: DistanceUnit = repo?.config.distanceUnit ?? "light";

  const records = useMemo(() => (repo ? repo.all().map((r) => r.record).filter((r): r is TypedRecord => !isNote(r)) : []), [repo, version]);
  const layout: Layout | null = useMemo(() => {
    if (!repo || !system) return null;
    const recMapping = String(system.fields.radius_mapping ?? "log");
    const mapping = scaleMode === "true" ? "linear" : scaleMode === "schematic" ? (recMapping === "linear" ? "log" : undefined) : undefined;
    return layoutSystem(system, records, (rid) => repo.typed(rid), mapping ? { mapping } : {});
  }, [repo, system, records, scaleMode]);
  const modes = useMemo(() => {
    const m = new Map<string, BodyModes>();
    if (!layout || !repo || mode === "plain") return m;
    const lookup = (rid: string) => repo.typed(rid);
    for (const b of [...layout.bodies, ...layout.lbodies]) m.set(b.id, bodyModes(b.record, records, lookup, b.derived));
    for (const b of layout.bodies) for (const s of b.neighbourhood) if (s.record && s.record.type === "body" && s.derived) m.set(s.id, bodyModes(s.record, records, lookup, s.derived));
    return m;
  }, [layout, mode, records, repo]);
  const polities = useMemo(() => records.filter((r) => r.type === "polity"), [records]);
  const colorOfPolity = (pid: string | undefined) => polityColor(pid ? repo?.typed(pid) : undefined, polities.findIndex((p) => p.id === pid));

  const fit = useCallback(
    (ext: number) => {
      const aspect = size.w / Math.max(1, size.h);
      setView({ x: -ext * aspect, y: -ext, w: ext * 2 * aspect, h: ext * 2 });
    },
    [size.w, size.h],
  );
  // Fit the whole system on open and whenever the canvas is measured/resized, until the
  // user zooms or pans (then leave their view alone).
  const userMoved = useRef(false);
  useEffect(() => {
    userMoved.current = false;
  }, [id, scaleMode]);
  useEffect(() => {
    if (layout && !userMoved.current) fit(layout.extent + 60);
  }, [id, scaleMode, size.w, size.h, !!layout]);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const zoom = size.w / view.w;
  const inv = 1 / zoom;

  const toMap = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: -p.y };
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const k = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const p = toMap(e.clientX, e.clientY);
      const sx = p.x;
      const sy = -p.y;
      userMoved.current = true;
      setView((v) => ({ x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k, w: v.w * k, h: v.h * k }));
      setTip(null);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toMap, !!layout]);

  if (!repo || !system || !layout) return <div className="muted">System not found.</div>;

  // ---- helpers ---------------------------------------------------------------
  const toScreen = (p: { x: number; y: number }) => ({ x: (p.x - view.x) * zoom, y: (-p.y - view.y) * zoom });
  const S = (p: { x: number; y: number }) => ({ x: p.x, y: -p.y });
  const showLabels = system.fields.show_labels !== false;
  const showNeighbourhood = zoom >= Z.neighbourhood;
  const showMinor = zoom >= Z.minor;
  /** Orbits drawn smaller than this on screen are a cluster: their L-points and L-objects would sit on top of the body, so they wait for zoom. */
  const CLUSTER_PX = 36;
  const clustered = (orbit: OrbitShape | undefined) => !!orbit && orbit.a * zoom < CLUSTER_PX;
  const clusteredLoc = (l: HelioLocation) => Math.hypot(l.pos.x, l.pos.y) * zoom < CLUSTER_PX;
  /**
   * A body's moon system is drawn only when it fits in the clear space around its orbit —
   * the gap to the neighbouring orbits/belts (or to the star) must exceed the neighbourhood
   * radius, so moons never reach the next planet's orbit. In true scale that means zooming
   * in a lot further for the inner planets than for the giants.
   */
  const ringRadii: number[] = [
    ...layout.bodies.filter((o) => o.orbit && !o.minor).map((o) => o.orbit!.a),
    ...layout.belts.flatMap((bt) => [bt.rInner, bt.rOuter]),
  ];
  const nbRadius = (b: BodyNode) => Math.max(0, ...b.neighbourhood.filter((s) => s.kind !== "lobject").map((s) => Math.hypot(s.off.x, s.off.y)));
  const showNb = (b: BodyNode) => {
    if (!showNeighbourhood) return false;
    const nr = nbRadius(b);
    if (nr === 0) return true;
    const a = b.orbit?.a ?? 0;
    let clear = a > 0 ? a : Infinity;
    for (const o of ringRadii) {
      const d = Math.abs(o - a);
      if (d > 1e-6) clear = Math.min(clear, d);
    }
    return clear * zoom >= nr * 0.8;
  };
  const scaleValue = scaleMode ?? (String(system.fields.radius_mapping ?? "log") === "linear" ? "true" : "schematic");
  const trueScale = scaleValue === "true";
  const selId = sel?.id ?? null;
  const primaryName = layout.primary?.name ?? "the primary";
  const distLine = (km: number | undefined, fromName: string) => (km !== undefined ? `${formatKm(km, unit)} from ${fromName}` : "");
  const ownerLine = (rec: TypedRecord | undefined) => {
    const o = rec ? repo.typed(String(rec.fields.owner ?? rec.fields.controller ?? "")) : undefined;
    return o ? `owner: ${o.name}` : "";
  };
  const lobjectLines = (secondaryId: string | undefined, point: string | undefined, distKm: number | undefined, hostName: string, majorKm: number | undefined) => {
    const lines: string[] = [];
    if (!secondaryId || !point) return lines;
    const sec = repo.typed(secondaryId);
    lines.push(`${sec?.name ?? "?"} ${point}`);
    if (sel?.id === secondaryId && sec) {
      const secD = layout.derived.get(sec.id);
      const along = point === "L1" || point === "L2" ? distKm : (secD?.smaKm ?? (secD?.heliocentricAU ? secD.heliocentricAU * AU_KM : undefined));
      lines.push(distLine(along, sec.name));
    } else lines.push(distLine(majorKm, hostName));
    return lines;
  };
  const modeLine = (bid: string): string => {
    if (mode === "plain") return "";
    const m = modes.get(bid);
    if (!m) return "";
    if (mode === "political") return m.control.length ? `control: ${m.control.map((c) => `${repo.typed(c.polityId ?? "")?.name ?? "unclaimed"} ${Math.round(c.share * 100)}%`).join(", ")} (${m.controlSource})` : "control: none";
    if (mode === "economic") return `industry ${m.industry.toFixed(1)}/10 · population ${m.populationM.toFixed(2)} M`;
    if (mode === "habitability") return `habitability ${(m.habitability * 100).toFixed(0)}% (${m.habitabilitySource})`;
    return `military ${m.military.toFixed(1)}`;
  };
  const showTip = (e: React.PointerEvent | React.MouseEvent, title: string, lines: string[]) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    setTip({ x: e.clientX - rect.left + 14, y: e.clientY - rect.top + 12, title, lines });
  };
  const hoverOn = (hid: string, title: string, lines: string[]) => (e: React.PointerEvent) => {
    setHover(hid);
    showTip(e, title, lines);
  };
  const hoverOff = () => {
    setHover(null);
    setTip(null);
  };

  // ---- interaction ----------------------------------------------------------
  const nearestLPoint = (clientX: number, clientY: number): LDot | null => {
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    let best: LDot | null = null;
    let bd = 12;
    for (const l of lpointDots.current) {
      const d = Math.hypot(l.sx - sx, l.sy - sy);
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest("[data-el]")) return;
    setPan({ sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pan) {
      if (Math.abs(e.clientX - pan.sx) + Math.abs(e.clientY - pan.sy) > 3) dragged.current = true;
      const scale = view.w / size.w;
      userMoved.current = true;
      setView((v) => ({ ...v, x: pan.vx - (e.clientX - pan.sx) * scale, y: pan.vy - (e.clientY - pan.sy) * scale }));
      setTip(null);
    } else if (drag) {
      dragged.current = true;
      const p = toMap(e.clientX, e.clientY);
      const ang = ((Math.atan2(p.y - drag.hostMap.y, p.x - drag.hostMap.x) * 180) / Math.PI + 360) % 360;
      setLiveAngle({ [drag.id]: ang });
      setDrag({ ...drag, angle: ang, moved: true });
      setTip(null);
    }
  };
  const onPointerUp = async (e: React.PointerEvent) => {
    if (pan) setTimeout(() => (dragged.current = false), 0);
    if (drag) {
      if (drag.moved) {
        const rec = repo.typed(drag.id);
        if (rec) {
          const snap = nearestLPoint(e.clientX, e.clientY);
          if (snap && snap.secondaryId !== rec.id && (rec.type === "location" || /asteroid|comet|artificial/.test(String(rec.fields.kind)))) {
            rec.fields.lagrange_of = snap.secondaryId;
            rec.fields.lagrange = snap.point;
            if (rec.type === "location") delete rec.fields.orbit_km;
            actions.toast(`Parked at ${snap.name}`);
          } else rec.fields.map_angle_deg = Math.round(drag.angle * 10) / 10;
          await repo.save(rec);
        }
      }
      setLiveAngle({});
      setDrag(null);
    }
    setPan(null);
  };
  const startDrag = (e: React.PointerEvent, item: { id: string; type: "body" | "location"; hostMap: { x: number; y: number }; shape?: OrbitShape; pos: { x: number; y: number } }) => {
    e.stopPropagation();
    setSel({ kind: item.type, id: item.id });
    if (!item.shape) return;
    const ang = (Math.atan2(item.pos.y - item.hostMap.y, item.pos.x - item.hostMap.x) * 180) / Math.PI;
    setDrag({ id: item.id, type: item.type, hostMap: item.hostMap, shape: item.shape, angle: ang, moved: false });
    (e.currentTarget.closest("svg") as Element).setPointerCapture(e.pointerId);
  };

  // ---- positions with live drag ---------------------------------------------
  const posOfBody = (b: BodyNode) => {
    const a = liveAngle[b.id];
    return a !== undefined && b.orbit ? pointOnOrbit(b.orbit, a) : b.pos;
  };
  const posOfLoc = (l: HelioLocation) => {
    const a = liveAngle[l.id];
    return a !== undefined && l.orbit ? pointOnOrbit(l.orbit, a) : l.pos;
  };
  /**
   * Drawn radius. Schematic: the layout's glyph size. True scale: bodies shrink towards
   * points so the inner system doesn't pile onto the star — a planet's radius is capped
   * at a third of its screen distance from its orbit centre, the star's at half the
   * distance to its nearest planet; zooming in restores the full glyphs.
   */
  const bodyR = (b: BodyNode): number => {
    if (!trueScale) return b.r;
    const pos = posOfBody(b);
    if (b.orbit) {
      const d = Math.hypot(pos.x - b.orbit.center.x, pos.y - b.orbit.center.y) * zoom;
      return Math.max(Math.min(b.r, 0.32 * d), b.minor ? 1.5 : 2.5);
    }
    let dMin = Infinity;
    for (const o of layout.bodies) {
      if (o === b || o.minor) continue;
      const q = posOfBody(o);
      dMin = Math.min(dMin, Math.hypot(q.x - pos.x, q.y - pos.y) * zoom);
    }
    return Number.isFinite(dMin) ? Math.max(Math.min(b.r, 0.5 * dMin), 4) : b.r;
  };
  const satOff = (s: Satellite, host?: BodyNode) => {
    const a = liveAngle[s.id];
    let off = s.off;
    if (a !== undefined) {
      if (s.orbitShape) off = pointOnOrbit(s.orbitShape, a);
      else if (s.orbitR) off = { x: s.orbitR * Math.cos((a * Math.PI) / 180), y: s.orbitR * Math.sin((a * Math.PI) / 180) };
    }
    // When the neighbourhood is hidden (zoomed out) Lagrange objects hug their body instead of
    // floating at the full moon-system offset with no moon to reference.
    if (s.kind === "lobject" && host && !showNb(host)) {
      const len = Math.hypot(off.x, off.y);
      const want = host.r + 11;
      if (len > want) off = { x: (off.x * want) / len, y: (off.y * want) / len };
    }
    return off;
  };

  // ---- labels (screen space, greedy) ------------------------------------------
  const labelReqs: LabelReq[] = [];
  for (const b of layout.bodies) {
    if (b.minor && !showMinor) continue;
    const sp = toScreen(posOfBody(b));
    const isStar = b.kind === "star" || b.kind === "brown-dwarf";
    labelReqs.push({ id: b.id, x: sp.x, y: sp.y, r: bodyR(b), text: b.name, sub: b.sublabel, fontPx: isStar ? 12 : 10, priority: b.priority });
    const nb = showNb(b) ? b.neighbourhood : clustered(b.orbit) ? [] : b.neighbourhood.filter((s) => s.kind === "lobject");
    for (const s of nb) {
      if (s.kind === "annotation" || s.kind === "lpoint") continue;
      if (s.kind === "moon" && zoom < Z.moonLabels) continue;
      const o = satOff(s, b);
      const isLoc = s.kind === "station" || (s.kind === "lobject" && !s.glyph);
      labelReqs.push({ id: s.id, x: sp.x + o.x, y: sp.y - o.y, r: s.r ?? 4, text: s.name, sub: s.kind === "moon" ? s.sublabel : undefined, fontPx: s.kind === "moon" ? 8 : isLoc ? LOC_FONT : 7.5, priority: s.kind === "moon" ? 20 : s.kind === "lobject" ? 25 : 15 });
    }
  }
  for (const b of layout.lbodies) {
    const sp = toScreen(b.pos);
    labelReqs.push({ id: b.id, x: sp.x, y: sp.y, r: b.r, text: b.name, sub: b.sublabel, fontPx: 8, priority: b.priority });
  }
  for (const l of layout.locations) {
    if (clusteredLoc(l)) continue;
    const sp = toScreen(posOfLoc(l));
    labelReqs.push({ id: l.id, x: sp.x, y: sp.y, r: 5, text: l.name, fontPx: LOC_FONT, priority: l.priority });
  }
  for (const belt of layout.belts) {
    const rr = (belt.rInner + belt.rOuter) / 2;
    const sp = toScreen({ x: rr * 0.7071, y: rr * 0.7071 });
    labelReqs.push({ id: belt.id, x: sp.x, y: sp.y, r: 2, text: belt.name, fontPx: 9, priority: 35 });
  }
  const placed = showLabels ? placeLabels(labelReqs) : new Map();
  const reqOf = new Map(labelReqs.map((r) => [r.id, r]));
  /** Labels: hovering an item enlarges its label (and shows it even if the placer hid it). */
  const renderLabel = (lid: string, fontPx: number, sub?: string, color = C.label, subColor = C.sublabel, bold = false) => {
    const hov = hover === lid;
    let p = placed.get(lid);
    if ((!p || p.hidden) && !hov) return null;
    const req = reqOf.get(lid);
    if (!req) return null;
    if (!p || p.hidden) p = { id: lid, dx: req.r + 5, dy: fontPx * 0.36, anchor: "start", hidden: false };
    const size = hov ? fontPx * 1.35 : fontPx;
    return (
      <g data-ui="label" style={{ pointerEvents: "none" }}>
        {hov && <rect x={p.anchor === "end" ? p.dx - req.text.length * size * 0.56 - 3 : p.anchor === "middle" ? p.dx - req.text.length * size * 0.28 - 3 : p.dx - 3} y={p.dy - size * 0.95} width={req.text.length * size * 0.56 + 6} height={size * 1.3} rx={2} fill={C.bg} opacity={0.75} />}
        <text x={p.dx} y={p.dy} fontSize={size} fill={hov ? C.label : color} fontFamily={FONT} fontWeight={bold || hov ? 600 : 500} textAnchor={p.anchor}>
          {req.text}
        </text>
        {sub && (
          <text x={p.dx} y={p.dy + fontPx * 0.95} fontSize={fontPx * 0.72} fill={subColor} fontFamily={FONT} textAnchor={p.anchor}>
            {sub}
          </text>
        )}
      </g>
    );
  };

  // ---- mode halos ----------------------------------------------------------------
  const haloFor = (bid: string): { color: string; shares?: { color: string; share: number }[] } | null => {
    if (mode === "plain") return null;
    const m = modes.get(bid);
    if (!m) return null;
    if (mode === "political") {
      if (!m.control.length) return null;
      if (m.control.length === 1 || m.control[0].share >= 0.75) return { color: colorOfPolity(m.control[0].polityId) };
      return { color: colorOfPolity(m.control[0].polityId), shares: m.control.slice(0, 4).map((c) => ({ color: colorOfPolity(c.polityId), share: c.share })) };
    }
    if (mode === "economic") return m.industry > 0 || m.populationM > 0 ? { color: rampColor(Math.min(1, m.industry / 10 + Math.log10(1 + m.populationM) / 12)) } : null;
    if (mode === "habitability") return { color: greenRamp(m.habitability) };
    if (mode === "military") return m.military > 0 ? { color: rampColor(Math.min(1, m.military / 12)) } : null;
    return null;
  };
  const renderHalo = (bid: string, r: number) => {
    const h = haloFor(bid);
    if (!h) return null;
    const rr = r + 4;
    if (!h.shares) return <circle r={rr} fill="none" stroke={h.color} strokeWidth={2.2} opacity={0.95} />;
    let acc = 0;
    return (
      <g>
        {h.shares.map((s, i) => {
          const a0 = acc * 360;
          acc += s.share;
          const a1 = acc * 360;
          return <path key={i} d={arcPath(0, 0, rr, 90 - a1, 90 - a0)} fill="none" stroke={s.color} strokeWidth={2.4} />;
        })}
      </g>
    );
  };
  const locColor = (rec: TypedRecord | undefined) => {
    if (!rec || mode === "plain") return C.loc;
    const lm = locationModes(rec, records);
    if (mode === "political") return lm.polityId ? colorOfPolity(lm.polityId) : "#6a7793";
    if (mode === "economic") return rampColor(Math.min(1, lm.industry / 10 + Math.log10(1 + lm.populationK) / 8));
    if (mode === "military") return rampColor(Math.min(1, lm.military / 10));
    return "#6a7793";
  };

  // ---- export -----------------------------------------------------------------------
  const exportSvg = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.querySelectorAll("[data-ui='bg']").forEach((n) => n.remove());
    clone.setAttribute("width", String(size.w));
    clone.setAttribute("height", String(size.h));
    clone.insertAdjacentHTML("afterbegin", `<rect x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}" fill="${C.bg}"/>`);
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n` + new XMLSerializer().serializeToString(clone);
    const path = await repo.putTextAsset(`${system.slug}.map.svg`, text);
    if (!system.assets.some((a) => a.path === path)) {
      system.assets = [...system.assets, { role: "map", path }];
      await repo.save(system);
    }
    actions.toast(`Saved ${path}`);
    if (!isTauri()) {
      const blob = new Blob([text], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${system.slug}.map.svg`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const selRecord: GalleryRecord | undefined = sel && sel.kind !== "annotation" ? repo.record(sel.id) : undefined;
  lpointDots.current = [];

  // ---- satellite renderer (inside a host's screen-px group) --------------------------
  const renderSatellite = (host: BodyNode, s: Satellite, hostScreen: { x: number; y: number }) => {
    const o = satOff(s, host);
    const p = { x: o.x, y: -o.y };
    const hovered = hover === s.id;
    const selected = selId === s.id;
    switch (s.kind) {
      case "annotation": {
        const a = s.arc!;
        const col = a.color ?? C.ring;
        const start = a.startDeg ?? 0;
        const end = a.endDeg ?? (a.ring ? 359.99 : 120);
        return (
          <g key={s.id} data-el={s.id} onClick={(e) => { e.stopPropagation(); setSel({ kind: "annotation", id: s.id }); }} onPointerEnter={hoverOn(s.id, a.label ?? "Annotation", [distLine(s.distKm, host.name)])} onPointerLeave={hoverOff} style={{ cursor: "pointer" }}>
            <path d={arcPath(0, 0, s.orbitR ?? 10, start, end)} fill="none" stroke={col} strokeWidth={a.width} opacity={hovered || selected ? 1 : 0.8} />
            {hovered && a.label && <text x={0} y={-(s.orbitR ?? 10) - 4} fontSize={8} fill={C.sublabel} textAnchor="middle" fontFamily={FONT} data-ui="1">{a.label}</text>}
          </g>
        );
      }
      case "lpoint": {
        lpointDots.current.push({ name: s.name, secondaryId: s.secondaryId!, point: s.lpoint!, sx: hostScreen.x + o.x, sy: hostScreen.y - o.y });
        return (
          <g key={s.id} data-el={s.id} transform={`translate(${p.x} ${p.y})`} onPointerEnter={hoverOn(s.id, s.name, [s.distKm !== undefined ? `${formatKm(s.distKm, unit)} from ${repo.typed(s.secondaryId!)?.name ?? host.name}` : "", "drop a station or small body here to park it"])} onPointerLeave={hoverOff} style={{ cursor: "crosshair" }}>
            <circle r={hovered ? 3.2 : 1.7} fill={s.occupied ? C.lagrangeOn : C.lagrange} opacity={s.occupied ? 0.95 : 0.7} />
            <circle r={7} fill="transparent" />
            {hovered && <text x={5} y={-4} fontSize={7} fill={C.sublabel} fontFamily={FONT} data-ui="1">{s.lpoint}</text>}
          </g>
        );
      }
      case "moon":
        return (
          <g key={s.id}>
            {s.orbitShape && <ellipse cx={s.orbitShape.center.x} cy={-s.orbitShape.center.y} rx={s.orbitShape.a} ry={s.orbitShape.b} transform={`rotate(${-s.orbitShape.rotationDeg} ${s.orbitShape.center.x} ${-s.orbitShape.center.y})`} fill="none" stroke={selected || hovered ? C.select : C.orbitFaint} strokeWidth={0.8} />}
            <g data-el={s.id} transform={`translate(${p.x} ${p.y})`} onPointerDown={(e) => startDrag(e, { id: s.id, type: "body", hostMap: host.pos, shape: s.orbitShape, pos: { x: host.pos.x + o.x * inv, y: host.pos.y + o.y * inv } })} onPointerEnter={hoverOn(s.id, s.name, [s.derived?.ewocs.full ?? "", distLine(s.distKm, host.name), s.derived?.periodDays ? `period ${s.derived.periodDays.toFixed(2)} d` : "", modeLine(s.id)])} onPointerLeave={hoverOff} style={{ cursor: "grab" }}>
              {selected && <circle r={(s.r ?? 3) + 3.5} fill="none" stroke={C.select} strokeWidth={1.2} />}
              {hovered && !selected && <circle r={(s.r ?? 3) + 3} fill="none" stroke={C.hover} strokeWidth={0.8} opacity={0.7} />}
              {renderHalo(s.id, s.r ?? 3)}
              <g dangerouslySetInnerHTML={{ __html: glyphMarkup(s.glyph!, s.r ?? 3) }} />
              {zoom >= Z.moonLabels && renderLabel(s.id, 8, s.sublabel)}
            </g>
            {/* the moon's own neighbourhood (its L-points etc.) is flattened into the host's list */}
          </g>
        );
      case "station":
        return (
          <g key={s.id}>
            {(hovered || selected) && s.orbitR && <circle r={s.orbitR} fill="none" stroke={C.orbitLoc} strokeWidth={0.8} strokeDasharray="2 3" />}
            <g data-el={s.id} transform={`translate(${p.x} ${p.y})`} onPointerDown={(e) => startDrag(e, { id: s.id, type: "location", hostMap: host.pos, shape: s.orbitR ? orbitCircle(s.orbitR) : undefined, pos: { x: host.pos.x + o.x * inv, y: host.pos.y + o.y * inv } })} onPointerEnter={hoverOn(s.id, s.name, [String(s.record?.fields.kind ?? ""), distLine(s.distKm, host.name), ownerLine(s.record)])} onPointerLeave={hoverOff} style={{ cursor: "grab" }}>
              {selected && <circle r={8} fill="none" stroke={C.select} strokeWidth={1.2} />}
              <g dangerouslySetInnerHTML={{ __html: locationSymbol(s.symbol ?? "station", locColor(s.record)) }} />
              {renderLabel(s.id, LOC_FONT, undefined, C.loc)}
            </g>
          </g>
        );
      case "lobject":
        return (
          <g key={s.id} data-el={s.id} transform={`translate(${p.x} ${p.y})`} onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: s.record?.type === "body" ? "body" : "location", id: s.id }); }} onPointerEnter={hoverOn(s.id, s.name, [s.derived?.ewocs.full ?? String(s.record?.fields.kind ?? ""), ...lobjectLines(s.secondaryId, s.lpoint, s.distKm, host.name, host.distKm), ownerLine(s.record), modeLine(s.id)])} onPointerLeave={hoverOff} style={{ cursor: "pointer" }}>
            {selected && <circle r={(s.r ?? 5) + 3.5} fill="none" stroke={C.select} strokeWidth={1.2} />}
            {s.glyph ? renderHalo(s.id, s.r ?? 3) : null}
            {s.glyph ? <g dangerouslySetInnerHTML={{ __html: glyphMarkup(s.glyph, s.r ?? 3) }} /> : <g dangerouslySetInnerHTML={{ __html: locationSymbol(s.symbol ?? "base", locColor(s.record)) }} />}
            {renderLabel(s.id, s.glyph ? 7.5 : LOC_FONT, undefined, s.glyph ? C.label : C.loc)}
          </g>
        );
    }
  };

  return (
    <div className="mapview">
      <div className="maptools row">
        <button className="ghost" onClick={() => actions.back()} title="Back">←</button>
        <b>{system.name}</b>
        <span className="muted" style={{ fontSize: 11 }}>
          {Math.max(0, layout.bodies.length - 1)} bodies · {formatKm(layout.aMin * AU_KM, unit, 2)} – {formatKm(layout.aMax * AU_KM, unit, 3)}
        </span>
        <span className="grow" />
        <select value={mode} onChange={(e) => setMode(e.target.value as MapMode)} style={{ width: "auto" }} title="Display mode">
          {MAP_MODES.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <select value={scaleValue} onChange={(e) => setScaleMode(e.target.value as "schematic" | "true")} style={{ width: "auto" }} title="Orbit spacing">
          <option value="schematic">Schematic</option>
          <option value="true">True scale</option>
        </select>
        <select value={unit} onChange={(e) => repo.saveConfig({ distanceUnit: e.target.value as DistanceUnit })} style={{ width: "auto" }} title="Distance units">
          {DISTANCE_UNITS.map((u) => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </select>
        <button onClick={() => setAdding(adding === "body" ? null : "body")}>+ Body</button>
        <button onClick={() => setAdding(adding === "location" ? null : "location")}>+ Location</button>
        <button onClick={() => { setBuilder((b) => !b); setSel(null); }}>Skeleton…</button>
        <button onClick={() => { userMoved.current = false; fit(layout.extent + 60); }} title="Fit">⤢</button>
        <button onClick={exportSvg} title="Save an SVG of this view into assets/">Export SVG</button>
        <button className="ghost" onClick={() => actions.navigate({ kind: "record", id: system.id })}>Record ↗</button>
      </div>
      <div className="mapbody">
        <div className="mapwrap" ref={wrapRef}>
          <svg ref={svgRef} className="mapsvg" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} style={{ cursor: pan || drag ? "grabbing" : "default" }}>
            <rect data-ui="bg" x={view.x} y={view.y} width={view.w} height={view.h} fill={C.bg} onClick={() => { if (dragged.current) { dragged.current = false; return; } setSel(null); }} />

            {layout.zones.map((z) =>
              z.kind === "frost" ? <circle key="frost" r={z.rInner} fill="none" stroke={C.frost} strokeDasharray={`${6 * inv} ${8 * inv}`} strokeWidth={inv} opacity={0.45} /> : <circle key="hz" r={(z.rInner + z.rOuter) / 2} fill="none" stroke={C.hz} strokeWidth={Math.max(2 * inv, z.rOuter - z.rInner)} opacity={0.1} />,
            )}

            {layout.belts.map((belt) => {
              const rr = (belt.rInner + belt.rOuter) / 2;
              const w = Math.max(6 * inv, belt.rOuter - belt.rInner);
              const selected = selId === belt.id;
              const lp = placed.get(belt.id);
              const sp = { x: rr * 0.7071, y: -rr * 0.7071 };
              const bi = belt.record.fields.belt_inner_au as number;
              const bo = belt.record.fields.belt_outer_au as number;
              return (
                <g key={belt.id} data-el={belt.id} onClick={(e) => { e.stopPropagation(); setSel({ kind: "body", id: belt.id }); }} onPointerEnter={hoverOn(belt.id, belt.name, [`${formatKm(bi * AU_KM, unit)} – ${formatKm(bo * AU_KM, unit)} from ${primaryName}`])} onPointerLeave={hoverOff} style={{ cursor: "pointer" }}>
                  <circle r={rr} fill="none" stroke={belt.color ?? C.belt} strokeWidth={w} opacity={selected ? 0.45 : 0.22} />
                  <circle r={rr} fill="none" stroke={belt.color ?? C.belt} strokeWidth={w * 0.6} strokeDasharray={`${2 * inv} ${5 * inv}`} opacity={0.3} />
                  {lp && !lp.hidden && (
                    <g transform={`translate(${sp.x} ${sp.y}) scale(${inv})`}>
                      <text x={lp.dx} y={lp.dy} fontSize={9} fill={C.sublabel} fontFamily={FONT} textAnchor={lp.anchor} data-ui="label">{belt.name}</text>
                    </g>
                  )}
                </g>
              );
            })}

            {layout.orbits.map((o) => {
              const hi = selId === o.id || hover === o.id;
              if (o.artificial && !hi) return null;
              const c = { x: o.shape.center.x, y: -o.shape.center.y };
              return <ellipse key={"o" + o.id} cx={c.x} cy={c.y} rx={o.shape.a} ry={o.shape.b} transform={`rotate(${-o.shape.rotationDeg} ${c.x} ${c.y})`} fill="none" stroke={hi ? C.select : o.owner === "location" ? C.orbitLoc : C.orbit} strokeWidth={(hi ? 1.6 : 1) * inv} strokeDasharray={o.dashed ? `${3 * inv} ${4 * inv}` : undefined} />;
            })}

            {layout.annotations.map((an) => {
              const col = an.color ?? C.ring;
              if (an.kind === "label") return <text key={an.id} x={0} y={-an.r} fontSize={11 * inv} fill={col} textAnchor="middle" fontFamily={FONT}>{an.label}</text>;
              const s0 = an.startDeg ?? 0;
              const e0 = an.endDeg ?? (an.kind === "ring" ? 359.99 : 120);
              const mid = polar(0, 0, an.r + (an.width + 6) * inv, (s0 + e0) / 2);
              return (
                <g key={an.id} data-el={an.id} onClick={(ev) => { ev.stopPropagation(); setSel({ kind: "annotation", id: an.id }); }} onPointerEnter={hoverOn(an.id, an.label ?? "Annotation", [])} onPointerLeave={hoverOff} style={{ cursor: "pointer" }}>
                  <path d={arcPath(0, 0, an.r, s0, e0)} fill="none" stroke={col} strokeWidth={an.width * inv} opacity={selId === an.id ? 1 : 0.8} />
                  {showLabels && an.label && <text x={mid.x} y={mid.y} fontSize={9 * inv} fill={C.sublabel} textAnchor="middle" fontFamily={FONT}>{an.label}</text>}
                </g>
              );
            })}

            {layout.bodies.map((b) =>
              (clustered(b.orbit) ? [] : b.lpoints).map((lp) => {
                const p = S(lp.pos);
                const lid = `${b.id}:${lp.point}`;
                const sp = toScreen(lp.pos);
                lpointDots.current.push({ name: `${b.name} ${lp.point}`, secondaryId: b.id, point: lp.point, sx: sp.x, sy: sp.y });
                const hovered = hover === lid;
                return (
                  <g key={lid} data-el={lid} transform={`translate(${p.x} ${p.y}) scale(${inv})`} onPointerEnter={hoverOn(lid, `${b.name} ${lp.point}`, [distLine(b.distKm, primaryName), "drop a station or small body here to park it"])} onPointerLeave={hoverOff} style={{ cursor: "crosshair" }}>
                    <circle r={hovered ? 3.4 : 2} fill={lp.occupied ? C.lagrangeOn : C.lagrange} opacity={lp.occupied ? 0.95 : 0.65} />
                    <circle r={8} fill="transparent" />
                    {hovered && <text x={6} y={-4} fontSize={8} fill={C.sublabel} fontFamily={FONT} data-ui="1">{lp.point}</text>}
                  </g>
                );
              }),
            )}

            {layout.locations.map((l) => {
              if (clusteredLoc(l)) return null;
              const pos = posOfLoc(l);
              const p = S(pos);
              const selected = selId === l.id;
              const hovered = hover === l.id;
              return (
                <g key={l.id} data-el={l.id} transform={`translate(${p.x} ${p.y}) scale(${inv})`} onPointerDown={(e) => startDrag(e, { id: l.id, type: "location", hostMap: { x: 0, y: 0 }, shape: l.orbit, pos })} onPointerEnter={hoverOn(l.id, l.name, [String(l.record.fields.kind ?? ""), ...(l.lpoint ? lobjectLines(l.lpoint.secondaryId, l.lpoint.point, l.distKm, primaryName, l.distKm) : [distLine(l.distKm, primaryName)]), ownerLine(l.record)])} onPointerLeave={hoverOff} style={{ cursor: l.orbit ? "grab" : "pointer" }}>
                  {selected && <circle r={9} fill="none" stroke={C.select} strokeWidth={1.2} />}
                  {hovered && !selected && <circle r={8} fill="none" stroke={C.hover} strokeWidth={0.8} opacity={0.7} />}
                  <g dangerouslySetInnerHTML={{ __html: locationSymbol(l.symbol, locColor(l.record)) }} />
                  {renderLabel(l.id, LOC_FONT, undefined, C.loc)}
                </g>
              );
            })}

            {layout.lbodies.map((b) => {
              const p = S(b.pos);
              const selected = selId === b.id;
              return (
                <g key={b.id} data-el={b.id} transform={`translate(${p.x} ${p.y}) scale(${inv})`} onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: "body", id: b.id }); }} onPointerEnter={hoverOn(b.id, b.name, [b.detail, ...lobjectLines(b.lpoint.secondaryId, b.lpoint.point, undefined, primaryName, b.derived.heliocentricAU ? b.derived.heliocentricAU * AU_KM : undefined), modeLine(b.id)])} onPointerLeave={hoverOff} style={{ cursor: "pointer" }}>
                  {selected && <circle r={b.r + 4} fill="none" stroke={C.select} strokeWidth={1.4} />}
                  {renderHalo(b.id, b.r)}
                  <g dangerouslySetInnerHTML={{ __html: glyphMarkup(b.glyph, b.r) }} />
                  {renderLabel(b.id, 8, b.sublabel)}
                </g>
              );
            })}

            {layout.bodies.map((b) => {
              if (b.minor && !showMinor) return null;
              const pos = posOfBody(b);
              const p = S(pos);
              const selected = selId === b.id;
              const hovered = hover === b.id;
              const isStar = b.kind === "star" || b.kind === "brown-dwarf" || b.kind === "barycenter";
              const hostScreen = toScreen(pos);
              const nb = showNb(b) ? b.neighbourhood : clustered(b.orbit) ? [] : b.neighbourhood.filter((s) => s.kind === "lobject");
              const order: Satellite["kind"][] = ["annotation", "lpoint", "moon", "station", "lobject"];
              const r = bodyR(b);
              return (
                <g key={b.id} transform={`translate(${p.x} ${p.y}) scale(${inv})`}>
                  {order.map((k) => nb.filter((s) => s.kind === k).map((s) => renderSatellite(b, s, hostScreen)))}
                  <g data-el={b.id} onPointerDown={(e) => startDrag(e, { id: b.id, type: "body", hostMap: { x: 0, y: 0 }, shape: b.orbit, pos })} onPointerEnter={hoverOn(b.id, b.name, [b.detail, isStar ? "" : distLine(b.distKm, primaryName), b.derived.periodYears ? `period ${b.derived.periodYears.toFixed(2)} yr` : "", modeLine(b.id)])} onPointerLeave={hoverOff} style={{ cursor: b.orbit ? "grab" : "pointer" }}>
                    {selected && <circle r={r + 5} fill="none" stroke={C.select} strokeWidth={1.5} />}
                    {hovered && !selected && <circle r={r + 4} fill="none" stroke={C.hover} strokeWidth={0.9} opacity={0.7} />}
                    {renderHalo(b.id, r)}
                    <g dangerouslySetInnerHTML={{ __html: glyphMarkup(b.glyph, r) }} />
                    {renderLabel(b.id, isStar ? 12 : 10, b.sublabel, C.label, C.sublabel, isStar)}
                  </g>
                </g>
              );
            })}
          </svg>
          {tip && (
            <div className="maptip" style={{ left: tip.x, top: tip.y }}>
              <div className="t">{tip.title}</div>
              {tip.lines.filter(Boolean).map((l, i) => (
                <div key={i} className="l">{l}</div>
              ))}
            </div>
          )}
          <div className="mapzoom muted">zoom {zoom.toFixed(2)}× · {showNeighbourhood ? "moons & stations shown" : "zoom in for moons & stations"}</div>
        </div>
        <div className="mapside">
          {builder ? (
            <SystemBuilder system={system} onDone={() => setBuilder(false)} />
          ) : adding ? (
            <AddOnMap kind={adding} system={system} layout={layout} onDone={(rid) => { setAdding(null); if (rid) setSel({ kind: adding, id: rid }); }} />
          ) : sel?.kind === "annotation" ? (
            <div className="card" style={{ marginTop: 0 }}>
              <h3 style={{ marginTop: 0 }}>Annotation</h3>
              <div className="muted">Edit annotations in the system record (Annotations table).</div>
              <button style={{ marginTop: 8 }} onClick={() => actions.navigate({ kind: "record", id: system.id })}>Open system record</button>
            </div>
          ) : selRecord ? (
            <div className="mapinspector">
              <RecordEditor key={selRecord.id} id={selRecord.id} />
            </div>
          ) : (
            <>
              <MapLegend mode={mode} polities={polities} colorOfPolity={colorOfPolity} />
              <SystemSettings system={system} layout={layout} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function orbitCircle(r: number): OrbitShape {
  return { focus: { x: 0, y: 0 }, center: { x: 0, y: 0 }, a: r, b: r, rotationDeg: 0, e: 0 };
}
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}
function arcPath(cx: number, cy: number, r: number, s: number, e: number) {
  const p0 = polar(cx, cy, r, s);
  const p1 = polar(cx, cy, r, e);
  const sweep = (((e - s) % 360) + 360) % 360;
  const large = sweep > 180 ? 1 : 0;
  return `M${p0.x} ${p0.y} A${r} ${r} 0 ${large} 0 ${p1.x} ${p1.y}`;
}

function locationSymbol(kind: string, c: string): string {
  switch (kind) {
    case "depot":
      return `<path d="M0 -4.5 4.5 0 0 4.5 -4.5 0Z" fill="${c}"/>`;
    case "shipyard":
      return `<path d="M-4 -2.3 0 -4.6 4 -2.3V2.3L0 4.6-4 2.3Z" fill="none" stroke="${c}" stroke-width="1.3"/><circle r="1.2" fill="${c}"/>`;
    case "skyhook":
      return `<path d="M-5 3 5 -3" stroke="${c}" stroke-width="1.4"/><circle r="1.6" fill="${c}"/>`;
    case "elevator":
      return `<path d="M0 -6V6" stroke="${c}" stroke-width="1.4"/><circle cy="-6" r="1.6" fill="${c}"/>`;
    case "ring":
      return `<circle r="4" fill="none" stroke="${c}" stroke-width="1.6"/>`;
    case "telescope":
      return `<path d="M-4 2 A4.5 4.5 0 0 1 4 2" fill="none" stroke="${c}" stroke-width="1.4"/><path d="M0 2V5" stroke="${c}" stroke-width="1.2"/>`;
    case "base":
      return `<path d="M0 -4.5 4.5 3.5 -4.5 3.5Z" fill="${c}"/>`;
    case "city":
      return `<circle r="2.6" fill="${c}"/>`;
    case "beacon":
      return `<path d="M0 -4.5 1.3 -1.3 4.5 -1.3 1.9 0.7 2.8 4 0 2 -2.8 4 -1.9 0.7 -4.5 -1.3 -1.3 -1.3Z" fill="${c}"/>`;
    case "station":
    default:
      return `<rect x="-3.5" y="-3.5" width="7" height="7" fill="none" stroke="${c}" stroke-width="1.4"/><path d="M-3.5 0H3.5M0 -3.5V3.5" stroke="${c}" stroke-width="1"/>`;
  }
}

function MapLegend({ mode, polities, colorOfPolity }: { mode: MapMode; polities: TypedRecord[]; colorOfPolity: (id: string | undefined) => string }) {
  if (mode === "plain") return null;
  const m = MAP_MODES.find((x) => x.id === mode)!;
  return (
    <div className="card" style={{ marginTop: 0 }}>
      <h3 style={{ marginTop: 0 }}>{m.label} mode</h3>
      <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>{m.description}</div>
      {mode === "political" ? (
        <div className="stack" style={{ gap: 3 }}>
          {polities.map((p) => (
            <div key={p.id} className="row" style={{ gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 6, background: colorOfPolity(p.id), display: "inline-block" }} />
              <span style={{ fontSize: 12 }}>{p.name}</span>
            </div>
          ))}
          <div className="row" style={{ gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, background: "#6a7793", display: "inline-block" }} />
            <span className="muted" style={{ fontSize: 12 }}>unclaimed · split ring = contested</span>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ height: 10, borderRadius: 4, background: mode === "habitability" ? `linear-gradient(90deg, ${greenRamp(0)}, ${greenRamp(1)})` : `linear-gradient(90deg, ${rampColor(0)}, ${rampColor(0.5)}, ${rampColor(1)})` }} />
          <div className="row muted" style={{ fontSize: 10, justifyContent: "space-between" }}>
            <span>{mode === "habitability" ? "0" : "none"}</span>
            <span>{mode === "habitability" ? "1" : mode === "economic" ? "10 + population" : "strong"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SystemSettings({ system, layout }: { system: TypedRecord; layout: Layout }) {
  const { repo } = useApp();
  const [fields, setFields] = useState(system.fields);
  const timer = useRef<number | null>(null);
  useEffect(() => setFields(system.fields), [system.id]);
  if (!repo) return null;
  const schema = repo.registry.get("system")!;
  const keys = ["radius_mapping", "inner_px", "outer_px", "moon_scale_px", "show_lagrange", "show_zones", "show_labels"];
  const sub = { ...schema.fields, properties: Object.fromEntries(Object.entries(schema.fields.properties ?? {}).filter(([k]) => keys.includes(k))) };
  return (
    <div>
      <div className="card" style={{ marginTop: 0 }}>
        <SchemaForm
          schema={sub}
          value={fields}
          onChange={(v) => {
            const next = { ...system.fields, ...v };
            for (const k of keys) if (!(k in v)) delete next[k];
            setFields(next);
            if (timer.current) window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => {
              system.fields = next;
              repo.save(system);
            }, 400);
          }}
        />
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>How to use</h3>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          Scroll to zoom, drag the background to pan. Zoom in to reveal moons, orbital stations and minor bodies; planets keep their size while orbits scale. Hover anything for its full classification and distance; click to edit it here; drag a body or
          station along its orbit, or drop a station on a Lagrange dot to park it there. “Lagrange point of” names the smaller body of the pair (Luna for Earth–Moon points, Earth for Earth–star points).
        </div>
      </div>
      {layout.warnings.length > 0 && (
        <div className="card warn">
          <h3 style={{ marginTop: 0 }}>Map warnings</h3>
          <ul className="warn" style={{ paddingLeft: 18 }}>
            {layout.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AddOnMap({ kind, system, layout, onDone }: { kind: "body" | "location"; system: TypedRecord; layout: Layout; onDone: (id?: string) => void }) {
  const { repo } = useApp();
  const [preset, setPreset] = useState(kind === "body" ? "earthlike" : "station");
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string>(layout.primary?.id ?? "");
  const [sma, setSma] = useState<number>(kind === "body" ? 1 : 400);
  if (!repo) return null;
  const presets = repo.registry.presetsFor(kind);
  const parentRec = parent ? repo.typed(parent) : undefined;
  const parentIsStar = !parentRec || /star|barycenter|brown/.test(String(parentRec.fields.kind));
  const create = async () => {
    const p = presets.find((x) => x.id === preset);
    const rec = repo.create(kind, name.trim() || p?.title || `New ${kind}`, p);
    if (kind === "body") {
      rec.fields.system = system.id;
      rec.fields.parent = parent || undefined;
      if (String(rec.fields.kind) === "belt") {
        rec.fields.belt_inner_au ??= sma;
        rec.fields.belt_outer_au ??= sma * 1.4;
      } else if (parentIsStar) {
        rec.fields.sma_au = sma;
        delete rec.fields.sma_km;
      } else {
        rec.fields.sma_km = sma;
        delete rec.fields.sma_au;
        if (rec.fields.kind === "planet") rec.fields.kind = "moon";
      }
      rec.fields.map_angle_deg = Math.round(Math.random() * 360);
    } else {
      if (parent && !parentIsStar) {
        rec.fields.body = parent;
        rec.fields.orbit_km = sma;
      } else rec.fields.sma_au = sma;
      rec.fields.map_angle_deg = Math.round(Math.random() * 360);
    }
    await repo.save(rec);
    onDone(rec.id);
  };
  return (
    <div className="card" style={{ marginTop: 0 }}>
      <h3 style={{ marginTop: 0 }}>Add {kind}</h3>
      <div className="stack">
        <select value={preset} onChange={(e) => setPreset(e.target.value)}>
          <option value="">— blank —</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
        <input type="text" placeholder="Name" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        <label className="muted" style={{ fontSize: 11 }}>Orbits</label>
        <select value={parent} onChange={(e) => setParent(e.target.value)}>
          {layout.bodies.map((b) => (
            <option key={b.id} value={b.id}>{b.name}{b.id === layout.primary?.id ? " (primary)" : ""}</option>
          ))}
        </select>
        <span className="row">
          <input type="number" step="any" min={0} value={sma} onChange={(e) => setSma(Number(e.target.value))} />
          <span className="unit">{parentIsStar ? "AU" : "km"}</span>
        </span>
        <div className="row">
          <button className="primary" onClick={create}>Create</button>
          <button className="ghost" onClick={() => onDone()}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
