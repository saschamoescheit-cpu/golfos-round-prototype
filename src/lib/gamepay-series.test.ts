import { describe, expect, it } from 'vitest';
import { people, type SeriesSettle } from './gamepay';

// Sascha 18.11.2026 (Bilanz-Mockup): a series over in Bilanz – its settlement with each player; "Bezahlt" by who pays,
// counted once the receiver confirmed "Erhalten"; the host's mark on the tournament's page counts as paid.
const base: SeriesSettle = {
  code: 'S1', title: 'The Orlando Invitational', day: '2026-11-17', sym: '$', prize: { kind: 'money', currency: 'USD' } as SeriesSettle['prize'], me: 'Sascha',
  transfers: [
    { key: 'Chris>Sascha', from: 'Chris', to: 'Sascha', amount: 50 },
    { key: 'Cedric>Sascha', from: 'Cedric', to: 'Sascha', amount: 50 },
    { key: 'Erik>Moritz', from: 'Erik', to: 'Moritz', amount: 50 },
    { key: 'Sascha>Stefan', from: 'Sascha', to: 'Stefan', amount: 20 },
  ],
};
const item = (s: SeriesSettle, name: string) => people([], [], '2026-11-18', [s]).find((p) => p.name === name)?.items[0];

describe('a series in Bilanz', () => {
  it('only what goes between me and each one – + owed to me, − I owe', () => {
    const ps = people([], [], '2026-11-18', [base]);
    expect(ps.map((p) => p.name).sort()).toEqual(['Cedric', 'Chris', 'Stefan']);
    expect(item(base, 'Chris')).toMatchObject({ kind: 'series', amount: 50, open: 50, pending: 0 });
    expect(item(base, 'Stefan')).toMatchObject({ amount: -20, open: -20 });
  });
  it('the host marked it paid: nothing open', () => {
    expect(item({ ...base, paid: { 'Chris>Sascha': '2026-11-18T10:00:00Z' } }, 'Chris')).toMatchObject({ amount: 50, open: 0 });
  });
  it('paid in Bilanz, not confirmed yet: pending – still open in what the balance shows; confirmed: settled', () => {
    const paid = { id: 'p1', from: 'Chris', to: 'Sascha', amount: 50, paidAt: '2026-11-18T10:00:00Z' };
    expect(item({ ...base, payments: [paid] }, 'Chris')).toMatchObject({ open: 0, pending: 50 });
    expect(item({ ...base, payments: [{ ...paid, receivedAt: '2026-11-18T11:00:00Z' }] }, 'Chris')).toMatchObject({ open: 0, pending: 0 });
    expect(item({ ...base, payments: [{ ...paid, undoneAt: '2026-11-18T12:00:00Z' }] }, 'Chris')).toMatchObject({ open: 50, pending: 0 });
  });
  it('names in any case', () => {
    expect(item({ ...base, me: 'sascha ' }, 'Chris')).toMatchObject({ amount: 50 });
  });
});
