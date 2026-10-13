import { useState } from 'react';
import type { HoleEntry, Round } from '../types';
import { Segmented, Stepper } from './ui';
import { tr } from '../lib/i18n';

// Tap a hole on the scorecard → correct it right there (Sascha, 13.10.2026: two chip-ins had become holes in one).
// Strokes for every player, putts for me. The shots of a detailed round stay as they are – "Check shots" edits those.

export function HoleEditSheet(props: { round: Round; index: number; onCancel: () => void; onSave: (r: Round) => void }) {
  const { round, index } = props;
  const hole = round.holes[index];
  const me = round.players.find((p) => p.isMe)!;
  const [strokes, setStrokes] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(round.players.map((p) => [p.id, round.entries[p.id][index].pickedUp ? null : round.entries[p.id][index].strokes])),
  );
  const [putts, setPutts] = useState<number | null>(round.entries[me.id][index].putts);

  const save = () => {
    const entries = { ...round.entries };
    for (const p of round.players) {
      const old = entries[p.id][index];
      const s = strokes[p.id];
      const next: HoleEntry = { ...old, strokes: s ?? old.strokes, pickedUp: s != null ? false : old.pickedUp };
      if (p.id === me.id) {
        next.putts = putts;
        // putts on the green → it was not holed from off the green
        if (putts != null && putts > 0 && next.detail?.holedOut) next.detail = { ...next.detail, holedOut: false };
      }
      entries[p.id] = entries[p.id].map((e, k) => (k === index ? next : e));
    }
    props.onSave({ ...round, entries });
  };

  const title = tr(`Hole ${hole.label} · par ${hole.par}`, `Loch ${hole.label} · Par ${hole.par}`);
  return (
    <div className="sheet-backdrop" onClick={props.onCancel}>
      <section className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{title}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onCancel}>
            ✕
          </button>
        </div>
        {round.players.map((p) => (
          <div className="row" key={p.id}>
            <span className="row-label">
              {p.name} · {tr('Strokes', 'Schläge')}
            </span>
            <Stepper label={tr(`${p.name} strokes`, `${p.name} Schläge`)} value={strokes[p.id]} placeholder={hole.par} min={1} onChange={(v) => setStrokes({ ...strokes, [p.id]: v })} />
          </div>
        ))}
        <div className="field">
          <label>Putts</label>
          <Segmented<number> label="Putts" value={putts} onChange={setPutts} options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: n === 4 ? '4+' : String(n) }))} />
          <span className="muted small">{tr('Chip-in or holed from off the green: 0 putts.', 'Chip-in oder von außerhalb eingelocht: 0 Putts.')}</span>
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn-primary" onClick={save}>
            {tr('Save', 'Speichern')}
          </button>
        </div>
      </section>
    </div>
  );
}
