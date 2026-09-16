import { actions, useApp } from "./state";
import { VAULT } from "../core/types";

export function Settings() {
  const { repo } = useApp();
  if (!repo) return null;
  const cfg = repo.config;
  return (
    <div className="editor">
      <h2>Settings</h2>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Vault</h3>
        <div className="field">
          <label>Location</label>
          <span className="mono">{repo.fs.label}</span>
        </div>
        <div className="field">
          <label>Name</label>
          <input type="text" value={cfg.name} onChange={(e) => repo.saveConfig({ name: e.target.value })} style={{ maxWidth: 320 }} />
        </div>
        <div className="field">
          <label>Record format</label>
          <span className="row">
            <select value={cfg.recordFormat} onChange={(e) => repo.saveConfig({ recordFormat: e.target.value as "yaml" | "json" })} style={{ maxWidth: 160 }}>
              <option value="yaml">YAML (.type.yaml)</option>
              <option value="json">JSON (.type.json)</option>
            </select>
            <span className="muted" style={{ fontSize: 11 }}>
              Applies to new records; existing files keep their format. Both are always readable.
            </span>
          </span>
        </div>
        <div className="field">
          <label>CSV sheets</label>
          <span className="row">
            <input type="checkbox" checked={cfg.writeCsv} onChange={(e) => repo.saveConfig({ writeCsv: e.target.checked })} style={{ width: "auto" }} />
            <span className="muted" style={{ fontSize: 11 }}>
              Regenerate <code>{VAULT.indexCsv}</code> and <code>{VAULT.exportsDir}/&lt;type&gt;.csv</code> after every save
            </span>
            <button onClick={() => repo.writeCsv().then(() => actions.toast("CSV regenerated"))}>Regenerate now</button>
          </span>
        </div>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Schemas & presets</h3>
        <p className="muted" style={{ margin: 0 }}>
          Types live in <code>{VAULT.schemasDir}/&lt;type&gt;.schema.json</code>; presets in <code>{VAULT.presetsDir}/&lt;type&gt;/&lt;name&gt;.yaml</code>. Edit or add
          files, then press ↻ in the toolbar. Field keys: <code>type</code> (string/number/integer/boolean/array/object), <code>enum</code>, <code>x-unit</code>,{" "}
          <code>x-ref: {"{types: [...]}"}</code> for links to other records, <code>x-group</code>, <code>x-multiline</code>.
        </p>
        {repo.registry.problems.length > 0 && (
          <ul className="warn" style={{ paddingLeft: 18, marginTop: 8 }}>
            {repo.registry.problems.map((p, i) => (
              <li key={i} className="mono">
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <button className="danger" onClick={() => actions.closeVault()}>
          Close vault
        </button>
      </div>
    </div>
  );
}
