import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { actions, useApp } from "./state";
import type { GalleryRecord, Handling, HandlingVocab, Link, TypedRecord } from "../core/types";
import { HANDLING_LEVELS, isNote } from "../core/types";
import { SchemaForm } from "./SchemaForm";
import { Outliner } from "./Outliner";
import { RefPicker } from "./RefPicker";
import { BudgetPanel } from "./BudgetPanel";
import { AssetsPanel } from "./AssetsPanel";
import { BodyPanel } from "./BodyPanel";
import { SystemBuilder } from "./SystemBuilder";
import { slugify } from "../core/ids";
import { bannerString, compactHandling, completeness, LEVEL_WORD, levelOf, recordCode } from "../core/handling";
import type { Repository } from "../core/repo";
import {
  Button,
  Checkbox,
  ClassificationBadge,
  ClassificationBanner,
  Group,
  Panel,
  Row,
  Select,
  StatusRow,
  TextArea,
  TextField,
  caps,
  type BadgeRow,
  type UiSeverity,
} from "./kit";

/**
 * A record, read and edited on its page (RecordPage plate, docs/STYLE.md §4):
 * classification banners top and bottom, a header with the title, subtitle,
 * tag chips and the badge block, the CHARACTERISTICS panel with computed
 * redaction, and a side column of backlinks, handling and revisions.
 *
 * `compact` is the same editor without the document frame, for the map's
 * inspector: banners mark a record page, never a panel.
 */
export function RecordEditor({ id, compact }: { id: string; compact?: boolean }) {
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
  // Pick up external changes (map drags, reload, the revision log) when there are no unsaved edits.
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
  const done = completeness(draft, schema?.fields);
  const vocab = repo.config.handling;
  const programme = draft.handling?.programme ? repo.typed(draft.handling.programme) : undefined;
  const banner = bannerString(draft, schema, programme);
  const code = recordCode(draft, schema);

  // ---- pieces shared by the page and the compact inspector ---------------
  const commands = (
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
  );

  const title = (
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
  );

  const recordGroup = (
    <Group title="RECORD">
      <Row label="TAGS">
        <TagInput value={draft.tags} onChange={(tags) => edit({ tags })} placeholder="tag, tag, tag" />
      </Row>
      <Row label="ALIASES">
        <TagInput value={draft.aliases} onChange={(aliases) => edit({ aliases })} placeholder="alternate names" />
      </Row>
      {compact && (
        <Row label="SUMMARY">
          <TextField value={draft.summary ?? ""} onChange={(e) => edit({ summary: e.target.value || undefined })} placeholder="One line, shows in lists and CSV" />
        </Row>
      )}
      <Row label="SLUG / FILE">
        <TextField value={draft.slug} onChange={(e) => edit({ slug: slugify(e.target.value) || draft.slug })} />
      </Row>
    </Group>
  );

  const characteristics = (
    <Panel title="CHARACTERISTICS" meta={done.required ? `${fieldCount} fields · ${done.pending.length} pending` : `${fieldCount} fields`}>
      {recordGroup}
      {isNote(draft) ? (
        <Group title="OUTLINE">
          <Outliner value={draft.outline} onChange={(outline) => edit({ outline })} />
        </Group>
      ) : (
        schema && <SchemaForm schema={schema.fields} value={draft.fields} onChange={(fields) => edit({ fields })} redact={!compact} />
      )}
      {!isNote(draft) && (
        <Group title="NOTES" meta="prose · Markdown">
          <TextArea className="prose" value={draft.body ?? ""} onChange={(e) => edit({ body: e.target.value || undefined })} placeholder="Long-form description, history, design rationale…" />
        </Group>
      )}
    </Panel>
  );

  const extras = !isNote(draft) && (
    <>
      {draft.type === "body" && <BodyPanel body={draft} />}
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
    </>
  );

  const links = (
    <Panel title="LINKS" meta={`${draft.links.length} out`}>
      <LinksEditor value={draft.links} rels={schema?.rels ?? []} onChange={(l) => edit({ links: l })} />
    </Panel>
  );

  const problems = loaded.problems && <StatusRow severity="caution" id="LOAD" message={loaded.problems.join(" · ")} word={false} />;

  // ---- compact: the map inspector ------------------------------------------
  if (compact) {
    return (
      <div className="doc">
        {commands}
        {title}
        {problems}
        {characteristics}
        {extras}
        {links}
        <AssetsPanel record={draft} onChange={(assets) => edit({ assets })} />
      </div>
    );
  }

  // ---- the record page -----------------------------------------------------
  const badge: BadgeRow[] = [
    { key: "CLEARANCE", value: draft.handling?.badge?.clearance },
    { key: "DISRUPTION", value: draft.handling?.badge?.disruption, severity: vocabSeverity(vocab?.disruption, draft.handling?.badge?.disruption) },
    { key: "RISK", value: draft.handling?.badge?.risk, severity: vocabSeverity(vocab?.risk, draft.handling?.badge?.risk) },
    {
      key: "SURVEY",
      value: done.fraction === undefined ? undefined : `${Math.round(done.fraction * 100)}% COMPLETE`,
      severity: done.fraction === undefined ? undefined : done.fraction >= 1 ? "nominal" : "caution",
    },
  ];
  const setHandling = (patch: Partial<Handling>) => edit({ handling: compactHandling({ ...draft.handling, ...patch }) });

  return (
    <div className="recordpage">
      <ClassificationBanner text={banner} level={levelOf(draft)} />
      <div className="rp-scroll">
        <div className="rp-grid">
          <div className="rp-doc">
            <Panel>
              {commands}
              <div className="rp-head">
                <div className="grow">
                  {title}
                  <input
                    className="doc-subtitle"
                    aria-label="Summary"
                    value={draft.summary ?? ""}
                    placeholder="One line, shows in lists and CSV"
                    onChange={(e) => edit({ summary: e.target.value || undefined })}
                  />
                  {draft.tags.length > 0 && (
                    <div className="chips">
                      {draft.tags.map((t) => (
                        <span key={t} className="chip" role="button" onClick={() => (actions.setQuery(t), actions.navigate({ kind: "list" }))}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <ClassificationBadge rows={badge} />
              </div>
            </Panel>
            {problems}
            {characteristics}
            {extras}
            {links}
            <AssetsPanel record={draft} onChange={(assets) => edit({ assets })} />
          </div>

          <aside className="rp-side">
            <Backlinks repo={repo} backlinks={backlinks} />
            <HandlingPanel handling={draft.handling} vocab={vocab} code={code} onChange={setHandling} />
            <Revisions record={draft} />
          </aside>
        </div>
      </div>
      <ClassificationBanner text={banner} level={levelOf(draft)} />
      <footer className="rp-foot">
        <span className="here">{code}</span>
        <span>
          kind: <span className="here">{draft.type}</span>
        </span>
        <span>{backlinks.length} backlinks</span>
        {done.required > 0 && <span className={done.pending.length ? "sev-text-caution" : undefined}>{done.pending.length} fields pending</span>}
        <span className="right">
          {repo.fs.label} · {draft.updated.slice(0, 16).replace("T", " ")}
        </span>
      </footer>
    </div>
  );
}

/** The badge colours a disruption or risk value by the severity its vocabulary gives it. */
function vocabSeverity(list: HandlingVocab["risk"] | undefined, value: string | undefined): UiSeverity | undefined {
  const hit = value ? list?.find((e) => e.value === value) : undefined;
  return hit ? (hit.severity === "critical" ? "violation" : hit.severity) : undefined;
}

/** Records that point here: kind glyph, name, kind — sorted by kind, then name. */
function Backlinks({ repo, backlinks }: { repo: Repository; backlinks: ReturnType<Repository["backlinks"]> }) {
  // One row per record, however many relations it points here by; the relations are on hover.
  const byRecord = new Map<string, { record: GalleryRecord; rels: string[] }>();
  for (const b of backlinks) {
    const hit = byRecord.get(b.from.record.id);
    if (hit) hit.rels.push(b.rel);
    else byRecord.set(b.from.record.id, { record: b.from.record, rels: [b.rel] });
  }
  const rows = [...byRecord.values()].sort((a, b) => a.record.type.localeCompare(b.record.type) || a.record.name.localeCompare(b.record.name));
  return (
    <Panel title="BACKLINKS" meta={String(rows.length)}>
      {rows.length === 0 && <div className="help">Nothing links here yet.</div>}
      <div>
        {rows.map(({ record, rels }) => (
          <div key={record.id} className="backlink" title={rels.join(", ")}>
            <span className="icon">{repo.registry.get(record.type)?.icon ?? "•"}</span>
            <span className="link" onClick={() => actions.navigate({ kind: "record", id: record.id })}>
              {record.name}
            </span>
            <span className="kind">{record.type}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** The record's marking, edited from the closed vocabularies in gallery.config.yaml. */
function HandlingPanel({ handling, vocab, code, onChange }: { handling: Handling | undefined; vocab: HandlingVocab | undefined; code: string; onChange: (p: Partial<Handling>) => void }) {
  const h = handling ?? {};
  const caveats = [...new Set([...(vocab?.caveats ?? []), ...(h.caveats ?? [])])];
  const pick = (label: string, value: string | undefined, options: string[], set: (v: string | undefined) => void): ReactNode => (
    <Row label={label}>
      <Select value={value ?? ""} onChange={(e) => set(e.target.value || undefined)}>
        <option value="">—</option>
        {/* A value off the list is kept and shown, never silently replaced. */}
        {(value && !options.includes(value) ? [value, ...options] : options).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    </Row>
  );
  return (
    <Panel title="HANDLING" bodyClassName="narrow">
      <Group title="MARKING">
        <Row label="LEVEL">
          <Select value={h.level ?? "unclassified"} onChange={(e) => onChange({ level: e.target.value as Handling["level"] })}>
            {HANDLING_LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_WORD[l]}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="CAVEATS">
          <span className="caveats">
            {caveats.map((c) => (
              <Checkbox key={c} label={c} checked={!!h.caveats?.includes(c)} onChange={(on) => onChange({ caveats: on ? [...(h.caveats ?? []), c] : (h.caveats ?? []).filter((x) => x !== c) })} />
            ))}
            {caveats.length === 0 && <span className="help">No caveats in gallery.config.yaml.</span>}
          </span>
        </Row>
        <Row label="CODE">
          <TextField value={h.code ?? ""} placeholder={code} onChange={(e) => onChange({ code: e.target.value.trim() || undefined })} />
        </Row>
        <Row label="PROGRAMME">
          <RefPicker value={h.programme ?? ""} types={["polity"]} onChange={(v) => onChange({ programme: v || undefined })} />
        </Row>
      </Group>
      <Group title="BADGE">
        {pick("CLEARANCE", h.badge?.clearance, vocab?.clearance ?? [], (v) => onChange({ badge: { ...h.badge, clearance: v } }))}
        {pick("DISRUPTION", h.badge?.disruption, (vocab?.disruption ?? []).map((e) => e.value), (v) => onChange({ badge: { ...h.badge, disruption: v } }))}
        {pick("RISK", h.badge?.risk, (vocab?.risk ?? []).map((e) => e.value), (v) => onChange({ badge: { ...h.badge, risk: v } }))}
      </Group>
      <Group title="PROVENANCE">
        <Row label="ORIGINATOR">
          <TextField value={h.originator ?? ""} onChange={(e) => onChange({ originator: e.target.value || undefined })} />
        </Row>
        <Row label="DECLASSIFY ON">
          <TextField value={h.declassify_on ?? ""} placeholder="date or event" onChange={(e) => onChange({ declassify_on: e.target.value || undefined })} />
        </Row>
        <Row label="DERIVED FROM">
          <TagInput value={h.derived_from ?? []} onChange={(v) => onChange({ derived_from: v.length ? v : undefined })} placeholder="code, code" />
        </Row>
      </Group>
    </Panel>
  );
}

/** Newest first: the log the repository keeps on save, then the record's creation. */
function Revisions({ record }: { record: GalleryRecord | TypedRecord }) {
  const log = [...(record.revisions ?? [])].reverse();
  const hasCreated = log.some((r) => r.change === "created");
  const rows = [...log.map((r) => ({ at: r.at, change: r.change === "created" ? "Record created" : r.change })), ...(hasCreated ? [] : [{ at: record.created, change: "Record created" }])];
  return (
    <Panel title="REVISIONS" meta={`last ${rows.length}`}>
      <div>
        {rows.map((r, i) => (
          <div key={i} className="revision">
            <span className="at">{r.at.slice(0, 16).replace("T", " ")}</span>
            <span className="what">{r.change}</span>
          </div>
        ))}
      </div>
    </Panel>
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
