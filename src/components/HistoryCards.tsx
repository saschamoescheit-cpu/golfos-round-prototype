import { useMemo, useState } from 'react';
import type { Round } from '../types';
import { personalBests, playedCourses, roundPoints, sgTrends, trendChange, courseStats } from '../lib/history';
import { SG_CATEGORIES, SG_LABELS, type SgCategory } from '../lib/sg';
import { TrendChart, fmt1 } from './TrendChart';
import { dec, getLang, tr } from '../lib/i18n';

// Stats (feature 012): how the player develops over the rounds, personal bests and the courses played.

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(getLang() === 'de' ? 'de-DE' : undefined, { day: 'numeric', month: 'numeric' });
export const SG_COLOURS: Record<SgCategory, string> = { tee: '#f5d042', approach: '#5ec2ff', around: '#e48fc0', putting: '#9bc53d' };

type Metric = 'score' | 'stableford' | 'hcp' | 'putts' | 'sg';

export function TrendCard(props: { rounds: Round[] }) {
  const pts = useMemo(() => roundPoints(props.rounds), [props.rounds]);
  const [metric, setMetric] = useState<Metric>('score');
  if (pts.length < 2) return null;
  const labels = pts.map((p) => shortDate(p.round.createdAt));
  const metrics: { id: Metric; label: string; values: (number | null)[]; lowerBetter: boolean; unit: [string, string] }[] = [
    { id: 'score', label: tr('To par', 'Zu Par'), values: pts.map((p) => p.toPar18), lowerBetter: true, unit: ['strokes', 'Schläge'] },
    { id: 'stableford', label: 'Stableford', values: pts.map((p) => p.stableford18), lowerBetter: false, unit: ['points', 'Punkte'] },
    { id: 'hcp', label: 'Handicap', values: pts.map((p) => p.differential), lowerBetter: true, unit: ['', ''] },
    { id: 'putts', label: 'Putts', values: pts.map((p) => p.putts18), lowerBetter: true, unit: ['putts', 'Putts'] },
    { id: 'sg', label: 'Strokes Gained', values: pts.map((p) => p.sg?.total ?? null), lowerBetter: false, unit: ['strokes', 'Schläge'] },
  ];
  const available = metrics.filter((m) => m.values.some((v) => v != null));
  const m = available.find((x) => x.id === metric) ?? available[0];
  const t = trendChange(m.values);
  const known = m.values.filter((v) => v != null).length;

  let sentence: JSX.Element;
  if (!t) {
    sentence = <>{tr(`From 3 rounds with ${m.label} you see your trend here.`, `Ab 3 Runden mit Werten für ${m.label} siehst du hier deinen Trend.`)}</>;
  } else if (m.id === 'sg') {
    const s = sgTrends(pts);
    sentence = (
      <>
        {s.better ? (
          <span className="good-text">
            {tr('Improved most: ', 'Am meisten verbessert: ')}
            {SG_LABELS[s.better.c]} ({dec(`+${s.better.change.toFixed(1)}`)} {tr('strokes per round', 'Schläge je Runde')})
          </span>
        ) : (
          tr('No area changed by half a stroke or more.', 'Kein Bereich hat sich um einen halben Schlag oder mehr verändert.')
        )}
        {s.worse && (
          <span className="bad-text" style={{ display: 'block' }}>
            {tr('Slipped: ', 'Nachgelassen: ')}
            {SG_LABELS[s.worse.c]} ({dec(s.worse.change.toFixed(1))})
          </span>
        )}
      </>
    );
  } else {
    const better = m.lowerBetter ? t.change <= -0.5 : t.change >= 0.5;
    const worse = m.lowerBetter ? t.change >= 0.5 : t.change <= -0.5;
    const amount = dec(Math.abs(t.change).toFixed(1));
    const up = t.change > 0;
    const what =
      m.id === 'hcp'
        ? tr(`your handicap played went ${up ? 'up' : 'down'} by ${amount}`, `ist dein gespieltes Handicap um ${amount} ${up ? 'gestiegen' : 'gesunken'}`)
        : m.id === 'stableford'
          ? tr(`you score ${amount} points ${up ? 'more' : 'fewer'} per round`, `holst du ${amount} Punkte ${up ? 'mehr' : 'weniger'} je Runde`)
          : m.id === 'putts'
            ? tr(`you need ${amount} putts ${up ? 'more' : 'fewer'} per round`, `brauchst du ${amount} Putts ${up ? 'mehr' : 'weniger'} je Runde`)
            : tr(`you got ${amount} strokes per round ${better ? 'better' : 'worse'}`, `bist du um ${amount} Schläge je Runde ${better ? 'besser' : 'schlechter'} geworden`);
    sentence =
      better || worse ? (
        <span className={better ? 'good-text' : 'bad-text'}>{tr(`Over your ${t.rounds} rounds ${what}.`, `Über deine ${t.rounds} Runden ${what}.`)}</span>
      ) : (
        <>{tr(`Steady over your ${t.rounds} rounds.`, `Gleichbleibend über deine ${t.rounds} Runden.`)}</>
      );
  }

  return (
    <section className="card stats-card">
      <h2>{tr('Your progress', 'Dein Verlauf')}</h2>
      <div className="chip-row" role="group" aria-label={tr('Value', 'Wert')}>
        {available.map((x) => (
          <button key={x.id} type="button" aria-pressed={m.id === x.id} onClick={() => setMetric(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      {m.id === 'sg' ? (
        <>
          <TrendChart
            ariaLabel={tr('Strokes gained per area over your rounds', 'Strokes Gained je Bereich über deine Runden')}
            labels={labels}
            fmt={fmt1}
            zeroLine
            series={SG_CATEGORIES.map((c) => ({ label: SG_LABELS[c], color: SG_COLOURS[c], values: pts.map((p) => p.sg?.[c] ?? null) }))}
          />
          <div className="trend-legend muted small">
            {SG_CATEGORIES.map((c) => (
              <span key={c}>
                <i style={{ background: SG_COLOURS[c] }} />
                {SG_LABELS[c]}
              </span>
            ))}
          </div>
        </>
      ) : (
        <TrendChart ariaLabel={`${m.label}: ${tr('progress over your rounds', 'Verlauf über deine Runden')}`} labels={labels} fmt={fmt1} zeroLine={m.id === 'score'} series={[{ color: '#9bc53d', values: m.values }]} />
      )}
      <p style={{ margin: 0 }}>{sentence}</p>
      <p className="muted small" style={{ margin: 0 }}>
        {m.id === 'sg'
          ? tr('Strokes gained per 18 holes against a tour pro (0 = tour level).', 'Strokes Gained je 18 Löcher gegen einen Tour-Profi (0 = Tour-Niveau).')
          : m.id === 'hcp'
            ? tr(`Handicap played (WHS score differential) in ${known} of your rounds of 18 holes.`, `Gespieltes Handicap (Score Differential nach WHS) aus ${known} deiner 18-Loch-Runden.`)
            : tr('Values per 18 holes; the dashed line shows the trend.', 'Werte je 18 Löcher; die gestrichelte Linie zeigt den Trend.')}
      </p>
    </section>
  );
}

export function BestsCard(props: { rounds: Round[]; onOpen: (r: Round) => void }) {
  const bests = useMemo(() => personalBests(props.rounds), [props.rounds]);
  if (!bests.length) return null;
  return (
    <section className="card stats-card">
      <h2>{tr('Personal bests', 'Deine Bestleistungen')}</h2>
      <div className="bests">
        {bests.map((b) => (
          <button key={b.key} type="button" className="best" onClick={() => props.onOpen(b.round)}>
            <span className="muted small">{b.label}</span>
            <strong>{dec(b.value)}</strong>
            <span className="muted small">
              {shortDate(b.round.createdAt)} · {b.round.courseName}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function CoursesCard(props: { rounds: Round[]; onOpen: (courseName: string) => void }) {
  const courses = useMemo(() => playedCourses(props.rounds), [props.rounds]);
  if (!courses.length) return null;
  return (
    <section className="card stats-card">
      <h2>{tr('Your courses', 'Deine Plätze')}</h2>
      {courses.map((c) => {
        const s = courseStats(props.rounds, c.courseName);
        return (
          <button key={c.courseName} type="button" className="list-item" onClick={() => props.onOpen(c.courseName)}>
            <span className="grow" style={{ textAlign: 'left' }}>
              <span className="title" style={{ display: 'block' }}>{c.courseName}</span>
              <span className="muted small">
                {c.rounds} {c.rounds === 1 ? tr('round', 'Runde') : tr('rounds', 'Runden')}
                {s.avgGross18 != null ? ` · Ø ${dec(s.avgGross18.toFixed(1))}` : ''}
                {s.best18 ? tr(` · best ${s.best18.gross}`, ` · beste ${s.best18.gross}`) : ''}
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        );
      })}
    </section>
  );
}
