import { useState } from 'react';
import type { HoleEntry, Round } from '../types';
import { Segmented, Stepper } from './ui';
import { tr } from '../lib/i18n';

// Tap a hole on the scorecard → correct it right there (Sascha, 13.10.2026: two chip-ins had become holes in one).
// Strokes for every player, putts and penalties for me. Every tap is saved at once and the card behind updates – no save button
// at the bottom, where Safari's toolbar covers it on the iPhone. The shots of a detailed round stay as they are –
// "Check shots" edits those.

export function HoleEditSheet(props: { round: Round; index: number; onChange: (r: Round) => void; onClose: () => void }) {
  const { round, index } = props;
  const hole = round.holes[index];
  const me = round.players.find((p) => p.isMe)!;
  const [strokes, setStrokes] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(round.players.map((p) => [p.id, round.entries[p.id][index].pickedUp ? null : round.entries[p.id][index].strokes])),
  );
  const [putts, setPutts] = useState<number | null>(round.entries[me.id][index].putts);
  const [pen, setPen] = useState<number>(round.entries[me.id][index].penalties ?? 0);

  const save = (s: Record<string, number | null>, pt: number | null, pn = pen) => {
    const entries = { ...round.entries };
    for (const p of round.players) {
      const old = entries[p.id][index];
      const v = s[p.id];
      const next: HoleEntry = { ...old, strokes: v ?? old.strokes, pickedUp: v != null ? false : old.pickedUp };
      if (p.id === me.id) {
        next.putts = pt;
        next.penalties = pn; // water / out of bounds: the round check needs it to count the swings
        // putts on the green → it was not holed from off the green
        if (pt != null && pt > 0 && next.detail?.holedOut) next.detail = { ...next.detail, holedOut: false };
      }
      entries[p.id] = entries[p.id].map((e, k) => (k === index ? next : e));
    }
    props.onChange({ ...round, entries });
  };

  const title = tr(`Hole ${hole.label} · par ${hole.par}`, `Loch ${hole.label} · Par ${hole.par}`);
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{title}</strong>
          <button type="button" className="btn-primary sheet-done" onClick={props.onClose}>
            {tr('Done', 'Fertig')}
          </button>
        </div>
        {round.players.map((p) => (
          <div className="row" key={p.id}>
            <span className="row-label">
              {p.name} · {tr('Strokes', 'Schläge')}
            </span>
            <Stepper
              label={tr(`${p.name} strokes`, `${p.name} Schläge`)}
              value={strokes[p.id]}
              placeholder={hole.par}
              min={1}
              onChange={(v) => {
                const next = { ...strokes, [p.id]: v };
                setStrokes(next);
                save(next, putts);
              }}
            />
          </div>
        ))}
        <div className="field">
          <label>Putts</label>
          <Segmented<number>
            label="Putts"
            value={putts}
            onChange={(v) => {
              setPutts(v);
              save(strokes, v);
            }}
            options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: n === 4 ? '4+' : String(n) }))}
          />
          <span className="muted small">{tr('Chip-in or holed from off the green: 0 putts. Saved at once.', 'Chip-in oder von außerhalb eingelocht: 0 Putts. Wird sofort gespeichert.')}</span>
        </div>
        <div className="field">
          <label>{tr('Penalty strokes (water, out of bounds)', 'Strafschläge (Wasser, Aus)')}</label>
          <Segmented<number>
            label={tr('Penalty strokes', 'Strafschläge')}
            value={pen}
            onChange={(v) => {
              setPen(v ?? 0);
              save(strokes, putts, v ?? 0);
            }}
            options={[0, 1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
          />
        </div>
      </section>
    </div>
  );
}
