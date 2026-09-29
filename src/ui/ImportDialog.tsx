import { useState } from "react";
import { actions, useApp } from "./state";
import { importDynalistOpml, dedupeSlugs, type SplitStrategy } from "../core/importers/dynalist";
import type { NoteRecord } from "../core/types";
import { Button, Checkbox, Group, Panel, Row, Select, TextField } from "./kit";

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
    <div className="doc">
      <div className="page-title">Import</div>
      <Panel title="DYNALIST (OPML)">
        <p className="prose">
          In Dynalist: document menu → Export → OPML. Each import becomes note records in <code>notes/</code>; outline structure, notes, collapsed state and #tags are preserved, and
          the files still open in Dynalist.
        </p>
        <Group>
          <Row label="SPLIT">
            <Select className="w-wide" value={split} onChange={(e) => setSplit(e.target.value as SplitStrategy)}>
              <option value="top-level">One note per top-level item (recommended for big documents)</option>
              <option value="document">One note per document</option>
            </Select>
          </Row>
          {split === "top-level" && (
            <Row label="NAMES">
              <Checkbox checked={prefix} onChange={setPrefix} label={<span className="help">Prefix with the document title (“Fleets and Strikecraft › Early USSF”)</span>} />
            </Row>
          )}
          <Row label="EXTRA TAGS">
            <TextField className="w-wide" value={extraTags} onChange={(e) => setExtraTags(e.target.value)} placeholder="tag, tag" />
          </Row>
          <Row label="FILES">
            <input type="file" accept=".opml,.xml" multiple onChange={(e) => parseFiles(e.target.files)} />
          </Row>
        </Group>
      </Panel>

      {pending.length > 0 && (
        <Panel title="PREVIEW" meta={`${pending.length} files`}>
          <table className="tbl">
            <thead>
              <tr>
                <th>FILE</th>
                <th>DOCUMENT</th>
                <th className="num">NODES</th>
                <th className="num">NOTES</th>
                <th>FIRST NOTES</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.file}>
                  <td>{p.file}</td>
                  <td>{p.documentTitle}</td>
                  <td className="num">{p.nodeCount}</td>
                  <td className="num">{p.notes.length}</td>
                  <td className="ink-300">
                    {p.notes.slice(0, 4).map((n) => n.name).join(" · ")}
                    {p.notes.length > 4 ? " …" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="btn-group">
            <Button variant="primary" onClick={commit} disabled={busy}>
              IMPORT {pending.reduce((a, p) => a + p.notes.length, 0)} NOTES
            </Button>
            <Button onClick={() => setPending([])}>Cancel</Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
