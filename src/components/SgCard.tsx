import { useState } from 'react';
import { GROUPS, SG_CATEGORIES, SG_LABELS, groupSg, type SgCategory, type SgValues } from '../lib/sg';
import { SgHole } from './SgHole';
import { dec, tr } from '../lib/i18n';

// Strokes gained per category, compared with a target group (tour pro, scratch, handicap classes).
// Used after a round (scorecard) and across rounds (stats).

const fmt = (v: number) => dec(`${v > 0 ? '+' : ''}${v.toFixed(1)}`);

export function SgCard(props: { values: SgValues; shots: Record<SgCategory, number>; holes: number; defaultGroup: string; title: string; base?: 9 | 18 }) {
  const [group, setGroup] = useState(props.defaultGroup);
  const base = props.base ?? 18;
  const k = base / 18;
  const r1 = (v: number) => Math.round(v * k * 10) / 10;
  const values = Object.fromEntries(Object.entries(props.values).map(([c, v]) => [c, r1(v)])) as SgValues;
  const shots = Object.fromEntries(Object.entries(props.shots).map(([c, v]) => [c, Math.round(v * k)])) as Record<SgCategory, number>;
  const g = Object.fromEntries(Object.entries(groupSg(group)).map(([c, v]) => [c, r1(v)])) as SgValues;
  // the totals as the sum of the rounded categories, so the table adds up
  values.total = Math.round(SG_CATEGORIES.reduce((t, c) => t + values[c], 0) * 10) / 10;
  g.total = Math.round(SG_CATEGORIES.reduce((t, c) => t + g[c], 0) * 10) / 10;
  const label = GROUPS.find((x) => x.id === group)!.label;
  const diff = Math.round((values.total - g.total) * 10) / 10;
  const diffs = Object.fromEntries(SG_CATEGORIES.map((c) => [c, Math.round((values[c] - g[c]) * 10) / 10])) as Record<SgCategory, number>;
  return (
    <section className="card stats-card">
      <h2>{props.title}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {tr(
          `Per ${base} holes · ${props.holes} holes checked${props.holes < 9 ? ' – values still swing' : ''}`,
          `Je ${base} Löcher · ${props.holes} Löcher geprüft${props.holes < 9 ? ' – Werte schwanken noch' : ''}`,
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
        {base === 9 ? tr('strokes per 9 holes.', 'Schläge je 9 Löcher.') : tr('strokes per round.', 'Schläge pro Runde.')}
      </p>
      <SgHole diff={diffs} shots={shots} />
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
            const d = Math.round((values[c] - g[c]) * 10) / 10;
            return (
              <tr key={c}>
                <td>{SG_LABELS[c]}</td>
                <td>{fmt(values[c])}</td>
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
            <td>{fmt(values.total)}</td>
            <td className="muted">{fmt(g.total)}</td>
            <td>
              <strong className={diff >= 0 ? 'good-text' : 'bad-text'}>{fmt(diff)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      {SG_CATEGORIES.some((c) => shots[c] === 0 && diffs[c] > 0) && (
        // "0 strokes, +3.9" looks like a mistake: the group needs those strokes (missed greens), the player did not
        <p className="muted small" style={{ margin: 0 }}>
          {SG_CATEGORIES.filter((c) => shots[c] === 0 && diffs[c] > 0)
            .map((c) => SG_LABELS[c])
            .join(', ')}
          {tr(
            `: no strokes of yours – the group needs some here (e.g. after missed greens), you saved them.`,
            `: kein Schlag von dir – die Vergleichsgruppe braucht hier welche (z. B. nach verfehlten Grüns), du hast sie gespart.`,
          )}
        </p>
      )}
    </section>
  );
}
