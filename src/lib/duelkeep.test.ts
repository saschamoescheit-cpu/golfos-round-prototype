import { describe, expect, it } from 'vitest';
import { judgeDuelCards, mergeCards, mergeKept, withShare, type DuelCard, type Wager, type WagerPool } from './wagers';
import { opponentIn, phoneless } from './wagerstore';

// Sascha 10.11.2026, USA: 5+5+10 "against linked friends or players made as in a round – and set who keeps the score"
// (default: the challenger for both); "all rounds of the day – or the tournament"; "net – with how many percent".

const day = '2026-11-10';
const card = (strokes: number, o: Partial<DuelCard> = {}): DuelCard => ({ day, course: 'Stonegate Oaks', strokes: Array(18).fill(strokes), received: Array(18).fill(0), ...o });
const duel = (o: Partial<Wager> = {}): Wager => ({ id: 'd1', player: 'c', opponent: 'e', kind: 'nassau', target: 0, stake: 0, payout: 'opponent', attempts: 'day', day, parts: { front: 5, back: 5, total: 10 }, challenge: { state: 'accepted', at: 'x' }, ...o });
const pool = (cards: WagerPool['cards']) => ({ from: day, to: day, cards });

describe('5+5+10: who keeps the score', () => {
  it('the challenger keeps both: his figures of the opponent count, not the opponent\'s own', () => {
    // Erik's own card says 4 a hole, Chris kept 5 a hole for him; Chris 4 a hole
    const cards = { c: [card(4)], e: [card(4), card(5, { rec: 'c' })] };
    expect(judgeDuelCards(duel({ scorer: 'by' }), pool(cards)).amount).toBe(20); // Chris wins all three
    expect(judgeDuelCards(duel({ scorer: 'own' }), pool(cards)).amount).toBe(0); // each his own: level
  });
  it('the opponent not in the challenger\'s round: his own card', () => {
    expect(judgeDuelCards(duel({ scorer: 'by' }), pool({ c: [card(4)], e: [card(5)] })).amount).toBe(20);
  });
  it('figures kept by another one never count', () => {
    expect(judgeDuelCards(duel({ scorer: 'by' }), pool({ c: [card(4)], e: [card(5, { rec: 'x' })] })).duels).toEqual([]);
  });
  it('the opponent\'s own phone keeps the challenger\'s figures of him; the challenger\'s replace only his own', () => {
    const kept = mergeKept([card(4)], [card(5)], 'c');
    expect(kept.map((c) => [c.strokes[0], c.rec ?? ''])).toEqual([[4, ''], [5, 'c']]);
    expect(mergeCards(kept, [card(3)]).map((c) => [c.strokes[0], c.rec ?? ''])).toEqual([[5, 'c'], [3, '']]);
    expect(mergeKept(kept, [card(6)], 'c').map((c) => [c.strokes[0], c.rec ?? ''])).toEqual([[4, ''], [6, 'c']]);
  });
});

describe('5+5+10: the round of the day', () => {
  it('the tournament: its round counts, another round of the day not', () => {
    const cards = { c: [card(3, { course: 'Celebration' }), card(4, { tour: 'T1' })], e: [card(5, { tour: 'T1' }), card(2, { course: 'Celebration' })] };
    const on = { code: 'T1', name: 'Stonegate Oaks', course: 'Stonegate Oaks' };
    expect(judgeDuelCards(duel({ on }), pool(cards)).amount).toBe(20);
    expect(judgeDuelCards(duel(), pool(cards)).amount).toBe(-20); // all rounds: the first of the day (Celebration)
  });
  it('a card from before without its tournament: by the course', () => {
    const on = { code: 'T1', name: 'Oaks', course: 'Stonegate Oaks' };
    expect(judgeDuelCards(duel({ on }), pool({ c: [card(4)], e: [card(5)] })).amount).toBe(20);
  });
});

describe('5+5+10 net: a share of the handicap', () => {
  const si = Array.from({ length: 18 }, (_, i) => i + 1);
  it('the strokes received spread anew from the playing handicap × share', () => {
    expect(withShare(card(5, { hcp: 18, si }), 100).received.reduce((a, b) => a + b, 0)).toBe(0); // 100 %: as kept
    expect(withShare(card(5, { hcp: 18, si }), 75).received.reduce((a, b) => a + b, 0)).toBe(14); // 13,5 → 14
    expect(withShare(card(5), 75).received.every((x) => x === 0)).toBe(true); // a card from before: as it was
  });
  it('net at 50 %: Erik (18) one stroke a hole on nine holes against Chris (0)', () => {
    const cards = { c: [card(4, { hcp: 0, si })], e: [card(5, { hcp: 18, si, received: Array(18).fill(1) })] };
    expect(judgeDuelCards(duel({ net: true }), pool(cards)).amount).toBe(0); // 100 %: level everywhere
    // 50 %: 9 strokes on the holes 1–9 – the front level, the back and the 18 to Chris
    expect(judgeDuelCards(duel({ net: true, allowance: 50 }), pool(cards)).amount).toBe(15);
  });
});

describe('5+5+10: an opponent not in the pool', () => {
  const p = { players: [{ id: 'c', name: 'Chris', joined: { name: 'Chris', at: 'x', uid: 'u-c' } }, { id: 'e', name: 'Erik' }] } as unknown as WagerPool;
  it('one there already by name or account – else a new one: a friend invited, a name without a phone', () => {
    expect(opponentIn(p, { name: 'erik' })).toEqual({ player: p.players[1], added: false });
    expect(opponentIn(p, { name: 'Chris G', friend: { uid: 'u-c', name: 'Chris G' } })?.player.id).toBe('c');
    const f = opponentIn(p, { name: 'Stefan', friend: { uid: 'u-s', name: 'Stefan K' } })!;
    expect(f.added && f.player.invited?.uid === 'u-s' && !phoneless(f.player)).toBe(true);
    const n = opponentIn(p, { name: 'Ben', hcp: '20' })!;
    expect(n.added && phoneless(n.player) && n.player.hcp === '20').toBe(true);
    expect(opponentIn(p, { name: '  ' })).toBeNull();
  });
});
