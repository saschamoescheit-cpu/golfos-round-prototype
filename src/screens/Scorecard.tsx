import { useState } from 'react';
import type { Round } from '../types';
import { grossForHole, handicapStrokes, playerTotals, roundStats, stablefordPoints } from '../lib/scoring';
import { deleteRound } from '../lib/storage';
import { TopBar, formatToPar } from '../components/ui';
import { SgCard } from '../components/SgCard';
import { groupForHandicap, roundsSg } from '../lib/sg';
import { loadTrack } from '../lib/track';
import { loopsText } from '../lib/loops';
import { getLang, tr } from '../lib/i18n';

export function Scorecard(props: {
  round: Round;
  onBackToHole: () => void;
  onFinish: (r: Round) => void;
  onClose: () => void;
  onReview: (r: Round) => void;
  onDeleted: () => void;
}) {
  const { round } = props;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const me = round.players.find((p) => p.isMe)!;
  const finished = round.finishedAt != null;
  const received = Object.fromEntries(round.players.map((p) => [p.id, handicapStrokes(round.holes, p.playingHandicap)]));
  const stats = roundStats(round.holes, round.entries[me.id]);
  const sg = roundsSg([round]);
  const canReview = round.mode === 'detail' || round.entries[me.id].some((e) => e.detail) || loadTrack(round.id).length > 20;
  const nines = round.holes.length === 18 ? [round.holes.slice(0, 9), round.holes.slice(9)] : [round.holes];

  const sumGross = (pid: string, idx: number[]) =>
    idx.reduce((s, i) => s + (grossForHole(round.entries[pid][i], round.holes[i].par, received[pid][i]) ?? 0), 0);
  const sumPts = (pid: string, idx: number[]) =>
    idx.reduce((s, i) => s + (stablefordPoints(round.entries[pid][i], round.holes[i].par, received[pid][i]) ?? 0), 0);

  return (
    <main className="screen">
      <TopBar title={tr('Scorecard', 'Scorekarte')} onBack={finished ? props.onClose : props.onBackToHole} backLabel={finished ? tr('Close', 'Schließen') : tr('Back to hole', 'Zurück zum Loch')} />
      <div>
        <div style={{ font: '600 19px var(--display)' }}>{round.courseName}</div>
        <span className="muted small">
          {new Date(round.createdAt).toLocaleDateString(getLang() === 'de' ? 'de-DE' : undefined)} · {loopsText(round.loopOrder)}
        </span>
      </div>

      <div className="stat-grid">
        {round.players.map((p) => {
          const t = playerTotals(round.holes, round.entries[p.id], p.playingHandicap);
          return (
            <div key={p.id} className="stat">
              <div className="muted small">{p.name}{p.playingHandicap != null ? ` · ${tr('hcp', 'SV')} ${p.playingHandicap}` : ''}</div>
              <div className="num">
                {t.gross} <span className="muted small">{formatToPar(t.toPar)}</span>
              </div>
              <div className="small">{t.stableford != null ? tr(`${t.stableford} Stableford pts`, `${t.stableford} Stableford-Punkte`) : tr('gross only', 'nur brutto')}</div>
            </div>
          );
        })}
      </div>

      <div className="table-wrap">
        <table className="scorecard">
          <thead>
            <tr>
              <th>{tr('Hole', 'Loch')}</th>
              <th>Par</th>
              <th>Hcp</th>
              {round.players.map((p) => (
                <th key={p.id}>{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nines.map((nine, n) => {
              const idx = nine.map((h) => h.index);
              return [
                ...nine.map((h) => (
                  <tr key={h.index}>
                    <td>{h.label}</td>
                    <td>{h.par}</td>
                    <td className="muted">{h.strokeIndex}</td>
                    {round.players.map((p) => {
                      const e = round.entries[p.id][h.index];
                      const g = grossForHole(e, h.par, received[p.id][h.index]);
                      const pts = stablefordPoints(e, h.par, received[p.id][h.index]);
                      return (
                        <td key={p.id} className={g != null && g < h.par ? 'under' : ''}>
                          {g ?? '–'}
                          {e.pickedUp && '*'}
                          {p.playingHandicap != null && pts != null && <span className="pts">{pts}</span>}
                        </td>
                      );
                    })}
                  </tr>
                )),
                <tr key={`sum-${n}`} className="sum">
                  <td>{nines.length === 2 ? (n === 0 ? tr('Out', 'Out') : tr('In', 'In')) : tr('Total', 'Gesamt')}</td>
                  <td>{nine.reduce((s, h) => s + h.par, 0)}</td>
                  <td />
                  {round.players.map((p) => (
                    <td key={p.id}>
                      {sumGross(p.id, idx)}
                      {p.playingHandicap != null && <span className="pts">{sumPts(p.id, idx)}</span>}
                    </td>
                  ))}
                </tr>,
              ];
            })}
            {nines.length === 2 && (
              <tr className="sum">
                <td>{tr('Total', 'Gesamt')}</td>
                <td>{round.holes.reduce((s, h) => s + h.par, 0)}</td>
                <td />
                {round.players.map((p) => {
                  const all = round.holes.map((h) => h.index);
                  return (
                    <td key={p.id}>
                      {sumGross(p.id, all)}
                      {p.playingHandicap != null && <span className="pts">{sumPts(p.id, all)}</span>}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ margin: 0 }}>{tr('Small numbers: Stableford points. * picked up (net double bogey).', 'Kleine Zahlen: Stableford-Punkte. * aufgehoben (Netto-Doppelbogey).')}</p>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2>{tr('Your stats', 'Deine Statistik')}</h2>
        <div className="stat-grid">
          <Stat label="Putts" value={String(stats.putts)} />
          <Stat label={tr('Fairways hit', 'Fairways getroffen')} value={`${stats.fairwaysHit} / ${stats.fairwaysPossible}`} />
          <Stat label={tr('Greens in regulation', 'Grüns in Regulation')} value={`${stats.gir} / ${stats.girPossible}`} />
          <Stat label={tr('Penalties', 'Strafschläge')} value={String(stats.penalties)} />
          <Stat label={tr('Sand saves', 'Sand Saves')} value={`${stats.sandSaves} / ${stats.bunkerHoles}`} />
        </div>
      </section>

      {canReview && (
        <button type="button" className="btn-secondary" onClick={() => props.onReview(round)}>
          {tr('Check your shots', 'Schläge prüfen')}{round.entries[me.id].some((e) => e.detail?.shots.some((s) => s.review)) ? tr(' · some to check', ' · einige offen') : ''}
        </button>
      )}
      {sg && <SgCard title={tr('Strokes gained this round', 'Strokes Gained dieser Runde')} values={sg.per18} holes={sg.holes} defaultGroup={groupForHandicap(me.playingHandicap)} />}

      <span className="spacer" />
      {!finished && (
        <button type="button" className="btn-primary" onClick={() => props.onFinish({ ...round, finishedAt: new Date().toISOString() })}>
          {tr('Save & finish round', 'Runde speichern & beenden')}
        </button>
      )}
      {!confirmDelete ? (
        <button type="button" className="btn-secondary btn-danger" onClick={() => setConfirmDelete(true)}>
          {tr('Delete round', 'Runde löschen')}
        </button>
      ) : (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>{tr('Delete this round for good?', 'Diese Runde endgültig löschen?')}</span>
          <div className="nav-bottom" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>
              {tr('Keep', 'Behalten')}
            </button>
            <button
              type="button"
              className="btn-secondary btn-danger"
              onClick={() => {
                deleteRound(round.id);
                props.onDeleted();
              }}
            >
              {tr('Delete', 'Löschen')}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="num">{props.value}</div>
      <div className="muted small">{props.label}</div>
    </div>
  );
}
