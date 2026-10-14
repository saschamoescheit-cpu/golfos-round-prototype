import type { HoleEntry, Player, RoundHole } from '../types';
import { formatToPar } from './ui';
import { FairwayPicker } from './FairwayPicker';
import { tr } from '../lib/i18n';

// Score after the hole, as in Hole19 (Sascha 14.10.2026): a panel over the map, the hole bar below it stays – ‹ and ›
// go to the previous or next hole (the score is entered while walking off the green), no "done" button. One block per
// player with − / + for strokes; the main player also putts (✎ = place them on the green), sand shots, penalty strokes
// and fairway. GIR, sand save and up & down follow by themselves.

function Stepper(props: { label: string; sub?: string; extra?: JSX.Element; value: number | null; start: number; min?: number; max?: number; hint?: string | null; onChange: (v: number | null) => void }) {
  const min = props.min ?? 0;
  return (
    <div className="stepper-row">
      <span className="stepper-label">
        <span className="stepper-title">
          {props.label}
          {props.extra}
        </span>
        {props.sub && <small className="muted">{props.sub}</small>}
      </span>
      <div className="stepper" role="group" aria-label={props.label}>
        {props.value != null && props.value > min && (
          <button type="button" aria-label={tr(`${props.label} minus one`, `${props.label} minus eins`)} onClick={() => props.onChange(props.value! - 1)}>
            −
          </button>
        )}
        {props.value != null && (
          <span className="stepper-value" aria-live="polite">
            {props.value}
            {props.hint && <small>{props.hint}</small>}
          </span>
        )}
        <button
          type="button"
          aria-label={tr(`${props.label} plus one`, `${props.label} plus eins`)}
          disabled={props.value != null && props.max != null && props.value >= props.max}
          onClick={() => props.onChange(props.value == null ? props.start : props.value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

const scoreName = (d: number): string =>
  d <= -3 ? 'Albatross' : d === -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? tr('Double bogey', 'Doppelbogey') : `+${d}`;

/** GIR, up & down and sand save from the numbers entered (Hole19: these are not tapped, they follow). */
export function holeFacts(e: HoleEntry, par: number): { gir: boolean | null; upDown: boolean; sandSave: boolean } {
  const gir = e.strokes != null && e.putts != null && !e.pickedUp ? e.strokes - e.putts <= par - 2 : null;
  const upDown = gir === false && e.putts != null && e.putts <= 1 && e.strokes! <= par;
  return { gir, upDown, sandSave: upDown && (e.sandShots ?? 0) > 0 };
}

export function ScoreSheet(props: {
  hole: RoundHole;
  players: Player[];
  entries: Record<string, HoleEntry>; // this hole, per player
  toPar: Record<string, number | null>; // round so far, per player
  canPlacePutts: boolean;
  team?: boolean; // scramble / foursomes: one score per team, nothing per player
  onChange: (playerId: string, patch: Partial<HoleEntry>) => void;
  onPlacePutts: () => void;
  onClose: () => void;
}) {
  const h = props.hole;
  return (
    <section className="score-panel" role="dialog" aria-label={tr('Score on this hole', 'Score an diesem Loch')}>
      <div className="sheet-head">
        <strong>
          {tr('Hole', 'Loch')} {h.label} · Par {h.par} · Hcp {h.strokeIndex || '–'}
        </strong>
        <button type="button" className="icon-btn" aria-label={tr('Back to the map', 'Zurück zur Karte')} onClick={props.onClose}>
          ✕
        </button>
      </div>
      {props.players.map((p) => {
        const e = props.entries[p.id];
        const toPar = props.toPar[p.id];
        const strokes = e.pickedUp ? null : e.strokes;
        const facts = holeFacts(e, h.par);
        const set = (patch: Partial<HoleEntry>) => {
          const n = { ...e, ...patch };
          const f = holeFacts(n, h.par);
          // sand shots tell the round statistics the ball was in a (greenside) bunker – sand saves come from there
          props.onChange(p.id, p.isMe ? { ...patch, upAndDown: f.gir == null ? null : f.upDown, greensideBunker: (n.sandShots ?? 0) > 0 } : patch);
        };
        const penaltySub =
          (e.penalties ?? 0) > 0 ? tr(`incl. ${e.penalties} penalty ${e.penalties === 1 ? 'stroke' : 'strokes'}`, `inkl. ${e.penalties} ${e.penalties === 1 ? 'Strafschlag' : 'Strafschläge'}`) : tr('incl. penalty strokes', 'inkl. Strafschläge');
        return (
          <div key={p.id} className="score-player">
            <div className="score-player-head">
              <strong>{p.name}</strong>
              {toPar != null && (
                <span className="muted small">
                  {tr('round', 'Runde')} {formatToPar(toPar)}
                </span>
              )}
              <span className="spacer" />
              <button type="button" className={`chip${e.pickedUp ? ' on' : ''}`} aria-pressed={e.pickedUp} onClick={() => set({ pickedUp: !e.pickedUp, strokes: null })}>
                {tr('Picked up', 'Aufgehoben')}
              </button>
            </div>
            {!e.pickedUp && (
              <Stepper
                label={props.team ? tr('Team strokes', 'Team-Schläge') : tr('Strokes', 'Schläge')}
                sub={props.team ? undefined : penaltySub}
                value={strokes}
                start={h.par || 4}
                min={1}
                hint={strokes != null && h.par > 0 ? scoreName(strokes - h.par) : null}
                onChange={(v) => set({ strokes: v, pickedUp: false })}
              />
            )}
            {p.isMe && !e.pickedUp && !props.team && (
              <>
                <Stepper
                  label="Putts"
                  sub={e.puttsAt ? tr('placed on the green ✓', 'auf dem Grün gesetzt ✓') : undefined}
                  extra={
                    props.canPlacePutts && e.putts != null && e.putts > 0 ? (
                      <button type="button" className="pencil" aria-label={tr('Place the putts on the green', 'Putts auf dem Grün setzen')} onClick={props.onPlacePutts}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4 20h4L19 9l-4-4L4 16z" />
                          <path d="M13.5 6.5l4 4" />
                        </svg>
                      </button>
                    ) : undefined
                  }
                  value={e.putts}
                  start={2}
                  max={9}
                  onChange={(v) => set({ putts: v, ...(e.puttsAt && v !== e.puttsAt.balls.length ? { puttsAt: undefined } : {}) })}
                />
                <Stepper label="Sand Shots" value={e.sandShots ? e.sandShots : null} start={1} max={9} onChange={(v) => set({ sandShots: v ?? 0 })} />
                <Stepper label={tr('Penalty strokes', 'Strafschläge')} value={e.penalties ? e.penalties : null} start={1} max={9} onChange={(v) => set({ penalties: v ?? 0 })} />
                {h.par >= 4 && (
                  <div className="stepper-row">
                    <span className="stepper-label">Fairway</span>
                    {/* out of bounds: stroke and distance – at least one penalty stroke */}
                    <FairwayPicker value={e.fairway} onChange={(v) => set({ fairway: v, ...(v === 'ob' ? { penalties: Math.max(1, e.penalties ?? 0) } : {}) })} />
                  </div>
                )}
                {/* not tapped – they follow from the numbers above (as in Hole19) */}
                <div className="chip-set facts" aria-label={tr('Hole facts', 'Kennzahlen des Lochs')}>
                  <span className={`chip fact${facts.gir ? ' on' : ''}`}>GIR</span>
                  <span className={`chip fact${facts.sandSave ? ' on' : ''}`}>Sand Saves</span>
                  <span className={`chip fact${facts.upDown ? ' on' : ''}`}>Up & Down</span>
                </div>
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
