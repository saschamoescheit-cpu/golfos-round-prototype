import { useState } from 'react';
import { GROUPS, SG_CATEGORIES, SG_LABELS, groupSg, type SgCategory, type SgValues } from '../lib/sg';
import { SgHole } from './SgHole';
import { dec, tr } from '../lib/i18n';

// Strokes gained per category, compared with a target group (tour pro, scratch, handicap classes).
// Used after a round (scorecard) and across rounds (stats).

const fmt = (v: number) => dec(`${v > 0 ? '+' : ''}${v.toFixed(1)}`);

export function SgCard(props: { values: SgValues; shots: Record<SgCategory, number>; holes: number; defaultGroup: string; title: string }) {
  const [group, setGroup] = useState(props.defaultGroup);
  const g = groupSg(group);
  const label = GROUPS.find((x) => x.id === group)!.label;
  const diff = Math.round((props.values.total - g.total) * 10) / 10;
  const diffs = Object.fromEntries(SG_CATEGORIES.map((c) => [c, Math.round((props.values[c] - g[c]) * 10) / 10])) as Record<SgCategory, number>;
  return (
    <section className="card stats-card">
      <h2>{props.title}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {tr(
          `Strokes gained per 18 holes against the tour average (${props.holes} holes with all shots). Compare with:`,
          `Strokes Gained je 18 Löcher gegen den Tour-Durchschnitt (${props.holes} Löcher mit allen Schlägen). Vergleichen mit:`,
        )}
      </p>
      <div className="chip-row" role="group" aria-label={tr('Compare with', 'Vergleichen mit')}>
        {GROUPS.map((x) => (
          <button key={x.id} type="button" aria-pressed={group === x.id} onClick={() => setGroup(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <p style={{ margin: 0 }}>
        {group === 'tour' ? tr('Against a tour pro you ', 'Gegen einen Tour-Profi ') : tr(`Against ${label} players you `, `Gegen Spieler mit ${label} `)}
        <strong className={diff >= 0 ? 'good-text' : 'bad-text'}>
          {diff >= 0 ? tr('gain', 'gewinnst du') : tr('lose', 'verlierst du')} {dec(Math.abs(diff).toFixed(1))}
        </strong>{' '}
        {tr('strokes per round.', 'Schläge pro Runde.')}
      </p>
      <SgHole diff={diffs} shots={props.shots} />
      <table className="mini-table sg-table">
        <thead>
          <tr>
            <th />
            <th>{tr('You', 'Du')}</th>
            <th>{label}</th>
            <th>{tr('Difference', 'Differenz')}</th>
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
                  <span className={`sg-diff ${d >= 0 ? 'good' : 'bad'}`} style={{ width: `${Math.min(82, Math.abs(d) * 16) + 18}%` }}>
                    {fmt(d)}
                  </span>
                </td>
              </tr>
            );
          })}
          <tr className="sum">
            <td>{tr('Total', 'Gesamt')}</td>
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
