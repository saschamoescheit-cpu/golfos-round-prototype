import { describe, expect, it } from 'vitest';
import { SEED_COURSES } from './seedCourses';
import { SEED_GEOMETRY } from './seedGeometry';
import { holesFromTags, searchBundled } from '../lib/courses';
import { lineLength } from '../lib/geo';
import { TEES } from './tees';
import { holeForTee } from '../lib/teeline';

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
  // second pass (13.11.2026 morning): each line starts at the back of its tee complex (raised pads in the 3DEP lidar) –
  // within 10 m of the card's Teal where a tee lies there, else of its White; 13 is the one hole shorter than its card
  // Sascha 14.11.2026 ("Wir haben heute vom blauen Abschlag gespielt"): the current card – Green/Blue/White/Yellow – and
  // the blue tees where the flight teed off: the line starts there on every hole, ends on the same green, and is as
  // long as the card's blue length within what the card measures differently (≤ 35 m; 13 of 18 within 15 m)
  it('blue from the tees measured on 13.11.2026, the blue lengths of the card', () => {
    const g = SEED_GEOMETRY[id];
    const card = TEES[id];
    expect(card.tees).toEqual(['Green', 'Blue', 'White', 'Yellow']);
    let close = 0;
    for (const h of g.holes) {
      const at = card.at![h.ref][1]!;
      const d = holeForTee({ line: h.line, tee: h.line[0] } as never, id, h.ref, 'Blue');
      expect(d!.line[0], `hole ${h.ref}`).toEqual(at);
      expect(d!.line[d!.line.length - 1]).toEqual(h.line[h.line.length - 1]);
      const off = Math.abs(lineLength(d!.line) - (card.holes[h.ref][1] as number));
      expect(off, `hole ${h.ref}: ${lineLength(d!.line).toFixed(0)} m, Blue ${card.holes[h.ref][1]}`).toBeLessThanOrEqual(35);
      if (off <= 15) close++;
    }
    expect(close).toBeGreaterThanOrEqual(12);
  });
});
