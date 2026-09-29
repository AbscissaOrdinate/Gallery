import { useCallback, useEffect, useState } from "react";
import { useApp, actions } from "./state";
import { logEvent } from "./log";
import { snapshotBytes, type SnapshotManifest } from "../core/snapshots";
import { Button, Empty, Panel } from "./kit";

/** Bytes as B / KB / MB (1 KB = 1024 B), one decimal above a kilobyte. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `2026-09-29T14:03:22.123Z` → `2026-09-29 14:03:22Z`. */
const stamp = (iso: string) => iso.replace("T", " ").replace(/\.\d+Z$/, "Z");

/** Settings → Snapshots (doc 10 §7.7, minimal): what is kept, why, how big, and a way back. */
export function SnapshotsPanel() {
  const { repo } = useApp();
  const [list, setList] = useState<SnapshotManifest[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (repo) setList(await repo.snapshots());
  }, [repo]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!repo) return null;
  const restore = async (m: SnapshotManifest) => {
    setBusy(true);
    try {
      const r = await repo.restoreSnapshot(m.id);
      logEvent({
        severity: "info",
        source: "snapshot",
        message: `Restored snapshot ${m.id} — ${r.restored.length} file${r.restored.length === 1 ? "" : "s"} written${r.safety ? `; what was there is in snapshot ${r.safety.id}` : ""}`,
        detail: { components: r.restored },
      });
      actions.toast(`Restored ${r.restored.length} file${r.restored.length === 1 ? "" : "s"}`);
      setConfirming(null);
      await refresh();
    } catch (err) {
      actions.error(`Restore failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="SNAPSHOTS" meta={list ? `${list.length} kept · ${formatSize(list.reduce((n, m) => n + snapshotBytes(m), 0))}` : undefined} bodyClassName="flush">
      {!list || list.length === 0 ? (
        <Empty>No snapshots yet. Gallery takes one before it deletes, imports, generates a skeleton, upgrades the vault or restores.</Empty>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>TAKEN</th>
              <th>CAUSE</th>
              <th className="num">FILES</th>
              <th className="num">SIZE</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id}>
                <td>{stamp(m.at)}</td>
                <td>{m.cause}</td>
                <td className="num">{m.files.length}</td>
                <td className="num">{formatSize(snapshotBytes(m))}</td>
                <td className="num">
                  {confirming === m.id ? (
                    <>
                      <Button size="sm" variant="danger" disabled={busy} onClick={() => restore(m)}>
                        CONFIRM RESTORE
                      </Button>
                      <Button size="sm" onClick={() => setConfirming(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" disabled={busy || m.files.length === 0} onClick={() => setConfirming(m.id)} title="Put these files back; what is there now is snapshotted first">
                      RESTORE
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
