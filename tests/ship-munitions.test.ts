/**
 * Round mass and volume from calibre.
 *
 * The three anchors were ruled by the vault owner on 2026-09-20 and are the
 * only figures here that are not derived; everything else has to pass through
 * them exactly. That is what these tests pin — not that the curve is *right*,
 * which is a judgement, but that it is the curve the ruling describes.
 */
import { describe, it, expect } from "vitest";
import { roundSize, readRoundAnchors, DEFAULT_ROUND_ANCHORS, type RoundAnchor } from "../src/core/designer/ship/munitions";

describe("the ruled anchors", () => {
  it("come back exactly, because they are the data and not a fit", () => {
    for (const a of DEFAULT_ROUND_ANCHORS) {
      const size = roundSize(a.calibre_mm);
      expect(size?.mass_kg, `${a.calibre_mm} mm mass`).toBeCloseTo(a.mass_kg, 9);
      expect(size?.volume_m3, `${a.calibre_mm} mm volume`).toBeCloseTo(a.volume_m3, 12);
      expect(size?.extrapolated, `${a.calibre_mm} mm`).toBe(false);
    }
  });

  it("are the figures that were ruled", () => {
    expect(DEFAULT_ROUND_ANCHORS).toEqual([
      { calibre_mm: 20, mass_kg: 0.25, volume_m3: 0.0025 },
      { calibre_mm: 120, mass_kg: 22, volume_m3: 0.05 },
      { calibre_mm: 450, mass_kg: 1315, volume_m3: 0.8 },
    ]);
  });
});

describe("between the anchors", () => {
  it("rises monotonically in both mass and volume", () => {
    let lastMass = 0;
    let lastVolume = 0;
    for (let d = 10; d <= 700; d += 5) {
      const size = roundSize(d);
      expect(size, `${d} mm`).toBeDefined();
      expect(size?.mass_kg, `${d} mm mass`).toBeGreaterThan(lastMass);
      expect(size?.volume_m3, `${d} mm volume`).toBeGreaterThan(lastVolume);
      lastMass = size?.mass_kg as number;
      lastVolume = size?.volume_m3 as number;
    }
  });

  it("makes stowage denser as the calibre grows, which is the point of three anchors", () => {
    // One power law would hold the density flat. A belt of 20 mm is mostly
    // links and air; a 450 mm shell in its rack is mostly metal.
    const density = (d: number) => {
      const s = roundSize(d) as { mass_kg: number; volume_m3: number };
      return s.mass_kg / s.volume_m3;
    };
    expect(density(20)).toBeCloseTo(100, 0);
    expect(density(120)).toBeCloseTo(440, 0);
    expect(density(450)).toBeCloseTo(1644, 0);
    expect(density(250)).toBeGreaterThan(density(120));
    expect(density(250)).toBeLessThan(density(450));
  });

  it("puts a 250 mm shell between its neighbours where a designer would expect it", () => {
    const s = roundSize(250) as { mass_kg: number; volume_m3: number };
    expect(s.mass_kg).toBeGreaterThan(22);
    expect(s.mass_kg).toBeLessThan(1315);
    expect(s.mass_kg).toBeCloseTo(213.3, 0);
  });
});

describe("outside the anchors", () => {
  it("extends the nearest segment and says that it did", () => {
    const small = roundSize(15);
    const large = roundSize(600);
    expect(small?.extrapolated).toBe(true);
    expect(large?.extrapolated).toBe(true);
    // Still positive and still ordered — the reason for a log-log fit rather
    // than a cubic, which would dive negative below the smallest anchor.
    expect(small?.mass_kg).toBeGreaterThan(0);
    expect(small?.mass_kg).toBeLessThan(0.25);
    expect(large?.mass_kg).toBeGreaterThan(1315);
  });
});

describe("degenerate input", () => {
  it("returns nothing rather than a guess when there is no curve to interpolate", () => {
    expect(roundSize(0)).toBeUndefined();
    expect(roundSize(-5)).toBeUndefined();
    // One anchor is a point, not a curve.
    expect(roundSize(100, [{ calibre_mm: 120, mass_kg: 22, volume_m3: 0.05 }])).toBeUndefined();
    expect(roundSize(100, [])).toBeUndefined();
  });

  it("ignores an anchor that is not a usable point", () => {
    const messy: RoundAnchor[] = [
      { calibre_mm: 0, mass_kg: 1, volume_m3: 1 },
      { calibre_mm: 20, mass_kg: 0.25, volume_m3: 0.0025 },
      { calibre_mm: 120, mass_kg: 22, volume_m3: 0.05 },
    ];
    expect(roundSize(120, messy)?.mass_kg).toBeCloseTo(22, 9);
  });

  it("takes the anchors in any order", () => {
    const shuffled = [...DEFAULT_ROUND_ANCHORS].reverse();
    expect(roundSize(250, shuffled)?.mass_kg).toBeCloseTo(roundSize(250)?.mass_kg as number, 9);
  });
});

describe("readRoundAnchors", () => {
  it("takes what a table declares", () => {
    const meta = { round_scale: { anchors: [{ calibre_mm: 10, mass_kg: 1, volume_m3: 0.01 }, { calibre_mm: 100, mass_kg: 100, volume_m3: 0.5 }] } };
    expect(readRoundAnchors(meta)).toHaveLength(2);
    expect(roundSize(100, readRoundAnchors(meta))?.mass_kg).toBeCloseTo(100, 9);
  });

  it("falls back to the ruling for a table that predates it", () => {
    expect(readRoundAnchors(undefined)).toEqual(DEFAULT_ROUND_ANCHORS);
    expect(readRoundAnchors({})).toEqual(DEFAULT_ROUND_ANCHORS);
    // One usable anchor is not a curve, so the ruled set stands.
    expect(readRoundAnchors({ round_scale: { anchors: [{ calibre_mm: 20, mass_kg: 0.25, volume_m3: 0.0025 }] } })).toEqual(DEFAULT_ROUND_ANCHORS);
  });
});
