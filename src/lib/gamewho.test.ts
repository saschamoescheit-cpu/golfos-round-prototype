import { describe, expect, it } from 'vitest';
import { defaultWho, type Game } from './gameforms';
import { keptBy, mergeGames, whoOf } from './sharedgame';

// Games: who enters the scores on several phones (Sascha 07.11.2026: "show how the score entry is done – e.g. everyone
// his own; by the game there may be other defaults").

const game = (o: Partial<Game> = {}): Game =>
  ({
    id: 'g1',
    createdAt: '2026-11-07T10:00:00Z',
    finishedAt: null,
    courseName: 'Kissimmee Bay',
    holes: [{ label: '1', par: 4, si: 1 }],
    players: [
      { id: 'a', name: 'Sascha', hcp: 10 },
      { id: 'b', name: 'Erik', hcp: 4 },
      { id: 'c', name: 'Cedric', hcp: 20 },
    ],
    form: 'skins',
    settings: {},
    scores: { a: [null], b: [null], c: [null] },
    extra: [{}],
    current: 0,
    ...o,
  }) as Game;

describe('who enters the scores', () => {
  it('the defaults by the game: one card where something is noted on every hole, else everyone his own', () => {
    expect(['wolf', 'hammer', 'bbb', 'dots', 'snake'].map((f) => defaultWho(f as Game['form']))).toEqual(['one', 'one', 'one', 'one', 'one']);
    expect(['skins', 'nassau', 'stableford', 'match', 'vegas'].map((f) => defaultWho(f as Game['form']))).toEqual(['own', 'own', 'own', 'own', 'own']);
    expect(whoOf(game())).toBe('own');
    expect(whoOf(game({ who: 'all' }))).toBe('all');
  });
  it('one phone alone: it enters everything', () => {
    expect(keptBy(game({ who: 'one', scorer: 'b' }))).toEqual({});
  });
  it('everyone his own: the players other phones play stay theirs – one without a phone anyone enters', () => {
    // Erik joined as Erik; the host plays the first player; Cedric has no phone
    const onErik = game({ shared: { code: '123456', me: 'b' }, claims: { b: '2026-11-07T10:05:00Z' } });
    expect(keptBy(onErik)).toEqual({ a: 'Sascha' });
    const onHost = game({ shared: { code: '123456' }, claims: { b: '2026-11-07T10:05:00Z' } });
    expect(keptBy(onHost)).toEqual({ b: 'Erik' });
  });
  it('one for all: only the scorer\'s phone enters – the others see who does', () => {
    const g = game({ who: 'one', scorer: 'b', shared: { code: '123456' } });
    expect(keptBy(g)).toEqual({ a: 'Erik', b: 'Erik', c: 'Erik' });
    expect(keptBy({ ...g, shared: { code: '123456', me: 'b' } })).toEqual({});
  });
  it('everyone everything: nothing kept', () => {
    expect(keptBy(game({ who: 'all', shared: { code: '123456', me: 'b' }, claims: { b: 'x' } }))).toEqual({});
  });
  it('the phones\' players come together when the game is merged', () => {
    const merged = mergeGames(game({ claims: { b: 't1' } }), game({ claims: { c: 't2' } }));
    expect(merged.claims).toEqual({ b: 't1', c: 't2' });
  });
});
