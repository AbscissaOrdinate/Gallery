/** Stable random ids and filename slugs. */

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** 12-char base-36 id. Uses crypto when available (browser, Node 19+). */
export function newId(len = 12): string {
  const bytes = new Uint8Array(len);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Filesystem-safe slug: lowercase, ascii, hyphen-separated, max 80 chars. */
export function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return s || "untitled";
}

export function nowIso(): string {
  return new Date().toISOString();
}
