import { actions, useApp } from "./state";
import { VAULT } from "../core/types";
import { Button, Checkbox, Group, Panel, Row, Select, StatusRow, TextField } from "./kit";

export function Settings() {
  const { repo } = useApp();
  if (!repo) return null;
  const cfg = repo.config;
  return (
    <div className="doc">
      <div className="page-title">Settings</div>
      <Panel title="VAULT">
        <Group>
          <Row label="LOCATION">
            <span className="val">{repo.fs.label}</span>
          </Row>
          <Row label="NAME">
            <TextField value={cfg.name} onChange={(e) => repo.saveConfig({ name: e.target.value })} />
          </Row>
          <Row label="RECORD FORMAT">
            <Select className="w-field" value={cfg.recordFormat} onChange={(e) => repo.saveConfig({ recordFormat: e.target.value as "yaml" | "json" })}>
              <option value="yaml">YAML (.type.yaml)</option>
              <option value="json">JSON (.type.json)</option>
            </Select>
            <span className="help">Applies to new records; existing files keep their format. Both are always readable.</span>
          </Row>
          <Row label="CSV SHEETS">
            <Checkbox
              checked={cfg.writeCsv}
              onChange={(v) => repo.saveConfig({ writeCsv: v })}
              label={
                <span className="help">
                  Regenerate <code>{VAULT.indexCsv}</code> and <code>{VAULT.exportsDir}/&lt;type&gt;.csv</code> after every save
                </span>
              }
            />
            <Button size="sm" onClick={() => repo.writeCsv().then(() => actions.toast("CSV regenerated"))}>
              REGENERATE
            </Button>
          </Row>
        </Group>
      </Panel>
      <Panel title="SCHEMAS & PRESETS" meta={repo.registry.problems.length ? `${repo.registry.problems.length} problems` : undefined}>
        <p className="prose">
          Types live in <code>{VAULT.schemasDir}/&lt;type&gt;.schema.json</code>; presets in <code>{VAULT.presetsDir}/&lt;type&gt;/&lt;name&gt;.yaml</code>. Edit or add files,
          then press Reload in the toolbar. Field keys: <code>type</code> (string/number/integer/boolean/array/object), <code>enum</code>, <code>x-unit</code>,{" "}
          <code>x-ref: {"{types: [...]}"}</code> for links to other records, <code>x-group</code>, <code>x-multiline</code>.
        </p>
        {repo.registry.problems.map((p, i) => (
          <StatusRow key={i} severity="caution" id="SCHEMA" message={p} word={false} />
        ))}
      </Panel>
      <Panel title="SESSION">
        <div className="row">
          <Button variant="danger" onClick={() => actions.closeVault()}>
            CLOSE VAULT
          </Button>
        </div>
      </Panel>
    </div>
  );
}
