/**
 * Distance display units. Records store AU (heliocentric) and km (planetocentric);
 * everything shown to the user goes through `formatDistance`.
 *
 *   light  — light-seconds / minutes / hours / days, auto-scaled
 *   au     — astronomical units (km for planetocentric distances)
 *   mkm    — million statute kilometres ("MSK"), thousands of km when small
 */
import { AU_KM } from "./worldsmith";

export type DistanceUnit = "light" | "au" | "mkm";
export const DISTANCE_UNITS: { id: DistanceUnit; label: string; description: string }[] = [
  { id: "light", label: "Light-time", description: "light-seconds · minutes · hours · days" },
  { id: "au", label: "AU / km", description: "astronomical units, km for moons" },
  { id: "mkm", label: "Mkm", description: "million statute kilometres" },
];

export const C_KM_S = 299_792.458;
export const LIGHT_SECOND_KM = C_KM_S;
export const LIGHT_MINUTE_KM = C_KM_S * 60;
export const LIGHT_HOUR_KM = C_KM_S * 3600;
export const LIGHT_DAY_KM = C_KM_S * 86400;

function sig(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const rounded = Number(n.toPrecision(digits));
  const mag = Math.floor(Math.log10(Math.abs(rounded)));
  const dp = Math.max(0, digits - 1 - mag);
  return rounded.toLocaleString(undefined, { maximumFractionDigits: Math.min(dp, 6), minimumFractionDigits: 0 });
}

/** Light-time for a distance in km, auto-scaled to the most readable unit. */
export function lightTime(km: number, digits = 3): string {
  const s = km / C_KM_S;
  if (s < 0.1) return `${sig(s * 1000, digits)} light-ms`;
  if (s < 90) return `${sig(s, digits)} ls`;
  const m = s / 60;
  if (m < 90) return `${sig(m, digits)} lm`;
  const h = m / 60;
  if (h < 36) return `${sig(h, digits)} lh`;
  const d = h / 24;
  if (d < 365) return `${sig(d, digits)} ld`;
  return `${sig(d / 365.25, digits)} ly`;
}

/** Format a distance given in km. */
export function formatKm(km: number, unit: DistanceUnit, digits = 3): string {
  if (!Number.isFinite(km)) return "—";
  switch (unit) {
    case "light":
      return lightTime(km, digits);
    case "au":
      return km >= 0.01 * AU_KM ? `${sig(km / AU_KM, digits)} AU` : `${sig(km, digits)} km`;
    case "mkm":
      return km >= 1e5 ? `${sig(km / 1e6, digits)} Mkm` : `${sig(km / 1e3, digits)} kkm`;
  }
}

/** Format a distance given in AU. */
export function formatAU(au: number, unit: DistanceUnit, digits = 3): string {
  return formatKm(au * AU_KM, unit, digits);
}

/** Short unit hint for an input: "1 AU ≈ 8.32 lm". */
export function hintAU(au: number | undefined, unit: DistanceUnit): string {
  if (au === undefined || !Number.isFinite(au) || unit === "au") return "";
  return `≈ ${formatAU(au, unit)}`;
}
export function hintKm(km: number | undefined, unit: DistanceUnit): string {
  if (km === undefined || !Number.isFinite(km) || unit === "au") return "";
  return `≈ ${formatKm(km, unit)}`;
}
