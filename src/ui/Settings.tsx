import { actions, useApp } from "./state";
import { BOOT_MODES, DEFAULT_BOOT_MODE, HANDLING_LEVELS, VAULT, type BootMode, type HandlingLevel, type OperatorConfig } from "../core/types";
import { LEVEL_WORD } from "../core/handling";
import { Button, Checkbox, Group, Panel, Row, Select, StatusRow, TextField } from "./kit";

export function Settings() {
  const { repo } = useApp();
  if (!repo) return null;
  const cfg = repo.config;
  const op = cfg.operator ?? {};
  const setOp = (patch: Partial<OperatorConfig>) => repo.saveConfig({ operator: { ...op, ...patch } });
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
      <Panel title="BOOT" meta="COSMETIC · NEVER GATES">
        <Group>
          <Row label="BOOT SCREEN">
            <Select className="w-field" value={cfg.boot ?? DEFAULT_BOOT_MODE} onChange={(e) => repo.saveConfig({ boot: e.target.value as BootMode })} aria-label="Boot screen">
              {BOOT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m === "full" ? "FULL — log, idle, authorisation; any key goes on" : m === "brief" ? "BRIEF — log and progress while loading" : "OFF"}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="OPERATOR">
            <TextField value={op.name ?? ""} placeholder="e.g. T.WADDELL / ONI-R4" onChange={(e) => setOp({ name: e.target.value || undefined })} />
          </Row>
          <Row label="CLEARANCE">
            <TextField value={op.clearance ?? ""} placeholder="e.g. LEVEL 4" onChange={(e) => setOp({ clearance: e.target.value || undefined })} />
          </Row>
          <Row label="BANNER LEVEL">
            <Select className="w-field" value={op.level ?? "unclassified"} onChange={(e) => setOp({ level: e.target.value as HandlingLevel })} aria-label="Banner level">
              {HANDLING_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_WORD[l]}
                </option>
              ))}
            </Select>
            <span className="help">The highest level the operator is cleared for; the boot banners carry it.</span>
          </Row>
          <Row label="CAVEATS">
            <TextField value={(op.caveats ?? []).join(", ")} placeholder="e.g. ORCON" onChange={(e) => setOp({ caveats: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) })} />
          </Row>
          <Row label="PROGRAMME">
            <TextField value={op.programme ?? ""} placeholder="e.g. UJCN" onChange={(e) => setOp({ programme: e.target.value || undefined })} />
          </Row>
        </Group>
      </Panel>
      <Panel title="SESSION">
        <div className="row">
          <Button onClick={() => actions.reopenVault()} title="Load the vault again from disk, with the boot screen">
            REOPEN VAULT
          </Button>
          <Button variant="danger" onClick={() => actions.closeVault()}>
            CLOSE VAULT
          </Button>
        </div>
      </Panel>
    </div>
  );
}
