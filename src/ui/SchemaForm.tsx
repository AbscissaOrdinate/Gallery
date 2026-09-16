/**
 * Renders a form from a FieldSchema (JSON-Schema subset). Values live in a
 * plain object; every change calls onChange with a new object.
 */
import type { FieldSchema } from "../core/types";
import { RefPicker } from "./RefPicker";
import { actions, useApp } from "./state";
import { hintAU, hintKm } from "../core/astro/units";

type Obj = Record<string, unknown>;

export function SchemaForm({ schema, value, onChange }: { schema: FieldSchema; value: Obj; onChange: (v: Obj) => void }) {
  const props = schema.properties ?? {};
  // group fields by x-group, preserving declaration order
  const groups = new Map<string, [string, FieldSchema][]>();
  for (const [k, f] of Object.entries(props)) {
    if (f["x-hidden"]) continue;
    const g = f["x-group"] ?? "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push([k, f]);
  }
  const set = (k: string, v: unknown) => {
    const next = { ...value };
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete next[k];
    else next[k] = v;
    onChange(next);
  };
  return (
    <div>
      {[...groups.entries()].map(([g, fields]) => (
        <div key={g || "_"}>
          {g && <h3>{g}</h3>}
          {fields.map(([k, f]) => (
            <Field key={k} name={k} schema={f} value={value[k]} onChange={(v) => set(k, v)} required={schema.required?.includes(k)} />
          ))}
        </div>
      ))}
      {Object.keys(props).length === 0 && <div className="muted">This type has no fields yet — edit its schema in _schemas/.</div>}
    </div>
  );
}

function Field({ name, schema: f, value, onChange, required }: { name: string; schema: FieldSchema; value: unknown; onChange: (v: unknown) => void; required?: boolean }) {
  const label = (
    <label title={name}>
      {f.title ?? name}
      {required && <span className="warn"> *</span>}
    </label>
  );
  return (
    <div className="field">
      {label}
      <div>
        <Input schema={f} value={value} onChange={onChange} />
        {f.description && <div className="desc">{f.description}</div>}
      </div>
    </div>
  );
}

function Input({ schema: f, value, onChange }: { schema: FieldSchema; value: unknown; onChange: (v: unknown) => void }) {
  const { repo } = useApp();
  const ref = f["x-ref"];
  if (ref && f.type !== "array") {
    return <RefPicker value={typeof value === "string" ? value : ""} types={ref.types} onChange={(id) => onChange(id)} />;
  }
  if (f.enum) {
    return (
      <select value={value === undefined || value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? undefined : coerce(f, e.target.value))}>
        {!f.enum.includes("") && <option value="">—</option>}
        {f.enum.map((o) => (
          <option key={String(o)} value={String(o)}>
            {String(o) === "" ? "—" : String(o)}
          </option>
        ))}
      </select>
    );
  }
  switch (f.type) {
    case "boolean":
      return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
    case "number":
    case "integer":
      return (
        <span className="row">
          <input
            type="number"
            step={f.type === "integer" ? 1 : "any"}
            min={f.minimum}
            max={f.maximum}
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
            style={{ maxWidth: 200 }}
          />
          {f["x-unit"] && <span className="unit">{f["x-unit"]}</span>}
          {f["x-distance"] && typeof value === "number" && <DistanceHint unit={f["x-unit"]} value={value} display={repo?.config.distanceUnit ?? "light"} />}
        </span>
      );
    case "array":
      return <ArrayInput schema={f} value={Array.isArray(value) ? value : []} onChange={onChange} />;
    case "object":
      return (
        <div className="card" style={{ marginTop: 0, padding: "6px 10px" }}>
          <SchemaForm schema={f} value={(value as Obj) ?? {}} onChange={(v) => onChange(Object.keys(v).length ? v : undefined)} />
        </div>
      );
    case "string":
    default:
      if (f["x-multiline"]) return <textarea value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />;
      return <input type="text" value={typeof value === "string" ? value : value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** "≈ 8.32 lm" beside an AU/km input, in the vault's display unit. */
function DistanceHint({ unit, value, display }: { unit: string | undefined; value: number; display: "light" | "au" | "mkm" }) {
  const text = unit === "AU" ? hintAU(value, display) : unit === "km" ? hintKm(value, display) : "";
  if (!text) return null;
  return (
    <span className="unit muted" title="Equivalent in the display unit chosen on the map (Settings → distance units)">
      {text}
    </span>
  );
}

function coerce(f: FieldSchema, s: string): unknown {
  if (f.type === "number" || f.type === "integer") return Number(s);
  return s;
}

function ArrayInput({ schema: f, value, onChange }: { schema: FieldSchema; value: unknown[]; onChange: (v: unknown[]) => void }) {
  const item = f.items ?? { type: "string" };
  const ref = item["x-ref"] ?? f["x-ref"];
  // array of references → chips + picker
  if (ref && item.type !== "object") {
    const ids = value.filter((v): v is string => typeof v === "string");
    return (
      <div className="stack">
        <div className="chips">
          {ids.map((id, i) => (
            <RefChip key={id + i} id={id} onRemove={() => onChange(ids.filter((_, j) => j !== i))} />
          ))}
        </div>
        <RefPicker value="" types={ref.types} onChange={(id) => id && !ids.includes(id) && onChange([...ids, id])} placeholder={`Add ${ref.types.join("/")}…`} />
      </div>
    );
  }
  // array of primitives → comma/newline separated editor
  if (item.type !== "object") {
    const strs = value.map((v) => String(v));
    return (
      <textarea
        value={strs.join("\n")}
        placeholder="One per line"
        onChange={(e) => {
          const lines = e.target.value.split("\n");
          onChange(lines.map((l) => (item.type === "number" || item.type === "integer" ? Number(l) : l)).filter((l, i) => l !== "" || i === lines.length - 1));
        }}
        onBlur={(e) => onChange(e.target.value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => (item.type === "number" || item.type === "integer" ? Number(l) : l)))}
      />
    );
  }
  // array of objects → table with one row per item
  const cols = Object.entries(item.properties ?? {});
  const rows = value.filter((v): v is Obj => !!v && typeof v === "object");
  const setRow = (i: number, k: string, v: unknown) => {
    const next = rows.map((r, j) => (j === i ? { ...r, [k]: v } : r));
    if (v === undefined || v === "") delete (next[i] as Obj)[k];
    onChange(next);
  };
  return (
    <div>
      <table className="tbl">
        <thead>
          <tr>
            {cols.map(([k, c]) => (
              <th key={k}>{c.title ?? k}</th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map(([k, c]) => (
                <td key={k} style={{ minWidth: c["x-ref"] ? 220 : 80 }}>
                  <Input schema={c} value={r[k]} onChange={(v) => setRow(i, k, v)} />
                </td>
              ))}
              <td>
                <button className="ghost" title="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button style={{ marginTop: 6 }} onClick={() => onChange([...rows, defaultsOf(item)])}>
        + Add row
      </button>
    </div>
  );
}

function defaultsOf(f: FieldSchema): Obj {
  const o: Obj = {};
  for (const [k, c] of Object.entries(f.properties ?? {})) if (c.default !== undefined) o[k] = c.default;
  return o;
}

function RefChip({ id, onRemove }: { id: string; onRemove: () => void }) {
  return <RefPickerChip id={id} onRemove={onRemove} />;
}

function RefPickerChip({ id, onRemove }: { id: string; onRemove: () => void }) {
  const { repo } = useApp();
  const r = repo?.record(id);
  return (
    <span className="chip">
      <span className="link" onClick={() => actions.navigate({ kind: "record", id })}>
        {r?.name ?? id}
      </span>
      <button onClick={onRemove} title="Remove">
        ×
      </button>
    </span>
  );
}
