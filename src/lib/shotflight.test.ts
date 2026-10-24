import { describe, expect, it } from 'vitest';
import { FLIGHTS, flightOf, mishit, onLine, STRIKES, strikeName } from './shotfacts';

// The ball's flight (Sascha 23.10.2026: "all the flights are needed to judge a swing"): the nine of the ball flight laws,
// the contact apart; shots checked before keep their "slice"/"hook" – read as their flight.
describe('flights', () => {
  it('the nine flights: every start (left, straight, right) with every curve (left, none, right) once', () => {
    const nine = FLIGHTS.filter((f) => !f.shape);
    expect(nine).toHaveLength(9);
    const pairs = new Set(nine.map((f) => `${f.start}/${f.curve}`));
    expect(pairs.size).toBe(9);
    expect(FLIGHTS.find((f) => f.value === 'pull')).toMatchObject({ start: -1, curve: 0 });
    expect(FLIGHTS.find((f) => f.value === 'pushSlice')).toMatchObject({ start: 1, curve: 1 });
    expect(FLIGHTS.find((f) => f.value === 'straight')).toMatchObject({ start: 0, curve: 0 });
  });
  // Sascha 24.10.2026: draw and fade too – a little beside the line, curving back onto it, no miss off the line
  it('draw and fade: start to one side, curve back, end on the line', () => {
    for (const v of ['draw', 'fade'] as const) {
      const f = FLIGHTS.find((x) => x.value === v)!;
      expect(f.shape).toBe(true);
      expect(Math.sign(f.start)).toBe(-Math.sign(f.curve));
      expect(Math.abs(f.start * 8 + f.curve * 10)).toBeLessThan(0.5);
      expect(onLine(v)).toBe(true);
    }
    expect(FLIGHTS.find((x) => x.value === 'draw')!.start).toBeGreaterThan(0); // a right-hander's draw starts right
    expect(onLine('slice')).toBe(false);
  });
  it('the contact has no slice and hook any more', () => {
    expect(STRIKES.map((s) => s.value)).toEqual(['good', 'fat', 'thin', 'topped', 'toe', 'heel', 'shank']);
    for (const s of ['topped', 'toe', 'heel'] as const) expect(mishit(s)).toBe(true);
  });
  it('an older shot with "slice"/"hook" as strike reads as that flight – a new flight wins', () => {
    expect(flightOf({ strike: 'slice' })).toBe('slice');
    expect(flightOf({ strike: 'hook' })).toBe('hook');
    expect(flightOf({ strike: 'good' })).toBeUndefined();
    expect(flightOf({ strike: 'slice', flight: 'push' })).toBe('push');
    expect(strikeName('slice')).toBe('Slice');
  });
});
