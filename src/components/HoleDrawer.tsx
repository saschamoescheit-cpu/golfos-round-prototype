import { useRef } from 'react';
import type { Round } from '../types';
import { handicapStrokes, playerTotals } from '../lib/scoring';
import { formatToPar } from './ui';
import { tr } from '../lib/i18n';

// The hole overview pulled up from the hole bar, as in Hole19 (Sascha 15.10.2026): every hole with its score and
// strokes received – a tap jumps there –, the standing of the round, the bag and the caddie, and scorecard, pause
// and finish. 2D, hazards and the sun mode are switched on the map's toolbar and in the header (Sascha 15.10.2026). The map keeps only the tools needed on the shot.

const tone = (d: number) => (d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double');

export function HoleDrawer(props: {
  round: Round;
  current: number;
  onGo: (index: number) => void;
  onClose: () => void;
  onBag: () => void;
  onCaddie: () => void;
  onScorecard: () => void;
  onLeaderboard: (() => void) | null;
  onPause: () => void;
  onEnd: () => void;
  /** A game (Games): the leaderboard row shows the game's standing; more rows (invite players). */
  leaderboardLabel?: string;
  extraRows?: { label: string; onClick: () => void }[];
  /** Course preview (no round): no score; birdie book, pause and finish. */
  preview?: boolean;
  onBook?: () => void;
}) {
  const r = props.round;
  const me = r.players.find((p) => p.isMe)!;
  const received = handicapStrokes(r.holes, me.playingHandicap);
  const t = playerTotals(r.holes, r.entries[me.id], me.playingHandicap);
  const touchY = useRef<number | null>(null);
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section
        className="sheet hole-drawer"
        role="dialog"
        aria-label={tr('Hole overview', 'Lochübersicht')}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => (touchY.current = e.touches[0].clientY)}
        onTouchEnd={(e) => {
          // pulled down again: closed (only from the top, the list itself scrolls)
          if (touchY.current != null && e.changedTouches[0].clientY - touchY.current > 70 && (e.currentTarget.scrollTop ?? 0) <= 0) props.onClose();
          touchY.current = null;
        }}
      >
        <button type="button" className="drawer-handle" aria-label={tr('Close the hole overview', 'Lochübersicht schließen')} onClick={props.onClose}>
          <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden="true">
            <path d="M6 3l16 8 16-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="drawer-holes" role="group" aria-label={tr('Holes', 'Löcher')}>
          {r.holes.map((h, k) => {
            const e = r.entries[me.id][k];
            const score = e.pickedUp ? null : e.strokes;
            return (
              <button
                key={k}
                type="button"
                className={`drawer-hole${k === props.current ? ' current' : ''}${score != null && h.par ? ' ' + tone(score - h.par) : ''}${e.pickedUp ? ' picked' : ''}`}
                aria-current={k === props.current ? 'true' : undefined}
                aria-label={tr(`Hole ${h.label}${score != null ? `, ${score} strokes` : ''}`, `Loch ${h.label}${score != null ? `, ${score} Schläge` : ''}`)}
                onClick={() => props.onGo(k)}
              >
                <span className="drawer-hole-no">{h.label}</span>
                {score != null ? <span className="drawer-hole-score">{score}</span> : e.pickedUp ? <span className="drawer-hole-score">PU</span> : null}
                {received[k] > 0 && <i className="drawer-hole-dots">{'•'.repeat(Math.min(received[k], 3))}</i>}
              </button>
            );
          })}
        </div>

        {!props.preview && (
        <div className="drawer-standing">
          <div>
            <strong>{t.holesPlayed ? t.gross : '–'}</strong>
            <span className="muted small">{tr('strokes', 'Schläge')}</span>
          </div>
          <div>
            <strong>{t.holesPlayed ? formatToPar(t.toPar) : '–'}</strong>
            <span className="muted small">{tr('to par', 'zu Par')}</span>
          </div>
          <div>
            <strong>{t.holesPlayed && t.stableford != null ? t.stableford : '–'}</strong>
            <span className="muted small">Stableford</span>
          </div>
        </div>
        )}

        <div className="drawer-list">
          {props.onLeaderboard && (
            <button type="button" className="drawer-row" onClick={props.onLeaderboard}>
              <span>{props.leaderboardLabel ?? 'Leaderboard'}</span>
              <span aria-hidden="true">›</span>
            </button>
          )}
          {props.extraRows?.map((r) => (
            <button key={r.label} type="button" className="drawer-row" onClick={r.onClick}>
              <span>{r.label}</span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
          <button type="button" className="drawer-row" onClick={props.onBag}>
            <span>{tr('My bag', 'Mein Bag')}</span>
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className="drawer-row" onClick={props.onCaddie}>
            <span>{tr('Caddie', 'Caddie')}</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>

        {/* three actions side by side as icons (Sascha 15.10.2026): scorecard, pause, stop like a recording */}
        {props.preview ? (
          // the course preview (Sascha 15.10.2026): birdie book, pause, finish – the same tiles as in a round
          <div className="drawer-actions">
            <button type="button" className="drawer-action" onClick={props.onBook} aria-label={tr('Birdie book', 'Birdiebook')}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
                <path d="M4 21V5M9 7h6" />
              </svg>
              <span>{tr('Birdie book', 'Birdiebook')}</span>
            </button>
            <button type="button" className="drawer-action" onClick={props.onPause} aria-label={tr('Pause preview – continue later', 'Vorschau pausieren – später fortsetzen')}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="4" width="4" height="16" rx="1.2" />
                <rect x="14" y="4" width="4" height="16" rx="1.2" />
              </svg>
              <span>{tr('Pause', 'Pausieren')}</span>
            </button>
            <button type="button" className="drawer-action end" onClick={props.onEnd} aria-label={tr('End preview', 'Vorschau beenden')}>
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" />
              </svg>
              <span>{tr('Finish', 'Beenden')}</span>
            </button>
          </div>
        ) : (
          <div className="drawer-actions">
            <button type="button" className="drawer-action" onClick={props.onScorecard}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <path d="M8 8h8M8 12h8M8 16h5" />
              </svg>
              <span>{tr('Scorecard', 'Scorekarte')}</span>
            </button>
            <button type="button" className="drawer-action" onClick={props.onPause} aria-label={tr('Pause round – continue later', 'Runde pausieren – später fortsetzen')}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="4" width="4" height="16" rx="1.2" />
                <rect x="14" y="4" width="4" height="16" rx="1.2" />
              </svg>
              <span>{tr('Pause', 'Pausieren')}</span>
            </button>
            <button type="button" className="drawer-action end" onClick={props.onEnd} aria-label={props.leaderboardLabel ? tr('Finish game', 'Spiel beenden') : tr('Finish round', 'Runde beenden')}>
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" />
              </svg>
              <span>{tr('Finish', 'Beenden')}</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
