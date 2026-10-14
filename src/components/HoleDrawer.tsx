import { useRef } from 'react';
import type { Round } from '../types';
import { handicapStrokes, playerTotals } from '../lib/scoring';
import { formatToPar } from './ui';
import { tr } from '../lib/i18n';

// The hole overview pulled up from the hole bar, as in Hole19 (Sascha 15.10.2026): every hole with its score and
// strokes received – a tap jumps there –, the standing of the round, the bag and the caddie, the view (2D, hazards,
// sun) and scorecard, pause and finish. The map keeps only the tools needed on the shot.

const tone = (d: number) => (d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double');

export function HoleDrawer(props: {
  round: Round;
  current: number;
  view2d: boolean;
  hazards: boolean;
  sun: boolean;
  onGo: (index: number) => void;
  onClose: () => void;
  onToggle2d: () => void;
  onToggleHazards: () => void;
  onToggleSun: () => void;
  onBag: () => void;
  onCaddie: () => void;
  onScorecard: () => void;
  onLeaderboard: (() => void) | null;
  onPause: () => void;
  onEnd: () => void;
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

        <div className="drawer-list">
          {props.onLeaderboard && (
            <button type="button" className="drawer-row" onClick={props.onLeaderboard}>
              <span>Leaderboard</span>
              <span aria-hidden="true">›</span>
            </button>
          )}
          <button type="button" className="drawer-row" onClick={props.onBag}>
            <span>{tr('My bag', 'Mein Bag')}</span>
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className="drawer-row" onClick={props.onCaddie}>
            <span>{tr('Caddie', 'Caddie')}</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>

        <div className="drawer-list">
          <button type="button" className="drawer-row" role="switch" aria-checked={props.view2d} onClick={props.onToggle2d}>
            <span>{tr('2D view', '2D-Ansicht')}</span>
            <span className={`drawer-switch${props.view2d ? ' on' : ''}`} aria-hidden="true" />
          </button>
          <button type="button" className="drawer-row" role="switch" aria-checked={props.hazards} onClick={props.onToggleHazards}>
            <span>{tr('Hazard distances', 'Distanzen zu Hindernissen')}</span>
            <span className={`drawer-switch${props.hazards ? ' on' : ''}`} aria-hidden="true" />
          </button>
          <button type="button" className="drawer-row" role="switch" aria-checked={props.sun} onClick={props.onToggleSun}>
            <span>{tr('Sun mode', 'Sonnenmodus')}</span>
            <span className={`drawer-switch${props.sun ? ' on' : ''}`} aria-hidden="true" />
          </button>
        </div>

        <div className="drawer-actions">
          <button type="button" className="btn-secondary" onClick={props.onScorecard}>
            {tr('Scorecard', 'Scorekarte')}
          </button>
          <button type="button" className="btn-primary" onClick={props.onEnd}>
            {tr('Finish round', 'Runde beenden')}
          </button>
        </div>
        <button type="button" className="btn-ghost" onClick={props.onPause}>
          {tr('Pause round – continue later', 'Runde pausieren – später fortsetzen')}
        </button>
      </section>
    </div>
  );
}
