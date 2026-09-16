import { useEffect, useState } from "react";
import { useApp } from "./state";
import type { AssetRef, GalleryRecord } from "../core/types";
import { slugify } from "../core/ids";

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
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Assets (SVG portraits, sketches)</h3>
      {record.assets.map((a, i) => (
        <div key={a.path + i} style={{ marginBottom: 8 }}>
          <div className="row">
            <input type="text" value={a.role} style={{ maxWidth: 120 }} onChange={(e) => onChange(record.assets.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
            <span className="mono grow" style={{ fontSize: 11 }}>
              {a.path}
            </span>
            <input type="text" value={a.caption ?? ""} placeholder="caption" style={{ maxWidth: 200 }} onChange={(e) => onChange(record.assets.map((x, j) => (j === i ? { ...x, caption: e.target.value || undefined } : x)))} />
            <button className="ghost" onClick={() => onChange(record.assets.filter((_, j) => j !== i))} title="Detach (file stays in assets/)">
              ×
            </button>
          </div>
          {a.path.toLowerCase().endsWith(".svg") && <SvgPreview path={a.path} />}
        </div>
      ))}
      <div className="row">
        <select value={role} onChange={(e) => setRole(e.target.value)} style={{ maxWidth: 140 }}>
          {["portrait", "silhouette", "map", "sketch", "diagram", "attachment"].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
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
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        Files are copied into <code>assets/</code>. Draw silhouettes in any SVG editor for now (Inkscape, Boxy SVG, Figma export); the built-in sketcher lands in a later phase.
      </div>
    </div>
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
  if (!svg) return <div className="muted mono" style={{ fontSize: 11 }}>(preview unavailable)</div>;
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
