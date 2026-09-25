/**
 * Seed for `handling` in gallery.config.yaml: the closed vocabularies a record's
 * marking and badge draw from (docs/STYLE.md §4.1). Vault data, written into the
 * config once if absent; edit the config, not this.
 *
 * Taken from the design book's plates, which follow the ACS convention:
 * clearance levels, a disruption class and a risk class, each value a word so
 * the badge survives without colour.
 */
import type { HandlingVocab } from "../../types";

export const HANDLING_VOCAB_SEED: HandlingVocab = {
  clearance: ["LEVEL 1", "LEVEL 2", "LEVEL 3", "LEVEL 4", "LEVEL 5", "LEVEL 6"],
  caveats: ["SI", "TK", "NOFORN", "ORCON", "REL TO CMW"],
  disruption: [
    { value: "DARK", severity: "nominal" },
    { value: "VLAM", severity: "nominal" },
    { value: "KENEQ", severity: "caution" },
    { value: "EKHI", severity: "critical" },
    { value: "AMIDA", severity: "critical" },
  ],
  risk: [
    { value: "NOTICE", severity: "nominal" },
    { value: "CAUTION", severity: "caution" },
    { value: "WARNING", severity: "caution" },
    { value: "DANGER", severity: "critical" },
    { value: "CRITICAL", severity: "critical" },
  ],
};
