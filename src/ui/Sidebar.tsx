import { useState } from "react";
import { actions, useApp } from "./state";
import { NewRecordMenu } from "./NewRecordMenu";

export function Sidebar() {
  const { repo, view } = useApp();
  const [creating, setCreating] = useState(false);
  if (!repo) return null;
  const counts: Record<string, number> = {};
  for (const r of repo.all()) counts[r.record.type] = (counts[r.record.type] ?? 0) + 1;
  const activeType = view.kind === "list" ? view.type : view.kind === "record" ? repo.record(view.id)?.type : undefined;
  const tags = new Map<string, number>();
  for (const r of repo.all()) for (const t of r.record.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  const topTags = [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);

  return (
    <div className="sidebar">
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="primary grow" onClick={() => setCreating((c) => !c)}>
          + New
        </button>
      </div>
      {creating && <NewRecordMenu onDone={() => setCreating(false)} />}
      <div className={"item" + (view.kind === "list" && !view.type ? " active" : "")} onClick={() => actions.navigate({ kind: "list" })}>
        <span className="icon">◈</span>
        <span>All records</span>
        <span className="count">{repo.all().length}</span>
      </div>
      {repo.registry.types().map((t) => (
        <div key={t.id} className={"item" + (activeType === t.id ? " active" : "")} onClick={() => actions.navigate({ kind: "list", type: t.id })}>
          <span className="icon">{t.icon ?? "•"}</span>
          <span>{t.title}</span>
          <span className="count">{counts[t.id] ?? 0}</span>
        </div>
      ))}
      {repo.ofType("system").length > 0 && (
        <>
          <h3>Maps</h3>
          {repo.ofType("system").map((s) => (
            <div key={s.record.id} className={"item" + (view.kind === "map" && view.id === s.record.id ? " active" : "")} onClick={() => actions.navigate({ kind: "map", id: s.record.id })}>
              <span className="icon">✦</span>
              <span>{s.record.name}</span>
            </div>
          ))}
        </>
      )}
      {topTags.length > 0 && (
        <>
          <h3>Tags</h3>
          <div className="chips">
            {topTags.map(([t, n]) => (
              <span
                key={t}
                className="chip"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  actions.setQuery(t);
                  actions.navigate({ kind: "list" });
                }}
              >
                {t} <span className="muted">{n}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
