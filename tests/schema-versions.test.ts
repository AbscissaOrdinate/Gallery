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

// Step 4 of the UI redesign (2026-09-25) bumped every schema: handling code prefix, core
// required fields, polity acronym; note and character gained their first explicit version.
const PINNED: Record<string, [number, string]> = {
  note: [2, "3483b2fdd62a95b9"],
  polity: [3, "0f7f86cc01aab5b6"],
  location: [4, "0214814994d20a18"],
  body: [4, "a673f2149781b2d5"],
  system: [4, "b4148b28d52998dc"],
  character: [2, "c0c3ad1ffd2ece15"],
  module: [4, "7e58e48e5e77cccc"],
  hull: [5, "22ffd83281a597d4"],
  bus: [2, "b41a29e7c2bdbb61"],
  style: [3, "45506aaa906599a8"],
  craft: [4, "a9c6f557f21e108c"],
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
