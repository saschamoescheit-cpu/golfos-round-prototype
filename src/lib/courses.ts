import type { Course, CourseGeometry, CourseHole, CourseSummary, LngLat } from '../types';
import { parseHoleRef, parseStrokeIndex } from './loops';
import { loadCachedCourse, saveCachedCourse, saveGeometry } from './storage';
import { SEED_COURSES } from '../data/seedCourses';

// Course data sources (all ODbL – attribution in the app footer):
//  - Photon (komoot): course search by name and courses nearby, filtered to leisure=golf_course.
//  - OpenStreetMap API (/map?bbox): holes with par and stroke index inside the course area. Reliable, CORS-enabled.
//  - Overpass: fallback for the holes when no course area is known or the OSM API fails.
//  - OpenGolfAPI: US courses (par per hole, no stroke index).

const PHOTON = 'https://photon.komoot.io/api/';
const PHOTON_REVERSE = 'https://photon.komoot.io/reverse';
const OSM_API = 'https://api.openstreetmap.org/api/0.6/map';
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const OGA = 'https://api.opengolfapi.org/v1';

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

// ---------- Search & nearby (Photon) ----------

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type: 'N' | 'W' | 'R';
    osm_id: number;
    name?: string;
    city?: string;
    extent?: [number, number, number, number]; // [minLon, maxLat, maxLon, minLat]
  };
}

async function photon(params: Record<string, string>, endpoint = PHOTON): Promise<CourseSummary[]> {
  const url = `${endpoint}?${new URLSearchParams({ ...params, osm_tag: 'leisure:golf_course', limit: '20' })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const json = (await res.json()) as { features: PhotonFeature[] };
  const seen = new Set<string>();
  return json.features
    .filter((f) => f.properties.name && f.properties.osm_type !== 'N')
    .map((f) => {
      const p = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      const e = p.extent;
      return {
        id: `osm:${p.osm_type === 'R' ? 'relation' : 'way'}/${p.osm_id}`,
        source: 'osm' as const,
        name: p.name!,
        place: p.city,
        lat,
        lon,
        bbox: e ? ([e[0], e[3], e[2], e[1]] as [number, number, number, number]) : undefined,
      };
    })
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

export async function nearbyCourses(lat: number, lon: number, radiusKm = 40): Promise<CourseSummary[]> {
  // Reverse search by type finds courses without "golf" in the name (e.g. "Maioris"); the text search is the fallback.
  const near = { lat: String(lat), lon: String(lon) };
  const [byType, byName] = await Promise.allSettled([
    photon({ ...near, radius: String(radiusKm) }, PHOTON_REVERSE),
    photon({ q: 'golf', ...near, location_bias_scale: '0.1' }),
  ]);
  if (byType.status === 'rejected' && byName.status === 'rejected') throw byName.reason;
  const seen = new Set<string>();
  const list = [...(byType.status === 'fulfilled' ? byType.value : []), ...(byName.status === 'fulfilled' ? byName.value : [])].filter((c) =>
    seen.has(c.id) ? false : (seen.add(c.id), true),
  );
  return list
    .map((c) => ({ ...c, distanceKm: distanceKm(lat, lon, c.lat, c.lon) }))
    .filter((c) => c.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Name search: OSM via Photon (worldwide) plus OpenGolfAPI (USA). */
export async function searchCourses(text: string, near?: { lat: number; lon: number }): Promise<CourseSummary[]> {
  const q = text.trim();
  if (q.length < 3) return [];
  const bias: Record<string, string> = near ? { lat: String(near.lat), lon: String(near.lon) } : {};
  const [osm, oga] = await Promise.allSettled([photon({ q, ...bias }), searchOga(q)]);
  return [
    ...(osm.status === 'fulfilled' ? osm.value : []),
    ...(oga.status === 'fulfilled' ? oga.value : []),
  ];
}

async function searchOga(q: string): Promise<CourseSummary[]> {
  const res = await fetch(`${OGA}/courses/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const json = (await res.json()) as { courses: { id: string; name: string; latitude: number; longitude: number; state?: string; city?: string }[] };
  return json.courses.map((c) => ({
    id: `oga:${c.id}`,
    source: 'opengolfapi' as const,
    name: c.name,
    place: [c.city, c.state, 'USA'].filter(Boolean).join(', '),
    lat: c.latitude,
    lon: c.longitude,
  }));
}

// ---------- Holes ----------

/**
 * Loads a course with its holes. Order: on-device copy (offline on the course) → bundled snapshot
 * (test course) → live course databases.
 */
export async function loadCourse(summary: CourseSummary, forceRefresh = false): Promise<Course> {
  const cached = loadCachedCourse(summary.id);
  const seed = SEED_COURSES[summary.id];
  // A course first played without data (18 empty holes) gets the bundled data once it exists.
  const emptyCache = cached != null && seed != null && cached.holes.every((h) => h.par == null);
  if (cached && cached.holes.length > 0 && !forceRefresh && !emptyCache) return cached;
  const holes = seed
    ? holesFromTags(seed.holeTags)
    : summary.source === 'osm'
      ? await osmHoles(summary, (geo) => saveGeometry(summary.id, geo))
      : await ogaHoles(summary.id);
  const loops = [...new Set(holes.map((h) => h.loop))];
  const course: Course = { id: summary.id, source: summary.source, name: summary.name, lat: summary.lat, lon: summary.lon, holes, loops };
  if (holes.length > 0) saveCachedCourse(course);
  return course;
}

async function osmHoles(summary: CourseSummary, onGeometry: (g: CourseGeometry) => void): Promise<CourseHole[]> {
  if (summary.bbox) {
    try {
      const pad = 0.002; // ~150 m, so holes at the edge of the course area are included
      const b = summary.bbox;
      const box = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad].map((n) => n.toFixed(5)).join(',');
      const res = await fetch(`${OSM_API}?bbox=${box}`, { signal: AbortSignal.timeout(45000) });
      if (!res.ok) throw new Error(`OSM API ${res.status}`);
      const osm = parseOsmXml(await res.text());
      onGeometry(geometryFromOsm(osm));
      return holesFromTags(osm.ways.filter((w) => w.tags.golf === 'hole').map((w) => w.tags));
    } catch {
      // fall through to Overpass (holes only, no map)
    }
  }
  return overpassHoles(summary.id);
}

interface OsmWay {
  id: string;
  tags: Record<string, string>;
  nodes: string[];
}
interface OsmRelation {
  tags: Record<string, string>;
  members: { type: string; ref: string; role: string }[];
}

/** Minimal OSM-XML reader (nodes, ways, relations). Works in browser and tests – no DOMParser needed. */
export function parseOsmXml(xml: string): { nodes: Map<string, LngLat>; ways: OsmWay[]; relations: OsmRelation[] } {
  const attr = (s: string, name: string) => s.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? '';
  const tagsOf = (body: string) => {
    const tags: Record<string, string> = {};
    for (const t of body.matchAll(/<tag k="([^"]*)" v="([^"]*)"\s*\/>/g)) tags[decodeXml(t[1])] = decodeXml(t[2]);
    return tags;
  };
  const nodes = new Map<string, LngLat>();
  for (const n of xml.matchAll(/<node\b([^>]*?)\/?>/g)) {
    nodes.set(attr(n[1], 'id'), [Number(attr(n[1], 'lon')), Number(attr(n[1], 'lat'))]);
  }
  const ways: OsmWay[] = [];
  for (const w of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    ways.push({ id: attr(w[1], 'id'), tags: tagsOf(w[2]), nodes: [...w[2].matchAll(/<nd ref="([^"]+)"/g)].map((m) => m[1]) });
  }
  const relations: OsmRelation[] = [];
  for (const r of xml.matchAll(/<relation\b([^>]*)>([\s\S]*?)<\/relation>/g)) {
    relations.push({
      tags: tagsOf(r[2]),
      members: [...r[2].matchAll(/<member\b([^>]*)\/>/g)].map((m) => ({ type: attr(m[1], 'type'), ref: attr(m[1], 'ref'), role: attr(m[1], 'role') })),
    });
  }
  return { nodes, ways, relations };
}

type Kind = 'green' | 'tee' | 'bunker' | 'fairway' | 'water';
function isTrees(tags: Record<string, string>): boolean {
  return tags.natural === 'wood' || tags.natural === 'scrub' || tags.landuse === 'forest';
}

function featureKind(tags: Record<string, string>): Kind | null {
  const g = tags.golf;
  if (g === 'green' || g === 'tee' || g === 'bunker' || g === 'fairway') return g;
  if (g === 'water_hazard' || g === 'lateral_water_hazard' || tags.natural === 'water') return 'water';
  return null;
}

/** Same extraction as the script that built the bundled Hetzenhof snapshot. */
export function geometryFromOsm(osm: ReturnType<typeof parseOsmXml>): CourseGeometry {
  const geo: CourseGeometry = { holes: [], green: [], tee: [], bunker: [], fairway: [], water: [] };
  const coords = (ids: string[]) => ids.map((id) => osm.nodes.get(id)).filter((p): p is LngLat => p != null);
  const byId = new Map(osm.ways.map((w) => [w.id, w]));
  for (const w of osm.ways) {
    const line = coords(w.nodes);
    if (w.tags.golf === 'hole' && line.length >= 2) {
      geo.holes.push({ ref: w.tags.ref ?? w.tags.name ?? '', par: w.tags.par ?? null, handicap: w.tags.handicap ?? null, line });
      continue;
    }
    const k = featureKind(w.tags);
    if (k && line.length >= 4 && w.nodes[0] === w.nodes[w.nodes.length - 1]) geo[k].push(line);
    if (w.tags.leisure === 'golf_course' && line.length >= 4 && w.nodes[0] === w.nodes[w.nodes.length - 1]) (geo.boundary ??= []).push(line);
    if (isTrees(w.tags) && line.length >= 4 && w.nodes[0] === w.nodes[w.nodes.length - 1]) (geo.trees ??= []).push(line);
  }
  for (const r of osm.relations) {
    if (r.tags.type !== 'multipolygon') continue;
    if (isTrees(r.tags)) {
      const outer = r.members.filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === '')).map((m) => byId.get(m.ref)?.nodes ?? []);
      for (const ring of joinRings(outer)) (geo.trees ??= []).push(coords(ring));
      continue;
    }
    if (r.tags.leisure === 'golf_course') {
      const outer = r.members.filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === '')).map((m) => byId.get(m.ref)?.nodes ?? []);
      for (const ring of joinRings(outer)) (geo.boundary ??= []).push(coords(ring));
      continue;
    }
    const k = featureKind(r.tags);
    if (!k) continue;
    const outer = r.members.filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === '')).map((m) => byId.get(m.ref)?.nodes ?? []);
    for (const ring of joinRings(outer)) geo[k].push(coords(ring));
  }
  return geo;
}

function joinRings(segments: string[][]): string[][] {
  const segs = segments.filter((s) => s.length >= 2).map((s) => s.slice());
  const rings: string[][] = [];
  while (segs.length) {
    const ring = segs.shift()!;
    let changed = true;
    while (ring[0] !== ring[ring.length - 1] && changed) {
      changed = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (s[0] === ring[ring.length - 1]) ring.push(...s.slice(1));
        else if (s[s.length - 1] === ring[ring.length - 1]) ring.push(...s.slice().reverse().slice(1));
        else continue;
        segs.splice(i, 1);
        changed = true;
        break;
      }
    }
    if (ring[0] === ring[ring.length - 1] && ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function decodeXml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function overpassHoles(id: string): Promise<CourseHole[]> {
  const [, type, num] = id.match(/^osm:(way|relation)\/(\d+)$/) ?? [];
  if (!type) throw new Error(`Invalid course id ${id}`);
  const query = `[out:json][timeout:25];${type}(${num});map_to_area->.a;way["golf"="hole"](area.a);out tags;`;
  let lastError: unknown;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = (await res.json()) as { elements: { tags?: Record<string, string> }[] };
      return holesFromTags(json.elements.map((e) => e.tags ?? {}));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error('Overpass unavailable');
}

function holesFromTags(list: Record<string, string>[]): CourseHole[] {
  const holes: CourseHole[] = [];
  for (const t of list) {
    const label = t.ref ?? t.name ?? '';
    const parsed = parseHoleRef(label);
    if (!parsed) continue;
    holes.push({
      ref: label,
      loop: parsed.loop,
      number: parsed.number,
      par: t.par && /^\d$/.test(t.par) ? Number(t.par) : null,
      strokeIndex: parseStrokeIndex(t.handicap),
    });
  }
  return dedupe(holes);
}

async function ogaHoles(id: string): Promise<CourseHole[]> {
  const res = await fetch(`${OGA}/courses/${id.replace(/^oga:/, '')}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`OpenGolfAPI ${res.status}`);
  const json = (await res.json()) as { scorecard?: { hole: number; par: number; handicap?: number }[] };
  return (json.scorecard ?? []).map((h) => ({
    ref: String(h.hole),
    loop: 'Main',
    number: h.hole,
    par: h.par ?? null,
    strokeIndex: h.handicap ? [h.handicap] : [],
  }));
}

/** OSM sometimes has duplicate hole ways; keep the one with the most data. */
function dedupe(holes: CourseHole[]): CourseHole[] {
  const map = new Map<string, CourseHole>();
  const score = (x: CourseHole) => (x.par != null ? 1 : 0) + x.strokeIndex.length;
  for (const h of holes) {
    const key = `${h.loop}#${h.number}`;
    const prev = map.get(key);
    if (!prev || score(h) > score(prev)) map.set(key, h);
  }
  return [...map.values()];
}
