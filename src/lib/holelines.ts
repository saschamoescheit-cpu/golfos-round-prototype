import type { CourseGeometry, LngLat, Round } from '../types';
import { hasGeometry, loadGeometry } from './storage';
import { holesAsLines } from './geo';
import { parseHoleRef } from './loops';
import type { LineOf } from './clubstats';

/** The hole lines of the courses kept on the phone – the target line of a tee shot (its fairway) for the corridor per
 *  club. A course whose map is not on the phone has none: its tee shots simply do not count for the corridor. */
export function lineOfStored(): LineOf {
  const geo = new Map<string, CourseGeometry | null>();
  return (r: Round, i: number): LngLat[] | null => {
    if (!geo.has(r.courseId)) geo.set(r.courseId, hasGeometry(r.courseId) ? holesAsLines(loadGeometry(r.courseId)) : null);
    const g = geo.get(r.courseId);
    const h = r.holes[i];
    if (!g || !h) return null;
    return g.holes.find((x) => {
      const p = parseHoleRef(x.ref);
      return p && p.loop === h.loop && p.number === h.number;
    })?.line ?? null;
  };
}
