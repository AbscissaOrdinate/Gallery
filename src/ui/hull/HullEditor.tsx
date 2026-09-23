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
import { hullMetrics, wettedArea } from "../../core/designer/hull/geometry";
import { renderHull, toSvg } from "../../core/designer/hull/render";
import { familiesOf, partsForHull, radiatorRatio, slotIdOf, DEFAULT_RADIATOR_ASPECT, SLOT_TYPES, type View } from "../../core/designer/hull/parts";
import { slotOrientation, TILTABLE } from "../../core/designer/hull/orientation";
import { byDomain, sortViolations, type Violation } from "../../core/designer/violations";
import type { HullGeometry, ShadowCone } from "../../core/designer/hull/types";
import type { RenderMode } from "../../core/designer/hull/render";
import { CLASS_CODES } from "../../core/designer/hull/classes";
import { structureOf } from "../../core/designer/hull/structure";
import { provisionalParams } from "../../core/designer/constraints";
import type { Preset } from "../../core/types";

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
  const [view, setView] = useState<View>("profile");
  const [overlays, setOverlays] = useState({ beam: true, slots: true, sections: true, figures: true, cone: false, ghost: true, parts: true });
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
  // The structural-mass law (docs/UNITS.md §9), so a hull's mass and rating
  // are on screen while it is being shaped, not only once a ship is built.
  const law = useMemo(() => {
    if (!repo) return undefined;
    const eff = repo.effectiveConstraints();
    const estimate = structureOf(
      hull,
      { structure_density_kg_m3: eff.values.structure_density_kg_m3, design_density_t_m3: eff.values.design_density_t_m3, structure_cost_per_t: eff.values.structure_cost_per_t },
      (material) => {
        const found = repo.tables.lookup("armor", material, "density_kg_m3");
        return "error" in found || typeof found.lookup.value !== "number" ? undefined : { density_kg_m3: found.lookup.value, provisional: found.lookup.provisional };
      },
    );
    return { ...estimate, ratedProvisional: provisionalParams(eff).includes("design_density_t_m3") };
  }, [hull, repo]);
  const pitch = ctx.stationPitch_m ?? 3;

  const parent = refRecord(repo, draft, "parent");
  const ghost = overlays.ghost && parent ? readHull(parent.fields) : undefined;

  // The kit's fittings, generated from the record every render like everything
  // else. Editor 2 replaces `weapons` with what is actually loaded.
  const styleRecord = refRecord(repo, draft, "style");
  const families = useMemo(() => familiesOf(styleRecord?.fields), [styleRecord?.fields]);
  const fitted = useMemo(() => (overlays.parts ? partsForHull(hull, { families, view }) : undefined), [hull, families, overlays.parts, view]);

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
        <Toggle
          on={view === "plan"}
          onClick={() => setView((v) => (v === "plan" ? "profile" : "plan"))}
          label="Plan"
          title="From above: the beam outline, with beam mounts side-on and dorsal mounts seen from the top"
        />
        {(["parts", "beam", "slots", "sections", "figures", "cone", "ghost"] as const).map((k) => (
          <Toggle
            key={k}
            on={overlays[k]}
            onClick={() => setOverlays((o) => ({ ...o, [k]: !o[k] }))}
            label={k === "figures" ? "Scale" : k === "beam" && view === "plan" ? "Height" : k[0]!.toUpperCase() + k.slice(1)}
            disabled={k === "ghost" && !parent}
            title={k === "parts" ? (styleRecord ? `Fittings from ${styleRecord.name}` : "Fittings — no style kit linked, so defaults are used") : undefined}
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
            view,
            showBeam: overlays.beam,
            slots: overlays.slots,
            sections: overlays.sections,
            stations: mode === "schematic",
            scaleFigures: overlays.figures,
            shadowCone: overlays.cone ? ctx.shadowCone : undefined,
            ghost,
            fitted,
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
          {!(hull.spine.length_m && hull.spine.length_m > 0 && hull.spine.stations.length >= 2) && (
            <ClassPicker
              presets={repo.registry.presetsFor("hull")}
              onPick={(preset) => {
                setDraft({ ...draft, fields: fromClass(draft.fields, preset) });
                setDirty(true);
                setSelection(null);
              }}
            />
          )}
          <Inspector hull={hull} selection={selection} commit={commit} pitch={pitch} />
          <Conformance hull={hull} style={styleRecord} commit={commit} />
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
        {law?.internal_t !== undefined && <Rail k="Structure" v={fmt(law.internal_t)} unit="t" />}
        {law && law.armour_t > 0 && <Rail k="Armour" v={fmt(law.armour_t)} unit="t" mark={law.armourProvisional} />}
        {law?.rated_t !== undefined && (
          <Rail
            k="Rated load"
            v={fmt(law.rated_t)}
            unit={law.fraction !== undefined ? `t · ${fmt(law.fraction * 100)}% hull` : "t"}
            warn={(law.fraction ?? 0) >= 1}
            mark={law.ratedProvisional}
          />
        )}
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

function Toggle({ on, onClick, label, disabled, title }: { on: boolean; onClick: () => void; label: string; disabled?: boolean; title?: string }) {
  return (
    <button className={on && !disabled ? "" : "ghost"} disabled={disabled} title={title} onClick={onClick} style={{ height: 24, padding: "0 8px", fontSize: 11 }}>
      {label}
    </button>
  );
}

function Rail({ k, v, unit, warn, mark }: { k: string; v: string; unit?: string; warn?: boolean; mark?: boolean }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={"v" + (warn ? " warn" : "")}>
        {mark && <span className="provisional inline" title="Rests on a provisional figure" />}
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

      <h4>Armour zones</h4>
      {(hull.armor_zones ?? []).map((z) => (
        <Row key={z.id} kind="zone" id={z.id} label={`${z.id}${z.material ? ` · ${z.material}` : ""}`} note={`${fmt(z.x0, 1)}–${fmt(z.x1, 1)} m`} />
      ))}
      {!(hull.armor_zones ?? []).length && <div className="muted">none</div>}

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
    const orientation = slotOrientation(s);
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Slot {s.id}</h3>
        <Num label="Station" unit="m" value={s.x} onChange={(x) => set({ x })} />
        <Num label="Clock" unit="°" value={s.theta_deg} onChange={(theta_deg) => set({ theta_deg })} />
        <Choice label="Type" value={s.type} options={SLOT_TYPES} onChange={(type) => set({ type })} />
        <Choice label="Size" value={String(s.size)} options={["S", "M", "L", "XL"]} onChange={(size) => set({ size })} />
        {/* Which way the mount points (hull/orientation.ts). A gun that has to
            fire astern is flipped; a thruster is turned and tilted. */}
        <div className="field">
          <label>Facing</label>
          <span className="row">
            <input type="number" step={15} value={orientation.facing_deg} onChange={(e) => set({ facing_deg: Number(e.target.value) || undefined })} style={{ maxWidth: 80 }} />
            <span className="unit">°</span>
            <button className="ghost" style={{ height: 22, padding: "0 6px", fontSize: 11 }} title="Turn the mount to face the other way" onClick={() => set({ facing_deg: (orientation.facing_deg + 180) % 360 || undefined })}>
              Flip
            </button>
          </span>
        </div>
        {TILTABLE.has(s.type) && (
          <div className="field">
            <label>Tilt</label>
            <span className="row">
              <input type="number" min={0} max={90} step={15} value={orientation.tilt_deg} onChange={(e) => set({ tilt_deg: Number(e.target.value) })} style={{ maxWidth: 80 }} />
              <span className="unit">°</span>
              <button className="ghost" style={{ height: 22, padding: "0 6px", fontSize: 11 }} title="Fire along the hull" onClick={() => set({ tilt_deg: 0 })}>
                Along
              </button>
              <button className="ghost" style={{ height: 22, padding: "0 6px", fontSize: 11 }} title="Fire straight outward" onClick={() => set({ tilt_deg: 90 })}>
                Radial
              </button>
            </span>
          </div>
        )}
        <div className="field">
          <label>Ring</label>
          <select value={String(s.count ?? 1)} onChange={(e) => set({ count: Number(e.target.value) > 1 ? Number(e.target.value) : undefined })} style={{ maxWidth: 80 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "single" : `${n} round`}
              </option>
            ))}
          </select>
        </div>
        {(s.count ?? 1) > 1 && (
          <p className="muted" style={{ fontSize: 11, margin: "0 0 6px" }}>
            {s.count} copies every {Math.round(360 / (s.count ?? 1))}° from {s.theta_deg}° — one slot, balanced on the axis.
          </p>
        )}
        <Text label="Part override" value={s.part ?? ""} onChange={(part) => set({ part: part.trim() || undefined })} />
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
  if (selection.kind === "zone") return <ZoneInspector hull={hull} id={selection.id} commit={commit} />;
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

/** The hull-geometry fields a class supplies. Everything else on the record is the author's. */
const CLASS_GEOMETRY = ["spine", "sections", "armor_zones", "external_slots", "appendages", "packing_efficiency", "structure_mass_fraction"];

/**
 * A record's fields started from a class: the class's geometry, and its code
 * and notes where the record has none of its own. Links, style, bus, operator
 * — anything the author set — survive.
 */
function fromClass(fields: Record<string, unknown>, preset: Preset): Record<string, unknown> {
  const next: Record<string, unknown> = { ...fields };
  for (const k of CLASS_GEOMETRY) if (preset.fields[k] !== undefined) next[k] = structuredClone(preset.fields[k]);
  for (const k of ["hull_class", "design_notes", "environment"]) if (!next[k] && preset.fields[k] !== undefined) next[k] = preset.fields[k];
  return next;
}

/**
 * Shown while the spine is empty, so a new design never has to start from
 * nothing (`gallery/09` §2). A class is a starting point: every number in it
 * is editable afterwards, and choosing one only ever fills an empty hull.
 */
function ClassPicker({ presets, onPick }: { presets: Preset[]; onPick: (p: Preset) => void }) {
  const classes = presets
    .filter((p) => p.tags?.includes("class"))
    .sort((a, b) => CLASS_CODES.indexOf(String(a.fields.hull_class) as never) - CLASS_CODES.indexOf(String(b.fields.hull_class) as never));
  if (!classes.length) return null;
  const length = (p: Preset) => (p.fields.spine as { length_m?: number } | undefined)?.length_m;
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Start from a class</h3>
      <p className="muted" style={{ fontSize: 11, marginTop: 0 }}>
        This hull has no spine yet. A class fills in its profile, sections, slots and armour — all editable afterwards.
      </p>
      <div className="stack" style={{ gap: 4 }}>
        {classes.map((p) => (
          <button key={p.id} className="ghost classpick" title={p.description} onClick={() => onPick(p)}>
            <span className="tag">{String(p.fields.hull_class)}</span>
            <span className="grow">{p.title.replace(/^[A-Z]+ — /, "")}</span>
            <span className="muted mono">{length(p) ?? "—"} m</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Armour zones — the one thing `gallery/07` §3 lists as owned by editor 1 that
 * had no editor at all. Clicking a belt selected `kind: "zone"`, the inspector
 * had no branch for it, and the flow fell through to the appendage lookup and
 * returned null, blanking the card (`gallery/09` §3.2).
 *
 * The derived figures repeat `armorMass()` in `ship/budget.ts` rather than
 * calling it, because that function is private to the ship budget and takes a
 * whole `ShipContext`. Both read `density_kg_m3` from `_tables/armor.yaml` over
 * `wettedArea` of the zone's run, so the two agree by construction; if that
 * stops being true the shared formula belongs in the kernel, not here.
 */
function ZoneInspector({ hull, id, commit }: { hull: HullGeometry; id: string; commit: (h: HullGeometry) => void }) {
  const { repo } = useApp();
  const z = (hull.armor_zones ?? []).find((t) => t.id === id);
  if (!z) return null;
  const set = (patch: Partial<typeof z>) => commit({ ...hull, armor_zones: (hull.armor_zones ?? []).map((t) => (t.id === z.id ? { ...t, ...patch } : t)) });

  // Every armour row in the table, plus whatever this zone already names. A
  // hand-authored or captured material is never dropped from the list — it is
  // reported as unknown and still saves.
  const rows = repo?.tables.rows("armor") ?? [];
  const materials = rows.map((r) => r.id);
  const options = z.material && !materials.includes(z.material) ? [z.material, ...materials] : materials;

  const found = z.material && repo ? repo.tables.lookup("armor", z.material, "density_kg_m3") : undefined;
  const density = found && !("error" in found) && typeof found.lookup.value === "number" ? found.lookup.value : undefined;
  const provisional = found && !("error" in found) ? found.lookup.provisional : false;
  const lookupError = found && "error" in found ? found.error : undefined;

  const x0 = Math.min(z.x0, z.x1);
  const x1 = Math.max(z.x0, z.x1);
  const thickness_cm = z.thickness_cm ?? 0;
  const area_m2 = x1 > x0 ? wettedArea(hull.spine, x0, x1) : 0;
  const areal_kg_m2 = density !== undefined ? (thickness_cm / 100) * density : undefined;
  const mass_t = areal_kg_m2 !== undefined ? (area_m2 * areal_kg_m2) / 1000 : undefined;
  // `docs/UNITS.md` §5: a provisional figure carries its marker into anything
  // derived from it, not just onto the row it came from.
  const mark = provisional ? <span className="provisional inline" title="Rests on a provisional table row" /> : null;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Armour {z.id}</h3>
      <Num label="From" unit="m" value={z.x0} onChange={(x0) => set({ x0 })} />
      <Num label="To" unit="m" value={z.x1} onChange={(x1) => set({ x1 })} />
      <div className="field">
        <label>Material</label>
        <select value={z.material ?? ""} onChange={(e) => set({ material: e.target.value || undefined })} style={{ maxWidth: 160 }}>
          <option value="">—</option>
          {options.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <Num label="Thickness" unit="cm" value={thickness_cm} onChange={(thickness_cm) => set({ thickness_cm })} />

      <div className="field">
        <label>Areal density</label>
        <span className="mono">
          {mark}
          {areal_kg_m2 !== undefined ? `${fmt(areal_kg_m2, 1)} kg/m²` : "—"}
        </span>
      </div>
      <div className="field">
        <label>Belt area</label>
        <span className="mono">{fmt(area_m2)} m²</span>
      </div>
      <div className="field">
        <label>Zone mass</label>
        <span className="mono">
          {mark}
          {mass_t !== undefined ? `${fmt(mass_t, 1)} t` : "—"}
        </span>
      </div>

      {provisional && <div className="muted provisional">Armour mass rests on a provisional figure in `_tables/armor.yaml`.</div>}
      {lookupError && <div className="muted" style={{ fontSize: 11 }}>No density for this material — {lookupError}. It still saves; the budget contributes no armour mass for this zone.</div>}
      {!z.material && <div className="muted" style={{ fontSize: 11 }}>No material set, so this zone contributes no mass to the budget.</div>}

      <button className="ghost danger" onClick={() => commit({ ...hull, armor_zones: (hull.armor_zones ?? []).filter((t) => t.id !== z.id) })}>
        Remove zone
      </button>
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

/**
 * Style conformance. Every deviation is listed and every one can be conformed
 * in a click — but nothing here refuses a save, because a captured hull or an
 * export model is supposed to be able to break the house style.
 */
function Conformance({ hull, style, commit }: { hull: HullGeometry; style: TypedRecord | undefined; commit: (h: HullGeometry) => void }) {
  const off = (hull.external_slots ?? []).filter((s) => s.part);
  if (!style) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Style</h3>
        <div className="muted">No style kit linked. Fittings fall back to the default families.</div>
      </div>
    );
  }
  const families = familiesOf(style.fields);
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>
        Style · {style.name} {off.length === 0 && <span className="ok">· conforms</span>}
      </h3>
      <div className="chips" style={{ marginBottom: 8 }}>
        {Object.entries(families).map(([k, v]) => (
          <span key={k} className="chip">
            {k} <span className="muted">{String(v)}</span>
          </span>
        ))}
        {families.radiator_aspect === undefined && (
          <span className="chip" title="The kit sets no radiator_aspect, so the generator's default applies">
            radiator_aspect <span className="muted">{DEFAULT_RADIATOR_ASPECT} (default)</span>
          </span>
        )}
        <span className="chip" title="Height over length for this kit's radiator family at size M, after its own character is applied. Never below 1.">
          drawn <span className="muted">{radiatorRatio(families.radiator, families.radiator_aspect).toFixed(2)} : 1</span>
        </span>
        {Object.keys(families).length === 0 && <span className="muted">kit declares no part families</span>}
      </div>
      {off.length > 0 && (
        <>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
            {off.length} deviation{off.length === 1 ? "" : "s"} — allowed, and never blocked.
          </div>
          {off.map((s) => (
            <div key={s.id} className="row" style={{ justifyContent: "space-between", padding: "2px 0" }}>
              <span>
                {s.id} <span className="muted">{s.part}</span>
              </span>
              <button
                className="ghost"
                style={{ height: 20, padding: "0 6px", fontSize: 11 }}
                onClick={() => commit({ ...hull, external_slots: (hull.external_slots ?? []).map((t) => (t.id === s.id ? { ...t, part: undefined } : t)) })}
              >
                Conform
              </button>
            </div>
          ))}
          <button
            className="ghost"
            style={{ marginTop: 4 }}
            onClick={() => commit({ ...hull, external_slots: (hull.external_slots ?? []).map((t) => ({ ...t, part: undefined })) })}
          >
            Conform all
          </button>
        </>
      )}
    </div>
  );
}

/** A fleet-strip plate: silhouette only, no handles, no annotation. */
function Plate({ hull }: { hull: HullGeometry }) {
  const scene = renderHull(hull, { mode: "silhouette" });
  const { x0, x1, y0, y1 } = scene.bounds;
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  // Bow-right, like every other plate — see renderHull's BowSide.
  const flip = scene.bowSide !== "left";
  return (
    <svg viewBox={`${flip ? -x1 : x0} ${-y1} ${w} ${h}`} width={Math.min(140, w * 0.7)} height={30} preserveAspectRatio="xMidYMid meet">
      <g transform={flip ? "scale(-1,-1)" : "scale(1,-1)"}>
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

function Choice({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  // A value off the list is kept and shown, never silently replaced.
  const all = options.includes(value) ? options : [value, ...options];
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 160 }}>
        {all.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
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
