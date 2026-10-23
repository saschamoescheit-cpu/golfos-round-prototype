import { describe, expect, it } from 'vitest';
import { FLIGHTS, flightOf, STRIKES, strikeName } from './shotfacts';

// The ball's flight (Sascha 23.10.2026: "all the flights are needed to judge a swing"): the nine of the ball flight laws,
// the contact apart; shots checked before keep their "slice"/"hook" – read as their flight.
describe('flights', () => {
  it('the nine flights: every start (left, straight, right) with every curve (left, none, right) once', () => {
    expect(FLIGHTS).toHaveLength(9);
    const pairs = new Set(FLIGHTS.map((f) => `${f.start}/${f.curve}`));
    expect(pairs.size).toBe(9);
    expect(FLIGHTS.find((f) => f.value === 'pull')).toMatchObject({ start: -1, curve: 0 });
    expect(FLIGHTS.find((f) => f.value === 'pushSlice')).toMatchObject({ start: 1, curve: 1 });
    expect(FLIGHTS.find((f) => f.value === 'straight')).toMatchObject({ start: 0, curve: 0 });
  });
  it('the contact has no slice and hook any more', () => {
    expect(STRIKES.map((s) => s.value)).toEqual(['good', 'fat', 'thin', 'shank']);
  });
  it('an older shot with "slice"/"hook" as strike reads as that flight – a new flight wins', () => {
    expect(flightOf({ strike: 'slice' })).toBe('slice');
    expect(flightOf({ strike: 'hook' })).toBe('hook');
    expect(flightOf({ strike: 'good' })).toBeUndefined();
    expect(flightOf({ strike: 'slice', flight: 'push' })).toBe('push');
    expect(strikeName('slice')).toBe('Slice');
  });
});
