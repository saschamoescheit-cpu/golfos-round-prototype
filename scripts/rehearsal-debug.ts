// The dress rehearsal's walk (pw/qa_het9.mjs) replayed against the round split and the detection.
import { SEED_COURSES } from '../src/data/seedCourses';
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
import { holesFromTags } from '../src/lib/courses';
import { distanceM, holeMapData, lineLength, pointAt } from '../src/lib/geo';
import { holeForTee } from '../src/lib/teeline';
import { detectHoleShots, splitRound, type TrackPoint } from '../src/lib/track';
import type { LngLat } from '../src/types';
const id = 'osm:relation/1326323';
const geo = SEED_GEOMETRY[id];
const holes = holesFromTags(SEED_COURSES[id].holeTags).filter((h) => h.loop === 'A' && h.par).map((h) => {
  const d = holeForTee(holeMapData(geo, h.loop, h.number)!, id, h.ref, 'Yellow', geo.tee)!;
  const L = lineLength(d.line);
  const balls: LngLat[] = [d.tee];
  if (h.par! >= 4) balls.push(pointAt(d.line, Math.min(205, L - 140)));
  if (h.par === 5) balls.push(pointAt(d.line, L - 110));
  return { ref: h.ref, par: h.par!, d, balls, green: pointAt(d.line, L - 3) };
});
let t = 0;
const track: TrackPoint[] = [];
const fix = (p: LngLat, open = false) => { t += 2000; track.push({ t, p, acc: 6, ...(open ? { open: true } : {}) }); };
for (const h of holes) {
  for (const [k, ball] of h.balls.entries()) {
    if (k > 0) { t += 60000; } // walking with the phone locked
    for (let s = 0; s < 6; s++) fix(ball, s === 0);
  }
  t += 60000;
  for (let s = 0; s < 7; s++) fix(h.green, s === 0);
}
const parts = splitRound(track, holes.map((h) => h.d));
holes.forEach((h, n) => {
  const part = parts[n];
  const det = detectHoleShots(part, h.d, h.par);
  const nextTee = holes[n + 1]?.d.tee;
  console.log(h.ref, 'part', part.length, 'shots', det?.shots.length ?? '-', 'green', det?.onGreen ? 'yes' : 'no', nextTee ? `| next tee ${Math.round(distanceM(nextTee, h.green))} m from this green, ${Math.round(distanceM(nextTee, h.d.greenCenter))} m from its centre` : '');
});
