import { useState } from 'react';
import type { Club, Lie, PenaltyKind, ShotKind } from '../types';
import { BAG, KINDS, LIES, suggestKind } from '../lib/shots';
import { Segmented } from './ui';
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
  bag?: { club: Club; m: number }[]; // the player's distances (own data or standard)
  onSave: (v: { lie: Lie; club: Club | null; penalty: boolean; penaltyKind?: PenaltyKind; kind: ShotKind; review: false }) => void;
  onDelete?: () => void;
  onHoledOut?: () => void; // "holed from here" (chip-in) – only for a new shot
  onCancel: () => void;
}) {
  const [lie, setLie] = useState<Lie>(props.lie);
  // none / water / out of bounds – an older penalty without a kind shows as water
  const [pk, setPk] = useState<PenaltyKind | 'none'>(props.penalty ? (props.penaltyKind ?? 'water') : 'none');
  const penalty = pk !== 'none';
  const [club, setClub] = useState<Club | null>(props.club);
  const [kind, setKind] = useState<ShotKind | null>(props.kind ?? null); // null = follow the suggestion
  const shownKind = kind ?? suggestKind(lie, props.toPinM);
  const save = (c: Club | null) => props.onSave({ lie, club: c, penalty, penaltyKind: penalty ? (pk as PenaltyKind) : undefined, kind: shownKind, review: false });
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
          <Segmented<Lie> label={tr('Lie', 'Lage')} value={lie} onChange={(v) => v && setLie(v)} options={LIES} />
        </div>
        <div className="field">
          <label>{tr('Shot', 'Schlag')}</label>
          <Segmented<ShotKind> label={tr('Shot type', 'Schlagart')} value={shownKind} onChange={(v) => v && setKind(v)} options={KINDS} />
        </div>
        <div className="field">
          <label>{tr('Club', 'Schläger')} {props.editing ? '' : tr('– tap to save', '– antippen zum Speichern')}</label>
          <div className="club-grid" role="group" aria-label={tr('Club', 'Schläger')}>
            {(props.bag ?? BAG).map((b) => (
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
                <small>{b.m} m</small>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{tr('Penalty after this shot (+1)', 'Strafschlag nach diesem Schlag (+1)')}</label>
          <Segmented<PenaltyKind | 'none'>
            label={tr('Penalty', 'Strafschlag')}
            value={pk}
            onChange={(v) => v && setPk(v)}
            options={[
              { value: 'none', label: tr('None', 'Keiner') },
              { value: 'water', label: tr('Water', 'Wasser') },
              { value: 'ob', label: tr('Out of bounds', 'Aus') },
            ]}
          />
        </div>
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
