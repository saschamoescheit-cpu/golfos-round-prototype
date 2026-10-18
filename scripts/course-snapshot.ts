// OSM snapshot of one course for the LiDAR green charts (night 18./19.10.2026, first for Gut Frielinghausen, NRW) – the
// same reading as the app (parseOsmXml, geometryFromOsm), written to <out>/<slug>_osm.xml and <slug>_geo.json.
// Usage: npx tsx scripts/course-snapshot.ts <slug> <app id> <west,south,east,north> <out dir>
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { geometryFromOsm, ownHoles, parseOsmXml } from '../src/lib/courses';

const [slug, id, bbox, OUT] = process.argv.slice(2);
const b = bbox.split(',').map(Number);
mkdirSync(OUT, { recursive: true });
const xmlPath = `${OUT}/${slug}_osm.xml`;
let xml: string;
if (existsSync(xmlPath)) xml = readFileSync(xmlPath, 'utf-8');
else {
  const pad = 0.003; // ~300 m: holes at the edge of the course area
  const box = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad].map((n) => n.toFixed(5)).join(',');
  const res = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${box}`, { headers: { 'User-Agent': 'GolfOS-prototype (course snapshot)' } });
  if (!res.ok) throw new Error(`OSM API ${res.status}`);
  xml = await res.text();
  writeFileSync(xmlPath, xml);
}
const geo = geometryFromOsm(ownHoles(parseOsmXml(xml), id));
writeFileSync(`${OUT}/${slug}_geo.json`, JSON.stringify({ id, ...geo }));
const g = geo as unknown as { holes: { ref: string; par?: string }[]; green?: unknown[]; bunker?: unknown[] };
console.log(`${slug} (${id}): ${g.holes.length} holes ${g.holes.map((h) => h.ref).join(',')} · greens ${g.green?.length ?? 0} · bunkers ${g.bunker?.length ?? 0}`);
