import { useEffect, useState } from 'react';
import { loadTrash, purgeRound, restoreRound } from '../lib/storage';
import { Bin } from '../components/Bin';
import type { Round } from '../types';
import { checksShots, playerTotals } from '../lib/scoring';
import { formatToPar } from '../components/ui';
import { getLang, tr } from '../lib/i18n';
import { loopsText } from '../lib/loops';
import { kindName } from '../lib/roundkind';
import { isTeamRound } from '../lib/games';
import { SignedIcon } from '../components/SignedIcon';
import { PausedIcon } from '../components/PausedIcon';
import { CheckShotsIcon, ToSignIcon } from '../components/RoundIcons';

// Tab "Rounds": every round, newest first. On top what is still to do – rounds whose shots are not checked yet.

const mine = (r: Round) => r.players.find((p) => p.isMe)!;

/** A recent finished round whose shots are not all checked yet (strokes gained needs checked holes). */
export function needsCheck(r: Round): boolean {
  const recent = Date.now() - new Date(r.createdAt).getTime() < 14 * 24 * 3600 * 1000;
  return !!r.finishedAt && recent && !isTeamRound(r) && checksShots(r) && r.entries[mine(r).id].some((e) => !e.pickedUp && e.strokes != null && (!e.detail?.shots.length || e.detail.shots.some((s) => s.review)));
}

export const uncheckedRounds = (rounds: Round[]): Round[] => rounds.filter(needsCheck);

/** Finished, not signed yet: what "Sign your rounds", the stats' notice and the "to sign" tile count – one number
 *  everywhere (a round with shots to check is not signed either). */
export const roundsToSign = (rounds: Round[]): Round[] => rounds.filter((r) => !!r.finishedAt && !r.signedAt && !r.preview);

export type RoundsFilter = 'check' | 'sign' | 'signed' | 'bin' | null;

export function RoundsTab(props: { rounds: Round[]; onOpen: (r: Round) => void; onContinue: (r: Round) => void; filter?: RoundsFilter }) {
  const finished = props.rounds.filter((r) => r.finishedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const paused = props.rounds.filter((r) => !r.finishedAt && !r.preview).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const toCheck = finished.filter(needsCheck);
  const signed = finished.filter((r) => r.signedAt);
  const toSign = roundsToSign(finished);
  // one tile at a time; from the start screen's "Check your shots" / "Sign your rounds" only those rounds
  // (Sascha 17.10.2026: "it says 2 rounds to sign, then it should only show those")
  const [filter, setFilter] = useState<RoundsFilter>(props.filter ?? null);
  const pick = (f: RoundsFilter) => setFilter(filter === f ? null : f);
  const onlyCheck = filter === 'check';
  const shown = onlyCheck ? toCheck : filter === 'sign' ? toSign : filter === 'signed' ? signed : finished;
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  const holes = finished.reduce((n, r) => n + r.holes.length, 0);
  // the bin (Sascha 15.10.2026): deleted rounds come back with one tap; only the player empties it
  const [trash, setTrash] = useState(loadTrash);
  useEffect(() => setTrash(loadTrash()), [props.rounds]);
  const binOpen = filter === 'bin';
  useEffect(() => {
    if (!trash.length && filter === 'bin') setFilter(null);
  }, [trash.length]);
  useEffect(() => {
    if ((filter === 'check' && !toCheck.length) || (filter === 'sign' && !toSign.length)) setFilter(null); // all done: all rounds again
  }, [toCheck.length, toSign.length]);

  return (
    <>
      <h1 className="tab-title">{tr('Rounds', 'Runden')}</h1>
      <div className="tile-row">
        <button type="button" className="tile" aria-pressed={onlyCheck} disabled={!toCheck.length} onClick={() => pick('check')}>
          <span className="tile-head">
            <span className={`tile-num${toCheck.length ? ' good-text' : ''}`}>{toCheck.length}</span>
            <span className="tile-mark"><CheckShotsIcon /></span>
          </span>
          <span className="muted small">{tr('to check', 'zu prüfen')}</span>
        </button>
        <button type="button" className="tile" aria-pressed={filter === 'sign'} disabled={!toSign.length} onClick={() => pick('sign')}>
          <span className="tile-head">
            <span className={`tile-num${toSign.length ? ' good-text' : ''}`}>{toSign.length}</span>
            <span className="tile-mark"><ToSignIcon /></span>
          </span>
          <span className="muted small">{tr('to sign', 'zu signieren')}</span>
        </button>
        <div className="tile">
          <span className="tile-num">{finished.length}</span>
          <span className="muted small">{tr('played', 'gespielt')}</span>
        </div>
        <button type="button" className="tile" aria-pressed={filter === 'signed'} disabled={!signed.length} onClick={() => pick('signed')}>
          <span className="tile-head">
            <span className="tile-num">{signed.length}</span>
            <span className="tile-mark"><SignedIcon /></span>
          </span>
          <span className="muted small">{tr('signed', 'signiert')}</span>
        </button>
        <div className="tile">
          <span className="tile-num">{holes}</span>
          <span className="muted small">{tr('holes', 'Löcher')}</span>
        </div>
        {/* deleted rounds as the fourth tile (Sascha 15.10.2026) – a tap shows them under the list */}
        {trash.length > 0 && (
          // one tile at a time (Sascha 17.10.2026: from "deleted" to "to check" did not switch)
          <button type="button" className="tile" aria-pressed={binOpen} onClick={() => pick('bin')}>
            <span className="tile-num">{trash.length}</span>
            <span className="muted small">{tr('deleted', 'gelöscht')}</span>
          </button>
        )}
      </div>

      <Bin
        open={binOpen}
        title={tr('Deleted rounds', 'Gelöschte Runden')}
        items={trash.map((t) => ({ id: t.round.id, date: t.round.createdAt, title: t.round.courseName, meta: `${t.round.holes.length} ${tr('holes', 'Löcher')}`, deletedAt: t.deletedAt }))}
        onRestore={restoreRound}
        onPurge={(id) => {
          purgeRound(id);
          setTrash(loadTrash());
        }}
      />

      {paused.length > 0 && (
        <ul className="list">
          {paused.map((r) => {
            const me = mine(r);
            const t = playerTotals(r.holes, r.entries[me.id], me.playingHandicap);
            return (
              <li key={r.id}>
                <button type="button" className="list-item" aria-label={tr(`${r.courseName}, paused – continue`, `${r.courseName}, pausiert – fortsetzen`)} onClick={() => props.onContinue(r)}>
                  <span className="round-date">
                    <strong>{new Date(r.createdAt).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}</strong>
                    <span className="muted small">{new Date(r.createdAt).getFullYear()}</span>
                  </span>
                  <span className="grow">
                    <span className="title">
                      {r.courseName}
                      <span className="paused-mark" aria-hidden="true" title={tr('paused', 'pausiert')}>
                        <PausedIcon size={16} />
                      </span>
                    </span>
                    <span className="muted small">{tr(`Paused · hole ${r.currentHole + 1} of ${r.holes.length}`, `Pausiert · Loch ${r.currentHole + 1} von ${r.holes.length}`)}</span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={{ font: '700 20px var(--display)' }}>{t.holesPlayed ? t.gross : '–'}</span>
                    <span className="muted small" style={{ display: 'block' }}>{t.holesPlayed ? formatToPar(t.toPar) : tr('no score yet', 'noch kein Score')}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
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
                    <span className="title">
                      {r.courseName}
                      {/* one mark per round, the same as on the tile above: to check, to sign or signed */}
                      {needsCheck(r) ? (
                        <span className="signed-mark" role="img" aria-label={tr('shots to check', 'Schläge prüfen')} title={tr('shots to check', 'Schläge prüfen')}>
                          <CheckShotsIcon size={16} />
                        </span>
                      ) : r.signedAt ? (
                        <span className="signed-mark" role="img" aria-label={tr('signed', 'signiert')} title={tr('signed', 'signiert')}>
                          <SignedIcon size={16} />
                        </span>
                      ) : (
                        <span className="signed-mark" role="img" aria-label={tr('to sign', 'zu signieren')} title={tr('to sign', 'zu signieren')}>
                          <ToSignIcon size={16} />
                        </span>
                      )}
                    </span>
                    <span className="muted small">{[r.kind && r.kind !== 'social' ? kindName(r.kind) : null, loopsText(r.loopOrder), `${r.holes.length} ${tr('holes', 'Löcher')}`, r.restored ? tr('restored from GPS', 'aus GPS wiederhergestellt') : null].filter(Boolean).join(' · ')}</span>
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
