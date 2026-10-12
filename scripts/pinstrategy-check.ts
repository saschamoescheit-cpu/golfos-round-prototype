// Pin strategy on real greens: every hole of a course, 9 pin positions (front/middle/back × left/centre/right),
// approach from 140 m on the hole line, playing handicap 9 – how often flag / middle / short, and some texts.
// Usage: npx vite-node scripts/pinstrategy-check.ts [courseId]
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
import { holeMapData, lineLength, pointAt, bearingDeg, pointInRing, type HoleMapData } from '../src/lib/geo';
import { greenFrontBack } from '../src/lib/geo';
import { pinStrategy } from '../src/lib/pinstrategy';
import { move } from '../src/lib/aimpoint';
import { holeForTee } from '../src/lib/teeline';

const id = process.argv[2] ?? 'osm:way/28625559';
const geo = SEED_GEOMETRY[id];
const count: Record<string, number> = {};
const samples: string[] = [];
for (const h of geo.holes) {
  const d0 = holeMapData(geo, 'Main', Number(h.ref));
  const d = holeForTee(d0, id, h.ref, 'Yellow', geo.tee) as HoleMapData | null;
  if (!d || !d.green) continue;
  const L = lineLength(d.line);
  const from = pointAt(d.line, Math.max(0, L - 140));
  const g = greenFrontBack(from, d.green);
  const b = bearingDeg(from, d.greenCenter);
  for (const [depth, dn] of [[-1, 'front'], [0, 'middle'], [1, 'back']] as const) {
    for (const [side, sn] of [[-1, 'left'], [0, 'centre'], [1, 'right']] as const) {
      const along = depth < 0 ? -(g.center - g.front) * 0.6 : depth > 0 ? (g.back - g.center) * 0.6 : 0;
      const pin = move(move(d.greenCenter, b, along), b + 90, side * 6);
      if (!pointInRing(pin, d.green)) continue;
      const p = pinStrategy({ from, pin, data: d, distM: 140 + along, playing: 9 });
      if (!p) continue;
      count[p.kind] = (count[p.kind] ?? 0) + 1;
      if (p.kind !== 'pin' && samples.length < 14) samples.push(`hole ${h.ref} pin ${dn}-${sn}: ${p.kind} saves ${p.saved} · ${p.text}`);
    }
  }
}
console.log(id, count);
console.log(samples.join('\n'));
