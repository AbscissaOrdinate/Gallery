/**
 * The few browser APIs the UI needs that jsdom does not have or cannot measure. Import for the
 * side effect from a `// @vitest-environment jsdom` test.
 */
class FakeResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe(el: Element) {
    this.cb([{ target: el, contentRect: el.getBoundingClientRect() } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

export const CANVAS = { width: 1000, height: 700 };

export function installBrowserShims() {
  const g = globalThis as Record<string, unknown>;
  g.ResizeObserver ??= FakeResizeObserver;
  // Layout: every element measures as the same canvas, so the map and hull views lay out for real.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => CANVAS.width });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => CANVAS.height });
  Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: CANVAS.width, bottom: CANVAS.height, width: CANVAS.width, height: CANVAS.height, toJSON: () => ({}) } as DOMRect;
  };
  // jsdom's Blob has no text(); the importer reads chosen files with it.
  Blob.prototype.text ??= function (this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsText(this);
    });
  };
  // jsdom has no PointerEvent, so `fireEvent.pointerDown(el, { clientX })` would build a bare Event and drop the
  // coordinates. A MouseEvent carries them; `pointerId` is added by hand.
  if (!(g.PointerEvent as unknown)) {
    g.PointerEvent = class PointerEvent extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    };
  }
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollTo ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
  // SVG screen → user-space mapping for the map's pointer maths: the canvas shows the svg's viewBox 1:1 across CANVAS.
  type Pt = { x: number; y: number };
  const svg = SVGSVGElement.prototype as unknown as Record<string, unknown>;
  svg.createSVGPoint = function () {
    return { x: 0, y: 0, matrixTransform(m: { apply(p: Pt): Pt }) { return m.apply(this as Pt); } };
  };
  svg.getScreenCTM = function (this: SVGSVGElement) {
    const [vx, vy, vw, vh] = (this.getAttribute("viewBox") ?? `0 0 ${CANVAS.width} ${CANVAS.height}`).split(/[\s,]+/).map(Number);
    return { inverse: () => ({ apply: (p: Pt): Pt => ({ x: vx + (p.x * vw) / CANVAS.width, y: vy + (p.y * vh) / CANVAS.height }) }) };
  };
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
}
