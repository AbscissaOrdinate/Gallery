import { useState } from "react";
import { actions, useApp } from "./state";
import { NewRecordMenu } from "./NewRecordMenu";
import { Button, cx, treePrefix } from "./kit";
import { sectionsOf } from "./sections";
import { useSessionLog } from "./log";
import { countLines } from "../core/sessionLog";

/**
 * The navigation rail (RecordPage plate), drawn as a tree: the vault's
 * sections (NOTES, ASTROGRAPHY, FACTIONS, SHIPYARD) are buttons that list the
 * whole section and fold with their chevron; each kind hangs off its section
 * on `├─` / `└─` treelines in the kind's glyph-navy glyph, the name in
 * label-md and the count in data-sm. Maps, tools and tags follow.
 */
const FOLD_KEY = "gallery.rail.folded";
function readFolded(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FOLD_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function Sidebar() {
  const { repo, view } = useApp();
  const [creating, setCreating] = useState(false);
  const [folded, setFolded] = useState<string[]>(readFolded);
  const fold = (id: string) => {
    const next = folded.includes(id) ? folded.filter((f) => f !== id) : [...folded, id];
    setFolded(next);
    try {
      localStorage.setItem(FOLD_KEY, JSON.stringify(next));
    } catch {
      /* the fold is a convenience; it simply isn't remembered */
    }
  };
  const log = useSessionLog();
  if (!repo) return null;
  const open = countLines(log.lines, true);
  const counts: Record<string, number> = {};
  for (const r of repo.all()) counts[r.record.type] = (counts[r.record.type] ?? 0) + 1;
  const activeType = view.kind === "list" ? view.type : view.kind === "record" ? repo.record(view.id)?.type : view.kind === "hull" ? "hull" : undefined;
  const tags = new Map<string, number>();
  for (const r of repo.all()) for (const t of r.record.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  const topTags = [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);

  const item = (key: string, icon: string, name: string, active: boolean, onClick: () => void, count?: number, tree?: string) => (
    <button key={key} type="button" className={cx("rail-item", active && "is-selected", tree && "is-leaf")} onClick={onClick}>
      {tree && <span className="tree" aria-hidden>{tree}</span>}
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
      {item("all", "◈", "All records", view.kind === "list" && !view.type && !view.section, () => actions.navigate({ kind: "list" }), repo.all().length)}
      {sectionsOf(repo.registry.types()).map(({ section, types }) => {
        const total = types.reduce((n, t) => n + (counts[t.id] ?? 0), 0);
        // A section of one kind is just that kind; no need to nest it.
        if (types.length === 1) {
          const t = types[0];
          return item(t.id, t.icon ?? section.icon, t.title, activeType === t.id, () => actions.navigate({ kind: "list", type: t.id }), counts[t.id] ?? 0);
        }
        const expanded = !folded.includes(section.id) || types.some((t) => t.id === activeType);
        const here = view.kind === "list" && view.section === section.id;
        return (
          <div key={section.id} className="rail-section">
            <div className={cx("rail-group", here && "is-selected")}>
              <button type="button" className="rail-fold" aria-expanded={expanded} aria-label={`${expanded ? "Fold" : "Unfold"} ${section.title}`} onClick={() => fold(section.id)}>
                {expanded ? "▾" : "▸"}
              </button>
              <button type="button" className="rail-group-name" onClick={() => actions.navigate({ kind: "list", section: section.id })} title={`List every record in ${section.title}`}>
                {section.title}
              </button>
              <span className="count">{total}</span>
            </div>
            {expanded && types.map((t, i) => item(t.id, t.icon ?? "•", t.title, activeType === t.id, () => actions.navigate({ kind: "list", type: t.id }), counts[t.id] ?? 0, treePrefix([], i === types.length - 1)))}
          </div>
        );
      })}
      {repo.ofType("system").length > 0 && (
        <>
          <div className="rail-head">MAPS</div>
          {repo.ofType("system").map((s, i, all) => item(s.record.id, "✦", s.record.name, view.kind === "map" && view.id === s.record.id, () => actions.navigate({ kind: "map", id: s.record.id }), undefined, treePrefix([], i === all.length - 1)))}
        </>
      )}
      <div className="rail-head">TOOLS</div>
      {item("log", "≡", "Session log", view.kind === "log", () => actions.navigate({ kind: "log" }), open.violation + open.caution, treePrefix([], false))}
      {item("import", "⇲", "Import", view.kind === "import", () => actions.navigate({ kind: "import" }), undefined, treePrefix([], false))}
      {item("settings", "⚙", "Settings", view.kind === "settings", () => actions.navigate({ kind: "settings" }), undefined, treePrefix([], true))}
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
