import { describe, expect, it } from 'vitest';
import { SEED_COURSES } from './seedCourses';
import { holesFromTags } from '../lib/courses';

// The built-in courses (night 27./28.10.2026): Kissimmee Bay had stroke index 3 twice (holes 1 and 10, OSM) and no 18 –
// the strokes of a net game land on the stroke index, so each must be there once.
describe('built-in courses: par and stroke index', () => {
  for (const [id, c] of Object.entries(SEED_COURSES)) {
    const holes = holesFromTags(c.holeTags);
    if (holes.length !== 18) continue;
    it(`${c.name} (${id}): every hole with par 3–5, each stroke index 1–18 once`, () => {
      expect(holes.every((h) => h.par != null && h.par >= 3 && h.par <= 5)).toBe(true);
      const si = holes.map((h) => h.strokeIndex[0]).filter((x) => x != null);
      if (!si.length) return; // no stroke index known (filled from the scorecard on the course)
      expect([...si].sort((a, b) => a - b)).toEqual(Array.from({ length: 18 }, (_, k) => k + 1));
    });
  }
});
