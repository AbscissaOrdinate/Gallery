import { useMemo } from "react";
import { actions, useApp } from "./state";
import type { TypedRecord } from "../core/types";
import { deriveBody } from "../core/astro/derive";
import { glyphSvg } from "../core/astro/glyph";
import * as E from "../core/astro/ewocs";

const fmt = (n: number | undefined, d = 2) => (n === undefined || !Number.isFinite(n) ? "—" : n >= 1e5 ? n.toExponential(2) : n.toLocaleString(undefined, { maximumFractionDigits: d }));

/** Derived panel for a body record: Worldsmith outputs, EWoCS classification, glyph preview. */
export function BodyPanel({ body }: { body: TypedRecord }) {
  const { repo } = useApp();
  const d = useMemo(() => (repo ? deriveBody(body, (id) => repo.typed(id)) : null), [body, repo, repo?.all().length]);
  if (!repo || !d) return null;

  const Stat = ({ k, v, unit, warn, title }: { k: string; v: string; unit?: string; warn?: boolean; title?: string }) => (
    <div className="stat" title={title}>
      <div className="k">{k}</div>
      <div className={"v" + (warn ? " warn" : "")} style={{ fontSize: 14 }}>
        {v}
        {unit && <small>{unit}</small>}
      </div>
    </div>
  );
  const system = typeof body.fields.system === "string" ? repo.record(body.fields.system) : undefined;

  return (
    <div className={"card" + (d.warnings.length ? " warn" : "")}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="svgbox" style={{ padding: 4, width: 84, height: 84, flex: "none" }} dangerouslySetInnerHTML={{ __html: glyphSvg(d.glyph, 76) }} />
        <div className="grow">
          <h3 style={{ marginTop: 0 }}>Derived (Worldsmith · EWoCS)</h3>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{d.ewocs.shorthand || <span className="muted">— set kind, mass and classification —</span>}</div>
          <div className="muted" style={{ fontSize: 12 }}>{d.ewocs.full}</div>
          <div className="row wrap" style={{ marginTop: 6, gap: 4 }}>
            {d.massClass && <span className="chip" title={d.massClass.description}>{d.massClass.sizeClass} · {d.massClass.subclass}</span>}
            {d.hostStar && (
              <span className="chip">
                orbits <span className="link" onClick={() => actions.navigate({ kind: "record", id: d.hostStar!.star.id })}>{d.hostStar.star.name}</span>
                {d.parent && d.parent.id !== d.hostStar.star.id && (
                  <>
                    {" "}via <span className="link" onClick={() => actions.navigate({ kind: "record", id: d.parent!.id })}>{d.parent.name}</span>
                  </>
                )}
              </span>
            )}
            {system && (
              <button className="ghost" onClick={() => actions.navigate({ kind: "map", id: system.id })}>
                Open map ↗
              </button>
            )}
          </div>
        </div>
      </div>

      {d.star && (
        <>
          <h3>Star</h3>
          <div className="budget">
            <Stat k="Spectral class" v={d.star.spectral} />
            <Stat k="Luminosity" v={fmt(d.star.luminositySol, 3)} unit="L☉" />
            <Stat k="Radius" v={fmt(d.star.radiusSol, 3)} unit="R☉" />
            <Stat k="Temperature" v={fmt(d.star.temperatureK, 0)} unit="K" />
            <Stat k="MS lifetime" v={fmt(d.star.maxAgeGyr, 2)} unit="Gyr" />
            <Stat k="Habitable zone" v={`${fmt(d.star.hzInnerAU, 3)} – ${fmt(d.star.hzOuterAU, 3)}`} unit="AU" />
            <Stat k="Frost line" v={fmt(d.star.frostLineAU, 2)} unit="AU" />
            <Stat k="Inner limit" v={fmt(d.star.innerLimitAU, 4)} unit="AU" />
            <Stat k="Earth-like life" v={d.star.earthlikeLife} />
          </div>
        </>
      )}

      {!d.isStar && (
        <>
          <h3>Orbit</h3>
          <div className="budget">
            {d.heliocentricAU !== undefined && <Stat k="Heliocentric distance" v={fmt(d.heliocentricAU, 3)} unit="AU" />}
            {d.smaKm !== undefined && <Stat k="Semi-major axis" v={fmt(d.smaKm, 0)} unit="km" />}
            {d.periodYears !== undefined && <Stat k="Period" v={`${fmt(d.periodYears, 3)} yr · ${fmt(d.periodDays, 1)} d`} />}
            {d.periodYears === undefined && d.periodDays !== undefined && <Stat k="Period (sidereal)" v={fmt(d.periodDays, 2)} unit="d" />}
            {d.synodicDays !== undefined && <Stat k="Period (synodic)" v={fmt(d.synodicDays, 2)} unit="d" />}
            {d.periapsisAU !== undefined && <Stat k="Periapsis / apoapsis" v={`${fmt(d.periapsisAU, 3)} / ${fmt(d.apoapsisAU, 3)}`} unit="AU" />}
            {d.fluxRelEarth !== undefined && <Stat k="Stellar flux" v={fmt(d.fluxRelEarth, 3)} unit="× Earth" />}
            {d.hillRadiusKm !== undefined && <Stat k="Hill radius" v={fmt(d.hillRadiusKm, 0)} unit="km" />}
            {d.moonZoneInnerKm !== undefined && <Stat k="Parent's moon zone" v={`${fmt(d.moonZoneInnerKm, 0)} – ${fmt(d.moonZoneOuterKm, 0)}`} unit="km" warn={d.warnings.some((w) => /Roche|moon zone/.test(w))} />}
            {d.lockToStarGyr !== undefined && <Stat k="Lock to star" v={fmt(d.lockToStarGyr, 2)} unit="Gyr" title={d.lockToStarGyr < (d.hostStar ? (typeof d.hostStar.star.fields.age_gyr === "number" ? d.hostStar.star.fields.age_gyr : 4.5) : 4.5) ? "Shorter than the star's age → likely locked" : ""} />}
            {d.lockToParentGyr !== undefined && <Stat k="Lock to parent" v={fmt(d.lockToParentGyr, 3)} unit="Gyr" title={d.lockToParentLabel} />}
            {d.parentLockToThisGyr !== undefined && <Stat k="Parent locks to this" v={fmt(d.parentLockToThisGyr, 2)} unit="Gyr" title={d.parentLockToThisLabel} />}
            {d.tidesEarth !== undefined && <Stat k="Tides on parent" v={fmt(d.tidesEarth, 2)} unit="× Earth" />}
          </div>

          <h3>Physical</h3>
          <div className="budget">
            <Stat k="Radius" v={fmt(d.radiusKm, 0)} unit="km" />
            <Stat k="Density" v={fmt(d.densityGcc, 2)} unit="g/cm³" />
            <Stat k="Gravity" v={fmt(d.gravityG, 3)} unit="g" />
            <Stat k="Escape velocity" v={fmt(d.escapeVelocityKms, 2)} unit="km/s" />
            {d.equilibriumTempK !== undefined && <Stat k="Equilibrium temp." v={fmt(d.equilibriumTempK, 0)} unit="K" />}
            <Stat k={`Surface temp. (${d.surfaceTempSource})`} v={d.surfaceTempK !== undefined ? `${fmt(d.surfaceTempK, 0)} K · ${fmt(d.surfaceTempK - 273.15, 0)} °C` : "—"} />
            {d.terrestrial && <Stat k="Tropics / polar circles" v={`${fmt(d.terrestrial.tropicsDeg, 1)}° / ${fmt(d.terrestrial.polarCircleDeg, 1)}°`} />}
            {d.terrestrial && <Stat k="Horizon (1.75 m)" v={fmt(d.terrestrial.horizonKm, 2)} unit="km" />}
            {d.circulationCells !== undefined && d.circulationCells !== null && <Stat k="Circulation cells" v={String(d.circulationCells)} />}
          </div>

          {(d.meanMolarMass !== undefined || d.aerosolGuess) && (
            <>
              <h3>Atmosphere & aerosols</h3>
              <div className="budget">
                {d.meanMolarMass !== undefined && <Stat k="Mean molar mass" v={fmt(d.meanMolarMass * 1000, 2)} unit="g/mol" />}
                {d.atmosphericDensity !== undefined && <Stat k="Surface density" v={fmt(d.atmosphericDensity, 3)} unit="kg/m³" />}
                {d.aerosolGuess && <Stat k="Aerosol band (guess)" v={d.aerosolGuess.id} title={`${d.aerosolGuess.composition} — ${d.aerosolGuess.description}`} />}
                {d.tempSubtypeGuess && <Stat k="Temp. subtype (guess)" v={d.tempSubtypeGuess.id} title={d.tempSubtypeGuess.description} />}
              </div>
              {d.gasRetention && (
                <div className="chips" style={{ marginTop: 6 }}>
                  {d.gasRetention.map((g) => (
                    <span key={g.gas} className={"chip" + (g.retained ? "" : " warn")} title={`Worldsmith rule of thumb: v_rms / (v_esc/6) = ${g.stability.toFixed(2)} with the exosphere at 1500 K × T/287 — pessimistic for cold worlds`}>
                      {g.gas} {g.retained ? "retained" : "escapes"}
                    </span>
                  ))}
                </div>
              )}
              {d.aerosolGuess && (
                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                  Bands containing {fmt(d.surfaceTempK, 0)} K: {E.aerosolCandidates(d.surfaceTempK ?? 0).map((a) => a.id).join(", ")}
                </div>
              )}
            </>
          )}
        </>
      )}

      {d.warnings.length > 0 && (
        <ul className="warn" style={{ margin: "10px 0 0", paddingLeft: 18 }}>
          {d.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
