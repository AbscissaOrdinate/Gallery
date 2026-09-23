/**
 * Hull record shape (schema v2) — the frozen contract editor 1 authors and
 * editors 2–5 consume without changing.
 *
 * ## Geometry: elliptical, not revolved
 *
 * `gallery/06` §2 describes a fuselage revolved about the thrust axis from a
 * `(station, radius)` profile — circular cross-sections. `docs/CLAUDE.md` and
 * `gallery/05` §2.4 specify a **side profile mirrored about the long axis with
 * an independent beam**, giving an *elliptical* cross-section. CLAUDE.md
 * governs, so a station carries a half-height and the beam is separate:
 * cross-section at x is an ellipse with semi-axes `half_height(x)` and
 * `beam(x)/2`, and `V = ∫ π·a(x)·b(x) dx`. A hull with `beam_m = 2 ×
 * half_height` everywhere is the revolved case as a special instance.
 *
 * ## Stations
 *
 * `x` is metres from the bow, bow = 0, increasing aft (`docs/UNITS.md` §2).
 * `station_pitch_m` is the editor's snap grid and the frame spacing quoted
 * in-universe; it defaults to `cell_pitch_m` so imported NEBULOUS mounts land
 * on stations.
 */

/** One station on the half-profile: distance from the bow, and the profile's half-height there. */
export interface Station {
  x: number;
  half_height_m: number;
}

/** A per-station beam override. Between overrides the beam interpolates linearly. */
export interface BeamOverride {
  x: number;
  beam_m: number;
}

export interface Spine {
  length_m: number;
  /** Snap grid and in-universe frame spacing. Defaults to the constraint set's `cell_pitch_m`. */
  station_pitch_m?: number;
  /** Only `bow` is supported; the field exists so a record says so explicitly. */
  datum?: "bow";
  /** Fore to aft. Unsorted input is sorted on read. */
  stations: Station[];
  /** Beam where no override applies. */
  beam_m: number;
  beam_overrides?: BeamOverride[];
}

/** An internal volumetric budget along a run of the hull (§2.5). */
export interface HullSection {
  id: string;
  x0: number;
  x1: number;
  /** Archetypes that may be assigned here. Empty or absent means anything. */
  allowed?: string[];
  pressurised?: boolean;
}

export interface ArmorZone {
  id: string;
  x0: number;
  x1: number;
  material?: string;
  thickness_cm?: number;
}

/** A typed, sized external slot at (x, θ) on the hull (§2.5). */
export interface ExternalSlot {
  id: string;
  x: number;
  /** 0 = dorsal, 90 = starboard beam, 180 = ventral. Drawn on the silhouette. */
  theta_deg: number;
  type: string;
  /** S | M | L | XL, or a numeric size class. */
  size: string | number;
  /**
   * Draw this part instead of the one the style kit gives this slot's type.
   * How a captured or export hull carries a foreign fitting — honoured by the
   * renderer and reported as a style deviation, never blocked.
   */
  part?: string;
}

/**
 * A flat part in the silhouette plane — radiator panel, pylon, boom, antenna.
 * Mirrored vertically about the long axis, never swept: a radiator wing is two
 * panels, not a disc.
 */
export interface Appendage {
  id: string;
  kind: string;
  /** Station it attaches at. */
  station: number;
  /** Attachment height above the axis; defaults to the profile half-height there. */
  attach_r?: number;
  mirror?: "vertical" | "none";
  /** Outline in the silhouette plane, relative to the attachment point, metres. */
  outline: [number, number][];
  /** Style-kit part reference. */
  part?: string;
  /**
   * Which view the outline is drawn in: the side elevation (`profile`, the
   * default) or from above (`plan`). The attachment height defaults to the
   * matching half-extent — half-height for a profile, half-beam for a plan —
   * and the renderer draws an appendage only in its own view, since a
   * hand-drawn outline says nothing about what it looks like from elsewhere.
   */
  plane?: "profile" | "plan";
  /**
   * Behind or inside the hull from where it is seen — a beam mount in the side
   * view, a ventral one from above, a spinal mount in either. Drawn
   * outline-only so it reads as a fitting and never as hull structure.
   */
  far?: boolean;
}

export interface HullGeometry {
  spine: Spine;
  sections?: HullSection[];
  armor_zones?: ArmorZone[];
  external_slots?: ExternalSlot[];
  appendages?: Appendage[];
  /** Usable fraction of gross internal volume. */
  packing_efficiency?: number;
  structure_mass_fraction?: number;
}

/** A mass at a station, for the centre-of-gravity roll-up. */
export interface MassItem {
  x: number;
  mass_t: number;
  id?: string;
}

/** The reactor's shield cone: everything outside it is in the radiation shadow's *lit* side. */
export interface ShadowCone {
  /** Station of the reactor / shield. */
  x: number;
  /** Half-angle of the shadow the shield casts, degrees from the axis. */
  half_angle_deg: number;
  /** Which way the shadow points: aft of the reactor, or forward of it. */
  facing?: "forward" | "aft";
}
