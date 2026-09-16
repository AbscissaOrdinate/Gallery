import { useState } from "react";
import { actions, useApp } from "./state";
import { importDynalistOpml, dedupeSlugs, type SplitStrategy } from "../core/importers/dynalist";
import type { NoteRecord } from "../core/types";

interface Pending {
  file: string;
  documentTitle: string;
  nodeCount: number;
  notes: NoteRecord[];
}

export function ImportDialog() {
  const { repo } = useApp();
  const [split, setSplit] = useState<SplitStrategy>("top-level");
  const [prefix, setPrefix] = useState(true);
  const [extraTags, setExtraTags] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  if (!repo) return null;

  const parseFiles = async (files: FileList | null) => {
    if (!files) return;
    const out: Pending[] = [];
    for (const f of Array.from(files)) {
      try {
        const r = importDynalistOpml(await f.text(), {
          split,
          prefixWithDocument: prefix,
          fallbackTitle: f.name.replace(/\.opml$/i, ""),
          tags: extraTags.split(/[,;]/).map((t) => t.trim()).filter(Boolean),
        });
        out.push({ file: f.name, ...r });
      } catch (err) {
        actions.error(`${f.name}: ${(err as Error).message}`);
      }
    }
    setPending(out);
  };

  const commit = async () => {
    setBusy(true);
    try {
      const taken = new Set(repo.ofType("note").map((r) => r.record.slug));
      let n = 0;
      for (const p of pending) {
        dedupeSlugs(p.notes, taken);
        for (const note of p.notes) {
          await repo.save(note, { touch: false });
          taken.add(note.slug);
          n++;
        }
      }
      actions.toast(`Imported ${n} note${n === 1 ? "" : "s"}`);
      setPending([]);
      actions.navigate({ kind: "list", type: "note" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="editor">
      <h2>Import</h2>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Dynalist (OPML)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          In Dynalist: document menu → Export → OPML. Each import becomes note records in <code>notes/</code>; outline structure, notes, collapsed state and
          #tags are preserved, and the files still open in Dynalist.
        </p>
        <div className="field">
          <label>Split</label>
          <select value={split} onChange={(e) => setSplit(e.target.value as SplitStrategy)} style={{ maxWidth: 360 }}>
            <option value="top-level">One note per top-level item (recommended for big documents)</option>
            <option value="document">One note per document</option>
          </select>
        </div>
        {split === "top-level" && (
          <div className="field">
            <label>Names</label>
            <span className="row">
              <input type="checkbox" checked={prefix} onChange={(e) => setPrefix(e.target.checked)} style={{ width: "auto" }} />
              <span className="muted">Prefix with the document title (“Fleets and Strikecraft › Early USSF”)</span>
            </span>
          </div>
        )}
        <div className="field">
          <label>Extra tags</label>
          <input type="text" value={extraTags} onChange={(e) => setExtraTags(e.target.value)} placeholder="e.g. heliaris, astropol" style={{ maxWidth: 360 }} />
        </div>
        <div className="field">
          <label>Files</label>
          <input type="file" accept=".opml,.xml" multiple onChange={(e) => parseFiles(e.target.files)} />
        </div>
      </div>

      {pending.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Preview</h3>
          <table className="tbl">
            <thead>
              <tr>
                <th>File</th>
                <th>Document</th>
                <th className="num">Nodes</th>
                <th className="num">Notes</th>
                <th>First notes</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.file}>
                  <td className="mono">{p.file}</td>
                  <td>{p.documentTitle}</td>
                  <td className="num">{p.nodeCount}</td>
                  <td className="num">{p.notes.length}</td>
                  <td className="muted">{p.notes.slice(0, 4).map((n) => n.name).join(" · ")}{p.notes.length > 4 ? " …" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" onClick={commit} disabled={busy}>
              Import {pending.reduce((a, p) => a + p.notes.length, 0)} notes
            </button>
            <button className="ghost" onClick={() => setPending([])}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
