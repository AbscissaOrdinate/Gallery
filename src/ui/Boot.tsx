/**
 * BootSequence (docs/design-book/components/BootSequence), cosmetic and never
 * gating (docs/STYLE.md §2): it shows while the vault really loads, its log
 * lines are the real load steps, and once loading finishes a full boot goes on
 * any key or click. The authorisation panel is display only — the PIN field
 * takes anything and nothing is checked. No lock timer. The banners carry the
 * operator's clearance: the one surface besides a record page that has them
 * (§8).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { version } from "../../package.json";
import { actions, useApp, type BootState } from "./state";
import { LEVEL_WORD } from "../core/handling";
import { idleSubject, orbitalFrames } from "../core/astro/asciiOrbits";
import { isNote, type TypedRecord } from "../core/types";
import type { Repository } from "../core/repo";
import { AsciiBar, Button, ClassificationBanner, Panel, Row, Group, Spinner, TextField, cx } from "./kit";
import { tokenMs } from "./tokenPx";

/** The progress bar reads across the log column: wider than the component's ten cells. */
const BOOT_BAR_CELLS = 32;

export function bootBanner(boot: BootState): string {
  const op = boot.operator;
  const marking = [LEVEL_WORD[op?.level ?? "unclassified"], ...(op?.caveats ?? [])].join("//");
  return [marking, "GALLERY WORKBENCH", op?.programme?.toLocaleUpperCase("en")].filter(Boolean).join(" — ");
}

const stamp = (at: number) => {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${Math.floor(d.getMilliseconds() / 100)}`;
};

export function Boot() {
  const { boot, repo } = useApp();
  const [pin, setPin] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const done = !!boot?.done;

  // Once loaded, any key or click goes on — except typing in the PIN field, where Enter does.
  useEffect(() => {
    if (!done) return;
    const onKey = (e: KeyboardEvent) => {
      const inPin = (e.target as Element | null)?.closest?.(".boot-pin");
      if (inPin && e.key !== "Enter") return;
      actions.dismissBoot();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done]);

  if (!boot) return null;
  const level = boot.operator?.level ?? "unclassified";
  const banner = bootBanner(boot);
  const full = boot.mode === "full";
  const inFlight = boot.lines.some((l) => l.inFlight);

  return (
    <div
      className={cx("boot", full && "is-full")}
      role="dialog"
      aria-label="Boot"
      onClick={(e) => {
        if (done && !panel.current?.contains(e.target as Node)) actions.dismissBoot();
      }}
    >
      <ClassificationBanner text={banner} level={level} />
      <div className="boot-body">
        <div className="boot-main">
          <div className="boot-mark">
            <span className="boot-wordmark">GALLERY</span>
            <span className="stamp ink-300">BUILD {version}</span>
          </div>
          <p className="boot-lede">Records, orbital charts and hull forms{repo ? ` for the ${repo.config.name} vault` : ""}.</p>
          <div className="boot-rule" />
          <div className="boot-log" role="log" aria-live="polite">
            {boot.lines.map((l, i) => (
              <div key={i} className={cx("boot-line", l.inFlight && "is-inflight")}>
                <span className="boot-ts">{stamp(l.at)}</span>
                <span className="boot-msg">
                  {l.message}
                  {l.inFlight && <Spinner />}
                </span>
                <span className={cx("boot-verdict", l.severity && `sev-text-${l.severity}`)}>{l.inFlight ? "—" : l.verdict}</span>
              </div>
            ))}
          </div>
          <div className="boot-progress">
            <span className="t-label-md">VAULT</span>
            <AsciiBar fraction={boot.progress ?? 0} cells={BOOT_BAR_CELLS} severity="pending" figure={<span className="boot-pct">{Math.round((boot.progress ?? 0) * 100)}%</span>} />
          </div>
          {full && (
            <div ref={panel} className="boot-auth">
              <Panel title="AUTHORIZATION" meta="SMARTCARD + PIN">
                <Group>
                  <Row label="OPERATOR">
                    <TextField readOnly value={boot.operator?.name ?? "—"} aria-label="Operator" />
                  </Row>
                  <Row label="CLEARANCE">
                    <TextField readOnly value={boot.operator?.clearance ?? LEVEL_WORD[level]} aria-label="Clearance" />
                  </Row>
                  <Row label="PIN">
                    <TextField className="boot-pin" type="password" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} aria-label="PIN" placeholder={done ? "any PIN, or none" : undefined} />
                  </Row>
                </Group>
                <div className="btn-group end">
                  <Button onClick={() => actions.abortBoot()}>ABORT</Button>
                  <Button variant="primary" disabled={!done} onClick={() => actions.dismissBoot()} title={done ? undefined : "Available once the vault has loaded"}>
                    AUTHORIZE
                  </Button>
                </div>
              </Panel>
            </div>
          )}
          {full && done && !inFlight && <div className="boot-hint">PRESS ANY KEY</div>}
        </div>
        {full && repo && <OrbitalIdle repo={repo} />}
      </div>
      <div className="boot-foot">
        NODE {boot.node}
        {repo && ` · ${idleName(repo) ?? ""}`} · {new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }).toLocaleUpperCase("en")}
      </div>
      <ClassificationBanner text={banner} level={level} />
    </div>
  );
}

function idleRecords(repo: Repository): { systems: TypedRecord[]; bodies: TypedRecord[] } {
  const typed = repo.all().map((r) => r.record).filter((r): r is TypedRecord => !isNote(r));
  return { systems: typed.filter((r) => r.type === "system"), bodies: typed.filter((r) => r.type === "body") };
}
function idleName(repo: Repository): string | undefined {
  const { systems, bodies } = idleRecords(repo);
  return idleSubject(systems, bodies)?.primary.toLocaleUpperCase("en");
}

/** Three frames of the vault's own system, glyph-navy with the primary in accent-300; static under reduced motion. */
function OrbitalIdle({ repo }: { repo: Repository }) {
  const subject = useMemo(() => {
    const { systems, bodies } = idleRecords(repo);
    return idleSubject(systems, bodies);
  }, [repo]);
  const frames = useMemo(() => orbitalFrames(subject), [subject]);
  const [f, setF] = useState(0);
  useEffect(() => {
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = tokenMs("--dur-idle-frame");
    if (reduce || !ms) return;
    const h = window.setInterval(() => setF((x) => (x + 1) % frames.length), ms);
    return () => window.clearInterval(h);
  }, [frames.length]);
  const frame = frames[f] ?? frames[0];
  return (
    <div className="boot-idle" aria-hidden>
      <div className="t-label-xs ink-300">{subject ? `${subject.primary.toLocaleUpperCase("en")} — ${subject.orbits.length} ORBITS` : "ORBITAL IDLE"}</div>
      <pre className="boot-art">
        {frame.map((row, i) => {
          const at = row.indexOf("*");
          return (
            <div key={i}>
              {at < 0 ? (
                row || " "
              ) : (
                <>
                  {row.slice(0, at)}
                  <span className="boot-primary">*</span>
                  {row.slice(at + 1)}
                </>
              )}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
