/**
 * Renderers draw in theme tokens (`var(--map-orbit)`, `color-mix(…)`), which
 * resolve inside the app but mean nothing to a standalone SVG viewer. Exports
 * pass their markup through here so the file carries literal colours taken
 * from the live theme at export time — theme.css stays the only source of
 * them (docs/STYLE.md §1).
 */

const VAR = /var\(--([a-z0-9-]+)\)/g;
const MIX = /color-mix\((?:[^()]|\([^()]*\))*\)/g;

function tokenValue(name: string, root: CSSStyleDeclaration): string {
  // Custom properties come back with nested var() already substituted.
  return root.getPropertyValue(`--${name}`).trim();
}

let ctx: CanvasRenderingContext2D | null | undefined;
/** Any CSS colour → #rrggbb (alpha dropped: callers carry opacity separately). */
function toHex(css: string): string {
  if (ctx === undefined) ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) return css;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "transparent";
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Replace every theme token and colour-mix in `markup` with a literal value. */
export function resolveThemeColors(markup: string, el: Element = document.documentElement): string {
  const root = getComputedStyle(el);
  // Double quotes inside a resolved font stack would end the XML attribute.
  let out = markup.replace(VAR, (_, name: string) => tokenValue(name, root).replace(/"/g, "'") || "currentColor");
  out = out.replace(MIX, (expr) => toHex(expr));
  return out;
}
