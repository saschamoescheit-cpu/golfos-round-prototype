import { useState } from 'react';
import type { Club, Lie } from '../types';
import { BAG, LIES } from '../lib/shots';
import { Segmented } from './ui';

// Bottom sheet for one shot of the detailed tracking: lie (suggested from the map), club (suggested
// from the distance), penalty. One tap on a club saves the shot – the fastest path on the course.

export function ShotSheet(props: {
  title: string; // e.g. "Shot 2 · 148 m to pin"
  lie: Lie;
  club: Club | null; // suggestion or the saved club when editing
  penalty: boolean;
  editing: boolean;
  onSave: (v: { lie: Lie; club: Club | null; penalty: boolean }) => void;
  onDelete?: () => void;
  onHoledOut?: () => void; // "holed from here" (chip-in) – only for a new shot
  onCancel: () => void;
}) {
  const [lie, setLie] = useState<Lie>(props.lie);
  const [penalty, setPenalty] = useState(props.penalty);
  const [club, setClub] = useState<Club | null>(props.club);
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
          <label>Club {props.editing ? '' : '– tap to save'}</label>
          <div className="club-grid" role="group" aria-label="Club">
            {BAG.map((b) => (
              <button
                key={b.club}
                type="button"
                aria-pressed={club === b.club}
                className={props.club === b.club && !props.editing ? 'suggested' : undefined}
                onClick={() => {
                  setClub(b.club);
                  if (!props.editing) props.onSave({ lie, club: b.club, penalty });
                }}
              >
                {b.club}
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
          <button type="button" className="btn-primary" onClick={() => props.onSave({ lie, club, penalty })}>
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
