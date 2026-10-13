// Tee strategy (feature 017) for every par 4/5 of a course: club, side, what it saves, the sentence.
// Run: npx vite-node scripts/teeplan.ts <courseId> [playing handicap]
import { SEED_COURSES } from '../src/data/seedCourses';
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
import { TEES } from '../src/data/tees';
import { holesFromTags } from '../src/lib/courses';
import { holeMapData, lineLength } from '../src/lib/geo';
import { holeForTee } from '../src/lib/teeline';
import { teeStrategy } from '../src/lib/teestrategy';
import { DEFAULT_CARRY } from '../src/lib/caddie';
import { loadHoleNotes } from '../src/lib/holenotes';
const [courseId, ph = '10'] = process.argv.slice(2);
const geo = SEED_GEOMETRY[courseId];
const tees = TEES[courseId];
const notes = loadHoleNotes(courseId);
for (const h of holesFromTags(SEED_COURSES[courseId].holeTags).filter((x) => (x.par ?? 0) >= 4)) {
  let d = holeMapData(geo, h.loop, h.number);
  if (!d) continue;
  if (tees) d = holeForTee(d, courseId, h.ref, tees.tees.includes('Yellow') ? 'Yellow' : tees.tees[0], geo.tee) ?? d;
  const t0 = Date.now();
  const s = teeStrategy({ data: d, par: h.par!, bag: DEFAULT_CARRY, playing: Number(ph), conditions: null, boundary: geo.boundary, trees: geo.trees, note: notes[h.ref] });
  console.log(`${h.ref.padEnd(4)} par ${h.par} ${Math.round(lineLength(d.line))} m · ${s ? `${s.club} ${s.side >= 0 ? '+' : ''}${s.side} m · ${s.expected} · saves ${s.saved}` : '-'} · ${Date.now() - t0} ms${s?.text ? `\n       „${s.text}“` : ''}`);
}
