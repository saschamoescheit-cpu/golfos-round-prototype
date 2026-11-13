// The live leaderboard's card (Sascha 03.11.2026, Tournaments) – also the round's leaderboard of a tournament or of the
// flight's phones (Sascha 13.11.2026: "optisch genauso wie im Live-Leaderboard unter Tournaments").
import { useState, type ReactNode } from 'react';
import type { Round } from '../types';
import { tr } from '../lib/i18n';
import { ScoreTable } from './ScoreTable';
import { ServerStale } from './ServerStale';

/** The live leaderboard of a tournament and of a series (Sascha 03.11.2026: "a live leaderboard for single tournaments
 *  and for series"): always there – before the start every player with "–", while played "● LIVE", "nach 9", "F". */
export type BoardRow = { key: string; pos: string; name: string; sub?: string; /** more below the name – the round's board: "dein Flight", "Zähler weicht ab", "unterschrieben" */ extra?: ReactNode; value: string; thru: string; /** his scorecards – one: the row opens it; several (the rounds): a chip each */ cards?: { label: string; card: () => Round | null }[]; /** the cards as chips even when one (a series: "R1 +3") */ chips?: boolean; out?: boolean };
export function LiveBoard(props: { label: string; title: string; live: boolean; rows: BoardRow[]; note?: string; chips?: ReactNode; cutAfter?: number; className?: string; /** below the board, in its card (flights, prizes, actions) */ children?: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen(open === id ? null : id);
  return (
    <section className={`card tour-live${props.className ? ' ' + props.className : ''}`} aria-label={props.label}>
      <div className="tour-live-head">
        <span className="eyebrow">{props.title}</span>
        {props.live && (
          <span className="tour-live-badge">
            <i aria-hidden="true" />
            LIVE
          </span>
        )}
      </div>
      <ServerStale />
      {props.chips}
      <ol className="lb-rows tour-lb">
        {props.rows.map((r, i) => {
          const one = r.cards?.length === 1 && !r.chips;
          const shown = r.cards?.findIndex((_, k) => open === `${r.key}:${k}`) ?? -1;
          const card = shown >= 0 ? r.cards![shown].card() : null;
          return (
            <li key={r.key} className={`${one ? 'lb-tap' : ''}${r.out ? ' lb-out' : ''}${r.out && !props.rows[i - 1]?.out ? ' lb-cut' : ''}`} onClick={one ? () => toggle(`${r.key}:0`) : undefined} aria-expanded={one ? shown === 0 : undefined}>
              <span className="lb-rank">{r.pos}</span>
              <span className="lb-name">
                {r.name}
                {r.sub && <span className="muted small tour-lb-sub">{r.sub}</span>}
                {r.extra}
                {r.cards && !one && r.cards.length > 0 && (
                  <span className="chip-set lb-parts">
                    {r.cards.map((c, k) => (
                      <button key={k} type="button" className={`chip${shown === k ? ' on' : ''}`} aria-pressed={shown === k} aria-label={tr(`${r.name} – scorecard ${c.label}`, `${r.name} – Scorekarte ${c.label}`)} onClick={() => toggle(`${r.key}:${k}`)}>
                        {c.label}
                      </button>
                    ))}
                  </span>
                )}
              </span>
              <span className="lb-value">{r.value}</span>
              <span className="lb-thru muted small">{r.thru}</span>
              {card && (
                <div className="lb-card" onClick={(e) => e.stopPropagation()}>
                  <ScoreTable round={card} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {props.cutAfter != null && props.rows.some((r) => r.out) && <span className="muted small">{tr(`Below the line: missed the cut after round ${props.cutAfter}.`, `Unter der Linie: Cut nach Runde ${props.cutAfter} verpasst.`)}</span>}
      {props.note && <span className="muted small">{props.note}</span>}
      {props.children}
    </section>
  );
}
