import { useEffect } from "react";
import { useApp, actions } from "./ui/state";
import { Welcome } from "./ui/Welcome";
import { Sidebar } from "./ui/Sidebar";
import { RecordList } from "./ui/RecordList";
import { RecordEditor } from "./ui/RecordEditor";
import { Settings } from "./ui/Settings";
import { ImportDialog } from "./ui/ImportDialog";
import { SystemMap } from "./ui/SystemMap";
import { isTauri } from "./core/storage/tauri";

export function App() {
  const app = useApp();

  // Global shortcuts: Ctrl/Cmd+K focuses search; Alt+Left goes back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        (document.getElementById("global-search") as HTMLInputElement | null)?.focus();
      }
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        actions.back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!app.repo) return <Welcome />;

  const v = app.view;
  return (
    <div className={"app" + (v.kind === "map" ? " map" : "")}>
      <div className="topbar">
        <span className="brand">GALLERY</span>
        <span className="path grow" title={app.repo.fs.label}>
          {app.repo.config.name} · {app.repo.fs.label}
        </span>
        <input
          id="global-search"
          type="search"
          placeholder="Search names, tags, aliases…  (Ctrl+K)"
          style={{ width: 300 }}
          value={app.query}
          onChange={(e) => {
            actions.setQuery(e.target.value);
            if (v.kind !== "list") actions.navigate({ kind: "list" });
          }}
        />
        <button className="ghost" onClick={() => actions.navigate({ kind: "import" })}>
          Import
        </button>
        <button className="ghost" onClick={() => actions.navigate({ kind: "settings" })}>
          Settings
        </button>
        <button className="ghost" onClick={() => actions.reload()} title="Re-read the folder (after OneDrive sync or external edits)">
          ↻
        </button>
        {!isTauri() && <span className="tag">browser demo</span>}
      </div>
      <Sidebar />
      {v.kind !== "map" && <RecordList />}
      <div className={"main" + (v.kind === "map" ? " mapmain" : "")}>
        {app.error && (
          <div className="errorbar row">
            <span className="grow">{app.error}</span>
            <button className="ghost" onClick={() => actions.error(null)}>
              ×
            </button>
          </div>
        )}
        {app.busy && <div className="muted">{app.busy}</div>}
        {v.kind === "record" && <RecordEditor key={v.id} id={v.id} />}
        {v.kind === "map" && <SystemMap key={v.id} id={v.id} />}
        {v.kind === "settings" && <Settings />}
        {v.kind === "import" && <ImportDialog />}
        {(v.kind === "list" || v.kind === "welcome") && <Overview />}
      </div>
      {app.toast && <div className="toast">{app.toast}</div>}
    </div>
  );
}

function Overview() {
  const { repo, stats } = useApp();
  if (!repo) return null;
  const problems = stats?.problems ?? [];
  return (
    <div className="editor">
      <h2>{repo.config.name}</h2>
      <p className="muted">
        {stats?.records ?? 0} records · schemas and presets are editable files in <code>_schemas/</code> and <code>_presets/</code> · index at{" "}
        <code>_index.csv</code>, per-type sheets in <code>_exports/</code>.
      </p>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Types</h3>
        <table className="tbl">
          <thead>
            <tr>
              <th></th>
              <th>Type</th>
              <th>Folder</th>
              <th className="num">Records</th>
              <th className="num">Presets</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {repo.registry.types().map((t) => (
              <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => actions.navigate({ kind: "list", type: t.id })}>
                <td style={{ color: "var(--accent)" }}>{t.icon}</td>
                <td>{t.title}</td>
                <td className="mono">{t.folder}/</td>
                <td className="num">{stats?.byType[t.id] ?? 0}</td>
                <td className="num">{repo.registry.presetsFor(t.id).length}</td>
                <td className="muted">{t.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(problems.length > 0 || repo.registry.problems.length > 0) && (
        <div className="card warn">
          <h3 style={{ marginTop: 0 }}>Load problems</h3>
          {repo.registry.problems.map((p, i) => (
            <div key={"r" + i} className="mono">
              {p}
            </div>
          ))}
          {problems.map((p) => (
            <div key={p.path}>
              <span className="mono">{p.path}</span> — {p.problems.join("; ")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
