// Putt reads on the 1 m grid vs. the 0.5 m grid (Hetzenhof, DGM025): same putts, both answers side by side.
import { readFileSync } from 'node:fs';
import { readPutt, type GreenGrid } from '../src/lib/greenread';
import { move } from '../src/lib/aimpoint';
import type { LngLat } from '../src/types';
const oldG: Record<string, GreenGrid> = JSON.parse(readFileSync('public/greens/hetzenhof/heights.json', 'utf-8'));
const newG: Record<string, GreenGrid> = JSON.parse(readFileSync('../lidar/out_het025/heights.json', 'utf-8'));
const centre = (g: GreenGrid): LngLat => [(g.corners[0][0] + g.corners[2][0]) / 2, (g.corners[0][1] + g.corners[2][1]) / 2];
let n = 0;
let diffSum = 0;
for (const ref of ['1A', '3B', '5A', '7B', '9C', '4C']) {
  const c = centre(newG[ref]);
  for (const [a, d] of [[0, 6], [90, 8], [200, 5], [300, 10]] as const) {
    const pin = move(c, a + 180, 2);
    const ball = move(c, a, d);
    const o = readPutt(oldG[ref], ball, pin);
    const w = readPutt(newG[ref], ball, pin);
    if (!o || !w) continue;
    n++;
    diffSum += Math.abs(o.aimCm - w.aimCm);
    console.log(`${ref} ${d + 2} m: 1 m grid → ${o.text}  |  0.5 m grid → ${w.text}`);
  }
}
console.log(`${n} putts, mean difference of the aim ${Math.round(diffSum / Math.max(1, n))} cm`);
