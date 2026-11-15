import { describe, expect, it } from 'vitest';
import { addBalances, settleBalances, hasPrizes, prizeAwards, prizeSettle, prizeSlots, prizeSum, wonBy, type RankRow, type TourPrizes } from './tourprizes';

// The mock-ups' example (Sascha 14.11.2026, "Turnier-Preise"): Orlando Invitational, 4 players, 20 $ entry fee, Sascha
// collects; gross winner 50 $, net winner 30 $, Long Drive 10 $, Nearest to the Pin 10 $.
const tp: TourPrizes = {
  prize: { kind: 'money', currency: 'USD' },
  fee: 20,
  collector: 'Sascha',
  amounts: { gross1: 50, net1: 30, 'sp:ld': 10, 'sp:np': 10 },
};
const gross: RankRow[] = [
  { name: 'Cedric', pos: '1', sort: 6 },
  { name: 'Sascha', pos: '2', sort: 9 },
  { name: 'Chris', pos: '3', sort: 12 },
  { name: 'Erik', pos: '4', sort: 16 },
];
const net: RankRow[] = [
  { name: 'Cedric', pos: '1', sort: -8 },
  { name: 'Erik', pos: '2', sort: -6 },
  { name: 'Sascha', pos: '3', sort: -1 },
  { name: 'Chris', pos: '4', sort: 0 },
];
const specials = [
  { special: { id: 'ld', kind: 'longDrive' as const, hole: 8 }, name: 'Chris' },
  { special: { id: 'np', kind: 'nearestPin' as const, hole: 2 }, name: 'Sascha' },
];

describe('tournament prizes', () => {
  it('the gross winner is passed over in net – net goes to the next', () => {
    const a = prizeAwards(tp, { gross, net, specials });
    expect(a.map((x) => [x.slot, x.winners.map((w) => `${w.name} ${w.amount}`).join()])).toEqual([
      ['gross1', 'Cedric 50'],
      ['net1', 'Erik 30'],
      ['sp:ld', 'Chris 10'],
      ['sp:np', 'Sascha 10'],
    ]);
  });
  it('"both": the gross winner wins net too', () => {
    const a = prizeAwards({ ...tp, double: 'both' }, { gross, net, specials });
    expect(a.find((x) => x.slot === 'net1')?.winners[0].name).toBe('Cedric');
  });
  it('settled through the collector as in the mock-up: Sascha −30, Cedric +30, Erik +10, Chris −10', () => {
    const a = prizeAwards(tp, { gross, net, specials });
    const s = prizeSettle(tp, ['Sascha', 'Chris', 'Cedric', 'Erik'], a);
    expect(Object.fromEntries([...s.balance.values()].map((b) => [b.name, b.net]))).toEqual({ Sascha: -30, Chris: -10, Cedric: 30, Erik: 10 });
    expect(s.transfers.map((t) => `${t.from}>${t.to} ${t.amount}`)).toEqual(['Sascha>Chris 0'].filter(() => false).concat(['Chris>Sascha 10', 'Sascha>Cedric 30', 'Sascha>Erik 10']));
    // the balances add up to nothing
    expect([...s.balance.values()].reduce((x, b) => x + b.net, 0)).toBeCloseTo(0);
  });
  it('a tie shares the places it covers', () => {
    const t = { ...tp, amounts: { gross1: 50, gross2: 20 } };
    const a = prizeAwards(t, { gross: [{ name: 'A', pos: 'T1', sort: 5 }, { name: 'B', pos: 'T1', sort: 5 }, { name: 'C', pos: '3', sort: 7 }] });
    expect(a).toEqual([{ slot: 'gross1', label: 'Winner gross', winners: [{ name: 'A', amount: 35 }, { name: 'B', amount: 35 }] }]);
  });
  it('net per class', () => {
    const t = { ...tp, amounts: { 'net1:A': 20, 'net1:B': 20 } };
    const a = prizeAwards(t, { gross, net: net.map((r, k) => ({ ...r, cls: k < 2 ? 'A' : 'B' })), classes: ['A', 'B'] });
    expect(a.map((x) => `${x.slot} ${x.winners[0].name}`)).toEqual(['net1:A Cedric', 'net1:B Sascha']);
  });
  it('without an entry fee the collector (the host) pays the prizes', () => {
    const t = { ...tp, fee: 0 };
    const s = prizeSettle(t, ['Sascha', 'Chris', 'Cedric', 'Erik'], prizeAwards(t, { gross, net, specials }));
    expect(s.transfers.map((x) => `${x.from}>${x.to} ${x.amount}`)).toEqual(['Sascha>Chris 10', 'Sascha>Cedric 50', 'Sascha>Erik 30']);
  });
  it('for the honour: nothing to win, nothing to pay', () => {
    expect(hasPrizes({ prize: { kind: 'none' }, amounts: { gross1: 50 } })).toBe(false);
    expect(prizeAwards({ prize: { kind: 'none' }, amounts: { gross1: 50 } }, { gross })).toEqual([]);
  });
  it('the slots: gross, net per class, the special prizes', () => {
    const s = prizeSlots({ net: true, classes: ['A', 'B'], specials: [specials[0].special], holeName: (i) => String(i + 1) });
    expect(s.map((x) => x.id)).toEqual(['gross1', 'gross2', 'gross3', 'net1:A', 'net2:A', 'net3:A', 'net1:B', 'net2:B', 'net3:B', 'sp:ld']);
    expect(s[s.length - 1].label).toBe('Long Drive · hole 9');
  });
  it('sums', () => {
    expect(prizeSum(tp)).toBe(100);
    expect(wonBy(prizeAwards(tp, { gross, net, specials })).get('sascha')?.amount).toBe(10);
  });
});

// A series (Sascha 15.11.2026: "Eine Abrechnung am Ende"): the day prizes of its tournaments and its own added up, then
// the fewest payments.
describe('one settlement for a series', () => {
  const m = (xs: [string, number][]) => new Map(xs.map(([n, v]) => [n.toLowerCase(), { name: n, net: v }]));
  it('adds the balances of the days and the series', () => {
    const day1 = m([['Sascha', 30], ['Chris', -10], ['Cedric', -20]]);
    const own = m([['Sascha', -50], ['Chris', 70], ['Cedric', -20]]);
    const b = addBalances(day1, own);
    expect([...b.values()].map((x) => [x.name, x.net])).toEqual([['Sascha', -20], ['Chris', 60], ['Cedric', -40]]);
  });
  it('the fewest payments – each who owes pays one who gets', () => {
    const t = settleBalances(m([['Sascha', -20], ['Chris', 60], ['Cedric', -40]]));
    expect(t).toEqual([
      { from: 'Cedric', to: 'Chris', amount: 40, key: 'cedric>chris' },
      { from: 'Sascha', to: 'Chris', amount: 20, key: 'sascha>chris' },
    ]);
  });
  it('nobody owes: nothing to pay', () => {
    expect(settleBalances(m([['Sascha', 0], ['Chris', 0]]))).toEqual([]);
  });
  it('the money sums to zero over all transfers', () => {
    const b = m([['A', -33.33], ['B', -33.33], ['C', 66.66]]);
    const t = settleBalances(b);
    expect(t.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(66.66, 2);
    expect(t.every((x) => x.to === 'C')).toBe(true);
  });
});
