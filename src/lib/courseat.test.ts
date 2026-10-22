import { describe, expect, it } from 'vitest';
import { pickCourseArea } from './courses';
import type { CourseSummary, LngLat } from '../types';

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
