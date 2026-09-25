/**
 * Schematic system map: SVG canvas + inspector.
 *
 * Orbits live in map units and zoom; every body's neighbourhood (glyph, moons,
 * stations, L-points, labels) is drawn in screen pixels so it keeps a constant
 * size. Semantic zoom: moons/stations/minor bodies appear past thresholds.
 * Labels are placed greedily in screen space; artificial orbits show only on
 * hover/selection; the full classification and distances live in the tooltip.
 *
 * Past the far-zoom threshold (a fraction of the fit-to-system zoom, set in
 * gallery.config.yaml `map.far_zoom_ratio`) the chart collapses to tactical
 * symbols: a threshold, not a blend (SystemMapFarZoom, TacticalSymbols).
 *
 * Type, strokes and marks are theme tokens; geometry that needs arithmetic
 * reads their px values once (`mapSizes`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { actions, useApp } from "./state";
import type { TypedRecord, GalleryRecord } from "../core/types";
import { DEFAULT_FAR_ZOOM_RATIO, isNote } from "../core/types";
import { layoutSystem, placeLabels, pointOnOrbit, type BodyNode, type HelioLocation, type Layout, type LabelReq, type OrbitShape, type Satellite } from "../core/astro/layout";
import { glyphMarkup } from "../core/astro/glyph";
import { glyphPaletteFrom } from "../core/astro/tints";
import { AFFILIATIONS, affiliationOf, frameMarkup, tacticalMarkup, type Affiliation, type SpaceObject } from "../core/astro/tactical";
import { recordCode } from "../core/handling";
import { resolveThemeColors } from "./themeColors";
import { mapSizes } from "./tokenPx";
import { Button, Group, NumberField, Panel, Row, Segmented, Select, StatusRow, TextField, caps } from "./kit";
import { formatKm, type DistanceUnit } from "../core/astro/units";
import { AU_KM } from "../core/astro/worldsmith";
import { bodyModes, locationModes, polityColor, rampColor, greenRamp, UNCLAIMED_COLOR, MAP_MODES, type MapMode, type BodyModes } from "../core/astro/modes";
import { RecordEditor } from "./RecordEditor";
import { SchemaForm } from "./SchemaForm";
import { SystemBuilder } from "./SystemBuilder";
import { isTauri } from "../core/storage/tauri";
import { logEvent } from "./log";

/**
 * Canvas colours, all theme tokens (docs/STYLE.md §1, SystemMap README).
 * `accent-500` is the selection and nothing else on the canvas (§8). Exported
 * SVGs resolve these to literal colours (`resolveThemeColors`).
 */
const C = {
  bg: "var(--map-void)",
  orbit: "var(--map-orbit)",
  orbitFaint: "var(--map-grid)",
  orbitLoc: "var(--line-200)",
  hz: "var(--map-zone)",
  frost: "var(--map-zone)",
  belt: "var(--map-belt)",
  label: "var(--ink-100)",
  minorLabel: "var(--ink-200)",
  sublabel: "var(--ink-300)",
  loc: "var(--glyph-navy)",
  lagrange: "var(--ink-300)",
  lagrangeOn: "var(--ink-100)",
  select: "var(--accent-500)",
  leader: "var(--accent-600)",
  selectLabel: "var(--accent-300)",
  hover: "var(--line-300)",
  ring: "var(--map-belt)",
};
/** Label type (SystemMap README): a named body in title-sm over a data-xs classification; everything else one data-xs line. */
const T = { title: { font: "var(--text-title-sm)" }, xs: { font: "var(--text-data-xs)" }, sm: { font: "var(--text-data-sm)" } };
/** Far-zoom label colours: hostile and unknown take their status text colour, the rest ink-200. */
const AFF_LABEL: Record<Affiliation, string> = { friend: C.minorLabel, neutral: C.minorLabel, hostile: "var(--status-red)", unknown: "var(--status-amber)" };
/** The toolbar's unit switch. */
const UNIT_OPTIONS: { value: DistanceUnit; label: string; title: string }[] = [
  { value: "light", label: "LIGHT-TIME", title: "light-seconds · minutes · hours · days" },
  { value: "au", label: "AU", title: "astronomical units, km for moons" },
  { value: "mkm", label: "M KM", title: "million kilometres" },
];

/** Zoom thresholds (screen px per map px). */
const Z = { neighbourhood: 1.8, moonLabels: 2.6, minor: 1.3 };

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
interface FarItem {
  id: string;
  name: string;
  obj: SpaceObject;
  aff?: Affiliation;
  pos: { x: number; y: number };
  record: TypedRecord;
  priority: number;
  sub: string;
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
  const sizes = useMemo(() => mapSizes(), []);

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
  const palette = useMemo(() => glyphPaletteFrom(repo?.tables), [repo, records]);
  const colorOfPolity = (pid: string | undefined) => polityColor(pid ? repo?.typed(pid) : undefined, polities.findIndex((p) => p.id === pid), repo?.config.polityPalette);

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

  // The session log: the map opened, and anything its layout could not resolve.
  const logged = useRef<string | null>(null);
  useEffect(() => {
    if (!layout || !system || logged.current === id) return;
    logged.current = id;
    const subject = { subject: system.name, subjectId: system.id };
    const stations = layout.locations.length + layout.bodies.reduce((n, b) => n + b.neighbourhood.filter((s) => s.kind === "station" || (s.kind === "lobject" && !s.glyph)).length, 0);
    logEvent({ severity: "info", source: "map", message: `${system.name} opened — ${Math.max(0, layout.bodies.length - 1)} bodies, ${stations} stations`, detail: subject });
    if (layout.warnings.length) for (const w of layout.warnings) logEvent({ severity: "caution", source: "map", message: w, detail: subject });
    else logEvent({ severity: "nominal", source: "map", message: "All orbits resolved against parent bodies", detail: subject });
  }, [id, !!layout]);

  if (!repo || !system || !layout) return <div className="muted">System not found.</div>;

  // ---- helpers ---------------------------------------------------------------
  /** Token sizes: the station mark scales every other mark; b1/b2 are the border tokens. */
  const m = sizes.station;
  const toScreen = (p: { x: number; y: number }) => ({ x: (p.x - view.x) * zoom, y: (-p.y - view.y) * zoom });
  const S = (p: { x: number; y: number }) => ({ x: p.x, y: -p.y });
  const showLabels = system.fields.show_labels !== false;
  const showNeighbourhood = zoom >= Z.neighbourhood;
  const showMinor = zoom >= Z.minor;
  /** Far zoom: below this fraction of the fit-to-system zoom, symbols replace rendered bodies. */
  const fitZoom = size.h / (2 * (layout.extent + 60));
  const far = zoom < fitZoom * (repo.config.map?.far_zoom_ratio ?? DEFAULT_FAR_ZOOM_RATIO);
  /** Orbits drawn smaller than this on screen are a cluster: their L-points and L-objects would sit on top of the body, so they wait for zoom. */
  const CLUSTER_PX = m * 4;
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
  const lookup = (rid: string) => repo.typed(rid);
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
  /** The selected object's second line, beneath its name on the leader. */
  const lpointSub = (lp: { secondaryId: string; point: string } | undefined) => {
    if (!lp) return "";
    const sec = repo.typed(lp.secondaryId);
    return `${lp.point} · ${sec?.name ?? "?"}–${primaryName}`;
  };
  const modeLine = (bid: string): string => {
    if (mode === "plain") return "";
    const md = modes.get(bid);
    if (!md) return "";
    if (mode === "political") return md.control.length ? `control: ${md.control.map((c) => `${repo.typed(c.polityId ?? "")?.name ?? "unclaimed"} ${Math.round(c.share * 100)}%`).join(", ")} (${md.controlSource})` : "control: none";
    if (mode === "economic") return `industry ${md.industry.toFixed(1)}/10 · population ${md.populationM.toFixed(2)} M`;
    if (mode === "habitability") return `habitability ${(md.habitability * 100).toFixed(0)}% (${md.habitabilitySource})`;
    return `military ${md.military.toFixed(1)}`;
  };
  const showTip = (e: React.PointerEvent | React.MouseEvent, title: string, lines: string[]) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    setTip({ x: e.clientX - rect.left + m * 1.5, y: e.clientY - rect.top + m * 1.3, title, lines });
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
    let bd = m * 1.3;
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
            logEvent({ severity: "info", source: "map", message: `${rec.name} parked at ${snap.name}`, detail: { subject: rec.name, subjectId: rec.id } });
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
      return Math.max(Math.min(b.r, 0.32 * d), m * (b.minor ? 0.17 : 0.28));
    }
    let dMin = Infinity;
    for (const o of layout.bodies) {
      if (o === b || o.minor) continue;
      const q = posOfBody(o);
      dMin = Math.min(dMin, Math.hypot(q.x - pos.x, q.y - pos.y) * zoom);
    }
    return Number.isFinite(dMin) ? Math.max(Math.min(b.r, 0.5 * dMin), m * 0.45) : b.r;
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
      const want = host.r + m * 1.2;
      if (len > want) off = { x: (off.x * want) / len, y: (off.y * want) / len };
    }
    return off;
  };
  const isStarKind = (k: string) => k === "star" || k === "brown-dwarf" || k === "barycenter";

  // ---- far zoom: tactical symbols -----------------------------------------------
  const farItems: FarItem[] = !far
    ? []
    : [
        ...layout.bodies
          .filter((b) => !b.minor)
          .map((b): FarItem => ({ id: b.id, name: b.name, obj: isStarKind(b.kind) ? "star" : "planet", aff: affiliationOf(b.record, lookup), pos: posOfBody(b), record: b.record, priority: b.priority, sub: b.sublabel })),
        ...layout.locations.map((l): FarItem => ({ id: l.id, name: l.name, obj: "station", aff: affiliationOf(l.record, lookup), pos: posOfLoc(l), record: l.record, priority: l.priority, sub: l.lpoint ? lpointSub(l.lpoint) : String(l.record.fields.kind ?? "") })),
      ];
  const majorIds = new Set(layout.bodies.filter((b) => !b.minor).map((b) => b.id));

  // ---- labels (screen space, greedy) ------------------------------------------
  const labelReqs: LabelReq[] = [];
  /** A named body takes title-sm with a data-xs sublabel; everything else one data-xs line. */
  const minorReq = (lid: string, x: number, y: number, r: number, text: string, priority: number): LabelReq => ({ id: lid, x, y, r, text, fontPx: sizes.dataXs, mono: true, priority });
  if (far) {
    for (const it of farItems) {
      const sp = toScreen(it.pos);
      labelReqs.push(minorReq(it.id, sp.x, sp.y, sizes.frameH * 0.75, caps(it.name), it.obj === "star" ? 100 : it.priority));
    }
  } else {
    for (const b of layout.bodies) {
      if (b.minor && !showMinor) continue;
      const sp = toScreen(posOfBody(b));
      if (b.minor) labelReqs.push(minorReq(b.id, sp.x, sp.y, bodyR(b), b.name, b.priority));
      else labelReqs.push({ id: b.id, x: sp.x, y: sp.y, r: bodyR(b), text: b.name, sub: b.sublabel, fontPx: sizes.title, subPx: sizes.dataXs, priority: b.priority });
      const nb = showNb(b) ? b.neighbourhood : clustered(b.orbit) ? [] : b.neighbourhood.filter((s) => s.kind === "lobject");
      for (const s of nb) {
        if (s.kind === "annotation" || s.kind === "lpoint") continue;
        if (s.kind === "moon" && zoom < Z.moonLabels) continue;
        const o = satOff(s, b);
        labelReqs.push(minorReq(s.id, sp.x + o.x, sp.y - o.y, s.r ?? m / 2, s.name, s.kind === "moon" ? 20 : s.kind === "lobject" ? 25 : 15));
      }
    }
    for (const b of layout.lbodies) {
      const sp = toScreen(b.pos);
      labelReqs.push(minorReq(b.id, sp.x, sp.y, b.r, b.name, b.priority));
    }
    for (const l of layout.locations) {
      if (clusteredLoc(l)) continue;
      const sp = toScreen(posOfLoc(l));
      labelReqs.push(minorReq(l.id, sp.x, sp.y, m / 2, l.name, l.priority));
    }
    for (const belt of layout.belts) {
      const rr = (belt.rInner + belt.rOuter) / 2;
      const sp = toScreen({ x: rr * 0.7071, y: rr * 0.7071 });
      labelReqs.push(minorReq(belt.id, sp.x, sp.y, 0, belt.name, 35));
    }
    // The habitable band and frost line are labelled, so the band is never the only cue.
    for (const z of layout.zones) {
      const r = z.kind === "hz" ? z.rOuter : z.rInner;
      const sp = z.kind === "hz" ? toScreen({ x: 0, y: r }) : toScreen({ x: r * 0.643, y: r * 0.766 });
      labelReqs.push(minorReq(`zone:${z.kind}`, sp.x, sp.y, 0, z.kind === "hz" ? "HABITABLE ZONE" : "FROST LINE", 30));
    }
  }
  const placed = showLabels ? placeLabels(labelReqs) : new Map();
  const reqOf = new Map(labelReqs.map((r) => [r.id, r]));
  /**
   * A placed label. Hovering an item shows its label even if the placer hid it, in ink-100
   * on a map-void scrim. The selected object's label is drawn by its selection mark instead.
   */
  const renderLabel = (lid: string, opts: { sub?: string; color?: string } = {}) => {
    if (lid === selId) return null;
    const hov = hover === lid;
    let p = placed.get(lid);
    if ((!p || p.hidden) && !hov) return null;
    const req = reqOf.get(lid);
    if (!req) return null;
    if (!p || p.hidden) p = { id: lid, dx: req.r + m * 0.55, dy: req.fontPx * 0.36, anchor: "start", hidden: false };
    const named = !req.mono;
    const w = req.text.length * req.fontPx * (named ? 0.58 : 0.62);
    const x0 = p.anchor === "end" ? p.dx - w : p.anchor === "middle" ? p.dx - w / 2 : p.dx;
    return (
      <g data-ui="label" style={{ pointerEvents: "none" }}>
        {hov && <rect x={x0 - m * 0.33} y={p.dy - req.fontPx} width={w + m * 0.67} height={req.fontPx * 1.3} fill={C.bg} style={{ opacity: "var(--opacity-scrim)" }} />}
        <text x={p.dx} y={p.dy} style={named ? T.title : T.xs} fill={hov || named ? C.label : (opts.color ?? C.minorLabel)} textAnchor={p.anchor}>
          {req.text}
        </text>
        {opts.sub && named && (
          <text x={p.dx} y={p.dy + req.fontPx * 1.05} style={T.xs} fill={C.sublabel} textAnchor={p.anchor}>
            {opts.sub}
          </text>
        )}
      </g>
    );
  };

  // ---- mode halos ----------------------------------------------------------------
  const haloFor = (bid: string): { color: string; shares?: { color: string; share: number }[] } | null => {
    if (mode === "plain") return null;
    const md = modes.get(bid);
    if (!md) return null;
    if (mode === "political") {
      if (!md.control.length) return null;
      if (md.control.length === 1 || md.control[0].share >= 0.75) return { color: colorOfPolity(md.control[0].polityId) };
      return { color: colorOfPolity(md.control[0].polityId), shares: md.control.slice(0, 4).map((c) => ({ color: colorOfPolity(c.polityId), share: c.share })) };
    }
    if (mode === "economic") return md.industry > 0 || md.populationM > 0 ? { color: rampColor(Math.min(1, md.industry / 10 + Math.log10(1 + md.populationM) / 12)) } : null;
    if (mode === "habitability") return { color: greenRamp(md.habitability) };
    if (mode === "military") return md.military > 0 ? { color: rampColor(Math.min(1, md.military / 12)) } : null;
    return null;
  };
  const renderHalo = (bid: string, r: number) => {
    const h = haloFor(bid);
    if (!h) return null;
    const rr = r + m * 0.45;
    if (!h.shares) return <circle r={rr} fill="none" stroke={h.color} strokeWidth="var(--border-2)" />;
    let acc = 0;
    return (
      <g>
        {h.shares.map((s, i) => {
          const a0 = acc * 360;
          acc += s.share;
          const a1 = acc * 360;
          return <path key={i} d={arcPath(0, 0, rr, 90 - a1, 90 - a0)} fill="none" stroke={s.color} strokeWidth="var(--border-2)" />;
        })}
      </g>
    );
  };
  const locColor = (rec: TypedRecord | undefined) => {
    if (!rec || mode === "plain") return C.loc;
    const lm = locationModes(rec, records);
    if (mode === "political") return lm.polityId ? colorOfPolity(lm.polityId) : UNCLAIMED_COLOR;
    if (mode === "economic") return rampColor(Math.min(1, lm.industry / 10 + Math.log10(1 + lm.populationK) / 8));
    if (mode === "military") return rampColor(Math.min(1, lm.military / 10));
    return UNCLAIMED_COLOR;
  };
  /** Station symbols keep their per-kind motifs, scaled to the station-mark token. */
  const station = (kind: string, color: string) => <g dangerouslySetInnerHTML={{ __html: `<g transform="scale(${m / 9})">${locationSymbol(kind, color)}</g>` }} />;
  const hoverRing = (r: number) => <circle r={r} fill="none" stroke={C.hover} strokeWidth="var(--border-1)" />;

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
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n` + resolveThemeColors(new XMLSerializer().serializeToString(clone));
    const path = await repo.putTextAsset(`${system.slug}.map.svg`, text);
    logEvent({ severity: "info", source: "export", message: `${system.name} exported to SVG — ${Math.max(1, Math.round(text.length / 1024))} KB`, detail: { subject: system.name, subjectId: system.id, path } });
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
            <path d={arcPath(0, 0, s.orbitR ?? m, start, end)} fill="none" stroke={col} strokeWidth={a.width} opacity={hovered || selected ? 1 : 0.8} />
            {hovered && a.label && <text x={0} y={-(s.orbitR ?? m) - m * 0.45} style={T.xs} fill={C.sublabel} textAnchor="middle" data-ui="1">{a.label}</text>}
          </g>
        );
      }
      case "lpoint": {
        lpointDots.current.push({ name: s.name, secondaryId: s.secondaryId!, point: s.lpoint!, sx: hostScreen.x + o.x, sy: hostScreen.y - o.y });
        return (
          <g key={s.id} data-el={s.id} transform={`translate(${p.x} ${p.y})`} onPointerEnter={hoverOn(s.id, s.name, [s.distKm !== undefined ? `${formatKm(s.distKm, unit)} from ${repo.typed(s.secondaryId!)?.name ?? host.name}` : "", "drop a station or small body here to park it"])} onPointerLeave={hoverOff} style={{ cursor: "crosshair" }}>
            <circle r={m * (hovered ? 0.36 : 0.19)} fill={s.occupied ? C.lagrangeOn : C.lagrange} opacity={s.occupied ? 0.95 : 0.7} />
            <circle r={m * 0.8} fill="transparent" />
            {hovered && <text x={m * 0.55} y={-m * 0.45} style={T.xs} fill={C.sublabel} data-ui="1">{s.lpoint}</text>}
          </g>
        );
      }
      case "moon":
        return (
          <g key={s.id}>
            {s.orbitShape && <ellipse cx={s.orbitShape.center.x} cy={-s.orbitShape.center.y} rx={s.orbitShape.a} ry={s.orbitShape.b} transform={`rotate(${-s.orbitShape.rotationDeg} ${s.orbitShape.center.x} ${-s.orbitShape.center.y})`} fill="none" stroke={selected || hovered ? C.select : C.orbitFaint} strokeWidth="var(--border-1)" />}
            <g data-el={s.id} transform={`translate(${p.x} ${p.y})`} onPointerDown={(e) => startDrag(e, { id: s.id, type: "body", hostMap: host.pos, shape: s.orbitShape, pos: { x: host.pos.x + o.x * inv, y: host.pos.y + o.y * inv } })} onPointerEnter={hoverOn(s.id, s.name, [s.derived?.ewocs.full ?? "", distLine(s.distKm, host.name), s.derived?.periodDays ? `period ${s.derived.periodDays.toFixed(2)} d` : "", modeLine(s.id)])} onPointerLeave={hoverOff} style={{ cursor: "grab" }}>
              {selected && <SelectMark h={s.r ?? m / 3} m={m} frame="circle" name={s.name} sub={s.sublabel} />}
              {hovered && !selected && hoverRing((s.r ?? m / 3) + m * 0.33)}
              {renderHalo(s.id, s.r ?? m / 3)}
              <g dangerouslySetInnerHTML={{ __html: glyphMarkup(s.glyph!, s.r ?? m / 3, palette) }} />
              {zoom >= Z.moonLabels && renderLabel(s.id)}
            </g>
            {/* the moon's own neighbourhood (its L-points etc.) is flattened into the host's list */}
          </g>
        );
      case "station":
        return (
          <g key={s.id}>
            {(hovered || selected) && s.orbitR && <circle r={s.orbitR} fill="none" stroke={C.orbitLoc} strokeWidth="var(--border-1)" strokeDasharray={`${m * 0.22} ${m * 0.33}`} />}
            <g data-el={s.id} transform={`translate(${p.x} ${p.y})`} onPointerDown={(e) => startDrag(e, { id: s.id, type: "location", hostMap: host.pos, shape: s.orbitR ? orbitCircle(s.orbitR) : undefined, pos: { x: host.pos.x + o.x * inv, y: host.pos.y + o.y * inv } })} onPointerEnter={hoverOn(s.id, s.name, [String(s.record?.fields.kind ?? ""), distLine(s.distKm, host.name), ownerLine(s.record)])} onPointerLeave={hoverOff} style={{ cursor: "grab" }}>
              {selected && <SelectMark h={m / 2} m={m} frame="square" name={s.name} sub={distLine(s.distKm, host.name)} />}
              {station(s.symbol ?? "station", locColor(s.record))}
              {renderLabel(s.id)}
            </g>
          </g>
        );
      case "lobject":
        return (
          <g key={s.id} data-el={s.id} transform={`translate(${p.x} ${p.y})`} onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: s.record?.type === "body" ? "body" : "location", id: s.id }); }} onPointerEnter={hoverOn(s.id, s.name, [s.derived?.ewocs.full ?? String(s.record?.fields.kind ?? ""), ...lobjectLines(s.secondaryId, s.lpoint, s.distKm, host.name, host.distKm), ownerLine(s.record), modeLine(s.id)])} onPointerLeave={hoverOff} style={{ cursor: "pointer" }}>
            {selected && <SelectMark h={s.glyph ? (s.r ?? m / 3) : m / 2} m={m} frame={s.glyph ? "circle" : "square"} name={s.name} sub={s.secondaryId && s.lpoint ? lpointSub({ secondaryId: s.secondaryId, point: s.lpoint }) : undefined} />}
            {s.glyph ? renderHalo(s.id, s.r ?? m / 3) : null}
            {s.glyph ? <g dangerouslySetInnerHTML={{ __html: glyphMarkup(s.glyph, s.r ?? m / 3, palette) }} /> : station(s.symbol ?? "base", locColor(s.record))}
            {renderLabel(s.id)}
          </g>
        );
    }
  };

  // ---- the canvas at working zoom -------------------------------------------------------
  const rendered = (
    <>
      {layout.zones.map((z) =>
        z.kind === "frost" ? (
          <circle key="frost" pointerEvents="none" r={z.rInner} fill="none" stroke={C.frost} strokeDasharray={`${m * 0.67 * inv} ${m * 0.9 * inv}`} strokeWidth={sizes.b1 * inv} />
        ) : (
          <circle key="hz" pointerEvents="none" r={(z.rInner + z.rOuter) / 2} fill="none" stroke={C.hz} strokeWidth={Math.max(sizes.b2 * inv, z.rOuter - z.rInner)} />
        ),
      )}
      {layout.zones.map((z) => {
        const lid = `zone:${z.kind}`;
        const r = z.kind === "hz" ? z.rOuter : z.rInner;
        const at = z.kind === "hz" ? { x: 0, y: -r } : { x: r * 0.643, y: -r * 0.766 };
        const lp = placed.get(lid);
        if (!lp || lp.hidden) return null;
        return (
          <g key={lid} data-ui="label" pointerEvents="none" transform={`translate(${at.x} ${at.y}) scale(${inv})`}>
            <text x={lp.dx} y={lp.dy} style={T.xs} fill={C.sublabel} textAnchor={lp.anchor}>
              {reqOf.get(lid)?.text}
            </text>
          </g>
        );
      })}

      {layout.belts.map((belt) => {
        const rr = (belt.rInner + belt.rOuter) / 2;
        const w = Math.max(m * 0.67 * inv, belt.rOuter - belt.rInner);
        const selected = selId === belt.id;
        const lp = placed.get(belt.id);
        const sp = { x: rr * 0.7071, y: -rr * 0.7071 };
        const bi = belt.record.fields.belt_inner_au as number;
        const bo = belt.record.fields.belt_outer_au as number;
        return (
          <g key={belt.id} data-el={belt.id} onClick={(e) => { e.stopPropagation(); setSel({ kind: "body", id: belt.id }); }} onPointerEnter={hoverOn(belt.id, belt.name, [`${formatKm(bi * AU_KM, unit)} – ${formatKm(bo * AU_KM, unit)} from ${primaryName}`])} onPointerLeave={hoverOff} style={{ cursor: "pointer" }}>
            <circle r={rr} fill="none" stroke={belt.color ?? C.belt} strokeWidth={w} opacity={selected ? 0.45 : 0.22} />
            <circle r={rr} fill="none" stroke={belt.color ?? C.belt} strokeWidth={w * 0.6} strokeDasharray={`${m * 0.22 * inv} ${m * 0.55 * inv}`} opacity={0.3} />
            {lp && !lp.hidden && (
              <g transform={`translate(${sp.x} ${sp.y}) scale(${inv})`}>
                <text x={lp.dx} y={lp.dy} style={T.xs} fill={selected ? C.selectLabel : C.sublabel} textAnchor={lp.anchor} data-ui="label">
                  {belt.name}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {layout.orbits.map((o) => {
        const hi = selId === o.id || hover === o.id;
        if (o.artificial && !hi) return null;
        const c = { x: o.shape.center.x, y: -o.shape.center.y };
        return <ellipse key={"o" + o.id} cx={c.x} cy={c.y} rx={o.shape.a} ry={o.shape.b} transform={`rotate(${-o.shape.rotationDeg} ${c.x} ${c.y})`} fill="none" stroke={hi ? C.select : o.owner === "location" ? C.orbitLoc : C.orbit} strokeWidth={(hi ? sizes.b2 : sizes.b1) * inv} strokeDasharray={o.dashed ? `${m * 0.33 * inv} ${m * 0.45 * inv}` : undefined} />;
      })}

      {layout.annotations.map((an) => {
        const col = an.color ?? C.ring;
        if (an.kind === "label")
          return (
            <g key={an.id} transform={`translate(0 ${-an.r}) scale(${inv})`}>
              <text style={T.xs} fill={col} textAnchor="middle">
                {an.label}
              </text>
            </g>
          );
        const s0 = an.startDeg ?? 0;
        const e0 = an.endDeg ?? (an.kind === "ring" ? 359.99 : 120);
        const mid = polar(0, 0, an.r + (an.width + m * 0.67) * inv, (s0 + e0) / 2);
        return (
          <g key={an.id} data-el={an.id} onClick={(ev) => { ev.stopPropagation(); setSel({ kind: "annotation", id: an.id }); }} onPointerEnter={hoverOn(an.id, an.label ?? "Annotation", [])} onPointerLeave={hoverOff} style={{ cursor: "pointer" }}>
            <path d={arcPath(0, 0, an.r, s0, e0)} fill="none" stroke={col} strokeWidth={an.width * inv} opacity={selId === an.id ? 1 : 0.8} />
            {showLabels && an.label && (
              <g transform={`translate(${mid.x} ${mid.y}) scale(${inv})`}>
                <text style={T.xs} fill={C.sublabel} textAnchor="middle">
                  {an.label}
                </text>
              </g>
            )}
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
              <circle r={m * (hovered ? 0.38 : 0.22)} fill={lp.occupied ? C.lagrangeOn : C.lagrange} opacity={lp.occupied ? 0.95 : 0.65} />
              <circle r={m * 0.9} fill="transparent" />
              {hovered && <text x={m * 0.67} y={-m * 0.45} style={T.xs} fill={C.sublabel} data-ui="1">{lp.point}</text>}
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
            {selected && <SelectMark h={m / 2} m={m} frame="square" name={l.name} sub={l.lpoint ? lpointSub(l.lpoint) : distLine(l.distKm, primaryName)} />}
            {hovered && !selected && hoverRing(m * 0.9)}
            {station(l.symbol, locColor(l.record))}
            {renderLabel(l.id)}
          </g>
        );
      })}

      {layout.lbodies.map((b) => {
        const p = S(b.pos);
        const selected = selId === b.id;
        return (
          <g key={b.id} data-el={b.id} transform={`translate(${p.x} ${p.y}) scale(${inv})`} onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: "body", id: b.id }); }} onPointerEnter={hoverOn(b.id, b.name, [b.detail, ...lobjectLines(b.lpoint.secondaryId, b.lpoint.point, undefined, primaryName, b.derived.heliocentricAU ? b.derived.heliocentricAU * AU_KM : undefined), modeLine(b.id)])} onPointerLeave={hoverOff} style={{ cursor: "pointer" }}>
            {selected && <SelectMark h={b.r} m={m} frame="circle" name={b.name} sub={lpointSub(b.lpoint)} />}
            {renderHalo(b.id, b.r)}
            <g dangerouslySetInnerHTML={{ __html: glyphMarkup(b.glyph, b.r, palette) }} />
            {renderLabel(b.id)}
          </g>
        );
      })}

      {layout.bodies.map((b) => {
        if (b.minor && !showMinor) return null;
        const pos = posOfBody(b);
        const p = S(pos);
        const selected = selId === b.id;
        const hovered = hover === b.id;
        const isStar = isStarKind(b.kind);
        const hostScreen = toScreen(pos);
        const nb = showNb(b) ? b.neighbourhood : clustered(b.orbit) ? [] : b.neighbourhood.filter((s) => s.kind === "lobject");
        const order: Satellite["kind"][] = ["annotation", "lpoint", "moon", "station", "lobject"];
        const r = bodyR(b);
        return (
          <g key={b.id} transform={`translate(${p.x} ${p.y}) scale(${inv})`}>
            {order.map((k) => nb.filter((s) => s.kind === k).map((s) => renderSatellite(b, s, hostScreen)))}
            <g data-el={b.id} onPointerDown={(e) => startDrag(e, { id: b.id, type: "body", hostMap: { x: 0, y: 0 }, shape: b.orbit, pos })} onPointerEnter={hoverOn(b.id, b.name, [b.detail, isStar ? "" : distLine(b.distKm, primaryName), b.derived.periodYears ? `period ${b.derived.periodYears.toFixed(2)} yr` : "", modeLine(b.id)])} onPointerLeave={hoverOff} style={{ cursor: b.orbit ? "grab" : "pointer" }}>
              {selected && <SelectMark h={r} m={m} frame="circle" name={b.name} sub={b.sublabel} />}
              {hovered && !selected && hoverRing(r + m * 0.45)}
              {renderHalo(b.id, r)}
              <g dangerouslySetInnerHTML={{ __html: glyphMarkup(b.glyph, r, palette) }} />
              {renderLabel(b.id, { sub: b.sublabel })}
            </g>
          </g>
        );
      })}
    </>
  );

  // ---- the canvas past the far-zoom threshold ---------------------------------------------
  const tactical = (
    <>
      {layout.orbits.map((o) => {
        if (o.owner !== "body" || o.artificial || !majorIds.has(o.id)) return null;
        const c = { x: o.shape.center.x, y: -o.shape.center.y };
        return <ellipse key={"o" + o.id} cx={c.x} cy={c.y} rx={o.shape.a} ry={o.shape.b} transform={`rotate(${-o.shape.rotationDeg} ${c.x} ${c.y})`} fill="none" stroke={C.orbit} strokeWidth={sizes.b1 * inv} />;
      })}
      {farItems.map((it) => {
        const p = S(it.pos);
        const selected = selId === it.id;
        const hovered = hover === it.id;
        const hw = (it.aff === "friend" ? sizes.frameW : sizes.frameH) / 2;
        const hh = sizes.frameH / 2;
        const lp = placed.get(it.id);
        const showLbl = !selected && ((lp && !lp.hidden) || hovered);
        const at = lp && !lp.hidden ? lp : { dx: sizes.frameH, dy: sizes.dataXs * 0.36, anchor: "start" as const };
        return (
          <g key={it.id} data-el={it.id} data-tactical={it.aff ?? "none"} transform={`translate(${p.x} ${p.y}) scale(${inv})`} onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: it.record.type === "location" ? "location" : "body", id: it.id }); }} onPointerEnter={hoverOn(it.id, it.name, [it.aff ? `${it.aff}` : "unowned", ownerLine(it.record)])} onPointerLeave={hoverOff} style={{ cursor: "pointer" }}>
            {selected && <SelectMark h={Math.max(hw, hh)} m={m} frame="none" name={it.name} sub={it.sub} />}
            <rect x={-hw} y={-hh} width={hw * 2} height={hh * 2} fill="transparent" />
            <g dangerouslySetInnerHTML={{ __html: tacticalMarkup(it.obj, it.aff, sizes.frameW, sizes.frameH) }} />
            {showLbl && (
              <text x={at.dx} y={at.dy} style={T.xs} fill={hovered ? C.label : it.aff ? AFF_LABEL[it.aff] : C.minorLabel} textAnchor={at.anchor} data-ui="label" pointerEvents="none">
                {caps(it.name)}
              </text>
            )}
          </g>
        );
      })}
    </>
  );

  // ---- scale bar (true scale only: a schematic's spacing is not a distance) ------------
  const pxPerAU = (layout.mapAU(2) - layout.mapAU(1)) * zoom;
  const scaleBar = trueScale && pxPerAU > 0 ? niceScale(sizes.scaleBar / pxPerAU) : undefined;

  return (
    <div className="mapview">
      <div className="toolbar">
        <Button size="sm" onClick={() => actions.back()} title="Back (Alt+←)">
          Back
        </Button>
        <span className="name">{caps(system.name)}</span>
        <span className="meta">{far ? "far zoom · symbols only" : `${Math.max(0, layout.bodies.length - 1)} bodies · ${formatKm(layout.aMin * AU_KM, unit, 2)} – ${formatKm(layout.aMax * AU_KM, unit, 3)}`}</span>
        <Segmented label="Distance units" value={unit} onChange={(u) => repo.saveConfig({ distanceUnit: u })} options={UNIT_OPTIONS} />
        <Segmented
          label="Orbit spacing"
          value={scaleValue as "schematic" | "true"}
          onChange={(v) => setScaleMode(v)}
          options={[
            { value: "schematic", label: "SCHEMATIC", title: "Radius mapped logarithmically; bodies hold their size" },
            { value: "true", label: "TRUE SCALE", title: "Orbits at true relative distance" },
          ]}
        />
        <Select className="auto" value={mode} onChange={(e) => setMode(e.target.value as MapMode)} title="Display mode" aria-label="Display mode">
          {MAP_MODES.map((md) => (
            <option key={md.id} value={md.id}>
              {md.label}
            </option>
          ))}
        </Select>
        <span className="grow" />
        <Button size="sm" onClick={() => setAdding(adding === "body" ? null : "body")}>
          + BODY
        </Button>
        <Button size="sm" onClick={() => setAdding(adding === "location" ? null : "location")}>
          + LOCATION
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setBuilder((b) => !b);
            setSel(null);
          }}
        >
          Skeleton…
        </Button>
        <Button
          size="sm"
          onClick={() => {
            userMoved.current = false;
            fit(layout.extent + 60);
          }}
          title="Fit the whole system"
        >
          Fit
        </Button>
        <Button size="sm" onClick={exportSvg} title="Save an SVG of this view into assets/">
          EXPORT SVG
        </Button>
        <Button size="sm" onClick={() => actions.navigate({ kind: "record", id: system.id })}>
          Record
        </Button>
      </div>
      <div className="mapbody">
        <div className="mapwrap" ref={wrapRef}>
          <svg ref={svgRef} className="mapsvg" data-lod={far ? "far" : "near"} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} style={{ cursor: pan || drag ? "grabbing" : "default" }}>
            <rect data-ui="bg" x={view.x} y={view.y} width={view.w} height={view.h} fill={C.bg} onClick={() => { if (dragged.current) { dragged.current = false; return; } setSel(null); }} />
            {far ? tactical : rendered}
          </svg>
          {tip && (
            <div className="maptip" style={{ left: tip.x, top: tip.y }}>
              <div className="t">{tip.title}</div>
              {tip.lines.filter(Boolean).map((l, i) => (
                <div key={i} className="l">{l}</div>
              ))}
            </div>
          )}
          <div className="mapzoom">
            zoom {zoom.toFixed(2)}× · {far ? "far zoom · symbols only · zoom in for rendered bodies" : `scroll to zoom, drag to pan · ${showNeighbourhood ? "moons & stations shown" : "zoom in for moons & stations"}`}
          </div>
          <div className="mapfoot">
            {far && (
              <div className="mapkey" aria-label="Affiliation key">
                {AFFILIATIONS.map((a) => {
                  const w = sizes.frameW * 0.7 + sizes.b2 * 2;
                  const h = sizes.frameH * 0.7 + sizes.b2 * 2;
                  return (
                    <span key={a} className="mapkey-item">
                      <svg width={w} height={h} viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} aria-hidden>
                        <g dangerouslySetInnerHTML={{ __html: frameMarkup(a, sizes.frameW * 0.7, sizes.frameH * 0.7) }} />
                      </svg>
                      {caps(a)}
                    </span>
                  );
                })}
              </div>
            )}
            {scaleBar && (
              <div className="mapscale">
                <span className="b" style={{ width: scaleBar * pxPerAU }} />
                <span>
                  {formatAU(scaleBar)} AU{unit === "au" ? "" : ` · ${formatKm(scaleBar * AU_KM, unit)}`}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="mapside">
          {builder ? (
            <SystemBuilder system={system} onDone={() => setBuilder(false)} />
          ) : adding ? (
            <AddOnMap kind={adding} system={system} layout={layout} onDone={(rid) => { setAdding(null); if (rid) setSel({ kind: adding, id: rid }); }} />
          ) : sel?.kind === "annotation" ? (
            <Panel title="ANNOTATION">
              <p className="prose">Annotations are edited in the system record, in its Annotations table.</p>
              <div className="row">
                <Button onClick={() => actions.navigate({ kind: "record", id: system.id })}>Open system record</Button>
              </div>
            </Panel>
          ) : selRecord ? (
            <div className="mapinspector">
              <div className="sel-head">
                <div className="t">{selRecord.name}</div>
                <div className="s">SELECTED · {recordCode(selRecord, repo.registry.get(selRecord.type))}</div>
              </div>
              <RecordEditor key={selRecord.id} id={selRecord.id} compact />
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

/**
 * The selection (SystemMap README): a halo of accent-500 at opacity-halo, a border-2
 * accent-500 frame, a dashed accent-500 bracket, and an accent-600 leader to the name in
 * accent-300. Sized from the object's half-size `h` and the station mark `m`, in screen px.
 * At far zoom the tactical frame is the object's own, so `frame` is "none".
 */
function SelectMark({ h, m, frame, name, sub }: { h: number; m: number; frame: "circle" | "square" | "none"; name: string; sub?: string }) {
  const f = h + m * 0.2;
  const b = h + m * 1.05;
  const lx = b + m * 6;
  const ly = -b - m * 4.4;
  return (
    <g data-ui="selection" pointerEvents="none">
      <circle r={h + m * 2.4} fill={C.select} style={{ fillOpacity: "var(--opacity-halo)" }} />
      {frame === "circle" && <circle r={f} fill="none" stroke={C.select} strokeWidth="var(--border-2)" />}
      {frame === "square" && <rect x={-f} y={-f} width={f * 2} height={f * 2} fill="none" stroke={C.select} strokeWidth="var(--border-2)" />}
      <rect x={-b} y={-b} width={b * 2} height={b * 2} fill="none" stroke={C.select} strokeWidth="var(--border-2)" strokeDasharray={`${m * 0.78} ${m * 0.55}`} />
      <line x1={b} y1={-b} x2={lx} y2={ly} stroke={C.leader} strokeWidth="var(--border-1)" />
      <text className="map-sel-label" x={lx + m * 0.45} y={ly - m * 0.2} style={T.sm} fill={C.selectLabel}>
        {caps(name)}
      </text>
      {sub && (
        <text x={lx + m * 0.45} y={ly - m * 0.2 + m * 1.55} style={T.xs} fill={C.sublabel}>
          {sub}
        </text>
      )}
    </g>
  );
}

/** A 1-2-5 step at or below `au`. */
function niceScale(au: number): number {
  const p = 10 ** Math.floor(Math.log10(au));
  const n = au / p;
  return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * p;
}
function formatAU(au: number): string {
  return au >= 1 ? au.toFixed(2) : au.toPrecision(2);
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

/** Per-kind station motifs (kept, docs/STYLE.md §7.1), drawn on a 9-unit square and scaled to `--station-mark`. */
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
      return `<rect x="-4.5" y="-4.5" width="9" height="9" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M-4.5 0H4.5M0 -4.5V4.5" stroke="${c}" stroke-width="1"/>`;
  }
}

function MapLegend({ mode, polities, colorOfPolity }: { mode: MapMode; polities: TypedRecord[]; colorOfPolity: (id: string | undefined) => string }) {
  if (mode === "plain") return null;
  const m = MAP_MODES.find((x) => x.id === mode)!;
  return (
    <Panel title={`${caps(m.label)} MODE`}>
      <div className="help">{m.description}</div>
      {mode === "political" ? (
        <Group title="POLITIES" meta={String(polities.length)}>
          {polities.map((p) => (
            <Row key={p.id} label={<span className="row tight"><span className="legend-swatch" style={{ background: colorOfPolity(p.id) }} />{caps(p.name)}</span>} />
          ))}
          <Row label={<span className="row tight"><span className="legend-swatch" style={{ background: UNCLAIMED_COLOR }} />UNCLAIMED</span>}>
            <span className="help">split ring = contested</span>
          </Row>
        </Group>
      ) : (
        <Group title="SCALE">
          {/* Discrete steps, not a gradient (docs/STYLE.md §1). */}
          <div className="legend-ramp">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <span key={t} style={{ background: mode === "habitability" ? greenRamp(t) : rampColor(t) }} />
            ))}
          </div>
          <div className="row t-data-sm ink-300">
            <span className="grow">{mode === "habitability" ? "0" : "none"}</span>
            <span>{mode === "habitability" ? "1" : mode === "economic" ? "10 + population" : "strong"}</span>
          </div>
        </Group>
      )}
    </Panel>
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
    <>
      <Panel title="MAP SETTINGS">
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
      </Panel>
      <Panel title="HOW TO USE">
        <div className="prose">
          Scroll to zoom, drag the background to pan. Zoom in to reveal moons, orbital stations and minor bodies; planets keep their size while orbits scale. Hover anything for its full classification and distance; click to edit it here; drag a body or
          station along its orbit, or drop a station on a Lagrange dot to park it there. “Lagrange point of” names the smaller body of the pair (Luna for Earth–Moon points, Earth for Earth–star points).
        </div>
      </Panel>
      {layout.warnings.length > 0 && (
        <Panel title="MAP WARNINGS" meta={String(layout.warnings.length)} bodyClassName="flush">
          {layout.warnings.map((w, i) => (
            <StatusRow key={i} severity="caution" id="LAYOUT" message={w} word={false} />
          ))}
        </Panel>
      )}
    </>
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
    <Panel title={`ADD ${caps(kind)}`}>
      <Group>
        <Row label="PRESET">
          <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="">— blank —</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="NAME">
          <TextField placeholder="Name" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        </Row>
        <Row label="ORBITS">
          <Select value={parent} onChange={(e) => setParent(e.target.value)}>
            {layout.bodies.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.id === layout.primary?.id ? " (primary)" : ""}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="DISTANCE">
          <NumberField step="any" min={0} value={sma} onValue={(v) => setSma(v ?? 0)} unit={parentIsStar ? "AU" : "km"} />
        </Row>
      </Group>
      <div className="btn-group">
        <Button variant="primary" onClick={create}>
          CREATE
        </Button>
        <Button onClick={() => onDone()}>Cancel</Button>
      </div>
    </Panel>
  );
}
