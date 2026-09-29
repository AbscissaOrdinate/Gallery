/**
 * AdvisoryLog (docs/design-book/components/AdvisoryLog): the session stream,
 * every advisory and event in time order, with a detail pane. The one place
 * ordered by time; editors group by severity. Columns are fixed. Lines are
 * never collapsed, and a severity toggled off dims in the filter bar with its
 * count still showing, so nothing is hidden silently. It subsumes the old
 * LOAD PROBLEMS list (the vault's own lines).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { actions, useApp } from "./state";
import { useSessionLog } from "./log";
import { LOG_SEVERITIES, SEVERITY_WORD_LOG, countLines, exportLog, logRelative, logTimestamp, matchesQuery, parseLogQuery, type LogLine, type LogSeverity } from "../core/sessionLog";
import { Button, Group, Panel, Pip, Row, Spinner, TextField, cx } from "./kit";

const elapsed = (ms: number | undefined) => (ms === undefined ? "—" : `${(ms / 1000).toFixed(2)} s`);
const sessionDate = (at: number) => new Date(at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }).toLocaleUpperCase("en");

export function AdvisoryLog({ initialQuery }: { initialQuery?: string }) {
  const log = useSessionLog();
  const { repo } = useApp();
  const [shown, setShown] = useState<Record<LogSeverity, boolean>>({ violation: true, caution: true, nominal: true, info: true });
  const [query, setQuery] = useState(initialQuery ?? "");
  const [wrap, setWrap] = useState(false);
  const [relative, setRelative] = useState(false);
  const [follow, setFollow] = useState(true);
  const [from, setFrom] = useState(0); // CLEAR VIEW: lines before this seq are out of view, and counted
  const [selSeq, setSelSeq] = useState<number | null>(null);
  const stream = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(h);
  }, []);

  const q = useMemo(() => parseLogQuery(query), [query]);
  const all = log.lines;
  const inView = all.filter((l) => l.seq > from);
  const visible = inView.filter((l) => shown[l.severity] && matchesQuery(l, q));
  const totals = countLines(inView.filter((l) => matchesQuery(l, q)));
  const open = countLines(all, true);
  const sel = all.find((l) => l.seq === selSeq);

  // Follow the tail while pinned; scrolling up breaks the pin, scrolling back to the end restores it.
  useEffect(() => {
    const el = stream.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [visible.length, follow]);
  const onScroll = () => {
    const el = stream.current;
    if (!el) return;
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 2;
    if (atEnd !== follow) setFollow(atEnd);
  };

  const download = () => {
    const blob = new Blob([exportLog(visible)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gallery-session-${String(log.session.number).padStart(4, "0")}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const session = String(log.session.number).padStart(4, "0");
  return (
    <div className="logview">
      <div className="toolbar log-bar">
        <span className="log-filters" role="group" aria-label="Severity filter">
          {LOG_SEVERITIES.map((s) => (
            <button key={s} type="button" className={cx("log-filter", !shown[s] && "is-off")} aria-pressed={shown[s]} onClick={() => setShown({ ...shown, [s]: !shown[s] })} title={shown[s] ? `Hide ${SEVERITY_WORD_LOG[s]} lines` : `Show ${SEVERITY_WORD_LOG[s]} lines`}>
              <Pip severity={s} />
              {SEVERITY_WORD_LOG[s]}
              <span className="count">{totals[s]}</span>
            </button>
          ))}
        </span>
        <TextField className="log-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="source:hull severity:>=caution since:06:00" aria-label="Filter" />
        <span className="meta grow">
          {visible.length} of {all.length} lines{from > 0 ? ` · ${all.length - inView.length} cleared from view` : ""}
          {q.unknown.length > 0 && <span className="sev-text-caution"> · not understood: {q.unknown.join(" ")}</span>} · follow <span className={follow ? "accent-text" : undefined}>{follow ? "ON" : "OFF"}</span>
        </span>
        <Button size="sm" onClick={() => setWrap(!wrap)}>
          WRAP: {wrap ? "ON" : "OFF"}
        </Button>
        <Button size="sm" onClick={() => setRelative(!relative)}>
          TIME: {relative ? "RELATIVE" : "ABSOLUTE"}
        </Button>
        <Button size="sm" onClick={download} title="Save the lines in view as text">
          EXPORT
        </Button>
        <Button size="sm" onClick={() => setFrom(all.length ? all[all.length - 1].seq : 0)} title="Start the view from now; earlier lines stay in the log and are counted">
          CLEAR VIEW
        </Button>
      </div>
      <div className="logbody">
        <div className="logmain">
          <div className="log-cols log-head">
            <span>TIMESTAMP</span>
            <span>SEVERITY</span>
            <span>SOURCE</span>
            <span>CODE</span>
            <span>MESSAGE</span>
            <span className="num">ELAPSED</span>
          </div>
          <div className="log-stream" ref={stream} onScroll={onScroll}>
            <div className="log-session">
              {sessionDate(log.session.started)} — SESSION {session}
              {log.session.operator ? ` — OPERATOR ${log.session.operator.toLocaleUpperCase("en")}` : ""}
            </div>
            {visible.map((l) => (
              <LogRow key={l.seq} line={l} wrap={wrap} time={relative ? logRelative(l.at, log.session.started) : logTimestamp(l.at)} selected={l.seq === selSeq} onSelect={() => setSelSeq(l.seq === selSeq ? null : l.seq)} />
            ))}
          </div>
        </div>
        <aside className="logside">
          <Detail line={sel} />
        </aside>
      </div>
      <div className="log-foot">
        <span>SESSION {session}</span>
        <span>{all.length} lines</span>
        <span className="sev-text-violation">{open.violation} violations</span>
        <span className="sev-text-caution">{open.caution} cautions</span>
        {follow ? (
          <span className="accent-text">
            FOLLOWING TAIL <Spinner />
          </span>
        ) : (
          <button type="button" className="log-resume" onClick={() => setFollow(true)}>
            PAUSED — FOLLOW TAIL
          </button>
        )}
        <span className="grow" />
        <span>
          NODE {log.session.node ?? repo?.fs.label} · {logTimestamp(now).slice(0, 8)}
        </span>
      </div>
    </div>
  );
}

function LogRow({ line: l, wrap, time, selected, onSelect }: { line: LogLine; wrap: boolean; time: string; selected: boolean; onSelect: () => void }) {
  return (
    <div className={cx("log-cols log-row", `sev-row-${l.severity}`, selected && "is-current", wrap && "is-wrapped")} role="button" tabIndex={0} aria-pressed={selected} onClick={onSelect} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}>
      <span className="log-ts">{time}</span>
      <span className={cx("stamp", `sev-text-${l.severity}`)}>{SEVERITY_WORD_LOG[l.severity]}</span>
      <span className="log-src">{l.source}</span>
      <span className="log-code">{l.code}</span>
      <span className="log-msg">{l.message}</span>
      <span className="log-el num">{elapsed(l.elapsedMs)}</span>
    </div>
  );
}

function Detail({ line: l }: { line: LogLine | undefined }) {
  if (!l) {
    return (
      <Panel title="DETAIL">
        <p className="help">Select a line for its source, subject and state.</p>
      </Panel>
    );
  }
  const d = l.detail ?? {};
  const state = l.clearedAt !== undefined ? `CLEARED ${logTimestamp(l.clearedAt)}` : l.severity === "violation" || l.severity === "caution" ? "OPEN" : "—";
  return (
    <Panel title="DETAIL" meta={<span className={`sev-text-${l.severity}`}>{SEVERITY_WORD_LOG[l.severity]}</span>}>
      <Group title={l.code}>
        <Row label="RAISED">
          <span className="val">{logTimestamp(l.at)}</span>
        </Row>
        <Row label="SOURCE">
          <span className="val">{[l.source, d.domain].filter(Boolean).join(" / ")}</span>
        </Row>
        {d.subject && (
          <Row label="SUBJECT">
            {d.subjectId ? (
              <span className="val link" role="link" tabIndex={0} onClick={() => actions.navigate({ kind: "record", id: d.subjectId! })}>
                {d.subject}
              </span>
            ) : (
              <span className="val">{d.subject}</span>
            )}
          </Row>
        )}
        {d.components && d.components.length > 0 && (
          <Row label="COMPONENTS">
            <span className="val">{d.components.join(", ")}</span>
          </Row>
        )}
        {d.mode && (
          <Row label="MODE">
            <span className="val">{d.mode}</span>
          </Row>
        )}
        {d.path && (
          <Row label="FILE">
            <span className="val">{d.path}</span>
          </Row>
        )}
        <Row label="STATE">
          <span className={cx("val", l.clearedAt === undefined && (l.severity === "violation" || l.severity === "caution") && `sev-text-${l.severity}`)}>{state}</span>
        </Row>
        {l.elapsedMs !== undefined && (
          <Row label="ELAPSED">
            <span className="val">{elapsed(l.elapsedMs)}</span>
          </Row>
        )}
      </Group>
      <Group title="MESSAGE">
        <p className="log-detail-msg">{l.message}</p>
        {d.note && <p className="prose">{d.note}</p>}
      </Group>
    </Panel>
  );
}
