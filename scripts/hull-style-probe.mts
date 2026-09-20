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
      appendages: [...collar("mid", 46, 5.2, 3), ...collar("eng", 94, 4.6, 5, 4, 2.4)],
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

const cards = hulls
  .map(({ name, hull }) => {
    const m = hullMetrics(hull);
    const plate = toSvg(renderHull(hull, { mode: "silhouette" }), { pxPerMetre: 7 });
    const schematic = toSvg(renderHull(hull, { mode: "schematic", sections: true, showBeam: true, scaleFigures: true }), { pxPerMetre: 7 });
    return `<section>
  <h2>${name}</h2>
  <p>${m.length_m.toFixed(0)} m · beam ${m.max_beam_m.toFixed(1)} m · L/D ${m.length_over_diameter.toFixed(2)}
     · gross ${Math.round(m.gross_volume_m3).toLocaleString()} m³ · wetted ${Math.round(m.wetted_area_m2).toLocaleString()} m²</p>
  <div class="plate">${plate}</div>
  <div class="plate">${schematic}</div>
</section>`;
  })
  .join("\n");

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
  h2 { font-size:15px; font-weight:600; margin:28px 0 2px; color:#e2a07a; }
  p { margin:0 0 10px; color:#8f9ab8; font-size:12px; font-variant-numeric:tabular-nums; }
  .plate { background:#171b2b; border:1px solid #2b3149; border-radius:6px; padding:10px; margin-bottom:8px; overflow-x:auto; }
</style>
<h1>Hull style probe — can the spine model make the fleet-plate shapes?</h1>
${cards}
`,
);
console.log("wrote " + out);
