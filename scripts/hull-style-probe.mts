/**
 * Draws a few hulls in the style of `docs/refs/SolarSystem_Fleet_Deployment`
 * plates and writes them to one HTML page, so the question "can the geometry
 * model actually make these shapes?" gets answered by looking rather than by
 * arguing. Not a test — a scratch tool kept because it is the quickest way to
 * check a profile change against the target art.
 *
 *   npx tsx scripts/hull-style-probe.mts [out.html]
 */
import { writeFileSync } from "node:fs";
import { renderHull, toSvg } from "../src/core/designer/hull/render";
import { hullMetrics } from "../src/core/designer/hull/geometry";
import { makePart, partsForHull, type FittedWeapon, type PartFamilies, type RadiatorFamily, type WeaponFamily } from "../src/core/designer/hull/parts";
import type { Appendage, HullGeometry, Station } from "../src/core/designer/hull/types";

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
    // banded engineering block aft. Bow is x = 0 and draws on the right.
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
        { id: "a1", x: 16, theta_deg: 0, type: "turret", size: "M" },
        { id: "a2", x: 30, theta_deg: 0, type: "turret", size: "M" },
        { id: "a3", x: 34, theta_deg: 180, type: "turret", size: "S" },
        { id: "op", x: 24, theta_deg: 0, type: "optics", size: "S" },
        { id: "m1", x: 42, theta_deg: 0, type: "comms", size: "M" },
        { id: "pd1", x: 50, theta_deg: 0, type: "pd", size: "S" },
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
    weapons: { a1: { weapon: "gun", bore_mm: 450 }, a2: { weapon: "gun", bore_mm: 300 }, a3: { weapon: "ciws" } },
  },
  {
    name: "CDN — panels, boxes, spherical tanks",
    families: { radiator: "panel", turret: "box", tank: "spherical", thruster: "cluster", antenna: "phased-panel" },
    weapons: { a1: { weapon: "cell", cells: 8 }, a2: { weapon: "cell", cells: 4 }, a3: { weapon: "laser" } },
  },
];

const cards = hulls
  .map(({ name, hull }) => {
    const m = hullMetrics(hull);
    const fitted = KITS.map(
      (kit) =>
        `<h3>${kit.name}</h3><div class="plate">${toSvg(renderHull(hull, { mode: "silhouette", fitted: partsForHull(hull, { families: kit.families, weapons: kit.weapons }) }), { pxPerMetre: 7 })}</div>`,
    ).join("");
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

/** One part on its own, drawn from part-local metres. */
function swatch(pieces: [number, number][][], label: string): string {
  const pts = pieces.flat();
  const x0 = Math.min(...pts.map(([x]) => x)) - 1;
  const x1 = Math.max(...pts.map(([x]) => x)) + 1;
  const y0 = Math.min(...pts.map(([, y]) => y)) - 1;
  const y1 = Math.max(...pts.map(([, y]) => y)) + 1;
  const body = pieces.map((o) => `<polygon points="${o.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join(" ")}" fill="#c8d2ea" stroke="#39415f" stroke-width="0.25"/>`).join("");
  return `<figure><svg viewBox="${x0.toFixed(2)} ${(-y1).toFixed(2)} ${(x1 - x0).toFixed(2)} ${(y1 - y0).toFixed(2)}" width="120" height="96" preserveAspectRatio="xMidYMid meet">${body}</svg><figcaption>${label}</figcaption></figure>`;
}

const WEAPONS: { w: WeaponFamily; label: string; extra?: Record<string, number> }[] = [
  { w: "gun", label: "gun 300mm", extra: { bore_mm: 300 } },
  { w: "gun", label: "gun 600mm", extra: { bore_mm: 600 } },
  { w: "gun", label: "gun 300mm x3", extra: { bore_mm: 300, barrels: 3 } },
  { w: "cell", label: "VLS x4", extra: { cells: 4 } },
  { w: "cell", label: "VLS x10", extra: { cells: 10 } },
  { w: "rocket", label: "rocket tubes", extra: { cells: 6 } },
  { w: "arm", label: "one-armed bandit" },
  { w: "laser", label: "laser" },
  { w: "plasma", label: "plasma" },
  { w: "particle", label: "particle beam" },
  { w: "ciws", label: "CIWS" },
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

const gallery = `<section>
  <h2>Weapon families — a CIWS must not read as a railgun</h2>
  <div class="swatches">${WEAPONS.map((x) => swatch(makePart({ kind: "turret", size: "M", weapon: x.w, ...(x.extra ?? {}) }), x.label)).join("")}</div>
  <h2>Radiator families, array size and sweep</h2>
  <div class="swatches">${RADIATORS.map((x) => swatch(makePart({ kind: "radiator", size: "L", families: { radiator: x.f }, panels: x.panels, sweep_deg: x.sweep }), x.label)).join("")}</div>
</section>`;

const out = process.argv[2] ?? "hull-style-probe.html";
writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><title>Hull style probe</title>
<style>
  :root { --navy-200:#c8d2ea; --navy-300:#a8b5d4; --navy-600:#39415f; --navy-700:#2b3149;
          --navy-800:#1f2438; --navy-900:#171b2b; --rust-300:#e2a07a; --rust-500:#c4633a;
          --accent:#d4713f; --accent-tint:#3a2a22; --line:#39415f; --line-faded:#2b3149;
          --line-strong:#4d5678; --ok:#6fae8f; }
  body { background:#12151f; color:#c8d2ea; font:14px/1.5 system-ui, sans-serif; margin:24px 32px; }
  h1 { font-weight:600; letter-spacing:.02em; }
  h3 { font-size:12px; font-weight:500; margin:12px 0 2px; color:#8f9ab8; }
  h2 { font-size:15px; font-weight:600; margin:28px 0 2px; color:#e2a07a; }
  p { margin:0 0 10px; color:#8f9ab8; font-size:12px; font-variant-numeric:tabular-nums; }
  .swatches { display:flex; flex-wrap:wrap; gap:10px; }
  figure { margin:0; background:#171b2b; border:1px solid #2b3149; border-radius:6px; padding:6px; text-align:center; }
  figcaption { font-size:10px; color:#8f9ab8; margin-top:4px; }
  .plate { background:#171b2b; border:1px solid #2b3149; border-radius:6px; padding:10px; margin-bottom:8px; overflow-x:auto; }
</style>
<h1>Hull style probe — can the spine model make the fleet-plate shapes?</h1>
${gallery}
${cards}
`,
);
console.log("wrote " + out);
