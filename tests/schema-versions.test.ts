/**
 * A built-in schema that changes must change its version.
 *
 * A vault upgrades its copy of a schema only when the built-in's `version` is
 * higher (`registry.seed`), so a change made without a bump never reaches a
 * vault that already has the file. That happened twice — the craft watch bill
 * and the system map's distance fields both shipped at their old versions, and
 * a working vault kept the old forms for days. This pins each schema's content
 * to its version.
 *
 * When this fails: bump the schema's `version`, then update its entry below
 * with the version and the hash the failure prints.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { BUILTIN_SCHEMAS } from "../src/core/schema/builtin/schemas";

const PINNED: Record<string, [number, string]> = {
  note: [0, "0598fd26186bc0c2"],
  polity: [2, "c9059b77ad9fe277"],
  location: [3, "52ff3d53e09cb1fb"],
  body: [3, "8afdd88a9dc8e998"],
  system: [3, "fa74ae3afb8a37fc"],
  character: [0, "df6cc0e3bdc2c8a8"],
  module: [3, "fcda53e7d46bf045"],
  hull: [4, "27391f87b5cfd50a"],
  bus: [1, "c768416bdd6f78cd"],
  style: [2, "12e6bc49c8b9ca5d"],
  craft: [3, "1075bcd566c1f361"],
};

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

describe("built-in schema versions", () => {
  for (const schema of BUILTIN_SCHEMAS) {
    it(`${schema.id}: content only changes with its version`, () => {
      const [version, pinned] = PINNED[schema.id] ?? [undefined, undefined];
      const now = hash(schema);
      const v = schema.version ?? 0;
      if (now !== pinned) {
        // Changed content at the same version is exactly the trap: no vault would ever see it.
        expect(v, `${schema.id} changed without a version bump — bump it, then pin [${v}, "${now}"]`).toBeGreaterThan(version ?? -1);
        expect.fail(`${schema.id} changed and was bumped to v${v}; pin it as [${v}, "${now}"]`);
      }
      expect(v).toBe(version);
    });
  }
});
