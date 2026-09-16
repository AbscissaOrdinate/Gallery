/**
 * Keyboard-first outline editor (Dynalist-like).
 *   Enter          new sibling below (or first child if node is expanded with children)
 *   Shift+Enter    edit/add note line
 *   Tab / Shift+Tab   indent / outdent
 *   Backspace on empty   delete node (focus previous)
 *   Alt+↑ / Alt+↓   move node
 *   Click bullet    collapse / expand
 */
import { useEffect, useRef, useState } from "react";
import type { OutlineNode } from "../core/types";

type Path = number[];

function clone(o: OutlineNode[]): OutlineNode[] {
  return structuredClone(o);
}
function getAt(root: OutlineNode[], p: Path): OutlineNode {
  let list = root;
  let node: OutlineNode | undefined;
  for (const i of p) {
    node = list[i];
    list = node.children;
  }
  return node!;
}
function listAt(root: OutlineNode[], p: Path): OutlineNode[] {
  return p.length === 0 ? root : getAt(root, p).children;
}
function parentPath(p: Path): Path {
  return p.slice(0, -1);
}
function isCollapsed(n: OutlineNode): boolean {
  return n.attrs?.collapsed === "true";
}

/** Depth-first visible order, for focus navigation. */
function visible(root: OutlineNode[], base: Path = [], out: Path[] = []): Path[] {
  root.forEach((n, i) => {
    const p = [...base, i];
    out.push(p);
    if (!isCollapsed(n)) visible(n.children, p, out);
  });
  return out;
}

export function Outliner({ value, onChange }: { value: OutlineNode[]; onChange: (v: OutlineNode[]) => void }) {
  const [focus, setFocus] = useState<{ path: Path; note?: boolean } | null>(null);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    const sel = `[data-path="${focus.path.join(".")}"] ${focus.note ? ".ol-note" : ".text"}`;
    const el = container.current?.querySelector<HTMLTextAreaElement>(sel);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [focus, value]);

  const update = (fn: (root: OutlineNode[]) => void, nextFocus?: { path: Path; note?: boolean }) => {
    const root = clone(value);
    fn(root);
    onChange(root);
    if (nextFocus) setFocus(nextFocus);
  };

  const onKey = (p: Path, e: React.KeyboardEvent<HTMLTextAreaElement>, isNote: boolean) => {
    const node = getAt(value, p);
    const siblings = listAt(value, parentPath(p));
    const idx = p[p.length - 1];
    if (e.key === "Enter" && !e.shiftKey && !isNote) {
      e.preventDefault();
      const target = e.currentTarget;
      const caret = target.selectionStart;
      const before = node.text.slice(0, caret);
      const after = node.text.slice(caret);
      update((root) => {
        const n = getAt(root, p);
        n.text = before;
        const fresh: OutlineNode = { text: after, children: [] };
        if (n.children.length && !isCollapsed(n)) n.children.unshift(fresh);
        else listAt(root, parentPath(p)).splice(idx + 1, 0, fresh);
      }, { path: node.children.length && !isCollapsed(node) ? [...p, 0] : [...parentPath(p), idx + 1] });
      return;
    }
    if (e.key === "Enter" && e.shiftKey && !isNote) {
      e.preventDefault();
      update((root) => {
        const n = getAt(root, p);
        if (n.note === undefined) n.note = "";
      }, { path: p, note: true });
      return;
    }
    if (e.key === "Escape" && isNote) {
      e.preventDefault();
      update((root) => {
        const n = getAt(root, p);
        if (!n.note) delete n.note;
      }, { path: p });
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (p.length < 2) return;
        const pp = parentPath(p);
        const gp = parentPath(pp);
        const pIdx = pp[pp.length - 1];
        update((root) => {
          const parent = getAt(root, pp);
          const [moved] = parent.children.splice(idx, 1);
          // siblings after it become its children (Dynalist behaviour)
          moved.children.push(...parent.children.splice(idx));
          listAt(root, gp).splice(pIdx + 1, 0, moved);
        }, { path: [...gp, pIdx + 1], note: isNote });
      } else {
        if (idx === 0) return;
        update((root) => {
          const list = listAt(root, parentPath(p));
          const prev = list[idx - 1];
          const [moved] = list.splice(idx, 1);
          if (prev.attrs?.collapsed) delete prev.attrs.collapsed;
          prev.children.push(moved);
        }, { path: [...parentPath(p), idx - 1, siblings[idx - 1].children.length], note: isNote });
      }
      return;
    }
    if (e.key === "Backspace" && !isNote && node.text === "" && node.children.length === 0 && e.currentTarget.selectionStart === 0) {
      e.preventDefault();
      const vis = visible(value);
      const i = vis.findIndex((v) => v.join(".") === p.join("."));
      if (vis.length <= 1) return;
      update((root) => {
        listAt(root, parentPath(p)).splice(idx, 1);
      }, { path: vis[Math.max(0, i - 1)] });
      return;
    }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const to = e.key === "ArrowUp" ? idx - 1 : idx + 1;
      if (to < 0 || to >= siblings.length) return;
      update((root) => {
        const list = listAt(root, parentPath(p));
        const [moved] = list.splice(idx, 1);
        list.splice(to, 0, moved);
      }, { path: [...parentPath(p), to], note: isNote });
      return;
    }
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.altKey && !isNote) {
      const t = e.currentTarget;
      const atTop = t.value.slice(0, t.selectionStart).indexOf("\n") < 0;
      const atBottom = t.value.slice(t.selectionEnd).indexOf("\n") < 0;
      if ((e.key === "ArrowUp" && atTop) || (e.key === "ArrowDown" && atBottom)) {
        e.preventDefault();
        const vis = visible(value);
        const i = vis.findIndex((v) => v.join(".") === p.join("."));
        const j = e.key === "ArrowUp" ? i - 1 : i + 1;
        if (vis[j]) setFocus({ path: vis[j] });
      }
    }
  };

  const render = (nodes: OutlineNode[], base: Path) =>
    nodes.map((n, i) => {
      const p = [...base, i];
      const key = p.join(".");
      const collapsed = isCollapsed(n);
      return (
        <div key={key} data-path={key}>
          <div className="ol-node">
            <span
              className={"bullet" + (collapsed ? " collapsed" : "")}
              title={n.children.length ? (collapsed ? "Expand" : "Collapse") : ""}
              onClick={() =>
                n.children.length &&
                update((root) => {
                  const x = getAt(root, p);
                  x.attrs = { ...(x.attrs ?? {}) };
                  if (x.attrs.collapsed === "true") delete x.attrs.collapsed;
                  else x.attrs.collapsed = "true";
                  if (Object.keys(x.attrs).length === 0) delete x.attrs;
                })
              }
            >
              {n.children.length ? (collapsed ? "▸" : "▾") : "•"}
            </span>
            <AutoTextarea
              className="text"
              value={n.text}
              onChange={(text) =>
                update((root) => {
                  getAt(root, p).text = text;
                })
              }
              onKeyDown={(e) => onKey(p, e, false)}
              onFocus={() => setFocus((f) => (f && f.path.join(".") === key && !f.note ? f : { path: p }))}
            />
          </div>
          {n.note !== undefined && (
            <AutoTextarea
              className="ol-note"
              value={n.note}
              placeholder="note…"
              onChange={(note) =>
                update((root) => {
                  getAt(root, p).note = note;
                })
              }
              onKeyDown={(e) => onKey(p, e, true)}
              onBlur={() =>
                n.note === "" &&
                update((root) => {
                  delete getAt(root, p).note;
                })
              }
              onFocus={() => setFocus({ path: p, note: true })}
            />
          )}
          {!collapsed && n.children.length > 0 && <div className="ol-children">{render(n.children, p)}</div>}
        </div>
      );
    });

  return (
    <div className="outliner" ref={container}>
      {render(value.length ? value : [{ text: "", children: [] }], [])}
      <div className="ol-help">
        <span className="kbd">Enter</span> new item · <span className="kbd">Tab</span>/<span className="kbd">Shift+Tab</span> indent · <span className="kbd">Shift+Enter</span> note ·{" "}
        <span className="kbd">Alt+↑↓</span> move · click bullet to collapse
      </div>
    </div>
  );
}

function AutoTextarea(props: {
  className: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  }, [props.value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={props.className}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={props.onKeyDown}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      spellCheck={false}
    />
  );
}
