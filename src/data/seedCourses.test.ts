import { describe, expect, it } from 'vitest';
import { SEED_COURSES } from './seedCourses';
import { SEED_GEOMETRY } from './seedGeometry';
import { holesFromTags, searchBundled } from '../lib/courses';

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

// Orange Lake – The Reserve (13.11.2026, played that day): bundled from the aerial – found by "Orange Lake" and by
// "Reserve" with no course database, every hole a line from its tee to a green, par 71
describe('Orange Lake – The Reserve', () => {
  const id = 'osm:relation/4039888';
  it('found by "Orange Lake" and "Reserve"', () => {
    expect(searchBundled('Orange Lake').map((c) => c.id)).toContain(id);
    expect(searchBundled('reserve').map((c) => c.id)).toContain(id);
  });
  it('18 holes, par 71, each line ends on a green', () => {
    const g = SEED_GEOMETRY[id];
    expect(g.holes.map((h) => h.ref)).toEqual(Array.from({ length: 18 }, (_, k) => String(k + 1)));
    expect(holesFromTags(SEED_COURSES[id].holeTags).reduce((s, h) => s + (h.par ?? 0), 0)).toBe(71);
    const inside = (p: number[], r: number[][]) => {
      let c = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++)
        if (r[i][1] > p[1] !== r[j][1] > p[1] && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
      return c;
    };
    for (const h of g.holes) expect(g.green.some((r) => inside(h.line[h.line.length - 1], r)), `hole ${h.ref}`).toBe(true);
  });
});
