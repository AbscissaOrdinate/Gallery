/**
 * Keyboard routing: one dispatcher, installed once in `App.tsx` (doc 11 §1.8, replacing the
 * listener that lived there). The table below is doc 11 §3.1's keymap, S1's rows and the two that
 * already existed; S3 extends it and moves the rest of the keymap in.
 *
 * Undo and redo share the browser's own key chords, so where they go depends on focus:
 *
 * | Focus                                                       | Ctrl/Cmd+Z    | Ctrl/Cmd+Shift+Z, Ctrl+Y |
 * |-------------------------------------------------------------|---------------|--------------------------|
 * | a text entry (text/number/search input, textarea, editable) | native — left | native — left            |
 * | anywhere else (body, buttons, canvases, lists, selects)     | app undo      | app redo                 |
 * | the boot screen, or an overlay with its own text field      | ignored       | ignored                  |
 *
 * An overlay declares itself with a `data-overlay` attribute on its root while it is open (the
 * command palette and switcher, S3). Esc in a text entry blurs it, so the next Ctrl+Z reaches the app.
 */
import { actions, getApp } from "./state";

export type KeyCommand = "undo" | "redo" | "focusSearch" | "back";

/** The slice of a `KeyboardEvent` the router reads. */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
}

export interface KeyContext {
  /** The boot screen is showing. */
  boot: boolean;
  /** An overlay with its own text field is open. */
  overlay: boolean;
}

/** Input types that are not text entry: the browser has no text undo for them. */
const NOT_TEXT = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image", "hidden"]);

/** Whether the browser's own text undo applies to `el` (§1.8). */
export function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") return !NOT_TEXT.has(((el as HTMLInputElement).type || "text").toLowerCase());
  return (el as HTMLElement).isContentEditable === true || el.getAttribute("contenteditable") === "" || el.getAttribute("contenteditable") === "true";
}

interface Binding {
  command: KeyCommand;
  /** "outside-text": the browser's text handling comes first. "any": always ours. */
  scope: "any" | "outside-text";
  matches(e: KeyLike): boolean;
}

const mod = (e: KeyLike) => e.ctrlKey || e.metaKey;
const letter = (e: KeyLike, l: string) => e.key.toLowerCase() === l;

export const KEYMAP: readonly Binding[] = [
  { command: "undo", scope: "outside-text", matches: (e) => mod(e) && !e.altKey && !e.shiftKey && letter(e, "z") },
  { command: "redo", scope: "outside-text", matches: (e) => mod(e) && !e.altKey && ((e.shiftKey && letter(e, "z")) || (!e.shiftKey && letter(e, "y"))) },
  // These two exist already; S3 replaces them with the switcher and the full navigation keys.
  { command: "focusSearch", scope: "any", matches: (e) => mod(e) && !e.altKey && !e.shiftKey && letter(e, "k") },
  { command: "back", scope: "any", matches: (e) => e.altKey && !mod(e) && e.key === "ArrowLeft" },
];

/** What the chord means here, or null when it is not ours to handle. Pure. */
export function commandFor(e: KeyLike, target: Element | null, ctx: KeyContext): KeyCommand | null {
  if (e.defaultPrevented || e.isComposing) return null;
  const hit = KEYMAP.find((b) => b.matches(e));
  if (!hit) return null;
  if (hit.command === "undo" || hit.command === "redo") {
    if (ctx.boot || ctx.overlay) return null;
    if (isTextEntry(target)) return null;
  }
  return hit.command;
}

function run(command: KeyCommand) {
  if (command === "undo") void actions.undo();
  else if (command === "redo") void actions.redo();
  else if (command === "back") actions.back();
  else (document.getElementById("global-search") as HTMLInputElement | null)?.focus();
}

/** Listen on the window; returns the function that stops. Called once, from `App`. */
export function installKeys(): () => void {
  const onKey = (e: KeyboardEvent) => {
    const command = commandFor(e, document.activeElement, { boot: !!getApp().boot, overlay: !!document.querySelector("[data-overlay]") });
    if (!command) return;
    e.preventDefault();
    run(command);
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
