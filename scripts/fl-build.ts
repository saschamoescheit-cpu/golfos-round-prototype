// A bundled Florida course (USA trip, 17.10.2026): the OSM snapshot read as the app reads it (geometryFromOsm), with
// the hole lines and par/stroke index set from the club's map and scorecard (GolfOS/lidar/us/<slug>_holes.json) and
// the greens and bunkers OSM lacks from the aerial image (<slug>_greens.json, <slug>_bunkers.json). Writes src/data/courses/<slug>.json and prints the
// holeTags for seedCourses.ts. Usage: npx tsx scripts/fl-build.ts <slug>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { geometryFromOsm, parseOsmXml } from '../src/lib/courses';
import type { LngLat } from '../src/types';

const slug = process.argv[2];
const dir = 'C:/Users/SMoescheit/GolfOS/lidar/us';
const osm = parseOsmXml(readFileSync(`${dir}/${slug}_osm.xml`, 'utf-8'));
// the OSM hole lines are replaced by the checked ones
osm.ways = osm.ways.filter((w) => w.tags.golf !== 'hole');
const geo = geometryFromOsm(osm);
const holes = JSON.parse(readFileSync(`${dir}/${slug}_holes.json`, 'utf-8')) as { ref: string; par: string; handicap: string; line: LngLat[] }[];
geo.holes = holes.map((h) => ({ ref: h.ref, par: h.par, handicap: h.handicap, line: h.line }));
const extra = existsSync(`${dir}/${slug}_greens.json`) ? (JSON.parse(readFileSync(`${dir}/${slug}_greens.json`, 'utf-8')) as Record<string, LngLat[]>) : {};
geo.green.push(...Object.values(extra));
const sand = existsSync(`${dir}/${slug}_bunkers.json`) ? (JSON.parse(readFileSync(`${dir}/${slug}_bunkers.json`, 'utf-8')) as LngLat[][]) : [];
geo.bunker.push(...sand);
writeFileSync(`src/data/courses/${slug}.json`, JSON.stringify(geo));
console.log(`${slug}: ${geo.holes.length} holes, ${geo.green.length} greens (${Object.keys(extra).length} from the aerial), ${geo.bunker.length} bunkers (${sand.length} from the aerial), ${geo.water.length} water, ${geo.tee.length} tees`);
console.log('holeTags:', JSON.stringify(holes.map((h) => ({ ref: h.ref, par: h.par, handicap: h.handicap }))));
