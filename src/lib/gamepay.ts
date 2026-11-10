import { tr } from './i18n';
import { formDef, standingOf, transfers, type Game } from './gameforms';
import { balances, openPoolTransfers, owings, poolTransfers, settleDebts, type Payment, type WagerPool } from './wagers';
import { isNone, prizeOf, prizeSym, whoOf, type Prize } from './prize';

// The balance against each player, and what is paid (Sascha 03.11.2026: "in the balance the details – which games, how
// they stood, how the −35 € add up; mark that I paid Cedric, he gets told and confirms; an overview of what I am still
// owed, and booking it out when someone gave me the money"). A game's money is settled pair by pair (as the game result: gameTransfers); a
// pool's by its transfers. A payment is kept in the game (shared with its phones) or in the pool.

/** A payment in a game: as a pool's, and taken back with a mark (two phones merge their copies – a removed one would
 *  come back from the other). */
export type GamePayment = Payment & { undoneAt?: string };

export const livePayments = <T extends GamePayment>(ps: T[] | undefined): T[] => (ps ?? []).filter((p) => !p.undoneAt);

/** Both phones' payments of a game in one: every payment once, what either side marked (paid, received, taken back). */
export function mergePayments(a: GamePayment[] | undefined, b: GamePayment[] | undefined): GamePayment[] | undefined {
  if (!a?.length && !b?.length) return a ?? b;
  const out = new Map<string, GamePayment>();
  for (const p of [...(a ?? []), ...(b ?? [])]) {
    const q = out.get(p.id);
    out.set(p.id, q ? { ...q, paidAt: q.paidAt ?? p.paidAt, receivedAt: q.receivedAt ?? p.receivedAt, undoneAt: q.undoneAt ?? p.undoneAt } : p);
  }
  return [...out.values()].map((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as GamePayment);
}

/** One thing between this account and another player: a game or a pool – what it came to, and what is still open. */
export interface Item {
  kind: 'game' | 'pool';
  /** the game's id or the pool's code */
  ref: string;
  /** "Skins · Hetzenhof", the pool's name */
  title: string;
  /** YYYY-MM-DD */
  day: string;
  sym: string;
  prize: Prize;
  /** what it came to between the two: + he owes me, − I owe him (a pool: its transfer between the two) */
  amount: number;
  /** still open after the payments: + he owes me, − I owe him */
  open: number;
  /** the ids in the game or the pool: mine, his */
  me: string;
  him: string;
  /** how it stood between the two: "Sascha 0 Skins – Cedric 6 Skins" (a pool: none) */
  detail?: string;
  /** the payments between the two in it */
  payments: GamePayment[];
}

export interface Person {
  key: string;
  name: string;
  items: Item[];
  games: number;
  won: number;
  lost: number;
}

const keyOf = (name: string) => name.trim().toLowerCase();
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Everyone on top – as the game's result (a team wins together); none when all stand equal. */
export const topRows = <R extends { points: number }>(rows: R[]): R[] => {
  if (!rows.length) return [];
  const top = rows.filter((r) => r.points === rows[0].points);
  return rows.length > 1 && top.length === rows.length ? [] : top;
};

/** My player in a game: the one chosen on joining, else the first (the phone that set it up). */
export const meIn = (g: Game) => g.players.find((p) => p.id === g.shared?.me) ?? g.players[0];

/** Every other player I played or bet with: the confirmed games and the pools, each with what it came to. */
/** What a game is played for – a game from before: money in its currency. */
export const gamePrize = (g: Game): Prize => prizeOf({ prize: g.prize, currency: g.settings.currency as string });
/** Who gives whom what (Sascha 03.11.2026): money and things counted pair by pair as before; a thing "the loser for all" –
 *  the last (all when tied) one to each of the others; "for the winner" – to the first; without a stake nothing. */
export function gameTransfers(g: Game, m: Record<string, number> | undefined): { from: string; to: string; amount: number }[] {
  const p = gamePrize(g);
  if (!m || isNone(p)) return [];
  const who = whoOf(p);
  if (who === 'each') return transfers(m);
  const v = (id: string) => m[id] ?? 0;
  const lo = Math.min(...g.players.map((x) => v(x.id)));
  const hi = Math.max(...g.players.map((x) => v(x.id)));
  if (hi - lo < 0.001) return [];
  const losers = g.players.filter((x) => Math.abs(v(x.id) - lo) < 0.001);
  const to = who === 'loserAll' ? g.players.filter((x) => !losers.includes(x)) : g.players.filter((x) => Math.abs(v(x.id) - hi) < 0.001);
  return losers.flatMap((l) => to.map((o) => ({ from: l.id, to: o.id, amount: 1 })));
}

export function people(games: Game[], pools: { code: string; me: string; pool: WagerPool }[], today: string): Person[] {
  const map = new Map<string, Person>();
  const person = (name: string) => {
    const k = keyOf(name);
    const p = map.get(k) ?? { key: k, name: name.trim(), items: [], games: 0, won: 0, lost: 0 };
    map.set(k, p);
    return p;
  };
  for (const g of games.filter((x) => x.finishedAt && x.signedAt)) {
    const me = meIn(g);
    const st = standingOf(g);
    const prize = gamePrize(g);
    // what the game result says – who gives whom (Sascha 03.11.2026: the Bilanz as the result)
    const ts = st.money ? gameTransfers(g, st.money) : [];
    for (const o of g.players.filter((x) => x.id !== me.id)) {
      const p = person(o.name);
      p.games++;
      const mine = st.rows.find((r) => r.id === me.id)?.points;
      const his = st.rows.find((r) => r.id === o.id)?.points;
      if (mine != null && his != null && mine !== his) {
        if (mine > his) p.won++;
        else p.lost++;
      }
      if (!st.money) continue;
      const amount = round2(ts.reduce((s, t) => s + (t.from === o.id && t.to === me.id ? t.amount : t.from === me.id && t.to === o.id ? -t.amount : 0), 0));
      const pays = livePayments(g.payments).filter((x) => (x.from === me.id && x.to === o.id) || (x.from === o.id && x.to === me.id));
      const open = round2(amount - pays.reduce((s, x) => s + (x.from === o.id ? x.amount : -x.amount), 0));
      if (Math.abs(amount) < 0.005 && !pays.length) continue;
      const shown = (id: string) => st.rows.find((x) => x.id === id);
      const detail = shown(me.id) && shown(o.id) ? `${me.name} ${shown(me.id)!.value} – ${o.name} ${shown(o.id)!.value}` : undefined;
      p.items.push({ kind: 'game', ref: g.id, ...(detail ? { detail } : {}), title: `${formDef(g.form).name()} · ${g.courseName}`, day: (g.finishedAt ?? g.createdAt).slice(0, 10), sym: prizeSym(prize), prize, amount, open, me: me.id, him: o.id, payments: pays });
    }
  }
  for (const e of pools) {
    const pool = e.pool;
    if (pool.deletedAt) continue;
    const prize = prizeOf(pool);
    const bal = balances(pool, today, true);
    const debts = settleDebts(pool, owings(pool, today, true));
    const all = poolTransfers(pool, bal, debts);
    const open = openPoolTransfers(pool, bal, debts);
    for (const o of pool.players.filter((x) => x.id !== e.me)) {
      const between = (ts: { from: string; to: string; amount: number }[]) => ts.reduce((s, t) => s + (t.from === o.id && t.to === e.me ? t.amount : t.from === e.me && t.to === o.id ? -t.amount : 0), 0);
      const pays = (pool.payments ?? []).filter((x) => (x.from === e.me && x.to === o.id) || (x.from === o.id && x.to === e.me));
      const amount = round2(between(all));
      const left = round2(between(open));
      if (Math.abs(amount) < 0.005 && Math.abs(left) < 0.005 && !pays.length) continue;
      person(o.name).items.push({ kind: 'pool', ref: e.code, title: pool.name, day: pool.from, sym: prizeSym(prize), prize, amount, open: left, me: e.me, him: o.id, payments: pays });
    }
  }
  return [...map.values()].filter((p) => p.games || p.items.length).sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}

/** The sums per currency or thing ("€", "$", "× Getränk"): + owed to me, − I owe. */
export function sums(items: Item[], pick: (i: Item) => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[i.sym] = round2((out[i.sym] ?? 0) + pick(i));
  return Object.fromEntries(Object.entries(out).filter(([, v]) => Math.abs(v) > 0.004));
}

/** Paid but not confirmed by the receiver yet – the line "Cedric bestätigt noch". */
export const waiting = (i: Item): GamePayment[] => i.payments.filter((p) => !p.receivedAt && !p.undoneAt);

/** The words of an item's date: "03.11." */
export const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

export const noteOf = (i: Item): string => (i.kind === 'pool' ? tr('bets', 'Wetten') : tr('game', 'Spiel'));
