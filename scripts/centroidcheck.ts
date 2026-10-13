// How far the vertex mean ("Mitte" so far) lies from the area centroid of each green, over all bundled courses.
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
import { centroid, distanceM } from '../src/lib/geo';
import type { LngLat, Ring } from '../src/types';

function areaCentroid(r: Ring): LngLat {
  const o = r[0];
  const kx = 111320 * Math.cos((o[1] * Math.PI) / 180);
  const ky = 111320;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i + 1 < r.length; i++) {
    const x1 = (r[i][0] - o[0]) * kx, y1 = (r[i][1] - o[1]) * ky, x2 = (r[i + 1][0] - o[0]) * kx, y2 = (r[i + 1][1] - o[1]) * ky;
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  return [o[0] + cx / (3 * a) / kx, o[1] + cy / (3 * a) / ky];
}
const all: number[] = [];
for (const [id, g] of Object.entries(SEED_GEOMETRY)) {
  const greens = (g as { green?: Ring[] }).green ?? [];
  const d = greens.map((r) => distanceM(centroid(r), areaCentroid(r[0][0] === r[r.length - 1][0] ? r : [...r, r[0]])));
  all.push(...d);
  console.log(id.padEnd(24), 'greens', String(greens.length).padStart(3), 'max', d.length ? Math.max(...d).toFixed(1) : '-', 'm, > 2 m:', d.filter((x) => x > 2).length);
}
all.sort((a, b) => a - b);
console.log('all', all.length, 'median', all[Math.floor(all.length / 2)].toFixed(2), 'p90', all[Math.floor(all.length * 0.9)].toFixed(2), 'max', all[all.length - 1].toFixed(1));
