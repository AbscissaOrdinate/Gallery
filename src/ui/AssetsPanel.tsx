import { useEffect, useState } from "react";
import { useApp } from "./state";
import type { AssetRef, GalleryRecord } from "../core/types";
import { slugify } from "../core/ids";
import { Button, Group, Panel, Row, Select, TextField, caps } from "./kit";

/** SVG (and other text) assets attached to a record, with inline preview. */
export function AssetsPanel({ record, onChange }: { record: GalleryRecord; onChange: (assets: AssetRef[]) => void }) {
  const { repo } = useApp();
  const [role, setRole] = useState("portrait");
  if (!repo) return null;

  const attachFile = async (file: File) => {
    const text = await file.text();
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "svg";
    const name = `${record.slug}-${slugify(file.name.replace(/\.[^.]+$/, ""))}.${ext}`;
    const path = await repo.putTextAsset(name, text);
    onChange([...record.assets, { role, path }]);
  };

  return (
    <Panel title="ASSETS" meta={`${record.assets.length} attached`}>
      {record.assets.map((a, i) => (
        <Group key={a.path + i} title={caps(a.role || "asset")} meta={a.path}>
          <Row label="ROLE">
            <TextField className="w-rel" value={a.role} onChange={(e) => onChange(record.assets.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
          </Row>
          <Row label="CAPTION">
            <TextField value={a.caption ?? ""} placeholder="caption" onChange={(e) => onChange(record.assets.map((x, j) => (j === i ? { ...x, caption: e.target.value || undefined } : x)))} />
          </Row>
          {a.path.toLowerCase().endsWith(".svg") && <SvgPreview path={a.path} />}
          <div className="row">
            <Button size="sm" onClick={() => onChange(record.assets.filter((_, j) => j !== i))} title="Detach (the file stays in assets/)">
              DETACH
            </Button>
          </div>
        </Group>
      ))}
      <div className="row">
        <Select className="w-rel" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
          {["portrait", "silhouette", "map", "sketch", "diagram", "attachment"].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
        <input
          type="file"
          accept=".svg,.txt,.md,.csv,.json,.yaml,.yml"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) attachFile(f);
            e.target.value = "";
          }}
        />
      </div>
      <div className="help">
        Files are copied into <code>assets/</code>. Draw silhouettes in any SVG editor for now (Inkscape, Boxy SVG, Figma export); the built-in sketcher lands in a later phase.
      </div>
    </Panel>
  );
}

function SvgPreview({ path }: { path: string }) {
  const { repo } = useApp();
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    repo
      ?.readAsset(path)
      .then((t) => alive && setSvg(sanitizeSvg(t)))
      .catch(() => alive && setSvg(null));
    return () => {
      alive = false;
    };
  }, [path, repo]);
  if (!svg) return <div className="help">Preview unavailable.</div>;
  return <div className="svgbox" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Strip scripts and event handlers before inlining an SVG. */
function sanitizeSvg(text: string): string {
  return text
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+="[^"]*"/gi, "")
    .replace(/\son[a-z]+='[^']*'/gi, "")
    .replace(/href="javascript:[^"]*"/gi, "");
}
