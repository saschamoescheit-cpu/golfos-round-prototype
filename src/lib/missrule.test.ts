import { describe, expect, it } from 'vitest';
import { FLIGHTS, mishit, onLine, STRIKES } from './shotfacts';

// Sascha 25.10.2026: "Draw und Fade sowie Gerade sind keine Fehlschläge und dürfen auch nicht als solche gewertet werden"
describe('what counts as a miss', () => {
  it('only the contact: fat, thin, topped, toe, heel and shank – never good', () => {
    expect(STRIKES.filter((s) => mishit(s.value)).map((s) => s.value)).toEqual(['fat', 'thin', 'topped', 'toe', 'heel', 'shank']);
    expect(mishit('good')).toBe(false);
    expect(mishit(undefined)).toBe(false);
  });
  it('a flight is never a mishit, and straight, draw and fade are on the line', () => {
    for (const f of FLIGHTS) expect(mishit(f.value as never)).toBe(false);
    expect(onLine('straight')).toBe(true);
    expect(onLine('draw')).toBe(true);
    expect(onLine('fade')).toBe(true);
    expect(onLine('push')).toBe(false);
  });
});
