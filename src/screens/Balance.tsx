import { useEffect, useState, type ReactNode } from 'react';
import { convert, fetchRate, homeMoney, moneyOfSym, rateFinal, rateKept, symOf, type Money } from '../lib/fx';
import { FloatActions } from '../components/FloatActions';
import { getLang, tr } from '../lib/i18n';
import { formDef, formatEuro, money, standingOf, type Game } from '../lib/gameforms';
import { dm, meIn, people, sums, topRows, waiting, type GamePayment, type Item, type Person } from '../lib/gamepay';
import { loadGames, saveGame } from '../lib/gamestore';
import { exchange } from '../lib/sharedgame';
import { newId } from '../lib/storage';
import { changePool, isLive, loadPools } from '../lib/wagerstore';
import { balances, dayOf, ledger, withDuels } from '../lib/wagers';
import { isMoney, paidWord, prizeOf, prizeSym } from '../lib/prize';
import { pushPaid } from '../lib/push';
import { usePools } from './Wagers';
import { loadProfile, shownName } from '../lib/profile';

// The menu "Bilanz" (Sascha 03.11.2026): what I won and lost, against each player – which games and bets make it up –,
// what is still open, "Bezahlt" when I paid, "Erhalten" when I got it (the other confirms what the one marked), and
// each pool of bets on its own.

const cls = (v: number) => (v > 0.004 ? 'good-text' : v < -0.004 ? 'bad-text' : 'muted');
/** "+12 € · −5 $ · +2 × Getränk" – one amount per currency or thing. */
function Amounts(props: { m: Record<string, number>; plain?: boolean; zero?: string }) {
  const parts = Object.entries(props.m).filter(([, v]) => Math.abs(v) > 0.004);
  // nothing yet: 0 in the currency of the pool or game (a $ pool showed "0 €", Sascha 06.11.2026)
  if (!parts.length) return <span className="muted">{money(0, props.zero ?? '€')}</span>;
  return (
    <>
      {parts.map(([sym, v], k) => (
        <span key={sym} className={props.plain ? undefined : cls(v)}>
          {k > 0 && ' · '}
          {props.plain ? money(Math.abs(v), sym) : formatEuro(v, sym)}
        </span>
      ))}
    </>
  );
}

// the marks of the tiles – as the tiles of Rounds and Games (Sascha 03.11.2026: "the tiles have no icons of their own")
const tileIcon = (d: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const TILE_ICONS = {
  // the controller of "Spielen"
  games: tileIcon(
    <>
      <rect x="2.5" y="7" width="19" height="11" rx="3.5" />
      <path d="M7.5 10.5v4M5.5 12.5h4" />
      <circle cx="15.5" cy="11.5" r="0.6" fill="currentColor" />
      <circle cx="18" cy="14" r="0.6" fill="currentColor" />
    </>,
  ),
  // the trophy
  wins: tileIcon(
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" />
    </>,
  ),
  // the ticket of "Wetten"
  bets: tileIcon(
    <>
      <path d="M3.5 7.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v2.2a2.3 2.3 0 0 0 0 4.6v2.2a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-2.2a2.3 2.3 0 0 0 0-4.6z" />
      <path d="M15 6.5v11" strokeDasharray="1.6 2" />
    </>,
  ),
  // up, down
  won: tileIcon(<path d="M3 17l6-6 4 4 8-8M15 7h6v6" />),
  lost: tileIcon(<path d="M3 7l6 6 4-4 8 8M15 17h6v-6" />),
  // the coins of "Bilanz"
  money: tileIcon(
    <>
      <ellipse cx="12" cy="6.5" rx="7" ry="2.8" />
      <path d="M5 6.5v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5M5 11.5v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5" />
    </>,
  ),
};

const now = () => new Date().toISOString();

/** A payment written where it belongs: a game's into the game (and to its other phones), a pool's into the pool. */
async function record(i: Item, change: (ps: GamePayment[]) => GamePayment[]): Promise<boolean> {
  if (i.kind === 'game') {
    const g = loadGames().find((x) => x.id === i.ref);
    if (!g) return false;
    const next: Game = { ...g, payments: change(g.payments ?? []) };
    saveGame(next);
    if (next.shared) void exchange(next).then((m) => m && saveGame(m));
    window.dispatchEvent(new Event('golfos:games-changed'));
    return true;
  }
  return !!(await changePool(i.ref, (p) => ({ ...p, payments: change(p.payments ?? []).filter((x) => !(x as GamePayment).undoneAt) })));
}

/** Mark an item settled: I paid him (paidAt) or I got it from him (receivedAt) – its open amount; one he marked paid
 *  and I got: confirmed. */
async function settle(i: Item, as: 'paid' | 'received', him: string): Promise<boolean> {
  const mine = as === 'paid';
  const open = Math.abs(i.open);
  // what he marked paid and I got: confirmed – then only what is left
  const confirmed = mine ? 0 : waiting(i).filter((p) => p.from === i.him).reduce((s, p) => s + p.amount, 0);
  const ok = await record(i, (ps) => {
    let out = ps;
    if (!mine) out = out.map((p) => (p.from === i.him && p.to === i.me && !p.receivedAt && !p.undoneAt ? { ...p, receivedAt: now() } : p));
    return open > 0.004 ? [...out, { id: newId(), from: mine ? i.me : i.him, to: mine ? i.him : i.me, amount: open, ...(mine ? { paidAt: now() } : { receivedAt: now() }) }] : out;
  });
  // the other phone hears of it (a shared game's or the pool's code)
  const code = i.kind === 'pool' ? i.ref : loadGames().find((x) => x.id === i.ref)?.shared?.code;
  if (ok && code && open + confirmed > 0.004) pushPaid(code, as, shownName(loadProfile()), him, money(open + confirmed, i.sym));
  return ok;
}

/** What a tile shows when tapped – one at a time, as on the rounds and the games. */
type BalanceFilter = 'games' | 'wins' | 'bets' | 'won' | 'lost' | null;
/** kept while a game or pool opened from the list is looked at – back, the same list */
let lastFilter: BalanceFilter = null;

/** A game or a pool of bets as it came out for me – the list a tile filters. */
interface Entry {
  kind: 'game' | 'pool';
  ref: string;
  head: string;
  line: string;
  day: string;
  sym: string;
  mine: number;
  /** what I won and what I lost in it, each on its own (Sascha 12.11.2026: "Verlust 30 $, Gewinn 320 $") – a game: its
   *  result on one side; a pool: the bets I won and the bets I lost */
  plus: number;
  minus: number;
  won: boolean;
  /** the cut-off day (Sascha 12.11.2026): a game the day it ended, a pool its last day – its amounts in the standard
   *  currency at that day's rate */
  until: string;
}

export function Balance(props: { games: Game[]; inTab?: boolean; onOpenPool?: (code: string) => void; /** a game of the list tapped: its result */ onOpenGame?: (g: Game) => void; /** the games still to confirm, tapped */ onConfirm?: (gs: Game[]) => void }) {
  usePools(); // read again when a pool changes
  const [, setTick] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  // the tiles filter (Sascha 04.11.2026: "the tiles in Bilanz have no filter") – a tap shows the games and bets behind it
  const [filter, setFilter] = useState<BalanceFilter>(lastFilter);
  const pick = (f: BalanceFilter) => setFilter((lastFilter = filter === f ? null : f));
  const [busy, setBusy] = useState(false);
  const today = dayOf(new Date());
  // the 5+5+10s judged from the cards, as in the pool (Sascha 12.11.2026) – not the progress kept from before
  const pools = loadPools()
    .filter((e) => !e.pool.deletedAt && e.me && e.pool.players.some((p) => p.id === e.me))
    .map((e) => ({ ...e, pool: withDuels(e.pool) }));
  const done = props.games.filter((g) => g.finishedAt && g.signedAt);
  const toSign = props.games.filter((g) => g.finishedAt && !g.signedAt);
  const unconfirmed = toSign.length;
  const ps = people(props.games, pools, today);
  // the games and pools in another currency than the standard one, with their cut-off day
  const entriesFx = [
    ...done.map((g) => ({ m: moneyOfSym(prizeSym(prizeOf({ currency: String(g.settings.currency ?? 'EUR'), prize: g.prize }))), until: (g.finishedAt ?? g.createdAt).slice(0, 10) })),
    ...pools.map((e) => ({ m: moneyOfSym(prizeSym(prizeOf(e.pool))), until: e.pool.to })),
  ].filter((x): x is { m: Money; until: string } => !!x.m && !!homeMoney() && x.m !== homeMoney());
  // the shared games' payments from the other phones when the balance opens (he marked it paid, or confirmed)
  useEffect(() => {
    let gone = false;
    void Promise.all(
      props.games
        .filter((g) => g.finishedAt && g.signedAt && g.shared)
        .map((g) =>
          exchange(g).then((m) => {
            if (m && JSON.stringify(m.payments ?? []) !== JSON.stringify(g.payments ?? [])) saveGame(m);
            return !!m;
          }),
        ),
    ).then(() => !gone && (window.dispatchEvent(new Event('golfos:games-changed')), setTick((t) => t + 1)));
    return () => {
      gone = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // the rates for the entries in another currency (once per day and pair; offline: the last known)
  useEffect(() => {
    const h = homeMoney();
    if (!h) return;
    const need = [...new Set(entriesFx.map((x) => `${x.m}|${x.until}`))];
    let gone = false;
    void Promise.all(need.map((k) => { const [m, until] = k.split('|'); return fetchRate(m as Money, h, until); })).then((news) => {
      if (!gone && news.some(Boolean)) setTick((t) => t + 1);
    });
    return () => {
      gone = true;
    };
  }, [entriesFx.map((x) => `${x.m}|${x.until}`).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!done.length && !unconfirmed && !pools.length) return props.inTab ? <p className="muted">{tr('No confirmed games or bets yet – they show here once played.', 'Noch keine bestätigten Spiele oder Wetten – sie erscheinen hier, sobald gespielt.')}</p> : null;

  const total: Record<string, number> = {};
  // each game and each pool once, as it came out for me – newest first
  const entries: Entry[] = [
    ...done.map((g): Entry => {
      const me = meIn(g);
      const st = standingOf(g);
      const top = topRows(st.rows).map((r) => r.id);
      const day = (g.finishedAt ?? g.createdAt).slice(0, 10);
      const others = g.players.filter((x) => x.id !== me.id).map((x) => x.name);
      return {
        kind: 'game',
        ref: g.id,
        head: formDef(g.form).name(),
        line: [dm(day), g.courseName, others.length ? tr(`with ${others.join(', ')}`, `mit ${others.join(', ')}`) : null].filter(Boolean).join(' · '),
        day,
        until: day,
        sym: prizeSym(prizeOf({ currency: String(g.settings.currency ?? 'EUR'), prize: g.prize })),
        mine: st.money?.[me.id] ?? 0,
        plus: Math.max(0, st.money?.[me.id] ?? 0),
        minus: Math.min(0, st.money?.[me.id] ?? 0),
        won: top.includes(me.id) || (top.length === 1 && top[0] === 'A'),
      };
    }),
    ...pools.map((e): Entry => {
      const lines = ledger(e.pool, today, true)[e.me] ?? [];
      return {
      kind: 'pool',
      ref: e.code,
      head: e.pool.name,
      line: [dm(e.pool.from), tr('Bets', 'Wetten'), isLive(e, today) ? tr('running', 'läuft') : tr('finished', 'beendet')].join(' · '),
      day: e.pool.from,
      until: e.pool.to,
      sym: prizeSym(prizeOf(e.pool)),
      mine: balances(e.pool, today, true)[e.me] ?? 0,
      plus: lines.filter((l) => l.amount > 0).reduce((n, l) => n + l.amount, 0),
      minus: lines.filter((l) => l.amount < 0).reduce((n, l) => n + l.amount, 0),
      won: false,
      };
    }),
  ].sort((a, b) => b.day.localeCompare(a.day));
  const wins = entries.filter((x) => x.won).length;
  // nothing won or lost yet: 0 in the one currency all games and bets are in (a $ pool only: "0 $")
  const syms = [...new Set(entries.map((x) => x.sym))];
  const zero = syms.length === 1 ? syms[0] : undefined;
  const FILTERS: Record<Exclude<BalanceFilter, null>, { title: string; keep: (x: Entry) => boolean }> = {
    games: { title: tr('Your games', 'Deine Spiele'), keep: (x) => x.kind === 'game' },
    wins: { title: tr('Your wins', 'Deine Siege'), keep: (x) => x.won },
    bets: { title: tr('Your bets', 'Deine Wetten'), keep: (x) => x.kind === 'pool' },
    won: { title: tr('Where you won', 'Wo du gewonnen hast'), keep: (x) => x.plus > 0.004 },
    lost: { title: tr('Where you lost', 'Wo du verloren hast'), keep: (x) => x.minus < -0.004 },
  };
  const shown = filter ? entries.filter(FILTERS[filter].keep) : [];
  const counts = Object.fromEntries(Object.entries(FILTERS).map(([k, v]) => [k, entries.filter(v.keep).length])) as Record<keyof typeof FILTERS, number>;
  // won and lost apart, the money their result (Sascha 03.11.2026: "tiles Gewinn and Verlust beside Geld") – each game
  // and each pool as it came out for me
  const gain: Record<string, number> = {};
  const loss: Record<string, number> = {};
  // another currency than the standard one (Sascha 12.11.2026): converted at the cut-off day's rate – kept as it is
  // while the rate is not known (offline, first time)
  const home = homeMoney();
  const conv = (sym: string, v: number, until: string): [string, number] => {
    const m = moneyOfSym(sym);
    if (!m || !home || m === home) return [sym, v];
    const c = convert(v, m, home, until);
    return c == null ? [sym, v] : [symOf(home), c];
  };
  const converted = home ? entries.filter((x) => { const m = moneyOfSym(x.sym); return !!m && m !== home; }) : [];
  const book = (sym0: string, v0: number, until = today) => {
    const [sym, v] = conv(sym0, v0, until);
    if (Math.abs(v) < 0.005) return;
    total[sym] = (total[sym] ?? 0) + v;
    if (v > 0) gain[sym] = (gain[sym] ?? 0) + v;
    else loss[sym] = (loss[sym] ?? 0) + v;
  };
  for (const e of entries) if (e.kind === 'game') book(e.sym, e.mine, e.until);
  // a pool: each bet on its own – won on "Gewinn", lost on "Verlust", both in "Bilanz" (Sascha 12.11.2026: "Verlust 30 $,
  // Gewinn 320 $ – and Geld renamed Bilanz, there the 290 are right")
  for (const e of entries) if (e.kind === 'pool') {
    book(e.sym, e.plus, e.until);
    book(e.sym, e.minus, e.until);
  }
  const owe = ps.filter((p) => Object.values(sums(p.items, (i) => i.open)).some((v) => v < -0.004));
  const owed = ps.filter((p) => Object.values(sums(p.items, (i) => i.open)).some((v) => v > 0.004));
  // paid by him, not confirmed by me yet – and paid by me, not confirmed by him
  const toConfirm = ps.flatMap((p) => p.items.flatMap((i) => waiting(i).filter((x) => x.from === i.him).map((x) => ({ p, i, x }))));
  const person = ps.find((p) => p.key === open) ?? null;
  // a game or pool of the sheet tapped: there – the sheet closes (Sascha 10.11.2026: click paths everywhere)
  const openItem = (x: Item): (() => void) | undefined => {
    const g = x.kind === 'game' ? done.find((y) => y.id === x.ref) : undefined;
    const to = x.kind === 'game' ? (g && props.onOpenGame ? () => props.onOpenGame!(g) : undefined) : props.onOpenPool ? () => props.onOpenPool!(x.ref) : undefined;
    return to && (() => {
      setOpen(null);
      to();
    });
  };
  const settleAll = async (p: Person, as: 'paid' | 'received') => {
    setBusy(true);
    for (const i of p.items.filter((x) => (as === 'paid' ? x.open < -0.004 : x.open > 0.004 || waiting(x).some((w) => w.from === x.him)))) await settle(i, as, p.name);
    setBusy(false);
    setTick((t) => t + 1);
  };
  const word = (p: Person, as: 'paid' | 'received') => {
    const things = p.items.some((i) => !isMoney(i.prize));
    return as === 'received' ? tr('Received', 'Erhalten') : things && p.items.every((i) => !isMoney(i.prize)) ? paidWord(p.items[0].prize) : tr('Paid', 'Bezahlt');
  };
  /** A pool of bets as its own card – on the page and under the tile "Wetten" alike (Sascha 06.11.2026: "under the
   *  tapped tile the same as when Bilanz opens"). */
  const poolCard = (e: (typeof pools)[number]) => {
    const mineItems = ps.flatMap((p) => p.items.filter((i) => i.kind === 'pool' && i.ref === e.code));
    const amount = sums(mineItems, (i) => i.amount);
    const left = sums(mineItems, (i) => i.open);
    const sym = prizeSym(prizeOf(e.pool));
    return (
      <section key={e.code} className="card balance-pool" aria-label={e.pool.name}>
        <button type="button" className="balance-pool-head" onClick={() => props.onOpenPool?.(e.code)} disabled={!props.onOpenPool}>
          <span className="grow">
            <span className="eyebrow">{tr('Bets', 'Wetten')}</span>
            <strong>{e.pool.name}</strong>
            <span className="muted small">
              {isLive(e, today) ? tr('running', 'läuft') : tr('finished', 'beendet')}
              {Object.keys(left).length > 0 && ' · '}
              {Object.keys(left).length > 0 && tr('open ', 'offen ')}
              {Object.keys(left).length > 0 && <Amounts m={left} plain zero={sym} />}
            </span>
          </span>
          <strong>
            <Amounts m={amount} zero={sym} />
          </strong>
          {props.onOpenPool && (
            <span className="muted" aria-hidden="true">
              ›
            </span>
          )}
        </button>
      </section>
    );
  };
  return (
    <section className="balance" aria-label={tr('Balance', 'Bilanz')}>
      {!props.inTab && <h2 className="balance-title">{tr('Balance', 'Bilanz')}</h2>}
      {unconfirmed > 0 && (
        <button type="button" className="notice balance-notice" onClick={() => props.onConfirm?.(toSign)} disabled={!props.onConfirm}>
          <span className="grow">
            {unconfirmed === 1
              ? tr('1 finished game is not confirmed yet – it counts once you confirm it.', '1 beendetes Spiel ist noch nicht bestätigt – es zählt, sobald du es bestätigst.')
              : tr(`${unconfirmed} finished games are not confirmed yet – they count once you confirm them.`, `${unconfirmed} beendete Spiele sind noch nicht bestätigt – sie zählen, sobald du sie bestätigst.`)}
            <strong className="balance-notice-go">{unconfirmed === 1 ? tr('Confirm now', 'Jetzt bestätigen') : tr('Show them', 'Anzeigen')}</strong>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      {(done.length > 0 || pools.length > 0) && (
        <section className="tile-row tile-row-3 balance-totals" aria-label={tr('Totals', 'Summen')}>
          <button type="button" className="tile" aria-pressed={filter === 'games'} disabled={!counts.games} onClick={() => pick('games')}>
            <span className="tile-head">
              <strong className="tile-num">{done.length}</strong>
              <span className="tile-mark">{TILE_ICONS.games}</span>
            </span>
            <span className="muted small">{tr('games', 'Spiele')}</span>
          </button>
          <button type="button" className="tile" aria-pressed={filter === 'wins'} disabled={!counts.wins} onClick={() => pick('wins')}>
            <span className="tile-head">
              <strong className="tile-num">{wins}</strong>
              <span className="tile-mark">{TILE_ICONS.wins}</span>
            </span>
            <span className="muted small">{tr('wins', 'Siege')}</span>
          </button>
          <button type="button" className="tile" aria-pressed={filter === 'bets'} disabled={!counts.bets} onClick={() => pick('bets')}>
            <span className="tile-head">
              <strong className="tile-num">{pools.length}</strong>
              <span className="tile-mark">{TILE_ICONS.bets}</span>
            </span>
            <span className="muted small">{tr('bets', 'Wetten')}</span>
          </button>
          <button type="button" className="tile" aria-pressed={filter === 'won'} disabled={!counts.won} onClick={() => pick('won')}>
            <span className="tile-head">
              <strong className="tile-num good-text"><Amounts m={gain} plain zero={zero} /></strong>
              <span className="tile-mark">{TILE_ICONS.won}</span>
            </span>
            <span className="muted small">{tr('won', 'Gewinn')}</span>
          </button>
          <button type="button" className="tile" aria-pressed={filter === 'lost'} disabled={!counts.lost} onClick={() => pick('lost')}>
            <span className="tile-head">
              <strong className="tile-num bad-text"><Amounts m={Object.fromEntries(Object.entries(loss).map(([k, v]) => [k, -v]))} plain zero={zero} /></strong>
              <span className="tile-mark">{TILE_ICONS.lost}</span>
            </span>
            <span className="muted small">{tr('lost', 'Verlust')}</span>
          </button>
          {/* the sum of all – counts only, a white mark as "Löcher" on the rounds page */}
          <div className="tile">
            <span className="tile-head">
              <strong className="tile-num"><Amounts m={total} zero={zero} /></strong>
              <span className="tile-mark">{TILE_ICONS.money}</span>
            </span>
            <span className="muted small">{tr('balance', 'Bilanz')}</span>
          </div>
        </section>
      )}
      {converted.length > 0 && <FxNote entries={converted} />}

      {/* a tile tapped: the games and bets behind it, each with what it came to for me – a tap opens it */}
      {filter === 'bets' && pools.map(poolCard)}
      {filter && filter !== 'bets' && (
        <section className="card" aria-label={FILTERS[filter].title}>
          <span className="eyebrow">{FILTERS[filter].title}</span>
          <ul className="balance-items balance-list">
            {shown.map((x) => {
              const g = x.kind === 'game' ? done.find((y) => y.id === x.ref) : undefined;
              const go = x.kind === 'game' ? (g && props.onOpenGame ? () => props.onOpenGame!(g) : undefined) : props.onOpenPool ? () => props.onOpenPool!(x.ref) : undefined;
              return (
                <li key={`${x.kind}:${x.ref}`}>
                  <button type="button" className="balance-entry" disabled={!go} onClick={go}>
                    <span className="grow">
                      <strong>{x.head}</strong>
                      <span className="muted small">{x.line}</span>
                    </span>
                    <span className="balance-item-end">
                      {/* "Gewinn" and "Verlust": that side of it; else what it came to */}
                      {(() => {
                        const v = filter === 'won' ? x.plus : filter === 'lost' ? x.minus : x.mine;
                        return <strong className={cls(v)}>{formatEuro(v, x.sym)}</strong>;
                      })()}
                      {x.won && <span className="small good-text">{tr('won', 'gewonnen')}</span>}
                    </span>
                    {go && (
                      <span className="muted" aria-hidden="true">
                        ›
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* what is still open – "Bezahlt" for what I owe, "Erhalten" for what I am owed (and booked out when given) */}
      {!filter && (owe.length > 0 || owed.length > 0 || toConfirm.length > 0) && (
        <section className="card balance-open" aria-label={tr('Open amounts', 'Offene Beträge')}>
          <span className="eyebrow">{tr('Open amounts', 'Offene Beträge')}</span>
          {toConfirm.length > 0 && (
            <ul className="pool-pays" aria-label={tr('To confirm', 'Zu bestätigen')}>
              {toConfirm.map(({ p, i, x }) => (
                <li key={x.id}>
                  <span className="grow">
                    {tr(`${p.name} marked ${money(x.amount, i.sym)} paid`, `${p.name} hat ${money(x.amount, i.sym)} als bezahlt markiert`)}
                    <span className="muted small paid-state">
                      {/* the game or pool it is for, tapped: there (Sascha 10.11.2026) */}
                      {openItem(i) ? (
                        <button type="button" className="link-text" onClick={openItem(i)}>
                          {i.title}
                        </button>
                      ) : (
                        i.title
                      )}{' '}
                      · {tr('got it?', 'erhalten?')}
                    </span>
                  </span>
                  <button type="button" className="chip paid-mark" disabled={busy} onClick={async () => {
                    setBusy(true);
                    await record(i, (ps2) => ps2.map((y) => (y.id === x.id ? { ...y, receivedAt: now() } : y)));
                    setBusy(false);
                    setTick((t) => t + 1);
                  }}>
                    {tr('Received', 'Erhalten')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {owe.length > 0 && (
            <>
              <span className="muted small">{tr('You owe', 'Du schuldest')}</span>
              <ul className="pool-pays" aria-label={tr('You owe', 'Du schuldest')}>
                {owe.map((p) => (
                  <li key={p.key}>
                    <button type="button" className="link-row grow" onClick={() => setOpen(p.key)}>
                      {p.name}
                    </button>
                    <strong className="bad-text">
                      <Amounts m={Object.fromEntries(Object.entries(sums(p.items, (i) => i.open)).filter(([, v]) => v < 0))} plain />
                    </strong>
                    <button type="button" className="chip paid-mark" disabled={busy} aria-label={tr(`Paid ${p.name}`, `${p.name} bezahlt`)} onClick={() => void settleAll(p, 'paid')}>
                      {word(p, 'paid')}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {owed.length > 0 && (
            <>
              <span className="muted small">{tr('Owed to you', 'Dir geschuldet')}</span>
              <ul className="pool-pays" aria-label={tr('Owed to you', 'Dir geschuldet')}>
                {owed.map((p) => (
                  <li key={p.key}>
                    <button type="button" className="link-row grow" onClick={() => setOpen(p.key)}>
                      {p.name}
                    </button>
                    <strong className="good-text">
                      <Amounts m={Object.fromEntries(Object.entries(sums(p.items, (i) => i.open)).filter(([, v]) => v > 0))} plain />
                    </strong>
                    <button type="button" className="chip paid-mark" disabled={busy} aria-label={tr(`Received from ${p.name}`, `Von ${p.name} erhalten`)} onClick={() => void settleAll(p, 'received')}>
                      {word(p, 'received')}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {!filter && ps.length > 0 && (
        <section className="card">
          <span className="eyebrow">{tr('Against your friends', 'Gegen deine Mitspieler')}</span>
          <ul className="game-pays balance-people">
            {ps.map((p) => (
              <li key={p.key}>
                <button type="button" className="balance-person" onClick={() => setOpen(p.key)} aria-label={tr(`${p.name} – the details`, `${p.name} – die Details`)}>
                  <span className="grow">
                    {p.name}{' '}
                    <span className="muted small">
                      {p.games > 0 && `· ${p.games} ${p.games === 1 ? tr('game', 'Spiel') : tr('games', 'Spiele')} · ${tr(`${p.won}× ahead · ${p.lost}× behind`, `${p.won}× vorne · ${p.lost}× hinten`)}`}
                      {p.items.some((i) => i.kind === 'pool') && ` · ${tr('bets', 'Wetten')}`}
                    </span>
                  </span>
                  <strong>
                    <Amounts m={sums(p.items, (i) => i.amount)} />
                  </strong>
                  <span className="muted" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* each pool of bets on its own (Sascha 03.11.2026: "two pools, not under one heading") */}
      {!filter && pools.map(poolCard)}

      {/* a payment (Sascha 12.11.2026: "+" in Bilanz): the round "+" bottom right – who you owe or who owes you, a tap
          opens him with "Bezahlt" and "Erhalten" */}
      {props.inTab && (owe.length > 0 || owed.length > 0) && <FloatActions plus={{ label: tr('Record a payment', 'Zahlung eintragen'), onClick: () => setPaying(true) }} />}
      {paying && (
        <div className="sheet-backdrop" onClick={() => setPaying(false)}>
          <section className="sheet" role="dialog" aria-label={tr('Record a payment', 'Zahlung eintragen')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{tr('Record a payment', 'Zahlung eintragen')}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setPaying(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <ul className="list pay-pick">
              {[...owe, ...owed.filter((p) => !owe.includes(p))].map((p) => {
                const open = sums(p.items, (i) => i.open);
                return (
                  <li key={p.key}>
                    <button
                      type="button"
                      className="list-item"
                      onClick={() => {
                        setPaying(false);
                        setOpen(p.key);
                      }}
                    >
                      <span className="grow">
                        <span className="title">{p.name}</span>
                        <span className="muted small">{Object.values(open).some((v) => v < -0.004) ? tr('you owe him', 'du schuldest ihm') : tr('owes you', 'schuldet dir')}</span>
                      </span>
                      <Amounts m={open} />
                      <span className="muted" aria-hidden="true">
                        ›
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
      {person && <PersonSheet p={person} busy={busy} onClose={() => setOpen(null)} onOpen={openItem} onSettle={(as) => void settleAll(person, as)} onUndo={async (i, x) => {
        setBusy(true);
        await record(i, (ps2) => (i.kind === 'game' ? ps2.map((y) => (y.id === x.id ? { ...y, undoneAt: now() } : y)) : ps2.filter((y) => y.id !== x.id)));
        setBusy(false);
        setTick((t) => t + 1);
      }} word={word} />}
    </section>
  );
}

/** A player tapped: each game and pool between us with what it came to and what is open, the payments, settling. */
function PersonSheet(props: { p: Person; busy: boolean; onClose: () => void; /** a game or pool tapped: there (Sascha 10.11.2026) */ onOpen?: (i: Item) => (() => void) | undefined; onSettle: (as: 'paid' | 'received') => void; onUndo: (i: Item, x: GamePayment) => void; word: (p: Person, as: 'paid' | 'received') => string }) {
  const { p } = props;
  const left = sums(p.items, (i) => i.open);
  const iOwe = Object.values(left).some((v) => v < -0.004);
  const heOwes = Object.values(left).some((v) => v > 0.004);
  const pays = p.items.flatMap((i) => i.payments.filter((x) => !x.undoneAt).map((x) => ({ i, x })));
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label={p.name} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{p.name}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {/* clearer (Sascha 03.11.2026: "this sheet has to show its contents more clearly"): each game or bet a block – its
            name, the day and course, the score; the amount and its state on the right; the payments below with their own state */}
        <span className="eyebrow">{tr('How it adds up', 'Wie es sich zusammensetzt')}</span>
        <ul className="balance-items" aria-label={tr('Games and bets', 'Spiele und Wetten')}>
          {p.items.map((i) => {
            const [head, ...rest] = i.title.split(' · ');
            const done = Math.abs(i.open) < 0.005;
            // a pool or game tapped: straight there (Sascha 10.11.2026: "tapping USA-Wetten should jump there")
            const go = props.onOpen?.(i);
            const Row = go ? 'button' : 'div';
            return (
              <li key={`${i.kind}:${i.ref}`}>
                <Row {...(go ? { type: 'button' as const, onClick: go, 'aria-label': tr(`Open ${head}`, `${head} öffnen`) } : {})} className="balance-item-row">
                <span className="grow">
                  <strong>{head}</strong>
                  <span className="muted small">{[dm(i.day), ...(rest.length ? rest : [i.kind === 'pool' ? tr('Bets', 'Wetten') : tr('Game', 'Spiel')])].join(' · ')}</span>
                  {i.detail && <span className="muted small">{i.detail}</span>}
                </span>
                <span className="balance-item-end">
                  <strong className={cls(i.amount)}>{formatEuro(i.amount, i.sym)}</strong>
                  {/* paid in green, not paid in red (Sascha 03.11.2026) */}
                  {done ? (
                    <span className="small good-text">{isMoney(i.prize) ? tr('paid', 'bezahlt') : tr('redeemed', 'eingelöst')}</span>
                  ) : (
                    <span className="small bad-text">
                      {Math.abs(i.open - i.amount) > 0.004 ? `${tr('open', 'offen')} ${money(Math.abs(i.open), i.sym)}` : isMoney(i.prize) ? tr('not paid', 'nicht bezahlt') : tr('not redeemed', 'nicht eingelöst')}
                    </span>
                  )}
                </span>
                {go && (
                  <span className="muted" aria-hidden="true">
                    ›
                  </span>
                )}
                </Row>
              </li>
            );
          })}
        </ul>
        <div className="balance-sum">
          <span>{tr('Together', 'Zusammen')}</span>
          <strong>
            <Amounts m={sums(p.items, (i) => i.amount)} />
          </strong>
        </div>
        {pays.length > 0 && (
          <>
            <span className="eyebrow">{tr('Payments', 'Zahlungen')}</span>
            <ul className="balance-items paid-list" aria-label={tr('Payments', 'Zahlungen')}>
              {pays.map(({ i, x }) => (
                <li key={x.id}>
                  <span className="grow">
                    <strong>{x.from === i.me ? tr(`You to ${p.name}`, `Du an ${p.name}`) : tr(`${p.name} to you`, `${p.name} an dich`)}</strong>
                    <span className="muted small">
                      {[x.paidAt ? dm(x.paidAt.slice(0, 10)) : x.receivedAt ? dm(x.receivedAt.slice(0, 10)) : null].filter(Boolean).join('')}
                      {(x.paidAt || x.receivedAt) && ' · '}
                      {props.onOpen?.(i) ? (
                        <button type="button" className="link-text" onClick={props.onOpen(i)}>
                          {i.title.split(' · ')[0]}
                        </button>
                      ) : (
                        i.title.split(' · ')[0]
                      )}
                    </span>
                    {x.receivedAt ? (
                      <span className="small good-text">{x.from === i.me ? tr(`Confirmed by ${p.name}`, `Von ${p.name} bestätigt`) : tr('Received', 'Erhalten')}</span>
                    ) : (
                      <span className="small warn-text">{x.from === i.me ? tr(`${p.name} has not confirmed yet`, `${p.name} bestätigt noch`) : tr('Please confirm', 'Bitte bestätigen')}</span>
                    )}
                  </span>
                  <span className="balance-item-end">
                    <strong>{money(x.amount, i.sym)}</strong>
                  </span>
                  <button type="button" className="icon-btn paid-undo" disabled={props.busy} aria-label={tr('Take back', 'Zurücknehmen')} onClick={() => props.onUndo(i, x)}>
                    ↺
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {iOwe && (
          <button type="button" className="btn-primary" disabled={props.busy} onClick={() => props.onSettle('paid')}>
            {`${props.word(p, 'paid')} – `}
            <Amounts m={Object.fromEntries(Object.entries(left).filter(([, v]) => v < 0))} plain />
          </button>
        )}
        {heOwes && (
          <button type="button" className="btn-secondary" disabled={props.busy} onClick={() => props.onSettle('received')}>
            {tr('Received – ', 'Erhalten – ')}
            <Amounts m={Object.fromEntries(Object.entries(left).filter(([, v]) => v > 0))} plain />
          </button>
        )}
        {!iOwe && !heOwes && (
          <p className="balance-done">
            <span aria-hidden="true">✓</span>
            {pays.some(({ i, x }) => !x.receivedAt && x.from === i.me) ? tr(`All paid – ${p.name} still confirms.`, `Alles bezahlt – ${p.name} bestätigt noch.`) : tr('All settled between you.', 'Zwischen euch ist alles erledigt.')}
          </p>
        )}
      </section>
    </div>
  );
}

/** Which rate the totals used (Sascha 12.11.2026): "1 $ = 0,86 € · Kurs vom 17.11." – a day to come: "heute, bis zum
 *  17.11. noch offen". Not known yet: "noch nicht umgerechnet". */
function FxNote(props: { entries: Entry[] }) {
  const home = homeMoney();
  if (!home) return null;
  const lines = [...new Map(props.entries.map((e) => [`${e.sym}|${e.until}`, e])).values()].map((e) => {
    const m = moneyOfSym(e.sym)!;
    const r = rateKept(m, home, e.until);
    const fmt = (x: number) => x.toLocaleString(getLang() === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    const d = `${e.until.slice(8, 10)}.${e.until.slice(5, 7)}.`;
    if (r == null) return tr(`${e.head}: not converted yet (no rate)`, `${e.head}: noch nicht umgerechnet (kein Kurs)`);
    return rateFinal(m, home, e.until)
      ? tr(`${e.head}: 1 ${e.sym} = ${fmt(r)} ${symOf(home)} · rate of ${d}`, `${e.head}: 1 ${e.sym} = ${fmt(r)} ${symOf(home)} · Kurs vom ${d}`)
      : tr(`${e.head}: 1 ${e.sym} ≈ ${fmt(r)} ${symOf(home)} · today's rate, final on ${d}`, `${e.head}: 1 ${e.sym} ≈ ${fmt(r)} ${symOf(home)} · heutiger Kurs, fest am ${d}`);
  });
  return (
    <p className="muted small fx-note" role="note">
      {tr(`In ${symOf(home)} (your standard currency): `, `In ${symOf(home)} (deine Standardwährung): `)}
      {lines.join(' · ')}
    </p>
  );
}
