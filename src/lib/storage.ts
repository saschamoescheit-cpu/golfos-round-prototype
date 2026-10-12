import type { Course, CourseGeometry, LngLat, Round } from '../types';
import { SEED_LOADERS } from '../data/seedLoaders';
import type { ImageryId } from './imagery';
import type { CarryBag } from './caddie';

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

// v2 (2026-10-10): Son Quint now ships with all 18 holes; hand-made v1 lines from the course test are dropped.
const LINES = 'golfos.holelines.v2.';

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
// Bundled courses are loaded on demand (feature 026); ensureGeometry() before a screen that needs the map.
const seeds = new Map<string, CourseGeometry>();
const tried = new Set<string>();
export const geometryReady = (courseId: string): boolean => !SEED_LOADERS[courseId] || seeds.has(courseId) || tried.has(courseId);
export async function ensureGeometry(courseId: string): Promise<void> {
  if (geometryReady(courseId)) return;
  try {
    seeds.set(courseId, await SEED_LOADERS[courseId]());
  } catch {
    // offline and not cached yet: the course plays with what the device has (or is set up on the map)
  } finally {
    tried.add(courseId);
  }
}

export function loadGeometry(courseId: string): CourseGeometry {
  const base: CourseGeometry =
    seeds.get(courseId) ?? read<CourseGeometry | null>(GEO + courseId, null) ?? { holes: [], green: [], tee: [], bunker: [], fairway: [], water: [] };
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

/** Imagery the player picked on the map (null = best source for the place). */
const IMAGERY = 'golfos.imagery.v1';
export function loadImagery(): ImageryId | null {
  return read<ImageryId | null>(IMAGERY, null);
}
export function saveImagery(id: ImageryId): void {
  write(IMAGERY, id);
}

/** Live state of a round on the map, so nothing is lost when iOS reloads the page while the phone is in the pocket. */
export interface LiveState {
  plans: Record<number, { targets: LngLat[]; pin: LngLat | null }>; // per hole index
  shotStart: LngLat | null; // "Mark ball" position
  lastShot: number | null; // metres of the last measured shot
}
const LIVE = 'golfos.live.v1.';
export function loadLive(roundId: string): LiveState {
  return read<LiveState>(LIVE + roundId, { plans: {}, shotStart: null, lastShot: null });
}
export function saveLive(roundId: string, live: LiveState): void {
  write(LIVE + roundId, live);
}

/** When the course imagery was last saved for offline use (per course and imagery source). */
const OFFLINE = 'golfos.offline.v1.';
export function loadOfflineStamp(courseId: string, imageryId: string): number {
  return read<number>(`${OFFLINE}${courseId}.${imageryId}`, 0);
}
export function saveOfflineStamp(courseId: string, imageryId: string): void {
  write(`${OFFLINE}${courseId}.${imageryId}`, Date.now());
}

/** The player's carry distances (AI caddie, "My bag"); null until he saved them. */
const BAG = 'golfos.bag.v1';
export function loadCarryBag(): CarryBag | null {
  const b = read<CarryBag | null>(BAG, null);
  // values saved by older versions without a check: keep only believable carries
  const ok = Array.isArray(b) ? b.filter((x) => x && typeof x.carry === 'number' && x.carry >= 20 && x.carry <= 400) : [];
  return ok.length ? ok : null;
}
export function saveCarryBag(bag: CarryBag): void {
  write(BAG, bag);
}

/** AI caddie and green reading switched on/off by the player. */
const CADDIE = 'golfos.caddie.v1';
export interface CaddieSettings {
  caddie: boolean;
  greenSlope: boolean;
  missMap: boolean;
  style: 'safe' | 'normal' | 'aggressive';
  favourite: number; // favourite approach distance (m) for layups
  voice: boolean; // read the caddie's advice aloud
}
export function loadCaddieSettings(): CaddieSettings {
  return { caddie: true, greenSlope: true, missMap: false, style: 'normal', favourite: 90, voice: false, ...read<Partial<CaddieSettings>>(CADDIE, {}) };
}
export function saveCaddieSettings(s: CaddieSettings): void {
  write(CADDIE, s);
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
