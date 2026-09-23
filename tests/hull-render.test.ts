/**
 * Hull renderer: the scene is generated from the record every time, carries no
 * literal colours, and serialises to SVG for the existing asset export.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LABEL_PX, renderHull, toSvg } from "../src/core/designer/hull/render";
import type { HullGeometry } from "../src/core/designer/hull/types";

const hull: HullGeometry = {
  spine: {
    length_m: 180,
    beam_m: 16,
    station_pitch_m: 3,
    stations: [
      { x: 0, half_height_m: 2 },
      { x: 40, half_height_m: 9.5 },
      { x: 150, half_height_m: 9.5 },
      { x: 180, half_height_m: 6 },
    ],
  },
  packing_efficiency: 0.78,
  sections: [
    { id: "fore", x0: 0, x1: 60, allowed: ["magazine"], pressurised: true },
    { id: "aft", x0: 60, x1: 180, allowed: ["drive", "reactor"] },
  ],
  armor_zones: [{ id: "bow", x0: 0, x1: 60, material: "steel", thickness_cm: 4 }],
  external_slots: [
    { id: "t1", x: 72, theta_deg: 0, type: "turret", size: "M" },
    { id: "r1", x: 140, theta_deg: 180, type: "radiator", size: "L" },
  ],
  appendages: [{ id: "a1", kind: "radiator", station: 96, attach_r: 9.5, outline: [[0, 0], [42, 0], [42, 9], [0, 9]] }],
};

const ids = (scene: ReturnType<typeof renderHull>) => scene.elements.map((e) => e.id);
const roles = (scene: ReturnType<typeof renderHull>) => new Set(scene.elements.map((e) => e.role));

describe("scene construction", () => {
  it("draws a closed, mirrored profile in hull-frame metres", () => {
    const scene = renderHull(hull);
    const path = scene.elements.find((e) => e.id === "hull");
    expect(path?.kind).toBe("path");
    if (path?.kind !== "path") return;
    // Starts at the bow half-height, closes back on itself.
    expect(path.d.startsWith("M 0 2")).toBe(true);
    expect(path.d.endsWith("Z")).toBe(true);
    // The mirror is in the path, not a transform: -9.5 appears on the way back.
    expect(path.d).toContain("-9.5");
  });

  it("keeps silhouette mode spare and schematic mode annotated", () => {
    const plate = renderHull(hull, { mode: "silhouette" });
    const schematic = renderHull(hull, { mode: "schematic" });
    expect(plate.mode).toBe("silhouette");
    expect(roles(plate).has("ruler")).toBe(false);
    expect(roles(plate).has("section")).toBe(false);
    expect(roles(schematic).has("ruler")).toBe(true);
    expect(roles(schematic).has("section")).toBe(true);
    expect(roles(schematic).has("axis")).toBe(true);
    expect(schematic.elements.length).toBeGreaterThan(plate.elements.length);
  });

  it("labels each section with its usable volume", () => {
    const scene = renderHull(hull, { mode: "schematic" });
    const label = scene.elements.find((e) => e.id === "section-label-fore");
    expect(label?.kind).toBe("text");
    if (label?.kind !== "text") return;
    expect(label.text).toMatch(/^fore · [\d,]+ m³$/);
  });

  it("draws the beam as a separate outline, because the section is elliptical", () => {
    const scene = renderHull(hull, { showBeam: true });
    const beam = scene.elements.find((e) => e.id === "beam");
    expect(beam?.kind).toBe("path");
    if (beam?.kind !== "path") return;
    expect(beam.d).toContain("8"); // beam 16 m → half-width 8 m
    expect(beam.d).not.toBe((scene.elements.find((e) => e.id === "hull") as { d: string }).d);
  });

  it("puts a dorsal slot above the axis and a ventral one below", () => {
    const scene = renderHull(hull, { slots: true });
    const turret = scene.elements.find((e) => e.id === "slot-t1");
    const radiator = scene.elements.find((e) => e.id === "slot-r1");
    expect(turret?.kind === "circle" && turret.cy).toBeGreaterThan(0);
    expect(radiator?.kind === "circle" && radiator.cy).toBeLessThan(0);
  });

  it("draws an appendage and its vertical mirror as two polygons", () => {
    const scene = renderHull(hull);
    expect(ids(scene)).toContain("appendage-a1");
    expect(ids(scene)).toContain("appendage-a1-m");
    const mirrored = scene.elements.find((e) => e.id === "appendage-a1-m");
    expect(mirrored?.kind === "polygon" && mirrored.points.every(([, y]) => y <= 0)).toBe(true);
  });

  it("overlays the radiation cone from the shield, clipped to the hull envelope", () => {
    const scene = renderHull(hull, { shadowCone: { x: 150, half_angle_deg: 15, facing: "forward" } });
    const cone = scene.elements.find((e) => e.id === "shadow-cone");
    expect(cone?.kind).toBe("polygon");
    if (cone?.kind !== "polygon") return;
    expect(cone.points[0]).toEqual([150, 0]); // apex at the shield

    // Drawn to true width this wedge reaches 150 * tan(15 deg) = 40 m and dwarfs a
    // hull under 19 m tall, hiding the one thing it is for: where the cone stops
    // covering the ship. It is clipped just past the envelope instead.
    const unclipped = 150 * Math.tan((15 * Math.PI) / 180);
    const drawn = Math.max(...cone.points.map(([, y]) => Math.abs(y)));
    expect(drawn).toBeLessThan(unclipped);
    expect(drawn).toBeGreaterThan(18.5); // still clears the tallest appendage
    expect(scene.bounds.y1).toBeLessThan(unclipped); // and no longer drives the bounds

    // The clip turns the triangle into a wedge that runs on to the hull end.
    expect(cone.points.length).toBeGreaterThan(3);
    expect(cone.points.some(([x]) => x === 0)).toBe(true); // reaches the bow
  });

  it("keeps the cone a plain triangle when it never reaches the clip", () => {
    const scene = renderHull(hull, { shadowCone: { x: 170, half_angle_deg: 2, facing: "forward" } });
    const cone = scene.elements.find((e) => e.id === "shadow-cone");
    expect(cone?.kind === "polygon" && cone.points).toHaveLength(3);
  });

  it("marks the centre of gravity when given one", () => {
    expect(roles(renderHull(hull)).has("overlay:cg")).toBe(false);
    expect(roles(renderHull(hull, { cgStation: 110 })).has("overlay:cg")).toBe(true);
  });

  it("draws the parent profile as a dashed ghost behind the hull", () => {
    const scene = renderHull(hull, { ghost: { spine: { ...hull.spine, length_m: 160 } } });
    const ghost = scene.elements.find((e) => e.id === "ghost");
    expect(ghost?.dashed).toBe(true);
    expect(scene.elements.indexOf(ghost!)).toBeLessThan(scene.elements.findIndex((e) => e.id === "hull"));
  });

  it("offers a person and a docking ring at true size", () => {
    const scene = renderHull(hull, { scaleFigures: true });
    const figure = scene.elements.find((e) => e.id === "figure");
    expect(figure?.kind === "line" && Math.abs(figure.y2 - figure.y1)).toBeCloseTo(1.8, 9); // 1.8 m tall
    const ring = scene.elements.find((e) => e.id === "ring");
    expect(ring?.kind === "circle" && ring.r * 2).toBeCloseTo(1.4, 9);
  });

  it("draws parts fitted by a later editor without letting them pass for hull", () => {
    // Editor 2 hangs modules on the external slots and they must appear in the
    // silhouette; this is the seam that makes "never store the SVG" worth it.
    const turret = { id: "t1", kind: "turret", station: 72, attach_r: 9.5, outline: [[-2, 0], [2, 0], [2, 4], [-2, 4]] as [number, number][] };
    const plain = renderHull(hull);
    const fitted = renderHull(hull, { fitted: [turret] });
    expect(ids(fitted)).toContain("fitted-t1");
    expect(ids(fitted)).toContain("fitted-t1-m"); // mirrors like any other flat part
    expect(fitted.elements.find((e) => e.id === "fitted-t1")?.role).toBe("fitted:turret");
    // Not an appendage: the hull record does not own it and a click must not say it does.
    expect(ids(fitted).filter((i) => i.startsWith("appendage-"))).toEqual(ids(plain).filter((i) => i.startsWith("appendage-")));
    // It counts towards the drawing's extent like hull structure does.
    expect(fitted.bounds.y1).toBeGreaterThanOrEqual(plain.bounds.y1);
  });

  it("bounds everything it drew", () => {
    const scene = renderHull(hull, { mode: "schematic", scaleFigures: true });
    expect(scene.bounds.x0).toBeLessThanOrEqual(0);
    expect(scene.bounds.x1).toBeGreaterThanOrEqual(180);
    for (const el of scene.elements) {
      if (el.kind !== "polygon") continue;
      for (const [x, y] of el.points) {
        expect(x).toBeGreaterThanOrEqual(scene.bounds.x0);
        expect(x).toBeLessThanOrEqual(scene.bounds.x1);
        expect(y).toBeGreaterThanOrEqual(scene.bounds.y0);
        expect(y).toBeLessThanOrEqual(scene.bounds.y1);
      }
    }
  });

  it("renders an empty hull without producing NaN", () => {
    const scene = renderHull({ spine: { length_m: 0, beam_m: 0, stations: [] } });
    expect(JSON.stringify(scene)).not.toContain("null");
    expect(Number.isFinite(scene.bounds.x1)).toBe(true);
  });
});

/**
 * Label sizes are in **screen pixels**, and both consumers have to agree about
 * that. They did not: `render.ts` authored metres, `HullCanvas` read pixels,
 * and the round trip cancelled so every on-screen label came out at 2.2-3 CSS
 * pixels at every zoom while the export stayed legible (`gallery/09` §3.1).
 * Nothing asserted which was right, so nothing caught it. These do.
 */
describe("label sizing", () => {
  const scene = renderHull(hull, { mode: "schematic", cgStation: 90 });
  const labels = scene.elements.filter((e) => e.kind === "text");

  it("draws some labels at all", () => {
    expect(labels.length).toBeGreaterThan(0);
  });

  it("authors every label in screen pixels, never in scene metres", () => {
    // The tell for the old bug: a size small enough to be a plausible metre
    // count is too small to be a legible pixel count. Anything under 10 is a
    // label authored in the wrong unit.
    for (const el of labels) {
      if (el.kind !== "text") continue;
      expect(el.size, `label ${el.id} is sized ${el.size} — metres, not pixels?`).toBeGreaterThanOrEqual(10);
    }
  });

  it("puts a label on the glass at the size the renderer asked for", () => {
    // The invariant both consumers share. `toSvg` emits user units against a
    // viewBox in metres, so font-size x pxPerMetre is the rendered pixel size;
    // `HullCanvas` divides by its own px/metre inside a metre-space group, for
    // exactly the same result. If these two ever disagree again, this fails.
    const fontSizes = (svg: string) => [...svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
    for (const k of [2, 4, 8, 16]) {
      const svg = toSvg(scene, { pxPerMetre: k });
      const rendered = fontSizes(svg).map((f) => f * k);
      expect(rendered.length).toBe(labels.length);
      for (const px of rendered) expect(px).toBeGreaterThanOrEqual(9.5); // rounding slack
      // Every rendered size is one of the sizes the scene actually asked for.
      const asked = new Set(labels.map((e) => (e.kind === "text" ? (e.size ?? LABEL_PX.fallback) : 0)));
      for (const px of rendered) expect([...asked].some((a) => Math.abs(a - px) < 0.5)).toBe(true);
    }
  });

  it("writes strokes in screen pixels too, so an export's outlines stay hairlines", () => {
    // Same bug, strokes instead of type: widths were written raw into a
    // metre viewBox, so a 1 px outline came out k pixels thick.
    for (const k of [2, 7]) {
      const svg = toSvg(renderHull(hull, { mode: "schematic" }), { pxPerMetre: k });
      const widths = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]) * k);
      expect(widths.length).toBeGreaterThan(0);
      for (const px of widths) expect(px).toBeLessThanOrEqual(2.5); // the thickest stroke the scene asks for is 2 px
    }
  });

  it("keeps a label the same size on screen however the export is scaled", () => {
    const fontOf = (svg: string) => Number(/font-size="([\d.]+)"/.exec(svg)?.[1]);
    // Twice the px/metre, half the user units — the glyph does not grow.
    expect(fontOf(toSvg(scene, { pxPerMetre: 8 }))).toBeCloseTo(fontOf(toSvg(scene, { pxPerMetre: 4 })) / 2, 2);
  });

  it("points every label's hover owner at an element that exists", () => {
    // `owner` is how a label borrows the hover state of the thing it annotates
    // (HullCanvas). A stale id would silently never enlarge.
    const present = new Set(ids(scene));
    for (const el of labels) {
      if (el.kind !== "text" || el.owner === undefined) continue;
      expect(present, `label ${el.id} owned by missing ${el.owner}`).toContain(el.owner);
    }
  });

  it("gives the section, slot, CG and ruler labels their named sizes", () => {
    const sizeOf = (id: string) => {
      const el = scene.elements.find((e) => e.id === id);
      return el?.kind === "text" ? el.size : undefined;
    };
    expect(sizeOf("section-label-fore")).toBe(LABEL_PX.section);
    expect(sizeOf("slot-label-t1")).toBe(LABEL_PX.slot);
    expect(sizeOf("cg-label")).toBe(LABEL_PX.cg);
    expect(sizeOf("tick-label-0")).toBe(LABEL_PX.rulerTick);
  });
});

describe("SVG serialisation", () => {
  it("emits a standalone SVG with a flipped y axis", () => {
    const svg = toSvg(renderHull(hull, { mode: "schematic", bowSide: "left" }), { title: "Test hull" });
    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("<title>Test hull</title>");
    // y is flipped once on the group so scene coordinates stay "metres above the axis".
    expect(svg).toContain("scale(1,-1)");
  });

  it("points the ship bow-right by default, matching the fleet plates", () => {
    // The record is always bow-at-zero; which way it faces is presentation.
    // Drawing +x rightward put the bow on the left and mirrored every ship
    // against the established art.
    expect(renderHull(hull).bowSide).toBe("right");
    const svg = toSvg(renderHull(hull, { mode: "schematic" }));
    expect(svg).toContain("scale(-1,-1)"); // x and y both flipped on the group
    expect(svg).not.toContain("scale(1,-1)>"); // and the group is not the unmirrored one
  });

  it("keeps the scene itself in hull coordinates whichever way it faces", () => {
    const left = renderHull(hull, { bowSide: "left" });
    const right = renderHull(hull, { bowSide: "right" });
    expect(right.bounds).toEqual(left.bounds);
    expect(right.elements).toEqual(left.elements);
  });

  it("counter-flips label glyphs on both axes when mirrored", () => {
    const svg = toSvg(renderHull(hull, { mode: "schematic" }));
    const label = /<text x="(-?[\d.]+)" y="(-?[\d.]+)" transform="([^"]+)"/.exec(svg);
    expect(label?.[3]).toBe("scale(-1,-1)"); // undoes the group, so text reads upright
    // Anchored at the negation of the scene point on each flipped axis.
    expect(Number(label?.[1])).toBeLessThanOrEqual(0);
  });

  it("writes every colour as a theme variable, never a literal", () => {
    const svg = toSvg(renderHull(hull, { mode: "schematic", scaleFigures: true, cgStation: 90, shadowCone: { x: 150, half_angle_deg: 15 } }));
    expect(svg).toMatch(/var\(--navy-800\)/);
    // No hex, rgb() or named colours anywhere in the output.
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\(/);
    expect(svg).not.toMatch(/(fill|stroke)="(?!var\(--|none)/);
  });

  it("uses only tokens that exist in theme.css", () => {
    const theme = readFileSync(join(__dirname, "..", "src", "theme.css"), "utf8");
    const declared = new Set([...theme.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const svg = toSvg(renderHull(hull, { mode: "schematic", scaleFigures: true, cgStation: 90, shadowCone: { x: 150, half_angle_deg: 15 } }));
    const used = new Set([...svg.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(0);
    const undeclared = [...used].filter((t) => !declared.has(t as string));
    expect(undeclared, "renderer invented a colour token").toEqual([]);
  });

  it("escapes text so a hull name cannot break the document", () => {
    const named: HullGeometry = { ...hull, sections: [{ id: "<script>&", x0: 0, x1: 10 }] };
    const svg = toSvg(renderHull(named, { mode: "schematic" }));
    expect(svg).toContain("&lt;script&gt;&amp;");
    expect(svg).not.toContain("<script>");
  });

  it("scales pixel size by pxPerMetre while the viewBox stays in metres", () => {
    const scene = renderHull(hull);
    const small = toSvg(scene, { pxPerMetre: 2 });
    const large = toSvg(scene, { pxPerMetre: 8 });
    const widthOf = (s: string) => Number(/width="(\d+)"/.exec(s)?.[1]);
    expect(widthOf(large)).toBeCloseTo(widthOf(small) * 4, -1);
    // Same viewBox: the drawing is in metres, only the presentation size changes.
    const viewBoxOf = (s: string) => /viewBox="([^"]+)"/.exec(s)?.[1];
    expect(viewBoxOf(large)).toBe(viewBoxOf(small));
  });
});
