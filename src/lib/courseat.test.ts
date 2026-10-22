import { describe, expect, it } from 'vitest';
import { pickCourseArea, withCardValues } from './courses';
import type { Course, CourseHole, CourseSummary, LngLat } from '../types';

// two neighbouring courses as the OSM API returns them around a point
function osmWith(areas: { id: string; name: string; ring: LngLat[] }[]) {
  const nodes = new Map<string, LngLat>();
  const ways = areas.map((a, k) => {
    const ids = a.ring.map((p, i) => {
      const id = `${k}-${i}`;
      nodes.set(id, p);
      return id;
    });
    return { id: a.id, tags: { leisure: 'golf_course', name: a.name }, nodes: [...ids, ids[0]] };
  });
  return { nodes, ways, relations: [] };
}
const square = (lon: number, lat: number, d = 0.004): LngLat[] => [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d]];
const oga = (name: string, lon: number, lat: number): CourseSummary => ({ id: 'oga:x', source: 'opengolfapi', name, place: '', lat, lon });

describe('the OSM course at an OpenGolfAPI entry', () => {
  const osm = osmWith([
    { id: '1', name: 'Golf Club Hubbelrath', ring: square(6.92, 51.258) },
    { id: '2', name: 'Kosaido Golfclub', ring: square(6.918, 51.2465) },
  ]);
  it('the one with a word of its name, with its area', () => {
    const c = pickCourseArea(osm, oga('Golf Club Hubbelrath', 6.9261, 51.2594));
    expect(c?.id).toBe('osm:way/1');
    expect(c?.source).toBe('osm');
    [6.92, 51.258, 6.924, 51.262].forEach((v, i) => expect(c?.bbox?.[i]).toBeCloseTo(v, 6));
  });
  it('without a name match the area the point lies in', () => {
    expect(pickCourseArea(osm, oga('GC Düsseldorf-Ost', 6.922, 51.26))?.id).toBe('osm:way/1');
  });
  it('never a neighbour by guess', () => {
    expect(pickCourseArea(osm, oga('Golfclub Am Elfrather Mühlenhof', 6.95, 51.3))).toBeNull();
  });
});

describe('par and Hcp from the OpenGolfAPI scorecard', () => {
  const hole = (n: number, par: number | null, si: number[] = []): CourseHole => ({ ref: String(n), loop: 'Main', number: n, par, strokeIndex: si });
  const course = (holes: CourseHole[], loops = ['Main']): Course => ({ id: 'osm:way/1', source: 'osm', name: 'X', lat: 0, lon: 0, holes, loops });
  it('fills what OSM lacks, keeps what it has', () => {
    const c = withCardValues(course([hole(1, null), hole(2, 3, [17])]), [hole(1, 4, [5]), hole(2, 4, [9])]);
    expect(c.holes[0]).toMatchObject({ par: 4, strokeIndex: [5] });
    expect(c.holes[1]).toMatchObject({ par: 3, strokeIndex: [17] });
  });
  it('nothing missing or a course of several loops: unchanged', () => {
    const full = course([hole(1, 4, [3])]);
    expect(withCardValues(full, [hole(1, 5, [1])])).toBe(full);
    const loops = course([hole(1, null)], ['A', 'B']);
    expect(withCardValues(loops, [hole(1, 4)])).toBe(loops);
  });
});
