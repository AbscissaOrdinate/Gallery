/**
 * Hull advisories: everything editor 1 can check from the hull record alone.
 *
 * The load-bearing property is the one `docs/CLAUDE.md` states — nothing is
 * ever blocked from saving — so these tests check that the kernel *reports*
 * and never throws, and that a clean hull is genuinely silent rather than
 * quietly noisy.
 */
import { describe, it, expect } from "vitest";
import { hullAdvisories, type AdvisoryContext } from "../src/core/designer/hull/advisories";
import { byDomain, sortViolations } from "../src/core/designer/violations";
import type { HullGeometry } from "../src/core/designer/hull/types";

/** A well-formed hull: sections cover it, slots sit on the 3 m grid, nothing overlaps. */
const clean: HullGeometry = {
  spine: {
    length_m: 180,
    beam_m: 16,
    station_pitch_m: 3,
    stations: [
      { x: 0, half_height_m: 3 },
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
  external_slots: [
    { id: "t1", x: 72, theta_deg: 0, type: "turret", size: "M" },
    { id: "r1", x: 141, theta_deg: 180, type: "radiator", size: "L" },
  ],
  appendages: [{ id: "a1", kind: "radiator", station: 96, attach_r: 9.5, outline: [[0, 0], [42, 0], [42, 9], [0, 9]] }],
};

/** Deep-ish clone so a test's mutation cannot leak into the next one. */
const edit = (patch: (h: HullGeometry) => void): HullGeometry => {
  const h = JSON.parse(JSON.stringify(clean)) as HullGeometry;
  patch(h);
  return h;
};
const messages = (h: HullGeometry, ctx?: AdvisoryContext) => hullAdvisories(h, ctx).map((v) => v.message);
const find = (h: HullGeometry, re: RegExp, ctx?: AdvisoryContext) => hullAdvisories(h, ctx).find((v) => re.test(v.message));

describe("a clean hull", () => {
  it("says nothing at all", () => {
    expect(hullAdvisories(clean)).toEqual([]);
  });

  it("still says nothing when it is handed a style kit and a bus it conforms to", () => {
    const ctx: AdvisoryContext = {
      style: { id: "ans", ld_ratio_min: 4, ld_ratio_max: 20, max_beam_m: 20 },
      bus: { id: "ans-mk2", station_pitch_m: 3, mount_ifaces: ["turret", "radiator"] },
    };
    expect(hullAdvisories(clean, ctx)).toEqual([]);
  });
});

describe("spine", () => {
  it("reports a hull with no length once, and stops there", () => {
    const vs = hullAdvisories(edit((h) => (h.spine.length_m = 0)));
    expect(vs).toHaveLength(1);
    expect(vs[0]?.severity).toBe("error");
    expect(vs[0]?.field).toBe("spine.length_m");
  });

  it("wants at least two stations", () => {
    expect(find(edit((h) => (h.spine.stations = [{ x: 0, half_height_m: 4 }])), /at least two stations/)?.severity).toBe("error");
  });

  it("flags a station off the end of the hull", () => {
    expect(find(edit((h) => h.spine.stations.push({ x: 400, half_height_m: 2 })), /lies outside the 180 m hull/)?.severity).toBe("warn");
  });

  it("flags a negative half-height as an inverted profile", () => {
    expect(find(edit((h) => (h.spine.stations[1]!.half_height_m = -2)), /negative half-height/)?.severity).toBe("error");
  });

  it("flags two stations at the same x, because only one of them is read", () => {
    const v = find(edit((h) => h.spine.stations.push({ x: 40, half_height_m: 2 })), /share x = 40 m/);
    expect(v?.severity).toBe("warn");
    expect(v?.anchor?.station).toBe(40);
  });

  it("flags a hull with no beam, which silently zeroes every volume", () => {
    expect(find(edit((h) => (h.spine.beam_m = 0)), /no beam/)?.severity).toBe("error");
  });

  it("notices the blade bow — a taper in profile with no taper in beam", () => {
    const v = find(edit((h) => (h.spine.stations[0]!.half_height_m = 1)), /wider than it is tall/);
    expect(v?.severity).toBe("info");
    expect(v?.field).toBe("spine.beam_overrides"); // points at the fix, not the symptom
  });
});

describe("sections", () => {
  it("flags a section that encloses nothing", () => {
    expect(find(edit((h) => (h.sections![0] = { id: "fore", x0: 60, x1: 60 })), /encloses no volume/)?.severity).toBe("error");
  });

  it("flags overlapping sections, because the volume is budgeted twice", () => {
    const v = find(edit((h) => (h.sections![1]!.x0 = 40)), /overlap over 20 m/);
    expect(v?.severity).toBe("error");
    expect(v?.domain).toBe("fit");
  });

  it("flags a section that runs past the hull", () => {
    expect(find(edit((h) => (h.sections![1]!.x1 = 220)), /extends past the 180 m hull/)?.severity).toBe("warn");
  });

  it("mentions hull left out of every section, but only as information", () => {
    const v = find(edit((h) => (h.sections![1]!.x1 = 120)), /is not in any section/);
    expect(v?.severity).toBe("info");
    expect(v?.message).toMatch(/33%/);
  });

  it("stays quiet about a gap under 5% of the hull", () => {
    expect(messages(edit((h) => (h.sections![1]!.x1 = 175)))).toEqual([]);
  });

  it("flags a section too small to hold anything", () => {
    const v = find(
      edit((h) => {
        h.sections = [
          { id: "fore", x0: 0, x1: 0.004 },
          { id: "aft", x0: 0.004, x1: 180 },
        ];
      }),
      /Nothing meaningful fits/,
    );
    expect(v?.severity).toBe("warn");
  });
});

describe("external slots", () => {
  it("flags duplicate ids, which a loadout cannot tell apart", () => {
    expect(find(edit((h) => (h.external_slots![1]!.id = "t1")), /share the id/)?.severity).toBe("error");
  });

  it("flags a slot off the hull", () => {
    expect(find(edit((h) => (h.external_slots![0]!.x = 300)), /off the 180 m hull/)?.severity).toBe("error");
  });

  it("flags a slot that misses the station grid", () => {
    const v = find(edit((h) => (h.external_slots![0]!.x = 73)), /off the 3 m station grid/);
    expect(v?.severity).toBe("info");
    expect(v?.domain).toBe("structure");
    expect(v?.message).toMatch(/1 m off/);
  });

  it("flags two slots close enough on the clock to foul each other", () => {
    const v = find(
      edit((h) => {
        h.external_slots![1]!.x = 72;
        h.external_slots![1]!.theta_deg = 10;
      }),
      /apart at station 72 m/,
    );
    expect(v?.severity).toBe("warn");
    expect(v?.message).toMatch(/10°/);
  });

  it("lets two slots share a station when they are well apart on the clock", () => {
    expect(messages(edit((h) => (h.external_slots![1]!.x = 72)))).toEqual([]);
  });

  it("mentions a bus interface the hull offers no slot for", () => {
    const ctx: AdvisoryContext = { bus: { id: "ans-mk2", mount_ifaces: ["turret", "radiator", "dock"] } };
    const v = find(clean, /interfaces this hull has no slot for/, ctx);
    expect(v?.severity).toBe("info");
    expect(v?.message).toMatch(/dock/);
  });
});

describe("appendages", () => {
  it("flags one attached off the hull, and does not then also measure it", () => {
    const vs = hullAdvisories(edit((h) => (h.appendages![0]!.station = 500)));
    expect(vs).toHaveLength(1);
    expect(vs[0]?.message).toMatch(/off the hull/);
  });

  it("flags one attached below the hull surface", () => {
    expect(find(edit((h) => (h.appendages![0]!.attach_r = 4)), /inside the hull surface/)?.severity).toBe("warn");
  });

  it("flags an outline that cannot be drawn", () => {
    expect(find(edit((h) => (h.appendages![0]!.outline = [[0, 0], [1, 1]])), /cannot be drawn/)?.severity).toBe("error");
  });

  it("notes an unmirrored appendage as an off-axis mass", () => {
    const v = find(edit((h) => (h.appendages![0]!.mirror = "none")), /off the thrust axis/);
    expect(v?.severity).toBe("info");
    expect(v?.domain).toBe("mass");
  });

  it("suspects a units error when an appendage out-reaches the hull", () => {
    const v = find(edit((h) => (h.appendages![0]!.outline = [[0, 0], [42, 0], [42, 900], [0, 900]])), /Check the outline's units/);
    expect(v?.severity).toBe("warn");
    expect(v?.anchor?.station).toBe(96);
  });

  it("counts the mirror once, not twice", () => {
    const vs = hullAdvisories(edit((h) => (h.appendages![0]!.outline = [[0, 0], [42, 0], [42, 900], [0, 900]])));
    expect(vs.filter((v) => /out-?reach|Check the outline/.test(v.message))).toHaveLength(1);
  });
});

describe("radiation shadow", () => {
  const cone = { x: 150, half_angle_deg: 4, facing: "forward" as const };

  it("says nothing without a cone, however the sections are laid out", () => {
    expect(hullAdvisories(clean)).toEqual([]);
  });

  it("doses a pressurised section that sticks out of the shield cone", () => {
    const v = find(clean, /outside the shield cone/, { shadowCone: cone });
    expect(v?.domain).toBe("radiation");
    expect(v?.anchor?.componentId).toBe("fore");
  });

  it("leaves an unpressurised section alone in the same geometry", () => {
    const hull = edit((h) => (h.sections![0]!.pressurised = false));
    expect(messages(hull, { shadowCone: cone })).toEqual([]);
  });

  it("escalates to an error once most of the section is exposed", () => {
    const v = find(clean, /outside the shield cone/, { shadowCone: { x: 178, half_angle_deg: 1, facing: "forward" } });
    expect(v?.severity).toBe("error");
  });
});

describe("style kit", () => {
  const kit = { id: "ans", ld_ratio_min: 12, ld_ratio_max: 14, max_beam_m: 12 };

  it("never blocks — every style finding is advisory", () => {
    const vs = hullAdvisories(clean, { style: kit });
    expect(vs.length).toBeGreaterThan(0);
    expect(vs.every((v) => v.severity !== "error")).toBe(true);
  });

  it("flags a hull too stubby for the kit", () => {
    expect(find(clean, /below the ans kit's minimum/, { style: { id: "ans", ld_ratio_min: 12 } })?.domain).toBe("style");
  });

  it("flags a hull too slender for the kit", () => {
    expect(find(clean, /exceeds the ans kit's maximum/, { style: { id: "ans", ld_ratio_max: 4 } })?.severity).toBe("warn");
  });

  it("flags a beam the yard's slips cannot take", () => {
    expect(find(clean, /will not fit the yard's slips/, { style: kit })?.field).toBe("spine.beam_m");
  });

  it("flags an off-kit part without refusing it", () => {
    const hull = edit((h) => (h.appendages![0]!.part = "osp-boom"));
    const v = find(hull, /not in the ans kit/, { style: { id: "ans", parts_radiator: ["ans-panel"] } });
    expect(v?.severity).toBe("info");
    expect(v?.anchor?.componentId).toBe("a1");
  });

  it("notes a pressurised section on an uncrewed polity's hull as doctrine, not style", () => {
    expect(find(clean, /builds uncrewed hulls/, { style: { id: "drone", crewed: false } })?.domain).toBe("doctrine");
  });
});

describe("the advisory list itself", () => {
  it("groups by domain, worst domain first", () => {
    const hull = edit((h) => {
      h.sections![1]!.x0 = 40; // error, fit
      h.appendages![0]!.mirror = "none"; // info, mass
    });
    const groups = byDomain(hullAdvisories(hull, { style: { id: "ans", ld_ratio_max: 4 } }));
    expect(groups[0]?.domain).toBe("fit");
    expect(groups.map((g) => g.domain)).toContain("style");
    expect(groups.map((g) => g.domain)).toContain("mass");
  });

  it("keeps undomained violations visible under `general`", () => {
    expect(byDomain([{ severity: "warn", message: "from somewhere else" }])[0]?.domain).toBe("general");
  });

  it("sorts most severe first and is stable", () => {
    const hull = edit((h) => {
      h.sections![1]!.x0 = 40;
      h.external_slots![0]!.x = 73;
    });
    const sorted = sortViolations(hullAdvisories(hull));
    expect(sorted[0]?.severity).toBe("error");
    expect(sortViolations(hullAdvisories(hull))).toEqual(sorted);
  });

  it("every advisory carries a domain, so nothing falls into `general` by accident", () => {
    const hull = edit((h) => {
      h.spine.stations.push({ x: 400, half_height_m: 2 });
      h.sections![1]!.x0 = 40;
      h.external_slots![0]!.x = 73;
      h.appendages![0]!.mirror = "none";
    });
    const vs = hullAdvisories(hull, { style: { id: "ans", ld_ratio_max: 4 }, shadowCone: { x: 150, half_angle_deg: 4 } });
    expect(vs.length).toBeGreaterThan(4);
    expect(vs.filter((v) => !v.domain)).toEqual([]);
  });
});

describe("robustness", () => {
  it("never throws on an empty, partial or absurd record", () => {
    const cases: HullGeometry[] = [
      { spine: { length_m: 0, beam_m: 0, stations: [] } },
      { spine: { length_m: 100, beam_m: 10, stations: [] }, sections: [], external_slots: [], appendages: [] },
      { spine: { length_m: -5, beam_m: -1, stations: [{ x: -1, half_height_m: -1 }] } },
      { spine: { length_m: 1e9, beam_m: 1e9, stations: [{ x: 0, half_height_m: 1e9 }, { x: 1e9, half_height_m: 1 }] } },
    ];
    for (const h of cases) expect(() => hullAdvisories(h, { style: { id: "x" }, bus: { id: "y" }, shadowCone: { x: 0, half_angle_deg: 0 } })).not.toThrow();
  });

  it("produces no NaN in any message", () => {
    for (const v of hullAdvisories({ spine: { length_m: 100, beam_m: 0, stations: [{ x: 0, half_height_m: 0 }, { x: 100, half_height_m: 0 }] }, sections: [{ id: "s", x0: 0, x1: 100 }] })) {
      expect(v.message).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});
