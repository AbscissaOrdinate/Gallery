/**
 * SVG sanitizer for inlining untrusted vault assets.
 *
 * Asset files arrive from anywhere (OneDrive sync, imports, other editors), and the
 * assets panel inlines them into the app document so that `currentColor` and theme
 * `var(--…)` fills still resolve. Inlining means the markup runs with the app's
 * privileges, so it is rebuilt from an allowlist rather than patched with regexes:
 *
 * - The file is parsed as XML (`image/svg+xml`). A file that is not well-formed is
 *   refused outright — that alone ends the HTML-only tricks (`onload=alert(1)`,
 *   `<svg/onload=…>`), which a browser's HTML parser would have accepted.
 * - Only the elements in `ELEMENTS` are kept. `a` and `switch` are unwrapped (their
 *   drawable children survive); anything else is dropped with its whole subtree —
 *   `script`, `style`, `foreignObject`, `iframe`/`embed`/`object`, `image`,
 *   `animate`/`set`, `filter`, `mask`, `pattern`, `marker`.
 * - Only the attributes in `ATTRIBUTES` and `PRESENTATION` are kept, so every `on*`
 *   handler goes. `href`/`xlink:href` survive only as a local `#fragment`.
 * - Attribute and `style` values may call only the functions in `FUNCTIONS`; `url()`
 *   must be a local `url(#id)`. Backslashes and CSS comments are refused, so no CSS
 *   escape can spell a function the check did not see.
 * - The output is serialized here, element by element, with every value escaped, so
 *   the HTML parser that receives it sees exactly the tree that was checked.
 *
 * Every id (and every `#ref` to it) is namespaced with a prefix fresh to each call, so
 * two assets drawn in the same editor do not share `linearGradient1`, and no asset can
 * reach an app element by id or shadow one on `window`.
 *
 * Framework-free. Parsing needs a `DOMParser`: the webview's own by default, jsdom's
 * in tests. With none available the result is `null`, never unsanitized markup.
 */

export interface SvgParser {
  parseFromString(text: string, type: "image/svg+xml"): Document;
}

export interface SanitizeSvgOptions {
  /**
   * Prepended to every id and to every local reference to one. Defaults to a fresh
   * `svgN-` per call; `""` keeps the file's own ids.
   */
  idPrefix?: string;
  /** Defaults to a new global `DOMParser`. */
  parser?: SvgParser;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const XML_NS = "http://www.w3.org/XML/1998/namespace";

/** Drawable elements, in their canonical (case-sensitive) SVG spelling. */
const ELEMENTS = new Set([
  "svg", "g", "defs", "symbol", "use", "title", "desc",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath",
  "clipPath", "linearGradient", "radialGradient", "stop",
]);

/** Containers dropped for themselves but not for what they hold. */
const UNWRAP = new Set(["a", "switch"]);

/** Elements whose character data is kept. */
const TEXT_ELEMENTS = new Set(["text", "tspan", "textPath"]);

/**
 * Kept as plain text with no child elements: once inlined into HTML these are
 * integration points, where the parser reads their content as HTML again.
 */
const TEXT_ONLY = new Set(["title", "desc"]);

/** Geometry and structure. `href`, `id` and `style` are handled on their own. */
const ATTRIBUTES = new Set([
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy", "fr",
  "width", "height", "d", "points", "pathLength", "transform",
  "viewBox", "preserveAspectRatio", "version", "refX", "refY",
  "dx", "dy", "rotate", "textLength", "lengthAdjust", "startOffset", "method", "spacing", "side",
  "gradientUnits", "gradientTransform", "spreadMethod", "offset", "clipPathUnits",
]);

/** Presentation properties, allowed both as attributes and inside `style`. */
const PRESENTATION = new Set([
  "fill", "fill-opacity", "fill-rule",
  "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset",
  "opacity", "color", "display", "visibility", "clip-path", "clip-rule",
  "stop-color", "stop-opacity", "vector-effect", "paint-order", "mix-blend-mode", "isolation",
  "shape-rendering", "text-rendering", "color-interpolation", "color-interpolation-filters",
  "font", "font-family", "font-size", "font-style", "font-weight", "font-variant", "font-stretch",
  "text-anchor", "dominant-baseline", "alignment-baseline", "baseline-shift",
  "letter-spacing", "word-spacing", "text-decoration", "writing-mode", "direction",
]);

/**
 * CSS and transform functions a value may call. `url` is not listed: a local
 * `url(#id)` is rewritten before this check and any other `url(` fails it.
 */
const FUNCTIONS = new Set([
  "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color", "color-mix", "var", "calc",
  "matrix", "translate", "translatex", "translatey", "scale", "scalex", "scaley", "rotate", "skewx", "skewy",
]);

const ID = /^[A-Za-z_][\w.-]*$/;
const LOCAL_HREF = /^\s*#([A-Za-z_][\w.-]*)\s*$/;
const LOCAL_URL = /url\(\s*(["']?)#([A-Za-z_][\w.-]*)\1\s*\)/gi;
const CALL = /([A-Za-z_-][\w-]*)\s*\(/g;

let calls = 0;

/**
 * Rebuild `text` from the allowlist. Returns `null` when it is not a well-formed SVG
 * document or no parser is available.
 */
export function sanitizeSvg(text: string, opts: SanitizeSvgOptions = {}): string | null {
  const parser = opts.parser ?? (typeof DOMParser === "undefined" ? null : new DOMParser());
  if (!parser) return null;
  try {
    const doc = parser.parseFromString(text, "image/svg+xml");
    const root = doc.documentElement;
    if (!root || doc.getElementsByTagName("parsererror").length > 0) return null;
    if (root.localName !== "svg" || !inSvg(root)) return null;
    const prefix = (opts.idPrefix ?? `svg${(calls++).toString(36)}-`).replace(/[^\w-]/g, "");
    return element(root, prefix, false);
  } catch {
    return null; // parser failure, or a document nested deep enough to exhaust the stack
  }
}

const inSvg = (el: Element): boolean => el.namespaceURI === SVG_NS || el.namespaceURI === null;

function element(el: Element, prefix: string, keepText: boolean): string {
  const name = el.localName;
  if (!inSvg(el)) return "";
  if (UNWRAP.has(name)) return children(el, prefix, keepText);
  if (!ELEMENTS.has(name)) return "";
  const body = TEXT_ONLY.has(name) ? escapeText(el.textContent ?? "") : children(el, prefix, TEXT_ELEMENTS.has(name));
  return `<${name}${attributes(el, prefix)}>${body}</${name}>`;
}

function children(el: Element, prefix: string, keepText: boolean): string {
  let out = "";
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 1) out += element(n as Element, prefix, keepText);
    else if (keepText && (n.nodeType === 3 || n.nodeType === 4)) out += escapeText(n.nodeValue ?? "");
  }
  return out;
}

function attributes(el: Element, prefix: string): string {
  let out = "";
  for (const a of Array.from(el.attributes)) {
    const kept = attribute(a, prefix);
    if (kept) out += ` ${kept[0]}="${escapeAttr(kept[1])}"`;
  }
  return out;
}

/** The attribute's output name and value, or null to drop it. */
function attribute(a: Attr, prefix: string): [string, string] | null {
  if (a.namespaceURI === XLINK_NS) return a.localName === "href" ? href("xlink:href", a.value, prefix) : null;
  if (a.namespaceURI === XML_NS) return a.localName === "space" ? ["xml:space", a.value] : null;
  if (a.namespaceURI !== null) return null; // xmlns declarations, inkscape:*, sodipodi:*, …
  const name = a.localName;
  if (name === "href") return href(name, a.value, prefix);
  if (name === "id") return ID.test(a.value) ? [name, prefix + a.value] : null;
  if (name === "style") {
    const style = cleanStyle(a.value, prefix);
    return style ? [name, style] : null;
  }
  if (!ATTRIBUTES.has(name) && !PRESENTATION.has(name)) return null;
  const value = cleanValue(a.value, prefix);
  return value === null ? null : [name, value];
}

function href(name: string, value: string, prefix: string): [string, string] | null {
  const m = LOCAL_HREF.exec(value);
  return m ? [name, `#${prefix}${m[1]}`] : null;
}

/** Presentation declarations only; each value passes `cleanValue`. */
function cleanStyle(style: string, prefix: string): string | null {
  const kept: string[] = [];
  for (const decl of style.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = PRESENTATION.has(prop) ? cleanValue(decl.slice(i + 1).trim(), prefix) : null;
    if (value) kept.push(`${prop}:${value}`);
  }
  return kept.length ? kept.join(";") : null;
}

/**
 * The value with local `url(#id)` references prefixed, or null if it holds a CSS
 * escape, a comment, an unbalanced quote, an external `url()` or any other function
 * not in `FUNCTIONS`.
 */
function cleanValue(value: string, prefix: string): string | null {
  if (value.includes("\\") || value.includes("/*")) return null;
  const rest = value.replace(LOCAL_URL, "");
  if ((rest.split('"').length - 1) % 2 || (rest.split("'").length - 1) % 2) return null;
  for (const [, fn] of rest.matchAll(CALL)) if (!FUNCTIONS.has(fn.toLowerCase())) return null;
  return value.replace(LOCAL_URL, (_, _q: string, id: string) => `url(#${prefix}${id})`);
}

const escapeText = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, "&quot;");
