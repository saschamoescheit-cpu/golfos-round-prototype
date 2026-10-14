// Adds the details of the drawn hole (2D view) to the bundled courses: single trees, tree rows and hedges, paths
// and rough from OpenStreetMap (© OpenStreetMap contributors, ODbL). The curated golf geometry stays as it is.
// Usage: npx tsx scripts/plandetails.ts
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { parseOsmXml, planDetails } from '../src/lib/courses';
import type { CourseGeometry } from '../src/types';

const dir = new URL('../src/data/courses/', import.meta.url);
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const path = new URL(file, dir);
  const geo = JSON.parse(readFileSync(path, 'utf-8')) as CourseGeometry;
  const pts = [...geo.holes.flatMap((h) => h.line), ...(geo.boundary ?? []).flat()];
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const pad = 0.0015;
  const box = [Math.min(...lons) - pad, Math.min(...lats) - pad, Math.max(...lons) + pad, Math.max(...lats) + pad].map((n) => n.toFixed(5)).join(',');
  const res = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${box}`, { headers: { 'User-Agent': 'GolfOS-prototype/1.0' } });
  if (!res.ok) {
    console.log(`${file}: OSM API ${res.status} – left as it is`);
    continue;
  }
  const d = planDetails(parseOsmXml(await res.text()), geo);
  writeFileSync(path, JSON.stringify({ ...geo, ...d }));
  console.log(`${file}: ${d.treePoints?.length} trees, ${d.treeRows?.length} tree rows/hedges, ${d.paths?.length} paths, ${d.rough?.length} rough`);
  await new Promise((r) => setTimeout(r, 1500)); // be gentle with the OSM API
}
