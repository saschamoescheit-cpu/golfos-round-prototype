import { useState } from 'react';
import type { Club, Flight, Intent, Lie, PenaltyKind, ShotKind, SlopeLie, Strike } from '../types';
import { BAG, KINDS, LIES, suggestKind } from '../lib/shots';
import { alwaysAgain, FLIGHTS, flightOf, INTENTS, PENALTIES, SLOPES, stanceOf, STRIKES, toggleStance } from '../lib/shotfacts';
import { isLeftHanded } from '../lib/profile';
import { Chips, Segmented } from './ui';
import { clubCode, tr } from '../lib/i18n';

// Bottom sheet for one shot of the detailed tracking: lie (suggested from the map), shot type (suggested
// from lie and distance), club (suggested from the distance), penalty. One tap on a club saves a new
// shot – the fastest path on the course.

export function ShotSheet(props: {
  title: string; // e.g. "Shot 2 · 148 m to pin"
  lie: Lie;
  club: Club | null; // suggestion or the saved club when editing
  penalty: boolean;
  penaltyKind?: PenaltyKind;
  kind?: ShotKind; // saved shot type; missing = suggested from lie and distance
  toPinM: number | null;
  editing: boolean;
  bag?: { club: Club; m: number; carry?: number }[]; // the player's distances – m the total; carry as set in "My bag"
  replay?: boolean;
  provisional?: boolean;
  strike?: Strike;
  flight?: Flight;
  intent?: Intent;
  slope?: SlopeLie[] | SlopeLie;
  /** the stance read off the terrain model when the player has not set one (Sascha 22.10.2026) */
  slopeSuggested?: SlopeLie[] | null;
  onSave: (v: {
    lie: Lie;
    club: Club | null;
    penalty: boolean;
    penaltyKind?: PenaltyKind;
    replay?: boolean;
    provisional?: boolean;
    strike?: Strike;
    flight?: Flight;
    intent?: Intent;
    slope?: SlopeLie[];
    kind: ShotKind;
    review: false;
  }) => void;
  onDelete?: () => void;
  onHoledOut?: () => void; // "holed from here" (chip-in) – only for a new shot
  onCancel: () => void;
}) {
  const [lie, setLie] = useState<Lie>(props.lie);
  // none / water / out of bounds – an older penalty without a kind shows as water
  const [pk, setPk] = useState<PenaltyKind | 'none'>(props.penalty ? (props.penaltyKind ?? 'water') : 'none');
  const penalty = pk !== 'none';
  // water: a drop, or the next shot again from here (Sascha 22.10.2026: two balls off the tee into the water, each time
  // again from the tee – stroke and distance, as out of bounds always is)
  const [replay, setReplay] = useState(!!props.replay);
  // out of bounds or lost off the tee: the second ball was often a provisional one – the same stroke and distance
  const [provisional, setProvisional] = useState(!!props.provisional);
  // what the player tells after the round (Sascha 22.10.2026): strike, intent, stance – optional, one tap each
  // the contact; "slice"/"hook" of a shot checked before 23.10.2026 is its flight now
  const [strike, setStrike] = useState<Strike | null>(props.strike === 'slice' || props.strike === 'hook' ? null : (props.strike ?? null));
  const [flight, setFlight] = useState<Flight | null>(flightOf(props) ?? null);
  const [intent, setIntent] = useState<Intent | null>(props.intent ?? null);
  const [slope, setSlope] = useState<SlopeLie[]>(() => {
    const own = stanceOf(props);
    return own.length ? own : (props.slopeSuggested ?? []);
  });
  const again = penalty && (alwaysAgain(pk as PenaltyKind) || replay);
  const [club, setClub] = useState<Club | null>(props.club);
  const [kind, setKind] = useState<ShotKind | null>(props.kind ?? null); // null = follow the suggestion
  const shownKind = kind ?? suggestKind(lie, props.toPinM);
  const save = (c: Club | null) =>
    props.onSave({
      lie,
      club: c,
      penalty,
      penaltyKind: penalty ? (pk as PenaltyKind) : undefined,
      replay: !penalty ? undefined : alwaysAgain(pk as PenaltyKind) ? true : replay,
      provisional: again && alwaysAgain(pk as PenaltyKind) ? provisional : undefined,
      strike: strike ?? undefined,
      flight: flight ?? undefined,
      intent: intent ?? undefined,
      slope: slope.length ? slope : undefined,
      kind: shownKind,
      review: false,
    });
  return (
    <div className="sheet-backdrop" onClick={props.onCancel}>
      <section className="sheet" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{props.title}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>{tr('Lie', 'Lage')}</label>
          <Segmented<Lie> label={tr('Lie', 'Lage')} value={lie} onChange={(v) => v && setLie(v)} options={LIES.map((o) => (o.value === 'tee' ? { ...o, label: 'Tee' } : o))} /* "Abschlag" is cut off on small phones */ />
        </div>
        <div className="field">
          <label>{tr('Shot', 'Schlag')}</label>
          <Segmented<ShotKind> label={tr('Shot type', 'Schlagart')} value={shownKind} onChange={(v) => v && setKind(v)} options={KINDS} />
        </div>
        <div className="field">
          <label>{tr('Club', 'Schläger')} {props.editing ? '' : tr('– tap to save', '– antippen zum Speichern')}</label>
          <div className="club-grid" role="group" aria-label={tr('Club', 'Schläger')}>
            {((props.bag ?? BAG) as { club: Club; m: number; carry?: number }[]).map((b) => (
              <button
                key={b.club}
                type="button"
                aria-pressed={club === b.club}
                className={props.club === b.club && !props.editing ? 'suggested' : undefined}
                onClick={() => {
                  setClub(b.club);
                  if (!props.editing) save(b.club);
                }}
              >
                {clubCode(b.club)}
                <small>{b.carry ?? b.m} m</small>
              </button>
            ))}
            {/* the putter from off the green – the Texas wedge (Sascha 18.10.2026): a shot, not a putt; no distance */}
            <button
              type="button"
              aria-pressed={club === 'Pt'}
              aria-label={tr('Putter from off the green (Texas wedge)', 'Putter von außerhalb des Grüns (Texas Wedge)')}
              className={props.club === 'Pt' && !props.editing ? 'suggested' : undefined}
              onClick={() => {
                setClub('Pt');
                if (!props.editing) save('Pt');
              }}
            >
              P
              <small>Texas Wedge</small>
            </button>
          </div>
        </div>
        <div className="field">
          <label>{tr('Penalty after this shot (+1)', 'Strafschlag nach diesem Schlag (+1)')}</label>
          {/* water, out of bounds, lost, unplayable – they wrap on a small phone (Rules 17, 18, 19) */}
          <Chips<PenaltyKind | 'none'>
            label={tr('Penalty', 'Strafschlag')}
            value={pk}
            onChange={(v) => v && setPk(v)}
            options={[{ value: 'none', label: tr('None', 'Keiner') }, ...PENALTIES.map((x) => ({ value: x.value, label: x.label() }))]}
          />
        </div>
        {(pk === 'ob' || pk === 'lost') && (
          <div className="field">
            <label>{tr('Then – stroke and distance', 'Danach – Schlag und Distanz')}</label>
            <Segmented<'again' | 'provisional'>
              label={tr('Then', 'Danach')}
              value={provisional ? 'provisional' : 'again'}
              onChange={(v) => v && setProvisional(v === 'provisional')}
              options={[
                { value: 'again', label: tr('Again from here', 'Erneut von hier') },
                { value: 'provisional', label: tr('Provisional ball', 'Provisorischer Ball') },
              ]}
            />
          </div>
        )}
        {(pk === 'water' || pk === 'unplayable') && (
          <div className="field">
            <label>{tr('Then', 'Danach')}</label>
            <Segmented<'drop' | 'replay'>
              label={tr('Then', 'Danach')}
              value={replay ? 'replay' : 'drop'}
              onChange={(v) => v && setReplay(v === 'replay')}
              options={[
                { value: 'drop', label: tr('Dropped', 'Gedroppt') },
                { value: 'replay', label: tr('Again from here', 'Erneut von hier') },
              ]}
            />
          </div>
        )}
        {props.editing && (
          // more about the shot – optional; the bag learns its distances from good strikes (Sascha 22.10.2026)
          <div className="shot-more">
            <div className="field">
              <label>{tr('Strike (optional)', 'Treffer (optional)')}</label>
              <Chips<Strike> label={tr('Strike', 'Treffer')} value={strike} onChange={setStrike} options={STRIKES.map((x) => ({ value: x.value, label: x.label() }))} />
            </div>
            {/* the ball's flight: all nine (Sascha 23.10.2026: "all the flights are needed to judge a swing") */}
            <div className="field">
              <label>{tr('Flight (optional)', 'Flugbahn (optional)')}</label>
              <FlightPicker value={flight} onChange={setFlight} />
            </div>
            <div className="field">
              <label>{tr('Meant to (optional)', 'Absicht (optional)')}</label>
              <Chips<Intent> label={tr('Meant to', 'Absicht')} value={intent} onChange={setIntent} options={INTENTS.map((x) => ({ value: x.value, label: x.label() }))} />
            </div>
            <div className="field">
              <label>
                {tr('Stance (optional)', 'Stand (optional)')}
                {!stanceOf(props).length && props.slopeSuggested?.length ? <span className="muted small"> · {tr('suggested from the heights', 'aus den Höhen vorgeschlagen')}</span> : null}
              </label>
              {/* more than one (Sascha 28.10.2026): uphill or downhill together with the ball above or below the feet */}
              <div className="chip-row wrap chips-field" role="group" aria-label={tr('Stance', 'Stand')}>
                {SLOPES.map((x) => (
                  <button key={x.value} type="button" aria-pressed={slope.includes(x.value)} onClick={() => setSlope(toggleStance(slope, x.value))}>
                    {x.label()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="sheet-actions">
          {props.onDelete && (
            <button type="button" className="btn-secondary btn-danger" onClick={props.onDelete}>
              {tr('Delete shot', 'Schlag löschen')}
            </button>
          )}
          {props.onHoledOut && (
            <button type="button" className="btn-secondary" onClick={props.onHoledOut}>
              {tr('Holed it! (chip-in)', 'Eingelocht! (Chip-in)')}
            </button>
          )}
          <button type="button" className="btn-primary" onClick={() => save(club)}>
            {props.editing ? tr('Save', 'Speichern') : club ? `${tr('Save', 'Speichern')} · ${clubCode(club)}` : tr('Save without club', 'Ohne Schläger speichern')}
          </button>
        </div>
      </section>
    </div>
  );
}

export function GreenSheet(props: {
  title: string;
  firstPuttM: number | null;
  unit: string;
  fmt: (m: number) => string;
  putts: number | null;
  read?: string | null; // putt read from the green heights (feature 024)
  onSave: (putts: number) => void;
  onCancel: () => void;
}) {
  return (
    <div className="sheet-backdrop" onClick={props.onCancel}>
      <section className="sheet" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{props.title}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onCancel}>
            ✕
          </button>
        </div>
        {props.firstPuttM != null && !props.read && (
          <p className="muted" style={{ margin: 0 }}>
            {tr('First putt from', 'Erster Putt aus')} <strong style={{ color: 'var(--text)' }}>{props.fmt(props.firstPuttM)} {props.unit}</strong> {tr('(ball → flag)', '(Ball → Fahne)')}
          </p>
        )}
        {props.read && (
          <p className="putt-read" style={{ margin: 0 }}>
            {props.read} <span className="muted small">{tr('(approx.)', '(ca.)')}</span>
          </p>
        )}
        <div className="field">
          <label>{tr('Putts – tap to save', 'Putts – antippen zum Speichern')}</label>
          <div className="club-grid" role="group" aria-label="Putts">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} type="button" aria-pressed={props.putts === n} onClick={() => props.onSave(n)}>
                {n === 4 ? '4+' : n}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/** The nine flights as a 3 × 3 grid – rows: starting left, straight, right; columns: curving left, not, right – each
 *  with its line from the ball upward (mirrored for a left-hander, whose pull goes right). */
function FlightPicker(props: { value: Flight | null; onChange: (f: Flight | null) => void }) {
  const lefty = isLeftHanded();
  const tile = (f: (typeof FLIGHTS)[number]) => {
        // the path: from the ball (bottom middle) off in the start direction, then the curve
        // the start line points at (20 + s, 5); the control point lies on it, so without a curve the path is straight and
        // with one the end bends away to that side
        const s = f.start * 8;
        const c = f.curve * 10;
        const d = `M20 34 Q${(20 + s * 0.55).toFixed(1)} 19 ${20 + s + c} 5`;
        return (
          <button key={f.value} type="button" className="flight-opt" aria-pressed={props.value === f.value} onClick={() => props.onChange(props.value === f.value ? null : f.value)}>
            <svg width="40" height="38" viewBox="0 0 40 38" aria-hidden="true" style={lefty ? { transform: 'scaleX(-1)' } : undefined}>
              <line x1="20" y1="36" x2="20" y2="3" stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 3" />
              <path d={d} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="20" cy="34" r="2.6" fill="currentColor" />
            </svg>
            <span>{f.label()}</span>
          </button>
        );
  };
  // the nine flights 3 × 3, below them draw and fade (Sascha 24.10.2026)
  return (
    <div className="flight-picker" role="group" aria-label={tr('Flight', 'Flugbahn')}>
      <div className="flight-grid">{FLIGHTS.filter((f) => !f.shape).map(tile)}</div>
      <div className="flight-grid two">{FLIGHTS.filter((f) => f.shape).map(tile)}</div>
    </div>
  );
}
