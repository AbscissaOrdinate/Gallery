import { useEffect, useState } from "react";
import { actions, lastVaultPath, recentVaultPaths, useApp } from "./state";
import { isTauri, TauriFsAdapter } from "../core/storage/tauri";

async function pickFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const res = await open({ directory: true, multiple: false, title: "Choose your Gallery vault folder (e.g. OneDrive/Documents/Worldbuilding/gallery)" });
  return typeof res === "string" ? res : null;
}

export function Welcome() {
  const app = useApp();
  const [last, setLast] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const tauri = isTauri();

  useEffect(() => {
    if (!tauri) return;
    lastVaultPath().then(setLast);
    recentVaultPaths().then(setRecent);
  }, [tauri]);

  const openPath = (p: string, create: boolean) => actions.openVault(new TauriFsAdapter(p), { create });

  return (
    <div className="welcome">
      <h1>Gallery</h1>
      <p className="muted">
        A file-first workbench for worldbuilding. Your vault is a plain folder — put it in OneDrive or Google Drive and it syncs like anything else.
        Records are YAML/JSON, notes are OPML outlines, sheets are CSV, portraits are SVG.
      </p>
      {app.error && <div className="errorbar">{app.error}</div>}
      {app.busy && <div className="muted">{app.busy}</div>}

      {tauri ? (
        <>
          {last && (
            <button className="opt primary" onClick={() => openPath(last, false)}>
              <b>Open last vault</b>
              <span style={{ color: "inherit", opacity: 0.85 }}>{last}</span>
            </button>
          )}
          <button
            className="opt"
            onClick={async () => {
              const p = await pickFolder();
              if (p) openPath(p, false);
            }}
          >
            <b>Open an existing vault…</b>
            <span>A folder that already contains gallery.config.yaml</span>
          </button>
          <button
            className="opt"
            onClick={async () => {
              const p = await pickFolder();
              if (p) openPath(p, true);
            }}
          >
            <b>Create a vault in a folder…</b>
            <span>Writes gallery.config.yaml, _schemas/, _presets/ and the type folders. Existing files are left alone.</span>
          </button>
          {recent.filter((r) => r !== last).length > 0 && (
            <>
              <h3>Recent</h3>
              {recent
                .filter((r) => r !== last)
                .map((r) => (
                  <div key={r} className="row" style={{ marginTop: 4 }}>
                    <span className="link mono" onClick={() => openPath(r, false)}>
                      {r}
                    </span>
                  </div>
                ))}
            </>
          )}
        </>
      ) : (
        <>
          <button className="opt primary" onClick={() => actions.openDemo()}>
            <b>Open the demo vault (in memory)</b>
            <span>Browser mode: nothing is written to disk. The desktop app opens real folders.</span>
          </button>
          <p className="muted" style={{ fontSize: 12 }}>
            Build the desktop app with <code>npm run app:build</code> (or via the GitHub Actions workflow) to open folders on disk.
          </p>
        </>
      )}
    </div>
  );
}
