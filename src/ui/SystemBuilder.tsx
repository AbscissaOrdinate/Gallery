/**
 * System skeleton generator (Worldsmith "Classical planetary system"):
 * star mass → luminosity, HZ, frost line; Titius–Bode spacing → orbits;
 * each orbit gets a body preset by zone. Everything is a normal record
 * afterwards — edit, delete, add moons, move things to Lagrange points.
 */
import { useMemo, useState } from "react";
import { actions, useApp } from "./state";
import type { TypedRecord } from "../core/types";
import * as W from "../core/astro/worldsmith";

interface Row {
  n: number;
  au: number;
  preset: string;
  name: string;
  skip: boolean;
  note: string;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

export function SystemBuilder({ system, onDone }: { system: TypedRecord; onDone: () => void }) {
  const { repo } = useApp();
  const existingPrimary = typeof system.fields.primary === "string" ? repo?.typed(system.fields.primary) : undefined;
  const [starPreset, setStarPreset] = useState("star-g-dwarf");
  const [starMass, setStarMass] = useState<number>(typeof existingPrimary?.fields.mass_sol === "number" ? (existingPrimary.fields.mass_sol as number) : 1);
  const [first, setFirst] = useState(0.4);
  const [spacing, setSpacing] = useState(0.3);
  const [count, setCount] = useState(8);
  const [belts, setBelts] = useState(true);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  if (!repo) return null;

  const star = useMemo(() => W.deriveStar(starMass), [starMass]);
  const bodyPresets = repo.registry.presetsFor("body");
  const presetTitle = (id: string) => bodyPresets.find((p) => p.id === id)?.title ?? id;

  const plan = () => {
    const orbits = W.orbitSpacing(first, spacing, count);
    let hzUsed = 0;
    let giants = 0;
    let inner = 0;
    const out: Row[] = orbits.map((au, i) => {
      let preset = "marslike";
      let note = "";
      let skip = false;
      if (au < star.innerLimitAU) {
        skip = true;
        note = "inside inner limit";
      } else if (au < star.hzInnerAU * 0.55) {
        preset = inner++ === 0 ? "mercurylike" : "venuslike";
        note = "hot zone";
      } else if (au < star.hzInnerAU) {
        preset = "venuslike";
        note = "hot zone";
      } else if (au <= star.hzOuterAU) {
        preset = hzUsed === 0 ? "earthlike" : hzUsed === 1 ? "ocean-superearth" : "desert-world";
        hzUsed++;
        note = "habitable zone";
      } else if (au < star.frostLineAU) {
        preset = "marslike";
        note = "cold, inside frost line";
      } else {
        preset = ["jupiterlike", "saturnlike", "uranuslike", "neptunelike"][Math.min(giants, 3)];
        if (giants >= 4) preset = "plutolike";
        giants++;
        note = "beyond frost line";
      }
      return { n: i + 1, au, preset, name: `${system.name.replace(/ system$/i, "")} ${ROMAN[i] ?? i + 1}`, skip, note };
    });
    setRows(out);
  };

  const create = async () => {
    if (!rows) return;
    setBusy(true);
    try {
      // star
      let primary = existingPrimary;
      if (!primary) {
        primary = repo.create("body", system.name.replace(/ system$/i, ""), bodyPresets.find((p) => p.id === starPreset));
        primary.fields.mass_sol = starMass;
        primary.fields.system = system.id;
        await repo.save(primary);
        system.fields.primary = primary.id;
        await repo.save(system);
      } else if (primary.fields.mass_sol !== starMass) {
        primary.fields.mass_sol = starMass;
        await repo.save(primary);
      }
      const active = rows.filter((r) => !r.skip);
      let lastTerrestrialAU: number | undefined;
      let firstGiantAU: number | undefined;
      let lastGiantAU: number | undefined;
      let angle = 20;
      for (const r of active) {
        const b = repo.create("body", r.name, bodyPresets.find((p) => p.id === r.preset));
        b.fields.sma_au = r.au;
        b.fields.parent = primary.id;
        b.fields.system = system.id;
        b.fields.map_angle_deg = angle % 360;
        angle += 137.5; // golden-angle spread so labels don't stack
        delete b.fields.sma_km;
        await repo.save(b);
        const isGiant = /jupiter|saturn|uranus|neptune|hot-jupiter|mini-neptune/.test(r.preset);
        if (isGiant) {
          firstGiantAU ??= r.au;
          lastGiantAU = r.au;
        } else if (r.au < star.frostLineAU) lastTerrestrialAU = r.au;
      }
      if (belts && lastTerrestrialAU && firstGiantAU) {
        const belt = repo.create("body", "Main belt", bodyPresets.find((p) => p.id === "main-belt"));
        belt.fields.belt_inner_au = Number((lastTerrestrialAU * 1.35).toFixed(2));
        belt.fields.belt_outer_au = Number((firstGiantAU * 0.7).toFixed(2));
        belt.fields.parent = primary.id;
        belt.fields.system = system.id;
        await repo.save(belt);
      }
      if (belts && lastGiantAU) {
        const dd = W.debrisDisk(lastGiantAU, starMass);
        const kb = repo.create("body", "Outer belt", bodyPresets.find((p) => p.id === "kuiper-belt"));
        kb.fields.belt_inner_au = Number(dd.innerAU.toFixed(1));
        kb.fields.belt_outer_au = Number(dd.outerAU.toFixed(1));
        kb.fields.parent = primary.id;
        kb.fields.system = system.id;
        await repo.save(kb);
      }
      actions.toast(`Created ${active.length} bodies`);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Generate a skeleton (Worldsmith classical system)</h3>
      <div className="grid2">
        <div className="field">
          <label>Star preset</label>
          <select value={starPreset} disabled={!!existingPrimary} onChange={(e) => { setStarPreset(e.target.value); const p = bodyPresets.find((x) => x.id === e.target.value); if (typeof p?.fields.mass_sol === "number") setStarMass(p.fields.mass_sol as number); }}>
            {bodyPresets.filter((p) => /^(star|brown|white)/.test(p.id)).map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Star mass</label>
          <span className="row"><input type="number" step="any" min={0.075} value={starMass} onChange={(e) => setStarMass(Number(e.target.value))} style={{ maxWidth: 120 }} /><span className="unit">M☉ {existingPrimary ? `(updates ${existingPrimary.name})` : ""}</span></span>
        </div>
        <div className="field">
          <label>First orbit</label>
          <span className="row"><input type="number" step="any" min={0} value={first} onChange={(e) => setFirst(Number(e.target.value))} style={{ maxWidth: 120 }} /><span className="unit">AU</span></span>
        </div>
        <div className="field">
          <label>Spacing factor</label>
          <span className="row"><input type="number" step="any" min={0} value={spacing} onChange={(e) => setSpacing(Number(e.target.value))} style={{ maxWidth: 120 }} /><span className="unit">aₙ = a₁ + s·2ⁿ⁻¹</span></span>
        </div>
        <div className="field">
          <label>Orbits</label>
          <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ maxWidth: 120 }} />
        </div>
        <div className="field">
          <label>Belts</label>
          <span className="row"><input type="checkbox" checked={belts} onChange={(e) => setBelts(e.target.checked)} style={{ width: "auto" }} /><span className="muted">main belt before the first giant · outer belt at the giants' resonances</span></span>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, margin: "6px 0" }}>
        {star.spectral} · L {star.luminositySol.toFixed(3)} L☉ · HZ {star.hzInnerAU.toFixed(2)}–{star.hzOuterAU.toFixed(2)} AU · frost line {star.frostLineAU.toFixed(2)} AU · inner limit {star.innerLimitAU.toFixed(4)} AU
      </div>
      <div className="row">
        <button className="primary" onClick={plan}>Plan orbits</button>
        <button className="ghost" onClick={onDone}>Cancel</button>
      </div>
      {rows && (
        <>
          <table className="tbl" style={{ marginTop: 10 }}>
            <thead>
              <tr><th>#</th><th className="num">AU</th><th>Zone</th><th>Preset</th><th>Name</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.n} style={{ opacity: r.skip ? 0.45 : 1 }}>
                  <td>{r.n}</td>
                  <td className="num">{r.au}</td>
                  <td className="muted">{r.note}</td>
                  <td>
                    <select value={r.preset} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, preset: e.target.value } : x)))}>
                      {bodyPresets.filter((p) => !/^(star|brown|white|barycenter|main-belt|kuiper)/.test(p.id)).map((p) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  </td>
                  <td><input type="text" value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
                  <td><input type="checkbox" checked={!r.skip} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, skip: !e.target.checked } : x)))} title="include" style={{ width: "auto" }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" onClick={create} disabled={busy}>Create {rows.filter((r) => !r.skip).length} bodies{belts ? " + belts" : ""}</button>
            <span className="muted" style={{ fontSize: 11 }}>{presetTitle(rows[0]?.preset ?? "")}…</span>
          </div>
        </>
      )}
    </div>
  );
}
