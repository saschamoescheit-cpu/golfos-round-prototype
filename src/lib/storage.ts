import type { Course, CourseGeometry, LngLat, Round } from '../types';
import { SEED_LOADERS } from '../data/seedLoaders';
import type { ImageryId } from './imagery';
import type { CarryBag } from './caddie';
import { holesAsLines } from './geo';
import { CARDS, LINES as COURSE_LINES } from '../data/cards';
import { GEO, touchGeometry } from './storageguard';
import { decodeTrack } from './trackcodec';

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

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Storage full or blocked – the round stays in memory for this session.
    return false;
  }
}

export function loadRounds(): Round[] {
  return read<Round[]>(ROUNDS, []);
}

export function saveRound(round: Round): void {
  const rounds = loadRounds().filter((r) => r.id !== round.id);
  write(ROUNDS, [round, ...rounds]);
}

const ROUND_KEYS = ['golfos.track.v1.', 'golfos.live.v1.', 'golfos.caddielog.v1.'];
const TRASH = 'golfos.trash.v1';

/** A round the player deleted – kept with its GPS track until he deletes it for good (Sascha 15.10.2026: "deleted
 *  rounds, in case one was deleted by mistake"). Never emptied automatically. */
export interface TrashedRound {
  round: Round;
  keys: Record<string, string>;
  deletedAt: string;
}
export const loadTrash = (): TrashedRound[] => read<TrashedRound[]>(TRASH, []);
/** The last round the player deleted, for "Undo" (Sascha 15.10.2026: one tap to delete, no second question). */
let undoSnap: { round: Round; keys: Record<string, string> } | null = null;

/** Deletes a round the player wants gone – with its GPS track, plan and caddie notes, so it does not come back.
 *  `undoable`: the player deleted it himself – it can be brought back for a few seconds ("Undo").
 *  `toBin`: the app tidies up – the round goes to the bin without a word, never gone without the player. */
export function deleteRound(id: string, undoable = false, toBin = false): void {
  const round = loadRounds().find((r) => r.id === id);
  const keys: Record<string, string> = {};
  write(ROUNDS, loadRounds().filter((r) => r.id !== id));
  try {
    for (const k of ROUND_KEYS) {
      const v = localStorage.getItem(k + id);
      if (v != null) keys[k + id] = v;
      localStorage.removeItem(k + id);
    }
  } catch {
    /* storage blocked */
  }
  if ((undoable || toBin) && round && !round.preview) {
    write(TRASH, [{ round, keys, deletedAt: new Date().toISOString() }, ...loadTrash().filter((t) => t.round.id !== id)]);
    if (undoable) {
      undoSnap = { round, keys };
      window.dispatchEvent(new CustomEvent('golfos:deleted', { detail: { kind: 'round', id, label: round.courseName } }));
    }
  }
}

/** Brings the last deleted round back, with its track; tells the app to reload the rounds. */
export function undoDelete(): boolean {
  if (!undoSnap) return false;
  const { round } = undoSnap;
  undoSnap = null;
  return restoreRound(round.id);
}

/** Brings a deleted round back from the bin, with its track. */
export function restoreRound(id: string): boolean {
  const t = loadTrash().find((x) => x.round.id === id);
  if (!t) return false;
  saveRound(t.round);
  try {
    for (const [k, v] of Object.entries(t.keys)) localStorage.setItem(k, v);
  } catch {
    /* storage full */
  }
  write(TRASH, loadTrash().filter((x) => x.round.id !== id));
  window.dispatchEvent(new Event('golfos:rounds-changed'));
  return true;
}

/** The player empties one round from the bin – the only way a played round goes for good. */
export function purgeRound(id: string): void {
  write(TRASH, loadTrash().filter((x) => x.round.id !== id));
  window.dispatchEvent(new Event('golfos:rounds-changed'));
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


// v2 (2026-10-10): Son Quint now ships with all 18 holes; hand-made v1 lines from the course test are dropped.
const LINES = 'golfos.holelines.v2.';

/** Hole lines the player set up on the course (tee → green), keyed "loop#number". */
// The storage full (Sascha 08.11.2026, Celebration: "we had to tap tee and greens – later that did not work either"):
// what could not be written stays in memory for this session – the hole set up is there, the map does not go.
const linesKept = new Map<string, Record<string, LngLat[]>>();
const geoKept = new Map<string, CourseGeometry>();

export function loadHoleLines(courseId: string): Record<string, LngLat[]> {
  return { ...read<Record<string, LngLat[]>>(LINES + courseId, {}), ...(linesKept.get(courseId) ?? {}) };
}

export function saveHoleLine(courseId: string, loop: string, number: number, line: LngLat[]): void {
  const all = { ...loadHoleLines(courseId), [`${loop}#${number}`]: line };
  if (write(LINES + courseId, all)) linesKept.delete(courseId);
  else linesKept.set(courseId, all);
}

/** The player's own marking of a hole taken away, asked for by him (Sascha 11.11.2026, Moritz on Cypress: a hole set by
 *  hand wrongly wins over the course map – "Platzkarte verwenden"): the course's map (or the others' line) again. */
export function removeHoleLine(courseId: string, loop: string, number: number): void {
  const all = { ...loadHoleLines(courseId) };
  delete all[`${loop}#${number}`];
  if (write(LINES + courseId, all)) linesKept.delete(courseId);
  else linesKept.set(courseId, all);
  refuseFlightLines(courseId, [`${loop}#${number}`]);
}

// The lines the event's other phones set up (lib/courselines keeps them) – over the course map (Sascha 11.11.2026: a hole
// marked anew "goes to everyone on the course"); "Platzkarte verwenden" refuses the very line taken, a newer one comes
// through again (gate 13.11.2026, sharelines)
const FLIGHT_LINES = 'golfos.flightlines.v1.';
const REFUSED = 'golfos.flightrefused.v1.';
/** The flight's lines of a course not refused by the player: "loop#number" → tee … green. */
export function flightLines(courseId: string): Record<string, LngLat[]> {
  const lines = read<Record<string, LngLat[]>>(FLIGHT_LINES + courseId, {});
  const refused = read<Record<string, string>>(REFUSED + courseId, {});
  return Object.fromEntries(Object.entries(lines).filter(([k, l]) => refused[k] !== JSON.stringify(l)));
}
function refuseFlightLines(courseId: string, keys: string[] | null): void {
  const lines = read<Record<string, LngLat[]>>(FLIGHT_LINES + courseId, {});
  const refused = { ...read<Record<string, string>>(REFUSED + courseId, {}) };
  for (const k of keys ?? Object.keys(lines)) if (lines[k]) refused[k] = JSON.stringify(lines[k]);
  write(REFUSED + courseId, refused);
}
/** All the player's own markings of a course taken away, asked for by him: the course map (or the others' lines) again. */
export function removeAllHoleLines(courseId: string): void {
  if (write(LINES + courseId, {})) linesKept.delete(courseId);
  else linesKept.set(courseId, {});
  refuseFlightLines(courseId, null);
}
/** Is a marking over the course map – the player's own, or one of his flight's he has not refused ("Platzkarte")? */
export const hasOwnHoleLine = (courseId: string, loop: string, number: number): boolean => !!loadHoleLines(courseId)[`${loop}#${number}`] || !!flightLines(courseId)[`${loop}#${number}`];

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
  touchGeometry(courseId); // used now – a map not used for long makes room first when the storage is full
  // holes mapped as areas become playing lines – for every part of the app that reads the course (22.10.2026)
  const stored = seeds.get(courseId) ?? read<CourseGeometry | null>(GEO + courseId, null);
  // read once this session: kept, should the copy go to make room (or never have fitted)
  if (stored && !seeds.has(courseId)) geoKept.set(courseId, stored);
  let base: CourseGeometry = holesAsLines(stored ?? geoKept.get(courseId) ?? { holes: [], green: [], tee: [], bunker: [], fairway: [], water: [] });
  // no holes in the map, but worked out for this course (Hawks Landing, 27.10.2026): those, with par and stroke index
  if (!base.holes.length && COURSE_LINES[courseId]) {
    const card = CARDS[courseId] ?? [];
    base = { ...base, holes: COURSE_LINES[courseId].map((line, k) => ({ ref: String(k + 1), par: card[k]?.par ?? null, handicap: card[k]?.handicap ?? null, line })) };
  }
  // holes other players set up on this course (lib/courselines, 12.11.2026) – only where the map has none
  // …and the lines the event's other phones set up (kept apart from the own since 11.11.2026), the server's latest over them
  const community = read<Record<string, LngLat[]>>('golfos.communitylines.v1.' + courseId, {});
  if (Object.keys(community).length) {
    const have = new Set(base.holes.filter((h) => h.line && h.line.length >= 2).map((h) => h.ref));
    const add = Object.entries(community)
      .map(([key, line]) => {
        const [loop, num] = key.split('#');
        return { ref: holeLabel(loop, Number(num)), line };
      })
      .filter((h) => !have.has(h.ref));
    if (add.length) base = { ...base, holes: [...base.holes.filter((h) => !add.some((a) => a.ref === h.ref)), ...add] };
  }
  // the flight's lines over the map (a hole marked anew comes through), the player's own over them
  const flight = flightLines(courseId);
  if (Object.keys(flight).length) {
    const add = Object.entries(flight).map(([key, line]) => {
      const [loop, num] = key.split('#');
      const ref = holeLabel(loop, Number(num));
      // the map's par and stroke index kept – only the line is the flight's
      return { ...(base.holes.find((h) => h.ref === ref) ?? {}), ref, line };
    });
    base = { ...base, holes: [...base.holes.filter((h) => !add.some((a) => a.ref === h.ref)), ...add] };
  }
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
  geoKept.set(courseId, geometry);
  if (write(GEO + courseId, geometry)) touchGeometry(courseId);
}

/** The course map copy is on the device (it may have made room for a round, or never fitted). */
export function hasGeometry(courseId: string): boolean {
  try {
    return localStorage.getItem(GEO + courseId) != null;
  } catch {
    return false;
  }
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
  voice: boolean; // read the caddie's advice aloud by itself (with headphones; default off – Sascha 15.10.2026)
  greenSpeed: 'slow' | 'medium' | 'fast'; // for the putt read: Stimp 8.5 / 9.5 / 11
}
export function loadCaddieSettings(): CaddieSettings {
  // green speed is no setting any more (Sascha 15.10.2026): the putt line reads club greens (medium)
  return { caddie: true, greenSlope: true, missMap: false, style: 'normal', favourite: 90, voice: false, ...read<Partial<CaddieSettings>>(CADDIE, {}), greenSpeed: 'medium' };
}
export function saveCaddieSettings(s: CaddieSettings): void {
  write(CADDIE, s);
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Rounds left open by accident (Sascha 14.10.2026: after cancelling a round an older one showed "Continue round"):
 * open rounds other than `keep` and older than `maxAgeH` hours are finished. Only a round with neither a score nor a
 * GPS track goes – into the bin – a round played without entering a score is still a round (15.10.2026: Son Gual was lost).
 */
export function closeStaleRounds(maxAgeH: number, keep: string | null = null): void {
  for (const r of loadRounds()) {
    if (r.finishedAt || r.id === keep || Date.now() - Date.parse(r.createdAt) < maxAgeH * 3600 * 1000) continue;
    const scored = Object.values(r.entries).some((list) => list.some((e) => e.strokes != null || e.pickedUp));
    let tracked = false;
    try {
      tracked = decodeTrack(localStorage.getItem('golfos.track.v1.' + r.id)).length >= 30;
    } catch {
      tracked = false;
    }
    if (scored || tracked) saveRound({ ...r, finishedAt: r.createdAt });
    // not even a score: into the bin, not gone – the player empties the bin himself (night check 22.10.2026; the app
    // deletes nothing of the player's on its own since Son Gual, 14.10.)
    else deleteRound(r.id, false, true);
  }
}
