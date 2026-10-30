import type { HoleEntry, Player, Round, RoundHole, SharedCell } from '../types';
import { cellOf, sameCell } from '../lib/sharedround';
import { formatToPar } from './ui';
import { drivesShort, type TexasDrives } from '../lib/games';
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
        {/* − always works once a value is set: down to the smallest sensible value, then back to empty (as in Hole19) */}
        {props.value != null && (
          <button type="button" aria-label={tr(`${props.label} minus one`, `${props.label} minus eins`)} onClick={() => props.onChange(props.value! > min ? props.value! - 1 : null)}>
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

/** A tournament: the other count of the same hole – the marker's beside the player's own, or his own beside the
 *  marker's – flagged when both are in and differ (Sascha 29.10.2026: "the player counts himself and a partner"). */
function OtherCount(props: { label: string; cell: SharedCell; mine: SharedCell }) {
  const text = (c: SharedCell) => (c == null ? '–' : c.p ? tr('picked up', 'aufgehoben') : String(c.s ?? '–'));
  const differs = props.cell != null && props.mine != null && !sameCell(props.cell, props.mine);
  return (
    <span className={`other-count${differs ? ' differs' : ''}`} role={differs ? 'alert' : undefined}>
      {props.label}: <strong>{text(props.cell)}</strong>
      {differs && <> · {tr('differs – agree on the score', 'weicht ab – Score abstimmen')}</>}
    </span>
  );
}

export const scoreName = (d: number): string =>
  d <= -3 ? 'Albatross' : d === -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? tr('Double bogey', 'Doppelbogey') : `+${d}`;

/**
 * The fewest strokes the other numbers allow: the putts, each penalty stroke with the shot that went into the water or
 * out of bounds, and at least one shot from off the green (or every sand shot). Two balls out of bounds from the tee
 * and a holed third ball: 2 penalties → at least 5 (Sascha 15.10.2026: "with 4 penalty strokes it cannot be 5").
 */
export const minStrokes = (e: Pick<HoleEntry, 'putts' | 'penalties' | 'sandShots'>): number => (e.putts ?? 0) + 2 * (e.penalties ?? 0) + Math.max(1, e.sandShots ?? 0);

/** GIR, up & down and sand save from the numbers entered (Hole19: these are not tapped, they follow). */
export function holeFacts(e: HoleEntry, par: number): { gir: boolean | null; upDown: boolean; sandSave: boolean } {
  const gir = e.strokes != null && e.putts != null && !e.pickedUp ? e.strokes - e.putts <= par - 2 : null;
  const upDown = gir === false && e.putts != null && e.putts <= 1 && e.strokes! <= par;
  return { gir, upDown, sandSave: upDown && (e.sandShots ?? 0) > 0 };
}

/** Picking up the ball is allowed in Stableford, match play and the games – in stroke play every hole is holed out
 *  (Sascha 21.10.2026). */
export function pickUpAllowed(round: Round, game = false): boolean {
  return game || round.format?.scoring === 'stableford' || !!round.format?.matchplay;
}

/** Texas scramble: whose drive the team plays on this hole – each member with his count, a warning when it gets tight. */
function TexasPick(props: { t: TexasDrives; picked: number | undefined; onPick: (k: number) => void }) {
  const { t } = props;
  const short = drivesShort(t, props.picked);
  return (
    <div className="texas-pick" role="group" aria-label={tr('Whose drive', 'Wessen Drive')}>
      <span className="muted small">{tr(`Drive played – at least ${t.min} each`, `Gespielter Drive – je mindestens ${t.min}`)}</span>
      <div className="chip-set">
        {t.members.map((m, k) => {
          const n = t.counts[k] + (props.picked === k ? 1 : 0);
          return (
            <button key={k} type="button" className={`chip${props.picked === k ? ' on' : ''}`} aria-pressed={props.picked === k} onClick={() => props.onPick(k)}>
              {m} <small>{n}/{t.min}</small>
            </button>
          );
        })}
      </div>
      {short.length > 0 && (
        <span className="small bad-text" role="status">
          {short
            .map((x) => tr(`${x.name} still needs ${x.need} ${x.need === 1 ? 'drive' : 'drives'} – ${t.left} ${t.left === 1 ? 'hole' : 'holes'} left`, `${x.name} braucht noch ${x.need} ${x.need === 1 ? 'Drive' : 'Drives'} – noch ${t.left} ${t.left === 1 ? 'Loch' : 'Löcher'}`))
            .join(' · ')}
        </span>
      )}
    </div>
  );
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
  /** what the ✕ goes back to (the map on the course, the scorecard after the round) */
  closeLabel?: string;
  /** "Picked up" offered – Stableford, match play and games, not stroke play (Sascha 21.10.2026) */
  pickUp?: boolean;
  /** a round on several phones (Sascha 29.10.2026), per player: kept on another phone (its owner's name – shown, not
   *  changed here), the team's card to take over, and in a tournament the other count beside this one */
  shared?: Record<string, { keptBy: string | null; takeOver?: () => void; other?: { label: string; cell: SharedCell } }>;
  /** Texas scramble (Sascha's concept 30.10.2026), per team: whose drive – the counts so far and who gets tight */
  texas?: Record<string, TexasDrives | null>;
}) {
  const h = props.hole;
  return (
    <section className="score-panel" role="dialog" aria-label={tr('Score on this hole', 'Score an diesem Loch')}>
      <div className="sheet-head">
        <strong>
          {tr('Hole', 'Loch')} {h.label} · Par {h.par} · Hcp {h.strokeIndex || '–'}
        </strong>
        <button type="button" className="icon-btn" aria-label={props.closeLabel ?? tr('Back to the map', 'Zurück zur Karte')} onClick={props.onClose}>
          ✕
        </button>
      </div>
      {props.players.map((p) => {
        const e = props.entries[p.id];
        const toPar = props.toPar[p.id];
        const strokes = e.pickedUp ? null : e.strokes;
        const facts = holeFacts(e, h.par);
        // the strokes besides the putts: the shot from off the green (or every sand shot) and the penalties
        const offGreen = minStrokes({ ...e, putts: 0 });
        const set = (patch: Partial<HoleEntry>) => {
          let n = { ...e, ...patch };
          // fewer strokes: the putts follow (Sascha 18.10.2026: "a birdie on a par 3 cannot have 2 putts") – a 2 with
          // 2 putts set before becomes a 2 with 1 putt instead of jumping back to 3
          if (p.isMe && !props.team && 'strokes' in patch && n.strokes != null && !n.pickedUp && n.putts != null && n.strokes < minStrokes(n)) {
            const putts = Math.max(0, n.strokes - minStrokes({ ...n, putts: 0 }));
            patch = { ...patch, putts, ...(n.puttsAt && putts !== n.puttsAt.balls.length ? { puttsAt: undefined } : {}) };
            n = { ...n, putts };
          }
          // the score holds the putts and penalty strokes: it rises with them when they would not fit any more
          if (p.isMe && !props.team && n.strokes != null && !n.pickedUp && n.strokes < minStrokes(n)) {
            patch = { ...patch, strokes: minStrokes(n) };
            n = { ...n, strokes: minStrokes(n) };
          }
          const f = holeFacts(n, h.par);
          // sand shots tell the round statistics the ball was in a (greenside) bunker – sand saves come from there
          props.onChange(p.id, p.isMe ? { ...patch, upAndDown: f.gir == null ? null : f.upDown, greensideBunker: (n.sandShots ?? 0) > 0 } : patch);
        };
        const penaltySub =
          (e.penalties ?? 0) > 0 ? tr(`incl. ${e.penalties} penalty ${e.penalties === 1 ? 'stroke' : 'strokes'}`, `inkl. ${e.penalties} ${e.penalties === 1 ? 'Strafschlag' : 'Strafschläge'}`) : tr('incl. penalty strokes', 'inkl. Strafschläge');
        const sh = props.shared?.[p.id];
        // kept on another phone: shown, not changed here – the team's card can be taken over
        if (sh?.keptBy != null)
          return (
            <div key={p.id} className="score-player kept-elsewhere">
              <div className="score-player-head">
                <strong>{p.name}</strong>
                {toPar != null && (
                  <span className="muted small">
                    {tr('round', 'Runde')} {formatToPar(toPar)}
                  </span>
                )}
                <span className="spacer" />
                <strong className="kept-value" aria-label={tr(`Score ${p.name}`, `Score ${p.name}`)}>
                  {e.pickedUp ? tr('picked up', 'aufgehoben') : (e.strokes ?? '–')}
                </strong>
              </div>
              <span className="muted small">
                {props.team ? tr(`${sh.keptBy || 'Another phone'} keeps the team's card`, `${sh.keptBy || 'Ein anderes Handy'} führt die Scorecard des Teams`) : tr(`${sh.keptBy || p.name} keeps this score on his phone`, `${sh.keptBy || p.name} erfasst diesen Score auf seinem Handy`)}
              </span>
              {sh.takeOver && (
                <button type="button" className="btn-secondary" onClick={sh.takeOver}>
                  {tr('Take the card over', 'Scorecard übernehmen')}
                </button>
              )}
              {sh.other && <OtherCount label={sh.other.label} cell={sh.other.cell} mine={cellOf(e)} />}
            </div>
          );
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
              {(props.pickUp !== false || e.pickedUp) && (
                <button type="button" className={`chip${e.pickedUp ? ' on' : ''}`} aria-pressed={e.pickedUp} onClick={() => set({ pickedUp: !e.pickedUp, strokes: null })}>
                  {tr('Picked up', 'Aufgehoben')}
                </button>
              )}
            </div>
            {!e.pickedUp && (
              <Stepper
                label={props.team ? tr('Team strokes', 'Team-Schläge') : tr('Strokes', 'Schläge')}
                sub={props.team ? undefined : penaltySub}
                value={strokes}
                start={Math.max(h.par || 4, p.isMe && !props.team ? minStrokes(e) : 1)}
                min={p.isMe && !props.team ? offGreen : 1}
                hint={strokes != null && h.par > 0 ? scoreName(strokes - h.par) : null}
                onChange={(v) => set({ strokes: v, pickedUp: false })}
              />
            )}
            {sh?.other && <OtherCount label={sh.other.label} cell={sh.other.cell} mine={cellOf(e)} />}
            {props.team && props.texas?.[p.id] && <TexasPick t={props.texas[p.id]!} picked={e.drive} onPick={(k) => set({ drive: e.drive === k ? undefined : k })} />}
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
                  // the first tap: 2 putts – or what the score leaves (a 2 on a par 3: 1 putt)
                  start={strokes != null ? Math.max(0, Math.min(2, strokes - offGreen)) : 2}
                  max={9}
                  onChange={(v) => set({ putts: v, ...(e.puttsAt && v !== e.puttsAt.balls.length ? { puttsAt: undefined } : {}) })}
                />
                <Stepper label="Sand Shots" value={e.sandShots ? e.sandShots : null} start={1} max={9} onChange={(v) => set({ sandShots: v ?? 0 })} />
                <Stepper label={tr('Penalty strokes', 'Strafschläge')} value={e.penalties ? e.penalties : null} start={1} max={9} onChange={(v) => set({ penalties: v ?? 0 })} />
                {h.par >= 4 && (
                  <div className="stepper-row">
                    <span className="stepper-label">{tr('Tee shot', 'Abschlag')}</span>
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
