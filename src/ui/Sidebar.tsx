import { useState } from "react";
import { actions, useApp } from "./state";
import { NewRecordMenu } from "./NewRecordMenu";
import { Button, cx } from "./kit";
import { useSessionLog } from "./log";
import { countLines } from "../core/sessionLog";

/**
 * The navigation rail (RecordPage plate): record kinds with a glyph-navy kind
 * glyph, the name in label-md and the count in data-sm; the current kind takes
 * the selection treatment. Maps, tools and tags follow as their own sections.
 */
export function Sidebar() {
  const { repo, view } = useApp();
  const [creating, setCreating] = useState(false);
  const log = useSessionLog();
  if (!repo) return null;
  const open = countLines(log.lines, true);
  const counts: Record<string, number> = {};
  for (const r of repo.all()) counts[r.record.type] = (counts[r.record.type] ?? 0) + 1;
  const activeType = view.kind === "list" ? view.type : view.kind === "record" ? repo.record(view.id)?.type : view.kind === "hull" ? "hull" : undefined;
  const tags = new Map<string, number>();
  for (const r of repo.all()) for (const t of r.record.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  const topTags = [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);

  const item = (key: string, icon: string, name: string, active: boolean, onClick: () => void, count?: number) => (
    <button key={key} type="button" className={cx("rail-item", active && "is-selected")} onClick={onClick}>
      <span className="icon">{icon}</span>
      <span className="name">{name}</span>
      {count !== undefined && <span className="count">{count}</span>}
    </button>
  );

  return (
    <nav className="rail">
      <Button variant="primary" className="rail-new" onClick={() => setCreating((c) => !c)}>
        + NEW RECORD
      </Button>
      {creating && (
        <div className="rail-form">
          <NewRecordMenu onDone={() => setCreating(false)} />
        </div>
      )}
      <div className="rail-head">VAULT</div>
      {item("all", "◈", "All records", view.kind === "list" && !view.type, () => actions.navigate({ kind: "list" }), repo.all().length)}
      {repo.registry.types().map((t) => item(t.id, t.icon ?? "•", t.title, activeType === t.id, () => actions.navigate({ kind: "list", type: t.id }), counts[t.id] ?? 0))}
      {repo.ofType("system").length > 0 && (
        <>
          <div className="rail-head">MAPS</div>
          {repo.ofType("system").map((s) => item(s.record.id, "✦", s.record.name, view.kind === "map" && view.id === s.record.id, () => actions.navigate({ kind: "map", id: s.record.id })))}
        </>
      )}
      <div className="rail-head">TOOLS</div>
      {item("log", "≡", "Session log", view.kind === "log", () => actions.navigate({ kind: "log" }), open.violation + open.caution)}
      {item("import", "⇲", "Import", view.kind === "import", () => actions.navigate({ kind: "import" }))}
      {item("settings", "⚙", "Settings", view.kind === "settings", () => actions.navigate({ kind: "settings" }))}
      {topTags.length > 0 && (
        <>
          <div className="rail-head">TAGS</div>
          <div className="chips">
            {topTags.map(([t, n]) => (
              <span
                key={t}
                className="chip"
                role="button"
                onClick={() => {
                  actions.setQuery(t);
                  actions.navigate({ kind: "list" });
                }}
              >
                {t} <span className="count">{n}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}
