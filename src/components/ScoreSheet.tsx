import type { HoleEntry, Player, RoundHole } from '../types';
import { FairwayPicker } from './FairwayPicker';
import { formatToPar } from './ui';
import { tr } from '../lib/i18n';

// Score after the hole, as in Hole19 (Sascha 14.10.2026): one block per player with − / + for strokes, the main player
// also putts and penalty strokes, fairway, greenside bunker. GIR and up & down follow by themselves. The putts can be
// placed on the green right away (putt editor) – then nothing is left to do for them after the round.

function Stepper(props: { label: string; value: number | null; start: number; min?: number; max?: number; hint?: string | null; onChange: (v: number | null) => void }) {
  const min = props.min ?? 0;
  return (
    <div className="stepper-row">
      <span className="stepper-label">{props.label}</span>
      <div className="stepper" role="group" aria-label={props.label}>
        {props.value != null && (
          <button type="button" aria-label={tr(`${props.label} minus one`, `${props.label} minus eins`)} disabled={props.value <= min} onClick={() => props.onChange(props.value! - 1)}>
            −
          </button>
        )}
        <span className={`stepper-value${props.value == null ? ' empty' : ''}`} aria-live="polite">
          {props.value ?? '–'}
          {props.hint && <small>{props.hint}</small>}
        </span>
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

export function ScoreSheet(props: {
  hole: RoundHole;
  players: Player[];
  entries: Record<string, HoleEntry>; // this hole, per player
  toPar: Record<string, number | null>; // round so far, per player
  next: boolean; // opened by "→": the button goes on to the next hole
  last: boolean;
  canPlacePutts: boolean;
  team?: boolean; // scramble / foursomes: one score per team, nothing per player
  onChange: (playerId: string, patch: Partial<HoleEntry>) => void;
  onPlacePutts: () => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const h = props.hole;
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet score-sheet" role="dialog" aria-label={tr('Score on this hole', 'Score an diesem Loch')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>
            {tr('Hole', 'Loch')} {h.label} · Par {h.par} · Hcp {h.strokeIndex || '–'}
          </strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {props.players.map((p) => {
          const e = props.entries[p.id];
          const toPar = props.toPar[p.id];
          const strokes = e.pickedUp ? null : e.strokes;
          // what the hole was: GIR, up & down (sand save from the greenside bunker)
          const gir = e.strokes != null && e.putts != null && !e.pickedUp ? e.strokes - e.putts <= h.par - 2 : null;
          const upDown = gir === false && e.putts != null && e.putts <= 1 && e.strokes! <= h.par;
          const set = (patch: Partial<HoleEntry>) => {
            const n = { ...e, ...patch };
            const g = n.strokes != null && n.putts != null && !n.pickedUp ? n.strokes - n.putts <= h.par - 2 : null;
            const ud = g === false && n.putts != null && n.putts <= 1 && n.strokes! <= h.par;
            props.onChange(p.id, p.isMe ? { ...patch, upAndDown: g == null ? null : ud } : patch);
          };
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
                  value={strokes}
                  start={h.par || 4}
                  min={1}
                  hint={strokes != null && h.par > 0 ? scoreName(strokes - h.par) : null}
                  onChange={(v) => set({ strokes: v, pickedUp: false })}
                />
              )}
              {p.isMe && !e.pickedUp && !props.team && (
                <>
                  <Stepper label="Putts" value={e.putts} start={2} max={9} onChange={(v) => set({ putts: v, ...(e.puttsAt && v !== e.puttsAt.balls.length ? { puttsAt: undefined } : {}) })} />
                  <Stepper label={tr('Penalty strokes', 'Strafschläge')} value={e.penalties ?? 0} start={1} max={9} onChange={(v) => set({ penalties: v ?? 0 })} />
                  {h.par >= 4 && (
                    <div className="stepper-row">
                      <span className="stepper-label">Fairway</span>
                      {/* out of bounds: stroke and distance – at least one penalty stroke */}
                      <FairwayPicker value={e.fairway} onChange={(v) => set({ fairway: v, ...(v === 'ob' ? { penalties: Math.max(1, e.penalties ?? 0) } : {}) })} />
                    </div>
                  )}
                  <div className="chip-set facts">
                    <span className={`chip fact${gir ? ' on' : ''}`}>GIR</span>
                    <button type="button" className={`chip${e.greensideBunker ? ' on' : ''}`} aria-pressed={e.greensideBunker} onClick={() => set({ greensideBunker: !e.greensideBunker })}>
                      {tr('Greenside bunker', 'Grünbunker')}
                    </button>
                    <span className={`chip fact${upDown ? ' on' : ''}`}>{e.greensideBunker ? 'Sand Save' : 'Up & Down'}</span>
                  </div>
                  {props.canPlacePutts && (
                    <button type="button" className="list-item putt-place" disabled={!e.putts} onClick={props.onPlacePutts}>
                      <span className="grow">
                        <span className="title">{e.puttsAt ? tr('Putts placed ✓', 'Putts gesetzt ✓') : tr('Place the putts on the green', 'Putts auf dem Grün setzen')}</span>
                        <span className="muted small">
                          {e.puttsAt
                            ? tr('Tap to change flag or balls.', 'Antippen, um Fahne oder Bälle zu ändern.')
                            : tr('Flag and ball positions – then nothing is left to check for the putts after the round.', 'Fahne und Ballpositionen – dann musst du die Putts nach der Runde nicht mehr prüfen.')}
                        </span>
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
        <button type="button" className="btn-primary" onClick={props.onDone}>
          {props.next ? (props.last ? tr('Finish round →', 'Runde beenden →') : tr('Next hole →', 'Nächstes Loch →')) : tr('Done', 'Fertig')}
        </button>
      </section>
    </div>
  );
}
