/**
 * System schema — the document behind a schematic orbital map. Bodies and
 * locations are separate records that point at the system; this record
 * holds the cartographic settings and map-only annotations.
 */
import type { TypeSchema } from "../../types";

const num = (title: string, unit?: string, extra: Record<string, unknown> = {}) => ({ type: "number" as const, title, ...(unit ? { "x-unit": unit } : {}), ...extra });
const str = (title: string, extra: Record<string, unknown> = {}) => ({ type: "string" as const, title, ...extra });

export const SYSTEM_SCHEMA: TypeSchema = {
  id: "system",
  version: 4, // 3: distance fields gained x-distance without a bump; bumped 2026-09-24 so vaults pick it up. 4: handling code prefix and core required fields (UI redesign step 4, 2026-09-25).
  handling: { code_prefix: "SYS" },
  title: "Star system",
  description: "A star system and its schematic orbital map: radius mapping, moon-system scale, annotations (rings, transit arcs, labels).",
  folder: "systems",
  icon: "☉",
  rels: ["contains", "neighbour-of"],
  indexColumns: ["primary", "radius_mapping"],
  fields: {
    type: "object",
    required: ["primary"],
    properties: {
      primary: { type: "string", title: "Primary (star or barycenter)", "x-ref": { types: ["body"], rel: "contains" } },
      distance_ly: num("Distance from home", "ly"),
      radius_mapping: str("Radius mapping", {
        enum: ["log", "sqrt", "linear", "manual"],
        default: "log",
        "x-group": "Schematic",
        description: "How AU becomes pixels. log keeps the inner system readable; manual uses each body's 'map radius' link value.",
      }),
      inner_px: num("Innermost orbit radius", "px", { default: 90, minimum: 10, "x-group": "Schematic" }),
      outer_px: num("Outermost orbit radius", "px", { default: 520, minimum: 50, "x-group": "Schematic" }),
      moon_scale_px: num("Moon system size", "px", { default: 42, minimum: 10, "x-group": "Schematic", description: "Radius of the largest moon orbit drawn around a planet." }),
      show_lagrange: { type: "boolean", title: "Show Lagrange points", default: true, "x-group": "Schematic" },
      show_zones: { type: "boolean", title: "Show habitable zone & frost line", default: true, "x-group": "Schematic" },
      show_labels: { type: "boolean", title: "Show labels", default: true, "x-group": "Schematic" },
      annotations: {
        type: "array",
        title: "Annotations",
        "x-group": "Annotations",
        description: "Map-only drawings: orbital rings, transit arcs, text.",
        items: {
          type: "object",
          properties: {
            kind: str("Kind", { enum: ["arc", "ring", "label", "line"], default: "arc" }),
            label: str("Label"),
            around: { type: "string", title: "Around body", "x-ref": { types: ["body"] } },
            radius_au: num("Radius", "AU", { "x-distance": true }),
            radius_km: num("Radius (moons)", "km", { "x-distance": true }),
            start_deg: num("Start", "°"),
            end_deg: num("End", "°"),
            width_px: num("Stroke width", "px", { default: 4 }),
            color: str("Colour"),
            link: { type: "string", title: "Linked record", "x-ref": { types: ["location", "polity", "craft", "note"] } },
          },
        },
      },
      notes: { type: "string", title: "Cartographic notes", "x-multiline": true },
    },
  },
};
