// Where does the caddie say "lay up instead of going for the green"? Every hole of every bundled course,
// from 180, 200 and 220 m on the hole line, handicap 8 and 18.
import { SEED_COURSES } from '../src/data/seedCourses';
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
import { TEES } from '../src/data/tees';
import { holesFromTags } from '../src/lib/courses';
import { holeMapData, lineLength, pointAt } from '../src/lib/geo';
import { holeForTee } from '../src/lib/teeline';
import { aimPoint } from '../src/lib/aimpoint';
import { DEFAULT_CARRY } from '../src/lib/caddie';
let n = 0;
let lay = 0;
for (const [id, seed] of Object.entries(SEED_COURSES)) {
  const geo = SEED_GEOMETRY[id];
  if (!geo) continue;
  for (const h of holesFromTags(seed.holeTags).filter((x) => (x.par ?? 0) >= 4)) {
    let d = holeMapData(geo, h.loop, h.number);
    if (!d) continue;
    const tees = TEES[id];
    if (tees) d = holeForTee(d, id, h.ref, tees.tees.includes('Yellow') ? 'Yellow' : tees.tees[0], geo.tee) ?? d;
    const L = lineLength(d.line);
    for (const left of [180, 200, 220]) {
      if (L - left < 120) continue;
      for (const ph of [8, 18]) {
        n++;
        const ap = aimPoint({ data: d, from: pointAt(d.line, L - left), pin: d.greenCenter, par: h.par!, teeShot: false, bag: DEFAULT_CARRY, conditions: null, tendency: new Map(), boundary: geo.boundary, trees: geo.trees, playing: ph, favourite: 90 });
        const r = ap.reasons.find((x) => /lay up|Vorlegen/i.test(x));
        if (r) {
          lay++;
          console.log(`${seed.name.slice(0, 22).padEnd(22)} ${h.ref.padEnd(4)} from ${left} m, hcp ${ph}: ${r}`);
        }
      }
    }
  }
}
console.log(`lay-up advised in ${lay} of ${n} long approach spots`);
