import { describe, expect, it } from 'vitest';
import { SEED_GEOMETRY } from './seedGeometry';
import { SEED_COURSES } from './seedCourses';
import { TEES } from './tees';

// The built-in courses (night run 27./28.10.2026, before the USA trip): each hole line as long as the scorecard says –
// a hole drawn to the wrong green or two holes swapped would stand out by tens of metres. The line starts at one of the
// tees (the app shifts it to the player's tee), so it lies between the shortest and the longest tee, give or take.
const m = (a: number[], b: number[]) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);

describe('built-in courses: hole lines as long as the scorecard', () => {
  for (const [id, g] of Object.entries(SEED_GEOMETRY)) {
    const tees = TEES[id];
    if (!tees) continue;
    it(`${SEED_COURSES[id]?.name ?? id}: every line between its shortest and longest tee`, () => {
      const off: string[] = [];
      let compared = 0;
      for (const h of g.holes) {
        const row = (tees.holes[h.ref] ?? []).filter((x): x is number => x != null);
        if (!row.length || !h.line || h.line.length < 2) continue;
        compared++;
        const len = h.line.slice(1).reduce((s, p, i) => s + m(h.line[i], p), 0);
        const lo = Math.min(...row) * 0.85 - 25;
        const hi = Math.max(...row) * 1.1 + 25;
        if (len < lo || len > hi) off.push(`${h.ref}: ${Math.round(len)} m (tees ${Math.min(...row)}–${Math.max(...row)})`);
      }
      expect(compared).toBeGreaterThanOrEqual(9);
      expect(off).toEqual([]);
    });
  }
});
