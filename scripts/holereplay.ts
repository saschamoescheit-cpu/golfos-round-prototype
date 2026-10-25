// Replays the GPS track of a round export (Profil → Deine Daten → Runde exportieren) through the app's hole detection:
// would the app have jumped to a wrong hole somewhere? The truth per moment comes from the round itself – the hole of each
// "Schlag hier" and caddie advice, in time order: a switch is wrong if an earlier hole still has one after it. Built-in courses only (seed geometry); reads the file, writes nothing.
// Usage: npx vite-node scripts/holereplay.ts <golfos-runde-….json> [maxAcc=30]
import { readFileSync } from 'node:fs';
import { SEED_COURSES } from '../src/data/seedCourses';
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
import { holesFromTags } from '../src/lib/courses';
import { detectHole, distToLine, holeMapData } from '../src/lib/geo';
import { holeForTee } from '../src/lib/teeline';
import type { LngLat } from '../src/types';

type Fix = { t: number; p: LngLat; acc?: number };
const file = process.argv[2];
const maxAcc = Number(process.argv[3] ?? 30);
if (!file) {
  console.log('usage: npx vite-node scripts/holereplay.ts <golfos-runde-….json> [maxAcc=30]');
  process.exit(1);
}
const x = JSON.parse(readFileSync(file, 'utf8'));
const r = x.round;
const geo = SEED_GEOMETRY[r.courseId];
const tags = SEED_COURSES[r.courseId]?.holeTags;
if (!geo || !tags) {
  console.log(`${r.courseName}: not a built-in course – nothing to replay`);
  process.exit(0);
}
const all = holesFromTags(tags);
const holes = (r.holes as { loop: string; number: number }[]).map((h) => {
  const tag = all.find((a) => a.loop === h.loop && a.number === h.number);
  const d = holeMapData(geo, h.loop, h.number);
  return d && tag ? holeForTee(d, r.courseId, tag.ref, r.tee, geo.tee) : d;
});

// the hole the player was on: the latest hole with an event ("Schlag hier", caddie advice) at or before t
const events: { t: number; hole: number }[] = [
  ...((r.manualShots ?? []) as { t: number; hole: number }[]).map((s) => ({ t: s.t, hole: s.hole })),
  ...Object.entries((x.caddieLog ?? {}) as Record<string, { t: number }[]>).flatMap(([h, log]) => log.map((e) => ({ t: e.t, hole: Number(h) }))),
].sort((a, b) => a.t - b.t);
const truth = (t: number) => {
  let h = 0;
  for (const e of events) if (e.t <= t) h = Math.max(h, e.hole);
  return h;
};

let current = 0;
let wrong = 0;
let early = 0;
let late = 0;
const track = (x.track as Fix[]).filter((f) => (f.acc ?? 0) <= maxAcc);
for (const f of track) {
  const on = truth(f.t);
  if (on > current) current = on; // the score entry moves on at the latest
  const k = detectHole(f.p, holes, current);
  if (k == null) {
    if (on > current) late++;
    continue;
  }
  // wrong: a shot or advice on an earlier hole still comes afterwards
  if (!events.some((e) => e.t > f.t && e.hole < k)) {
    if (k > current) early++;
    current = k;
  } else {
    wrong++;
    const off = holes[current] ? Math.round(distToLine(f.p, holes[current]!.line)) : -1;
    const to = holes[k] ? Math.round(distToLine(f.p, holes[k]!.line)) : -1;
    console.log(`  wrong: ${new Date(f.t).toTimeString().slice(0, 8)} on ${r.holes[current].label} → ${r.holes[k].label} (${off} m beside ${r.holes[current].label}, ${to} m from ${r.holes[k].label}, ±${f.acc ?? '?'} m)`);
  }
}
console.log(`${r.courseName} ${r.createdAt.slice(0, 10)}: ${track.length} fixes (±${maxAcc} m), wrong jumps ${wrong}, next hole found early ${early}×`);
