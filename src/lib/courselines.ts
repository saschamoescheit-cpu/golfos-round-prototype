// Holes set up by hand, for everyone (Sascha 12.11.2026, night run: "the holes set up by hand on the server – for every
// GolfOS user on that course, not only the own flight"; free data that gets better with every round played). A hole
// line a player sets (tee → green) goes to the table golfos_course_lines (supabase/golfos-course-lines.sql); a phone
// loading the course takes the latest line of each hole the course's map lacks – never over the bundled or mapped
// holes, never over the player's own. Only the line and the course id are stored, no name.
import type { LngLat } from '../types';
import { authToken, SUPABASE_KEY, SUPABASE_URL } from './sync';

const KEY = 'golfos.communitylines.v1.';
const table = () => `${SUPABASE_URL}/rest/v1/golfos_course_lines`;

/** The lines of the course as other players set them, kept from the last read: "loop#number" → tee … green. */
export function loadCommunityLines(courseId: string): Record<string, LngLat[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY + courseId) ?? '{}') as Record<string, LngLat[]>;
  } catch {
    return {};
  }
}

const sane = (line: unknown): line is LngLat[] =>
  Array.isArray(line) && line.length >= 2 && line.length <= 6 && line.every((p) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'number' && Number.isFinite(x)) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);

/** A hole set up here – for everyone. Quietly nothing offline, signed out or before the table is there. */
export async function shareCourseLine(courseId: string, loop: string, number: number, line: LngLat[]): Promise<boolean> {
  if (!courseId || !sane(line)) return false;
  try {
    const t = await authToken();
    if (!t) return false;
    const res = await fetch(`${table()}?on_conflict=course_id,hole_key,by`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ course_id: courseId, hole_key: `${loop}#${number}`, line: line.map(([a, b]) => [Math.round(a * 1e7) / 1e7, Math.round(b * 1e7) / 1e7]), at: new Date().toISOString() }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The course's lines from everyone, the latest of each hole, kept on the phone. True when something new came. */
export async function fetchCourseLines(courseId: string): Promise<boolean> {
  if (!courseId) return false;
  try {
    const t = await authToken();
    if (!t) return false;
    const res = await fetch(`${table()}?course_id=eq.${encodeURIComponent(courseId)}&select=hole_key,line,at&order=at.desc&limit=500`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${t}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return false;
    const rows = (await res.json()) as { hole_key: string; line: unknown; at: string }[];
    const got: Record<string, LngLat[]> = {};
    for (const r of rows) if (!got[r.hole_key] && /^.+#\d+$/.test(r.hole_key) && sane(r.line)) got[r.hole_key] = r.line;
    const before = localStorage.getItem(KEY + courseId) ?? '{}';
    const now = JSON.stringify(got);
    if (before === now) return false;
    try {
      localStorage.setItem(KEY + courseId, now);
    } catch {
      /* storage full: this session only */
    }
    return true;
  } catch {
    return false;
  }
}
