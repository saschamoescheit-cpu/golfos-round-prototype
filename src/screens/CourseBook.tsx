import { useEffect, useMemo, useState } from 'react';
import type { Course, LngLat, RoundHole } from '../types';
import { bearingDeg, centroid, formatDistance, hazardToCarry, holeMapData, isAhead, lineLength, pointAt, type HoleMapData } from '../lib/geo';
import { holeForTee } from '../lib/teeline';
import { loadCaddieSettings, loadCarryBag, loadGeometry, loadRounds, loadUnit } from '../lib/storage';
import { courseStats, type CourseHoleStat } from '../lib/history';
import { DEFAULT_CARRY, levelName, readGreen } from '../lib/caddie';
import { caddieAdvice, teeAimFor } from '../lib/caddieplan';
import { loadHoleNotes } from '../lib/holenotes';
import { sideOf } from '../lib/dispersion';
import { heightAt } from '../lib/terrain';
import { bestLeave, loadGreenGrids, type GreenGrid } from '../lib/greenread';
import { HoleSketch } from '../components/HoleSketch';
import { TopBar } from '../components/ui';
import { clubCode, dec, hazardWord, sideWord, tr } from '../lib/i18n';
import { teeName } from '../data/tees';

// Course book (feature 027): every hole of the round on one page, like a birdie book – sketch with distance dots,
// hazards from the tee, the caddie's tee plan in calm weather and how to approach the green. For planning at home.

export function CourseBook(props: { course: Course; holes: RoundHole[]; tee: string | null; onBack: () => void }) {
  const geometry = useMemo(() => loadGeometry(props.course.id), [props.course.id]);
  const [grids, setGrids] = useState<Record<string, GreenGrid> | null>(null);
  useEffect(() => {
    let alive = true;
    loadGreenGrids(props.course.id).then((g) => alive && setGrids(g));
    return () => {
      alive = false;
    };
  }, [props.course.id]);
  const unit = loadUnit();
  const bag = useMemo(() => loadCarryBag() ?? DEFAULT_CARRY, []);
  const settings = useMemo(() => loadCaddieSettings(), []);
  const notes = useMemo(() => loadHoleNotes(props.course.id), [props.course.id]);
  // the player's record per hole from earlier rounds here (feature 012)
  const record = useMemo(() => new Map(courseStats(loadRounds(), props.course.name).holes.map((h) => [h.hole.label, h])), [props.course.name]);
  return (
    <main className="screen book">
      <TopBar title={tr('Course book', 'Lochbuch')} onBack={props.onBack} />
      <div>
        <div style={{ font: '600 19px var(--display)' }}>{props.course.name}</div>
        <span className="muted small">
          {props.tee ? `${tr('Tee', 'Abschlag')} ${teeName(props.tee)} · ` : ''}
          {tr('plan for calm weather with your carry distances', 'Plan bei Windstille mit deinen Carry-Weiten')}
        </span>
      </div>
      {props.holes.map((h) => {
        const data = holeForTee(holeMapData(geometry, h.loop, h.number), props.course.id, h.label, props.tee, geometry.tee);
        return (
          <HolePage
            key={h.index}
            hole={h}
            data={data}
            courseId={props.course.id}
            trees={geometry.trees}
            boundary={geometry.boundary}
            slopes={geometry.fairwaySlopes?.[h.label]}
            greenSlope={geometry.greenSlopes?.[h.label]}
            grid={grids?.[h.label] ?? null}
            unit={unit}
            bag={bag}
            style={settings.style}
            favourite={settings.favourite}
            note={notes[h.label] ?? {}}
            record={record.get(h.label)}
          />
        );
      })}
    </main>
  );
}

function HolePage(p: {
  hole: RoundHole;
  data: HoleMapData | null;
  courseId: string;
  trees?: LngLat[][];
  boundary?: LngLat[][];
  slopes?: [number, number, number?][];
  greenSlope?: { pct: number; downDeg: number };
  grid: GreenGrid | null;
  unit: 'm' | 'yd';
  bag: { club: import('../types').Club; carry: number }[];
  style: 'safe' | 'normal' | 'aggressive';
  favourite: number;
  note: import('../lib/holenotes').HoleNote;
  record?: CourseHoleStat;
}) {
  const fmt = (m: number) => formatDistance(m, p.unit);
  const { hole, data } = p;
  const head = (
    <header className="book-head">
      <h2>
        {tr('Hole', 'Loch')} {hole.label}
      </h2>
      <span className="muted">
        Par {hole.par || '?'} · Hcp {hole.strokeIndex || '?'}
        {data ? ` · ${fmt(lineLength(data.line))} ${p.unit}` : ''}
      </span>
    </header>
  );
  if (!data)
    return (
      <section className="card book-hole">
        {head}
        <p className="muted small" style={{ margin: 0 }}>
          {tr('No map for this hole yet – set it up on the hole during the round.', 'Für dieses Loch gibt es noch keine Karte – richte es während der Runde am Loch ein.')}
        </p>
      </section>
    );
  const L = lineLength(data.line);
  const marks = [100, 150, 200].filter((d) => L - d > 40).map((d) => ({ pos: pointAt(data.line, L - d), label: fmt(d) }));
  // caddie off the tee, calm weather
  const terrain = { slopes: p.slopes, boundary: p.boundary, trees: p.trees };
  const teeAim = teeAimFor({ data, par: hole.par, pin: data.greenCenter, bag: p.bag, conditions: null, tendency: new Map(), ...terrain, note: p.note, style: p.style, favourite: p.favourite });
  const cad = caddieAdvice({
    data, par: hole.par || 4, holeIndex: hole.index, holeCount: 18, from: data.tee, teeShot: true, pin: data.greenCenter,
    targets: teeAim ? [teeAim.pos] : [], teeAim, ...terrain, bag: p.bag, conditions: null, tendency: new Map(), note: p.note,
    style: p.style, favourite: p.favourite, lieChoice: null, unit: p.unit,
  });
  const lines = cad.lines.filter((l) => l.tone === 'warn' || l.tone === 'plan' || /^Fairway \d/.test(l.text)).map((l) => l.text);
  // hazards from the tee (bunkers and water ahead, nearest first)
  const hz = [
    ...data.bunkers.map((r) => ({ r, kind: 'bunker' })),
    ...data.water.map((r) => ({ r, kind: 'water' })),
  ]
    .map((x) => ({ ...x, c: centroid(x.r), ...hazardToCarry(data.tee, x.r) }))
    .filter((x) => isAhead(data.tee, data.greenCenter, x.c) && x.to >= 60 && x.to <= Math.min(320, L - 30))
    .sort((a, b) => a.to - b.to)
    .slice(0, 4)
    .map((x) => {
      const s = sideOf(data.tee, data.greenCenter, x.c);
      const where = Math.abs(s) < 8 ? tr('in the middle', 'mittig') : sideWord(s > 0 ? 'right' : 'left');
      return `${hazardWord(x.kind)} ${where}: ${fmt(x.to)} / ${fmt(x.carry)}`;
    });
  // height tee → green (terrain model along the hole)
  const h0 = heightAt(p.slopes, 0);
  const h1 = heightAt(p.slopes, L - 20);
  const rise = h0 != null && h1 != null ? h1 - h0 : null;
  // green: main slope and where to leave the approach (from 120 m in front, middle pin)
  const g = p.greenSlope ? readGreen(p.greenSlope, bearingDeg(data.tee, data.greenCenter)) : null;
  const leave = p.grid ? bestLeave(p.grid, data.greenCenter, pointAt(data.line, Math.max(0, L - 120)), data.green) : null;
  return (
    <section className="card book-hole">
      {head}
      <div className="book-body">
        <figure className="book-sketch">
          <HoleSketch data={data} trees={p.trees} boundary={p.boundary} marks={marks} aim={hole.par >= 4 ? cad.ap.landing : null} />
        </figure>
        <div className="book-text">
          <p className="book-club">
            <strong>{clubCode(cad.advice.club)}</strong> {tr('off the tee', 'vom Abschlag')}
            {rise != null && Math.abs(rise) >= 2 && (
              <span className="muted"> · {tr(`green ${Math.abs(Math.round(rise))} m ${rise > 0 ? 'higher' : 'lower'}`, `Grün ${Math.abs(Math.round(rise))} m ${rise > 0 ? 'höher' : 'tiefer'}`)}</span>
            )}
          </p>
          <ul className="book-lines">
            {lines.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          {hz.length > 0 && (
            <>
              <p className="lbl">{tr('From the tee: to reach / to carry', 'Vom Abschlag: bis dorthin / drüber')}</p>
              <ul className="book-lines muted">
                {hz.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
          {(g || leave) && (
            <>
              <p className="lbl">{tr('Green', 'Grün')}</p>
              <ul className="book-lines">
                {g && <li>{g.level === 'flat' ? tr('almost flat', 'fast flach') : tr(`${g.level} slope, ${g.text}`, `${levelName(g.level)} Neigung, ${g.text}`)}</li>}
                {leave && <li>{leave.text}</li>}
              </ul>
            </>
          )}
          {p.record && (
            <>
              <p className="lbl">{tr('Your record', 'Deine Bilanz')}</p>
              <ul className="book-lines">
                <li>
                  {tr(
                    `Ø ${dec(p.record.avg.toFixed(1))} (${p.record.toPar > 0 ? '+' : ''}${dec(p.record.toPar.toFixed(1))}) in ${p.record.played} ${p.record.played === 1 ? 'round' : 'rounds'} · best ${p.record.best}`,
                    `Ø ${dec(p.record.avg.toFixed(1))} (${p.record.toPar > 0 ? '+' : ''}${dec(p.record.toPar.toFixed(1))}) aus ${p.record.played} ${p.record.played === 1 ? 'Runde' : 'Runden'} · beste ${p.record.best}`,
                  )}
                </li>
                {p.record.notes.length > 0 && <li className="muted">{p.record.notes.join(' · ')}</li>}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
