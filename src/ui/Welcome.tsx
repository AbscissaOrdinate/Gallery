import { useEffect, useState } from "react";
import { actions, lastVaultPath, recentVaultPaths, useApp } from "./state";
import { isTauri, TauriFsAdapter } from "../core/storage/tauri";
import { version } from "../../package.json";
import { Spinner, StatusRow, treePrefix } from "./kit";
import { engineLabel, reactLabel, shellLabel, viteLabel } from "./runtime";

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
  // The footnote names what Gallery is running on, as the boot log does.
  const [shell, setShell] = useState("");
  useEffect(() => {
    shellLabel().then(setShell);
  }, []);
  const foot = [shell, engineLabel(), viteLabel(), reactLabel()].filter(Boolean).join(" · ");

  // A command line in the boot's terminal: prompt, command, and what it does beneath.
  const cmd = (key: string, label: string, sub: string, onClick: () => void, primary = false) => (
    <button key={key} type="button" className={"term-cmd" + (primary ? " is-primary" : "")} onClick={onClick}>
      <span className="prompt" aria-hidden>
        ›
      </span>
      <span className="body">
        <span className="label">{label}</span>
        <span className="sub">{sub}</span>
      </span>
    </button>
  );

  return (
    <div className="welcome">
      <div className="boot-mark">
        <span className="boot-wordmark">GALLERY</span>
        <span className="stamp ink-300">BUILD {version}</span>
      </div>
      <p className="boot-lede">
        A file-first workbench for worldbuilding. The vault is a plain folder — put it in OneDrive or Google Drive and it syncs like anything else. Records are YAML/JSON, notes are OPML
        outlines, sheets are CSV, portraits are SVG.
      </p>
      <div className="boot-rule" />
      {app.error && <StatusRow severity="violation" id="ERROR" message={app.error} word={false} />}
      {app.busy && <Spinner label={app.busy.toLocaleUpperCase("en")} />}

      <div className="term-group">
        <div className="t-label-xs ink-300">OPEN A VAULT</div>
        {tauri ? (
          <>
            {last && cmd("last", "OPEN LAST VAULT", last, () => openPath(last, false), true)}
            {cmd(
              "open",
              "OPEN AN EXISTING VAULT…",
              "a folder that already contains gallery.config.yaml",
              async () => {
                const p = await pickFolder();
                if (p) openPath(p, false);
              },
              !last,
            )}
            {cmd("create", "CREATE A VAULT IN A FOLDER…", "writes gallery.config.yaml, _schemas/, _presets/ and the type folders; existing files are left alone", async () => {
              const p = await pickFolder();
              if (p) openPath(p, true);
            })}
          </>
        ) : (
          <>
            {cmd("demo", "OPEN THE DEMO VAULT", "in memory · browser mode writes nothing to disk; the desktop app opens real folders", () => actions.openDemo(), true)}
            <p className="help">
              Build the desktop app with <code>npm run app:build</code> (or via the GitHub Actions workflow) to open folders on disk.
            </p>
          </>
        )}
      </div>

      {tauri && others.length > 0 && (
        <div className="term-group">
          <div className="t-label-xs ink-300">RECENT</div>
          {others.map((r, i) => (
            <button key={r} type="button" className="term-recent" onClick={() => openPath(r, false)}>
              <span className="tree" aria-hidden>
                {treePrefix([], i === others.length - 1)}
              </span>
              {r}
            </button>
          ))}
        </div>
      )}
      <div className="boot-foot welcome-foot">{foot}</div>
    </div>
  );
}
