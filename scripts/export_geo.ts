// Writes the bundled geometry of the Mallorca courses as JSON for the LiDAR green charts (GolfOS/lidar/ib).
import { writeFileSync, mkdirSync } from 'node:fs';
import { SEED_GEOMETRY } from '../src/data/seedGeometry';
const ids: Record<string, string> = { sq: 'osm:relation/1654444', sv: 'osm:relation/1130271', smu: 'osm:way/51852280', sg: 'osm:way/60140256' };
const out = 'C:/Users/SMoescheit/GolfOS/lidar/ib';
mkdirSync(out, { recursive: true });
for (const [k, id] of Object.entries(ids)) {
  const g = SEED_GEOMETRY[id];
  writeFileSync(`${out}/${k}_geo.json`, JSON.stringify(g));
  console.log(k, Object.keys(g).join(','), g.holes.length, (g as unknown as { green: unknown[] }).green?.length);
}
