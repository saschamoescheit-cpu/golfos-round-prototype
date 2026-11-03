import { useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { formatEuro, money, standingOf, type Game } from '../lib/gameforms';
import { dm, meIn, people, sums, topRows, waiting, type GamePayment, type Item, type Person } from '../lib/gamepay';
import { loadGames, saveGame } from '../lib/gamestore';
import { exchange } from '../lib/sharedgame';
import { newId } from '../lib/storage';
import { changePool, isLive, loadPools } from '../lib/wagerstore';
import { dayOf } from '../lib/wagers';
import { isMoney, paidWord } from '../lib/prize';
import { pushPaid } from '../lib/push';
import { usePools } from './Wagers';
import { loadProfile, shownName } from '../lib/profile';

// The menu "Bilanz" (Sascha 03.11.2026): what I won and lost, against each player – which games and bets make it up –,
// what is still open, "Bezahlt" when I paid, "Erhalten" when I got it (the other confirms what the one marked), and
// each pool of bets on its own.

const cls = (v: number) => (v > 0.004 ? 'good-text' : v < -0.004 ? 'bad-text' : 'muted');
/** "+12 € · −5 $ · +2 × Getränk" – one amount per currency or thing. */
function Amounts(props: { m: Record<string, number>; plain?: boolean }) {
  const parts = Object.entries(props.m).filter(([, v]) => Math.abs(v) > 0.004);
  if (!parts.length) return <span className="muted">{money(0, '€')}</span>;
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

export function Balance(props: { games: Game[]; inTab?: boolean; onOpenPool?: (code: string) => void }) {
  usePools(); // read again when a pool changes
  const [, setTick] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = dayOf(new Date());
  const pools = loadPools().filter((e) => !e.pool.deletedAt && e.me && e.pool.players.some((p) => p.id === e.me));
  const done = props.games.filter((g) => g.finishedAt && g.signedAt);
  const unconfirmed = props.games.filter((g) => g.finishedAt && !g.signedAt).length;
  const ps = people(props.games, pools, today);
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
  if (!done.length && !unconfirmed && !pools.length) return props.inTab ? <p className="muted">{tr('No confirmed games or bets yet – they show here once played.', 'Noch keine bestätigten Spiele oder Wetten – sie erscheinen hier, sobald gespielt.')}</p> : null;

  let wins = 0;
  const total: Record<string, number> = {};
  for (const g of done) {
    const me = meIn(g);
    const st = standingOf(g);
    const top = topRows(st.rows).map((r) => r.id);
    if (top.includes(me.id) || (top.length === 1 && top[0] === 'A')) wins++;
  }
  for (const p of ps) for (const i of p.items.filter((x) => x.kind === 'game')) total[i.sym] = (total[i.sym] ?? 0) + i.amount;
  const owe = ps.filter((p) => Object.values(sums(p.items, (i) => i.open)).some((v) => v < -0.004));
  const owed = ps.filter((p) => Object.values(sums(p.items, (i) => i.open)).some((v) => v > 0.004));
  // paid by him, not confirmed by me yet – and paid by me, not confirmed by him
  const toConfirm = ps.flatMap((p) => p.items.flatMap((i) => waiting(i).filter((x) => x.from === i.him).map((x) => ({ p, i, x }))));
  const person = ps.find((p) => p.key === open) ?? null;
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
  return (
    <section className="balance" aria-label={tr('Balance', 'Bilanz')}>
      {!props.inTab && <h2 className="balance-title">{tr('Balance', 'Bilanz')}</h2>}
      {unconfirmed > 0 && (
        <p className="notice" style={{ margin: 0 }}>
          {tr(
            `${unconfirmed} finished ${unconfirmed === 1 ? 'game is' : 'games are'} not confirmed yet – they count once you confirm the result.`,
            `${unconfirmed} beendete${unconfirmed === 1 ? 's Spiel ist' : ' Spiele sind'} noch nicht bestätigt – sie zählen, sobald du das Ergebnis bestätigst.`,
          )}
        </p>
      )}
      {done.length > 0 && (
        <section className="card balance-totals">
          <div>
            <strong>{done.length}</strong>
            <span className="muted small">{tr('games', 'Spiele')}</span>
          </div>
          <div>
            <strong>{wins}</strong>
            <span className="muted small">{tr('wins', 'Siege')}</span>
          </div>
          <div>
            <strong>
              <Amounts m={total} />
            </strong>
            <span className="muted small">{tr('money', 'Geld')}</span>
          </div>
        </section>
      )}

      {/* what is still open – "Bezahlt" for what I owe, "Erhalten" for what I am owed (and booked out when given) */}
      {(owe.length > 0 || owed.length > 0 || toConfirm.length > 0) && (
        <section className="card balance-open" aria-label={tr('Open amounts', 'Offene Beträge')}>
          <span className="eyebrow">{tr('Open amounts', 'Offene Beträge')}</span>
          {toConfirm.length > 0 && (
            <ul className="pool-pays" aria-label={tr('To confirm', 'Zu bestätigen')}>
              {toConfirm.map(({ p, i, x }) => (
                <li key={x.id}>
                  <span className="grow">
                    {tr(`${p.name} marked ${money(x.amount, i.sym)} paid`, `${p.name} hat ${money(x.amount, i.sym)} als bezahlt markiert`)}
                    <span className="muted small paid-state">
                      {i.title} · {tr('got it?', 'erhalten?')}
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

      {ps.length > 0 && (
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
      {pools.map((e) => {
        const mineItems = ps.flatMap((p) => p.items.filter((i) => i.kind === 'pool' && i.ref === e.code));
        const amount = sums(mineItems, (i) => i.amount);
        const left = sums(mineItems, (i) => i.open);
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
                  {Object.keys(left).length > 0 && <Amounts m={left} plain />}
                </span>
              </span>
              <strong>
                <Amounts m={amount} />
              </strong>
              {props.onOpenPool && (
                <span className="muted" aria-hidden="true">
                  ›
                </span>
              )}
            </button>
          </section>
        );
      })}

      {person && <PersonSheet p={person} busy={busy} onClose={() => setOpen(null)} onSettle={(as) => void settleAll(person, as)} onUndo={async (i, x) => {
        setBusy(true);
        await record(i, (ps2) => (i.kind === 'game' ? ps2.map((y) => (y.id === x.id ? { ...y, undoneAt: now() } : y)) : ps2.filter((y) => y.id !== x.id)));
        setBusy(false);
        setTick((t) => t + 1);
      }} word={word} />}
    </section>
  );
}

/** A player tapped: each game and pool between us with what it came to and what is open, the payments, settling. */
function PersonSheet(props: { p: Person; busy: boolean; onClose: () => void; onSettle: (as: 'paid' | 'received') => void; onUndo: (i: Item, x: GamePayment) => void; word: (p: Person, as: 'paid' | 'received') => string }) {
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
        <span className="eyebrow">{tr('How it adds up', 'Wie es sich zusammensetzt')}</span>
        <ul className="pool-pays balance-items" aria-label={tr('Games and bets', 'Spiele und Wetten')}>
          {p.items.map((i) => (
            <li key={`${i.kind}:${i.ref}`}>
              <span className="grow">
                {dm(i.day)} · {i.title}
                <span className="muted small paid-state">
                  {i.detail ?? (i.kind === 'pool' ? tr('Bets', 'Wetten') : tr('Game', 'Spiel'))}
                  {Math.abs(i.open) < 0.005 ? ` · ${tr('settled', 'erledigt')}` : Math.abs(i.open - i.amount) > 0.004 ? ` · ${tr('open', 'offen')} ${money(Math.abs(i.open), i.sym)}` : ''}
                </span>
              </span>
              <strong className={cls(i.amount)}>{formatEuro(i.amount, i.sym)}</strong>
            </li>
          ))}
        </ul>
        <div className="balance-sum">
          <span>{tr('Together', 'Zusammen')}</span>
          <strong>
            <Amounts m={sums(p.items, (i) => i.amount)} />
          </strong>
        </div>
        {pays.length > 0 && (
          <>
            <span className="eyebrow">{tr('Paid', 'Bezahlt')}</span>
            <ul className="pool-pays paid-list">
              {pays.map(({ i, x }) => (
                <li key={x.id}>
                  <span className="grow">
                    {x.from === i.me ? tr(`You to ${p.name}`, `Du an ${p.name}`) : tr(`${p.name} to you`, `${p.name} an dich`)}
                    <span className="muted small paid-state">
                      {i.title} · {x.receivedAt ? `${tr('received', 'erhalten')} ${dm(x.receivedAt.slice(0, 10))}` : `${tr('paid', 'bezahlt')} ${x.paidAt ? dm(x.paidAt.slice(0, 10)) : ''} – ${x.from === i.me ? tr(`${p.name} has not confirmed yet`, `${p.name} bestätigt noch`) : tr('confirm it', 'bitte bestätigen')}`}
                    </span>
                  </span>
                  <strong className={x.receivedAt ? 'good-text' : undefined}>{money(x.amount, i.sym)}</strong>
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
        {!iOwe && !heOwes && <span className="muted small">{tr('All settled between you.', 'Zwischen euch ist alles erledigt.')}</span>}
      </section>
    </div>
  );
}
