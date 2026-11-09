import { describe, expect, it } from 'vitest';
import { duelLine, duelsToday } from '../components/DuelBar';
import { setLang } from './i18n';
import type { PoolEntry } from './wagerstore';
import type { DuelCard, Wager, WagerPool } from './wagers';

// The duels of today on the hole (Sascha 09.11.2026, night run: "5+5+10 against Sascha: 1 up after 10").
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const DAY = '2026-11-10';
const card = (strokes: (number | null)[]): DuelCard => ({ day: DAY, course: 'Kissimmee Bay', strokes, received: strokes.map(() => 0) });
const duel = (state: 'open' | 'accepted', day = DAY): Wager => ({ id: 'd', player: 'c', opponent: 's', kind: 'nassau', target: 0, stake: 0, payout: 'opponent', attempts: 'day', day, parts: { front: 5, back: 5, total: 10 }, challenge: { state, at: '' } });
const entry = (me: string, w: Wager, cards: WagerPool['cards']): PoolEntry => ({
  code: 'ABC123',
  me,
  pool: { kind: 'wager-pool', id: 'p', name: 'USA', from: '2026-11-05', to: '2026-11-18', createdAt: '', currency: 'USD', players: [{ id: 'c', name: 'Chris' }, { id: 's', name: 'Sascha' }], wagers: [w], progress: {}, cards },
});

describe('5+5+10 on the hole', () => {
  setLang('de');
  const chris = PARS.map((p, i) => (i < 10 ? (i === 0 ? p - 1 : p) : null));
  const sascha = PARS.map((p, i) => (i < 10 ? p : null));
  it('Chris: "gg. Sascha 1 vorn nach 10" – Sascha sees it the other way round', () => {
    const forChris = duelsToday([entry('c', duel('accepted'), { c: [card(chris)], s: [card(sascha)] })], DAY);
    expect(forChris.map((x) => `${x.vs} ${duelLine(x, DAY)}`)).toEqual(['Sascha 1 vorn nach 10']);
    const forSascha = duelsToday([entry('s', duel('accepted'), { c: [card(chris)], s: [card(sascha)] })], DAY);
    expect(forSascha.map((x) => `${x.vs} ${duelLine(x, DAY)}`)).toEqual(['Chris 1 hinten nach 10']);
  });
  it('over: the money; not started: said so', () => {
    const done = duelsToday([entry('c', duel('accepted'), { c: [card(PARS.map((p) => p - 1 + 1).map((p, i) => (i === 0 ? p - 1 : p)))], s: [card(PARS)] })], DAY);
    expect(duelLine(done[0], DAY)).toBe('+15 $');
    expect(duelLine(duelsToday([entry('c', duel('accepted'), {})], DAY)[0], DAY)).toBe('noch nicht gestartet');
  });
  it('a challenge not accepted, another day: no bar', () => {
    expect(duelsToday([entry('c', duel('open'), {})], DAY)).toEqual([]);
    expect(duelsToday([entry('c', duel('accepted', '2026-11-11'), {})], DAY)).toEqual([]);
  });
});
