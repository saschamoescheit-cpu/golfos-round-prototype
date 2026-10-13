// The 10 m course grid against the height profiles along the holes (both from the 1 m terrain model).
import { readFileSync } from 'node:fs';
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
import { holeMapData, pointAt } from '../src/lib/geo';
import { gridHeight, type TerrainGrid } from '../src/lib/terraingrid';

const id = 'osm:relation/1326323';
const geo = SEED_GEOMETRY[id];
const g: TerrainGrid = JSON.parse(readFileSync('public/greens/hetzenhof/terrain.json', 'utf-8'));
const diffs: number[] = [];
for (const [ref, rows] of Object.entries(geo.fairwaySlopes ?? {})) {
  const m = ref.match(/^(\d+)([A-Z])$/);
  if (!m) continue;
  const d = holeMapData(geo, m[2], Number(m[1]));
  if (!d) continue;
  for (const [along, , h] of rows as [number, number, number?][]) {
    if (h == null) continue;
    const q = gridHeight(g, pointAt(d.line, along));
    if (q != null) diffs.push(q - h);
  }
}
diffs.sort((a, b) => Math.abs(a) - Math.abs(b));
const at = (f: number) => Math.abs(diffs[Math.floor(diffs.length * f)]).toFixed(2);
console.log(`${diffs.length} points · |grid − profile| median ${at(0.5)} m, 90 % ${at(0.9)} m, max ${at(0.999)} m · mean ${(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(2)} m`);
