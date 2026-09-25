/**
 * Draws a few hulls in the style of `docs/refs/SolarSystem_Fleet_Deployment`
 * plates, and every part glyph beside the reference it was drawn from, and
 * writes them to one HTML page — so "does the generator actually make these
 * shapes?" gets answered by looking rather than by arguing. Not a test — a
 * scratch tool kept because it is the quickest way to check a change against
 * the target art.
 *
 *   npx tsx scripts/hull-style-probe.mts [out.html]
 *
 * The page inlines `src/theme.css`, so every colour is a theme token — the
 * same ones the app draws with, not a stand-in palette.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderHull, toSvg } from "../src/core/designer/hull/render";
import { hullMetrics } from "../src/core/designer/hull/geometry";
import {
  makePart,
  partsForHull,
  radiatorRatio,
  type FittedWeapon,
  type PartFamilies,
  type PartSpec,
  type RadiatorFamily,
  type View,
  type WeaponFamily,
} from "../src/core/designer/hull/parts";
import type { Appendage, HullGeometry, Station } from "../src/core/designer/hull/types";

const ROOT = join(import.meta.dirname, "..");
const theme = readFileSync(join(ROOT, "src", "theme.css"), "utf8");
const ref = (name: string) => `data:image/png;base64,${readFileSync(join(ROOT, "docs", "refs", "Weapons", name)).toString("base64")}`;

/** A run of frames: the rhythmic banding all over the reference plates. */
function collar(id: string, station: number, r: number, count = 3, pitch = 2, depth = 1.6): Appendage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${id}-${i + 1}`,
    kind: "greeble",
    station: station + i * pitch,
    attach_r: r,
    outline: [
      [0, 0],
      [0.8, 0],
      [0.8, depth],
      [0, depth],
    ] as [number, number][],
  }));
}

/** A hard-shouldered barrel: two stations at each end of the run. */
function block(x0: number, x1: number, r: number): Station[] {
  return [
    { x: x0, half_height_m: r },
    { x: x1, half_height_m: r },
  ];
}

const hulls: { name: string; hull: HullGeometry }[] = [
  {
    // The CG row: a long armoured nose at the bow, a chain of lozenges, then a
    // banded engineering block aft. Bow is x = 0 and draws on the right. It
    // carries a spinal mount and two beam mounts so both new cases show.
    name: "CG — armoured nose, lozenge chain, banded engineering",
    hull: {
      spine: {
        length_m: 120,
        beam_m: 9,
        station_pitch_m: 2,
        stations: [
          { x: 0, half_height_m: 0.6 },
          { x: 24, half_height_m: 4.2 }, // the angled armour taper
          ...block(24, 38, 4.2),
          ...block(38, 44, 2.2),
          ...block(44, 60, 5.2),
          ...block(60, 66, 2.2),
          ...block(66, 82, 5.2),
          ...block(82, 90, 3.0),
          ...block(90, 116, 4.6),
          { x: 120, half_height_m: 4.6 }, // blunt transom, drive plate
        ],
      },
      packing_efficiency: 0.78,
      sections: [
        { id: "forward", x0: 0, x1: 44, pressurised: true },
        { id: "midships", x0: 44, x1: 82 },
        { id: "engineering", x0: 82, x1: 120 },
      ],
      external_slots: [
        { id: "sp", x: 40, theta_deg: 0, type: "spinal", size: "XL" },
        { id: "a1", x: 16, theta_deg: 0, type: "turret", size: "M" },
        { id: "a2", x: 30, theta_deg: 0, type: "turret", size: "M" },
        { id: "a3", x: 34, theta_deg: 180, type: "turret", size: "S" },
        { id: "op", x: 24, theta_deg: 0, type: "optics", size: "S" },
        { id: "m1", x: 42, theta_deg: 0, type: "comms", size: "M" },
        { id: "pd1", x: 50, theta_deg: 0, type: "pd", size: "S" },
        { id: "bs", x: 56, theta_deg: 90, type: "turret", size: "M" }, // starboard battery
        { id: "bp", x: 72, theta_deg: 270, type: "turret", size: "M" }, // port battery
        { id: "r1", x: 52, theta_deg: 180, type: "radiator", size: "L" },
        { id: "sr", x: 62, theta_deg: 0, type: "sensor", size: "M" },
        { id: "pd2", x: 70, theta_deg: 180, type: "pd", size: "S" },
        { id: "r2", x: 76, theta_deg: 180, type: "radiator", size: "L" },
        { id: "tk", x: 96, theta_deg: 0, type: "tank", size: "L" },
        { id: "dr", x: 118, theta_deg: 0, type: "drive", size: "L" },
      ],
      appendages: [...collar("eng", 94, 4.6, 4, 4, 2.4)],
    },
  },
  {
    // The CV row: short nose, a neck, then one enormous blunt hangar block.
    name: "CV — blunt hangar block",
    hull: {
      spine: {
        length_m: 100,
        beam_m: 26,
        station_pitch_m: 2,
        stations: [
          { x: 0, half_height_m: 2.5 },
          { x: 10, half_height_m: 8 },
          ...block(10, 18, 8),
          ...block(18, 26, 5),
          { x: 32, half_height_m: 13 },
          ...block(32, 88, 13),
          ...block(88, 100, 10),
        ],
      },
      packing_efficiency: 0.82,
      sections: [
        { id: "bow", x0: 0, x1: 32, pressurised: true },
        { id: "hangar", x0: 32, x1: 88, pressurised: true },
        { id: "drive", x0: 88, x1: 100 },
      ],
      appendages: collar("eng", 90, 10, 3, 3, 2),
    },
  },
  {
    // The DL row: needle bow, a fat banded waist, a short blunt tail.
    name: "DL — needle bow and frame collar",
    hull: {
      spine: {
        length_m: 70,
        beam_m: 7,
        station_pitch_m: 2,
        stations: [
          { x: 0, half_height_m: 0.5 },
          { x: 16, half_height_m: 2.4 },
          ...block(16, 28, 2.4),
          ...block(28, 34, 1.4),
          ...block(34, 52, 3.4),
          ...block(52, 62, 2.6),
          { x: 70, half_height_m: 2.6 },
        ],
      },
      packing_efficiency: 0.74,
      sections: [
        { id: "forward", x0: 0, x1: 34, pressurised: true },
        { id: "aft", x0: 34, x1: 70 },
      ],
      appendages: collar("fr", 36, 3.4, 5, 3, 1.6),
    },
  },
];

/** Two notional polities, to see whether the families actually read apart. */
const KITS: { name: string; families: PartFamilies; weapons?: Record<string, FittedWeapon> }[] = [
  {
    name: "UJCN — fins, barbettes, barrel tanks",
    families: { radiator: "fin", turret: "barbette", tank: "barrel", thruster: "bell", antenna: "dish" },
    weapons: {
      sp: { weapon: "gun", bore_mm: 600 },
      a1: { weapon: "gun", bore_mm: 450 },
      a2: { weapon: "gun", bore_mm: 300 },
      a3: { weapon: "ciws" },
      bs: { weapon: "rocket", cells: 18 },
      bp: { weapon: "plasma" },
    },
  },
  {
    name: "CDN — panels, boxes, spherical tanks",
    families: { radiator: "panel", turret: "box", tank: "spherical", thruster: "cluster", antenna: "phased-panel" },
    weapons: {
      sp: { weapon: "particle" },
      a1: { weapon: "cell", cells: 8 },
      a2: { weapon: "cell", cells: 4 },
      a3: { weapon: "laser" },
      bs: { weapon: "laser" },
      bp: { weapon: "arm" },
    },
  },
];

const cards = hulls
  .map(({ name, hull }) => {
    const m = hullMetrics(hull);
    const plate = (kit: (typeof KITS)[number], view: View) =>
      toSvg(renderHull(hull, { mode: "silhouette", view, fitted: partsForHull(hull, { families: kit.families, weapons: kit.weapons, view }) }), { pxPerMetre: 7 });
    const fitted = KITS.map((kit) => `<h3>${kit.name} — side</h3><div class="plate">${plate(kit, "profile")}</div><h3>${kit.name} — plan</h3><div class="plate">${plate(kit, "plan")}</div>`).join("");
    const schematic = toSvg(renderHull(hull, { mode: "schematic", sections: true, showBeam: true, scaleFigures: true }), { pxPerMetre: 7 });
    return `<section>
  <h2>${name}</h2>
  <p>${m.length_m.toFixed(0)} m / beam ${m.max_beam_m.toFixed(1)} m / L/D ${m.length_over_diameter.toFixed(2)}
     / gross ${Math.round(m.gross_volume_m3).toLocaleString()} m3 / wetted ${Math.round(m.wetted_area_m2).toLocaleString()} m2</p>
  <h3>bare hull</h3><div class="plate">${toSvg(renderHull(hull, { mode: "silhouette" }), { pxPerMetre: 7 })}</div>
  ${fitted}
  <h3>schematic</h3><div class="plate">${schematic}</div>
</section>`;
  })
  .join("\n");

type Pieces = [number, number][][];

/** The bounding box of some pieces, in part-local metres. */
function bbox(pieces: Pieces) {
  const pts = pieces.flat();
  return {
    x0: Math.min(...pts.map(([x]) => x)),
    x1: Math.max(...pts.map(([x]) => x)),
    y0: Math.min(...pts.map(([, y]) => y)),
    y1: Math.max(...pts.map(([, y]) => y)),
  };
}

/**
 * One part on its own, drawn from part-local metres and turned bow-right to
 * match the references. `frame` fixes the metres shown, so a row of swatches
 * can share one scale — without it every swatch fits its own box and a size
 * ladder would show four identical drawings.
 */
function swatch(pieces: Pieces, label: string, frame?: { w: number; h: number }): string {
  const b = bbox(pieces);
  const pad = 0.6;
  const w = frame?.w ?? b.x1 - b.x0;
  const h = frame?.h ?? b.y1 - b.y0;
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  // Mirror x so forward (−x) draws to the right, as every reference does.
  const vx = -cx - w / 2 - pad;
  const vy = -cy - h / 2 - pad;
  const body = pieces
    .map((o) => `<polygon points="${o.map(([x, y]) => `${(-x).toFixed(2)},${(-y).toFixed(2)}`).join(" ")}" fill="var(--ink-200)" stroke="var(--surface-400)" stroke-width="${(Math.max(w, h) / 300).toFixed(3)}"/>`)
    .join("");
  return `<figure><svg viewBox="${vx.toFixed(2)} ${vy.toFixed(2)} ${(w + 2 * pad).toFixed(2)} ${(h + 2 * pad).toFixed(2)}" width="120" height="96" preserveAspectRatio="xMidYMid meet">${body}</svg><figcaption>${label}</figcaption></figure>`;
}

/** A row at one common scale: the largest part sets the frame for all. */
function ladder(items: { pieces: Pieces; label: string }[]): string {
  const w = Math.max(...items.map(({ pieces }) => bbox(pieces).x1 - bbox(pieces).x0));
  const h = Math.max(...items.map(({ pieces }) => bbox(pieces).y1 - bbox(pieces).y0));
  return items.map(({ pieces, label }) => swatch(pieces, label, { w, h })).join("");
}

const reference = (src: string, label: string) => `<figure class="ref"><img src="${src}" alt="${label}"><figcaption>${label}</figcaption></figure>`;

/** The six families with references, each drawing beside the image it was drawn from. */
const REFERENCED: { w: WeaponFamily; file: string; extra?: Partial<PartSpec> }[] = [
  { w: "arm", file: "bandit" },
  { w: "particle", file: "beam" },
  { w: "ciws", file: "CIWS" },
  { w: "laser", file: "laser" },
  { w: "plasma", file: "plasma" },
  { w: "rocket", file: "rocket", extra: { cells: 18 } },
];

const WEAPONS: { w: WeaponFamily; label: string; extra?: Partial<PartSpec> }[] = [
  { w: "gun", label: "gun 300mm", extra: { bore_mm: 300 } },
  { w: "gun", label: "gun 600mm", extra: { bore_mm: 600 } },
  { w: "gun", label: "gun 300mm x3", extra: { bore_mm: 300, barrels: 3 } },
  { w: "cell", label: "VLS x4", extra: { cells: 4 } },
  { w: "cell", label: "VLS x16", extra: { cells: 16 } },
  { w: "rocket", label: "rocket x18", extra: { cells: 18 } },
  { w: "arm", label: "one-armed bandit" },
  { w: "laser", label: "laser" },
  { w: "plasma", label: "plasma" },
  { w: "particle", label: "particle beam" },
  { w: "ciws", label: "CIWS" },
];

const OTHERS: { spec: PartSpec; label: string }[] = [
  { spec: { kind: "antenna", families: { antenna: "dish" } }, label: "antenna · dish" },
  { spec: { kind: "antenna", families: { antenna: "phased-panel" } }, label: "antenna · phased" },
  { spec: { kind: "antenna", families: { antenna: "whip" } }, label: "antenna · whip" },
  { spec: { kind: "radar" }, label: "radar" },
  { spec: { kind: "optics" }, label: "optics" },
  { spec: { kind: "pd" }, label: "pd (a CIWS)" },
  { spec: { kind: "tank", families: { tank: "barrel" } }, label: "tank · barrel" },
  { spec: { kind: "tank", families: { tank: "spherical" } }, label: "tank · spherical" },
  { spec: { kind: "tank", families: { tank: "conformal" } }, label: "tank · conformal" },
  { spec: { kind: "thruster", families: { thruster: "bell" } }, label: "thruster · bell" },
  { spec: { kind: "thruster", families: { thruster: "block" } }, label: "thruster · block" },
  { spec: { kind: "thruster", families: { thruster: "cluster" } }, label: "thruster · cluster" },
  { spec: { kind: "dock" }, label: "dock" },
];

const RADIATORS: { f: RadiatorFamily; label: string; panels?: number; sweep?: number }[] = [
  { f: "panel", label: "panel" },
  { f: "panel", label: "panel x3", panels: 3 },
  { f: "fin", label: "fin" },
  { f: "fin", label: "fin x4, +35°", panels: 4, sweep: 35 },
  { f: "fin", label: "fin x4, −35°", panels: 4, sweep: -35 },
  { f: "droplet-boom", label: "droplet boom" },
  { f: "spine-array", label: "spine array x4", panels: 4 },
  { f: "hoop", label: "hoop" },
  { f: "membrane", label: "membrane" },
];

const SIZES = ["S", "M", "L", "XL"] as const;
const LADDERS: { name: string; spec: PartSpec; view?: View }[] = [
  { name: "gun 300mm — barrel lengthens, gunhouse expands more slowly", spec: { kind: "turret", weapon: "gun", bore_mm: 300 } },
  { name: "VLS from above — 8, 16, 32, 48 cells at one pitch (ruled 2026-09-23)", spec: { kind: "turret", weapon: "cell" }, view: "plan" },
  { name: "rocket from above — more tubes, same tube", spec: { kind: "turret", weapon: "rocket" }, view: "plan" },
  { name: "laser — a sphere stays a sphere", spec: { kind: "turret", weapon: "laser" } },
  { name: "radiator · fin — taller, never longer", spec: { kind: "radiator", families: { radiator: "fin" } } },
  { name: "tank · barrel — longer, barely thicker", spec: { kind: "tank", families: { tank: "barrel" } } },
];

const both = (spec: PartSpec, label: string) => `${swatch(makePart(spec), label + " · side")}${swatch(makePart(spec, "plan"), label + " · plan")}`;

const gallery = `<section>
  <h2>Referenced weapons — each drawing beside the image it was drawn from</h2>
  <p>Side view, then its reference; top view, then its reference. Bow to the right throughout, as in the references.</p>
  ${REFERENCED.map(
    (x) => `<div class="swatches pair">
    ${swatch(makePart({ kind: "turret", size: "M", weapon: x.w, ...(x.extra ?? {}) }), `${x.w} · side`)}${reference(ref(`${x.file}_side.png`), `${x.file}_side.png`)}
    ${swatch(makePart({ kind: "turret", size: "M", weapon: x.w, ...(x.extra ?? {}) }, "plan"), `${x.w} · plan`)}${reference(ref(`${x.file}_top.png`), `${x.file}_top.png`)}
  </div>`,
  ).join("")}

  <h2>Weapon families — a CIWS must not read as a railgun</h2>
  <div class="swatches">${WEAPONS.map((x) => swatch(makePart({ kind: "turret", size: "M", weapon: x.w, ...(x.extra ?? {}) }), x.label)).join("")}</div>
  <h3>the same, from above</h3>
  <div class="swatches">${WEAPONS.map((x) => swatch(makePart({ kind: "turret", size: "M", weapon: x.w, ...(x.extra ?? {}) }, "plan"), x.label)).join("")}</div>

  <h2>Turret mount family — the polity's signature under the weapon</h2>
  ${(["box", "barbette", "cupola"] as const)
    .map(
      (turret) =>
        `<div class="swatches">${both({ kind: "turret", weapon: "gun", bore_mm: 300, families: { turret } }, `gun · ${turret}`)}${both({ kind: "turret", weapon: "laser", families: { turret } }, `laser · ${turret}`)}${both({ kind: "turret", weapon: "rocket", cells: 6, families: { turret } }, `rocket · ${turret}`)}</div>`,
    )
    .join("")}

  <h2>Size ladders, S → M → L → XL at one common scale per row</h2>
  ${LADDERS.map((l) => `<h3>${l.name}</h3><div class="swatches">${ladder(SIZES.map((size) => ({ pieces: makePart({ ...l.spec, size }, l.view), label: size })))}</div>`).join("")}

  <h2>Everything that is not a weapon</h2>
  <div class="swatches">${OTHERS.map((x) => swatch(makePart({ size: "M", ...x.spec }), x.label)).join("")}</div>
  <h3>the same, from above</h3>
  <div class="swatches">${OTHERS.map((x) => swatch(makePart({ size: "M", ...x.spec }, "plan"), x.label)).join("")}</div>

  <h2>Radiator families, array size and sweep</h2>
  <div class="swatches">${RADIATORS.map((x) => swatch(makePart({ kind: "radiator", size: "L", families: { radiator: x.f }, panels: x.panels, sweep_deg: x.sweep }), x.label)).join("")}</div>
  <h3>the same, from above — a radiator is a sheet, so edge-on</h3>
  <div class="swatches">${RADIATORS.map((x) => swatch(makePart({ kind: "radiator", size: "L", families: { radiator: x.f }, panels: x.panels, sweep_deg: x.sweep }, "plan"), x.label)).join("")}</div>
  <h3>panels at one scale — one, two and three radiators in a set, each panel the same width (ruled 2026-09-23)</h3>
  <div class="swatches">${ladder(
    (["fin", "panel", "spine-array"] as const).flatMap((radiator) =>
      [1, 2, 3].map((panels) => ({ pieces: makePart({ kind: "radiator", size: "L", families: { radiator }, panels }), label: `${radiator} × ${panels}` })),
    ),
  )}</div>
  <h3>radiator_aspect from the style kit, at one scale — 1.0, the default 1.35, and 2.0</h3>
  <div class="swatches">${ladder(
    (["fin", "panel", "membrane"] as const).flatMap((radiator) =>
      [1, 1.35, 2].map((radiator_aspect) => ({
        pieces: makePart({ kind: "radiator", size: "M", families: { radiator, radiator_aspect } }),
        label: `${radiator} @${radiator_aspect} → ${radiatorRatio(radiator, radiator_aspect).toFixed(2)}`,
      })),
    ),
  )}</div>
</section>`;

/** One slot on a short barrel, drawn in both views, so a turned mount can be seen turned. */
function turnedSwatch(slot: Record<string, unknown>, label: string): string {
  const h: HullGeometry = {
    spine: { length_m: 24, beam_m: 6, station_pitch_m: 3, stations: [{ x: 0, half_height_m: 3 }, { x: 24, half_height_m: 3 }] },
    external_slots: [{ id: "m", x: 12, theta_deg: 0, type: "turret", size: "M", ...slot } as never],
  };
  const one = (view: View) => toSvg(renderHull(h, { mode: "silhouette", view, fitted: partsForHull(h, { view, weapons: { m: { weapon: "gun", bore_mm: 300 } } }) }), { pxPerMetre: 4 });
  return `<figure><div style="display:flex;gap:6px">${one("profile")}${one("plan")}</div><figcaption>${label} — side · from above</figcaption></figure>`;
}

const turned = `<section>
  <h2>Turned mounts — facing and tilt, set per slot in the hull editor (2026-09-23)</h2>
  <div class="swatches">
    ${turnedSwatch({}, "gun, as drawn")}
    ${turnedSwatch({ facing_deg: 180 }, "gun, flipped")}
    ${turnedSwatch({ facing_deg: 90 }, "gun, turned 90°")}
  </div>
  <div class="swatches">
    ${turnedSwatch({ type: "thruster", size: "S" }, "thruster, default radial")}
    ${turnedSwatch({ type: "thruster", size: "S", tilt_deg: 0 }, "thruster, tilt 0")}
    ${turnedSwatch({ type: "thruster", size: "S", tilt_deg: 0, facing_deg: 180 }, "thruster, retro")}
    ${turnedSwatch({ type: "thruster", size: "S", tilt_deg: 45, facing_deg: 90 }, "thruster, canted for roll")}
    ${turnedSwatch({ type: "tank", size: "M", count: 4, theta_deg: 45 }, "tank ring × 4")}
  </div>
</section>`;

const out = process.argv[2] ?? "hull-style-probe.html";
writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><title>Hull style probe</title>
<style>
${theme}
  body { background:var(--surface-100); color:var(--ink-100); font:14px/1.5 system-ui, sans-serif; margin:24px 32px; }
  h1 { font-weight:600; letter-spacing:.02em; }
  h3 { font-size:12px; font-weight:500; margin:12px 0 2px; color:var(--ink-200); }
  h2 { font-size:15px; font-weight:600; margin:28px 0 2px; color:var(--accent-500); }
  p { margin:0 0 10px; color:var(--ink-200); font-size:12px; font-variant-numeric:tabular-nums; }
  .swatches { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px; }
  figure { margin:0; background:var(--surface-200); border:1px solid var(--line-200); border-radius:6px; padding:6px; text-align:center; }
  figure.ref img { width:120px; height:96px; object-fit:contain; image-rendering:pixelated; background:var(--surface-000); }
  figcaption { font-size:10px; color:var(--ink-200); margin-top:4px; }
  .plate { background:var(--surface-200); border:1px solid var(--line-200); border-radius:6px; padding:10px; margin-bottom:8px; overflow-x:auto; }
</style>
<h1>Hull style probe — can the generators make the reference shapes?</h1>
${gallery}
${turned}
${cards}
`,
);
console.log("wrote " + out);
