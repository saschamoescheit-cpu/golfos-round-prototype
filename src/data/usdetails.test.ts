import { describe, expect, it } from 'vitest';
import { SEED_GEOMETRY } from './seedGeometry';
import { SEED_COURSES } from './seedCourses';
import { centroid, holeMapData, pointInRing, ringArea } from '../lib/geo';
import type { CourseGeometry } from '../types';

// The drawn hole (2D) on the courses of the USA trip at full detail (night 15./16.11.2026, Sascha: "das maximal mögliche
// an Details"): every tee box of a hole (scripts/teepads.py, lidar), bunkers where OSM had none (scripts/sandtraps.py),
// and no tree crowns over a fairway, a green or a lake (scripts/canopy.py drew a wood round a clearing as one outline –
// Legends 16 had trees all over its fairway, 15 over its lake).
const LEGENDS = 'osm:relation/4039887';
const CYPRESS = 'osm:relation/4039062';
const geo = (id: string) => SEED_GEOMETRY[id] as CourseGeometry;

describe('USA courses: the details of the 2D view', () => {
  it('Orange Lake Legends: the tee boxes of the aerial, two or more on nearly every hole', () => {
    const g = geo(LEGENDS);
    expect(g.tee.length).toBeGreaterThanOrEqual(60);
    const many = g.holes.filter((h) => (holeMapData(g, 'Main', Number(h.ref))?.tees.length ?? 0) >= 2).length;
    expect(many, g.holes.map((h) => h.ref + ':' + (holeMapData(g, 'Main', Number(h.ref))?.tees.length ?? 0)).join(' ')).toBeGreaterThanOrEqual(15);
  });

  it('StoneGate Cypress: bunkers on the course (none in OSM)', () => {
    expect(geo(CYPRESS).bunker.length).toBeGreaterThanOrEqual(25);
  });

  for (const id of [LEGENDS, CYPRESS]) {
    it(`${SEED_COURSES[id]?.name ?? id}: no tree crowns over a fairway, a green or a lake`, () => {
      const g = geo(id);
      const crowns = (g.canopy ?? []).filter((r) => ringArea(r) >= 300);
      const open = [...g.fairway, ...g.green, ...g.water.filter((r) => ringArea(r) >= 800)];
      const covered = open.map(centroid).filter((c, k) => pointInRing(c, open[k]) && crowns.some((r) => pointInRing(c, r)));
      expect(covered).toEqual([]);
    });
  }
});
