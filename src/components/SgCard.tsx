import { useState } from 'react';
import { GROUPS, SG_CATEGORIES, SG_LABELS, groupSg, type SgValues } from '../lib/sg';

// Strokes gained per category, compared with a target group (tour pro, scratch, handicap classes).
// Used after a round (scorecard) and across rounds (stats).

const fmt = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

export function SgCard(props: { values: SgValues; holes: number; defaultGroup: string; title: string }) {
  const [group, setGroup] = useState(props.defaultGroup);
  const g = groupSg(group);
  const label = GROUPS.find((x) => x.id === group)!.label;
  const diff = Math.round((props.values.total - g.total) * 10) / 10;
  return (
    <section className="card stats-card">
      <h2>{props.title}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        Strokes gained per 18 holes against the tour average ({props.holes} holes with all shots). Compare with:
      </p>
      <div className="chip-row" role="group" aria-label="Compare with">
        {GROUPS.map((x) => (
          <button key={x.id} type="button" aria-pressed={group === x.id} onClick={() => setGroup(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <p style={{ margin: 0 }}>
        {group === 'tour' ? 'Against a tour pro you ' : `Against ${label} players you `}
        <strong className={diff >= 0 ? 'good-text' : 'bad-text'}>
          {diff >= 0 ? 'gain' : 'lose'} {Math.abs(diff).toFixed(1)}
        </strong>{' '}
        strokes per round.
      </p>
      <table className="mini-table sg-table">
        <thead>
          <tr>
            <th />
            <th>You</th>
            <th>{label}</th>
            <th>Difference</th>
          </tr>
        </thead>
        <tbody>
          {SG_CATEGORIES.map((c) => {
            const d = Math.round((props.values[c] - g[c]) * 10) / 10;
            return (
              <tr key={c}>
                <td>{SG_LABELS[c]}</td>
                <td>{fmt(props.values[c])}</td>
                <td className="muted">{fmt(g[c])}</td>
                <td>
                  <span className={`sg-diff ${d >= 0 ? 'good' : 'bad'}`} style={{ width: `${Math.min(100, Math.abs(d) * 20) + 18}%` }}>
                    {fmt(d)}
                  </span>
                </td>
              </tr>
            );
          })}
          <tr className="sum">
            <td>Total</td>
            <td>{fmt(props.values.total)}</td>
            <td className="muted">{fmt(g.total)}</td>
            <td>
              <strong className={diff >= 0 ? 'good-text' : 'bad-text'}>{fmt(diff)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
