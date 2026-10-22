import { describe, expect, it } from 'vitest';
import { isNoise } from './errorlog';

// App errors reported by themselves (final list, 22.10.2026): only real faults of the app, not the net's noise.
describe('what is reported', () => {
  it('a blocked request, a resize loop, a foreign script are no fault of the app', () => {
    expect(isNoise('https://photon.komoot.io/api/?q=x due to access control checks.')).toBe(true);
    expect(isNoise('ResizeObserver loop completed with undelivered notifications.')).toBe(true);
    expect(isNoise('Script error.')).toBe(true);
    expect(isNoise('The operation was aborted.')).toBe(true);
  });
  it('a real error is reported', () => {
    expect(isNoise("undefined is not an object (evaluating 'd.shots[0].pos')")).toBe(false);
  });
});
