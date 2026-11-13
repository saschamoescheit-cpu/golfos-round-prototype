// Holes set up by hand, for everyone (Sascha 12.11.2026, night run: "the holes set up by hand on the server – for every
// GolfOS user on that course, not only the own flight"; free data that gets better with every round played). A hole
// line a player sets (tee → green) goes to the table golfos_course_lines (supabase/golfos-course-lines.sql); a phone
// loading the course takes the latest line of each hole the course's map lacks – never over the bundled or mapped
// holes, never over the player's own. Only the line and the course id are stored, no name.
import type { LngLat } from '../types';
import { authToken, SUPABASE_KEY, SUPABASE_URL } from './sync';
import { loadHoleLines } from './storage';

const KEY = 'golfos.communitylines.v1.';
/** the lines other phones of the event set up (the flight's exchange) – kept apart from the player's own, so a correction
 *  of them comes through; they replace the map's hole, the player's own and "Platzkarte verwenden" win over them
 *  (storage.ts flightLines/loadGeometry, Sascha 11.11.2026, Moritz on Cypress) */
const FLIGHT = 'golfos.flightlines.v1.';
const table = () => `${SUPABASE_URL}/rest/v1/golfos_course_lines`;

/** The lines of the event's other phones taken – replacing what came before (a hole marked anew comes through). True
 *  when something changed. */
export function keepFlightLines(courseId: string, lines: Record<string, LngLat[]>): boolean {
  const ok: Record<string, LngLat[]> = {};
  for (const [k, line] of Object.entries(lines)) if (/^.+#\d+$/.test(k) && sane(line)) ok[k] = line;
  try {
    const before = localStorage.getItem(FLIGHT + courseId) ?? '{}';
    const now = JSON.stringify(ok);
    if (before === now) return false;
    localStorage.setItem(FLIGHT + courseId, now);
    return true;
  } catch {
    return false;
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

/** The holes this phone marked on the course, sent (again) – once a session per course: lines set before the table was
 *  there, or offline, reach the others too (Sascha 11.11.2026: "manuell gesetzte Abschläge und Grüns automatisch für
 *  alle"). The server keeps one line per player and hole – sending it again changes nothing. */
const sentOwn = new Set<string>();
export async function shareOwnLines(courseId: string): Promise<void> {
  if (!courseId || sentOwn.has(courseId)) return;
  const own = loadHoleLines(courseId);
  const keys = Object.keys(own);
  if (!keys.length) return;
  sentOwn.add(courseId);
  const ok = await Promise.all(
    keys.map((k) => {
      const [loop, num] = k.split('#');
      return shareCourseLine(courseId, loop, Number(num), own[k]);
    }),
  );
  if (ok.some((x) => !x)) sentOwn.delete(courseId); // offline, signed out: next time again
}

/** The course's lines from everyone, the latest of each hole, kept on the phone. True when something new came. */
export async function fetchCourseLines(courseId: string): Promise<boolean> {
  if (!courseId) return false;
  void shareOwnLines(courseId);
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
