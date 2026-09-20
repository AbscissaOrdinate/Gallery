/**
 * Editor 1 — the hull editor.
 *
 * Three panes, after `docs/refs/NFC-Ship_Editor2 .png`: an outliner of what the
 * hull is made of, the canvas, and an inspector with the advisory list under
 * it. A budget rail runs along the bottom and a fleet strip under that, so a
 * hull is always seen next to its siblings at a common scale — which is the
 * whole point of the fleet plates in
 * `docs/refs/SolarSystem_Fleet_Deployment+Ship_Vector_Images.png`.
 *
 * This file is React and glue only. Every number comes from `core/designer/`,
 * every advisory from `hullAdvisories`, every shape from `renderHull`. Nothing
 * here computes geometry, and nothing here can refuse a save.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { actions, useApp } from "../state";
import type { TypedRecord } from "../../core/types";
import { HullCanvas, type CanvasEdit, type Selection } from "./HullCanvas";
import { readHull, stationPitch, writeHull } from "../../core/designer/hull/record";
import { hullAdvisories, type AdvisoryContext, type BusStandard, type StyleKit } from "../../core/designer/hull/advisories";
import { hullMetrics } from "../../core/designer/hull/geometry";
import { renderHull, toSvg } from "../../core/designer/hull/render";
import { byDomain, sortViolations, type Violation } from "../../core/designer/violations";
import type { HullGeometry, ShadowCone } from "../../core/designer/hull/types";
import type { RenderMode } from "../../core/designer/hull/render";

const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "—");

const SEVERITY_MARK: Record<Violation["severity"], string> = { error: "●", warn: "▲", info: "·" };

export function HullEditor({ id }: { id: string }) {
  const { repo } = useApp();
  const loaded = repo?.get(id);
  const [draft, setDraft] = useState<TypedRecord | null>(() => (loaded && loaded.record.type !== "note" ? (structuredClone(loaded.record) as TypedRecord) : null));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [focus, setFocus] = useState<number | undefined>(undefined);
  const [mode, setMode] = useState<RenderMode>("schematic");
  const [overlays, setOverlays] = useState({ beam: true, slots: true, sections: true, figures: true, cone: false, ghost: true });
  const timer = useRef<number | null>(null);

  // Autosave, mirroring RecordEditor: 900 ms after the last edit, and on unmount.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const flush = async () => {
    if (!repo || !draftRef.current || !dirtyRef.current) return;
    setSaving(true);
    try {
      await repo.save(draftRef.current);
      setDirty(false);
      dirtyRef.current = false;
    } catch (err) {
      actions.error(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    if (!dirty) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 900);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [draft, dirty]);
  useEffect(() => () => void flush(), []);

  const hull: HullGeometry = useMemo(() => readHull(draft?.fields ?? {}), [draft?.fields]);

  const ctx: AdvisoryContext = useMemo(() => {
    const style = refRecord(repo, draft, "style");
    const bus = refRecord(repo, draft, "bus");
    const cone = readCone(draft?.fields);
    return {
      style: style ? ({ id: style.name, ...style.fields } as StyleKit) : undefined,
      bus: bus ? ({ id: bus.name, ...bus.fields } as BusStandard) : undefined,
      shadowCone: cone,
      stationPitch_m: stationPitch(hull, typeof bus?.fields.station_pitch_m === "number" ? bus.fields.station_pitch_m : undefined),
    };
  }, [repo, draft?.fields, hull]);

  const advisories = useMemo(() => sortViolations(hullAdvisories(hull, ctx)), [hull, ctx]);
  const metrics = useMemo(() => hullMetrics(hull), [hull]);
  const pitch = ctx.stationPitch_m ?? 3;

  const parent = refRecord(repo, draft, "parent");
  const ghost = overlays.ghost && parent ? readHull(parent.fields) : undefined;

  if (!repo || !draft || !loaded) return <div className="muted">Hull not found.</div>;

  /** Write geometry back through the adapter so unrelated fields survive. */
  const commit = (next: HullGeometry) => {
    setDraft({ ...draft, fields: writeHull(draft.fields, next) });
    setDirty(true);
  };

  const onEdit = (edit: CanvasEdit) => {
    if (edit.kind === "station") {
      const stations = hull.spine.stations.map((s, i) => (i === edit.index ? { x: edit.x, half_height_m: edit.half_height_m } : s));
      commit({ ...hull, spine: { ...hull.spine, stations } });
    } else if (edit.kind === "slot") {
      commit({ ...hull, external_slots: (hull.external_slots ?? []).map((s) => (s.id === edit.id ? { ...s, x: edit.x } : s)) });
    } else if (edit.kind === "appendage") {
      commit({ ...hull, appendages: (hull.appendages ?? []).map((a) => (a.id === edit.id ? { ...a, station: edit.station } : a)) });
    }
  };

  const exportSvg = async () => {
    const svg = toSvg(renderHull(hull, { mode: "silhouette", showBeam: false }), { title: draft.name, pxPerMetre: 6 });
    try {
      const path = await repo.putTextAsset(`${draft.slug}-silhouette.svg`, svg);
      actions.toast(`Wrote ${path}`);
    } catch (err) {
      actions.error(`Export failed: ${(err as Error).message}`);
    }
  };

  const siblings = repo
    .ofType("hull")
    .filter((r) => r.record.id !== draft.id)
    .slice(0, 8);

  return (
    <div className="hullview">
      <div className="hulltools row">
        <button className="ghost" onClick={() => actions.back()} title="Back (Alt+←)">
          ←
        </button>
        <strong>{draft.name}</strong>
        <span className="tag">{String(draft.fields.hull_class ?? "—")}</span>
        <span className="grow" />
        <Toggle on={mode === "schematic"} onClick={() => setMode((m) => (m === "schematic" ? "silhouette" : "schematic"))} label="Schematic" />
        {(["beam", "slots", "sections", "figures", "cone", "ghost"] as const).map((k) => (
          <Toggle
            key={k}
            on={overlays[k]}
            onClick={() => setOverlays((o) => ({ ...o, [k]: !o[k] }))}
            label={k === "figures" ? "Scale" : k[0]!.toUpperCase() + k.slice(1)}
            disabled={k === "ghost" && !parent}
          />
        ))}
        <span className="muted" style={{ fontSize: 11 }}>
          {saving ? "saving…" : dirty ? "unsaved" : "saved"}
        </span>
        <button className="ghost" onClick={exportSvg} title="Write the silhouette to the vault's assets folder">
          Export SVG
        </button>
        <button className="ghost" onClick={() => actions.navigate({ kind: "record", id })}>
          Fields…
        </button>
      </div>

      <div className="hullbody">
        <div className="hullpane">
          <Outline hull={hull} selection={selection} onSelect={setSelection} advisories={advisories} />
        </div>

        <HullCanvas
          hull={hull}
          options={{
            mode,
            showBeam: overlays.beam,
            slots: overlays.slots,
            sections: overlays.sections,
            stations: mode === "schematic",
            scaleFigures: overlays.figures,
            shadowCone: overlays.cone ? ctx.shadowCone : undefined,
            ghost,
          }}
          selection={selection}
          onSelect={(s) => {
            setSelection(s);
            setFocus(undefined);
          }}
          onEdit={onEdit}
          focus={focus}
          pitch={pitch}
        />

        <div className="hullside">
          <Inspector hull={hull} selection={selection} commit={commit} pitch={pitch} />
          <Advisories
            advisories={advisories}
            onGo={(v) => {
              setFocus(v.anchor?.station);
              if (v.anchor?.componentId) {
                const kind = v.field === "sections" ? "section" : v.field === "external_slots" ? "slot" : v.field === "appendages" ? "appendage" : undefined;
                if (kind) setSelection({ kind, id: v.anchor.componentId });
              }
            }}
          />
        </div>
      </div>

      <div className="hullrail">
        <Rail k="Length" v={fmt(metrics.length_m, 1)} unit="m" />
        <Rail k="Beam" v={fmt(metrics.max_beam_m, 1)} unit="m" />
        <Rail k="Height" v={fmt(metrics.max_half_height_m * 2, 1)} unit="m" />
        <Rail k="L/D" v={fmt(metrics.length_over_diameter, 2)} />
        <Rail k="Gross vol" v={fmt(metrics.gross_volume_m3)} unit="m³" />
        <Rail k="Usable vol" v={fmt(metrics.usable_volume_m3)} unit="m³" />
        <Rail k="Wetted area" v={fmt(metrics.wetted_area_m2)} unit="m²" />
        <Rail k="Bow-on" v={fmt(metrics.presented_bow_m2)} unit="m²" />
        <Rail k="Beam-on" v={fmt(metrics.presented_beam_m2)} unit="m²" />
        <Rail k="Sections" v={String(metrics.sections.length)} />
        <Rail k="Slots" v={String((hull.external_slots ?? []).length)} />
        <Rail
          k="Advisories"
          v={advisories.length ? `${advisories.filter((a) => a.severity === "error").length}·${advisories.filter((a) => a.severity === "warn").length}` : "clear"}
          warn={advisories.some((a) => a.severity === "error")}
        />
      </div>

      {siblings.length > 0 && (
        <div className="hullstrip">
          <span className="muted mono" style={{ fontSize: 11, alignSelf: "center", paddingRight: 8 }}>
            fleet
          </span>
          {siblings.map((s) => (
            <button key={s.record.id} className="hullplate" onClick={() => actions.navigate({ kind: "hull", id: s.record.id })} title={s.record.name}>
              <Plate hull={readHull((s.record as TypedRecord).fields)} />
              <span className="muted">{s.record.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Toggle({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button className={on && !disabled ? "" : "ghost"} disabled={disabled} onClick={onClick} style={{ height: 24, padding: "0 8px", fontSize: 11 }}>
      {label}
    </button>
  );
}

function Rail({ k, v, unit, warn }: { k: string; v: string; unit?: string; warn?: boolean }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={"v" + (warn ? " warn" : "")}>
        {v}
        {unit && <small>{unit}</small>}
      </div>
    </div>
  );
}

/** Left pane: what the hull is made of, with the worst advisory on each row. */
function Outline({ hull, selection, onSelect, advisories }: { hull: HullGeometry; selection: Selection; onSelect: (s: Selection) => void; advisories: Violation[] }) {
  const worst = (id: string) => advisories.find((a) => a.anchor?.componentId === id);
  const Row = ({ kind, id, label, note }: { kind: NonNullable<Selection>["kind"]; id: string; label: string; note?: string }) => {
    const v = worst(id);
    const on = selection?.kind === kind && selection.id === id;
    return (
      <div className={"hullrow" + (on ? " active" : "")} onClick={() => onSelect({ kind, id })}>
        <span className="grow">{label}</span>
        {note && <span className="muted mono">{note}</span>}
        {v && <span className={v.severity === "info" ? "muted" : "warn"}>{SEVERITY_MARK[v.severity]}</span>}
      </div>
    );
  };
  return (
    <>
      <h4>Sections</h4>
      {(hull.sections ?? []).map((s) => (
        <Row key={s.id} kind="section" id={s.id} label={s.id} note={`${fmt(s.x0, 1)}–${fmt(s.x1, 1)} m`} />
      ))}
      {!(hull.sections ?? []).length && <div className="muted">none</div>}

      <h4>External slots</h4>
      {(hull.external_slots ?? []).map((s) => (
        <Row key={s.id} kind="slot" id={s.id} label={`${s.id} · ${s.type}`} note={`${fmt(s.x, 1)} m / ${fmt(s.theta_deg)}°`} />
      ))}
      {!(hull.external_slots ?? []).length && <div className="muted">none</div>}

      <h4>Appendages</h4>
      {(hull.appendages ?? []).map((a) => (
        <Row key={a.id} kind="appendage" id={a.id} label={`${a.id} · ${a.kind}`} note={`${fmt(a.station, 1)} m`} />
      ))}
      {!(hull.appendages ?? []).length && <div className="muted">none</div>}

      <h4>Stations</h4>
      {hull.spine.stations.map((s, i) => (
        <Row key={i} kind="station" id={String(i)} label={`${fmt(s.x, 1)} m`} note={`½h ${fmt(s.half_height_m, 2)} m`} />
      ))}
    </>
  );
}

/** Right pane, top: the selected thing's numbers. */
function Inspector({ hull, selection, commit, pitch }: { hull: HullGeometry; selection: Selection; commit: (h: HullGeometry) => void; pitch: number }) {
  if (!selection) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Spine</h3>
        <Num label="Length" unit="m" value={hull.spine.length_m} onChange={(v) => commit({ ...hull, spine: { ...hull.spine, length_m: v } })} />
        <Num label="Beam" unit="m" value={hull.spine.beam_m} onChange={(v) => commit({ ...hull, spine: { ...hull.spine, beam_m: v } })} />
        <Num label="Station pitch" unit="m" value={pitch} onChange={(v) => commit({ ...hull, spine: { ...hull.spine, station_pitch_m: v } })} />
        <Num label="Packing" value={hull.packing_efficiency ?? 1} step={0.01} onChange={(v) => commit({ ...hull, packing_efficiency: v })} />
        <p className="muted" style={{ fontSize: 11, marginBottom: 0 }}>
          Drag a station handle to shape the profile. Hold Alt to ignore the {pitch} m grid.
        </p>
      </div>
    );
  }
  if (selection.kind === "station") {
    const i = Number(selection.id);
    const s = hull.spine.stations[i];
    if (!s) return null;
    const set = (patch: Partial<typeof s>) =>
      commit({ ...hull, spine: { ...hull.spine, stations: hull.spine.stations.map((t, j) => (j === i ? { ...t, ...patch } : t)) } });
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Station {i + 1}</h3>
        <Num label="Station" unit="m" value={s.x} onChange={(x) => set({ x })} />
        <Num label="Half-height" unit="m" value={s.half_height_m} onChange={(half_height_m) => set({ half_height_m })} />
        <button className="ghost danger" onClick={() => commit({ ...hull, spine: { ...hull.spine, stations: hull.spine.stations.filter((_, j) => j !== i) } })}>
          Remove station
        </button>
      </div>
    );
  }
  if (selection.kind === "slot") {
    const s = (hull.external_slots ?? []).find((s) => s.id === selection.id);
    if (!s) return null;
    const set = (patch: Partial<typeof s>) => commit({ ...hull, external_slots: (hull.external_slots ?? []).map((t) => (t.id === s.id ? { ...t, ...patch } : t)) });
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Slot {s.id}</h3>
        <Num label="Station" unit="m" value={s.x} onChange={(x) => set({ x })} />
        <Num label="Clock" unit="°" value={s.theta_deg} onChange={(theta_deg) => set({ theta_deg })} />
        <Text label="Type" value={s.type} onChange={(type) => set({ type })} />
        <Text label="Size" value={String(s.size)} onChange={(size) => set({ size })} />
      </div>
    );
  }
  if (selection.kind === "section") {
    const s = (hull.sections ?? []).find((s) => s.id === selection.id);
    if (!s) return null;
    const vol = hullMetrics(hull).sections.find((v) => v.id === s.id);
    const set = (patch: Partial<typeof s>) => commit({ ...hull, sections: (hull.sections ?? []).map((t) => (t.id === s.id ? { ...t, ...patch } : t)) });
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Section {s.id}</h3>
        <Num label="From" unit="m" value={s.x0} onChange={(x0) => set({ x0 })} />
        <Num label="To" unit="m" value={s.x1} onChange={(x1) => set({ x1 })} />
        <div className="field">
          <label>Pressurised</label>
          <input type="checkbox" checked={!!s.pressurised} onChange={(e) => set({ pressurised: e.target.checked || undefined })} style={{ width: 16, height: 16 }} />
        </div>
        <div className="field">
          <label>Usable</label>
          <span className="mono">{fmt(vol?.usable_m3 ?? 0)} m³</span>
        </div>
      </div>
    );
  }
  const a = (hull.appendages ?? []).find((a) => a.id === selection.id);
  if (!a) return null;
  const set = (patch: Partial<typeof a>) => commit({ ...hull, appendages: (hull.appendages ?? []).map((t) => (t.id === a.id ? { ...t, ...patch } : t)) });
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Appendage {a.id}</h3>
      <Num label="Station" unit="m" value={a.station} onChange={(station) => set({ station })} />
      <Num label="Attach height" unit="m" value={a.attach_r ?? 0} onChange={(attach_r) => set({ attach_r })} />
      <Text label="Kind" value={a.kind} onChange={(kind) => set({ kind })} />
      <div className="field">
        <label>Mirror</label>
        <select value={a.mirror ?? "vertical"} onChange={(e) => set({ mirror: e.target.value as "vertical" | "none" })}>
          <option value="vertical">vertical</option>
          <option value="none">none</option>
        </select>
      </div>
    </div>
  );
}

/** Right pane, bottom: advisories grouped by domain, each one a link into the canvas. */
function Advisories({ advisories, onGo }: { advisories: Violation[]; onGo: (v: Violation) => void }) {
  const groups = byDomain(advisories);
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>
        Advisories {advisories.length === 0 && <span className="ok">· clear</span>}
      </h3>
      {groups.map((g) => (
        <div key={String(g.domain)} style={{ marginBottom: 8 }}>
          <div className="muted mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>
            {g.domain}
          </div>
          {g.violations.map((v, i) => (
            <div key={i} className={"hulladv " + v.severity} onClick={() => onGo(v)} title={v.anchor?.station !== undefined ? `Show station ${v.anchor.station} m` : undefined}>
              <span className={v.severity === "info" ? "muted" : "warn"}>{SEVERITY_MARK[v.severity]}</span> {v.message}
            </div>
          ))}
        </div>
      ))}
      {advisories.length === 0 && <div className="muted">Nothing to report. Advisories never block a save.</div>}
    </div>
  );
}

/** A fleet-strip plate: silhouette only, no handles, no annotation. */
function Plate({ hull }: { hull: HullGeometry }) {
  const scene = renderHull(hull, { mode: "silhouette" });
  const w = Math.max(1, scene.bounds.x1 - scene.bounds.x0);
  const h = Math.max(1, scene.bounds.y1 - scene.bounds.y0);
  return (
    <svg viewBox={`${scene.bounds.x0} ${-scene.bounds.y1} ${w} ${h}`} width={Math.min(140, w * 0.7)} height={30} preserveAspectRatio="xMidYMid meet">
      <g transform="scale(1,-1)">
        {scene.elements
          .filter((e) => e.kind === "path" && e.id === "hull")
          .map((e) => (e.kind === "path" ? <path key={e.id} d={e.d} fill="var(--navy-300)" /> : null))}
      </g>
    </svg>
  );
}

function Num({ label, unit, value, step, onChange }: { label: string; unit?: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <span className="row">
        <input type="number" step={step ?? 0.1} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} style={{ maxWidth: 120 }} />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </div>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 160 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Follow a record reference held in a field, when it points at something that loaded. */
function refRecord(repo: ReturnType<typeof useApp>["repo"], draft: TypedRecord | null, field: string): TypedRecord | undefined {
  const ref = draft?.fields[field];
  return typeof ref === "string" && repo ? repo.typed(ref) : undefined;
}

/**
 * The shield cone, if the hull declares one. Editor 2 sets this from the
 * reactor's actual station; until then a hull may carry it directly so the
 * radiation advisory can be exercised.
 */
function readCone(fields: Record<string, unknown> | undefined): ShadowCone | undefined {
  const c = fields?.shadow_cone;
  if (!c || typeof c !== "object") return undefined;
  const o = c as Record<string, unknown>;
  const x = Number(o.x);
  const half = Number(o.half_angle_deg);
  if (!Number.isFinite(x) || !Number.isFinite(half)) return undefined;
  return { x, half_angle_deg: half, facing: o.facing === "aft" ? "aft" : "forward" };
}
