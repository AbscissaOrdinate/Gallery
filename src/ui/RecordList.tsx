import { useMemo, useState } from "react";
import { actions, useApp } from "./state";
import { isNote } from "../core/types";
import { Empty, Pip, Select, caps, cx } from "./kit";

type Sort = "updated" | "name" | "type";

export function RecordList() {
  const { repo, view, query } = useApp();
  const [sort, setSort] = useState<Sort>("updated");
  const type = view.kind === "list" ? view.type : view.kind === "record" ? repo?.record(view.id)?.type : undefined;
  const activeId = view.kind === "record" ? view.id : null;

  const rows = useMemo(() => {
    if (!repo) return [];
    let rs = repo.search(query);
    if (type) rs = rs.filter((r) => r.record.type === type);
    rs.sort((a, b) => {
      if (sort === "name") return a.record.name.localeCompare(b.record.name);
      if (sort === "type") return a.record.type.localeCompare(b.record.type) || a.record.name.localeCompare(b.record.name);
      return b.record.updated.localeCompare(a.record.updated);
    });
    return rs;
  }, [repo, query, type, sort, repo?.all().length, view]);

  if (!repo) return null;
  const schema = type ? repo.registry.get(type) : undefined;
  return (
    <div className="listpane">
      <header className="panel-head">
        <span className="panel-title">{caps(schema ? schema.title : "All records")}</span>
        <span className="panel-meta">{rows.length}</span>
        <Select className="auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="updated">Recent</option>
          <option value="name">Name</option>
          <option value="type">Type</option>
        </Select>
      </header>
      {rows.map(({ record: r, location, problems }) => (
        <div key={r.id} className={cx("rec", r.id === activeId && "is-selected")} onClick={() => actions.navigate({ kind: "record", id: r.id })}>
          <div className="name">
            {r.name}
            {problems && <Pip severity="caution" title={`CAUTION — ${problems.join("\n")}`} />}
          </div>
          <div className="meta">
            {!type && <span>{r.type}</span>}
            {isNote(r) ? <span>outline</span> : summaryOf(r.fields)}
            {r.tags.slice(0, 4).map((t) => (
              <span key={t}>#{t}</span>
            ))}
            <span className="fmt" title={location.path}>
              {location.format}
            </span>
          </div>
        </div>
      ))}
      {rows.length === 0 && <Empty>NO RECORDS. USE + NEW RECORD OR IMPORT.</Empty>}
    </div>
  );
}

function summaryOf(fields: Record<string, unknown>) {
  const keys = ["kind", "hull_class", "role", "category", "government"];
  const parts: string[] = [];
  for (const k of keys) if (typeof fields[k] === "string" && fields[k]) parts.push(fields[k] as string);
  return parts.length ? <span>{parts.slice(0, 3).join(" · ")}</span> : null;
}
