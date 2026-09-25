// @vitest-environment jsdom
/**
 * Asset SVG sanitizer: every bypass the old regex cleanup missed, then the app's own
 * exports and common editor output, which must come through drawable.
 *
 * Each hostile case is checked twice: on the sanitizer's string, and on the DOM the
 * HTML parser builds from it — that second parse is what `dangerouslySetInnerHTML`
 * does in the assets panel, so the audit runs on what would actually be live.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { sanitizeSvg } from "../src/core/codec/svg";
import { renderHull, toSvg } from "../src/core/designer/hull/render";
import { glyphSvg } from "../src/core/astro/glyph";
import type { HullGeometry } from "../src/core/designer/hull/types";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
const svg = (body: string, attrs = "") => `<svg ${NS} ${XLINK} viewBox="0 0 10 10"${attrs}>${body}<rect id="keep" width="4" height="4"/></svg>`;

const ALLOWED = new Set(["svg", "g", "defs", "symbol", "use", "title", "desc", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "textpath", "clippath", "lineargradient", "radialgradient", "stop"]);

/** Inline `markup` the way the assets panel does and list everything that should not be there. */
function audit(markup: string): string[] {
  const host = document.createElement("div");
  host.innerHTML = markup;
  const bad: string[] = [];
  for (const el of Array.from(host.querySelectorAll("*"))) {
    const name = el.localName.toLowerCase();
    if (!ALLOWED.has(name) || el.namespaceURI !== "http://www.w3.org/2000/svg") bad.push(`<${name}> in ${el.namespaceURI}`);
    for (const a of Array.from(el.attributes)) {
      const v = a.value.toLowerCase();
      if (a.localName.toLowerCase().startsWith("on")) bad.push(`${a.name} on <${name}>`);
      if (a.localName === "href" && !v.startsWith("#")) bad.push(`${a.name}="${a.value}"`);
      if (/url\(\s*['"]?(?!#)/.test(v)) bad.push(`${a.name}="${a.value}"`);
      if (/javascript:|data:|\\/.test(v)) bad.push(`${a.name}="${a.value}"`);
    }
  }
  return bad;
}

/** Sanitize with raw ids, require the benign `#keep` rect to survive, and audit the live result. */
function clean(input: string): string {
  const out = sanitizeSvg(input, { idPrefix: "" });
  expect(out).not.toBeNull();
  expect(out).toContain('<rect id="keep"');
  expect(audit(out!)).toEqual([]);
  return out!;
}

describe("handlers", () => {
  it("refuses unquoted handlers, which only an HTML parser accepts", () => {
    expect(sanitizeSvg(`<svg ${NS} onload=alert(1)><rect/></svg>`)).toBeNull();
    expect(sanitizeSvg(`<svg/onload=alert(1)>`)).toBeNull();
    expect(sanitizeSvg(`<svg ${NS}><rect onclick=alert(1) /></svg>`)).toBeNull();
  });

  it("drops quoted handlers in any spelling, spacing or case", () => {
    const out = clean(svg(`<g onclick = "alert(1)" onMouseOver='alert(1)' ONFOCUS="alert(1)"><circle r="1" onload="alert(1)"/></g>`, `\nonload="alert(1)"`));
    expect(out).not.toMatch(/alert|\son/i);
    expect(out).toContain('<circle r="1">');
  });
});

describe("href", () => {
  it("drops javascript: in href and xlink:href, and unwraps the link", () => {
    const out = clean(svg(`<a href="javascript:alert(1)"><path d="M0 0h1"/></a><a xlink:href="javascript:alert(1)"><text>t</text></a>`));
    expect(out).not.toMatch(/javascript|<a[\s>]/);
    expect(out).toContain('<path d="M0 0h1">');
    expect(out).toContain("<text>t</text>");
  });

  it("drops entity-encoded javascript: URLs", () => {
    for (const href of ["&#106;avascript:alert(1)", "javascript&#x3A;alert(1)", "java&#9;script:alert(1)", " &#x6A;&#x61;vascript:alert(1)"]) {
      const out = clean(svg(`<use href="${href}"/><use xlink:href="${href}"/>`));
      expect(out).not.toMatch(/href|alert/);
    }
  });

  it("drops <use> references to other documents and keeps local ones", () => {
    const out = clean(svg(`<use href="https://evil.example/x.svg#a"/><use xlink:href="other.svg#a"/><use href="data:image/svg+xml;base64,PHN2Zy8+#a"/><use href="#keep"/>`));
    expect(out).not.toMatch(/evil|other\.svg|data:/);
    expect(out).toContain('<use href="#keep">');
  });
});

describe("elements", () => {
  it("drops <script>, including namespaced and CDATA forms", () => {
    const out = clean(svg(`<script>alert(1)</script><script><![CDATA[alert(1)]]></script><h:script xmlns:h="http://www.w3.org/1999/xhtml">alert(1)</h:script>`));
    expect(out).not.toMatch(/script|alert/);
  });

  it("drops <foreignObject> and the HTML inside it", () => {
    const out = clean(
      svg(`<foreignObject width="10" height="10"><body xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/><iframe src="javascript:alert(1)"/></body></foreignObject>`),
    );
    expect(out).not.toMatch(/foreignObject|img|iframe|alert/);
  });

  it("drops <iframe>, <embed> and <object> in any namespace", () => {
    const html = 'xmlns="http://www.w3.org/1999/xhtml"';
    const out = clean(
      svg(`<iframe src="javascript:alert(1)"/><embed src="https://evil.example/x.swf"/><object data="https://evil.example/x.html"/>` + `<iframe ${html} srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"/><embed ${html} src="x"/><object ${html} data="x"/>`),
    );
    expect(out).not.toMatch(/iframe|embed|object|evil|alert/);
  });

  it("drops <animate> and <set> that would rewrite href to javascript:", () => {
    const out = clean(
      svg(
        `<a><set attributeName="href" to="javascript:alert(1)"/><text>go</text></a>` +
          `<use href="#keep"><animate attributeName="href" values="javascript:alert(1)"/></use>` +
          `<a xlink:href="#keep"><animate attributeName="xlink:href" from="#keep" to="javascript:alert(1)" begin="0s"/><circle r="1"/></a>` +
          `<animateTransform attributeName="transform" type="rotate" from="0" to="360"/><animateMotion path="M0 0"/>`,
      ),
    );
    expect(out).not.toMatch(/animate|<set|javascript|alert/i);
    expect(out).toContain("<text>go</text>");
  });

  it("drops <style> elements, which would restyle the whole app", () => {
    const out = clean(svg(`<style>@import url(https://evil.example/a.css); body { display: none } rect { fill: url(javascript:alert(1)) }</style>`));
    expect(out).not.toMatch(/style|evil|display|alert/);
  });

  it("drops <image>, <filter>, <mask>, <pattern> and <marker>", () => {
    const out = clean(
      svg(`<image href="https://evil.example/t.png"/><filter id="f"><feImage href="https://evil.example/t.png"/></filter><mask id="m"/><pattern id="p"/><marker id="k"/>`),
    );
    expect(out).not.toMatch(/image|filter|mask|pattern|marker|evil/i);
  });
});

describe("css", () => {
  it("drops url(javascript:) and external url() in presentation attributes", () => {
    const out = clean(
      svg(`<rect id="a" fill="url(javascript:alert(1))"/><rect id="b" stroke="url('https://evil.example/p.svg#g')"/><rect id="c" clip-path="url(#keep) url(https://evil.example)"/>`),
    );
    expect(out).not.toMatch(/fill|stroke|clip-path|evil|alert/);
    expect(out).toContain('<rect id="a">');
  });

  it("keeps only presentation properties in style, and only safe values", () => {
    const out = clean(
      svg(
        `<rect style="fill:url('javascript:alert(1)');stroke:#123456;background-image:url(https://evil.example/);position:fixed;z-index:9;-moz-binding:url(https://evil.example/x);behavior:url(x.htc)"/>` +
          `<circle r="1" style="fill:expression(alert(1));stroke-width:2;filter:url(#f);opacity:.5"/>` +
          `<ellipse style="fill:image-set('https://evil.example/a.png' 1x);stroke:-webkit-image-set(url(https://evil.example) 1x)"/>`,
      ),
    );
    expect(out).toContain('<rect style="stroke:#123456">');
    expect(out).toContain('<circle r="1" style="stroke-width:2;opacity:.5">');
    expect(out).toContain("<ellipse>");
    expect(out).not.toMatch(/evil|alert|expression|position|z-index|binding|behavior|image-set|filter/);
  });

  it("drops CSS escapes, comments and entity-encoded url()", () => {
    const out = clean(
      svg(
        `<rect style="fill:\\75 rl(https://evil.example/a)"/><rect style="fill:u&#114;l(https://evil.example/b)"/><rect fill="u&#x72;l(https://evil.example/c)"/>` +
          `<rect style="fill:ur/**/l(https://evil.example/d)"/><rect style="f\\69 ll:url(https://evil.example/e)"/><rect style="font-family:'a;fill:url(https://evil.example/f)"/>`,
      ),
    );
    expect(out).not.toMatch(/evil|style|fill/);
  });
});

describe("text", () => {
  it("keeps markup-looking text as text, including CDATA and <title>", () => {
    const out = clean(
      svg(`<text><![CDATA[<img src=x onerror=alert(1)>]]></text><title>&lt;img src=x onerror=alert(1)&gt;</title><desc><rect/><![CDATA[</desc><img src=x onerror=alert(1)>]]></desc>`),
    );
    expect(out).toContain("<text>&lt;img src=x onerror=alert(1)&gt;</text>");
    expect(out).toContain("<title>&lt;img src=x onerror=alert(1)&gt;</title>");
    expect(out).toContain("<desc>&lt;/desc&gt;&lt;img src=x onerror=alert(1)&gt;</desc>");
  });

  it("does not let a DOCTYPE entity smuggle markup in", () => {
    const input = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "<script>alert(1)</script>">]><svg ${NS}><text>&x;</text><rect id="keep"/></svg>`;
    const out = sanitizeSvg(input);
    if (out !== null) expect(audit(out)).toEqual([]);
  });
});

describe("refusals", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns null for malformed input, a non-SVG root or no parser", () => {
    expect(sanitizeSvg("<svg><rect></svg>")).toBeNull();
    expect(sanitizeSvg("not svg at all")).toBeNull();
    expect(sanitizeSvg(`<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>`)).toBeNull();
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/1999/xhtml"/>`)).toBeNull();
    vi.stubGlobal("DOMParser", undefined);
    expect(sanitizeSvg(`<svg ${NS}/>`)).toBeNull();
  });
});

describe("ids", () => {
  it("prefixes every id and every local reference to one", () => {
    const out = sanitizeSvg(svg(`<defs><linearGradient id="g1"><stop offset="0"/></linearGradient><linearGradient id="g2" xlink:href="#g1"/></defs><path fill="url(#g2)" style="stroke:url(&quot;#g1&quot;)"/><use href="#keep"/>`), {
      idPrefix: "asset-:r3:-",
    })!;
    expect(out).toContain('<linearGradient id="asset-r3-g2" xlink:href="#asset-r3-g1">');
    expect(out).toContain('<path fill="url(#asset-r3-g2)" style="stroke:url(#asset-r3-g1)">');
    expect(out).toContain('<use href="#asset-r3-keep">');
    expect(audit(out)).toEqual([]);
  });

  it("gives two previews of the same file disjoint ids by default", () => {
    const file = svg(`<defs><radialGradient id="linearGradient1"/></defs><circle r="1" fill="url(#linearGradient1)"/>`);
    const ids = (s: string) => [...s.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    const first = sanitizeSvg(file)!;
    const a = ids(first);
    const b = ids(sanitizeSvg(file)!);
    expect(a.length).toBe(2);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
    expect(first).toContain(`fill="url(#${a[0]})"`);
  });

  it("drops ids that are not plain names", () => {
    expect(sanitizeSvg(`<svg ${NS}><rect id="a b"/><rect id="x)y"/><rect id="ok"/></svg>`, { idPrefix: "" })).toBe(`<svg><rect></rect><rect></rect><rect id="ok"></rect></svg>`);
  });
});

describe("fidelity", () => {
  it("passes the demo vault's currentColor portrait through unchanged", () => {
    const sword = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120"><polygon points="10,60 60,30 300,30 390,60 300,90 60,90" fill="none" stroke="currentColor" stroke-width="2"/><rect x="80" y="10" width="200" height="8" fill="currentColor" opacity=".5"/><rect x="80" y="102" width="200" height="8" fill="currentColor" opacity=".5"/><circle cx="330" cy="60" r="10" fill="none" stroke="currentColor"/></svg>`;
    expect(sanitizeSvg(sword)).toBe(
      `<svg viewBox="0 0 400 120"><polygon points="10,60 60,30 300,30 390,60 300,90 60,90" fill="none" stroke="currentColor" stroke-width="2"></polygon><rect x="80" y="10" width="200" height="8" fill="currentColor" opacity=".5"></rect><rect x="80" y="102" width="200" height="8" fill="currentColor" opacity=".5"></rect><circle cx="330" cy="60" r="10" fill="none" stroke="currentColor"></circle></svg>`,
    );
  });

  it("keeps a hull silhouette export whole, theme var() fills included", () => {
    const hull: HullGeometry = {
      spine: { length_m: 120, beam_m: 12, station_pitch_m: 3, stations: [{ x: 0, half_height_m: 2 }, { x: 30, half_height_m: 7 }, { x: 120, half_height_m: 5 }] },
      packing_efficiency: 0.78,
      sections: [{ id: "all", x0: 0, x1: 120, allowed: ["drive"] }],
      armor_zones: [],
      external_slots: [{ id: "t1", x: 50, theta_deg: 0, type: "turret", size: "M" }],
    };
    const file = toSvg(renderHull(hull, { mode: "schematic" }), { title: "Sword <DD>", pxPerMetre: 6 });
    const out = sanitizeSvg(file)!;
    const tags = (s: string) => [...s.matchAll(/<([a-zA-Z]+)[\s>]/g)].map((m) => m[1]);
    expect(tags(out)).toEqual(tags(file));
    expect(out).toMatch(/fill="var\(--[\w-]+\)"/);
    expect(out).toContain("<title>Sword &lt;DD&gt;</title>");
    expect(audit(out)).toEqual([]);
  });

  it("keeps a body glyph's gradients and clip paths wired up under a prefix", () => {
    for (const motif of ["star", "gaian", "gas-giant"] as const) {
      const out = sanitizeSvg(glyphSvg({ motif, seed: "x", rings: true }), { idPrefix: "p-" })!;
      const ids = new Set([...out.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
      const refs = [...out.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
      expect(refs.length).toBeGreaterThan(0);
      for (const r of refs) expect(ids.has(r), `${motif}: url(#${r})`).toBe(true);
      expect(audit(out)).toEqual([]);
    }
  });

  it("keeps Inkscape drawings and drops the editor's own metadata", () => {
    const file = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Created with Inkscape (http://www.inkscape.org/) -->
<svg width="210mm" height="297mm" viewBox="0 0 210 297" version="1.1" id="svg5" inkscape:version="1.3" sodipodi:docname="hull.svg"
  xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
  xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:cc="http://creativecommons.org/ns#">
  <sodipodi:namedview id="namedview7" pagecolor="#ffffff" inkscape:zoom="0.7"/>
  <defs id="defs2">
    <linearGradient inkscape:collect="always" id="linearGradient1"><stop style="stop-color:#8a2be2;stop-opacity:1;" offset="0" id="stop1"/><stop style="stop-color:#8a2be2;stop-opacity:0;" offset="1" id="stop2"/></linearGradient>
    <linearGradient xlink:href="#linearGradient1" id="linearGradient3" x1="10" y1="10" x2="90" y2="10" gradientUnits="userSpaceOnUse"/>
  </defs>
  <metadata id="metadata1"><rdf:RDF><cc:Work rdf:about=""/></rdf:RDF></metadata>
  <g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1">
    <path style="fill:url(#linearGradient3);fill-opacity:1;stroke:#000000;stroke-width:0.264583px;stroke-linecap:round" d="m 10,10 h 80 v 20 z" id="path1" sodipodi:nodetypes="cccc"/>
    <text xml:space="preserve" style="font-size:4.9px;font-family:'DejaVu Sans';fill:#000000" x="10" y="50" id="text1"><tspan sodipodi:role="line" id="tspan1" x="10" y="50">SWORD</tspan></text>
  </g>
</svg>`;
    const out = sanitizeSvg(file, { idPrefix: "" })!;
    expect(out).not.toMatch(/inkscape|sodipodi|rdf|metadata|namedview|xmlns/);
    expect(out).toContain('<linearGradient xlink:href="#linearGradient1" id="linearGradient3" x1="10" y1="10" x2="90" y2="10" gradientUnits="userSpaceOnUse">');
    expect(out).toContain('style="fill:url(#linearGradient3);fill-opacity:1;stroke:#000000;stroke-width:0.264583px;stroke-linecap:round"');
    expect(out).toContain(`<text xml:space="preserve" style="font-size:4.9px;font-family:'DejaVu Sans';fill:#000000" x="10" y="50" id="text1"><tspan id="tspan1" x="10" y="50">SWORD</tspan></text>`);
    expect(audit(out)).toEqual([]);
  });

  it("unwraps Illustrator's <switch> so the drawing survives without its foreignObject", () => {
    const file = `<svg ${NS} viewBox="0 0 10 10"><switch><foreignObject requiredExtensions="http://ns.adobe.com/AdobeIllustrator/10.0/" x="0" y="0" width="1" height="1"/><g><path d="M0 0h5v5z" fill="#333"/></g></switch></svg>`;
    expect(sanitizeSvg(file)).toBe(`<svg viewBox="0 0 10 10"><g><path d="M0 0h5v5z" fill="#333"></path></g></svg>`);
  });
});
