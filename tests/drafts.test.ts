import { describe, expect, it } from "vitest";
import { dirtyCount, flushAll, register, track } from "../src/ui/drafts";

describe("drafts registry", () => {
  it("flushAll saves every dirty draft and counts them", async () => {
    const saved: string[] = [];
    let a = true;
    const off = [
      register({ flush: async () => void (a && (saved.push("a"), (a = false))), dirty: () => a }),
      register({ flush: async () => void saved.push("b"), dirty: () => false }),
    ];
    expect(dirtyCount()).toBe(1);
    await flushAll();
    expect(saved.sort()).toEqual(["a", "b"]);
    expect(dirtyCount()).toBe(0);
    off.forEach((f) => f());
  });

  it("waits for a save an unmounted editor left in flight", async () => {
    let done = false;
    track(new Promise<void>((r) => setTimeout(() => ((done = true), r()), 20)));
    await flushAll();
    expect(done).toBe(true);
  });

  it("a flush that throws does not stop the others, and does not reject", async () => {
    const seen: string[] = [];
    const off = [register({ flush: () => Promise.reject(new Error("boom")), dirty: () => true }), register({ flush: async () => void seen.push("ok"), dirty: () => true })];
    await expect(flushAll()).resolves.toBeUndefined();
    expect(seen).toEqual(["ok"]);
    off.forEach((f) => f());
  });

  it("a removed draft is no longer flushed", async () => {
    let n = 0;
    register({ flush: async () => void n++, dirty: () => true })();
    await flushAll();
    expect(n).toBe(0);
  });
});
