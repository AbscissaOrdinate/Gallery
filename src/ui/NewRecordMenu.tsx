import { useState } from "react";
import { actions, useApp } from "./state";
import { logEvent } from "./log";
import { CLASS_CODES } from "../core/designer/hull/classes";
import { Button, Select, TextField } from "./kit";

export function NewRecordMenu({ onDone }: { onDone: () => void }) {
  const { repo, view } = useApp();
  const [type, setType] = useState<string>(view.kind === "list" && view.type ? view.type : "note");
  const [preset, setPreset] = useState<string>("");
  const [name, setName] = useState("");
  if (!repo) return null;
  const presets = repo.registry.presetsFor(type);
  // Hull classes are the usual way to start a hull, so they come first and
  // under their own heading; everything else follows.
  const rank = (p: (typeof presets)[number]) => CLASS_CODES.indexOf(String(p.fields.hull_class) as (typeof CLASS_CODES)[number]);
  const classes = presets.filter((p) => p.tags?.includes("class")).sort((a, b) => rank(a) - rank(b));
  const others = presets.filter((p) => !p.tags?.includes("class"));

  const create = async () => {
    const n = name.trim() || (type === "note" ? "Untitled note" : `New ${repo.registry.get(type)?.title ?? type}`);
    const rec = type === "note" ? repo.createNote(n) : repo.create(type, n, presets.find((p) => p.id === preset));
    await repo.save(rec);
    logEvent({ severity: "info", source: "record", message: `Created ${rec.name}${preset ? ` from ${preset}` : ""}`, detail: { subject: rec.name, subjectId: rec.id } });
    actions.navigate({ kind: "record", id: rec.id });
    onDone();
  };

  return (
    <div className="stack">
      <Select
        aria-label="Type"
        value={type}
        onChange={(e) => {
          setType(e.target.value);
          setPreset("");
        }}
      >
        {repo.registry.types().map((t) => (
          <option key={t.id} value={t.id}>
            {t.icon} {t.title}
          </option>
        ))}
      </Select>
      {presets.length > 0 && (
        <Select aria-label="Preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
          <option value="">— blank —</option>
          {classes.length > 0 && (
            <optgroup label="Hull classes">
              {classes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </optgroup>
          )}
          {classes.length > 0 && others.length > 0 ? (
            <optgroup label="Other presets">
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </optgroup>
          ) : (
            others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))
          )}
        </Select>
      )}
      <TextField
        placeholder="Name"
        aria-label="Name"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") create();
          if (e.key === "Escape") onDone();
        }}
      />
      <div className="btn-group">
        <Button variant="primary" onClick={create}>
          CREATE
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}
