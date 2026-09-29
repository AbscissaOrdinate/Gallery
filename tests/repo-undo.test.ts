/**
 * Undo/redo through the Repository (doc 11 §1.4–1.7, §1.9): byte-identical round trips, renames,
 * create/delete, transactions, the external-change rule, migrated records, CSV once per apply, and
 * history kept across a reload. MemoryAdapter + demoVault(), node only.
 */
import { describe, expect, it, vi } from "vitest";
import { Repository } from "../src/core/repo";
import { MemoryAdapter } from "../src/core/storage/memory";
import { serializeRecord } from "../src/core/codec/record";
import { SNAPSHOT_CAUSE } from "../src/core/snapshots";
import type { LogInput } from "../src/core/sessionLog";
import { sourcePrefix } from "../src/core/sessionLog";
import type { TypedRecord } from "../src/core/types";
import { demoVault } from "../src/ui/demo";

/** Record files only: no snapshots, no derived CSV. */
const recordFiles = (fs: MemoryAdapter) => Object.fromEntries(Object.entries(fs.dump()).filter(([p]) => !p.startsWith("_") && p !== "gallery.config.yaml"));
/** The whole vault except the snapshots. */
const vaultFiles = (fs: MemoryAdapter) => Object.fromEntries(Object.entries(fs.dump()).filter(([p]) => !p.startsWith("_snapshots/")));

async function demo() {
  const fs = new MemoryAdapter();
  await demoVault(fs);
  const repo = new Repository(fs);
  await repo.init();
  await repo.load();
  const log: LogInput[] = [];
  repo.onLog = (l) => log.push(l);
  return { fs, repo, log };
}

/** A polity to edit, as a fresh copy (the editors save drafts, not the loaded object). */
const polity = (repo: Repository, n = 0) => structuredClone(repo.ofType("polity")[n].record) as TypedRecord;
const stacks = (repo: Repository) => [repo.history.past.map((s) => s.seq), repo.history.future.map((s) => s.seq)];

describe("save → undo → redo", () => {
  it("undo leaves the file byte-identical to before; redo byte-identical to after", async () => {
    const { fs, repo, log } = await demo();
    const r = polity(repo);
    const path = repo.get(r.id)!.location.path;
    const before = vaultFiles(fs);
    const v0 = repo.version(r.id);
    const summary0 = r.summary;

    r.summary = "Edited for the undo test";
    await repo.save(r);
    const after = vaultFiles(fs);
    expect(after[path]).not.toBe(before[path]);
    expect(repo.history.peekUndo()!.label).toBe(`EDIT ${r.name.toUpperCase()} — summary`);
    expect(repo.version(r.id)).toBe(v0 + 1);

    expect(await repo.undo()).toEqual({ ok: true, label: `EDIT ${r.name.toUpperCase()} — summary` });
    expect(vaultFiles(fs)).toEqual(before); // the record file, and the CSV regenerated from it
    expect(repo.record(r.id)!.summary).toBe(summary0);
    expect(repo.version(r.id)).toBe(v0 + 2);
    expect(repo.history.past).toHaveLength(0);
    expect(repo.history.future).toHaveLength(1);

    expect((await repo.redo()).ok).toBe(true);
    expect(vaultFiles(fs)).toEqual(after);
    expect(repo.record(r.id)!.summary).toBe("Edited for the undo test");
    expect(log.map((l) => [l.severity, l.source, l.message])).toEqual([
      ["info", "history", `UNDONE — EDIT ${r.name.toUpperCase()} — summary`],
      ["info", "history", `REDONE — EDIT ${r.name.toUpperCase()} — summary`],
    ]);
    expect(sourcePrefix("history")).toBe("HIS");
  });

  it("the in-memory record follows the file, and a later save builds on the undone state", async () => {
    const { fs, repo } = await demo();
    const r = polity(repo);
    const path = repo.get(r.id)!.location.path;
    const original = await fs.readText(path);
    r.summary = "one";
    await repo.save(r);
    await repo.undo();
    const again = structuredClone(repo.record(r.id)!) as TypedRecord;
    expect(again.summary).not.toBe("one");
    again.tags = [...again.tags, "later"];
    await repo.save(again);
    await repo.undo();
    expect(await fs.readText(path)).toBe(original);
  });

  it("a name change that moves the file: undo restores the old path and removes the new", async () => {
    const { fs, repo } = await demo();
    const r = polity(repo);
    const oldPath = repo.get(r.id)!.location.path;
    const oldText = await fs.readText(oldPath);
    r.name = "Renamed Polity";
    r.slug = "renamed-polity";
    await repo.save(r);
    const newPath = repo.get(r.id)!.location.path;
    const newText = await fs.readText(newPath);
    expect(newPath).not.toBe(oldPath);
    expect(repo.history.peekUndo()!.label).toMatch(/^RENAME .* → RENAMED POLITY — file/);

    expect((await repo.undo()).ok).toBe(true);
    expect(await fs.readText(oldPath)).toBe(oldText);
    expect(await fs.exists(newPath)).toBe(false);
    expect(repo.get(r.id)!.location.path).toBe(oldPath);

    expect((await repo.redo()).ok).toBe(true);
    expect(await fs.readText(newPath)).toBe(newText);
    expect(await fs.exists(oldPath)).toBe(false);
    expect(repo.get(r.id)!.location.path).toBe(newPath);
  });

  it("create → undo removes the file; redo writes it back", async () => {
    const { fs, repo } = await demo();
    const n = repo.all().length;
    const r = repo.create("polity", "Brand New");
    const { location } = await repo.save(r);
    const text = await fs.readText(location.path);
    expect(repo.history.peekUndo()!.label).toBe("CREATE BRAND NEW");

    expect((await repo.undo()).ok).toBe(true);
    expect(await fs.exists(location.path)).toBe(false);
    expect(repo.get(r.id)).toBeUndefined();
    expect(repo.all()).toHaveLength(n);

    expect((await repo.redo()).ok).toBe(true);
    expect(await fs.readText(location.path)).toBe(text);
    expect(repo.get(r.id)!.record.name).toBe("Brand New");
  });

  it("delete → undo restores the bytes and the id; the delete was snapshotted", async () => {
    const { fs, repo } = await demo();
    const r = polity(repo);
    const path = repo.get(r.id)!.location.path;
    const text = await fs.readText(path);
    await repo.delete(r.id);
    const step = repo.history.peekUndo()!;
    expect(step.label).toBe(`DELETE ${r.name.toUpperCase()}`);
    const [snap] = await repo.snapshots();
    expect(snap.cause).toBe(SNAPSHOT_CAUSE.delete);
    expect(step.snapshot).toBe(snap.id);

    expect((await repo.undo()).ok).toBe(true);
    expect(await fs.readText(path)).toBe(text);
    expect(repo.get(r.id)!.record.name).toBe(r.name);
    expect((await repo.redo()).ok).toBe(true);
    expect(await fs.exists(path)).toBe(false);
    expect(repo.get(r.id)).toBeUndefined();
  });

  it("a save that writes the same bytes makes no step", async () => {
    const { repo } = await demo();
    const r = polity(repo);
    r.summary = "x";
    await repo.save(r);
    const n = repo.history.past.length;
    await repo.save(structuredClone(repo.record(r.id)!), { touch: false });
    expect(repo.history.past).toHaveLength(n);
  });

  it("an exempt write makes no step", async () => {
    const { repo } = await demo();
    const r = polity(repo);
    r.summary = "seeded";
    await repo.save(r, { history: false }); // history: exempt — testing the opt-out itself
    expect(repo.history.past).toHaveLength(0);
  });

  it("with nothing to undo or redo, says so and writes nothing", async () => {
    const { fs, repo, log } = await demo();
    const before = fs.dump();
    expect(await repo.undo()).toEqual({ ok: false, label: "", refused: [] });
    expect(await repo.redo()).toEqual({ ok: false, label: "", refused: [] });
    expect(fs.dump()).toEqual(before);
    expect(log).toEqual([]);
  });

  it("an editor's consecutive bursts coalesce by origin; another origin does not", async () => {
    const { fs, repo } = await demo();
    const r = polity(repo);
    const path = repo.get(r.id)!.location.path;
    const original = await fs.readText(path);
    r.summary = "a";
    await repo.save(r, { origin: "record-editor:1" });
    r.summary = "ab";
    await repo.save(r, { origin: "record-editor:1" });
    expect(repo.history.past).toHaveLength(1);
    r.summary = "abc";
    await repo.save(r, { origin: "map-settings:x" });
    expect(repo.history.past).toHaveLength(2);
    await repo.undo();
    await repo.undo();
    expect(await fs.readText(path)).toBe(original);
  });
});

describe("transactions", () => {
  it("3 saves + 1 delete undo as one step, and redo as one", async () => {
    const { fs, repo } = await demo();
    const before = vaultFiles(fs);
    const [a, b] = [polity(repo, 0), polity(repo, 1)];
    const doomed = polity(repo, 2);
    const created = repo.create("polity", "Made In Transaction");
    await repo.transaction(
      "BULK TEST (4 records)",
      async (tx) => {
        a.summary = "tx a";
        await tx.save(a);
        b.summary = "tx b";
        await tx.save(b);
        await tx.save(created);
        await tx.delete(doomed.id);
      },
      { snapshot: { cause: SNAPSHOT_CAUSE.bulkDelete, ids: [doomed.id] } },
    );
    const after = vaultFiles(fs);
    expect(repo.history.past).toHaveLength(1);
    const step = repo.history.peekUndo()!;
    expect(step.label).toBe("BULK TEST (4 records)");
    expect(step.entries.map((e) => e.id)).toEqual([a.id, b.id, created.id, doomed.id]);
    // The transaction's snapshot holds the deleted file, so the delete took none of its own.
    const snaps = await repo.snapshots();
    expect(snaps.map((s) => s.cause)).toEqual([SNAPSHOT_CAUSE.bulkDelete]);
    expect(step.snapshot).toBe(snaps[0].id);

    expect((await repo.undo()).ok).toBe(true);
    expect(vaultFiles(fs)).toEqual(before);
    expect(repo.get(doomed.id)).toBeDefined();
    expect(repo.get(created.id)).toBeUndefined();
    expect((await repo.redo()).ok).toBe(true);
    expect(vaultFiles(fs)).toEqual(after);
  });

  it("the same record saved twice in one transaction undoes to the state before the first", async () => {
    const { fs, repo } = await demo();
    const r = polity(repo);
    const path = repo.get(r.id)!.location.path;
    const original = await fs.readText(path);
    await repo.transaction("TWICE", async (tx) => {
      r.summary = "first";
      await tx.save(r);
      r.name = "Second Name";
      r.slug = "second-name";
      await tx.save(r);
    });
    expect(await fs.exists(path)).toBe(false);
    expect((await repo.undo()).ok).toBe(true);
    expect(await fs.readText(path)).toBe(original);
    expect(repo.all().filter((x) => x.record.id === r.id)).toHaveLength(1);
  });

  it("a delete in a transaction without a covering snapshot still snapshots first", async () => {
    const { repo } = await demo();
    const r = polity(repo);
    await repo.transaction("DELETE ONE", (tx) => tx.delete(r.id));
    expect((await repo.snapshots()).map((s) => s.cause)).toEqual([SNAPSHOT_CAUSE.delete]);
  });

  it("writes outside the transaction meanwhile are steps of their own", async () => {
    const { repo } = await demo();
    const [a, b] = [polity(repo, 0), polity(repo, 1)];
    await repo.transaction("OUTER", async (tx) => {
      a.summary = "in tx";
      await tx.save(a);
      b.summary = "autosave, not in tx";
      await repo.save(b);
    });
    expect(repo.history.past.map((s) => [s.label, s.entries.map((e) => e.id)])).toEqual([
      [`EDIT ${b.name.toUpperCase()} — summary`, [b.id]],
      ["OUTER", [a.id]],
    ]);
  });

  it("nesting throws; a finished transaction's handle cannot write", async () => {
    const { repo } = await demo();
    let leaked: Parameters<Parameters<Repository["transaction"]>[1]>[0] | undefined;
    await expect(repo.transaction("OUTER", () => repo.transaction("INNER", async () => undefined))).rejects.toThrow(/Nested transaction/);
    await repo.transaction("DONE", async (tx) => {
      leaked = tx;
    });
    await expect(leaked!.save(polity(repo))).rejects.toThrow(/has finished/);
    expect(repo.history.past).toHaveLength(0);
  });

  it("a transaction that throws part-way keeps what it wrote as an INCOMPLETE step, logs, rethrows", async () => {
    const { fs, repo, log } = await demo();
    const r = polity(repo);
    const path = repo.get(r.id)!.location.path;
    const original = await fs.readText(path);
    await expect(
      repo.transaction("GENERATE", async (tx) => {
        r.summary = "half done";
        await tx.save(r);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(repo.history.peekUndo()!.label).toBe("GENERATE — INCOMPLETE");
    expect(log.map((l) => [l.severity, l.source, l.message])).toEqual([["violation", "history", "GENERATE — INCOMPLETE"]]);
    expect((await repo.undo()).ok).toBe(true);
    expect(await fs.readText(path)).toBe(original);
  });

  it("regenerates the CSV once per transaction and once per apply, not per entry", async () => {
    const { repo } = await demo();
    const rs = [0, 1, 2].map((i) => polity(repo, i));
    const csv = vi.spyOn(repo, "writeCsv");
    await repo.transaction("THREE", async (tx) => {
      for (const r of rs) {
        r.summary = "csv";
        await tx.save(r);
      }
    });
    expect(csv).toHaveBeenCalledTimes(1);
    csv.mockClear();
    await repo.undo();
    expect(csv).toHaveBeenCalledTimes(1);
    csv.mockClear();
    await repo.redo();
    expect(csv).toHaveBeenCalledTimes(1);
  });
});

describe("the external-change rule (§1.5)", () => {
  it("a file changed on disk: undo is refused, the file untouched, the stacks unchanged", async () => {
    const { fs, repo, log } = await demo();
    const r = polity(repo);
    const path = repo.get(r.id)!.location.path;
    r.summary = "ours";
    await repo.save(r);
    await fs.writeText(path, "external edit\n");
    const dump = fs.dump();
    const s = stacks(repo);

    const res = await repo.undo();
    expect(res).toEqual({ ok: false, label: repo.history.peekUndo()!.label, refused: [{ path, reason: "changed on disk" }] });
    expect(fs.dump()).toEqual(dump);
    expect(stacks(repo)).toEqual(s);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ severity: "caution", source: "history", message: `UNDO REFUSED — ${path} CHANGED ON DISK`, detail: { path } });
    expect(log[0].detail!.note).toMatch(/Reload to see the change; the step stays available\.$/);
  });

  it("the same for redo", async () => {
    const { fs, repo } = await demo();
    const r = polity(repo);
    const path = repo.get(r.id)!.location.path;
    r.summary = "ours";
    await repo.save(r);
    await repo.undo();
    await fs.writeText(path, "external edit\n");
    const dump = fs.dump();
    const s = stacks(repo);
    const res = await repo.redo();
    expect(res.ok).toBe(false);
    expect(fs.dump()).toEqual(dump);
    expect(stacks(repo)).toEqual(s);
  });

  it("one changed file refuses the whole step: nothing else in it is written", async () => {
    const { fs, repo } = await demo();
    const [a, b] = [polity(repo, 0), polity(repo, 1)];
    await repo.transaction("PAIR", async (tx) => {
      a.summary = "pair";
      await tx.save(a);
      b.summary = "pair";
      await tx.save(b);
    });
    await fs.writeText(repo.get(b.id)!.location.path, "external\n");
    const dump = fs.dump();
    expect((await repo.undo()).ok).toBe(false);
    expect(fs.dump()).toEqual(dump);
  });

  it("a deleted file came back meanwhile: undoing the delete is refused", async () => {
    const { fs, repo } = await demo();
    const r = polity(repo);
    const path = repo.get(r.id)!.location.path;
    await repo.delete(r.id);
    await fs.writeText(path, "someone put a file here\n");
    const res = await repo.undo();
    expect(res.ok).toBe(false);
    expect(await fs.readText(path)).toBe("someone put a file here\n");
  });

  it("a file removed on disk counts as changed; the refusal names the step's snapshot", async () => {
    const { fs, repo, log } = await demo();
    const r = polity(repo);
    await repo.transaction("SNAPPED", async (tx) => {
      r.summary = "x";
      await tx.save(r);
    }, { snapshot: { cause: "Before test", ids: [r.id] } });
    const path = repo.get(r.id)!.location.path;
    await fs.remove(path);
    const res = await repo.undo();
    expect(res).toMatchObject({ ok: false, refused: [{ path, reason: "missing or unreadable" }] });
    const step = repo.history.peekUndo()!;
    expect(step.snapshot).toBeDefined();
    expect(log[0].detail!.note).toContain(`The pre-change files are in snapshot ${step.snapshot}.`);
  });

  it("an I/O error part-way logs the files written, rethrows, and leaves the step to retry", async () => {
    const inner = new MemoryAdapter();
    await demoVault(inner);
    let failRemove = false;
    const flaky = new Proxy(inner, {
      get(t, k, rcv) {
        if (k === "remove") return async (p: string) => (failRemove ? Promise.reject(new Error("locked")) : t.remove(p));
        return Reflect.get(t, k, rcv);
      },
    });
    const repo = new Repository(flaky);
    await repo.init();
    await repo.load();
    const log: LogInput[] = [];
    repo.onLog = (l) => log.push(l);
    const a = polity(repo, 0);
    const created = repo.create("polity", "Undo Removes Me");
    await repo.transaction("TWO", async (tx) => {
      a.summary = "written";
      await tx.save(a);
      await tx.save(created);
    });
    failRemove = true;
    await expect(repo.undo()).rejects.toThrow("locked");
    expect(repo.history.peekUndo()!.label).toBe("TWO");
    expect(log.at(-1)).toMatchObject({ severity: "violation", source: "history", message: "UNDO FAILED PART-WAY — TWO" });
    expect(log.at(-1)!.detail!.components).toEqual([]); // the create's file is removed first (reverse order), and that failed
    expect(repo.record(a.id)!.summary).toBe("written"); // nothing after the failure was applied
    failRemove = false;
    expect((await repo.undo()).ok).toBe(true); // and the step can be retried
  });
});

describe("migration, reload, restore", () => {
  it("first save of a migrated record → undo restores the unmigrated text", async () => {
    const fs = new MemoryAdapter();
    await demoVault(fs);
    const repo = new Repository(fs);
    await repo.init();
    const v1: TypedRecord = {
      id: "h-v1",
      type: "hull",
      name: "Old Hull",
      slug: "old-hull",
      tags: [],
      aliases: [],
      links: [],
      assets: [],
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
      fields: { hull_class: "DD", length_m: 220, beam_m: 30, volume_m3: 60000, slots: [{ id: "drive", kind: "drive", count: 1, x: 5, y: 50 }] },
    };
    await repo.load();
    const path = repo.pathFor(v1);
    const original = serializeRecord(v1, "yaml");
    await fs.writeText(path, original);
    await repo.load();
    expect(repo.get("h-v1")!.migrated).toBeDefined();

    await repo.save(structuredClone(repo.record("h-v1")!));
    expect(await fs.readText(path)).not.toBe(original);
    expect((await repo.undo()).ok).toBe(true);
    expect(await fs.readText(path)).toBe(original);
  });

  it("reload keeps the history, and a step still applies after it", async () => {
    const { fs, repo } = await demo();
    const r = polity(repo);
    const path = repo.get(r.id)!.location.path;
    const original = await fs.readText(path);
    r.summary = "before reload";
    await repo.save(r);
    const v = repo.version(r.id);
    await repo.load();
    expect(repo.history.past).toHaveLength(1);
    expect(repo.version(r.id)).toBe(v); // nothing changed on disk
    expect((await repo.undo()).ok).toBe(true);
    expect(await fs.readText(path)).toBe(original);
  });

  it("reload bumps the version of a record changed on disk", async () => {
    const { fs, repo } = await demo();
    const r = polity(repo);
    const v = repo.version(r.id);
    const path = repo.get(r.id)!.location.path;
    await fs.writeText(path, (await fs.readText(path)).replace(/^name: .*$/m, "name: Changed Outside"));
    await repo.load();
    expect(repo.version(r.id)).toBe(v + 1);
  });

  it("a snapshot restore is one undoable step: undo returns the record files to before the restore", async () => {
    const { fs, repo } = await demo();
    const [a, b] = [polity(repo, 0), polity(repo, 1)];
    const snap = (await repo.snapshot("Test", [a.id, b.id]))!;
    a.summary = "edited after snapshot";
    await repo.save(a);
    b.name = "Moved After Snapshot";
    b.slug = "moved-after-snapshot";
    await repo.save(b);
    const edited = recordFiles(fs);

    const result = await repo.restoreSnapshot(snap.id);
    const restored = recordFiles(fs);
    expect(restored).not.toEqual(edited);
    const step = repo.history.peekUndo()!;
    expect(step.label).toBe(`RESTORE SNAPSHOT ${snap.id}`);
    expect(step.snapshot).toBe(result.safety!.id);
    expect(step.entries.map((e) => e.id).sort()).toEqual([a.id, b.id].sort());

    expect((await repo.undo()).ok).toBe(true);
    expect(recordFiles(fs)).toEqual(edited);
    expect(repo.record(b.id)!.name).toBe("Moved After Snapshot");
    expect((await repo.redo()).ok).toBe(true);
    expect(recordFiles(fs)).toEqual(restored);
  });
});

describe("review follow-ups", () => {
  it("F4: a record edited in place (the map drag) still undoes byte-identically", async () => {
    const { fs, repo } = await demo();
    const lr = repo.get(polity(repo).id)!;
    const original = await fs.readText(lr.location.path);
    (lr.record as TypedRecord).fields.map_test = 42; // mutate the live record, as SystemMap does
    await repo.save(lr.record, { label: "MOVE TEST" });
    expect(repo.history.peekUndo()!.label).toBe("MOVE TEST");
    expect((await repo.undo()).ok).toBe(true);
    expect(await fs.readText(lr.location.path)).toBe(original);
    expect((repo.record(lr.record.id) as TypedRecord).fields.map_test).toBeUndefined();
  });

  it("refuses to undo a rename when the old path is taken, a create edited on disk, or a delete whose record is back", async () => {
    const { fs, repo } = await demo();
    const r = polity(repo, 0);
    const oldPath = repo.get(r.id)!.location.path;
    r.name = "Moved Away";
    r.slug = "moved-away";
    await repo.save(r);
    await fs.writeText(oldPath, "someone else\n");
    expect(await repo.undo()).toMatchObject({ ok: false, refused: [{ path: oldPath, reason: "a file is already there" }] });

    const { fs: fs2, repo: repo2 } = await demo();
    const c = repo2.create("polity", "Fresh");
    const { location } = await repo2.save(c);
    await fs2.writeText(location.path, "edited\n");
    expect(await repo2.undo()).toMatchObject({ ok: false, refused: [{ path: location.path, reason: "changed on disk" }] });

    const { fs: fs3, repo: repo3 } = await demo();
    const d = polity(repo3, 1);
    const dPath = repo3.get(d.id)!.location.path;
    const dText = await fs3.readText(dPath);
    await repo3.delete(d.id);
    const elsewhere = dPath.replace(/[^/]+$/, "copied-back.polity.yaml");
    await fs3.writeText(elsewhere, dText); // the same record, under another name
    await repo3.load();
    expect(await repo3.undo()).toMatchObject({ ok: false, refused: [{ path: dPath, reason: "the record is loaded again" }] });
    expect(await fs3.exists(dPath)).toBe(false);
  });

  it("refuses to redo a transaction when one of its files changed, stacks unchanged", async () => {
    const { fs, repo } = await demo();
    const [a, b] = [polity(repo, 0), polity(repo, 1)];
    await repo.transaction("PAIR", async (tx) => {
      a.summary = "a";
      await tx.save(a);
      b.summary = "b";
      await tx.save(b);
    });
    await repo.undo();
    await fs.writeText(repo.get(a.id)!.location.path, "external\n");
    const dump = fs.dump();
    const s = stacks(repo);
    expect((await repo.redo()).ok).toBe(false);
    expect(fs.dump()).toEqual(dump);
    expect(stacks(repo)).toEqual(s);
  });

  it("a step stopped part-way by an I/O error resumes on retry without re-checking what it already wrote", async () => {
    const inner = new MemoryAdapter();
    await demoVault(inner);
    let failRemove = false;
    const flaky = new Proxy(inner, {
      get(t, k, rcv) {
        if (k === "remove") return async (p: string) => (failRemove ? Promise.reject(new Error("locked")) : t.remove(p));
        return Reflect.get(t, k, rcv);
      },
    });
    const repo = new Repository(flaky);
    await repo.init();
    await repo.load();
    const log: LogInput[] = [];
    repo.onLog = (l) => log.push(l);
    const created = repo.create("polity", "Made First");
    const a = polity(repo, 0);
    const aPath = repo.get(a.id)!.location.path;
    const aText = await inner.readText(aPath);
    await repo.transaction("TWO", async (tx) => {
      await tx.save(created);
      a.summary = "second";
      await tx.save(a);
    });
    const createdPath = repo.get(created.id)!.location.path;
    failRemove = true;
    await expect(repo.undo()).rejects.toThrow("locked"); // undo runs a's edit first, then the create
    expect(log.at(-1)!.detail!.components).toEqual([aPath]);
    expect(await inner.readText(aPath)).toBe(aText);
    failRemove = false;
    expect((await repo.undo()).ok).toBe(true);
    expect(await inner.exists(createdPath)).toBe(false);
    expect(await inner.readText(aPath)).toBe(aText);
    expect(repo.history.peekRedo()!.label).toBe("TWO");
    expect((await repo.redo()).ok).toBe(true);
    expect(await inner.exists(createdPath)).toBe(true);
  });

  it("a save made while an undo is being written waits for it, and is never clobbered", async () => {
    const inner = new MemoryAdapter();
    await demoVault(inner);
    let hold: Promise<void> | null = null;
    let entered!: () => void;
    const reached = new Promise<void>((r) => (entered = r));
    const slow = new Proxy(inner, {
      get(t, k, rcv) {
        if (k === "writeText")
          return async (p: string, c: string) => {
            if (hold && !p.startsWith("_")) {
              const h = hold;
              hold = null;
              entered();
              await h;
            }
            return t.writeText(p, c);
          };
        return Reflect.get(t, k, rcv);
      },
    });
    const repo = new Repository(slow);
    await repo.init();
    await repo.load();
    const r = polity(repo);
    const path = repo.get(r.id)!.location.path;
    r.summary = "first";
    await repo.save(r);
    let release!: () => void;
    hold = new Promise<void>((res) => (release = res));
    const undoing = repo.undo();
    await reached; // the undo passed its preflight and is writing
    const fresh = structuredClone(r);
    fresh.summary = "typed during the undo";
    const saving = repo.save(fresh);
    await new Promise((res) => setTimeout(res, 10));
    release();
    expect((await undoing).ok).toBe(true);
    await saving;
    expect(await inner.readText(path)).toContain("typed during the undo");
    expect(repo.history.past).toHaveLength(1); // the fresh save, on top of the undone state
    expect(repo.history.future).toHaveLength(0); // a new step clears redo
    expect((await repo.undo()).ok).toBe(true); // …and it undoes cleanly to the pre-"first" file
  });

  it("two quick undos apply two steps, one after the other", async () => {
    const { fs, repo } = await demo();
    const r = polity(repo);
    const path = repo.get(r.id)!.location.path;
    const original = await fs.readText(path);
    r.summary = "one";
    await repo.save(r);
    r.tags = [...r.tags, "two"];
    await repo.save(r);
    const [x, y] = await Promise.all([repo.undo(), repo.undo()]);
    expect([x.ok, y.ok]).toEqual([true, true]);
    expect(await fs.readText(path)).toBe(original);
    expect(repo.history.future).toHaveLength(2);
  });

  it("an editor's next burst does not fold over an external edit picked up by a reload", async () => {
    const { fs, repo } = await demo();
    const r = polity(repo);
    const path = repo.get(r.id)!.location.path;
    r.summary = "a";
    await repo.save(r, { origin: "ed" });
    await fs.writeText(path, (await fs.readText(path)).replace(/^name: .*$/m, "name: Outside Edit"));
    await repo.load();
    const again = structuredClone(repo.record(r.id)!) as TypedRecord;
    again.summary = "ab";
    await repo.save(again, { origin: "ed" });
    expect(repo.history.past).toHaveLength(2);
    await repo.undo();
    expect(repo.record(r.id)!.name).toBe("Outside Edit");
  });

  it("a transaction's own delete snapshot is named on its step when it has none of its own", async () => {
    const { repo } = await demo();
    const r = polity(repo);
    await repo.transaction("DELETE ONE", (tx) => tx.delete(r.id));
    const [snap] = await repo.snapshots();
    expect(repo.history.peekUndo()!.snapshot).toBe(snap.id);
  });

  it("a restore that fails part-way keeps what it wrote as an INCOMPLETE step, and memory follows the disk", async () => {
    const inner = new MemoryAdapter();
    await demoVault(inner);
    let failOn: string | undefined;
    const flaky = new Proxy(inner, {
      get(t, k, rcv) {
        if (k === "writeText") return async (p: string, c: string) => (p === failOn ? Promise.reject(new Error("disk full")) : t.writeText(p, c));
        return Reflect.get(t, k, rcv);
      },
    });
    const repo = new Repository(flaky);
    await repo.init();
    await repo.load();
    const log: LogInput[] = [];
    repo.onLog = (l) => log.push(l);
    const [a, b] = [polity(repo, 0), polity(repo, 1)];
    const snap = (await repo.snapshot("Test", [a.id, b.id]))!;
    const aOriginal = await inner.readText(repo.get(a.id)!.location.path);
    a.summary = "edited";
    await repo.save(a);
    b.summary = "edited";
    await repo.save(b);
    failOn = snap.files[1].path; // the second file restored
    await expect(repo.restoreSnapshot(snap.id)).rejects.toThrow("disk full");
    const step = repo.history.peekUndo()!;
    expect(step.label).toBe(`RESTORE SNAPSHOT ${snap.id} — INCOMPLETE`);
    expect(step.entries.map((e) => e.id)).toEqual([snap.files[0].id]);
    expect(log.at(-1)).toMatchObject({ severity: "violation", message: `RESTORE SNAPSHOT ${snap.id} — INCOMPLETE` });
    const restoredId = snap.files[0].id!;
    expect(await inner.readText(repo.get(restoredId)!.location.path)).toBe(restoredId === a.id ? aOriginal : await inner.readText(snap.files[0].path));
    expect(repo.record(restoredId)!.summary).not.toBe("edited");
  });
});


describe("a save never writes over another file (S1c-fix)", () => {
  it("renaming onto another record's slug leaves that file byte-identical and saves as <slug>-2; undo restores the original path", async () => {
    const { fs, repo, log } = await demo();
    const [a, b] = [polity(repo, 0), polity(repo, 1)];
    const aPath = repo.get(a.id)!.location.path;
    const aText = await fs.readText(aPath);
    const bPath = repo.get(b.id)!.location.path;
    const bText = await fs.readText(bPath);

    a.slug = b.slug;
    const saved = await repo.save(a);
    const newPath = bPath.replace(`${b.slug}.`, `${b.slug}-2.`);
    expect(saved.collision).toEqual({ slug: b.slug, path: bPath });
    expect(saved.record.slug).toBe(`${b.slug}-2`);
    expect(saved.location.path).toBe(newPath);
    expect(await fs.readText(bPath)).toBe(bText);
    expect(repo.get(b.id)!.location.path).toBe(bPath);
    expect(await fs.exists(aPath)).toBe(false);
    expect(log).toContainEqual(expect.objectContaining({ severity: "caution", source: "record", message: `SLUG TAKEN — ${b.slug} → ${b.slug}-2`, detail: expect.objectContaining({ path: bPath }) }));

    expect((await repo.undo()).ok).toBe(true);
    expect(await fs.readText(aPath)).toBe(aText);
    expect(await fs.exists(newPath)).toBe(false);
    expect(await fs.readText(bPath)).toBe(bText);
    expect(repo.get(a.id)!.location.path).toBe(aPath);
    expect(repo.get(b.id)!.location.path).toBe(bPath);

    expect((await repo.redo()).ok).toBe(true);
    expect(repo.get(a.id)!.location.path).toBe(newPath);
    expect(await fs.readText(bPath)).toBe(bText);
  });

  it("a later save asking for the taken slug again stays at <slug>-2 rather than moving to -3", async () => {
    const { repo } = await demo();
    const [a, b] = [polity(repo, 0), polity(repo, 1)];
    a.slug = b.slug;
    const first = await repo.save(a);
    const again = structuredClone(first.record) as TypedRecord;
    again.slug = b.slug;
    again.summary = "again";
    const second = await repo.save(again);
    expect(second.location.path).toBe(first.location.path);
    expect(second.record.slug).toBe(`${b.slug}-2`);
  });

  it("a create onto an existing file that did not load does not overwrite it, even in another case; undo leaves it", async () => {
    const { fs, repo } = await demo();
    const c = repo.create("polity", "Fresh");
    const path = repo.pathFor(c);
    const upper = path.replace(/[^/]+$/, (n) => n.toUpperCase());
    await fs.writeText(upper, "not: [a record\n");
    const saved = await repo.save(c);
    expect(saved.collision).toEqual({ slug: "fresh", path });
    expect(saved.location.path).toBe(repo.pathFor({ ...c, slug: "fresh-2" }));
    expect(await fs.readText(upper)).toBe("not: [a record\n");
    expect(await fs.exists(path)).toBe(false);

    expect((await repo.undo()).ok).toBe(true);
    expect(await fs.readText(upper)).toBe("not: [a record\n");
    expect(await fs.exists(saved.location.path)).toBe(false);
  });

  it("skips a free file whose slug another record of the type holds, as uniqueSlug does", async () => {
    const { fs, repo } = await demo();
    const [a, b] = [polity(repo, 0), polity(repo, 1)];
    const bPath = repo.get(b.id)!.location.path;
    b.slug = "taken-2";
    // b's file is json, so `taken-2.polity.yaml` is free on disk but its slug is held
    await fs.writeText(bPath.replace(/[^/]+$/, "taken-2.polity.json"), serializeRecord(b, "json"));
    await fs.remove(bPath);
    await fs.writeText(bPath.replace(/[^/]+$/, "taken.polity.yaml"), "stray\n");
    await repo.load();
    a.slug = "taken";
    const saved = await repo.save(a);
    expect(saved.record.slug).toBe("taken-3");
  });

  it("a slug another record of the type holds in another format counts as taken", async () => {
    const { fs, repo } = await demo();
    const [a, b] = [polity(repo, 0), polity(repo, 1)];
    const bPath = repo.get(b.id)!.location.path;
    const jsonPath = bPath.replace(/\.yaml$/, ".json");
    await fs.writeText(jsonPath, serializeRecord(b, "json"));
    await fs.remove(bPath);
    await repo.load();
    a.slug = b.slug;
    const saved = await repo.save(a);
    expect(saved.collision).toEqual({ slug: b.slug, path: jsonPath });
    expect(saved.record.slug).toBe(`${b.slug}-2`);
  });

  it("a case-only rename onto another record's file is a collision on a case-sensitive disk", async () => {
    const { fs, repo } = await demo();
    const [a, b] = [polity(repo, 0), polity(repo, 1)];
    b.slug = "shared";
    const bPath = (await repo.save(b)).location.path;
    const bText = await fs.readText(bPath);
    const aPath = repo.get(a.id)!.location.path;
    a.slug = "Shared";
    const upper = bPath.replace("shared.", "Shared.");
    await fs.writeText(upper, serializeRecord(a, "yaml"));
    await fs.remove(aPath);
    await repo.load();
    expect(repo.get(a.id)!.location.path).toBe(upper);

    a.slug = "shared";
    const saved = await repo.save(a);
    expect(saved.record.slug).toBe("shared-2");
    expect(await fs.readText(bPath)).toBe(bText);
  });

  it("two new records with one slug in one transaction: the second takes -2; one undo removes both", async () => {
    const { fs, repo } = await demo();
    const [n1, n2] = [repo.createNote("Twin"), repo.createNote("Twin")];
    expect(n2.slug).toBe(n1.slug); // neither saved yet
    await repo.transaction("TWINS", async (tx) => {
      await tx.save(n1);
      await tx.save(n2);
    });
    expect(n2.slug).toBe("twin-2");
    const paths = [repo.get(n1.id)!.location.path, repo.get(n2.id)!.location.path];
    expect(paths).toEqual(["notes/twin.opml", "notes/twin-2.opml"]);
    expect((await repo.undo()).ok).toBe(true);
    for (const p of paths) expect(await fs.exists(p)).toBe(false);
  });

  it("a collision whose write then fails leaves the slug as asked", async () => {
    const { fs, repo } = await demo();
    const [a, b] = [polity(repo, 0), polity(repo, 1)];
    const aPath = repo.get(a.id)!.location.path;
    const aText = await fs.readText(aPath);
    vi.spyOn(fs, "writeText").mockRejectedValueOnce(new Error("EIO"));
    a.slug = b.slug;
    await expect(repo.save(a)).rejects.toThrow("EIO");
    expect(a.slug).toBe(b.slug);
    expect(await fs.readText(aPath)).toBe(aText);
  });

  it("a failed fs.rename falls back to write-then-remove; the file is never lost", async () => {
    const { fs, repo } = await demo();
    const r = polity(repo);
    const oldPath = repo.get(r.id)!.location.path;
    const oldText = await fs.readText(oldPath);
    vi.spyOn(fs, "rename").mockRejectedValue(new Error("EBUSY"));

    // The write fails too: the old file is untouched and the record still points at it.
    const write = vi.spyOn(fs, "writeText").mockRejectedValueOnce(new Error("EIO"));
    r.slug = "moved-once";
    await expect(repo.save(r)).rejects.toThrow("EIO");
    expect(await fs.readText(oldPath)).toBe(oldText);
    expect(repo.get(r.id)!.location.path).toBe(oldPath);
    write.mockRestore();

    // The write succeeds: new file written, old one removed only then; undo puts it back.
    const saved = await repo.save(r);
    expect(saved.location.path).not.toBe(oldPath);
    expect(await fs.exists(saved.location.path)).toBe(true);
    expect(await fs.exists(oldPath)).toBe(false);
    expect((await repo.undo()).ok).toBe(true);
    expect(await fs.readText(oldPath)).toBe(oldText);
    expect(await fs.exists(saved.location.path)).toBe(false);
  });

  it("a rename that succeeds but whose write then fails is moved back", async () => {
    const { fs, repo } = await demo();
    const r = polity(repo);
    const oldPath = repo.get(r.id)!.location.path;
    const oldText = await fs.readText(oldPath);
    vi.spyOn(fs, "writeText").mockRejectedValueOnce(new Error("EIO"));
    r.slug = "moved-back";
    await expect(repo.save(r)).rejects.toThrow("EIO");
    expect(await fs.readText(oldPath)).toBe(oldText);
    expect(await fs.exists(repo.pathFor(r))).toBe(false);
  });
});
