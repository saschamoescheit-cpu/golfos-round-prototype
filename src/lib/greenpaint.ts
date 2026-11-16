import type { LngLat, Ring } from '../types';
import { ringArea } from './geo';

// A green drawn round with one finger when a hole is set up (Sascha 16.11.2026, Hawks Landing 2).

/** The finger's path as a green: a point every metre or so, smoothed (the wobble goes, the shape stays), closed. */
export function paintedGreen(path: LngLat[]): Ring | null {
  if (path.length < 8) return null;
  const k = Math.cos((path[0][1] * Math.PI) / 180);
  const m = (a: LngLat, b: LngLat) => Math.hypot((b[0] - a[0]) * k * 111320, (b[1] - a[1]) * 110540);
  const pts: LngLat[] = [path[0]];
  for (const p of path) if (m(pts[pts.length - 1], p) >= 1) pts.push(p);
  // once round: the end near the start
  if (pts.length < 8 || m(path[0], path[path.length - 1]) > 25) return null;
  const n = pts.length;
  const w = 2;
  const ring: Ring = pts.map((_, i) => {
    let x = 0;
    let y = 0;
    for (let j = -w; j <= w; j++) {
      const q = pts[(i + j + n) % n];
      x += q[0];
      y += q[1];
    }
    return [x / (2 * w + 1), y / (2 * w + 1)] as LngLat;
  });
  ring.push(ring[0]);
  // the size of a green: from a small one (150 m²) to a big double green (5000 m²)
  const area = ringArea(ring);
  return area >= 150 && area <= 5000 ? ring : null;
}
