/**
 * The vault's sections: record kinds that belong together, as the rail's tree
 * and the overview show them (docs/STYLE.md §8, 2026-09-26). A kind no section
 * names — a custom schema — lands in OTHER, so nothing drops out of the rail.
 */
import type { TypeSchema } from "../core/types";

export interface Section {
  id: string;
  title: string;
  icon: string;
  /** Kind ids, in the order the tree lists them. */
  types: string[];
}

export const SECTIONS: Section[] = [
  { id: "notes", title: "NOTES", icon: "≣", types: ["note"] },
  { id: "astro", title: "ASTROGRAPHY", icon: "✦", types: ["system", "body", "location"] },
  { id: "factions", title: "FACTIONS", icon: "⚑", types: ["polity", "character"] },
  { id: "shipyard", title: "SHIPYARD", icon: "⎔", types: ["hull", "module", "craft", "bus", "style"] },
];
const OTHER: Section = { id: "other", title: "OTHER", icon: "•", types: [] };

/** Each section with the kinds the vault actually has, in section order; empty sections are dropped. */
export function sectionsOf(types: TypeSchema[]): { section: Section; types: TypeSchema[] }[] {
  const byId = new Map(types.map((t) => [t.id, t]));
  const placed = new Set(SECTIONS.flatMap((s) => s.types));
  const out = SECTIONS.map((section) => ({ section, types: section.types.map((id) => byId.get(id)).filter((t): t is TypeSchema => !!t) }));
  const rest = types.filter((t) => !placed.has(t.id));
  if (rest.length) out.push({ section: { ...OTHER, types: rest.map((t) => t.id) }, types: rest });
  return out.filter((s) => s.types.length > 0);
}

export function sectionOfType(typeId: string | undefined): Section | undefined {
  return typeId ? SECTIONS.find((s) => s.types.includes(typeId)) : undefined;
}

