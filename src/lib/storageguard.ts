// Storage full (Safari keeps about 5 MB per site): a course map copy that can be loaded again makes room – the one
// used longest ago first, never the map of a course with a round still being played and never the key being written.
// Rounds, GPS tracks, plans, notes and everything the player entered are never removed (night check 22.10.2026: one
// course map from OpenStreetMap takes 0.2–0.4 MB; after a dozen courses looked at, a new round was not saved – silently).

export const GEO = 'golfos.geo.v1.';
const USED = 'golfos.geoused.v1';
const ROUNDS = 'golfos.rounds.v1';
const GAMES = 'golfos.games.v1';
/** the course details from the course databases – loaded again when the course is opened */
const COURSE = 'golfos.course.v1.';
/** how long an unfinished round or game counts as played now */
const RECENT_MS = 12 * 3600 * 1000;
/** caches and logs loaded again or not needed – they go after the map copies (heights, weather, unsent error reports,
 *  the motion log of Mobility) */
const CACHES = ['golfos.elevation.v1', 'golfos.forecast.v1', 'golfos.weather.v1', 'golfos.errorqueue.v1', 'golfos.mobility.motionlog.v1'];
/** Courses whose map is on screen now (the hole screen open) – never made room with, whatever plays on them. */
const busy = new Set<string>();
export function holdGeometry(courseId: string): () => void {
  busy.add(courseId);
  return () => busy.delete(courseId);
}

let raw: ((this: Storage, key: string, value: string) => void) | null = null;

const store = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

function usedMap(s: Storage): Record<string, number> {
  try {
    return JSON.parse(s.getItem(USED) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

/** Notes that a course map was used now – the one used longest ago makes room first. */
export function touchGeometry(courseId: string): void {
  const s = store();
  if (!s) return;
  try {
    const u = usedMap(s);
    u[courseId] = Date.now();
    (raw ?? s.setItem).call(s, USED, JSON.stringify(u));
  } catch {
    // full – the order is only a hint
  }
}

/** Removes one course map copy that can be loaded again. False: nothing left that may go. */
export function makeRoom(keep: string): boolean {
  const s = store();
  if (!s) return false;
  const playing = new Set<string>();
  const used = usedMap(s);
  // a round or game not finished protects its map only while it is played – its course used in the last 12 hours
  // (Sascha 08.11.2026, Eric and Moritz: "storage full" right after opening the app – every unfinished game of the trip
  // held its map, so none could go)
  const recent = (courseId: string) => Date.now() - (used[courseId] ?? 0) < RECENT_MS;
  try {
    const rounds = JSON.parse(s.getItem(ROUNDS) ?? '[]') as { courseId: string; finishedAt: string | null }[];
    for (const r of rounds) if (!r.finishedAt && recent(r.courseId)) playing.add(GEO + r.courseId);
  } catch {
    // unreadable rounds: no map is protected by them, the key being written still is
  }
  // a game on the map (Games) carries its own round (Sascha 08.11.2026, Celebration: the course map went in the middle
  // of a 5+5+10 – "we had to tap tee and greens")
  try {
    const games = JSON.parse(s.getItem(GAMES) ?? '[]') as { finishedAt: string | null; round?: { courseId?: string } }[];
    for (const g of games) if (!g.finishedAt && g.round?.courseId && recent(g.round.courseId)) playing.add(GEO + g.round.courseId);
  } catch {
    // unreadable games: as above
  }
  for (const id of busy) playing.add(GEO + id);
  const spare: string[] = [];
  const courses: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (!k || k === keep) continue;
    if (k.startsWith(GEO) && !playing.has(k)) spare.push(k);
    else if (k.startsWith(COURSE) && !playing.has(GEO + k.slice(COURSE.length))) courses.push(k);
  }
  if (spare.length) {
    spare.sort((a, b) => (used[a.slice(GEO.length)] ?? 0) - (used[b.slice(GEO.length)] ?? 0));
    s.removeItem(spare[0]);
    return true;
  }
  // no map copy left (Sascha 08.11.2026, Eric: "storage full" with not one round on the phone): what is loaded again
  // from the net at any time – the heights, the weather, the course details of courses not played now, logs
  const cache = CACHES.find((k) => k !== keep && s.getItem(k) != null);
  if (cache) {
    s.removeItem(cache);
    return true;
  }
  if (courses.length) {
    courses.sort((a, b) => (used[a.slice(COURSE.length)] ?? 0) - (used[b.slice(COURSE.length)] ?? 0));
    s.removeItem(courses[0]);
    return true;
  }
  return false;
}

/** Every write to the device storage (all modules): when full, make room and try again; if nothing may go, tell the
 *  player (event "golfos:storagefull") instead of losing the entry silently. */
export function guardStorage(): void {
  const s = store();
  if (raw || !s) return;
  const proto = Object.getPrototypeOf(s) as Storage;
  const orig = proto.setItem;
  raw = orig;
  proto.setItem = function (this: Storage, key: string, value: string) {
    try {
      return orig.call(this, key, value);
    } catch (e) {
      if (this !== store()) throw e;
      while (makeRoom(key)) {
        try {
          return orig.call(this, key, value);
        } catch {
          // still too little room: the next map
        }
      }
      try {
        globalThis.dispatchEvent?.(new CustomEvent('golfos:storagefull', { detail: key }));
      } catch {
        // no window (tests)
      }
      throw e;
    }
  };
}
