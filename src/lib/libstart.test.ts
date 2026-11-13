import { describe, expect, it } from 'vitest';
import { LIBRARY, libraryStart } from './wagers';

// click paths 13.11.2026: "Gross over several rounds" started at +100 for everyone – +30 for Erik (4,6) was 70 taps
describe('a library bet starts from the player\'s handicap', () => {
  const sum = LIBRARY.find((b) => b.id === 'scoreSum')!;
  const gross = LIBRARY.find((b) => b.id === 'scoreGross')!;
  it('over 6 rounds: his handicap per round', () => {
    expect(libraryStart(sum, '4,6')).toBe(30);
    expect(libraryStart(sum, '18')).toBe(108);
    expect(libraryStart(gross, '12.4')).toBe(12);
  });
  it('a plus handicap plays under par – never below 0; none: the library\'s own', () => {
    expect(libraryStart(gross, '+1,2')).toBe(0);
    expect(libraryStart(sum, '')).toBe(100);
    expect(libraryStart(sum, undefined)).toBe(100);
    expect(libraryStart(LIBRARY.find((b) => b.id === 'putts')!, '18')).toBe(32);
  });
});
