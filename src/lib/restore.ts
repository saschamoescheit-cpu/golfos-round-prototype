import type { Course, Player, Round } from '../types';
import { loadCachedCourse, loadRounds, saveRound } from './storage';
import { holesFromTags } from './courses';
import { buildRoundHoles, loopOptions } from './loops';
import { emptyEntry } from './scoring';
import { distanceM } from './geo';
import { fullName, loadProfile } from './profile';
import { SEED_COURSES } from '../data/seedCourses';
import { tr } from './i18n';

// Rounds lost on the phone (Sascha 15.10.2026: "yesterday's round at Son Gual is gone" – the tidy-up of 14.10. deleted
// open rounds without a score): their GPS track stayed. A track without a round becomes a finished round again, on
// the course where it was walked, so the shots can be checked. Rounds the player deletes himself take their track with
// them (storage.deleteRound) and do not come back.

const TRACK = 'golfos.track.v1.';
type Row = [number, number, number, number, 1?];

function coursesOnPhone(): Course[] {
  const out = new Map<string, Course>();
  try {
    for (let k = 0; k < localStorage.length; k++) {
      const key = localStorage.key(k)!;
      if (!key.startsWith('golfos.course.v1.')) continue;
      const c = loadCachedCourse(key.slice('golfos.course.v1.'.length));
      if (c && c.holes.length >= 9) out.set(c.id, c);
    }
  } catch {
    /* storage blocked */
  }
  for (const [id, s] of Object.entries(SEED_COURSES)) {
    if (out.has(id)) continue;
    const holes = holesFromTags(s.holeTags);
    out.set(id, { id, source: 'osm', name: s.name, lat: s.lat, lon: s.lon, holes, loops: [...new Set(holes.map((h) => h.loop))] });
  }
  return [...out.values()];
}

/** Turns GPS tracks without a round back into rounds. Returns how many were restored. */
export function restoreLostRounds(): number {
  let restored = 0;
  try {
    const ids = new Set(loadRounds().map((r) => r.id));
    const keys: string[] = [];
    for (let k = 0; k < localStorage.length; k++) {
      const key = localStorage.key(k)!;
      if (key.startsWith(TRACK) && !ids.has(key.slice(TRACK.length))) keys.push(key);
    }
    if (!keys.length) return 0;
    const courses = coursesOnPhone();
    const remembered = (() => {
      try {
        return JSON.parse(localStorage.getItem('golfos.me.v1') ?? 'null') as { name?: string; handicap18?: string; handicap?: string; tees?: Record<string, string> } | null;
      } catch {
        return null;
      }
    })();
    for (const key of keys) {
      const rows = JSON.parse(localStorage.getItem(key) ?? '[]') as Row[];
      if (rows.length < 30) continue; // a few fixes are no round
      const mid = rows[rows.length >> 1];
      const at: [number, number] = [mid[1], mid[2]];
      const course = courses
        .map((c) => ({ c, d: distanceM(at, [c.lon, c.lat]) }))
        .filter((x) => x.d < 3000)
        .sort((a, b) => a.d - b.d)[0]?.c;
      if (!course) continue;
      const option = loopOptions(course.holes).find((o) => o.label.includes('18')) ?? loopOptions(course.holes)[0];
      if (!option) continue;
      const holes = buildRoundHoles(course.holes, option);
      const hcp = Number((remembered?.handicap18 ?? remembered?.handicap ?? '').replace(',', '.'));
      const me: Player = {
        id: 'me',
        name: fullName(loadProfile()) || remembered?.name || tr('Me', 'Ich'),
        playingHandicap: remembered?.handicap18 && Number.isFinite(hcp) ? Math.round(holes.length === 9 ? hcp / 2 : hcp) : null,
        isMe: true,
      };
      const id = key.slice(TRACK.length);
      const round: Round = {
        id,
        createdAt: new Date(rows[0][0]).toISOString(),
        finishedAt: new Date(rows[rows.length - 1][0]).toISOString(),
        courseId: course.id,
        courseName: course.name,
        loopOrder: option.loops,
        holes,
        mode: 'quick',
        players: [me],
        entries: { me: holes.map(() => emptyEntry()) },
        currentHole: 0,
        restored: true,
        ...(remembered?.tees?.[course.id] ? { tee: remembered.tees[course.id] } : {}),
      };
      saveRound(round);
      restored++;
    }
  } catch {
    /* storage blocked or damaged – nothing to restore */
  }
  return restored;
}
