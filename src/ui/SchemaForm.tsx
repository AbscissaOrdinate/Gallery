/**
 * Renders a form from a FieldSchema (JSON-Schema subset). Values live in a
 * plain object; every change calls onChange with a new object.
 *
 * Layout follows PanelNesting: the caller supplies the panel, this renders one
 * group per `x-group` (ungrouped fields under GENERAL), and each field is a
 * label/value row. A nested object is flattened into rows with a prefixed
 * label rather than nested a fourth level deep.
 *
 * With `redact`, a required field that holds no value draws a redaction bar
 * (docs/STYLE.md §4.2) and each group states its pending count; a group with
 * nothing filled at all says so once instead of barring every row.
 */
import { useState, type ReactNode } from "react";
import type { FieldSchema } from "../core/types";
import { RefPicker } from "./RefPicker";
import { actions, useApp } from "./state";
import { hintAU, hintKm } from "../core/astro/units";
import { Button, Checkbox, Empty, Group, NumberField, RedactionBar, Row, Select, TextArea, TextField, caps } from "./kit";
import { isEmptyValue } from "../core/handling";

type Obj = Record<string, unknown>;

export function SchemaForm({ schema, value, onChange, flat, labelPrefix, redact }: { schema: FieldSchema; value: Obj; onChange: (v: Obj) => void; flat?: boolean; labelPrefix?: string; redact?: boolean }) {
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
  if (Object.keys(props).length === 0) return <Empty>THIS TYPE HAS NO FIELDS. EDIT ITS SCHEMA IN _SCHEMAS/.</Empty>;
  const pendingIn = (fields: [string, FieldSchema][]) => fields.filter(([k]) => schema.required?.includes(k) && isEmptyValue(value[k])).length;
  const rows = (fields: [string, FieldSchema][], bars: boolean) =>
    fields.map(([k, f]) => (
      <Field key={k} name={k} schema={f} value={value[k]} onChange={(v) => set(k, v)} required={schema.required?.includes(k)} labelPrefix={labelPrefix} redacted={bars && !!schema.required?.includes(k) && isEmptyValue(value[k])} />
    ));
  if (flat) return <>{rows([...groups.values()].flat(), !!redact)}</>;
  return (
    <>
      {[...groups.entries()].map(([g, fields]) => {
        const pending = pendingIn(fields);
        const allEmpty = fields.every(([k]) => isEmptyValue(value[k]));
        const meta =
          redact && allEmpty ? (
            <span className="stamp">NO DATA ON FILE</span>
          ) : redact && pending > 0 ? (
            <span className="stamp sev-text-caution">
              {pending} FIELD{pending === 1 ? "" : "S"} PENDING
            </span>
          ) : (
            `${fields.length}`
          );
        return (
          <Group key={g || "_"} title={caps(g || "General")} meta={meta}>
            {rows(fields, !!redact && !allEmpty)}
          </Group>
        );
      })}
    </>
  );
}

function Field({
  name,
  schema: f,
  value,
  onChange,
  required,
  labelPrefix,
  redacted,
}: {
  name: string;
  schema: FieldSchema;
  value: unknown;
  onChange: (v: unknown) => void;
  required?: boolean;
  labelPrefix?: string;
  redacted?: boolean;
}) {
  // A bar stands only where the value was missing when the record opened; clearing a
  // field while editing keeps its input rather than swapping it out mid-keystroke.
  const [revealed, setRevealed] = useState(!redacted);
  const title = caps(f.title ?? name);
  const label: ReactNode = (
    <span title={name}>
      {labelPrefix ? `${labelPrefix} · ${title}` : title}
      {required && <span className="sev-text-caution"> *</span>}
    </span>
  );
  // A nested object's fields become rows of their own, labelled under this one.
  if (f.type === "object" && !f["x-ref"]) {
    return <SchemaForm schema={f} value={(value as Obj) ?? {}} onChange={(v) => onChange(Object.keys(v).length ? v : undefined)} flat labelPrefix={labelPrefix ? `${labelPrefix} · ${title}` : title} />;
  }
  const wide = f.type === "array" && (f.items?.type === "object" || !(f.items?.["x-ref"] ?? f["x-ref"]));
  if (redacted && !revealed) {
    return (
      <Row label={label}>
        <RedactionBar seed={name} onReveal={() => setRevealed(true)} />
      </Row>
    );
  }
  return (
    <Row label={label} className={wide ? "stacked" : undefined}>
      <Input schema={f} value={value} onChange={onChange} />
      {f.description && <span className="help">{f.description}</span>}
    </Row>
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
      <Select className="w-field" value={value === undefined || value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? undefined : coerce(f, e.target.value))}>
        {!f.enum.includes("") && <option value="">—</option>}
        {f.enum.map((o) => (
          <option key={String(o)} value={String(o)}>
            {String(o) === "" ? "—" : String(o)}
          </option>
        ))}
      </Select>
    );
  }
  switch (f.type) {
    case "boolean":
      return <Checkbox checked={!!value} onChange={onChange} />;
    case "number":
    case "integer":
      return (
        <>
          <NumberField
            className="w-num"
            step={f.type === "integer" ? 1 : "any"}
            min={f.minimum}
            max={f.maximum}
            value={typeof value === "number" ? value : undefined}
            onValue={onChange}
            unit={f["x-unit"]}
          />
          {f["x-distance"] && typeof value === "number" && <DistanceHint unit={f["x-unit"]} value={value} display={repo?.config.distanceUnit ?? "light"} />}
        </>
      );
    case "array":
      return <ArrayInput schema={f} value={Array.isArray(value) ? value : []} onChange={onChange} />;
    case "object":
      return <SchemaForm schema={f} value={(value as Obj) ?? {}} onChange={(v) => onChange(Object.keys(v).length ? v : undefined)} flat />;
    case "string":
    default:
      if (f["x-multiline"]) return <TextArea className="prose" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />;
      return <TextField value={typeof value === "string" ? value : value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** "≈ 8.32 lm" beside an AU/km input, in the vault's display unit. */
function DistanceHint({ unit, value, display }: { unit: string | undefined; value: number; display: "light" | "au" | "mkm" }) {
  const text = unit === "AU" ? hintAU(value, display) : unit === "km" ? hintKm(value, display) : "";
  if (!text) return null;
  return (
    <span className="unit" title="Equivalent in the display unit chosen on the map (Settings → distance units)">
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
  // array of references → one reference row each, then a picker
  if (ref && item.type !== "object") {
    const ids = value.filter((v): v is string => typeof v === "string");
    return (
      <div className="stack grow">
        {ids.map((id, i) => (
          <RefRow key={id + i} id={id} onRemove={() => onChange(ids.filter((_, j) => j !== i))} />
        ))}
        <RefPicker value="" types={ref.types} onChange={(id) => id && !ids.includes(id) && onChange([...ids, id])} placeholder={`Add ${ref.types.join("/")}…`} />
      </div>
    );
  }
  // array of primitives → one per line
  if (item.type !== "object") {
    const strs = value.map((v) => String(v));
    return (
      <TextArea
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
    <div className="stack grow">
      <table className="tbl">
        <thead>
          <tr>
            {cols.map(([k, c]) => (
              <th key={k}>{caps(c.title ?? k)}</th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map(([k, c]) => (
                <td key={k} className={c["x-ref"] ? "w-ref" : undefined}>
                  <Input schema={c} value={r[k]} onChange={(v) => setRow(i, k, v)} />
                </td>
              ))}
              <td>
                <Button size="sm" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                  REMOVE
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <Button size="sm" onClick={() => onChange([...rows, defaultsOf(item)])}>
          + ADD ROW
        </Button>
      </div>
    </div>
  );
}

function defaultsOf(f: FieldSchema): Obj {
  const o: Obj = {};
  for (const [k, c] of Object.entries(f.properties ?? {})) if (c.default !== undefined) o[k] = c.default;
  return o;
}

function RefRow({ id, onRemove }: { id: string; onRemove: () => void }) {
  const { repo } = useApp();
  const r = repo?.record(id);
  return (
    <div className="row tight">
      <span className="ref-value">
        <span className="link" onClick={() => actions.navigate({ kind: "record", id })}>
          {r?.name ?? id}
        </span>
        <span className="kind">{r?.type ?? "unknown"}</span>
      </span>
      <Button size="sm" onClick={onRemove}>
        REMOVE
      </Button>
    </div>
  );
}
