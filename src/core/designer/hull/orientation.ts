/**
 * Which way a mount points.
 *
 * A slot is a place on the hull — a station and a clock angle. What sits there
 * also has a direction: a gun that has to fire aft, an attitude thruster that
 * fires radially, one canted tangentially so it can roll the ship. Two angles
 * describe it, both set per slot in the hull editor:
 *
 *  - **`facing_deg`** turns the mount about its own outward axis. 0 is as
 *    drawn — a weapon's muzzle toward the bow, a nozzle's exhaust aft — and
 *    180 reverses it. Positive turns the muzzle from the bow toward increasing
 *    clock angle: on a dorsal mount that is toward starboard.
 *  - **`tilt_deg`**, thrusters and drives only, lifts the nozzle out of the
 *    skin's plane: 0 fires along the hull, 90 straight outward.
 *
 * Defaults keep every existing hull meaning what it meant: a `drive` fires aft,
 * and a `thruster` slot fires **radially**, which is what the attitude budget
 * has always assumed of it — the drawing used to show it firing aft, which was
 * the part that was wrong.
 *
 * ## Frames
 *
 * *Local* to a slot: `aft` along the hull, `out` along the outward normal at
 * the slot's clock angle, `tang` along the direction of increasing clock angle.
 * *Ship*: `x` aft from the bow, `y` dorsal, `z` starboard — so a slot at θ has
 * outward normal (0, cos θ, sin θ) and tangent (0, −sin θ, cos θ).
 */
import type { ExternalSlot } from "./types";

export interface Orientation {
  facing_deg: number;
  tilt_deg: number;
}

/** A direction in a slot's local frame. */
export interface LocalDir {
  aft: number;
  out: number;
  tang: number;
}

/** A direction in the ship's frame: x aft, y dorsal, z starboard. */
export type ShipDir = [number, number, number];

const RAD = Math.PI / 180;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Slot types whose part is a nozzle, and so can be tilted. */
export const TILTABLE = new Set(["thruster", "drive"]);

/** A slot's orientation, with the defaults filled in. */
export function slotOrientation(slot: Pick<ExternalSlot, "type"> & { facing_deg?: number; tilt_deg?: number }): Orientation {
  const facing = finite(slot.facing_deg) ? slot.facing_deg : 0;
  const tilt = TILTABLE.has(slot.type) ? (finite(slot.tilt_deg) ? Math.max(0, Math.min(90, slot.tilt_deg)) : slot.type === "thruster" ? 90 : 0) : 0;
  return { facing_deg: ((facing % 360) + 360) % 360, tilt_deg: tilt };
}

/**
 * Turn a local (aft, tang) pair by `facing_deg` about the outward axis.
 * The bow, (−1, 0), goes to (−cos f, sin f): toward increasing clock angle.
 */
export function turn(aft: number, tang: number, facing_deg: number): { aft: number; tang: number } {
  const c = Math.cos(facing_deg * RAD);
  const s = Math.sin(facing_deg * RAD);
  return { aft: aft * c + tang * s, tang: -aft * s + tang * c };
}

/** Where a nozzle's exhaust leaves, in the slot's local frame. The ship is pushed the other way. */
export function exhaustLocal(o: Orientation): LocalDir {
  const t = o.tilt_deg * RAD;
  const along = turn(1, 0, o.facing_deg);
  return { aft: Math.cos(t) * along.aft, out: Math.sin(t), tang: Math.cos(t) * along.tang };
}

/** A local direction at clock angle `theta_deg`, in the ship's frame. */
export function toShip(d: LocalDir, theta_deg: number): ShipDir {
  const th = theta_deg * RAD;
  return [d.aft, d.out * Math.cos(th) - d.tang * Math.sin(th), d.out * Math.sin(th) + d.tang * Math.cos(th)];
}
