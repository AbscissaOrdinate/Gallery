import { useEffect, useMemo, useRef, useState } from "react";
import { actions, useApp } from "./state";
import type { GalleryRecord, Link } from "../core/types";
import { isNote } from "../core/types";
import { SchemaForm } from "./SchemaForm";
import { Outliner } from "./Outliner";
import { RefPicker } from "./RefPicker";
import { BudgetPanel } from "./BudgetPanel";
import { AssetsPanel } from "./AssetsPanel";
import { BodyPanel } from "./BodyPanel";
import { SystemBuilder } from "./SystemBuilder";
import { slugify } from "../core/ids";
import { Button, Group, Panel, Row, Select, StatusRow, TextArea, TextField, caps } from "./kit";

export function RecordEditor({ id }: { id: string }) {
  const { repo } = useApp();
  const loaded = repo?.get(id);
  const [draft, setDraft] = useState<GalleryRecord | null>(() => (loaded ? structuredClone(loaded.record) : null));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [builder, setBuilder] = useState(false);
  const timer = useRef<number | null>(null);

  // Autosave 900 ms after the last edit; also on unmount.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const flush = async () => {
    if (!repo || !draftRef.current || !dirtyRef.current) return;
    setSaving(true);
    try {
      await repo.save(draftRef.current);
      setDirty(false);
      dirtyRef.current = false;
    } catch (err) {
      actions.error(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    if (!dirty) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 900);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [draft, dirty]);
  useEffect(() => () => void flush(), []);
  // Pick up external changes (map drags, reload) when there are no unsaved edits.
  useEffect(() => {
    if (!dirtyRef.current && loaded) setDraft(structuredClone(loaded.record));
  }, [loaded?.record.updated]);

  const schema = useMemo(() => (draft && repo ? repo.registry.get(draft.type) : undefined), [draft?.type, repo]);
  if (!repo || !draft || !loaded) return <div className="help">Record not found.</div>;

  const edit = (patch: Partial<GalleryRecord>) => {
    setDraft({ ...draft, ...patch } as GalleryRecord);
    setDirty(true);
  };
  const backlinks = repo.backlinks(id);
  const fieldCount = Object.keys(schema?.fields.properties ?? {}).length;

  return (
    <div className="doc">
      <div className="doc-head">
        <Button size="sm" onClick={() => actions.back()} title="Back (Alt+←)">
          Back
        </Button>
        <span className="doc-kind">
          <span className="icon">{schema?.icon}</span>
          {caps(schema?.title ?? draft.type)}
        </span>
        <span className="doc-path">{loaded.location.path}</span>
        <span className="grow" />
        <span className={"stamp " + (saving ? "sev-text-pending" : dirty ? "sev-text-caution" : "sev-text-nominal")}>{saving ? "SAVING" : dirty ? "UNSAVED" : "SAVED"}</span>
        <Button size="sm" onClick={flush} disabled={!dirty}>
          SAVE
        </Button>
        {!confirmDelete ? (
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
            DELETE
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                await repo.delete(id);
                actions.toast("Deleted");
                actions.navigate({ kind: "list", type: draft.type });
              }}
            >
              CONFIRM DELETE
            </Button>
            <Button size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </>
        )}
      </div>

      <input
        className="doc-title"
        aria-label="Name"
        value={draft.name}
        onChange={(e) => edit({ name: e.target.value })}
        onBlur={() => {
          // keep the filename in step with the name unless the slug was customised
          if (draft.slug === slugify(loaded.record.name) || !draft.slug) edit({ slug: slugify(draft.name) });
        }}
      />
      {loaded.problems && <StatusRow severity="caution" id="LOAD" message={loaded.problems.join(" · ")} word={false} />}

      <Panel title="RECORD" meta={draft.id}>
        <Group>
          <Row label="TAGS">
            <TagInput value={draft.tags} onChange={(tags) => edit({ tags })} placeholder="tag, tag, tag" />
          </Row>
          <Row label="ALIASES">
            <TagInput value={draft.aliases} onChange={(aliases) => edit({ aliases })} placeholder="alternate names" />
          </Row>
          <Row label="SUMMARY">
            <TextField value={draft.summary ?? ""} onChange={(e) => edit({ summary: e.target.value || undefined })} placeholder="One line, shows in lists and CSV" />
          </Row>
          <Row label="SLUG / FILE">
            <TextField value={draft.slug} onChange={(e) => edit({ slug: slugify(e.target.value) || draft.slug })} />
          </Row>
        </Group>
      </Panel>

      {isNote(draft) ? (
        <Panel title="OUTLINE">
          <Outliner value={draft.outline} onChange={(outline) => edit({ outline })} />
        </Panel>
      ) : (
        <>
          {draft.type === "body" && <BodyPanel body={draft} />}
          {schema && (
            <Panel title="CHARACTERISTICS" meta={`${fieldCount} fields`}>
              <SchemaForm schema={schema.fields} value={draft.fields} onChange={(fields) => edit({ fields })} />
            </Panel>
          )}
          {draft.type === "craft" && <BudgetPanel craft={draft} />}
          {draft.type === "hull" && (
            <div className="row">
              <Button variant="primary" onClick={() => actions.navigate({ kind: "hull", id: draft.id })}>
                Open hull editor
              </Button>
            </div>
          )}
          {draft.type === "system" && (
            <div className="row">
              <Button variant="primary" onClick={() => actions.navigate({ kind: "map", id: draft.id })}>
                Open map
              </Button>
              <Button onClick={() => setBuilder((b) => !b)}>Generate skeleton…</Button>
            </div>
          )}
          {draft.type === "system" && builder && <SystemBuilder system={draft} onDone={() => setBuilder(false)} />}
          <Panel title="NOTES" meta="Markdown">
            <TextArea className="prose" value={draft.body ?? ""} onChange={(e) => edit({ body: e.target.value || undefined })} placeholder="Long-form description, history, design rationale…" />
          </Panel>
        </>
      )}

      <Panel title="LINKS" meta={`${draft.links.length} out · ${backlinks.length} in`}>
        <Group title="OUTGOING">
          <LinksEditor value={draft.links} rels={schema?.rels ?? []} onChange={(links) => edit({ links })} />
        </Group>
        {backlinks.length > 0 && (
          <Group title="REFERENCED BY" meta={String(backlinks.length)}>
            {backlinks.map((b, i) => (
              <Row key={i} label={caps(b.rel)}>
                <span className="link" onClick={() => actions.navigate({ kind: "record", id: b.from.record.id })}>
                  {b.from.record.name}
                </span>
                <span className="unit">{b.from.record.type}</span>
              </Row>
            ))}
          </Group>
        )}
      </Panel>

      <AssetsPanel record={draft} onChange={(assets) => edit({ assets })} />

      <div className="doc-foot">
        created {draft.created.slice(0, 10)} · updated {draft.updated.slice(0, 16).replace("T", " ")}
        {draft.preset && <> · preset {draft.preset}</>}
      </div>
    </div>
  );
}

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(value.join(", "));
  useEffect(() => setText(value.join(", ")), [value.join(" ")]);
  return (
    <TextField
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange([...new Set(text.split(/[,;]/).map((t) => t.trim()).filter(Boolean))])}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}

function LinksEditor({ value, rels, onChange }: { value: Link[]; rels: string[]; onChange: (v: Link[]) => void }) {
  const [rel, setRel] = useState(rels[0] ?? "related");
  const relOptions = [...new Set([...rels, "related", "see-also", "source"])];
  return (
    <div className="stack">
      {value.map((l, i) => (
        <div key={i} className="row tight">
          <TextField className="w-rel" value={l.rel} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, rel: e.target.value } : x)))} list="rel-options" aria-label="Relation" />
          <RefPicker value={l.to} types={[]} onChange={(to) => (to ? onChange(value.map((x, j) => (j === i ? { ...x, to } : x))) : onChange(value.filter((_, j) => j !== i)))} />
          <TextField className="w-rel" value={l.note ?? ""} placeholder="note" onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, note: e.target.value || undefined } : x)))} aria-label="Note" />
          <Button size="sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            REMOVE
          </Button>
        </div>
      ))}
      <div className="row tight">
        <Select className="w-rel" value={rel} onChange={(e) => setRel(e.target.value)} aria-label="Relation">
          {relOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <RefPicker value="" types={[]} onChange={(to) => to && onChange([...value, { rel, to }])} placeholder="Add a link to any record…" />
      </div>
      <datalist id="rel-options">
        {relOptions.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
    </div>
  );
}
