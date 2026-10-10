import type { Course, CourseHole, CourseSummary } from '../types';
import { parseHoleRef, parseStrokeIndex } from './loops';
import { loadCachedCourse, saveCachedCourse } from './storage';
import { SEED_COURSES } from '../data/seedCourses';

// Course data sources (all ODbL – attribution in the app footer):
//  - Photon (komoot): course search by name and courses nearby, filtered to leisure=golf_course.
//  - OpenStreetMap API (/map?bbox): holes with par and stroke index inside the course area. Reliable, CORS-enabled.
//  - Overpass: fallback for the holes when no course area is known or the OSM API fails.
//  - OpenGolfAPI: US courses (par per hole, no stroke index).

const PHOTON = 'https://photon.komoot.io/api/';
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

async function photon(params: Record<string, string>): Promise<CourseSummary[]> {
  const url = `${PHOTON}?${new URLSearchParams({ ...params, osm_tag: 'leisure:golf_course', limit: '20' })}`;
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
  const list = await photon({ q: 'golf', lat: String(lat), lon: String(lon), location_bias_scale: '0.1' });
  return list
    .map((c) => ({ ...c, distanceKm: distanceKm(lat, lon, c.lat, c.lon) }))
    .filter((c) => c.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Name search: OSM via Photon (worldwide) plus OpenGolfAPI (USA). */
export async function searchCourses(text: string, near?: { lat: number; lon: number }): Promise<CourseSummary[]> {
  const q = text.trim();
  if (q.length < 3) return [];
  const bias = near ? { lat: String(near.lat), lon: String(near.lon) } : {};
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
  if (cached && cached.holes.length > 0 && !forceRefresh) return cached;
  const seed = SEED_COURSES[summary.id];
  const holes = seed
    ? holesFromTags(seed.holeTags)
    : summary.source === 'osm'
      ? await osmHoles(summary)
      : await ogaHoles(summary.id);
  const loops = [...new Set(holes.map((h) => h.loop))];
  const course: Course = { id: summary.id, source: summary.source, name: summary.name, lat: summary.lat, lon: summary.lon, holes, loops };
  if (holes.length > 0) saveCachedCourse(course);
  return course;
}

async function osmHoles(summary: CourseSummary): Promise<CourseHole[]> {
  if (summary.bbox) {
    try {
      return await osmApiHoles(summary.bbox);
    } catch {
      // fall through to Overpass
    }
  }
  return overpassHoles(summary.id);
}

/** All golf=hole ways in the course area, via the main OSM API (returns OSM XML). */
async function osmApiHoles(bbox: [number, number, number, number]): Promise<CourseHole[]> {
  const pad = 0.002; // ~150 m, so holes at the edge of the course area are included
  const b = [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad].map((n) => n.toFixed(5)).join(',');
  const res = await fetch(`${OSM_API}?bbox=${b}`, { signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`OSM API ${res.status}`);
  return holesFromTags(parseOsmXmlWays(await res.text()).filter((t) => t.golf === 'hole'));
}

/** Minimal OSM-XML reader: returns the tag map of every <way>. Works in browser and tests (no DOMParser needed). */
export function parseOsmXmlWays(xml: string): Record<string, string>[] {
  const ways: Record<string, string>[] = [];
  const wayRe = /<way\b[^>]*>([\s\S]*?)<\/way>/g;
  const tagRe = /<tag k="([^"]*)" v="([^"]*)"\s*\/>/g;
  let w: RegExpExecArray | null;
  while ((w = wayRe.exec(xml))) {
    const tags: Record<string, string> = {};
    let t: RegExpExecArray | null;
    while ((t = tagRe.exec(w[1]))) tags[decodeXml(t[1])] = decodeXml(t[2]);
    ways.push(tags);
  }
  return ways;
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
