import { tr } from '../lib/i18n';
import { formatEuro, money } from '../lib/gameforms';
import { sums, type Item, type Person, type WhyLine } from '../lib/gamepay';
import { dayText } from './Settings';

// A person in "Bilanz" (Sascha 16.11.2026, Bilanz-Mockup B: "nicht erkennbar, wofür Cedric mir die 40 $ schuldet – 20 $
// für die gestrige Runde und 20 $ für die heutige"; "B, aber zusätzlich die Info, was bereits bezahlt ist und was nicht …
// erst dann darf in der Bilanz abgebucht werden"): what is left on top – only what the receiver confirmed is off –, then
// each round with what it was (the bets, a 5+5+10's nines, a game), paid or open.

const cls = (v: number) => (v > 0.004 ? 'good-text' : v < -0.004 ? 'bad-text' : 'muted');
const plain = (m: Record<string, number>) =>
  Object.entries(m)
    .map(([sym, v]) => money(Math.abs(v), sym))
    .join(' · ');
const pick = (m: Record<string, number>, sign: 1 | -1) => Object.fromEntries(Object.entries(m).filter(([, v]) => v * sign > 0.004));

/** What is left between the two; a payment not confirmed yet said beside it. */
export function Verdict(props: { p: Person }) {
  const { p } = props;
  const booked = sums(p.items, (i) => i.open + i.pending);
  const pend = sums(p.items, (i) => i.pending);
  const plus = pick(booked, 1);
  const minus = pick(booked, -1);
  const mine = pick(pend, -1);
  const his = pick(pend, 1);
  const some = (m: Record<string, number>) => Object.keys(m).length > 0;
  return (
    <div className="balance-verdict">
      <span className="muted small">{tr('On the whole', 'Unterm Strich')}</span>
      {some(plus) && <strong className="good-text">{tr(`${p.name} still pays you ${plain(plus)}`, `${p.name} zahlt dir noch ${plain(plus)}`)}</strong>}
      {some(minus) && <strong className="bad-text">{tr(`You still pay ${p.name} ${plain(minus)}`, `Du zahlst ${p.name} noch ${plain(minus)}`)}</strong>}
      {!some(plus) && !some(minus) && <strong>{tr('All paid', 'Alles bezahlt')}</strong>}
      {some(mine) && <span className="small warn-text">{tr(`${plain(mine)} paid – ${p.name} has not confirmed yet`, `${plain(mine)} bezahlt – ${p.name} bestätigt noch`)}</span>}
      {some(his) && <span className="small warn-text">{tr(`${p.name} paid ${plain(his)} – please confirm`, `${p.name} hat ${plain(his)} bezahlt – bitte bestätigen`)}</span>}
    </div>
  );
}

/** The rounds between the two, oldest first: what the receiver confirmed goes to the oldest rounds first (a round the
 *  other way – he won it – is set off); the lines of the whole trip at the end. */
export function WhyGroups(props: { p: Person; onOpen?: (i: Item) => (() => void) | undefined }) {
  const { p } = props;
  type Row = { line: WhyLine; i: Item };
  const rows: Row[] = p.items.flatMap((i) =>
    (i.lines?.length ? i.lines : [{ day: i.kind === 'pool' ? null : i.day, course: '', text: i.title, amount: i.amount, ...(i.kind === 'pool' ? { pool: i.title } : {}) } as WhyLine]).map((line) => ({ line, i })),
  );
  const pools = new Set(p.items.filter((i) => i.kind === 'pool').map((i) => i.title));
  const keyOf = (r: Row) => `${r.line.day ?? '~'}|${r.line.course}|${r.i.sym}`;
  const keys = [...new Set(rows.map(keyOf))].sort();
  const left: Record<string, number> = {};
  for (const i of p.items) left[i.sym] = (left[i.sym] ?? 0) + (i.amount - (i.open + i.pending));
  const total = sums(p.items, (i) => i.amount);
  return (
    <div className="balance-rounds" aria-label={tr('What for', 'Wofür')}>
      {keys.map((k) => {
        const rs = rows.filter((r) => keyOf(r) === k);
        const { day, course } = rs[0].line;
        const sym = rs[0].i.sym;
        const sum = Math.round(rs.reduce((x, r) => x + r.line.amount, 0) * 100) / 100;
        const sign = Math.sign(total[sym] ?? 0);
        let state: 'paid' | 'part' | 'open' | 'even' | null = Math.abs(sum) < 0.005 && rs.length > 1 ? 'even' : null;
        if (sign !== 0 && Math.sign(sum) === sign && Math.abs(sum) > 0.004) {
          const have = Math.max(0, (left[sym] ?? 0) * sign);
          const take = Math.min(have, Math.abs(sum));
          left[sym] = (left[sym] ?? 0) - take * sign;
          state = take >= Math.abs(sum) - 0.004 ? 'paid' : take > 0.004 ? 'part' : 'open';
        }
        const when = day ? [dayText(day).replace(/,? \d{4}$/, ''), course].filter(Boolean).join(' · ') : tr('The whole trip', 'Ganze Reise');
        return (
          <section key={k} className="balance-round" aria-label={when}>
            <div className="balance-round-head">
              <strong className="grow">{when}</strong>
              {state && (
                <span className={`small ${state === 'paid' ? 'good-text' : state === 'part' ? 'warn-text' : state === 'even' ? 'muted' : 'bad-text'}`}>
                  {state === 'paid' ? tr('paid', 'bezahlt') : state === 'part' ? tr('partly paid', 'teilweise bezahlt') : state === 'even' ? tr('set off', 'verrechnet') : tr('open', 'offen')}
                </span>
              )}
              <strong className={cls(sum)}>{formatEuro(sum, sym)}</strong>
            </div>
            {rs.map(({ line, i }, n) => {
              const go = props.onOpen?.(i);
              const inner = (
                <>
                  <span className="grow">
                    <span>
                      {line.text}
                      {line.provisional && <span className="muted"> · {tr('provisional', 'vorläufig')}</span>}
                    </span>
                    {line.parts && (
                      <span className="balance-parts">
                        {line.parts.map((x) => (
                          <span key={x.part} className={cls(x.amount)}>
                            {x.part === 'front' ? tr('front', 'vorne') : x.part === 'back' ? tr('back', 'hinten') : tr('18', 'gesamt')} {formatEuro(x.amount, sym)}
                          </span>
                        ))}
                      </span>
                    )}
                    {pools.size > 1 && line.pool && <span className="muted small">{line.pool}</span>}
                  </span>
                  <span className={cls(line.amount)}>{formatEuro(line.amount, sym)}</span>
                </>
              );
              return go ? (
                <button key={n} type="button" className="balance-why" onClick={go}>
                  {inner}
                </button>
              ) : (
                <div key={n} className="balance-why">
                  {inner}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
