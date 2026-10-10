import type { Course, CourseHole, CourseSummary } from '../types';
import { parseHoleRef, parseStrokeIndex } from './loops';
import { loadCachedCourse, saveCachedCourse } from './storage';

// Course data: OpenStreetMap via Overpass (worldwide, incl. Germany) and OpenGolfAPI (USA).
// Both are ODbL – attribution is shown in the app footer.

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OGA = 'https://api.opengolfapi.org/v1';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  center?: { lat: number; lon: number };
  lat?: number;
  lon?: number;
}

async function overpass(query: string): Promise<OverpassElement[]> {
  let lastError: unknown;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = await res.json();
      return json.elements as OverpassElement[];
    } catch (e) {
      lastError = e; // try the next mirror
    }
  }
  throw lastError ?? new Error('Overpass unavailable');
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export async function nearbyCourses(lat: number, lon: number, radiusKm = 30): Promise<CourseSummary[]> {
  const q = `[out:json][timeout:25];
(way["leisure"="golf_course"](around:${radiusKm * 1000},${lat},${lon});
 relation["leisure"="golf_course"](around:${radiusKm * 1000},${lat},${lon}););
out tags center;`;
  const elements = await overpass(q);
  return elements
    .filter((e) => e.tags?.name && e.center)
    .map((e) => ({
      id: `osm:${e.type}/${e.id}`,
      source: 'osm' as const,
      name: e.tags!.name,
      lat: e.center!.lat,
      lon: e.center!.lon,
      distanceKm: distanceKm(lat, lon, e.center!.lat, e.center!.lon),
    }))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}

/** Name search: OSM via Nominatim (worldwide) plus OpenGolfAPI (USA). */
export async function searchCourses(text: string): Promise<CourseSummary[]> {
  const q = text.trim();
  if (q.length < 3) return [];
  const [osm, oga] = await Promise.allSettled([searchOsm(q), searchOga(q)]);
  return [
    ...(osm.status === 'fulfilled' ? osm.value : []),
    ...(oga.status === 'fulfilled' ? oga.value : []),
  ];
}

async function searchOsm(q: string): Promise<CourseSummary[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=15&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const list = (await res.json()) as {
    osm_type: string; osm_id: number; name: string; display_name: string; category: string; type: string; lat: string; lon: string;
  }[];
  return list
    .filter((r) => r.type === 'golf_course' && (r.osm_type === 'way' || r.osm_type === 'relation'))
    .map((r) => ({
      id: `osm:${r.osm_type}/${r.osm_id}`,
      source: 'osm' as const,
      name: r.name || r.display_name.split(',')[0],
      lat: Number(r.lat),
      lon: Number(r.lon),
    }));
}

async function searchOga(q: string): Promise<CourseSummary[]> {
  const res = await fetch(`${OGA}/courses/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const json = (await res.json()) as { courses: { id: string; name: string; latitude: number; longitude: number; state?: string }[] };
  return json.courses.map((c) => ({
    id: `oga:${c.id}`,
    source: 'opengolfapi' as const,
    name: c.state ? `${c.name} (${c.state}, USA)` : c.name,
    lat: c.latitude,
    lon: c.longitude,
  }));
}

/** Loads a course with its holes; uses the on-device copy first so it works offline on the course. */
export async function loadCourse(summary: CourseSummary, forceRefresh = false): Promise<Course> {
  const cached = loadCachedCourse(summary.id);
  if (cached && !forceRefresh) return cached;
  const holes = summary.source === 'osm' ? await osmHoles(summary.id) : await ogaHoles(summary.id);
  const loops = [...new Set(holes.map((h) => h.loop))].sort(loopSort);
  const course: Course = { id: summary.id, source: summary.source, name: summary.name, lat: summary.lat, lon: summary.lon, holes, loops };
  saveCachedCourse(course);
  return course;
}

function loopSort(a: string, b: string): number {
  // Main first, then single letters A, B, C …, then named loops (e.g. short course).
  const rank = (l: string) => (l === 'Main' ? 0 : l.length === 1 ? 1 : 2);
  return rank(a) - rank(b) || a.localeCompare(b);
}

async function osmHoles(id: string): Promise<CourseHole[]> {
  const [, type, num] = id.match(/^osm:(way|relation)\/(\d+)$/) ?? [];
  if (!type) throw new Error(`Invalid course id ${id}`);
  const q = `[out:json][timeout:25];
${type}(${num});
map_to_area->.a;
way["golf"="hole"](area.a);
out tags;`;
  const elements = await overpass(q);
  const holes: CourseHole[] = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    const parsed = parseHoleRef(t.ref ?? t.name ?? '');
    if (!parsed) continue;
    holes.push({
      ref: t.ref ?? t.name ?? '',
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
  for (const h of holes) {
    const key = `${h.loop}#${h.number}`;
    const prev = map.get(key);
    const score = (x: CourseHole) => (x.par != null ? 1 : 0) + x.strokeIndex.length;
    if (!prev || score(h) > score(prev)) map.set(key, h);
  }
  return [...map.values()];
}
