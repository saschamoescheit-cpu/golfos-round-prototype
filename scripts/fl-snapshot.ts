// OSM snapshots of Sascha's Florida courses (USA trip, 17.10.2026) – the same reading as the app (parseOsmXml,
// geometryFromOsm), written to GolfOS/lidar/us/<slug>_osm.xml and <slug>_geo.json, with a check per hole:
// number, par, stroke index, line length. Usage: npx tsx scripts/fl-snapshot.ts [slug …]
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { geometryFromOsm, holesFromTags, ownHoles, parseOsmXml } from '../src/lib/courses';

const OUT = 'C:/Users/SMoescheit/GolfOS/lidar/us';
// [slug, app id, bbox west,south,east,north] – the course area from OSM, padded below
const COURSES: [string, string, [number, number, number, number]][] = [
  ['kissimmeebay', 'osm:relation/4039579', [-81.33452, 28.30423, -81.32046, 28.31159]],
  ['falconsfire', 'osm:way/311994625', [-81.5157, 28.33842, -81.49758, 28.34695]],
  ['southerndunes', 'southerndunes', [-81.6370, 28.1135, -81.6225, 28.1325]],
  ['legendsclermont', 'osm:relation/4040123', [-81.73999, 28.49978, -81.72017, 28.51071]],
  ['stonegateoaks', 'osm:relation/4039063', [-81.48889, 28.118, -81.47272, 28.13739]],
  ['stonegatecypress', 'osm:relation/4039062', [-81.48549, 28.13094, -81.4585, 28.14487]],
  ['orangelakelegends', 'osm:relation/4039887', [-81.61096, 28.35789, -81.59898, 28.37631]],
  ['orangelakereserve', 'osm:relation/4039888', [-81.62781, 28.34731, -81.61551, 28.36237]],
];
const want = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const m = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 111320);

for (const [slug, id, b] of COURSES) {
  if (want.length && !want.includes(slug)) continue;
  const xmlPath = `${OUT}/${slug}_osm.xml`;
  let xml: string;
  if (existsSync(xmlPath)) xml = readFileSync(xmlPath, 'utf-8');
  else {
    const pad = 0.003; // ~300 m: holes at the edge of the course area
    const box = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad].map((n) => n.toFixed(5)).join(',');
    const res = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${box}`, { headers: { 'User-Agent': 'GolfOS-prototype (course snapshot)' } });
    if (!res.ok) {
      console.log(slug, 'OSM API', res.status);
      continue;
    }
    xml = await res.text();
    writeFileSync(xmlPath, xml);
  }
  const osm = ownHoles(parseOsmXml(xml), id);
  const geo = geometryFromOsm(osm);
  const holes = holesFromTags(osm.ways.filter((w) => w.tags.golf === 'hole').map((w) => w.tags));
  writeFileSync(`${OUT}/${slug}_geo.json`, JSON.stringify({ id, ...geo }));
  const g = geo as unknown as { holes: { ref: string; par?: string; handicap?: string | null; line: [number, number][] }[]; green?: unknown[]; bunker?: unknown[]; water?: unknown[] };
  const rows = [...g.holes]
    .sort((x, y) => Number(x.ref) - Number(y.ref) || x.ref.localeCompare(y.ref))
    .map((h) => `${h.ref}:${h.par ?? '?'}/${h.handicap ?? '?'}/${Math.round(h.line.slice(1).reduce((s, p, i) => s + m(h.line[i], p), 0))}m`);
  console.log(`== ${slug} (${id}): ${g.holes.length} holes (${holes.length} tagged), greens ${g.green?.length ?? 0}, bunkers ${g.bunker?.length ?? 0}, water ${g.water?.length ?? 0}`);
  console.log('   ' + rows.join('  '));
}
