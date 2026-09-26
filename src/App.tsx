import { useEffect } from "react";
import { useApp, actions, type View } from "./ui/state";
import { Welcome } from "./ui/Welcome";
import { Sidebar } from "./ui/Sidebar";
import { RecordList } from "./ui/RecordList";
import { RecordEditor } from "./ui/RecordEditor";
import { Settings } from "./ui/Settings";
import { ImportDialog } from "./ui/ImportDialog";
import { SystemMap } from "./ui/SystemMap";
import { HullEditor } from "./ui/hull/HullEditor";
import { AdvisoryLog } from "./ui/AdvisoryLog";
import { Boot } from "./ui/Boot";
import { isTauri } from "./core/storage/tauri";
import type { Repository } from "./core/repo";
import { Button, Panel, Spinner, StatusRow, treePrefix } from "./ui/kit";
import { SECTIONS, sectionsOf } from "./ui/sections";

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

  if (!app.repo)
    return (
      <>
        <Welcome />
        <Boot />
      </>
    );

  const v = app.view;
  // A record page takes the full width between the rail and the edge (RecordPage plate); the list pane is for browsing.
  const wide = v.kind === "map" || v.kind === "hull" || v.kind === "record" || v.kind === "log";
  return (
    <div className={"app" + (wide ? " wide" : "")}>
      {/* Application bar: wordmark, breadcrumb, search, and no more than two commands (RecordPage plate). */}
      <header className="appbar">
        <span className="wordmark">GALLERY</span>
        <Crumbs repo={app.repo} view={v} />
        <input
          id="global-search"
          type="search"
          className="search"
          placeholder="Search names, tags, aliases… (Ctrl+K)"
          value={app.query}
          onChange={(e) => {
            actions.setQuery(e.target.value);
            if (v.kind !== "list") actions.navigate({ kind: "list" });
          }}
        />
        <Button onClick={() => actions.reload()} title="Re-read the folder (after OneDrive sync or external edits)">
          Reload
        </Button>
      </header>
      <Sidebar />
      {!wide && <RecordList />}
      <main className={"main" + (wide ? " canvas" : "")}>
        {app.error && (
          <StatusRow severity="violation" id="ERROR" message={app.error} detail="Click to dismiss." word={false} onClick={() => actions.error(null)} />
        )}
        {app.busy && <Spinner label={app.busy.toLocaleUpperCase("en")} />}
        {v.kind === "record" && <RecordEditor key={v.id} id={v.id} />}
        {v.kind === "map" && <SystemMap key={v.id} id={v.id} />}
        {v.kind === "hull" && <HullEditor key={v.id} id={v.id} />}
        {v.kind === "settings" && <Settings />}
        {v.kind === "import" && <ImportDialog />}
        {v.kind === "log" && <AdvisoryLog key={v.query ?? ""} initialQuery={v.query} />}
        {(v.kind === "list" || v.kind === "welcome") && <Overview />}
      </main>
      {app.toast && <div className="toast">{app.toast}</div>}
      <Boot />
    </div>
  );
}

/** vault › kind › record, in data-sm; the last part in ink-100. */
function Crumbs({ repo, view }: { repo: Repository; view: View }) {
  const parts: string[] = [repo.config.name];
  const typeTitle = (t: string | undefined) => (t ? repo.registry.get(t)?.title ?? t : undefined);
  if (view.kind === "list") parts.push(typeTitle(view.type) ?? SECTIONS.find((s) => s.id === view.section)?.title ?? "All records");
  if (view.kind === "record") {
    const r = repo.record(view.id);
    if (r) parts.push(typeTitle(r.type) ?? r.type, r.name);
  }
  if (view.kind === "map") parts.push("Maps", repo.record(view.id)?.name ?? view.id);
  if (view.kind === "hull") parts.push("Hull", repo.record(view.id)?.name ?? view.id, "editor");
  if (view.kind === "settings") parts.push("Settings");
  if (view.kind === "import") parts.push("Import");
  if (view.kind === "log") parts.push("Session log");
  return (
    <span className="crumbs" title={repo.fs.label}>
      {parts.map((p, i) => (
        <span key={i} className={i === parts.length - 1 ? "here" : undefined}>
          {i > 0 && <span className="sep">›</span>}
          {p}
        </span>
      ))}
      <span className="sep">·</span>
      {repo.fs.label}
      {!isTauri() && " · browser demo"}
    </span>
  );
}

function Overview() {
  const { repo, stats } = useApp();
  if (!repo) return null;
  const problems = stats?.problems ?? [];
  return (
    <div className="doc">
      <div className="page-title">{repo.config.name}</div>
      <p className="help">
        {stats?.records ?? 0} records · schemas and presets are editable files in <code>_schemas/</code> and <code>_presets/</code> · index at <code>_index.csv</code>, per-type sheets
        in <code>_exports/</code>.
      </p>
      {/* The vault by section, each kind on a treeline, as the rail draws it. */}
      {sectionsOf(repo.registry.types()).map(({ section, types }) => {
        const total = types.reduce((n, t) => n + (stats?.byType[t.id] ?? 0), 0);
        return (
          <Panel
            key={section.id}
            title={section.title}
            meta={`${total} records · ${types.length} ${types.length === 1 ? "kind" : "kinds"}`}
            actions={
              types.length > 1 ? (
                <Button size="sm" onClick={() => actions.navigate({ kind: "list", section: section.id })}>
                  LIST SECTION
                </Button>
              ) : undefined
            }
            bodyClassName="flush"
          >
            <table className="tbl tree-tbl">
              <tbody>
                {types.map((t, i) => (
                  <tr key={t.id} className="is-link" onClick={() => actions.navigate({ kind: "list", type: t.id })}>
                    <td className="tree-cell">
                      <span className="tree" aria-hidden>
                        {treePrefix([], i === types.length - 1)}
                      </span>
                      <span className="glyph">{t.icon}</span>
                      <span className="t-label-md">{t.title}</span>
                    </td>
                    <td className="mono ink-300">{t.folder}/</td>
                    <td className="num">{stats?.byType[t.id] ?? 0}</td>
                    <td className="num ink-300">{repo.registry.presetsFor(t.id).length} presets</td>
                    <td className="help">{t.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        );
      })}
      {/* Load problems live in the session log now (AdvisoryLog subsumes the old list); this row points there. */}
      {(problems.length > 0 || repo.registry.problems.length > 0) && (
        <Panel title="LOAD PROBLEMS" meta={String(problems.length + repo.registry.problems.length)} bodyClassName="flush">
          <StatusRow
            severity="caution"
            id="VAULT"
            message={`${problems.length + repo.registry.problems.length} files did not load cleanly`}
            detail="Each is a CAUTION line in the session log, with its file. Click to open it."
            word={false}
            onClick={() => actions.navigate({ kind: "log", query: "severity:caution" })}
          />
        </Panel>
      )}
    </div>
  );
}
