import type { Course, CourseGeometry, LngLat, Round } from '../types';
import { SEED_GEOMETRY } from '../data/seedGeometry';

// Everything is stored on the device (localStorage). No account, no cloud – prototype only.

const ROUNDS = 'golfos.rounds.v1';
const COURSE = 'golfos.course.v1.';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked – the round stays in memory for this session.
  }
}

export function loadRounds(): Round[] {
  return read<Round[]>(ROUNDS, []);
}

export function saveRound(round: Round): void {
  const rounds = loadRounds().filter((r) => r.id !== round.id);
  write(ROUNDS, [round, ...rounds]);
}

export function deleteRound(id: string): void {
  write(ROUNDS, loadRounds().filter((r) => r.id !== id));
}

export function loadCachedCourse(id: string): Course | null {
  return read<Course | null>(COURSE + id, null);
}

export function saveCachedCourse(course: Course): void {
  write(COURSE + course.id, course);
}

/** Stores a par / stroke index the player completed by hand, so the next round has it. */
export function saveHoleCorrection(courseId: string, loop: string, number: number, par: number, strokeIndex: number): void {
  const course = loadCachedCourse(courseId);
  if (!course) return;
  const hole = course.holes.find((h) => h.loop === loop && h.number === number);
  if (!hole) return;
  if (par > 0) hole.par = par;
  if (strokeIndex > 0 && !hole.strokeIndex.includes(strokeIndex)) hole.strokeIndex = [strokeIndex];
  saveCachedCourse(course);
}

const GEO = 'golfos.geo.v1.';

const LINES = 'golfos.holelines.v1.';

/** Hole lines the player set up on the course (tee → green), keyed "loop#number". */
export function loadHoleLines(courseId: string): Record<string, LngLat[]> {
  return read<Record<string, LngLat[]>>(LINES + courseId, {});
}

export function saveHoleLine(courseId: string, loop: string, number: number, line: LngLat[]): void {
  write(LINES + courseId, { ...loadHoleLines(courseId), [`${loop}#${number}`]: line });
}

function holeLabel(loop: string, number: number): string {
  if (loop === 'Main') return String(number);
  return loop.length === 1 ? `${number}${loop}` : `${loop} ${number}`;
}

/**
 * Course map geometry: bundled snapshot (test courses) or the copy saved when the course was loaded,
 * plus hole lines the player set up himself (these replace mapped lines of the same hole).
 * Returns an empty geometry rather than null, so a hole can always be set up on the satellite map.
 */
export function loadGeometry(courseId: string): CourseGeometry {
  const base: CourseGeometry =
    SEED_GEOMETRY[courseId] ?? read<CourseGeometry | null>(GEO + courseId, null) ?? { holes: [], green: [], tee: [], bunker: [], fairway: [], water: [] };
  const own = loadHoleLines(courseId);
  if (Object.keys(own).length === 0) return base;
  const ownHoles = Object.entries(own).map(([key, line]) => {
    const [loop, num] = key.split('#');
    return { ref: holeLabel(loop, Number(num)), line };
  });
  const ownRefs = new Set(ownHoles.map((h) => h.ref));
  return { ...base, holes: [...base.holes.filter((h) => !ownRefs.has(h.ref)), ...ownHoles] };
}

export function saveGeometry(courseId: string, geometry: CourseGeometry): void {
  write(GEO + courseId, geometry);
}

const UNIT = 'golfos.unit.v1';
export function loadUnit(): 'm' | 'yd' {
  return read<'m' | 'yd'>(UNIT, 'm');
}
export function saveUnit(unit: 'm' | 'yd'): void {
  write(UNIT, unit);
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
