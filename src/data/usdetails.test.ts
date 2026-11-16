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
const OAKS = 'osm:relation/4039063';
const DUNES = 'southerndunes:fl';
// every Florida course bundled for the trip
const FLORIDA = [LEGENDS, CYPRESS, OAKS, DUNES, 'osm:relation/4039888', 'osm:relation/1231691', 'osm:relation/4053362', 'osm:relation/4039579', 'osm:way/311994625', 'osm:relation/4040123'];
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

  it('StoneGate Cypress: a green at the end of every hole (16 read off the aerial)', () => {
    const g = geo(CYPRESS);
    expect(g.holes.filter((h) => !holeMapData(g, 'Main', Number(h.ref))?.green).map((h) => h.ref)).toEqual([]);
  });

  it('StoneGate Oaks and Southern Dunes: the cart paths of OSM', () => {
    expect(geo(OAKS).paths?.length ?? 0).toBeGreaterThanOrEqual(20);
    expect(geo(DUNES).paths?.length ?? 0).toBeGreaterThanOrEqual(20);
  });

  for (const id of FLORIDA) {
    it(`${SEED_COURSES[id]?.name ?? id}: no tree crowns over a fairway, a green or a lake – no crown outline of a hectare`, () => {
      const g = geo(id);
      expect(Math.max(...(g.canopy ?? []).map(ringArea))).toBeLessThan(10000);
      const crowns = (g.canopy ?? []).filter((r) => ringArea(r) >= 300);
      const open = [...g.fairway, ...g.green, ...g.water.filter((r) => ringArea(r) >= 800)];
      const covered = open.map(centroid).filter((c, k) => pointInRing(c, open[k]) && crowns.some((r) => pointInRing(c, r)));
      expect(covered).toEqual([]);
    });
  }
});
