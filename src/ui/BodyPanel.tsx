import { useMemo, type ReactNode } from "react";
import { actions, useApp } from "./state";
import type { TypedRecord } from "../core/types";
import { deriveBody } from "../core/astro/derive";
import { glyphSvg } from "../core/astro/glyph";
import { glyphPaletteFrom } from "../core/astro/tints";
import * as E from "../core/astro/ewocs";
import { Button, Group, Panel, PipLabel, Row, StatusRow, Value } from "./kit";

const fmt = (n: number | undefined, d = 2) => (n === undefined || !Number.isFinite(n) ? undefined : n >= 1e5 ? n.toExponential(2) : n.toLocaleString(undefined, { maximumFractionDigits: d }));

/** Derived panel for a body record: Worldsmith outputs, EWoCS classification, glyph preview. */
export function BodyPanel({ body }: { body: TypedRecord }) {
  const { repo } = useApp();
  const d = useMemo(() => (repo ? deriveBody(body, (id) => repo.typed(id)) : null), [body, repo, repo?.all().length]);
  if (!repo || !d) return null;

  /** One derived figure: an operator label against a mono value with its unit. */
  const S = ({ k, v, unit, tone, title }: { k: string; v: ReactNode | undefined; unit?: string; tone?: "caution"; title?: string }) => (
    <Row label={k} title={title}>
      <Value v={v} unit={unit} tone={tone} />
    </Row>
  );
  const system = typeof body.fields.system === "string" ? repo.record(body.fields.system) : undefined;
  const hostAge = d.hostStar && typeof d.hostStar.star.fields.age_gyr === "number" ? d.hostStar.star.fields.age_gyr : 4.5;

  return (
    <Panel title="DERIVED" meta="Worldsmith · EWoCS">
      <div className="row top">
        <div className="svgbox portrait" dangerouslySetInnerHTML={{ __html: glyphSvg(d.glyph, 76, glyphPaletteFrom(repo.tables)) }} />
        <Group className="grow" title="CLASSIFICATION">
          <Row label="SHORTHAND">
            {d.ewocs.shorthand ? <span className="t-title-sm">{d.ewocs.shorthand}</span> : <span className="help">Set kind, mass and classification to derive one.</span>}
          </Row>
          {d.ewocs.full && (
            <Row label="FULL">
              <span className="val">{d.ewocs.full}</span>
            </Row>
          )}
          {d.massClass && (
            <Row label="MASS CLASS" title={d.massClass.description}>
              <span className="val">
                {d.massClass.sizeClass} · {d.massClass.subclass}
              </span>
            </Row>
          )}
          {d.hostStar && (
            <Row label="ORBITS">
              <span className="link" onClick={() => actions.navigate({ kind: "record", id: d.hostStar!.star.id })}>
                {d.hostStar.star.name}
              </span>
              {d.parent && d.parent.id !== d.hostStar.star.id && (
                <>
                  <span className="unit">via</span>
                  <span className="link" onClick={() => actions.navigate({ kind: "record", id: d.parent!.id })}>
                    {d.parent.name}
                  </span>
                </>
              )}
              {system && (
                <Button size="sm" onClick={() => actions.navigate({ kind: "map", id: system.id })}>
                  Open map
                </Button>
              )}
            </Row>
          )}
        </Group>
      </div>

      {d.star && (
        <Group title="STAR">
          <S k="SPECTRAL CLASS" v={d.star.spectral} />
          <S k="LUMINOSITY" v={fmt(d.star.luminositySol, 3)} unit="L☉" />
          <S k="RADIUS" v={fmt(d.star.radiusSol, 3)} unit="R☉" />
          <S k="TEMPERATURE" v={fmt(d.star.temperatureK, 0)} unit="K" />
          <S k="MS LIFETIME" v={fmt(d.star.maxAgeGyr, 2)} unit="Gyr" />
          <S k="HABITABLE ZONE" v={`${fmt(d.star.hzInnerAU, 3)} – ${fmt(d.star.hzOuterAU, 3)}`} unit="AU" />
          <S k="FROST LINE" v={fmt(d.star.frostLineAU, 2)} unit="AU" />
          <S k="INNER LIMIT" v={fmt(d.star.innerLimitAU, 4)} unit="AU" />
          <S k="EARTH-LIKE LIFE" v={d.star.earthlikeLife} />
        </Group>
      )}

      {!d.isStar && (
        <>
          <Group title="ORBIT">
            {d.heliocentricAU !== undefined && <S k="HELIOCENTRIC DISTANCE" v={fmt(d.heliocentricAU, 3)} unit="AU" />}
            {d.smaKm !== undefined && <S k="SEMI-MAJOR AXIS" v={fmt(d.smaKm, 0)} unit="km" />}
            {d.periodYears !== undefined && <S k="PERIOD" v={`${fmt(d.periodYears, 3)} yr · ${fmt(d.periodDays, 1)} d`} />}
            {d.periodYears === undefined && d.periodDays !== undefined && <S k="PERIOD (SIDEREAL)" v={fmt(d.periodDays, 2)} unit="d" />}
            {d.synodicDays !== undefined && <S k="PERIOD (SYNODIC)" v={fmt(d.synodicDays, 2)} unit="d" />}
            {d.periapsisAU !== undefined && <S k="PERIAPSIS / APOAPSIS" v={`${fmt(d.periapsisAU, 3)} / ${fmt(d.apoapsisAU, 3)}`} unit="AU" />}
            {d.fluxRelEarth !== undefined && <S k="STELLAR FLUX" v={fmt(d.fluxRelEarth, 3)} unit="× Earth" />}
            {d.hillRadiusKm !== undefined && <S k="HILL RADIUS" v={fmt(d.hillRadiusKm, 0)} unit="km" />}
            {d.moonZoneInnerKm !== undefined && (
              <S k="PARENT'S MOON ZONE" v={`${fmt(d.moonZoneInnerKm, 0)} – ${fmt(d.moonZoneOuterKm, 0)}`} unit="km" tone={d.warnings.some((w) => /Roche|moon zone/.test(w)) ? "caution" : undefined} />
            )}
            {d.lockToStarGyr !== undefined && <S k="LOCK TO STAR" v={fmt(d.lockToStarGyr, 2)} unit="Gyr" title={d.lockToStarGyr < hostAge ? "Shorter than the star's age → likely locked" : ""} />}
            {d.lockToParentGyr !== undefined && <S k="LOCK TO PARENT" v={fmt(d.lockToParentGyr, 3)} unit="Gyr" title={d.lockToParentLabel} />}
            {d.parentLockToThisGyr !== undefined && <S k="PARENT LOCKS TO THIS" v={fmt(d.parentLockToThisGyr, 2)} unit="Gyr" title={d.parentLockToThisLabel} />}
            {d.tidesEarth !== undefined && <S k="TIDES ON PARENT" v={fmt(d.tidesEarth, 2)} unit="× Earth" />}
          </Group>

          <Group title="PHYSICAL">
            <S k="RADIUS" v={fmt(d.radiusKm, 0)} unit="km" />
            <S k="DENSITY" v={fmt(d.densityGcc, 2)} unit="g/cm³" />
            <S k="GRAVITY" v={fmt(d.gravityG, 3)} unit="g" />
            <S k="ESCAPE VELOCITY" v={fmt(d.escapeVelocityKms, 2)} unit="km/s" />
            {d.equilibriumTempK !== undefined && <S k="EQUILIBRIUM TEMP." v={fmt(d.equilibriumTempK, 0)} unit="K" />}
            <S k={`SURFACE TEMP. (${d.surfaceTempSource.toLocaleUpperCase("en")})`} v={d.surfaceTempK !== undefined ? `${fmt(d.surfaceTempK, 0)} K · ${fmt(d.surfaceTempK - 273.15, 0)} °C` : undefined} />
            {d.terrestrial && <S k="TROPICS / POLAR CIRCLES" v={`${fmt(d.terrestrial.tropicsDeg, 1)}° / ${fmt(d.terrestrial.polarCircleDeg, 1)}°`} />}
            {d.terrestrial && <S k="HORIZON (1.75 m)" v={fmt(d.terrestrial.horizonKm, 2)} unit="km" />}
            {d.circulationCells !== undefined && d.circulationCells !== null && <S k="CIRCULATION CELLS" v={String(d.circulationCells)} />}
          </Group>

          {(d.meanMolarMass !== undefined || d.aerosolGuess) && (
            <Group title="ATMOSPHERE & AEROSOLS">
              {d.meanMolarMass !== undefined && <S k="MEAN MOLAR MASS" v={fmt(d.meanMolarMass * 1000, 2)} unit="g/mol" />}
              {d.atmosphericDensity !== undefined && <S k="SURFACE DENSITY" v={fmt(d.atmosphericDensity, 3)} unit="kg/m³" />}
              {d.aerosolGuess && <S k="AEROSOL BAND (GUESS)" v={d.aerosolGuess.id} title={`${d.aerosolGuess.composition} — ${d.aerosolGuess.description}`} />}
              {d.tempSubtypeGuess && <S k="TEMP. SUBTYPE (GUESS)" v={d.tempSubtypeGuess.id} title={d.tempSubtypeGuess.description} />}
              {d.gasRetention?.map((g) => (
                <Row key={g.gas} label={`${g.gas} RETENTION`} title={`Worldsmith rule of thumb: v_rms / (v_esc/6) = ${g.stability.toFixed(2)} with the exosphere at 1500 K × T/287 — pessimistic for cold worlds`}>
                  <PipLabel severity={g.retained ? "nominal" : "caution"}>
                    <span className={"stamp " + (g.retained ? "sev-text-nominal" : "sev-text-caution")}>{g.retained ? "RETAINED" : "ESCAPES"}</span>
                  </PipLabel>
                </Row>
              ))}
              {d.aerosolGuess && <div className="help">Bands containing {fmt(d.surfaceTempK, 0)} K: {E.aerosolCandidates(d.surfaceTempK ?? 0).map((a) => a.id).join(", ")}</div>}
            </Group>
          )}
        </>
      )}

      {d.warnings.map((w, i) => (
        <StatusRow key={i} severity="caution" id="DERIVE" message={w} word={false} />
      ))}
    </Panel>
  );
}
