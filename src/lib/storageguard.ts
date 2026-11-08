// Storage full (Safari keeps about 5 MB per site): a course map copy that can be loaded again makes room – the one
// used longest ago first, never the map of a course with a round still being played and never the key being written.
// Rounds, GPS tracks, plans, notes and everything the player entered are never removed (night check 22.10.2026: one
// course map from OpenStreetMap takes 0.2–0.4 MB; after a dozen courses looked at, a new round was not saved – silently).

export const GEO = 'golfos.geo.v1.';
const USED = 'golfos.geoused.v1';
const ROUNDS = 'golfos.rounds.v1';
const GAMES = 'golfos.games.v1';
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
  try {
    const rounds = JSON.parse(s.getItem(ROUNDS) ?? '[]') as { courseId: string; finishedAt: string | null }[];
    for (const r of rounds) if (!r.finishedAt) playing.add(GEO + r.courseId);
  } catch {
    // unreadable rounds: no map is protected by them, the key being written still is
  }
  // a game on the map (Games) carries its own round (Sascha 08.11.2026, Celebration: the course map went in the middle
  // of a 5+5+10 – "we had to tap tee and greens")
  try {
    const games = JSON.parse(s.getItem(GAMES) ?? '[]') as { finishedAt: string | null; round?: { courseId?: string } }[];
    for (const g of games) if (!g.finishedAt && g.round?.courseId) playing.add(GEO + g.round.courseId);
  } catch {
    // unreadable games: as above
  }
  for (const id of busy) playing.add(GEO + id);
  const spare: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k && k.startsWith(GEO) && k !== keep && !playing.has(k)) spare.push(k);
  }
  if (spare.length === 0) return false;
  const used = usedMap(s);
  spare.sort((a, b) => (used[a.slice(GEO.length)] ?? 0) - (used[b.slice(GEO.length)] ?? 0));
  s.removeItem(spare[0]);
  return true;
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
