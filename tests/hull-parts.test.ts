/**
 * External fittings.
 *
 * Two things are being protected. First, that a part is *generated* rather
 * than typed: a style kit that names a family with no geometry behind it draws
 * nothing, and a fleet only reads as one navy if the same generator runs
 * across every class. Second, that the silhouette shows external components
 * only — a magazine is section volume and must not appear.
 */
import { describe, it, expect } from "vitest";
import {
  bundle,
  familiesOf,
  makePart,
  partsForHull,
  partKindFor,
  radiatorRatio,
  slotIdOf,
  DEFAULT_RADIATOR_ASPECT,
  PART_KINDS,
  WEAPON_FAMILIES,
  type PartFamilies,
  type PartSpec,
  type PartsOptions,
  type RadiatorFamily,
  type View,
  type WeaponFamily,
} from "../src/core/designer/hull/parts";
import { beamAt, halfHeightAt, polygonArea } from "../src/core/designer/hull/geometry";
import { renderHull, slotAnchor } from "../src/core/designer/hull/render";
import type { HullGeometry } from "../src/core/designer/hull/types";

const hull: HullGeometry = {
  spine: {
    length_m: 120,
    beam_m: 12,
    station_pitch_m: 3,
    stations: [
      { x: 0, half_height_m: 2 },
      { x: 30, half_height_m: 6 },
      { x: 100, half_height_m: 6 },
      { x: 120, half_height_m: 4 },
    ],
  },
  external_slots: [
    { id: "t1", x: 30, theta_deg: 0, type: "turret", size: "M" },
    { id: "r1", x: 66, theta_deg: 180, type: "radiator", size: "L" },
    { id: "s1", x: 90, theta_deg: 90, type: "sensor", size: "S" }, // beam-on
    { id: "d1", x: 120, theta_deg: 0, type: "drive", size: "L" },
    { id: "sp", x: 12, theta_deg: 0, type: "spinal", size: "XL" },
  ],
};

describe("generating a part", () => {
  it("makes closed pieces with area for every kind", () => {
    for (const kind of PART_KINDS) {
      const pieces = makePart({ kind, size: "M" });
      expect(pieces.length, kind).toBeGreaterThanOrEqual(1);
      for (const o of pieces) {
        expect(o.length, kind).toBeGreaterThanOrEqual(3);
        expect(polygonArea(o), kind).toBeGreaterThan(0);
        expect(o.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), kind).toBe(true);
      }
    }
  });

  it("keeps separate pieces separate rather than folding them into one ring", () => {
    // Concatenated into one point list, a cluster thruster fills as a bowtie
    // and a gun barrel as a wedge: SVG's nonzero rule on a self-intersecting
    // polygon. These have to stay distinct polygons.
    expect(makePart({ kind: "thruster", size: "M", families: { thruster: "cluster" } })).toHaveLength(2);
    expect(makePart({ kind: "turret", size: "M", weapon: "gun" })).toHaveLength(2); // mounting + barrel
    expect(makePart({ kind: "turret", size: "M", weapon: "cell", cells: 4 })).toHaveLength(5); // deck + 4 hatches
    // A point-defence mount is a CIWS (`CIWS_side.png`): body, mast, dish,
    // shroud, barrels. It was three stacked boxes before the reference existed.
    expect(makePart({ kind: "pd", size: "M" })).toHaveLength(5);
    expect(makePart({ kind: "radiator", size: "M", families: { radiator: "fin" } })).toHaveLength(1);
  });

  it("grows with the size class", () => {
    const area = (s: "S" | "M" | "L" | "XL") => makePart({ kind: "radiator", size: s }).reduce((a, o) => a + polygonArea(o), 0);
    expect(area("S")).toBeLessThan(area("M"));
    expect(area("M")).toBeLessThan(area("L"));
    expect(area("L")).toBeLessThan(area("XL"));
  });

  it("accepts a size in metres as well as a class", () => {
    const area = (size: number | "L") => makePart({ kind: "tank", size }).reduce((a, o) => a + polygonArea(o), 0);
    expect(area(20)).toBeGreaterThan(area("L"));
  });

  it("stands outward from the skin, centred on its slot", () => {
    const o = makePart({ kind: "turret", size: "M" }).flat();
    expect(Math.min(...o.map(([, y]) => y))).toBe(0); // sits on the hull, never sunk into it
    expect(Math.max(...o.map(([, y]) => y))).toBeGreaterThan(0);
    const xs = o.map(([x]) => x);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(0);
  });

  it("gives each radiator family a visibly different shape", () => {
    const shapes = (["fin", "panel", "droplet-boom", "spine-array", "hoop", "membrane"] as const).map((radiator) =>
      JSON.stringify(makePart({ kind: "radiator", size: "L", families: { radiator } })),
    );
    expect(new Set(shapes).size).toBe(6);
  });

  it("varies a radiator within its family by array size and sweep", () => {
    // Two classes in the same navy differ by this, not by changing family.
    const arr = (panels: number) => makePart({ kind: "radiator", size: "L", families: { radiator: "fin" }, panels });
    expect(arr(1)).toHaveLength(1);
    expect(arr(4)).toHaveLength(4);
    const raked = (sweep_deg: number) => JSON.stringify(makePart({ kind: "radiator", size: "L", families: { radiator: "fin" }, sweep_deg }));
    expect(raked(30)).not.toBe(raked(0));
    expect(raked(30)).not.toBe(raked(-30)); // forward and reverse sweep differ
  });

  it("draws every weapon family differently", () => {
    // A CIWS must not read as a railgun, a VLS must not read as a particle
    // beam. Weapons that work the same way share a shape; the rest do not.
    const families: WeaponFamily[] = ["gun", "cell", "rocket", "arm", "laser", "plasma", "particle", "ciws"];
    const shapes = families.map((weapon) => JSON.stringify(makePart({ kind: "turret", size: "M", weapon })));
    expect(new Set(shapes).size).toBe(families.length);
  });

  it("scales a gun by its bore and barrel count instead of redrawing it", () => {
    // A 450 mm Mk66 and a 300 mm Mk81 work the same way, so they are the same
    // shape at different scales. That is the point of the shared family.
    const gun = (bore_mm: number, barrels = 1) => makePart({ kind: "turret", size: "M", weapon: "gun", bore_mm, barrels });
    const reach = (bore_mm: number, barrels = 1) => -Math.min(...gun(bore_mm, barrels).flat().map(([x]) => x));
    expect(reach(450)).toBeGreaterThan(reach(300)); // bigger bore, longer barrel
    expect(gun(300, 1)).toHaveLength(2);
    expect(gun(300, 3)).toHaveLength(4); // gunhouse plus one tube each
    const house = (barrels: number) => {
      const xs = gun(300, barrels)[0]!.map(([x]) => x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(house(3)).toBeGreaterThan(house(1)); // more barrels, longer gunhouse
  });

  it("scales a launcher by how many cells it has", () => {
    // Cells are laid out as a block, so side-on only the row along the hull
    // shows and from above every cell does. Eight cells used to draw as eight
    // hatches in a line, which is a launcher twice as long as it is.
    const cells = (n: number, view?: View) => makePart({ kind: "turret", size: "M", weapon: "cell", cells: n }, view);
    expect(cells(4)).toHaveLength(5); // deck + a row of 4
    expect(cells(8)).toHaveLength(5); // deck + a row of 4; the other row is behind it
    expect(cells(8, "plan")).toHaveLength(9); // deck + all 8
  });

  it("does not confuse point defence with a main turret", () => {
    expect(JSON.stringify(makePart({ kind: "pd", size: "M" }))).not.toBe(JSON.stringify(makePart({ kind: "turret", size: "M" })));
  });
});

describe("placing parts on a hull", () => {
  it("puts a dorsal part above the skin and a ventral one below", () => {
    const parts = partsForHull(hull);
    const t = parts.find((p) => p.id === "t1");
    const r = parts.find((p) => p.id === "r1");
    expect(t?.attach_r).toBeCloseTo(6, 9); // the profile half-height at station 30
    expect(r?.attach_r).toBeCloseTo(-6, 9);
    expect(t?.outline.every(([, y]) => y >= 0)).toBe(true);
    expect(r?.outline.every(([, y]) => y <= 0)).toBe(true);
  });

  it("mirrors a radiator array and nothing else", () => {
    // A radiator array is radially symmetric about the thrust axis: panels
    // below mean panels above, from one slot. Every other fitting sits at one
    // clock angle and is a single thing.
    for (const p of partsForHull(hull)) expect(p.mirror, p.id).toBe(p.kind === "radiator" ? "vertical" : "none");
  });

  it("draws a ventral radiator on both sides of the axis", () => {
    const scene = renderHull(hull, { fitted: partsForHull(hull) });
    const ids = scene.elements.map((e) => e.id);
    expect(ids).toContain("fitted-r1"); // the ventral array
    expect(ids).toContain("fitted-r1-m"); // and its dorsal mirror
    const ys = scene.elements
      .filter((e) => e.kind === "polygon" && e.id.startsWith("fitted-r1"))
      .flatMap((e) => (e.kind === "polygon" ? e.points.map(([, y]) => y) : []));
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBeGreaterThan(0);
  });

  it("draws a beam-on slot as seen down its own axis, and as a far fitting", () => {
    // At 90° the fitting points at the viewer, so side-on it is its plan view
    // — not an invented projection, the part's own top view. It used to draw
    // nothing at all, which is why side batteries were invisible. Port and
    // starboard project onto the same place, so it is drawn as a hidden line.
    const s1 = partsForHull(hull).filter((p) => slotIdOf(p.id) === "s1");
    expect(s1.length).toBeGreaterThan(0);
    expect(s1.every((p) => p.far === true && p.plane === "profile")).toBe(true);
    expect(s1[0]?.attach_r).toBeCloseTo(0, 9); // a·cos 90°: on the axis
    expect(JSON.stringify(s1.map((p) => p.outline))).toBe(JSON.stringify(makePart({ kind: "radar", size: "S" }, "plan")));
  });

  it("reads a mount at 345° as dorsal, like one at 15°", () => {
    // Everything from 135° round to 360° used to count as ventral, so a mount
    // 15° off the dorsal line to port hung upside down under the hull.
    const tilted = { ...hull, external_slots: [{ id: "t", x: 30, theta_deg: 345, type: "turret", size: "M" }] };
    const t = partsForHull(tilted).find((p) => p.id === "t");
    expect(t?.attach_r).toBeGreaterThan(0);
    expect(t?.outline.every(([, y]) => y >= 0)).toBe(true);
  });

  it("draws nothing for a slot type with no external appearance", () => {
    // An empty spinal slot is buried in the hull with nothing to show.
    expect(partsForHull(hull).map((p) => p.id)).not.toContain("sp");
  });

  it("draws a fitted spinal mount as its weapon's profile, along the axis", () => {
    // Ruled 2026-09-21: borrow the side profile until purpose-built spinal
    // glyphs exist. It is inside the hull, so it is a hidden line.
    const sp = partsForHull(hull, { weapons: { sp: { weapon: "gun", bore_mm: 600 } } }).filter((p) => slotIdOf(p.id) === "sp");
    expect(sp.length).toBeGreaterThan(1); // gunhouse and barrel
    expect(sp.every((p) => p.far === true && p.attach_r === 0)).toBe(true);
    const ys = sp.flatMap((p) => p.outline.map(([, y]) => y));
    expect(Math.min(...ys)).toBeCloseTo(-Math.max(...ys), 9); // straddles the axis
  });

  it("turns a drive slot into a thruster", () => {
    expect(partsForHull(hull).find((p) => p.id === "d1")?.kind).toBe("thruster");
  });

  it("carries the polity's families through to every part", () => {
    const families: PartFamilies = { radiator: "fin", turret: "barbette" };
    const withKit = partsForHull(hull, { families });
    const plain = partsForHull(hull);
    expect(JSON.stringify(withKit)).not.toBe(JSON.stringify(plain));
  });

  it("takes the weapon editor 2 will supply, bore and all", () => {
    const fitting = (weapons?: PartsOptions["weapons"]) => partsForHull(hull, { weapons }).filter((p) => slotIdOf(p.id) === "t1");
    expect(JSON.stringify(fitting({ t1: { weapon: "laser" } }))).not.toBe(JSON.stringify(fitting()));
    // Bore alone changes the drawing, without changing the family.
    expect(JSON.stringify(fitting({ t1: { weapon: "gun", bore_mm: 450 } }))).not.toBe(JSON.stringify(fitting({ t1: { weapon: "gun", bore_mm: 120 } })));
  });

  it("names extra pieces after their slot, so a click reaches the fitting", () => {
    const pieces = partsForHull(hull).filter((p) => slotIdOf(p.id) === "t1");
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces[0]?.id).toBe("t1");
    expect(pieces.every((p) => slotIdOf(p.id) === "t1")).toBe(true);
  });

  it("lets a slot override the kit, for a captured or export hull", () => {
    const captured = { ...hull, external_slots: [{ id: "t1", x: 30, theta_deg: 0, type: "turret", size: "M", part: "radiator" }] };
    expect(partsForHull(captured)[0]?.kind).toBe("radiator");
    expect(partKindFor({ id: "x", x: 0, theta_deg: 0, type: "turret", size: "M", part: "optics" })).toBe("optics");
    // An override nobody recognises falls back to the slot's own type.
    expect(partKindFor({ id: "x", x: 0, theta_deg: 0, type: "turret", size: "M", part: "nonsense" })).toBe("turret");
  });

  it("survives a hull with no slots at all", () => {
    expect(partsForHull({ spine: { length_m: 10, beam_m: 2, stations: [] } })).toEqual([]);
  });
});

/** Width along the hull and height outward of a set of pieces. */
const extent = (pieces: [number, number][][]) => {
  const pts = pieces.flat();
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
const SIZES = ["S", "M", "L", "XL"] as const;
const RADIATOR_FAMILIES: RadiatorFamily[] = ["fin", "panel", "droplet-boom", "spine-array", "hoop", "membrane"];

describe("growth is per family, not uniform (gallery/09 §1.2)", () => {
  it("lengthens a gun's barrel faster than it grows the gunhouse", () => {
    const gun = (size: (typeof SIZES)[number]) => makePart({ kind: "turret", size, weapon: "gun", bore_mm: 300 });
    const house = (size: (typeof SIZES)[number]) => extent([gun(size)[0]!]);
    const reach = (size: (typeof SIZES)[number]) => -Math.min(...gun(size).flat().map(([x]) => x));
    // Both grow...
    expect(house("XL").w).toBeGreaterThan(house("M").w);
    expect(house("XL").h).toBeGreaterThan(house("M").h);
    expect(reach("XL")).toBeGreaterThan(reach("M"));
    // ...the barrel faster. An XL gun used to be exactly as fat as it was long.
    expect(reach("XL") / house("XL").h).toBeGreaterThan(reach("M") / house("M").h);
  });

  it("gives a bigger launcher more cells at the same pitch", () => {
    const hatches = (size: (typeof SIZES)[number]) => makePart({ kind: "turret", size, weapon: "cell" }, "plan").slice(1);
    expect(SIZES.map((s) => hatches(s).length)).toEqual([2, 4, 8, 14]);
    const widths = SIZES.map((s) => extent([hatches(s)[0]!]).w);
    for (const w of widths) expect(w).toBeCloseTo(widths[0]!, 9); // never a wider cell
  });

  it("gives a bigger rocket launcher more tubes, never fatter ones", () => {
    const tubes = (size: (typeof SIZES)[number]) => makePart({ kind: "turret", size, weapon: "rocket" }, "plan").slice(1);
    const counts = SIZES.map((s) => tubes(s).length);
    expect(counts[3]).toBeGreaterThan(counts[0]!);
    const across = SIZES.map((s) => extent([tubes(s)[0]!]).h);
    for (const d of across) expect(d).toBeCloseTo(across[0]!, 9);
  });

  it("lays 18 rocket tubes out the way the reference shows them", () => {
    // rocket_side.png: three rows. rocket_top.png: six abreast.
    expect(bundle(18)).toEqual({ rows: 3, cols: 6 });
    expect(makePart({ kind: "turret", weapon: "rocket", cells: 18 })).toHaveLength(2 + 3);
    expect(makePart({ kind: "turret", weapon: "rocket", cells: 18 }, "plan")).toHaveLength(1 + 6);
  });

  it("keeps a laser and a spherical tank spherical at every size", () => {
    for (const spec of [{ kind: "turret", weapon: "laser" }, { kind: "tank", families: { tank: "spherical" } }] as PartSpec[]) {
      const ratio = (size: (typeof SIZES)[number]) => {
        const e = extent(makePart({ ...spec, size }));
        return e.h / e.w;
      };
      for (const s of SIZES) expect(ratio(s), `${spec.kind} ${s}`).toBeCloseTo(ratio("M"), 9);
    }
  });

  it("lengthens a barrel tank far more than it thickens it", () => {
    const e = (size: (typeof SIZES)[number]) => extent(makePart({ kind: "tank", size, families: { tank: "barrel" } }));
    expect(e("XL").w / e("M").w).toBeGreaterThan(2 * (e("XL").h / e("M").h));
  });

  it("grows a radiator outward and never along the hull", () => {
    for (const radiator of RADIATOR_FAMILIES) {
      const e = SIZES.map((size) => extent(makePart({ kind: "radiator", size, families: { radiator } })));
      for (const x of e) expect(x.w, radiator).toBeCloseTo(e[1]!.w, 9);
      expect(e[3]!.h, radiator).toBeGreaterThan(e[1]!.h);
    }
  });
});

describe("radiators stay taller than wide (ruled 2026-09-20)", () => {
  it("holds for every family, size and aspect — membrane included", () => {
    for (const radiator of RADIATOR_FAMILIES) {
      for (const size of SIZES) {
        for (const radiator_aspect of [0.4, 1, DEFAULT_RADIATOR_ASPECT, 2.5]) {
          const e = extent(makePart({ kind: "radiator", size, families: { radiator, radiator_aspect } }));
          expect(e.h, `${radiator} ${size} @${radiator_aspect}`).toBeGreaterThanOrEqual(e.w - 1e-9);
        }
      }
    }
  });

  it("draws the default family at exactly the kit's aspect and keeps the others' character", () => {
    expect(radiatorRatio("panel", 1.8)).toBeCloseTo(1.8, 12);
    expect(radiatorRatio("fin", 1.35)).toBeGreaterThan(radiatorRatio("panel", 1.35));
    expect(radiatorRatio("panel", 1.35)).toBeGreaterThan(radiatorRatio("membrane", 1.35));
    // Membrane was 0.75 — wider than tall. The floor is what changes it.
    expect(radiatorRatio("membrane", 1.35)).toBeGreaterThanOrEqual(1);
  });

  it("reads the aspect from the style kit and will not let it go below 1", () => {
    expect(familiesOf({ radiator_aspect: 2 }).radiator_aspect).toBe(2);
    expect(familiesOf({ radiator_aspect: 0.6 }).radiator_aspect).toBe(1);
    expect(familiesOf({}).radiator_aspect).toBeUndefined(); // the default is the generator's, not the kit's
    const tall = extent(makePart({ kind: "radiator", families: { radiator: "fin", radiator_aspect: 2 } }));
    const plain = extent(makePart({ kind: "radiator", families: { radiator: "fin" } }));
    expect(tall.h).toBeGreaterThan(plain.h);
    expect(tall.w).toBeCloseTo(plain.w, 9);
  });
});

describe("two views from one generator (gallery/09 §1.4)", () => {
  const every: PartSpec[] = [...PART_KINDS.map((kind) => ({ kind }) as PartSpec), ...WEAPON_FAMILIES.map((weapon) => ({ kind: "turret", weapon }) as PartSpec)];

  it("gives every kind and weapon a closed plan view with area", () => {
    for (const spec of every) {
      const pieces = makePart({ ...spec, size: "M" }, "plan");
      expect(pieces.length, JSON.stringify(spec)).toBeGreaterThanOrEqual(1);
      for (const o of pieces) {
        expect(o.length).toBeGreaterThanOrEqual(3);
        expect(polygonArea(o), JSON.stringify(spec)).toBeGreaterThan(0);
      }
    }
  });

  it("draws every weapon family differently from above, too", () => {
    const shapes = WEAPON_FAMILIES.map((weapon) => JSON.stringify(makePart({ kind: "turret", size: "M", weapon }, "plan")));
    expect(new Set(shapes).size).toBe(WEAPON_FAMILIES.length);
  });

  it("gives every weapon a plan that is not just its profile again", () => {
    for (const weapon of WEAPON_FAMILIES) {
      const spec: PartSpec = { kind: "turret", size: "M", weapon };
      expect(JSON.stringify(makePart(spec, "plan")), weapon).not.toBe(JSON.stringify(makePart(spec)));
    }
  });

  it("centres a plan view across the part's own axis", () => {
    for (const spec of every) {
      const ys = makePart({ ...spec, size: "M" }, "plan").flat().map(([, y]) => y);
      expect(Math.max(...ys) + Math.min(...ys), JSON.stringify(spec)).toBeCloseTo(0, 6);
    }
  });

  it("draws a thruster the same both ways, because a nozzle is round", () => {
    expect(makePart({ kind: "thruster" }, "plan")).toEqual(makePart({ kind: "thruster" }));
  });

  it("shows a radiator edge-on from above", () => {
    const side = extent(makePart({ kind: "radiator", size: "L" }));
    const top = extent(makePart({ kind: "radiator", size: "L" }, "plan"));
    expect(top.w).toBeCloseTo(side.w, 9);
    expect(top.h).toBeLessThan(side.h / 10);
  });
});

describe("placing parts in the plan view", () => {
  const plan = (options: PartsOptions = {}) => partsForHull(hull, { ...options, view: "plan" });

  it("shows a dorsal mount from above, over the centreline", () => {
    const t1 = plan().filter((p) => slotIdOf(p.id) === "t1");
    expect(t1[0]?.attach_r).toBeCloseTo(0, 9);
    expect(t1.every((p) => !p.far && p.plane === "plan")).toBe(true);
    expect(JSON.stringify(t1.map((p) => p.outline))).toBe(JSON.stringify(makePart({ kind: "turret", size: "M" }, "plan")));
  });

  it("shows a ventral mount as hidden under the hull", () => {
    expect(plan().filter((p) => slotIdOf(p.id) === "r1").every((p) => p.far === true)).toBe(true);
  });

  it("stands a starboard mount off the beam edge, side-on, pointing outboard", () => {
    const s1 = plan().filter((p) => slotIdOf(p.id) === "s1");
    expect(s1[0]?.attach_r).toBeCloseTo(-beamAt(hull.spine, 90) / 2, 9); // starboard is −y, bow to the right
    expect(s1.every((p) => !p.far)).toBe(true);
    expect(s1.flatMap((p) => p.outline).every(([, y]) => y <= 1e-9)).toBe(true);
  });

  it("mirrors a beam radiator to the other beam, and only a radiator", () => {
    const beamy: HullGeometry = {
      ...hull,
      external_slots: [
        { id: "r", x: 60, theta_deg: 270, type: "radiator", size: "L" },
        { id: "g", x: 30, theta_deg: 270, type: "turret", size: "M" },
      ],
    };
    const parts = partsForHull(beamy, { view: "plan" });
    expect(parts.find((p) => p.id === "r")?.mirror).toBe("vertical");
    expect(parts.find((p) => p.id === "g")?.mirror).toBe("none");
  });

  it("agrees with the renderer about where every slot is", () => {
    // The dorsal and beam cases of partsForHull and slotAnchor are the same
    // projection, computed twice; they must not drift apart.
    for (const view of ["profile", "plan"] as View[]) {
      for (const slot of hull.external_slots ?? []) {
        if (slot.type === "spinal" || slot.type === "drive") continue;
        const part = partsForHull(hull, { view }).find((p) => p.id === slot.id);
        if (!part) continue;
        const beamOn = Math.abs(Math.sin((slot.theta_deg * Math.PI) / 180)) > Math.SQRT1_2;
        if ((view === "profile") === beamOn) expect(part.attach_r, `${slot.id} ${view}`).toBeCloseTo(slotAnchor(hull, slot, view).y, 3);
      }
    }
  });
});

describe("rendering the plan view", () => {
  it("outlines the hull by its beam from above", () => {
    const side = renderHull(hull);
    const top = renderHull(hull, { view: "plan" });
    expect(top.view).toBe("plan");
    const d = (s: ReturnType<typeof renderHull>) => (s.elements.find((e) => e.id === "hull") as { d: string }).d;
    expect(d(top)).not.toBe(d(side));
    expect(d(top)).toContain(` ${beamAt(hull.spine, 60) / 2} `); // half-beam 6 m
  });

  it("draws the height as the secondary outline from above", () => {
    const ids = renderHull(hull, { view: "plan", mode: "schematic" }).elements.map((e) => e.id);
    expect(ids).toContain("height");
    expect(ids).not.toContain("beam");
  });

  it("draws a far part outline-only and dashed, under its own role", () => {
    const scene = renderHull(hull, { fitted: partsForHull(hull) });
    const s1 = scene.elements.find((e) => e.id === "fitted-s1");
    expect(s1?.role).toBe("fitted:far:radar");
    expect(s1?.fill).toBeUndefined();
    expect(s1?.dashed).toBe(true);
    expect(scene.elements.find((e) => e.id === "fitted-t1")?.role).toBe("fitted:turret");
  });

  it("draws an appendage only in the view it was authored for", () => {
    const withBoth: HullGeometry = {
      ...hull,
      appendages: [
        { id: "side", kind: "greeble", station: 40, outline: [[0, 0], [2, 0], [2, 1], [0, 1]] },
        { id: "top", kind: "greeble", station: 50, plane: "plan", outline: [[0, 0], [2, 0], [2, 1], [0, 1]] },
      ],
    };
    const ids = (view: View) => renderHull(withBoth, { view }).elements.map((e) => e.id);
    expect(ids("profile")).toContain("appendage-side");
    expect(ids("profile")).not.toContain("appendage-top");
    expect(ids("plan")).toContain("appendage-top");
    expect(ids("plan")).not.toContain("appendage-side");
  });

  it("puts a plan appendage on the beam edge by default", () => {
    const withTop: HullGeometry = { ...hull, spine: { ...hull.spine, beam_m: 20 }, appendages: [{ id: "top", kind: "greeble", station: 50, plane: "plan", outline: [[0, 0], [2, 0], [2, 1], [0, 1]] }] };
    const poly = renderHull(withTop, { view: "plan" }).elements.find((e) => e.id === "appendage-top");
    const ys = poly?.kind === "polygon" ? poly.points.map(([, y]) => y) : [];
    expect(Math.min(...ys)).toBeCloseTo(beamAt(withTop.spine, 50) / 2, 9); // 10 m, where the half-height is 6
    expect(Math.min(...ys)).not.toBeCloseTo(halfHeightAt(hull.spine, 50), 3);
  });

  it("marks a slot at 15° near the top of the profile, not on the axis", () => {
    // The renderer used to put anything that was not exactly 0° or 180° on
    // the centreline, while the canvas put the same slot's handle on the skin.
    const a = slotAnchor(hull, { x: 30, theta_deg: 15 });
    expect(a.y).toBeCloseTo(halfHeightAt(hull.spine, 30) * Math.cos((15 * Math.PI) / 180), 3);
  });
});

describe("reaching the silhouette", () => {
  it("appears through the renderer's fitted seam, under its own role", () => {
    const parts = partsForHull(hull, { families: { radiator: "fin" } });
    const scene = renderHull(hull, { fitted: parts });
    const ids = scene.elements.map((e) => e.id);
    expect(ids).toContain("fitted-t1");
    expect(ids).toContain("fitted-r1");
    expect(scene.elements.find((e) => e.id === "fitted-r1")?.role).toBe("fitted:radiator");
  });

  it("widens the drawing, because a radiator is the tallest thing on most ships", () => {
    const bare = renderHull(hull);
    const fitted = renderHull(hull, { fitted: partsForHull(hull) });
    expect(fitted.bounds.y0).toBeLessThan(bare.bounds.y0); // the ventral radiator reaches down
  });

  it("keeps internal components out of the silhouette entirely", () => {
    // A magazine is section volume. It has no slot, so there is nothing to draw
    // and no way for it to leak into the plate.
    const withMagazine: HullGeometry = { ...hull, sections: [{ id: "magazine", x0: 20, x1: 50, allowed: ["magazine"] }] };
    const parts = partsForHull(withMagazine);
    expect(parts.map((p) => p.id)).not.toContain("magazine");
    expect(parts.every((p) => (withMagazine.external_slots ?? []).some((s) => s.id === slotIdOf(p.id)))).toBe(true);
  });
});
