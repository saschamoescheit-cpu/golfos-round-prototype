import { describe, expect, it } from 'vitest';
import { CARDS } from './cards';
import { RATINGS } from './ratings';
import { TEES } from './tees';
import { holesFromTags } from '../lib/courses';

// Scorecards of courses without holes in OpenStreetMap (Sascha 27.10.2026, Hawks Landing): complete and consistent.
describe('scorecards for courses without holes in the map', () => {
  for (const [id, tags] of Object.entries(CARDS)) {
    it(`${id}: every hole with par and stroke index, each index once; tees and ratings beside it`, () => {
      const holes = holesFromTags(tags);
      expect(holes.length).toBe(18);
      expect(holes.every((h) => h.par != null && h.strokeIndex.length === 1)).toBe(true);
      expect(new Set(holes.map((h) => h.strokeIndex[0])).size).toBe(18);
      const tees = TEES[id];
      expect(Object.keys(tees.holes).length).toBe(18);
      // longer tees are longer on every hole, and every rated tee is a tee of the card
      for (const k of Object.keys(tees.holes)) {
        const row = tees.holes[k].filter((x): x is number => x != null);
        expect(row).toEqual([...row].sort((a, b) => b - a));
      }
      for (const t of Object.keys(RATINGS[id] ?? {})) expect(tees.tees).toContain(t);
    });
  }
  it('Hawks Landing: par 70, 6255 yd from the Black tees', () => {
    const holes = holesFromTags(CARDS['osm:relation/4053362']);
    expect(holes.reduce((s, h) => s + h.par!, 0)).toBe(70);
    const black = Object.values(TEES['osm:relation/4053362'].holes).reduce((s, r) => s + r[0]!, 0);
    expect(Math.round(black / 0.9144)).toBeGreaterThanOrEqual(6253);
    expect(Math.round(black / 0.9144)).toBeLessThanOrEqual(6257);
  });
});
