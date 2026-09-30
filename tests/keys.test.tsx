// @vitest-environment jsdom
/**
 * The key router's decisions (doc 11 §1.8 table): where Ctrl/Cmd+Z goes depends on focus. Pure —
 * `commandFor` reads the event, the focused element and two flags; nothing here mounts the app.
 */
import { describe, expect, it } from "vitest";
import { commandFor, isTextEntry, type KeyContext, type KeyLike } from "../src/ui/keys";

const CLEAR: KeyContext = { boot: false, overlay: false };
const ev = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
const el = (html: string): Element => {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  return host.firstElementChild!;
};

describe("isTextEntry", () => {
  it.each([
    ['<input type="text">', true],
    ["<input>", true],
    ['<input type="number">', true],
    ['<input type="search">', true],
    ["<textarea></textarea>", true],
    ['<div contenteditable="true">x</div>', true],
    ['<input type="checkbox">', false],
    ['<input type="radio">', false],
    ['<input type="range">', false],
    ["<button>b</button>", false],
    ["<select><option>a</option></select>", false],
    ["<svg></svg>", false],
    ["<div>plain</div>", false],
  ])("%s → %s", (html, expected) => {
    expect(isTextEntry(el(html as string))).toBe(expected);
  });
  it("nothing focused is not a text entry", () => expect(isTextEntry(null)).toBe(false));
});

describe("commandFor", () => {
  const body = document.body;
  it("Ctrl+Z and Cmd+Z undo; Ctrl+Shift+Z, Cmd+Shift+Z and Ctrl+Y redo", () => {
    expect(commandFor(ev("z", { ctrlKey: true }), body, CLEAR)).toBe("undo");
    expect(commandFor(ev("z", { metaKey: true }), body, CLEAR)).toBe("undo");
    expect(commandFor(ev("Z", { ctrlKey: true, shiftKey: true }), body, CLEAR)).toBe("redo");
    expect(commandFor(ev("z", { metaKey: true, shiftKey: true }), body, CLEAR)).toBe("redo");
    expect(commandFor(ev("y", { ctrlKey: true }), body, CLEAR)).toBe("redo");
  });
  it("a plain z, or Alt in the chord, is not ours", () => {
    expect(commandFor(ev("z"), body, CLEAR)).toBeNull();
    expect(commandFor(ev("z", { ctrlKey: true, altKey: true }), body, CLEAR)).toBeNull();
    expect(commandFor(ev("y", { ctrlKey: true, shiftKey: true }), body, CLEAR)).toBeNull();
  });
  it("in a text entry the browser's own undo and redo are left alone", () => {
    for (const html of ["<input>", "<textarea></textarea>", '<input type="search">', '<div contenteditable="true"></div>']) {
      const target = el(html);
      expect(commandFor(ev("z", { ctrlKey: true }), target, CLEAR), html).toBeNull();
      expect(commandFor(ev("z", { ctrlKey: true, shiftKey: true }), target, CLEAR), html).toBeNull();
      expect(commandFor(ev("y", { ctrlKey: true }), target, CLEAR), html).toBeNull();
    }
  });
  it("on a button, a checkbox, a select or a canvas the app takes it", () => {
    for (const html of ["<button></button>", '<input type="checkbox">', "<select></select>", "<svg></svg>"]) expect(commandFor(ev("z", { ctrlKey: true }), el(html), CLEAR), html).toBe("undo");
  });
  it("is ignored while the boot screen shows, or an overlay with its own text field is open", () => {
    expect(commandFor(ev("z", { ctrlKey: true }), body, { boot: true, overlay: false })).toBeNull();
    expect(commandFor(ev("z", { ctrlKey: true, shiftKey: true }), body, { boot: false, overlay: true })).toBeNull();
    expect(commandFor(ev("y", { ctrlKey: true }), body, { boot: true, overlay: true })).toBeNull();
  });
  it("leaves an event someone already handled, and one from an IME composition", () => {
    expect(commandFor({ ...ev("z", { ctrlKey: true }), defaultPrevented: true }, body, CLEAR)).toBeNull();
    expect(commandFor({ ...ev("z", { ctrlKey: true }), isComposing: true }, body, CLEAR)).toBeNull();
  });
  it("keeps the two shortcuts that existed: Ctrl+K focuses search (even in a field), Alt+← goes back", () => {
    expect(commandFor(ev("k", { ctrlKey: true }), el("<input>"), CLEAR)).toBe("focusSearch");
    expect(commandFor(ev("K", { metaKey: true }), body, CLEAR)).toBe("focusSearch");
    expect(commandFor(ev("ArrowLeft", { altKey: true }), el("<input>"), CLEAR)).toBe("back");
    expect(commandFor(ev("ArrowLeft"), body, CLEAR)).toBeNull();
  });
});
