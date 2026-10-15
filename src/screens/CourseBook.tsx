import { useEffect, useMemo, useState } from 'react';
import { loadStrategy, type PlannedHole } from '../lib/strategy';
import type { Course, LngLat, RoundHole } from '../types';
import { distanceM, formatDistance, holeMapData, lineLength, pointAt, woodsOf, type HoleMapData } from '../lib/geo';
import { holeForTee } from '../lib/teeline';
import { loadCaddieSettings, loadCarryBag, loadGeometry, loadRounds, loadUnit } from '../lib/storage';
import { courseStats, type CourseHoleStat } from '../lib/history';
import { adviseClub, DEFAULT_CARRY } from '../lib/caddie';
import { caddieAdvice, teeAimFor } from '../lib/caddieplan';
import { loadHoleNotes } from '../lib/holenotes';
import { loadGreenGrids, setGreenSpeed, type GreenGrid } from '../lib/greenread';
import { playing18 } from '../lib/scoring';
import { HoleSketch } from '../components/HoleSketch';
import { TopBar } from '../components/ui';
import { clubCode, tr } from '../lib/i18n';
import { teeName } from '../data/tees';
import { withPartials } from '../lib/partials';
import { holeBook } from '../lib/holebook';

// Course book (feature 027): every hole of the round on one page, like a birdie book – sketch with distance dots,
// hazards from the tee, the caddie's tee plan in calm weather and how to approach the green. For planning at home.

export function CourseBook(props: { course: Course; holes: RoundHole[]; tee: string | null; playing?: number | null; onBack: () => void }) {
  const geometry = useMemo(() => loadGeometry(props.course.id), [props.course.id]);
  const woods = useMemo(() => woodsOf(geometry), [geometry]);
  const [grids, setGrids] = useState<Record<string, GreenGrid> | null>(null);
  useEffect(() => {
    let alive = true;
    loadGreenGrids(props.course.id).then((g) => alive && setGrids(g));
    return () => {
      alive = false;
    };
  }, [props.course.id]);
  const unit = loadUnit();
  const bag = useMemo(() => withPartials(loadCarryBag() ?? DEFAULT_CARRY), []);
  const settings = useMemo(() => loadCaddieSettings(), []);
  useMemo(() => setGreenSpeed(settings.greenSpeed), [settings]);
  const notes = useMemo(() => loadHoleNotes(props.course.id), [props.course.id]);
  const strategy = useMemo(() => loadStrategy(props.course.id), [props.course.id]); // the player's round plan
  // the player's record per hole from earlier rounds here (feature 012)
  const record = useMemo(() => new Map(courseStats(loadRounds(), props.course.name).holes.map((h) => [h.hole.label, h])), [props.course.name]);
  // The caddie plans every hole (tee strategy, feature 017) – a few holes at a time, so the first pages show at once
  // and the phone never freezes for seconds.
  const [shown, setShown] = useState(3);
  useEffect(() => {
    if (shown >= props.holes.length) return;
    const t = window.setTimeout(() => setShown((n) => n + 3), 30);
    return () => window.clearTimeout(t);
  }, [shown, props.holes.length]);
  return (
    <main className="screen book">
      <TopBar title={tr('Birdie book', 'Birdiebook')} onBack={props.onBack} />
      <div>
        <div style={{ font: '600 19px var(--display)' }}>{props.course.name}</div>
        <span className="muted small">
          {props.tee ? `${tr('Tee', 'Abschlag')} ${teeName(props.tee)} · ` : ''}
          {tr('plan for calm weather with your carry distances', 'Plan bei Windstille mit deinen Carry-Weiten')}
        </span>
      </div>
      {props.holes.slice(0, shown).map((h) => {
        const data = holeForTee(holeMapData(geometry, h.loop, h.number), props.course.id, h.label, props.tee, geometry.tee);
        return (
          <HolePage
            key={h.index}
            hole={h}
            data={data}
            courseId={props.course.id}
            trees={geometry.trees}
            woods={woods}
            boundary={geometry.boundary}
            slopes={geometry.fairwaySlopes?.[h.label]}
            greenSlope={geometry.greenSlopes?.[h.label]}
            grid={grids?.[h.label] ?? null}
            unit={unit}
            bag={bag}
            style={settings.style}
            favourite={settings.favourite}
            playing={playing18(props.holes.length, props.playing ?? null)} // 18-hole value for the spread
            note={notes[h.label] ?? {}}
            record={record.get(h.label)}
            planned={strategy[h.label]}
          />
        );
      })}
    </main>
  );
}

function HolePage(p: {
  playing: number | null;
  hole: RoundHole;
  data: HoleMapData | null;
  courseId: string;
  trees?: LngLat[][];
  woods?: LngLat[][];
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
  /** The player's round plan for this hole (Sascha 16.10.2026: "plan a round") */
  planned?: PlannedHole;
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
  const terrain = { slopes: p.slopes, boundary: p.boundary, trees: p.trees, woods: p.woods };
  const teeAim = teeAimFor({ data, par: hole.par, pin: data.greenCenter, bag: p.bag, conditions: null, tendency: new Map(), ...terrain, note: p.note, style: p.style, favourite: p.favourite, playing: p.playing });
  // the player's plan wins over the caddie's own point: its targets and every shot's club (or the suggestion)
  const plan = p.planned?.targets.length ? p.planned : null;
  const planPoints = plan ? [data.tee, ...plan.targets, data.greenCenter] : [];
  const planClubs = planPoints.slice(1).map((to, k) => plan!.clubs[k] ?? adviseClub(distanceM(planPoints[k], to), p.bag, k === 0 && hole.par >= 4).club);
  const cad = caddieAdvice({
    data, par: hole.par || 4, holeIndex: hole.index, holeCount: 18, from: data.tee, teeShot: true, pin: data.greenCenter,
    targets: plan ? plan.targets : teeAim ? [teeAim.pos] : [], teeAim, ...terrain, bag: p.bag, conditions: null, tendency: new Map(), note: p.note,
    style: p.style, favourite: p.favourite, lieChoice: null, unit: p.unit, playing: p.playing,
    planned: plan ? { clubs: planClubs, shot: 0 } : null,
  });
  const lines = cad.lines.filter((l) => l.tone === 'warn' || l.tone === 'plan' || /^Fairway \d/.test(l.text)).map((l) => l.text);
  const book = holeBook({ data, slopes: p.slopes, greenSlope: p.greenSlope, grid: p.grid, unit: p.unit, record: p.record });
  return (
    <section className="card book-hole">
      {head}
      <div className="book-body">
        <figure className="book-sketch">
          <HoleSketch data={data} trees={p.trees} boundary={p.boundary} marks={marks} aim={plan ? plan.targets[0] : hole.par >= 4 ? cad.ap.landing : null} />
        </figure>
        <div className="book-text">
          <p className="book-club">
            <strong>{clubCode(plan ? planClubs[0] : cad.advice.club)}</strong> {tr('off the tee', 'vom Abschlag')}
            {plan && <span className="muted"> · {tr('your plan', 'dein Plan')}</span>}
            {book.rise && <span className="muted"> · {book.rise}</span>}
          </p>
          <ul className="book-lines">
            {lines.map((t, k) => (
              <li key={`${k}-${t}`}>{t}</li>
            ))}
          </ul>
          {book.hazards.length > 0 && (
            <>
              <p className="lbl">{tr('From the tee: to reach / to carry', 'Vom Abschlag: bis dorthin / drüber')}</p>
              <ul className="book-lines muted">
                {book.hazards.map((t, k) => (
                  <li key={`${k}-${t}`}>{t}</li>
                ))}
              </ul>
            </>
          )}
          {book.green.length > 0 && (
            <>
              <p className="lbl">{tr('Green', 'Grün')}</p>
              <ul className="book-lines">
                {book.green.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
          {book.record.length > 0 && (
            <>
              <p className="lbl">{tr('Your record', 'Deine Bilanz')}</p>
              <ul className="book-lines">
                {book.record.map((t, k) => (
                  <li key={t} className={k ? 'muted' : undefined}>
                    {t}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
