// How long the caddie needs per position (feature 017 adds the tee strategy): every hole of Hetzenhof, from the tee
// and from 4 spots along the hole. Desktop numbers; a phone is roughly 3–5× slower.
import { SEED_COURSES } from '../src/data/seedCourses';
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
import { holesFromTags } from '../src/lib/courses';
import { holeMapData, lineLength, pointAt } from '../src/lib/geo';
import { holeForTee } from '../src/lib/teeline';
import { caddieAdvice, teeAimFor } from '../src/lib/caddieplan';
import { DEFAULT_CARRY } from '../src/lib/caddie';
const id = 'osm:relation/1326323';
const geo = SEED_GEOMETRY[id];
const times: number[] = [];
let first = 0;
for (const h of holesFromTags(SEED_COURSES[id].holeTags).filter((x) => x.par)) {
  let d = holeMapData(geo, h.loop, h.number);
  if (!d) continue;
  d = holeForTee(d, id, h.ref, 'Yellow', geo.tee) ?? d;
  const terrain = { slopes: geo.fairwaySlopes?.[h.ref], boundary: geo.boundary, trees: geo.trees };
  const t0 = performance.now();
  const teeAim = teeAimFor({ data: d, par: h.par!, pin: d.greenCenter, bag: DEFAULT_CARRY, conditions: null, tendency: new Map(), ...terrain, note: {}, playing: 8 });
  first = Math.max(first, performance.now() - t0);
  const L = lineLength(d.line);
  for (const f of [0, 0.25, 0.5, 0.75, 0.9]) {
    const from = f === 0 ? d.tee : pointAt(d.line, L * f);
    for (let rep = 0; rep < 3; rep++) {
      const t = performance.now();
      caddieAdvice({ data: d, par: h.par!, holeIndex: 0, holeCount: 18, from, teeShot: f === 0, pin: d.greenCenter, targets: teeAim ? [teeAim.pos] : [], teeAim, ...terrain, bag: DEFAULT_CARRY, conditions: null, tendency: new Map(), note: {}, lieChoice: null, unit: 'm', playing: 8 });
      const dt = performance.now() - t; times.push(dt); if (dt > 40 && rep === 0) console.log('slow', h.ref, f, dt.toFixed(0), 'ms');
    }
  }
}
times.sort((a, b) => a - b);
const q = (p: number) => times[Math.floor(times.length * p)].toFixed(1);
console.log(`caddie per position: median ${q(0.5)} ms, 90 % ${q(0.9)} ms, max ${times[times.length - 1].toFixed(1)} ms · first tee strategy of a hole up to ${first.toFixed(0)} ms`);
