import { useState } from 'react';
import type { Club, Intent, Lie, PenaltyKind, ShotKind, SlopeLie, Strike } from '../types';
import { BAG, KINDS, LIES, suggestKind } from '../lib/shots';
import { alwaysAgain, INTENTS, PENALTIES, SLOPES, STRIKES } from '../lib/shotfacts';
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
  intent?: Intent;
  slope?: SlopeLie;
  /** the stance read off the terrain model when the player has not set one (Sascha 22.10.2026) */
  slopeSuggested?: SlopeLie | null;
  onSave: (v: {
    lie: Lie;
    club: Club | null;
    penalty: boolean;
    penaltyKind?: PenaltyKind;
    replay?: boolean;
    provisional?: boolean;
    strike?: Strike;
    intent?: Intent;
    slope?: SlopeLie;
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
  const [strike, setStrike] = useState<Strike | null>(props.strike ?? null);
  const [intent, setIntent] = useState<Intent | null>(props.intent ?? null);
  const [slope, setSlope] = useState<SlopeLie | null>(props.slope ?? props.slopeSuggested ?? null);
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
      intent: intent ?? undefined,
      slope: slope ?? undefined,
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
            <div className="field">
              <label>{tr('Meant to (optional)', 'Absicht (optional)')}</label>
              <Chips<Intent> label={tr('Meant to', 'Absicht')} value={intent} onChange={setIntent} options={INTENTS.map((x) => ({ value: x.value, label: x.label() }))} />
            </div>
            <div className="field">
              <label>
                {tr('Stance (optional)', 'Stand (optional)')}
                {!props.slope && props.slopeSuggested ? <span className="muted small"> · {tr('suggested from the heights', 'aus den Höhen vorgeschlagen')}</span> : null}
              </label>
              <Chips<SlopeLie> label={tr('Stance', 'Stand')} value={slope} onChange={setSlope} options={SLOPES.map((x) => ({ value: x.value, label: x.label() }))} />
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
