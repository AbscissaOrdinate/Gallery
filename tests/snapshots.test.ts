import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { Repository } from "../src/core/repo";
import { MemoryAdapter } from "../src/core/storage/memory";
import { demoVault } from "../src/ui/demo";
import { SNAPSHOT_CAUSE, SnapshotWriter, isSafeVaultPath, listSnapshots, readManifest, snapshotBytes, takeSnapshot } from "../src/core/snapshots";
import { BUILTIN_SCHEMAS } from "../src/core/schema/builtin/schemas";
import { sameValue } from "../src/core/equal";
import { SpyAdapter } from "./helpers/spyAdapter";

/** The vault as a path → text map, without the snapshots themselves. */
const vaultFiles = (fs: MemoryAdapter) => Object.fromEntries(Object.entries(fs.dump()).filter(([p]) => !p.startsWith("_snapshots/")));
const fixedClock = (iso: string) => () => new Date(iso);

async function demo() {
  const fs = new MemoryAdapter();
  await demoVault(fs);
  const repo = new Repository(fs);
  await repo.init();
  await repo.load();
  return { fs, repo };
}

describe("snapshot service", () => {
  it("writes a manifest and byte-exact copies under _snapshots/<id>/", async () => {
    const fs = new MemoryAdapter({ "a/one.txt": "héllo\r\nworld\n", "a/two.txt": "2" });
    const m = (await takeSnapshot(fs, "Testing", [{ path: "a/one.txt", id: "r1" }, { path: "a/two.txt" }, { path: "a/missing.txt" }], ["r1"], fixedClock("2026-09-29T14:03:22.123Z")))!;
    expect(m.id).toBe("2026-09-29T14-03-22-123Z"); // no colon: Windows-safe
    expect(m.cause).toBe("Testing");
    expect(m.files).toEqual([
      { path: "a/one.txt", bytes: 14, id: "r1" }, // é is two bytes
      { path: "a/two.txt", bytes: 1 },
    ]);
    expect(snapshotBytes(m)).toBe(15);
    expect(await fs.readText(`_snapshots/${m.id}/files/a/one.txt`)).toBe("héllo\r\nworld\n");
    expect(await readManifest(fs, m.id)).toEqual(m);
  });

  it("a failed first copy leaves no snapshot id behind", async () => {
    const inner = new MemoryAdapter({ "x.txt": "x" });
    const failing = new Proxy(inner, {
      get(t, k, r) {
        if (k === "writeText") return async () => Promise.reject(new Error("disk full"));
        return Reflect.get(t, k, r);
      },
    });
    const w = new SnapshotWriter(failing, "Doomed");
    await expect(w.capture("x.txt")).rejects.toThrow("disk full");
    expect(w.id).toBeUndefined();
    expect(w.result).toBeUndefined();
    expect(await listSnapshots(inner)).toEqual([]);
  });

  it("creates nothing when there is nothing to copy", async () => {
    const fs = new MemoryAdapter({ "x.txt": "x" });
    expect(await takeSnapshot(fs, "Nothing", [{ path: "nope.txt" }])).toBeUndefined();
    expect(await fs.exists("_snapshots")).toBe(false);
  });

  it("gives two snapshots in the same millisecond different ids", async () => {
    const fs = new MemoryAdapter({ "x.txt": "x" });
    const clock = fixedClock("2026-09-29T14:03:22.123Z");
    const a = await takeSnapshot(fs, "A", [{ path: "x.txt" }], [], clock);
    const b = await takeSnapshot(fs, "B", [{ path: "x.txt" }], [], clock);
    expect([a!.id, b!.id]).toEqual(["2026-09-29T14-03-22-123Z", "2026-09-29T14-03-22-123Z-2"]);
    expect((await listSnapshots(fs)).map((m) => m.cause)).toEqual(["B", "A"]); // newest first
  });

  it("never snapshots inside _snapshots/ or outside the vault", async () => {
    expect(["a/b.yaml", "gallery.config.yaml", "_schemas/x.json"].every(isSafeVaultPath)).toBe(true);
    for (const bad of ["", "/etc/passwd", "../x", "a/../../x", "a\\b", "C:/x", "_snapshots/x/manifest.json", "_Snapshots/x/manifest.json", "a//b", "./a"]) expect(isSafeVaultPath(bad), bad).toBe(false);
    const fs = new MemoryAdapter({ "_snapshots/old/manifest.json": "{}" });
    const w = new SnapshotWriter(fs, "x");
    expect(await w.capture("_snapshots/old/manifest.json")).toBe(false);
  });

  it("ignores a folder that is not a snapshot and rejects a manifest that points outside the vault", async () => {
    const fs = new MemoryAdapter({ "x.txt": "x" });
    const m = (await takeSnapshot(fs, "Real", [{ path: "x.txt" }]))!;
    await fs.writeText("_snapshots/junk/readme.txt", "hi");
    await fs.writeText(`_snapshots/evil/manifest.json`, JSON.stringify({ version: 1, id: "evil", at: "2026-01-01T00:00:00.000Z", cause: "x", ids: [], files: [{ path: "../outside.txt", bytes: 1 }] }));
    expect((await listSnapshots(fs)).map((s) => s.id)).toEqual([m.id]);
    await expect(readManifest(fs, "evil")).rejects.toThrow(/malformed/);
    await expect(readManifest(fs, "../x")).rejects.toThrow(/not a snapshot id/);
  });
});

describe("repository snapshots", () => {
  it("snapshot → restore is byte-identical on the demo vault", async () => {
    const { fs, repo } = await demo();
    const before = vaultFiles(fs);
    const ids = repo.all().map((r) => r.record.id);
    expect(ids.length).toBeGreaterThan(20);
    const snap = (await repo.snapshot("Round trip", ids, { paths: ["gallery.config.yaml", "_index.csv"] }))!;
    expect(snap.files.length).toBe(ids.length + 2);

    // Wreck the vault: edit some records, delete others, damage the config.
    const some = repo.all().map((r) => r.record);
    for (const r of some.slice(0, 5)) {
      r.name += " (edited)";
      await repo.save(r);
    }
    for (const r of some.slice(5, 12)) await repo.delete(r.id, { snapshot: false });
    await repo.saveConfig({ name: "Wrecked" });
    expect(vaultFiles(fs)).not.toEqual(before);

    const result = await repo.restoreSnapshot(snap.id);
    expect(result.safety?.cause).toBe(SNAPSHOT_CAUSE.restore(snap.id));
    expect(vaultFiles(fs)).toEqual(before);
    expect(repo.all().length).toBe(ids.length);
    // The restore itself was snapshotted first, and holds the wrecked state.
    const safety = result.safety!;
    expect(YAML.parse(await fs.readText(`_snapshots/${safety.id}/files/gallery.config.yaml`)).name).toBe("Wrecked");
  });

  it("restoring a record renamed since moves it back instead of duplicating it", async () => {
    const { fs, repo } = await demo();
    const target = repo.ofType("polity")[0].record;
    const oldPath = repo.get(target.id)!.location.path;
    const snap = (await repo.snapshot("Before rename", [target.id]))!;
    target.name = "Renamed Beyond Recognition";
    target.slug = "renamed-beyond-recognition";
    await repo.save(target);
    const newPath = repo.get(target.id)!.location.path;
    expect(newPath).not.toBe(oldPath);

    const r = await repo.restoreSnapshot(snap.id);
    expect(r.removed).toEqual([newPath]);
    expect(await fs.exists(newPath)).toBe(false);
    expect(repo.get(target.id)!.location.path).toBe(oldPath);
    expect((await repo.load()).problems).toEqual([]);
    expect(repo.all().filter((x) => x.record.id === target.id)).toHaveLength(1);
  });

  it("restore refuses, changing nothing, when the old path now holds a different record", async () => {
    const { fs, repo } = await demo();
    const x = repo.ofType("polity")[0].record;
    const path = repo.get(x.id)!.location.path;
    await repo.delete(x.id); // takes the "Before delete" snapshot
    const [snap] = await repo.snapshots();
    const y = repo.create("polity", x.name); // same name, so the same slug and path
    await repo.save(y);
    expect(repo.get(y.id)!.location.path).toBe(path);
    const before = vaultFiles(fs);
    await expect(repo.restoreSnapshot(snap.id)).rejects.toThrow(/now holds .* a different record/);
    expect(vaultFiles(fs)).toEqual(before);
    expect(repo.get(y.id)).toBeDefined();
  });

  it("restore works out which record a file holds from its copy, not from the manifest", async () => {
    const { fs, repo } = await demo();
    const [a, b] = repo.ofType("polity");
    const snap = (await repo.snapshot("Real", [a.record.id]))!;
    // A doctored manifest claims the copy holds record b.
    const m = JSON.parse(await fs.readText(`_snapshots/${snap.id}/manifest.json`));
    m.files[0].id = b.record.id;
    await fs.writeText(`_snapshots/${snap.id}/manifest.json`, JSON.stringify(m));
    a.record.name = "Edited";
    await repo.save(a.record);
    const r = await repo.restoreSnapshot(snap.id);
    expect(r.removed).toEqual([]);
    expect(await fs.exists(b.location.path)).toBe(true);
  });

  it("restore refuses a snapshot with a missing copy and changes nothing", async () => {
    const { fs, repo } = await demo();
    const a = repo.ofType("polity")[0];
    const b = repo.ofType("polity")[1];
    const snap = (await repo.snapshot("Two", [a.record.id, b.record.id]))!;
    await fs.remove(`_snapshots/${snap.id}/files/${snap.files[1].path}`);
    a.record.name = "Changed";
    await repo.save(a.record);
    const dirty = vaultFiles(fs);
    await expect(repo.restoreSnapshot(snap.id)).rejects.toThrow();
    expect(vaultFiles(fs)).toEqual(dirty);
  });

  it("delete snapshots the file first (cause 'Before delete') unless told the caller already did", async () => {
    const { fs, repo } = await demo();
    const seen: string[] = [];
    repo.onSnapshot = (m) => seen.push(m.cause);
    const [a, b] = repo.ofType("polity");
    const path = a.location.path;
    const text = await fs.readText(path);
    await repo.delete(a.record.id);
    expect(seen).toEqual([SNAPSHOT_CAUSE.delete]);
    const [snap] = await repo.snapshots();
    expect(snap.ids).toEqual([a.record.id]);
    expect(await fs.readText(`_snapshots/${snap.id}/files/${path}`)).toBe(text);

    await repo.delete(b.record.id, { snapshot: false });
    expect(seen).toHaveLength(1);
    // Restoring brings the deleted record back.
    await repo.restoreSnapshot(snap.id);
    expect(repo.get(a.record.id)).toBeDefined();
  });

  it("does not load _snapshots/ as records", async () => {
    const { repo } = await demo();
    const n = repo.all().length;
    await repo.snapshot("Copy", repo.all().map((r) => r.record.id));
    const stats = await repo.load();
    expect(stats.records).toBe(n);
    expect(stats.problems).toEqual([]);
  });
});

/** Older on-disk state: a schema below the built-in version and a config missing the seeded keys. */
async function oldVault(spy: SpyAdapter) {
  await new Repository(spy).init();
  const hull = BUILTIN_SCHEMAS.find((s) => s.id === "hull")!;
  await spy.writeText("_schemas/hull.schema.json", JSON.stringify({ id: "hull", version: 1, title: "Hull", folder: "hulls", fields: { type: "object", properties: {} } }));
  const cfg = YAML.parse(await spy.readText("gallery.config.yaml"));
  delete cfg.polityPalette;
  delete cfg.handling;
  await spy.writeText("gallery.config.yaml", YAML.stringify(cfg));
  expect(hull.version).toBeGreaterThan(1);
}

describe("opening a vault (F2)", () => {
  it("creating a fresh vault needs no snapshot", async () => {
    const spy = new SpyAdapter();
    const report = await new Repository(spy).init();
    expect(report).toEqual({ snapshot: undefined, rewritten: [], skipped: [] });
    expect(await spy.exists("_snapshots")).toBe(false);
    expect(spy.writes.length).toBeGreaterThan(20); // it did create the seed files
  });

  it("an up-to-date vault: opening twice writes nothing the second time", async () => {
    const spy = new SpyAdapter();
    await new Repository(spy).init();
    spy.reset();
    const again = new Repository(spy);
    const report = await again.init();
    await again.load();
    expect(spy.writes).toEqual([]);
    expect(report.rewritten).toEqual([]);
  });

  it("overwriting an existing file snapshots it first, cause 'Before vault upgrade', and reports it once", async () => {
    const spy = new SpyAdapter();
    await oldVault(spy);
    const oldHull = await spy.readText("_schemas/hull.schema.json");
    const oldCfg = await spy.readText("gallery.config.yaml");
    spy.reset();

    const report = await new Repository(spy).init();
    expect(report.rewritten).toEqual(expect.arrayContaining(["_schemas/hull.schema.json", "gallery.config.yaml"]));
    expect(report.snapshot).toBeDefined();

    const [snap, ...rest] = await listSnapshots(spy);
    expect(rest).toEqual([]); // one snapshot for the whole open
    expect(snap.id).toBe(report.snapshot);
    expect(snap.cause).toBe(SNAPSHOT_CAUSE.upgrade);
    expect(snap.files.map((f) => f.path)).toEqual(expect.arrayContaining(["_schemas/hull.schema.json", "gallery.config.yaml"]));
    expect(await spy.readText(`_snapshots/${snap.id}/files/_schemas/hull.schema.json`)).toBe(oldHull);
    expect(await spy.readText(`_snapshots/${snap.id}/files/gallery.config.yaml`)).toBe(oldCfg);
    // Every overwrite of an existing file happened after its snapshot copy.
    const order = spy.writes.map((w) => w.path);
    for (const p of report.rewritten) {
      expect(order.indexOf(`_snapshots/${snap.id}/files/${p}`), p).toBeGreaterThanOrEqual(0);
      expect(order.indexOf(`_snapshots/${snap.id}/files/${p}`), p).toBeLessThan(order.lastIndexOf(p));
    }

    // …and the upgrade took: the next open writes nothing.
    spy.reset();
    const again = await new Repository(spy).init();
    expect(again.rewritten).toEqual([]);
    expect(spy.writes).toEqual([]);
  });

  it("leaves a file alone, and says so, when it cannot be snapshotted first", async () => {
    const spy = new SpyAdapter();
    await oldVault(spy);
    const oldHull = await spy.readText("_schemas/hull.schema.json");
    const failing = new Proxy(spy, {
      get(t, k, r) {
        if (k === "writeText") return async (p: string, c: string) => (p.startsWith("_snapshots/") ? Promise.reject(new Error("disk full")) : t.writeText(p, c));
        return Reflect.get(t, k, r);
      },
    });
    const report = await new Repository(failing).init();
    expect(await spy.readText("_schemas/hull.schema.json")).toBe(oldHull);
    expect(report.skipped.map((s) => s.path)).toContain("_schemas/hull.schema.json");
    expect(report.skipped[0].reason).toBe("disk full");
  });
});

describe("sameValue", () => {
  it("compares plain data structurally, ignoring key order and undefined keys", () => {
    expect(sameValue({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
    expect(sameValue({ a: 1 }, { a: "1" })).toBe(false);
    expect(sameValue(null, {})).toBe(false);
    expect(sameValue([], {})).toBe(false);
    expect(sameValue(undefined, undefined)).toBe(true);
  });
});
