import { useEffect, useMemo, useRef, useState } from "react";
import { actions, useApp } from "./state";
import { Button, TextField } from "./kit";

/** Type-ahead picker for record references. Value is a record id (or ""). */
export function RefPicker({
  value,
  types,
  onChange,
  placeholder,
}: {
  value: string;
  types: string[];
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const { repo } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const current = value ? repo?.record(value) : undefined;

  const options = useMemo(() => {
    if (!repo) return [];
    const needle = q.trim().toLowerCase();
    return repo
      .all()
      .filter((r) => types.length === 0 || types.includes(r.record.type))
      .filter((r) => !needle || r.record.name.toLowerCase().includes(needle) || r.record.aliases.some((a) => a.toLowerCase().includes(needle)))
      .sort((a, b) => a.record.name.localeCompare(b.record.name))
      .slice(0, 40);
  }, [repo, q, types, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="picker" ref={box}>
      <div className="row tight">
        {current && !open ? (
          <>
            <span className="ref-value">
              <span className="link" onClick={() => actions.navigate({ kind: "record", id: current.id })} title="Open">
                {current.name}
              </span>
              <span className="kind">{current.type}</span>
            </span>
            <Button size="sm" onClick={() => setOpen(true)}>
              Change
            </Button>
            <Button size="sm" onClick={() => onChange("")}>
              CLEAR
            </Button>
          </>
        ) : (
          <TextField
            placeholder={placeholder ?? (value && !current ? `unknown id ${value}` : `Search ${types.join(" / ") || "records"}…`)}
            value={q}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setHi(0);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setHi((h) => Math.min(h + 1, options.length - 1));
              else if (e.key === "ArrowUp") setHi((h) => Math.max(h - 1, 0));
              else if (e.key === "Enter" && options[hi]) {
                onChange(options[hi].record.id);
                setOpen(false);
                setQ("");
              } else if (e.key === "Escape") setOpen(false);
            }}
          />
        )}
      </div>
      {open && (
        <div className="menu">
          {options.map((o, i) => (
            <div
              key={o.record.id}
              className={"opt" + (i === hi ? " hi" : "")}
              onMouseEnter={() => setHi(i)}
              onMouseDown={() => {
                onChange(o.record.id);
                setOpen(false);
                setQ("");
              }}
            >
              {o.record.name}
              <small>{o.record.type}</small>
            </div>
          ))}
          {options.length === 0 && <div className="opt muted">No matches.</div>}
        </div>
      )}
    </div>
  );
}
