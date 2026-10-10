import { useState } from 'react';
import type { Club, Lie, ShotKind } from '../types';
import { BAG, KINDS, LIES, suggestKind } from '../lib/shots';
import { Segmented } from './ui';

// Bottom sheet for one shot of the detailed tracking: lie (suggested from the map), shot type (suggested
// from lie and distance), club (suggested from the distance), penalty. One tap on a club saves a new
// shot – the fastest path on the course.

export function ShotSheet(props: {
  title: string; // e.g. "Shot 2 · 148 m to pin"
  lie: Lie;
  club: Club | null; // suggestion or the saved club when editing
  penalty: boolean;
  kind?: ShotKind; // saved shot type; missing = suggested from lie and distance
  toPinM: number | null;
  editing: boolean;
  bag?: { club: Club; m: number }[]; // the player's distances (own data or standard)
  onSave: (v: { lie: Lie; club: Club | null; penalty: boolean; kind: ShotKind; review: false }) => void;
  onDelete?: () => void;
  onHoledOut?: () => void; // "holed from here" (chip-in) – only for a new shot
  onCancel: () => void;
}) {
  const [lie, setLie] = useState<Lie>(props.lie);
  const [penalty, setPenalty] = useState(props.penalty);
  const [club, setClub] = useState<Club | null>(props.club);
  const [kind, setKind] = useState<ShotKind | null>(props.kind ?? null); // null = follow the suggestion
  const shownKind = kind ?? suggestKind(lie, props.toPinM);
  const save = (c: Club | null) => props.onSave({ lie, club: c, penalty, kind: shownKind, review: false });
  return (
    <div className="sheet-backdrop" onClick={props.onCancel}>
      <section className="sheet" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{props.title}</strong>
          <button type="button" className="icon-btn" aria-label="Close" onClick={props.onCancel}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>Lie</label>
          <Segmented<Lie> label="Lie" value={lie} onChange={(v) => v && setLie(v)} options={LIES} />
        </div>
        <div className="field">
          <label>Shot</label>
          <Segmented<ShotKind> label="Shot type" value={shownKind} onChange={(v) => v && setKind(v)} options={KINDS} />
        </div>
        <div className="field">
          <label>Club {props.editing ? '' : '– tap to save'}</label>
          <div className="club-grid" role="group" aria-label="Club">
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
                {b.club}
                <small>{b.m} m</small>
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="toggle" aria-pressed={penalty} onClick={() => setPenalty(!penalty)}>
          {penalty ? '✓' : '○'} Penalty after this shot (water, out of bounds) +1
        </button>
        <div className="sheet-actions">
          {props.onDelete && (
            <button type="button" className="btn-secondary btn-danger" onClick={props.onDelete}>
              Delete shot
            </button>
          )}
          {props.onHoledOut && (
            <button type="button" className="btn-secondary" onClick={props.onHoledOut}>
              Holed it! (chip-in)
            </button>
          )}
          <button type="button" className="btn-primary" onClick={() => save(club)}>
            {props.editing ? 'Save' : club ? `Save · ${club}` : 'Save without club'}
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
  onSave: (putts: number) => void;
  onCancel: () => void;
}) {
  return (
    <div className="sheet-backdrop" onClick={props.onCancel}>
      <section className="sheet" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{props.title}</strong>
          <button type="button" className="icon-btn" aria-label="Close" onClick={props.onCancel}>
            ✕
          </button>
        </div>
        {props.firstPuttM != null && (
          <p className="muted" style={{ margin: 0 }}>
            First putt from <strong style={{ color: 'var(--text)' }}>{props.fmt(props.firstPuttM)} {props.unit}</strong> (ball → flag)
          </p>
        )}
        <div className="field">
          <label>Putts – tap to save</label>
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
