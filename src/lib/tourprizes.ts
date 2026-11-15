import { tr } from './i18n';
import { isNone, type Prize } from './prize';
import { specialName, type Special } from './specials';

// Prizes of a tournament (Sascha 14.11.2026, mock-ups "Turnier-Preise": "Bei Turnieren … könnte man auch Preise
// hinterlegen, z. B. dass der Gewinner netto oder brutto 50 Dollar gewinnt" – "setze es so um"): not through the bets –
// a row "Worum" in the tournament. What is played for as in Games (money, drinks, a meal … or for the honour), an
// optional entry fee per player into one pot that one player collects, an amount per place (gross, net – per net class –
// and the special prizes Long Drive / Nearest to the Pin). A tie shares the places it covers; one who wins gross is
// passed over in net (unless "both"). Settled through the collector: each pays him or gets from him the difference of
// his prizes and his fee – nobody sends 20 $ one way and 50 $ back.

export interface TourPrizes {
  prize: Prize;
  /** the entry fee per player – 0/absent: none (the host pays the prizes) */
  fee?: number;
  /** who collects the fees and pays the prizes out – a player's name; absent: the first player (the host) */
  collector?: string;
  /** amount per place: 'gross1' … 'gross3', 'net1' … 'net3' (with classes 'net1:A'), 'sp:<special id>' */
  amounts: Record<string, number>;
  /** a player winning gross and net: 'gross' – only the gross prize, net goes to the next (the usual way); 'both' */
  double?: 'gross' | 'both';
  /** a payment marked paid by the host: `${from}>${to}` (names as keyed) → when */
  paid?: Record<string, string>;
}

export const PLACES = [1, 2, 3] as const;
export const keyName = (s: string): string => s.trim().toLowerCase();

/** The places a prize can be set for – gross 1–3, net 1–3 (per class), the special prizes. */
export function prizeSlots(o: { net: boolean; classes: string[]; specials: Special[]; holeName?: (i: number) => string }): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const nth = (p: number, what: string) => (p === 1 ? tr(`Winner ${what}`, `Sieger ${what}`) : tr(`${p}. place ${what}`, `${p}. Platz ${what}`));
  for (const p of PLACES) out.push({ id: `gross${p}`, label: nth(p, tr('gross', 'brutto')) });
  if (o.net) {
    if (o.classes.length) for (const c of o.classes) for (const p of PLACES) out.push({ id: `net${p}:${c}`, label: `${nth(p, tr('net', 'netto'))} · ${tr(`class ${c}`, `Klasse ${c}`)}` });
    else for (const p of PLACES) out.push({ id: `net${p}`, label: nth(p, tr('net', 'netto')) });
  }
  for (const s of o.specials) out.push({ id: `sp:${s.id}`, label: `${specialName(s.kind)}${o.holeName ? ` · ${tr(`hole ${o.holeName(s.hole)}`, `Loch ${o.holeName(s.hole)}`)}` : ''}` });
  return out;
}

/** Something to pay or win: a prize kind other than "for the honour" and some amount set. */
export const hasPrizes = (tp: TourPrizes | null | undefined): tp is TourPrizes => !!tp && !isNone(tp.prize) && (Object.values(tp.amounts ?? {}).some((v) => v > 0) || (tp.fee ?? 0) > 0);

/** The prizes added up. */
export const prizeSum = (tp: TourPrizes): number => Object.values(tp.amounts ?? {}).reduce((s, v) => s + (v > 0 ? v : 0), 0);

/** A standing's row as the ranking needs it (sharedround's Standing). */
export interface RankRow {
  name: string;
  /** "1", "T2", "–" */
  pos: string;
  sort: number | null;
  cls?: string;
}
/** A special prize's leader. */
export interface SpecialLead {
  special: Special;
  name: string | null;
}

export interface Award {
  slot: string;
  label: string;
  /** the winner(s) – a tie shares, each his share */
  winners: { name: string; amount: number }[];
}

const cents = (v: number) => Math.round(v * 100) / 100;

/** The places 1–3 of a standing, ties sharing the amounts of the places they cover; `skip`: names passed over (won
 *  gross already). */
function placeAwards(rows: RankRow[], slot: (p: number) => string, amounts: Record<string, number>, label: (p: number) => string, skip: Set<string>): Award[] {
  const ranked = rows.filter((r) => r.sort != null && r.pos !== '–' && !skip.has(keyName(r.name)));
  // groups of equal place (same pos), in order
  const groups: RankRow[][] = [];
  for (const r of ranked) {
    const last = groups[groups.length - 1];
    if (last && last[0].pos === r.pos) last.push(r);
    else groups.push([r]);
  }
  const out: Award[] = [];
  let place = 1;
  for (const g of groups) {
    if (place > PLACES.length) break;
    const covered = Array.from({ length: g.length }, (_, k) => place + k).filter((p) => p <= PLACES.length);
    const total = covered.reduce((s, p) => s + (amounts[slot(p)] ?? 0), 0);
    if (total > 0) {
      const each = cents(total / g.length);
      out.push({ slot: slot(place), label: label(place), winners: g.map((r) => ({ name: r.name, amount: each })) });
    }
    place += g.length;
  }
  return out;
}

/** Who wins what: gross, net (per class), the special prizes. */
export function prizeAwards(tp: TourPrizes, o: { gross: RankRow[]; net?: RankRow[] | null; classes?: string[]; specials?: SpecialLead[] }): Award[] {
  if (!hasPrizes(tp)) return [];
  const a = tp.amounts ?? {};
  const nth = (p: number, what: string) => (p === 1 ? tr(`Winner ${what}`, `Sieger ${what}`) : tr(`${p}. place ${what}`, `${p}. Platz ${what}`));
  const out = placeAwards(o.gross, (p) => `gross${p}`, a, (p) => nth(p, tr('gross', 'brutto')), new Set());
  const grossWon = new Set(out.flatMap((x) => x.winners.map((w) => keyName(w.name))));
  const skip = (tp.double ?? 'gross') === 'gross' ? grossWon : new Set<string>();
  if (o.net) {
    const classes = o.classes ?? [];
    if (classes.length)
      for (const c of classes)
        out.push(...placeAwards(o.net.filter((r) => r.cls === c), (p) => `net${p}:${c}`, a, (p) => `${nth(p, tr('net', 'netto'))} · ${tr(`class ${c}`, `Klasse ${c}`)}`, skip));
    else out.push(...placeAwards(o.net, (p) => `net${p}`, a, (p) => nth(p, tr('net', 'netto')), skip));
  }
  for (const s of o.specials ?? []) {
    const v = a[`sp:${s.special.id}`] ?? 0;
    if (v > 0 && s.name) out.push({ slot: `sp:${s.special.id}`, label: specialName(s.special.kind), winners: [{ name: s.name, amount: v }] });
  }
  return out;
}

/** Each name's prizes added up. */
export function wonBy(awards: Award[]): Map<string, { name: string; amount: number }> {
  const m = new Map<string, { name: string; amount: number }>();
  for (const a of awards)
    for (const w of a.winners) {
      const k = keyName(w.name);
      const cur = m.get(k);
      m.set(k, { name: cur?.name ?? w.name, amount: cents((cur?.amount ?? 0) + w.amount) });
    }
  return m;
}

export interface PrizeTransfer {
  from: string;
  to: string;
  amount: number;
  /** what it is made of: "Brutto-Sieg 50 $ − Startgeld 20 $" is put together by the screen from these */
  won: number;
  fee: number;
  key: string;
}

/** Settled through the collector: each player's prizes less his fee – who is short pays the collector, who is ahead gets
 *  it from him. `players`: every player of the field (names). */
export function prizeSettle(tp: TourPrizes, players: string[], awards: Award[]): { balance: Map<string, { name: string; net: number }>; transfers: PrizeTransfer[]; collector: string } {
  const fee = tp.fee ?? 0;
  const names = [...new Map(players.filter((n) => n.trim()).map((n) => [keyName(n), n])).values()];
  const won = wonBy(awards);
  for (const w of won.values()) if (!names.some((n) => keyName(n) === keyName(w.name))) names.push(w.name);
  const collector = names.find((n) => keyName(n) === keyName(tp.collector ?? '')) ?? names[0] ?? '';
  const balance = new Map<string, { name: string; net: number }>();
  const feePayers = names.filter((n) => players.some((p) => keyName(p) === keyName(n))).length;
  const totalWon = [...won.values()].reduce((s, w) => s + w.amount, 0);
  for (const n of names) {
    const k = keyName(n);
    const isPlayer = players.some((p) => keyName(p) === k);
    let net = (won.get(k)?.amount ?? 0) - (isPlayer ? fee : 0);
    if (k === keyName(collector)) net += fee * feePayers - totalWon;
    balance.set(k, { name: n, net: cents(net) });
  }
  const transfers: PrizeTransfer[] = [];
  for (const n of names) {
    const k = keyName(n);
    if (k === keyName(collector)) continue;
    const net = balance.get(k)!.net;
    if (Math.abs(net) < 0.005) continue;
    const isPlayer = players.some((p) => keyName(p) === k);
    const t = net < 0 ? { from: n, to: collector, amount: cents(-net) } : { from: collector, to: n, amount: cents(net) };
    transfers.push({ ...t, won: won.get(k)?.amount ?? 0, fee: isPlayer ? fee : 0, key: `${keyName(t.from)}>${keyName(t.to)}` });
  }
  return { balance, transfers, collector };
}

/** Several balances added up – a series' day prizes and its own (Sascha 15.11.2026: "Eine Abrechnung am Ende"): what
 *  each one has to get (+) or to pay (−) over all of them. */
export function addBalances(...bs: Map<string, { name: string; net: number }>[]): Map<string, { name: string; net: number }> {
  const out = new Map<string, { name: string; net: number }>();
  for (const b of bs)
    for (const [k, v] of b) {
      const cur = out.get(k);
      out.set(k, { name: cur?.name ?? v.name, net: cents((cur?.net ?? 0) + v.net) });
    }
  return out;
}

/** The fewest payments for the balances: the one who owes most pays the one who gets most, and so on – nobody sends
 *  money one way for a tournament and back for the series. */
export function settleBalances(b: Map<string, { name: string; net: number }>): { from: string; to: string; amount: number; key: string }[] {
  const owe = [...b.values()].filter((x) => x.net < -0.005).map((x) => ({ ...x, left: -x.net })).sort((a, c) => c.left - a.left || a.name.localeCompare(c.name));
  const get = [...b.values()].filter((x) => x.net > 0.005).map((x) => ({ ...x, left: x.net })).sort((a, c) => c.left - a.left || a.name.localeCompare(c.name));
  const out: { from: string; to: string; amount: number; key: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < owe.length && j < get.length) {
    const v = cents(Math.min(owe[i].left, get[j].left));
    if (v > 0) out.push({ from: owe[i].name, to: get[j].name, amount: v, key: `${keyName(owe[i].name)}>${keyName(get[j].name)}` });
    owe[i].left = cents(owe[i].left - v);
    get[j].left = cents(get[j].left - v);
    if (owe[i].left < 0.005) i++;
    if (get[j].left < 0.005) j++;
  }
  return out;
}
