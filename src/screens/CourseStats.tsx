import { useMemo } from 'react';
import type { Round } from '../types';
import { courseStats, type CourseHoleStat } from '../lib/history';
import { TopBar, formatToPar } from '../components/ui';
import { playerTotals } from '../lib/scoring';
import { dec, getLang, tr } from '../lib/i18n';
import { statRounds } from '../lib/signing';

// Feature 012: the player's record on one course – average per hole against par, hardest and best hole,
// what keeps happening there (tee-shot side, water, bunkers, three-putts) and the rounds played.

const signed = (v: number) => dec(`${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1)}`);
const date = (iso: string) => new Date(iso).toLocaleDateString(getLang() === 'de' ? 'de-DE' : undefined);

export function CourseStats(props: { rounds: Round[]; courseName: string; onBack: () => void; onOpen: (r: Round) => void }) {
  const s = useMemo(() => courseStats(statRounds(props.rounds), props.courseName), [props.rounds, props.courseName]);
  const maxAbs = Math.max(1, ...s.holes.map((h) => Math.abs(h.toPar)));

  return (
    <main className="screen">
      <TopBar title={tr('Course stats', 'Platz-Statistik')} onBack={props.onBack} />
      <div style={{ font: '600 19px var(--display)' }}>{s.courseName}</div>

      <section className="totals card">
        <div>
          <div className="num">{s.rounds.length}</div>
          <div className="muted small">{s.rounds.length === 1 ? tr('round', 'Runde') : tr('rounds', 'Runden')}</div>
        </div>
        <div>
          <div className="num">{s.avgGross18 != null ? dec(s.avgGross18.toFixed(1)) : '–'}</div>
          <div className="muted small">{tr('average', 'Schnitt')}</div>
        </div>
        <div>
          <div className="num">{s.best18?.gross ?? '–'}</div>
          <div className="muted small">{tr('best round', 'beste Runde')}</div>
        </div>
      </section>

      {(s.hardest || s.easiest) && (
        <div className="stat-grid">
          {s.hardest && <HoleHighlight title={tr('Hardest hole', 'Schwerstes Loch')} h={s.hardest} />}
          {s.easiest && <HoleHighlight title={tr('Best hole', 'Bestes Loch')} h={s.easiest} />}
        </div>
      )}

      <section className="card stats-card">
        <h2>{tr('Hole by hole', 'Loch für Loch')}</h2>
        <p className="muted small" style={{ margin: 0 }}>{tr('Your average against par.', 'Dein Schnitt gegen Par.')}</p>
        <ol className="course-holes">
          {s.holes.map((h) => (
            <li key={h.hole.label}>
              <span className="hole-no">{h.hole.label}</span>
              <span className="grow">
                <span>
                  Par {h.hole.par} · Ø {dec(h.avg.toFixed(1))}
                  <span className="muted small"> · {tr('best', 'beste')} {h.best}</span>
                </span>
                {h.notes.length > 0 && <span className="muted small">{h.notes.join(' · ')}</span>}
              </span>
              <span className="topar-bar" aria-label={signed(h.toPar)}>
                <i className={h.toPar > 0.05 ? 'bad' : h.toPar < -0.05 ? 'good' : ''} style={{ width: `${Math.max(8, (Math.abs(h.toPar) / maxAbs) * 100)}%` }} />
                <b>{signed(h.toPar)}</b>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card stats-card">
        <h2>{tr('Your rounds here', 'Deine Runden hier')}</h2>
        {s.rounds.map((r) => {
          const me = r.players.find((p) => p.isMe)!;
          const t = playerTotals(r.holes, r.entries[me.id], me.playingHandicap);
          return (
            <button key={r.id} type="button" className="list-item" onClick={() => props.onOpen(r)}>
              <span className="grow">
                <span className="title">{date(r.createdAt)}</span>
                <span className="muted small">{t.stableford != null ? tr(`${t.stableford} Stableford pts`, `${t.stableford} Stableford-Punkte`) : ''}</span>
              </span>
              <strong>{t.gross}</strong>
              <span className="muted small">{formatToPar(t.toPar)}</span>
              <span aria-hidden="true">›</span>
            </button>
          );
        })}
      </section>
    </main>
  );
}

function HoleHighlight(props: { title: string; h: CourseHoleStat }) {
  return (
    <div className="stat">
      <div className="muted small">{props.title}</div>
      <div className="num">
        {tr('Hole', 'Loch')} {props.h.hole.label}
      </div>
      <div className="small">
        Par {props.h.hole.par} · Ø {signed(props.h.toPar)}
      </div>
      {props.h.notes[0] && <div className="muted small">{props.h.notes[0]}</div>}
    </div>
  );
}
