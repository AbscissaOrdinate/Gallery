import { useEffect, useState } from "react";
import { actions, lastVaultPath, recentVaultPaths, useApp } from "./state";
import { isTauri, TauriFsAdapter } from "../core/storage/tauri";
import { Button, Panel, StatusRow } from "./kit";

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
  const others = recent.filter((r) => r !== last);

  return (
    <div className="welcome">
      <div className="wordmark">GALLERY</div>
      <p className="prose">
        A file-first workbench for worldbuilding. The vault is a plain folder — put it in OneDrive or Google Drive and it syncs like anything else. Records are YAML/JSON, notes are
        OPML outlines, sheets are CSV, portraits are SVG.
      </p>
      {app.error && <StatusRow severity="violation" id="ERROR" message={app.error} word={false} />}
      {app.busy && <div className="help">{app.busy}</div>}

      <Panel title="OPEN A VAULT">
        {tauri ? (
          <>
            {last && (
              <Button variant="primary" className="opt" onClick={() => openPath(last, false)}>
                <span>OPEN LAST VAULT</span>
                <span className="sub">{last}</span>
              </Button>
            )}
            <Button
              className="opt"
              onClick={async () => {
                const p = await pickFolder();
                if (p) openPath(p, false);
              }}
            >
              <span>Open an existing vault…</span>
              <span className="sub">A folder that already contains gallery.config.yaml</span>
            </Button>
            <Button
              className="opt"
              onClick={async () => {
                const p = await pickFolder();
                if (p) openPath(p, true);
              }}
            >
              <span>CREATE A VAULT IN A FOLDER…</span>
              <span className="sub">Writes gallery.config.yaml, _schemas/, _presets/ and the type folders. Existing files are left alone.</span>
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" className="opt" onClick={() => actions.openDemo()}>
              <span>Open the demo vault (in memory)</span>
              <span className="sub">Browser mode: nothing is written to disk. The desktop app opens real folders.</span>
            </Button>
            <p className="help">
              Build the desktop app with <code>npm run app:build</code> (or via the GitHub Actions workflow) to open folders on disk.
            </p>
          </>
        )}
      </Panel>

      {tauri && others.length > 0 && (
        <Panel title="RECENT" meta={String(others.length)}>
          {others.map((r) => (
            <span key={r} className="link mono" onClick={() => openPath(r, false)}>
              {r}
            </span>
          ))}
        </Panel>
      )}
    </div>
  );
}
