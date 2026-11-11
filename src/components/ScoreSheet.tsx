import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { HoleEntry, Player, Round, RoundHole, SharedCell } from '../types';
import { ChoiceRow, SettingsList, ToggleRow } from './Settings';
import { cellOf, sameScore, type RetiredFill } from '../lib/sharedround';
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
  const differs = props.cell != null && props.mine != null && !sameScore(props.cell, props.mine);
  return (
    <span className={`other-count${differs ? ' differs' : ''}`} role={differs ? 'alert' : undefined}>
      {props.label}: <strong>{text(props.cell)}</strong>
      {differs && <> · {tr('differs – agree on the score', 'weicht ab – Score abstimmen')}</>}
    </span>
  );
}

export const scoreName = (d: number): string =>
  d <= -3 ? 'Albatross' : d === -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double Bogey' : d === 3 ? 'Triple Bogey' : `+${d}`; // Sascha 03.11.2026: Double Bogey, Triple Bogey, then +4 …

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
  shared?: Record<string, { keptBy: string | null; takeOver?: () => void; other?: { label: string; cell: SharedCell }; /** signed by player and marker */ locked?: boolean }>;
  /** the players entered in full besides the main player – the one this phone marks (01.11.2026) */
  details?: (playerId: string) => boolean;
  /** what is entered (Sascha 02.11.2026, a game in Games: "only the strokes per hole, or with details"): 'strokes' –
   *  everyone, the main player too, the score with penalty strokes; 'details' (default) – as above */
  entry?: 'strokes' | 'details';
  /** every player entered in full – a round from a pool whose bets need the details of all (a GIR bet, 02.11.2026) */
  everyone?: boolean;
  /** the own card kept by a scorer: its own analysis beside it – putts, sand, tee shot – on this phone only (02.11.2026) */
  analysis?: (playerId: string) => boolean;
  /** the own details on (Sascha 07.11.2026: "set per person") – and the phone's switch for it; without: shown as before */
  analysisOn?: boolean;
  onAnalysis?: (on: boolean) => void;
  /** Texas scramble (Sascha's concept 30.10.2026), per team: whose drive – the counts so far and who gets tight */
  texas?: Record<string, TexasDrives | null>;
  /** what holds the next hole up (putts missing while a bet counts them – 02.11.2026) */
  notice?: string;
  /** a game on the map (Sascha 08.11.2026: "the game's details belong into the score entry"): what its form needs on the
   *  hole – wolf partner, bingo bango bongo, hammer, press … – below the scores */
  extras?: ReactNode;
  /** the hole's index in the round – with retired/onRetire */
  holeIndex?: number;
  /** players who gave up: the hole index from which on each plays no more (Sascha 12.11.2026) */
  retired?: Record<string, number>;
  /** a player's name tapped: he gives up from a hole on – null: he plays on */
  onRetire?: (playerId: string, from: number | null, fill?: RetiredFill) => void;
  /** the round's hole labels – to say after which hole one gave up (Sascha 11.11.2026) */
  holeLabels?: string[];
}) {
  const h = props.hole;
  const [ask, setAsk] = useState<string | null>(null);
  const [askFill, setAskFill] = useState<RetiredFill>('double');
  const at = props.holeIndex ?? 0;
  const gone = (pid: string) => props.retired?.[pid] != null && at >= props.retired[pid];
  const asked = ask ? props.players.find((p) => p.id === ask) : undefined;
  const askedEntry = ask ? props.entries[ask] : undefined;
  // with a score on this hole already: from the next one on; else from this one
  const askFrom = askedEntry && (askedEntry.strokes != null || askedEntry.pickedUp) ? at + 1 : at;
  // after which hole he gave up – chosen (Sascha 11.11.2026: "bei Aufgegeben muss man angeben können, nach welchem Loch"),
  // this hole or the one before to start with
  const [askAfter, setAskAfter] = useState<number | null>(null);
  const after = askAfter ?? askFrom;
  const labels = props.holeLabels ?? [];
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
      {props.notice && (
        <p className="notice score-notice" role="alert">
          {props.notice}
        </p>
      )}
      {/* one's own score always on top, the partners below (Sascha 03.11.2026: Cedric joined his round and saw Sascha first) */}
      {[...props.players.filter((p) => p.isMe), ...props.players.filter((p) => !p.isMe)].map((p) => {
        const e = props.entries[p.id];
        // everything – putts, sand, penalties, tee shot – for the main player and the player this phone marks (Sascha
        // 01.11.2026: "for the player he marks just the same"); placing the putts only for the main player
        const full = !props.team && props.entry !== 'strokes' && (p.isMe || !!props.everyone || !!props.details?.(p.id));
        const toPar = props.toPar[p.id];
        const strokes = e.pickedUp ? null : e.strokes;
        const facts = holeFacts(e, h.par);
        // the strokes besides the putts: the shot from off the green (or every sand shot) and the penalties
        const offGreen = minStrokes({ ...e, putts: 0 });
        const set = (patch: Partial<HoleEntry>) => {
          let n = { ...e, ...patch };
          // fewer strokes: the putts follow (Sascha 18.10.2026: "a birdie on a par 3 cannot have 2 putts") – a 2 with
          // 2 putts set before becomes a 2 with 1 putt instead of jumping back to 3
          if (full && 'strokes' in patch && n.strokes != null && !n.pickedUp && n.putts != null && n.strokes < minStrokes(n)) {
            const putts = Math.max(0, n.strokes - minStrokes({ ...n, putts: 0 }));
            patch = { ...patch, putts, ...(n.puttsAt && putts !== n.puttsAt.balls.length ? { puttsAt: undefined } : {}) };
            n = { ...n, putts };
          }
          // the score holds the putts and penalty strokes: it rises with them when they would not fit any more
          if (full && n.strokes != null && !n.pickedUp && n.strokes < minStrokes(n)) {
            patch = { ...patch, strokes: minStrokes(n) };
            n = { ...n, strokes: minStrokes(n) };
          }
          const f = holeFacts(n, h.par);
          // sand shots tell the round statistics the ball was in a (greenside) bunker – sand saves come from there
          props.onChange(p.id, full ? { ...patch, upAndDown: f.gir == null ? null : f.upDown, greensideBunker: (n.sandShots ?? 0) > 0 } : patch);
        };
        const penaltySub =
          (e.penalties ?? 0) > 0 ? tr(`incl. ${e.penalties} penalty ${e.penalties === 1 ? 'stroke' : 'strokes'}`, `inkl. ${e.penalties} ${e.penalties === 1 ? 'Strafschlag' : 'Strafschläge'}`) : tr('incl. penalty strokes', 'inkl. Strafschläge');
        const sh = props.shared?.[p.id];
        // gave up (Sascha 12.11.2026): no score from here on – "Spielt weiter" takes it back
        if (gone(p.id))
          return (
            <div key={p.id} className="score-player retired">
              <div className="score-player-head">
                <strong>{p.name}</strong>
                <span className="muted small">{tr(`gave up after ${props.retired![p.id]} holes`, `aufgegeben nach ${props.retired![p.id]} Loch`)}</span>
                <span className="spacer" />
                {props.onRetire && sh?.keptBy == null && (
                  <button type="button" className="chip" onClick={() => props.onRetire!(p.id, null)}>
                    {tr('Plays on', 'Spielt weiter')}
                  </button>
                )}
              </div>
            </div>
          );
        // the own analysis: the facts follow from it, nothing goes to the scorer's count
        const analyse = (patch: Partial<HoleEntry>) => {
          const n = { ...e, ...patch };
          const f = holeFacts(n, h.par);
          props.onChange(p.id, { ...patch, upAndDown: f.gir == null ? null : f.upDown, greensideBunker: (n.sandShots ?? 0) > 0 });
        };
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
                {sh.locked ? tr('Signed by player and marker – locked', 'Von Spieler und Zähler unterschrieben – gesperrt') : props.team ? tr(`${sh.keptBy || 'Another phone'} keeps the team's card`, `${sh.keptBy || 'Ein anderes Handy'} führt die Scorecard des Teams`) : tr(`${sh.keptBy || p.name} keeps this score on his phone`, `${sh.keptBy || p.name} erfasst diesen Score auf seinem Handy`)}
              </span>
              {sh.takeOver && (
                <button type="button" className="btn-secondary" onClick={sh.takeOver}>
                  {tr('Take the card over', 'Scorekarte übernehmen')}
                </button>
              )}
              {sh.other && <OtherCount label={sh.other.label} cell={sh.other.cell} mine={cellOf(e)} />}
              {/* a scorer keeps the card – the own analysis beside it, on this phone only (Sascha 02.11.2026) */}
              {props.analysis?.(p.id) && props.onAnalysis && (
                <ToggleRow
                  label={tr('Own details', 'Eigene Detailerfassung')}
                  text={tr('Putts, tee shot and sand for your own analysis – asked on every hole', 'Putts, Abschlag und Sand für deine eigene Auswertung – auf jedem Loch gefragt')}
                  on={!!props.analysisOn}
                  onChange={props.onAnalysis}
                />
              )}
              {props.analysis?.(p.id) && (props.analysisOn || !props.onAnalysis) && !e.pickedUp && (
                <div className="own-analysis" role="group" aria-label={tr('My analysis', 'Meine Analyse')}>
                  <span className="muted small">{tr('My analysis – only on your phone, the scorer\'s count stays the score', 'Meine Analyse – nur auf deinem Handy, die Zählung des Schreibers bleibt der Score')}</span>
                  <Stepper
                    label="Putts"
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
                    onChange={(v) => analyse({ putts: v, ...(e.puttsAt && v !== e.puttsAt.balls.length ? { puttsAt: undefined } : {}) })}
                  />
                  <Stepper label="Sand Shots" value={e.sandShots ? e.sandShots : null} start={1} max={9} onChange={(v) => analyse({ sandShots: v ?? 0 })} />
                  {h.par >= 4 && (
                    <div className="stepper-row">
                      <span className="stepper-label">{tr('Tee shot', 'Abschlag')}</span>
                      <FairwayPicker value={e.fairway} onChange={(v) => analyse({ fairway: v })} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        return (
          <div key={p.id} className="score-player">
            <div className="score-player-head">
              {/* the name tapped: his sheet – giving up (Sascha 12.11.2026: "a player had to stop after 8 holes") */}
              {props.onRetire && !props.team ? (
                <button type="button" className="score-player-name" aria-label={tr(`${p.name} – give up`, `${p.name} – aufgeben`)} onClick={() => setAsk(p.id)}>
                  <strong>{p.name}</strong>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <strong>{p.name}</strong>
              )}
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
                start={Math.max(h.par || 4, full ? minStrokes(e) : 1)}
                min={full ? offGreen : 1}
                hint={strokes != null && h.par > 0 ? scoreName(strokes - h.par) : null}
                onChange={(v) => set({ strokes: v, pickedUp: false })}
              />
            )}
            {sh?.other && <OtherCount label={sh.other.label} cell={sh.other.cell} mine={cellOf(e)} />}
            {props.team && props.texas?.[p.id] && <TexasPick t={props.texas[p.id]!} picked={e.drive} onPick={(k) => set({ drive: e.drive === k ? undefined : k })} />}
            {full && !e.pickedUp && (
              <>
                <Stepper
                  label="Putts"
                  sub={e.puttsAt ? tr('placed on the green ✓', 'auf dem Grün gesetzt ✓') : undefined}
                  extra={
                    props.canPlacePutts && p.isMe && e.putts != null && e.putts > 0 ? (
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
            {/* not entered in full: the strokes incl. penalty strokes, nothing besides (Sascha 02.11.2026: "the penalty
                strokes apart are not needed") */}
          </div>
        );
      })}
      {props.extras && (
        <div className="score-extras" role="group" aria-label={tr('The game on this hole', 'Das Spiel an diesem Loch')}>
          {props.extras}
        </div>
      )}
      {asked && props.onRetire && createPortal(
        <div
          className="sheet-backdrop"
          onClick={() => {
            setAsk(null);
            setAskAfter(null);
          }}
        >
          <section className="sheet retire-sheet" role="dialog" aria-label={asked.name} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{asked.name}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setAsk(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <span>
              {after > at
                ? tr(`Gives up after this hole: from the next one on ${asked.name} is not scored any more.`, `Gibt nach diesem Loch auf: ab dem nächsten Loch wird ${asked.name} nicht mehr erfasst.`)
                : tr(`Gives up: from hole ${labels[after] ?? h.label} on ${asked.name} is not scored any more.`, `Gibt auf: ab Loch ${labels[after] ?? h.label} wird ${asked.name} nicht mehr erfasst.`)}
            </span>
            {labels.length > 0 && (
              <SettingsList>
                <ChoiceRow<number>
                  label={tr('Gave up', 'Aufgegeben')}
                  value={after}
                  onChange={setAskAfter}
                  options={Array.from({ length: Math.min(at + 1, labels.length) + 1 }, (_, k) => ({ value: k, name: k === 0 ? tr(`before hole ${labels[0]}`, `vor Loch ${labels[0]}`) : tr(`after hole ${labels[k - 1]}`, `nach Loch ${labels[k - 1]}`) }))}
                />
              </SettingsList>
            )}
            <span className="muted small">
              {tr(
                'His holes up to there stay and can be signed; in this round\'s board he stands below without a place. In a series\' total the holes missing count as:',
                'Seine Löcher bis dahin bleiben und lassen sich unterschreiben; im Leaderboard der Runde steht er ohne Platz unten. In der Gesamtwertung einer Serie zählen die fehlenden Löcher als:',
              )}
            </span>
            <div className="chip-set retire-fill" role="group" aria-label={tr('The holes missing count as', 'Fehlende Löcher zählen als')}>
              {(['double', 'net', 'par', 'nr'] as const).map((v) => (
                <button key={v} type="button" className={`chip${askFill === v ? ' on' : ''}`} aria-pressed={askFill === v} onClick={() => setAskFill(v)}>
                  {v === 'double' ? tr('Double bogey', 'Doppelbogey') : v === 'net' ? tr('By handicap', 'Nach Vorgabe') : v === 'par' ? 'Par' : 'No Return'}
                </button>
              ))}
            </div>
            {askFill === 'nr' && <span className="muted small">{tr('No Return: this round does not count in the total – he stands on one round fewer.', 'No Return: Diese Runde zählt in der Gesamtwertung nicht – er steht dort auf einer Runde weniger.')}</span>}
            <span className="muted small">{tr('"Plays on" takes it back.', '„Spielt weiter“ nimmt es zurück.')}</span>
            <div className="sc-actions" role="group" aria-label={asked.name}>
              <button
                type="button"
                className="sc-action danger"
                aria-label={tr(`${asked.name} gives up`, `${asked.name} gibt auf`)}
                onClick={() => {
                  props.onRetire!(asked.id, after, askFill);
                  setAsk(null);
                  setAskAfter(null);
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
                </svg>
                <span>{tr('Give up', 'Aufgeben')}</span>
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}
