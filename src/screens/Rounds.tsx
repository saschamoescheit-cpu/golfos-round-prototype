import { useState } from 'react';
import type { Round } from '../types';
import { checksShots, playerTotals } from '../lib/scoring';
import { formatToPar } from '../components/ui';
import { getLang, tr } from '../lib/i18n';
import { loopsText } from '../lib/loops';
import { kindName } from '../lib/roundkind';
import { isTeamRound } from '../lib/games';

// Tab "Rounds": every round, newest first. On top what is still to do – rounds whose shots are not checked yet.

const mine = (r: Round) => r.players.find((p) => p.isMe)!;

/** A recent finished round whose shots are not all checked yet (strokes gained needs checked holes). */
export function needsCheck(r: Round): boolean {
  const recent = Date.now() - new Date(r.createdAt).getTime() < 14 * 24 * 3600 * 1000;
  return !!r.finishedAt && recent && !isTeamRound(r) && checksShots(r) && r.entries[mine(r).id].some((e) => !e.pickedUp && e.strokes != null && (!e.detail?.shots.length || e.detail.shots.some((s) => s.review)));
}

export const uncheckedRounds = (rounds: Round[]): Round[] => rounds.filter(needsCheck);

export function RoundsTab(props: { rounds: Round[]; onOpen: (r: Round) => void; onContinue: (r: Round) => void }) {
  const finished = props.rounds.filter((r) => r.finishedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = props.rounds.filter((r) => !r.finishedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const toCheck = finished.filter(needsCheck);
  const [onlyCheck, setOnlyCheck] = useState(false);
  const shown = onlyCheck ? toCheck : finished;
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  const holes = finished.reduce((n, r) => n + r.holes.length, 0);

  return (
    <>
      <h1 className="tab-title">{tr('Rounds', 'Runden')}</h1>
      <div className="tile-row">
        <button type="button" className="tile" aria-pressed={onlyCheck} disabled={!toCheck.length} onClick={() => setOnlyCheck(!onlyCheck)}>
          <span className={`tile-num${toCheck.length ? ' warn-text' : ''}`}>{toCheck.length}</span>
          <span className="muted small">{tr('to check', 'Schläge prüfen')}</span>
        </button>
        <div className="tile">
          <span className="tile-num">{finished.length}</span>
          <span className="muted small">{tr('rounds played', 'Runden gespielt')}</span>
        </div>
        <div className="tile">
          <span className="tile-num">{holes}</span>
          <span className="muted small">{tr('holes', 'Löcher')}</span>
        </div>
      </div>

      {open && (
        <button type="button" className="list-item live" onClick={() => props.onContinue(open)}>
          <span className="grow">
            <span className="title">{open.courseName}</span>
            <span className="muted small">
              {tr(`In progress · hole ${open.currentHole + 1} of ${open.holes.length}`, `Läuft · Loch ${open.currentHole + 1} von ${open.holes.length}`)}
            </span>
          </span>
          <span className="good-text small" style={{ fontWeight: 600 }}>
            {tr('Continue ›', 'Fortsetzen ›')}
          </span>
        </button>
      )}

      {onlyCheck && (
        <p className="muted small" style={{ margin: 0 }}>
          {tr('Rounds with shots still to check. Tap the tile again for all rounds.', 'Runden mit offenen Schlägen. Kachel nochmal antippen für alle Runden.')}
        </p>
      )}
      {finished.length === 0 ? (
        <p className="muted">{tr('Your finished rounds show up here.', 'Hier erscheinen deine beendeten Runden.')}</p>
      ) : (
        <ul className="list">
          {shown.map((r) => {
            const me = mine(r);
            const t = playerTotals(r.holes, r.entries[me.id], me.playingHandicap);
            return (
              <li key={r.id}>
                <button type="button" className="list-item" onClick={() => props.onOpen(r)}>
                  <span className="round-date">
                    <strong>{new Date(r.createdAt).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}</strong>
                    <span className="muted small">{new Date(r.createdAt).getFullYear()}</span>
                  </span>
                  <span className="grow">
                    <span className="title">{r.courseName}</span>
                    <span className="muted small">{[r.kind && r.kind !== 'social' ? kindName(r.kind) : null, loopsText(r.loopOrder), `${r.holes.length} ${tr('holes', 'Löcher')}`, r.restored ? tr('restored from GPS', 'aus GPS wiederhergestellt') : null].filter(Boolean).join(' · ')}</span>
                    {needsCheck(r) && <span className="small warn-text" style={{ display: 'block', fontWeight: 600 }}>{tr('Check your shots →', 'Schläge prüfen →')}</span>}
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={{ font: '700 20px var(--display)' }}>{t.holesPlayed ? t.gross : '–'}</span>
                    <span className="muted small" style={{ display: 'block' }}>
                      {t.holesPlayed ? formatToPar(t.toPar) : tr('no score yet', 'noch kein Score')}
                      {t.holesPlayed && t.stableford != null ? ` · ${t.stableford} ${tr('pts', 'Pkt.')}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
