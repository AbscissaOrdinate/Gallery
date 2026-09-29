/**
 * Structural equality for plain record data (strings, numbers, booleans, null, arrays, objects).
 * Key order does not matter, and a key holding `undefined` equals a missing key — the same
 * distinction the YAML/JSON writers already make.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const k of keys) if (!sameValue(ra[k], rb[k])) return false;
  return true;
}
