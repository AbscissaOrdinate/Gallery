/**
 * Editor 1 — the hull editor.
 *
 * Three panes and a budget bar, after the design book's HullEditor plate
 * (docs/design-book/components/HullEditor): an outline of what the hull is made
 * of, the canvas with its station ruler, and an inspector with the advisories
 * grouped by severity under it. The budget bar runs along the bottom and a
 * fleet strip under that, so a hull is always seen next to its siblings at a
 * common scale. The commit state is stated in words; nothing blocks a save
 * (docs/STYLE.md §2).
 *
 * This file is React and glue only. Every number comes from `core/designer/`,
 * every advisory from `hullAdvisories`, every shape from `renderHull`. Nothing
 * here computes geometry, and nothing here can refuse a save.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { actions, useApp } from "../state";
import type { TypedRecord } from "../../core/types";
import { HullCanvas, type CanvasEdit, type Selection } from "./HullCanvas";
import { readHull, stationPitch, writeHull } from "../../core/designer/hull/record";
import { hullAdvisories, type AdvisoryContext, type BusStandard, type StyleKit } from "../../core/designer/hull/advisories";
import { hullMetrics, wettedArea } from "../../core/designer/hull/geometry";
import { renderHull, toSvg } from "../../core/designer/hull/render";
import { familiesOf, partsForHull, radiatorRatio, slotIdOf, DEFAULT_RADIATOR_ASPECT, SLOT_SUBTYPES, SLOT_TYPES, type View } from "../../core/designer/hull/parts";
import { slotOrientation, TILTABLE } from "../../core/designer/hull/orientation";
import { sortViolations, type Violation } from "../../core/designer/violations";
import type { HullGeometry, ShadowCone } from "../../core/designer/hull/types";
import type { RenderMode } from "../../core/designer/hull/render";
import { CLASS_CODES } from "../../core/designer/hull/classes";
import { structureOf } from "../../core/designer/hull/structure";
import { provisionalParams } from "../../core/designer/constraints";
import type { Preset } from "../../core/types";
import { resolveThemeColors } from "../themeColors";
import {
  AdvisoryList,
  AsciiBar,
  Button,
  Checkbox,
  Group,
  NumberField,
  Panel,
  Row,
  Segmented,
  Select,
  TextField,
  Value,
  SEVERITY_WORD,
  caps,
  commitState,
  countBySeverity,
  cx,
  uiSeverity,
} from "../kit";

const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "—");

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

  if (!repo || !draft || !loaded) return <div className="help">Hull not found.</div>;

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
    // Resolve theme tokens so the file keeps its colours outside the app.
    const svg = resolveThemeColors(toSvg(renderHull(hull, { mode: "silhouette", showBeam: false }), { title: draft.name, pxPerMetre: 6 }));
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

  const counts = countBySeverity(advisories);
  const state = commitState({ saving, dirty }, advisories);
  const partsCount = (hull.sections ?? []).length + (hull.external_slots ?? []).length + (hull.armor_zones ?? []).length + (hull.appendages ?? []).length;
  const overlayLabel = (k: keyof typeof overlays) => (k === "figures" ? "Scale" : k === "beam" && view === "plan" ? "Height" : k[0]!.toUpperCase() + k.slice(1));

  return (
    <div className="hullview">
      <div className="toolbar">
        <Button size="sm" onClick={() => actions.back()} title="Back (Alt+←)">
          Back
        </Button>
        <span className="name">{view === "plan" ? "PLAN" : "PROFILE"}</span>
        <span className="meta">
          {String(draft.fields.hull_class ?? "—")} · {draft.name} · {fmt(metrics.length_m, 1)} m
        </span>
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "profile", label: "PROFILE" },
            { value: "plan", label: "PLAN", title: "From above: the beam outline, with beam mounts side-on and dorsal mounts seen from the top" },
          ]}
        />
        <Segmented
          label="Rendering"
          value={mode}
          onChange={setMode}
          options={[
            { value: "schematic", label: "SCHEMATIC" },
            { value: "silhouette", label: "SILHOUETTE" },
          ]}
        />
        <span className="grow" />
        {(["parts", "beam", "slots", "sections", "figures", "cone", "ghost"] as const).map((k) => (
          <Checkbox
            key={k}
            checked={overlays[k]}
            onChange={() => setOverlays((o) => ({ ...o, [k]: !o[k] }))}
            label={overlayLabel(k)}
            disabled={k === "ghost" && !parent}
            title={k === "parts" ? (styleRecord ? `Fittings from ${styleRecord.name}` : "Fittings — no style kit linked, so defaults are used") : undefined}
          />
        ))}
        <Button size="sm" onClick={exportSvg} title="Write the silhouette to the vault's assets folder">
          EXPORT SVG
        </Button>
        <Button size="sm" onClick={() => actions.navigate({ kind: "record", id })}>
          Fields
        </Button>
      </div>

      <div className="hullbody">
        <div className="hullpane">
          <header className="panel-head">
            <span className="panel-title">OUTLINE</span>
            <span className="panel-meta">{partsCount} parts</span>
          </header>
          <Outline hull={hull} selection={selection} onSelect={setSelection} advisories={advisories} />
        </div>

        <div className="hullcenter">
          <HullCanvas
            hull={hull}
            options={{
              mode,
              view,
              showBeam: overlays.beam,
              slots: overlays.slots,
              sections: overlays.sections,
              // The ruler is drawn under the canvas, not inside it (HullEditor plate).
              stations: false,
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
        </div>

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
          <Panel
            title="ADVISORIES"
            meta={
              <span className="row tight">
                <span className="stamp sev-text-violation">{counts.violation}</span>
                <span className="stamp sev-text-caution">{counts.caution}</span>
                <span className="stamp sev-text-info">{counts.info}</span>
              </span>
            }
          >
            <AdvisoryList
              advisories={advisories}
              detailOf={(v) => [v.anchor?.componentId, v.anchor?.station !== undefined ? `station ${fmt(v.anchor.station, 1)} m` : undefined].filter(Boolean).join(" · ") || undefined}
              onGo={(v) => {
                setFocus(v.anchor?.station);
                if (v.anchor?.componentId) {
                  const kind = v.field === "sections" ? "section" : v.field === "external_slots" ? "slot" : v.field === "appendages" ? "appendage" : undefined;
                  if (kind) setSelection({ kind, id: v.anchor.componentId });
                }
              }}
            />
          </Panel>
          <Conformance hull={hull} style={styleRecord} commit={commit} />
        </div>
      </div>

      {/* Budget bar: totals in data-xl / data-lg, ratios as ASCII bars, commit state pushed right. */}
      <div className="budgetbar">
        <BudgetCell k="LENGTH" v={fmt(metrics.length_m, 1)} unit="m" xl />
        <BudgetCell k="BEAM" v={fmt(metrics.max_beam_m, 1)} unit="m" />
        <BudgetCell k="HEIGHT" v={fmt(metrics.max_half_height_m * 2, 1)} unit="m" />
        <BudgetCell k="L/D" v={fmt(metrics.length_over_diameter, 2)} />
        <BudgetCell k="GROSS VOL" v={fmt(metrics.gross_volume_m3)} unit="m³" />
        <BudgetCell k="USABLE VOL" v={fmt(metrics.usable_volume_m3)} unit="m³" />
        {law?.internal_t !== undefined && <BudgetCell k="STRUCTURE" v={fmt(law.internal_t)} unit="t" />}
        {law && law.armour_t > 0 && <BudgetCell k="ARMOUR" v={fmt(law.armour_t)} unit="t" mark={law.armourProvisional} />}
        {law?.rated_t !== undefined &&
          (law.fraction !== undefined ? (
            <BudgetCell k={`RATED LOAD ${fmt(law.rated_t)} t`} mark={law.ratedProvisional}>
              <AsciiBar fraction={law.fraction} />
            </BudgetCell>
          ) : (
            <BudgetCell k="RATED LOAD" v={fmt(law.rated_t)} unit="t" mark={law.ratedProvisional} />
          ))}
        <BudgetCell k="WETTED AREA" v={fmt(metrics.wetted_area_m2)} unit="m²" />
        <BudgetCell k="BOW-ON" v={fmt(metrics.presented_bow_m2)} unit="m²" />
        <BudgetCell k="BEAM-ON" v={fmt(metrics.presented_beam_m2)} unit="m²" />
        <BudgetCell k="SECTIONS" v={String(metrics.sections.length)} />
        <BudgetCell k="SLOTS" v={String((hull.external_slots ?? []).length)} />
        <div className="bcell state">
          <span className="k">STATE</span>
          <span className={cx("stamp", `sev-text-${state.severity}`)}>{state.text}</span>
        </div>
      </div>

      {siblings.length > 0 && (
        <div className="hullstrip">
          <span className="t-label-xs ink-300">FLEET</span>
          {siblings.map((s) => (
            <button key={s.record.id} className="hullplate" onClick={() => actions.navigate({ kind: "hull", id: s.record.id })} title={s.record.name}>
              <Plate hull={readHull((s.record as TypedRecord).fields)} />
              <span>{s.record.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** One cell of the budget bar: a label-xs key over a data figure, or over an ASCII bar. */
function BudgetCell({ k, v, unit, xl, mark, children }: { k: string; v?: string; unit?: string; xl?: boolean; mark?: boolean; children?: ReactNode }) {
  return (
    <div className="bcell">
      <span className="k">{k}</span>
      <span className={cx("v", xl && "xl")}>
        {mark && <span className="provisional inline" title="Rests on a provisional figure" />}
        {children ?? (
          <>
            {v ?? "—"}
            {unit && <span className="unit">{unit}</span>}
          </>
        )}
      </span>
    </div>
  );
}

/**
 * Left pane: what the hull is made of, as catalog groups (HullEditor plate).
 * Each row carries a class-letter tile, its name and its footprint; a row
 * with an open violation or caution shows the word in place of the footprint
 * and stays in the list.
 */
function Outline({ hull, selection, onSelect, advisories }: { hull: HullGeometry; selection: Selection; onSelect: (s: Selection) => void; advisories: Violation[] }) {
  // Advisories arrive sorted most severe first, so the first match is the worst.
  const worst = (id: string) => advisories.find((a) => a.anchor?.componentId === id);
  const item = (kind: NonNullable<Selection>["kind"], id: string, tile: string, label: string, note?: string) => {
    const v = worst(id);
    const sev = v ? uiSeverity(v.severity) : undefined;
    const flagged = sev === "violation" || sev === "caution";
    const on = selection?.kind === kind && selection.id === id;
    return (
      <div key={kind + id} className={cx("crow", flagged && `sev-${sev}`, on && "is-selected")} onClick={() => onSelect({ kind, id })} title={v?.message}>
        <span className="tile">{tile}</span>
        <span className="nm">{label}</span>
        <span className="fp">{flagged ? SEVERITY_WORD[sev!] : note}</span>
      </div>
    );
  };
  const head = (t: string, n: number) => (
    <div className="catalog-head">
      <span className="t">{t}</span>
      <span className="n">{n}</span>
    </div>
  );
  const none = (
    <div className="crow is-empty">
      <span className="empty">NONE</span>
    </div>
  );
  const sections = hull.sections ?? [];
  const slots = hull.external_slots ?? [];
  const zones = hull.armor_zones ?? [];
  const appendages = hull.appendages ?? [];
  return (
    <>
      {head("SECTIONS", sections.length)}
      {sections.map((s) => item("section", s.id, "S", s.id, `${fmt(s.x0, 1)}–${fmt(s.x1, 1)} m`))}
      {!sections.length && none}

      {head("EXTERNAL SLOTS", slots.length)}
      {slots.map((s) => item("slot", s.id, (s.type[0] ?? "?").toUpperCase(), `${s.id} · ${s.type}`, `${fmt(s.x, 1)} m / ${fmt(s.theta_deg)}°`))}
      {!slots.length && none}

      {head("ARMOUR ZONES", zones.length)}
      {zones.map((z) => item("zone", z.id, "A", `${z.id}${z.material ? ` · ${z.material}` : ""}`, `${fmt(z.x0, 1)}–${fmt(z.x1, 1)} m`))}
      {!zones.length && none}

      {head("APPENDAGES", appendages.length)}
      {appendages.map((a) => item("appendage", a.id, (a.kind[0] ?? "?").toUpperCase(), `${a.id} · ${a.kind}`, `${fmt(a.station, 1)} m`))}
      {!appendages.length && none}

      {head("STATIONS", hull.spine.stations.length)}
      {hull.spine.stations.map((s, i) => item("station", String(i), "#", `${fmt(s.x, 1)} m`, `½h ${fmt(s.half_height_m, 2)} m`))}
    </>
  );
}

/**
 * The selected thing, named on an accent-700 header, with its groups beneath —
 * the inspector shape from the HullEditor plate.
 */
function Selected({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="sel-head">
        <div className="t">{title}</div>
        {sub && <div className="s">{sub}</div>}
      </div>
      <div className="panel-body narrow">{children}</div>
    </section>
  );
}

/** Right pane, top: the selected thing's numbers. */
function Inspector({ hull, selection, commit, pitch }: { hull: HullGeometry; selection: Selection; commit: (h: HullGeometry) => void; pitch: number }) {
  if (!selection) {
    return (
      <Panel title="SPINE" meta="nothing selected" bodyClassName="narrow">
        <Group title="PROPORTIONS">
          <Num label="LENGTH" unit="m" value={hull.spine.length_m} onChange={(v) => commit({ ...hull, spine: { ...hull.spine, length_m: v } })} />
          <Num label="BEAM" unit="m" value={hull.spine.beam_m} onChange={(v) => commit({ ...hull, spine: { ...hull.spine, beam_m: v } })} />
          <Num label="STATION PITCH" unit="m" value={pitch} onChange={(v) => commit({ ...hull, spine: { ...hull.spine, station_pitch_m: v } })} />
          <Num label="PACKING" value={hull.packing_efficiency ?? 1} step={0.01} onChange={(v) => commit({ ...hull, packing_efficiency: v })} />
        </Group>
        <div className="help">Drag a station handle to shape the profile. Hold Alt to ignore the {pitch} m grid.</div>
      </Panel>
    );
  }
  if (selection.kind === "station") {
    const i = Number(selection.id);
    const s = hull.spine.stations[i];
    if (!s) return null;
    const set = (patch: Partial<typeof s>) =>
      commit({ ...hull, spine: { ...hull.spine, stations: hull.spine.stations.map((t, j) => (j === i ? { ...t, ...patch } : t)) } });
    return (
      <Selected title={`STATION ${i + 1}`} sub={`STA ${fmt(s.x, 1)} m`}>
        <Group title="PLACEMENT">
          <Num label="STATION" unit="m" value={s.x} onChange={(x) => set({ x })} />
          <Num label="HALF-HEIGHT" unit="m" value={s.half_height_m} onChange={(half_height_m) => set({ half_height_m })} />
        </Group>
        <div className="btn-group">
          <Button size="sm" variant="danger" onClick={() => commit({ ...hull, spine: { ...hull.spine, stations: hull.spine.stations.filter((_, j) => j !== i) } })}>
            REMOVE STATION
          </Button>
        </div>
      </Selected>
    );
  }
  if (selection.kind === "slot") {
    const s = (hull.external_slots ?? []).find((s) => s.id === selection.id);
    if (!s) return null;
    const set = (patch: Partial<typeof s>) => commit({ ...hull, external_slots: (hull.external_slots ?? []).map((t) => (t.id === s.id ? { ...t, ...patch } : t)) });
    const orientation = slotOrientation(s);
    return (
      <Selected title={`SLOT ${s.id}`} sub={`${s.type} · ${s.size} · STA ${fmt(s.x, 1)} m / ${fmt(s.theta_deg)}°`}>
        <Group title="PLACEMENT">
          <Num label="STATION" unit="m" value={s.x} onChange={(x) => set({ x })} />
          <Num label="CLOCK" unit="°" value={s.theta_deg} onChange={(theta_deg) => set({ theta_deg })} />
        </Group>
        <Group title="MOUNT">
          <Choice label="TYPE" value={s.type} options={SLOT_TYPES} onChange={(type) => set({ type })} />
          <Choice label="SIZE" value={String(s.size)} options={["S", "M", "L", "XL"]} onChange={(size) => set({ size })} />
          {SLOT_SUBTYPES[s.type] && (
            // The first subtype is the default, so choosing it clears the field.
            <Choice
              label="SUBTYPE"
              value={s.subtype ?? SLOT_SUBTYPES[s.type]![0]!}
              options={SLOT_SUBTYPES[s.type]!}
              onChange={(v) => set({ subtype: v === SLOT_SUBTYPES[s.type]![0] ? undefined : v })}
            />
          )}
          {/* Which way the mount points (hull/orientation.ts). A gun that has to
              fire astern is flipped; a thruster is turned and tilted. */}
          <Row label="FACING">
            <NumberField className="w-num" step={15} value={orientation.facing_deg} onValue={(v) => set({ facing_deg: v || undefined })} unit="°" />
            <Button size="sm" title="Turn the mount to face the other way" onClick={() => set({ facing_deg: (orientation.facing_deg + 180) % 360 || undefined })}>
              FLIP
            </Button>
          </Row>
          {TILTABLE.has(s.type) && (
            <Row label="TILT">
              <NumberField className="w-num" min={0} max={90} step={15} value={orientation.tilt_deg} onValue={(v) => set({ tilt_deg: v ?? 0 })} unit="°" />
              <Button size="sm" title="Fire along the hull" onClick={() => set({ tilt_deg: 0 })}>
                ALONG
              </Button>
              <Button size="sm" title="Fire straight outward" onClick={() => set({ tilt_deg: 90 })}>
                RADIAL
              </Button>
            </Row>
          )}
          <Row label="RING">
            <Select className="w-num" value={String(s.count ?? 1)} onChange={(e) => set({ count: Number(e.target.value) > 1 ? Number(e.target.value) : undefined })}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "single" : `${n} round`}
                </option>
              ))}
            </Select>
          </Row>
          {(s.count ?? 1) > 1 && (
            <div className="help">
              {s.count} copies every {Math.round(360 / (s.count ?? 1))}° from {s.theta_deg}° — one slot, balanced on the axis.
            </div>
          )}
          <Text label="PART OVERRIDE" value={s.part ?? ""} onChange={(part) => set({ part: part.trim() || undefined })} />
        </Group>
      </Selected>
    );
  }
  if (selection.kind === "section") {
    const s = (hull.sections ?? []).find((s) => s.id === selection.id);
    if (!s) return null;
    const vol = hullMetrics(hull).sections.find((v) => v.id === s.id);
    const set = (patch: Partial<typeof s>) => commit({ ...hull, sections: (hull.sections ?? []).map((t) => (t.id === s.id ? { ...t, ...patch } : t)) });
    return (
      <Selected title={`SECTION ${s.id}`} sub={`STA ${fmt(s.x0, 1)} – ${fmt(s.x1, 1)} m`}>
        <Group title="PLACEMENT">
          <Num label="FROM" unit="m" value={s.x0} onChange={(x0) => set({ x0 })} />
          <Num label="TO" unit="m" value={s.x1} onChange={(x1) => set({ x1 })} />
        </Group>
        <Group title="VOLUME">
          <Row label="PRESSURISED">
            <Checkbox checked={!!s.pressurised} onChange={(v) => set({ pressurised: v || undefined })} />
          </Row>
          <Row label="USABLE">
            <Value v={fmt(vol?.usable_m3 ?? 0)} unit="m³" />
          </Row>
        </Group>
      </Selected>
    );
  }
  if (selection.kind === "zone") return <ZoneInspector hull={hull} id={selection.id} commit={commit} />;
  const a = (hull.appendages ?? []).find((a) => a.id === selection.id);
  if (!a) return null;
  const set = (patch: Partial<typeof a>) => commit({ ...hull, appendages: (hull.appendages ?? []).map((t) => (t.id === a.id ? { ...t, ...patch } : t)) });
  return (
    <Selected title={`APPENDAGE ${a.id}`} sub={`${a.kind} · STA ${fmt(a.station, 1)} m`}>
      <Group title="PLACEMENT">
        <Num label="STATION" unit="m" value={a.station} onChange={(station) => set({ station })} />
        <Num label="ATTACH HEIGHT" unit="m" value={a.attach_r ?? 0} onChange={(attach_r) => set({ attach_r })} />
      </Group>
      <Group title="FORM">
        <Text label="KIND" value={a.kind} onChange={(kind) => set({ kind })} />
        <Choice label="MIRROR" value={a.mirror ?? "vertical"} options={["vertical", "none"]} onChange={(v) => set({ mirror: v as "vertical" | "none" })} />
      </Group>
    </Selected>
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
    <Panel title="START FROM A CLASS" meta={`${classes.length} classes`} bodyClassName="flush">
      <div className="help pad">This hull has no spine yet. A class fills in its profile, sections, slots and armour — all editable afterwards.</div>
      {classes.map((p) => (
        <div key={p.id} className="crow" title={p.description} onClick={() => onPick(p)} role="button">
          <span className="tile">{String(p.fields.hull_class)[0]}</span>
          <span className="nm">
            {String(p.fields.hull_class)} · {p.title.replace(/^[A-Z]+ — /, "")}
          </span>
          <span className="fp">{length(p) ?? "—"} m</span>
        </div>
      ))}
    </Panel>
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
  // derived from it, not just onto the row it came from — `Value` draws it.

  return (
    <Selected title={`ARMOUR ${z.id}`} sub={`${z.material ?? "no material"} · STA ${fmt(x0, 1)} – ${fmt(x1, 1)} m`}>
      <Group title="PLACEMENT">
        <Num label="FROM" unit="m" value={z.x0} onChange={(x0) => set({ x0 })} />
        <Num label="TO" unit="m" value={z.x1} onChange={(x1) => set({ x1 })} />
      </Group>
      <Group title="PLATE">
        <Choice label="MATERIAL" value={z.material ?? ""} options={["", ...options]} onChange={(v) => set({ material: v || undefined })} />
        <Num label="THICKNESS" unit="cm" value={thickness_cm} onChange={(thickness_cm) => set({ thickness_cm })} />
      </Group>
      <Group title="PERFORMANCE">
        <Row label="AREAL DENSITY">
          <Value v={areal_kg_m2 !== undefined ? fmt(areal_kg_m2, 1) : undefined} unit="kg/m²" provisional={provisional} />
        </Row>
        <Row label="BELT AREA">
          <Value v={fmt(area_m2)} unit="m²" />
        </Row>
        <Row label="ZONE MASS">
          <Value v={mass_t !== undefined ? fmt(mass_t, 1) : undefined} unit="t" provisional={provisional} />
        </Row>
      </Group>

      {provisional && <div className="provisional">Armour mass rests on a provisional figure in _tables/armor.yaml.</div>}
      {lookupError && <div className="help">No density for this material — {lookupError}. It still saves; the budget contributes no armour mass for this zone.</div>}
      {!z.material && <div className="help">No material set, so this zone contributes no mass to the budget.</div>}

      <div className="btn-group">
        <Button size="sm" variant="danger" onClick={() => commit({ ...hull, armor_zones: (hull.armor_zones ?? []).filter((t) => t.id !== z.id) })}>
          REMOVE ZONE
        </Button>
      </div>
    </Selected>
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
      <Panel title="STYLE">
        <div className="help">No style kit linked. Fittings fall back to the default families.</div>
      </Panel>
    );
  }
  const families = familiesOf(style.fields);
  return (
    <Panel title={`STYLE · ${caps(style.name)}`} meta={off.length === 0 ? <span className="stamp sev-text-nominal">CONFORMS</span> : <span className="stamp sev-text-info">{off.length} DEVIATIONS</span>} bodyClassName="narrow">
      <Group title="PART FAMILIES" meta={String(Object.keys(families).length)}>
        {Object.entries(families).map(([k, v]) => (
          <Row key={k} label={caps(k.replace(/_/g, " "))}>
            <span className="val">{String(v)}</span>
          </Row>
        ))}
        {families.radiator_aspect === undefined && (
          <Row label="RADIATOR ASPECT" title="The kit sets no radiator_aspect, so the generator's default applies">
            <Value v={String(DEFAULT_RADIATOR_ASPECT)} unit="default" />
          </Row>
        )}
        <Row label="RADIATOR DRAWN" title="Height over length for this kit's radiator family at size M, after its own character is applied. Never below 1.">
          <Value v={`${radiatorRatio(families.radiator, families.radiator_aspect).toFixed(2)} : 1`} />
        </Row>
        {Object.keys(families).length === 0 && <div className="help">The kit declares no part families.</div>}
      </Group>
      {off.length > 0 && (
        <Group title="DEVIATIONS" meta="allowed, never blocked">
          {off.map((s) => (
            <Row key={s.id} label={s.id.toLocaleUpperCase("en")}>
              <span className="val grow">{s.part}</span>
              <Button size="sm" onClick={() => commit({ ...hull, external_slots: (hull.external_slots ?? []).map((t) => (t.id === s.id ? { ...t, part: undefined } : t)) })}>
                CONFORM
              </Button>
            </Row>
          ))}
          <div className="btn-group">
            <Button size="sm" onClick={() => commit({ ...hull, external_slots: (hull.external_slots ?? []).map((t) => ({ ...t, part: undefined })) })}>
              CONFORM ALL
            </Button>
          </div>
        </Group>
      )}
    </Panel>
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
    <svg viewBox={`${flip ? -x1 : x0} ${-y1} ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      <g transform={flip ? "scale(-1,-1)" : "scale(1,-1)"}>
        {scene.elements
          .filter((e) => e.kind === "path" && e.id === "hull")
          .map((e) => (e.kind === "path" ? <path key={e.id} d={e.d} fill="var(--ink-300)" /> : null))}
      </g>
    </svg>
  );
}

function Num({ label, unit, value, step, onChange }: { label: string; unit?: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <Row label={label}>
      <NumberField className="w-num" step={step ?? 0.1} value={Number.isFinite(value) ? value : 0} onValue={(v) => onChange(v ?? 0)} unit={unit} />
    </Row>
  );
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  // A value off the list is kept and shown, never silently replaced.
  const all = options.includes(value) ? options : [value, ...options];
  return (
    <Row label={label}>
      <Select className="w-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {all.map((o) => (
          <option key={o} value={o}>
            {o === "" ? "—" : o}
          </option>
        ))}
      </Select>
    </Row>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Row label={label}>
      <TextField className="w-field" value={value} onChange={(e) => onChange(e.target.value)} />
    </Row>
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
