/** The session log: time order, codes per source, typed queries, advisory tracking that never collapses. */
import { describe, expect, it } from "vitest";
import { AdvisoryTracker, SessionLog, countLines, exportLog, logRelative, matchesQuery, parseLogQuery } from "../src/core/sessionLog";
import { violation } from "../src/core/designer/violations";

const clock = (start = new Date(2026, 8, 25, 6, 0, 0).getTime()) => {
  let t = start;
  return { now: () => t, tick: (ms: number) => (t += ms) };
};

describe("SessionLog", () => {
  it("keeps every line in order, numbering each source on its own", () => {
    const c = clock();
    const log = new SessionLog({}, c.now);
    log.push({ severity: "info", source: "vault", message: "Vault mounted" });
    c.tick(10);
    log.push({ severity: "caution", source: "vault", message: "Load problem" });
    log.push({ severity: "info", source: "map", message: "Map opened" });
    log.push({ severity: "info", source: "map", message: "Map opened" }); // repeated: two lines, never a count
    expect(log.lines.map((l) => l.code)).toEqual(["VLT-0001", "VLT-0002", "MAP-0001", "MAP-0002"]);
    expect(log.lines.map((l) => l.seq)).toEqual([1, 2, 3, 4]);
    expect(countLines(log.lines)).toEqual({ violation: 0, caution: 1, nominal: 0, info: 3 });
  });

  it("formats relative time from the session start", () => {
    expect(logRelative(1000 + 3_723_118, 1000)).toBe("+01:02:03.118");
  });

  it("exports fixed columns, one line per entry", () => {
    const c = clock();
    const log = new SessionLog({}, c.now);
    log.push({ severity: "info", source: "vault", message: "Vault mounted", elapsedMs: 1920 });
    expect(exportLog(log.lines)).toBe("06:00:00.000\tINFO\tvault\tVLT-0001\tVault mounted\t1.92 s");
  });
});

describe("log queries", () => {
  const c = clock();
  const log = new SessionLog({}, c.now);
  log.push({ severity: "info", source: "vault", message: "Vault mounted" });
  c.tick(20 * 60_000); // 06:20
  log.push({ severity: "violation", source: "hull", message: "Power budget exceeded", detail: { domain: "budget", subject: "Sword" } });
  log.push({ severity: "caution", source: "hull", message: "Station 14 has no frame member" });
  log.push({ severity: "nominal", source: "hull", message: "clearance nominal" });
  const run = (q: string) => log.lines.filter((l) => matchesQuery(l, parseLogQuery(q))).map((l) => l.code);

  it("filters by source (or the kernel domain), severity threshold and time", () => {
    expect(run("source:hull severity:>=caution")).toEqual(["HUL-0001", "HUL-0002"]);
    expect(run("source:budget")).toEqual(["HUL-0001"]);
    expect(run("since:06:10")).toEqual(["HUL-0001", "HUL-0002", "HUL-0003"]);
    expect(run("severity:<=nominal")).toEqual(["VLT-0001", "HUL-0003"]);
  });
  it("matches free text against message, code and subject", () => {
    expect(run("power sword")).toEqual(["HUL-0001"]);
  });
  it("hands back terms it cannot read instead of dropping them", () => {
    expect(parseLogQuery("severity:loud since:noon colour:red").unknown).toEqual(["severity:loud", "since:noon", "colour:red"]);
  });
});

describe("AdvisoryTracker", () => {
  const power = violation("error", "Power budget exceeded by 142 kW", { domain: "power" });
  const frame = violation("warn", "Station 14 has no frame member", { domain: "structure" });

  it("logs each advisory once when it is raised, and nominal when opening clean", () => {
    const log = new SessionLog();
    const t = new AdvisoryTracker(log, "hull", { id: "h1", name: "Sword" });
    t.evaluate([power, frame]);
    t.evaluate([power, frame]); // re-evaluation with nothing new logs nothing
    expect(log.lines.map((l) => [l.severity, l.message])).toEqual([
      ["violation", "Power budget exceeded by 142 kW"],
      ["caution", "Station 14 has no frame member"],
    ]);
    const clean = new SessionLog();
    new AdvisoryTracker(clean, "hull", { id: "h2", name: "Shield" }).evaluate([]);
    expect(clean.lines.map((l) => l.severity)).toEqual(["nominal"]);
  });

  it("marks a cleared advisory rather than deleting it, and says the domain went nominal", () => {
    const log = new SessionLog();
    const t = new AdvisoryTracker(log, "hull", { id: "h1", name: "Sword" });
    t.evaluate([power, frame]);
    t.evaluate([frame]);
    expect(log.lines).toHaveLength(3);
    expect(log.lines[0].clearedAt).toBeDefined();
    expect(log.lines[2]).toMatchObject({ severity: "nominal", message: "power nominal — Sword" });
    expect(countLines(log.lines, true)).toMatchObject({ violation: 0, caution: 1 });
    // Raised again: a new line, the old one stays cleared. Repetition is visible.
    t.evaluate([power, frame]);
    expect(log.lines.filter((l) => l.message.startsWith("Power"))).toHaveLength(2);
  });
});
