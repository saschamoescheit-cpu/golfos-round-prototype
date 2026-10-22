import { describe, expect, it } from 'vitest';
import { RATINGS } from './ratings';
import { TEES } from './tees';

describe('course ratings of the bundled courses', () => {
  it('every rated tee is a tee of our tee data (a rating only where the lengths were compared)', () => {
    for (const [course, tees] of Object.entries(RATINGS)) {
      const known = TEES[course]?.tees;
      if (!known) continue;
      for (const key of Object.keys(tees)) expect(known, `${course} ${key}`).toContain(key.split('@')[0]);
    }
  });
  it('believable values: course rating 55–80, slope 55–155', () => {
    for (const tees of Object.values(RATINGS))
      for (const r of Object.values(tees)) {
        expect(r.cr).toBeGreaterThan(55);
        expect(r.cr).toBeLessThan(80);
        expect(r.slope).toBeGreaterThanOrEqual(55);
        expect(r.slope).toBeLessThanOrEqual(155);
      }
  });
  it('Southern Dunes from the scorecard (men)', () => {
    expect(RATINGS['southerndunes:fl'].Blue).toEqual({ cr: 72.9, slope: 136 });
    expect(RATINGS['southerndunes:fl'].Red).toBeUndefined(); // only a women's rating published
  });
});
