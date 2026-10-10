import type { Course, Round } from '../types';

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

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
