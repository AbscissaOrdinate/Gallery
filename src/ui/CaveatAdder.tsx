import { useState } from "react";
import { normaliseCaveat } from "../core/handling";
import { Button, Checkbox, TextField } from "./kit";

/**
 * Write a caveat of your own. It marks this record at once; with SAVE TO VAULT it also joins
 * the caveats in gallery.config.yaml, offered on every record. Left off, it stays on this record only.
 */
export function CaveatAdder({ onAdd, saveLabel = "SAVE TO VAULT", saveDefault = false }: { onAdd: (caveat: string, save: boolean) => void; saveLabel?: string; saveDefault?: boolean }) {
  const [text, setText] = useState("");
  const [save, setSave] = useState(saveDefault);
  const caveat = normaliseCaveat(text);
  const add = () => {
    if (!caveat) return;
    onAdd(caveat, save);
    setText("");
  };
  return (
    <span className="caveat-add">
      <span className="row tight">
        <TextField value={text} placeholder="NEW CAVEAT" aria-label="New caveat" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button size="sm" onClick={add} disabled={!caveat}>
          ADD
        </Button>
      </span>
      {saveLabel && <Checkbox checked={save} onChange={setSave} label={saveLabel} />}
    </span>
  );
}
