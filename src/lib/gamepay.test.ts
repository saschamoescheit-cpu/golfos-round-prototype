import { describe, expect, it } from 'vitest';
import { formDef, standingOf, type Game } from './gameforms';
import { mergePayments, people, sums, waiting } from './gamepay';

const holes = (n: number) => Array.from({ length: n }, (_, i) => ({ label: String(i + 1), par: 4, si: i + 1 }));
function skins(scores: number[][], names = ['Sascha', 'Cedric'], id = 'g1'): Game {
  const def = formDef('skins');
  const players = names.map((name, k) => ({ id: `p${k}`, name, hcp: 0 }));
  return {
    id,
    createdAt: '2026-11-03T10:00:00Z',
    finishedAt: '2026-11-03T14:00:00Z',
    signedAt: '2026-11-03T14:05:00Z',
    courseName: 'Hetzenhof',
    holes: holes(scores[0].length),
    players,
    form: 'skins',
    settings: { ...Object.fromEntries(def.settings.map((s) => [s.key, s.default])), stake: 1 },
    scores: Object.fromEntries(players.map((p, k) => [p.id, scores[k]])),
    extra: Array.from({ length: scores[0].length }, () => ({})),
    current: 0,
  };
}

// Sascha 03.11.2026: "the details – which games, how the −35 € add up; mark that I paid Cedric, he confirms"
describe('the balance against each player', () => {
  const g = skins([
    [4, 4, 4],
    [3, 3, 4],
  ]);
  const owe = -(standingOf(g).money?.p1 ?? 0); // Cedric's win is my loss
  it('a game with what it came to and what is open', () => {
    const [c] = people([g], [], '2026-11-03');
    expect(c.name).toBe('Cedric');
    expect(c.items).toHaveLength(1);
    expect(c.items[0].amount).toBeCloseTo(owe);
    expect(c.items[0].open).toBeCloseTo(owe);
    expect(c.items[0].title).toMatch(/Skins · Hetzenhof/);
    expect(sums(c.items, (i) => i.open)).toEqual({ '€': owe });
  });
  it('paid by me: nothing open, waiting for Cedric – confirmed: done', () => {
    const paid = { ...g, payments: [{ id: 'x', from: 'p0', to: 'p1', amount: -owe, paidAt: '2026-11-03T15:00:00Z' }] };
    const [c] = people([paid], [], '2026-11-03');
    expect(c.items[0].open).toBeCloseTo(0);
    expect(waiting(c.items[0])).toHaveLength(1);
    const got = { ...paid, payments: [{ ...paid.payments[0], receivedAt: '2026-11-03T16:00:00Z' }] };
    expect(waiting(people([got], [], '2026-11-03')[0].items[0])).toHaveLength(0);
  });
  it('taken back: open again', () => {
    const back = { ...g, payments: [{ id: 'x', from: 'p0', to: 'p1', amount: -owe, paidAt: 'a', undoneAt: 'b' }] };
    expect(people([back], [], '2026-11-03')[0].items[0].open).toBeCloseTo(owe);
  });
  it('a game not confirmed does not count', () => {
    expect(people([{ ...g, signedAt: null }], [], '2026-11-03')[0]?.items ?? []).toHaveLength(0);
  });
  it('two phones: every payment once, what either marked', () => {
    const a = [{ id: 'x', from: 'p0', to: 'p1', amount: 5, paidAt: 'a' }];
    const b = [{ id: 'x', from: 'p0', to: 'p1', amount: 5, paidAt: 'a', receivedAt: 'b' }, { id: 'y', from: 'p1', to: 'p0', amount: 2, receivedAt: 'c' }];
    expect(mergePayments(a, b)).toEqual([b[0], b[1]]);
    expect(mergePayments([{ ...a[0], undoneAt: 'u' }], a)?.[0].undoneAt).toBe('u');
  });
});
