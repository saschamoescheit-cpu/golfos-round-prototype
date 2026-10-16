import { describe, expect, it } from 'vitest';
import { search } from './search';

const ids = (q: string) => search(q).drills.map((d) => d.id);

describe('training search (night run 16./17.10.2026)', () => {
  it('finds the drills of a fault by its name (Slice, Hook, Shank)', () => {
    expect(ids('Slice')).toContain('slice-gate');
    expect(ids('Hook')).toContain('hook-gate');
    expect(ids('Shank')).toContain('shank-tee');
  });
  it('finds the drills of a topic by its name', () => {
    expect(ids('Grün lesen')).toContain('fall-line');
    expect(ids('Grün lesen').length).toBeGreaterThanOrEqual(8);
  });
  it('short words must be whole words – "Lag" is not "Lage"', () => {
    expect(ids('Lag')).toContain('lag-circle');
    expect(ids('Lag').length).toBeLessThan(25);
  });
  it('knows a few golfer words', () => {
    expect(ids('Nerven')).toContain('box-breathing');
    expect(ids('Dreiputt').length).toBeGreaterThanOrEqual(3);
    expect(ids('3-Putt')).toEqual(ids('Dreiputt'));
    expect(ids('Lange')).toEqual(ids('Länge'));
  });
  it('drills with the word in the name come first', () => {
    expect(search('Tiger').drills[0].id).toBe('tiger-gate');
  });
});
