// The caddie card as the player sees it, at typical spots of every hole (tee, landing zone, 150 m, 90 m, 40 m,
// and 30 m right of the line in the rough) – to read the texts with a golfer's eye.
// Run: npx tsx scripts/caddiecards.ts <courseId> [playing handicap] [loop]
import { SEED_COURSES } from '../src/data/seedCourses';
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
import { TEES } from '../src/data/tees';
import { holesFromTags } from '../src/lib/courses';
import { bearingDeg, distanceM, holeMapData, lineLength, pointAt } from '../src/lib/geo';
import { holeForTee } from '../src/lib/teeline';
import { caddieAdvice, teeAimFor } from '../src/lib/caddieplan';
import { DEFAULT_CARRY } from '../src/lib/caddie';
import { withPartials } from '../src/lib/partials';
const BAG = withPartials(DEFAULT_CARRY, {});
import { loadHoleNotes } from '../src/lib/holenotes';
import { setLang } from '../src/lib/i18n';
import type { LngLat } from '../src/types';

const [courseId = 'osm:relation/1326323', ph = '8', loop = 'A'] = process.argv.slice(2);
setLang('de');
const geo = SEED_GEOMETRY[courseId];
const seed = SEED_COURSES[courseId];
const tees = TEES[courseId];
const notes = loadHoleNotes(courseId);
const playing = Number(ph);
const move = (p: LngLat, b: number, m: number): LngLat => {
  const r = (b * Math.PI) / 180;
  return [p[0] + (m * Math.sin(r)) / (111320 * Math.cos((p[1] * Math.PI) / 180)), p[1] + (m * Math.cos(r)) / 111320];
};
for (const h of holesFromTags(seed.holeTags).filter((x) => x.par != null && (!loop || x.loop === loop))) {
  let d = holeMapData(geo, h.loop, h.number);
  if (!d) continue;
  if (tees) d = holeForTee(d, courseId, h.ref, tees.tees.includes('Yellow') ? 'Yellow' : tees.tees[0], geo.tee) ?? d;
  const note = notes[h.ref] ?? {};
  const terrain = { slopes: geo.fairwaySlopes?.[h.ref], boundary: geo.boundary, trees: geo.trees };
  const L = lineLength(d.line);
  const teeAim = teeAimFor({ data: d, par: h.par!, pin: d.greenCenter, bag: BAG, conditions: null, tendency: new Map(), ...terrain, note, playing } as Parameters<typeof teeAimFor>[0]);
  const spots: [string, LngLat, boolean][] = [['Abschlag', d.tee, true]];
  for (const left of [150, 90, 40]) if (L - left > 60) spots.push([`${left} m`, pointAt(d.line, L - left), false]);
  if (L > 200) {
    const p = pointAt(d.line, L - 140);
    spots.push(['140 m, 30 m rechts im Rough', move(p, bearingDeg(pointAt(d.line, L - 160), p) + 90, 30), false]);
  }
  console.log(`\n## ${h.ref} · Par ${h.par} · ${Math.round(L)} m`);
  for (const [name, from, teeShot] of spots) {
    const c = caddieAdvice({ data: d!, par: h.par!, holeIndex: 3, holeCount: 18, from, teeShot, pin: d!.greenCenter, targets: teeShot && teeAim ? [teeAim.pos] : [], teeAim: teeShot ? teeAim : null, ...terrain, bag: BAG, conditions: null, tendency: new Map(), note, lieChoice: null, unit: 'm', playing } as Parameters<typeof caddieAdvice>[0]);
    console.log(`- **${name}** (${Math.round(distanceM(from, d.greenCenter))} m zur Mitte): ${c.advice.club}${c.advice.swing && c.advice.swing !== 'full' ? ' ' + c.advice.swing : ''} · spielt wie ${Math.round(c.pl.playsLike)}`);
    for (const l of c.lines) console.log(`    - ${l.tone === 'warn' ? '⚠ ' : ''}${l.text}`);
  }
}
