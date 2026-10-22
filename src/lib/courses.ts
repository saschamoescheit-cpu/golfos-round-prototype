import type { Course, CourseGeometry, CourseHole, CourseSummary, LngLat, Ring } from '../types';
import { parseHoleRef, parseStrokeIndex } from './loops';
import { distToLine, dropNestedRings, pointInRing } from './geo';
import { hasGeometry, loadCachedCourse, saveCachedCourse, saveGeometry } from './storage';
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
  // 6 s, not 15: when Photon hangs (21.10.2026 evening) the other course database answers the search on its own
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
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

/**
 * Bundled courses show their own name ("Golf de Son Antem West"); a course mapped twice in OSM (an area and a
 * relation with the same name) appears once. A bundled course that OSM does not have on its own (Son Antem East
 * inside the one Son Antem area) is added wherever its sibling shows.
 */
function tidy(list: CourseSummary[]): CourseSummary[] {
  const kept: CourseSummary[] = [];
  for (const [id, seed] of Object.entries(SEED_COURSES)) {
    const sibling = seed.shownWith && list.find((x) => seed.shownWith!.includes(x.id));
    if (sibling && !list.some((x) => x.id === id)) list = [...list, { ...sibling, id, name: seed.name, lat: seed.lat, lon: seed.lon }];
  }
  // bundled courses first, so they win over the plain database entries
  const ordered = list.map((x) => (SEED_COURSES[x.id] ? { ...x, name: SEED_COURSES[x.id].name } : x)).sort((x, y) => Number(!SEED_COURSES[x.id]) - Number(!SEED_COURSES[y.id]));
  for (const c of ordered) {
    // same name within 2 km = the same course; a bundled "… West" also covers the plain "…" entry
    const same = (k: CourseSummary) => distanceKm(k.lat, k.lon, c.lat, c.lon) < 2 && (k.name === c.name || (SEED_COURSES[k.id] != null && k.name.startsWith(c.name)));
    const k = kept.find(same);
    if (!k) kept.push(c);
    else if (!k.place && c.place) k.place = c.place; // a bundled entry takes the place name from the database hit
  }
  // a course without a place name (Son Antem East) takes it from a neighbour within 2 km
  for (const c of kept) if (!c.place) c.place = kept.find((o) => o.place && distanceKm(o.lat, o.lon, c.lat, c.lon) < 2)?.place ?? c.place;
  return kept;
}

// ---------- Bundled courses: found instantly and offline ----------

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** The bundled courses as list entries (a course mapped twice in OSM appears once). */
export function bundledCourses(): CourseSummary[] {
  const seen = new Set<string>();
  return Object.entries(SEED_COURSES).flatMap(([id, s]) => {
    if (seen.has(s.name)) return [];
    seen.add(s.name);
    return [{ id, source: 'osm' as const, name: s.name, place: '', lat: s.lat, lon: s.lon }];
  });
}

/** Bundled courses whose name contains every word of the query (accents and case ignored). */
export function searchBundled(text: string): CourseSummary[] {
  const words = fold(text).split(/\s+/).filter((w) => w.length > 0);
  if (!words.length) return [];
  return bundledCourses().filter((c) => words.every((w) => fold(c.name).includes(w)));
}

export async function nearbyCourses(lat: number, lon: number, radiusKm = 40): Promise<CourseSummary[]> {
  // Reverse search by type finds courses without "golf" in the name (e.g. "Maioris"); the text search is the fallback.
  const near = { lat: String(lat), lon: String(lon) };
  const [byType, byName] = await Promise.allSettled([
    photon({ ...near, radius: String(radiusKm) }, PHOTON_REVERSE),
    photon({ q: 'golf', ...near, location_bias_scale: '0.1' }),
  ]);
  const bundled = bundledCourses().filter((c) => distanceKm(lat, lon, c.lat, c.lon) <= radiusKm);
  // Without the course database (no signal on the course) the bundled courses nearby still show.
  if (byType.status === 'rejected' && byName.status === 'rejected' && !bundled.length) throw byName.reason;
  const seen = new Set<string>();
  const list = [...(byType.status === 'fulfilled' ? byType.value : []), ...(byName.status === 'fulfilled' ? byName.value : []), ...bundled].filter((c) =>
    seen.has(c.id) ? false : (seen.add(c.id), true),
  );
  return tidy(list)
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
  const local = searchBundled(q);
  if (osm.status === 'rejected' && oga.status === 'rejected' && !local.length) throw osm.reason;
  return tidy([...local, ...(osm.status === 'fulfilled' ? osm.value : []), ...(oga.status === 'fulfilled' ? oga.value : [])]);
}

async function searchOga(q: string): Promise<CourseSummary[]> {
  const res = await fetch(`${OGA}/courses/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const json = (await res.json()) as { courses: { id: string; name: string; latitude: number; longitude: number; state?: string; city?: string }[] };
  return json.courses.map((c) => ({
    id: `oga:${c.id}`,
    source: 'opengolfapi' as const,
    name: c.name,
    place: [c.city, c.state, c.longitude < -50 ? 'USA' : null].filter(Boolean).join(', '),
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
  if (cached && cached.holes.length > 0 && !forceRefresh && !emptyCache) {
    // the map copy is gone (it made room when the storage was full, or never fitted): fetch the map again – the course
    // itself stays as it is, with the player's own par and stroke index (night check 22.10.2026)
    if (summary.source === 'osm' && !seed && !hasGeometry(summary.id)) await refetchGeometry({ ...summary, bbox: summary.bbox ?? cached.bbox }, cached);
    return cached;
  }
  // an OpenGolfAPI entry carries no map (in Germany not even holes): the OSM course at its place instead – with map,
  // greens and holes (night check 22.10.2026: with Photon down the search found only these entries, the round had no map)
  if (summary.source === 'opengolfapi' && !forceRefresh) {
    const osm = await osmCourseAt(summary).catch(() => null);
    if (osm) {
      const course = await loadCourse(osm).catch(() => null);
      if (course && course.holes.length >= 9) {
        // par and Hcp the OSM holes lack come from the OpenGolfAPI scorecard (in the USA often complete there)
        const merged = withCardValues(course, await ogaHoles(summary.id).catch(() => []));
        if (merged !== course) saveCachedCourse(merged);
        return merged;
      }
    }
  }
  const holes = seed
    ? holesFromTags(seed.holeTags)
    : summary.source === 'osm'
      ? await osmHoles(summary, (geo) => saveGeometry(summary.id, geo))
      : await ogaHoles(summary.id);
  const loops = [...new Set(holes.map((h) => h.loop))];
  const course: Course = { id: summary.id, source: summary.source, name: seed?.name ?? summary.name, lat: summary.lat, lon: summary.lon, holes, loops, ...(summary.bbox ? { bbox: summary.bbox } : {}) };
  if (holes.length > 0) saveCachedCourse(course);
  return course;
}

/** Fills the par and Hcp a course's holes lack from a scorecard, hole by hole – only for a course of one loop, where the
 *  numbers mean the same; what the course has stays. The same course when nothing was missing. */
export function withCardValues(course: Course, card: CourseHole[]): Course {
  if (course.loops.length !== 1 || card.length === 0) return course;
  let changed = false;
  const holes = course.holes.map((h) => {
    const c = card.find((x) => x.number === h.number);
    if (!c) return h;
    const par = h.par ?? c.par;
    const strokeIndex = h.strokeIndex.length ? h.strokeIndex : c.strokeIndex;
    if (par === h.par && strokeIndex === h.strokeIndex) return h;
    changed = true;
    return { ...h, par, strokeIndex };
  });
  return changed ? { ...course, holes } : course;
}

// words that say nothing about which course it is
const GENERIC = new Set(['golf', 'club', 'golfclub', 'golfanlage', 'golfpark', 'golfplatz', 'course', 'country', 'resort', 'land', 'e.v.', 'gc', 'the', 'der', 'die', 'das', 'und', 'am', 'im', 'von', 'auf']);

/** The OSM course area at an OpenGolfAPI entry's point: the one with a word of its name, else the one the point lies
 *  in – never a neighbour by guess. From the OSM API, which also brings the map (Overpass and Photon can be down). */
export async function osmCourseAt(s: CourseSummary): Promise<CourseSummary | null> {
  const box = [s.lon - 0.006, s.lat - 0.004, s.lon + 0.006, s.lat + 0.004].map((n) => n.toFixed(5)).join(',');
  const res = await fetch(`${OSM_API}?bbox=${box}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  return pickCourseArea(parseOsmXml(await res.text()), s);
}

export function pickCourseArea(osm: ReturnType<typeof parseOsmXml>, s: CourseSummary): CourseSummary | null {
  const coords = (ids: string[]) => ids.map((id) => osm.nodes.get(id)).filter((p): p is LngLat => p != null);
  const byId = new Map(osm.ways.map((w) => [w.id, w]));
  const areas: { id: string; name: string; rings: LngLat[][] }[] = [
    ...osm.ways.filter((w) => w.tags.leisure === 'golf_course').map((w) => ({ id: `osm:way/${w.id}`, name: w.tags.name ?? '', rings: [coords(w.nodes)] })),
    ...osm.relations
      .filter((r) => r.tags.leisure === 'golf_course' && r.id)
      .map((r) => ({
        id: `osm:relation/${r.id}`,
        name: r.tags.name ?? '',
        rings: joinRings(r.members.filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === '')).map((m) => byId.get(m.ref)?.nodes ?? [])).map(coords),
      })),
  ].filter((a) => a.rings.some((r) => r.length >= 4));
  const words = fold(s.name)
    .split(/[\s,()/-]+/)
    .filter((w) => w.length >= 4 && !GENERIC.has(w));
  const named = areas.filter((a) => words.some((w) => fold(a.name).includes(w)));
  const p: LngLat = [s.lon, s.lat];
  const inside = areas.filter((a) => a.rings.some((r) => r.length >= 4 && pointInRing(p, r)));
  const pick = named.length === 1 ? named[0] : named.find((a) => inside.includes(a)) ?? (named.length === 0 && inside.length === 1 ? inside[0] : null);
  if (!pick) return null;
  const all = pick.rings.flat();
  const lons = all.map((q) => q[0]);
  const lats = all.map((q) => q[1]);
  return {
    id: pick.id,
    source: 'osm',
    name: s.name,
    place: s.place,
    lat: s.lat,
    lon: s.lon,
    bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
  };
}

/** The course's map copy is gone (it made room when the storage was full): fetch it again – for a round looked at
 *  later, not only when the course is picked. True when a map came. */
export async function ensureCourseMap(courseId: string): Promise<boolean> {
  if (!courseId.startsWith('osm:') || SEED_COURSES[courseId] || hasGeometry(courseId)) return false;
  const course = loadCachedCourse(courseId);
  if (!course) return false;
  await refetchGeometry({ id: courseId, source: 'osm', name: course.name, place: '', lat: course.lat, lon: course.lon, bbox: course.bbox }, course);
  return hasGeometry(courseId);
}

// once per course and session: a course without a map in OSM is not asked again on every opening
const refetched = new Set<string>();
async function refetchGeometry(summary: CourseSummary, course: Course): Promise<void> {
  if (refetched.has(summary.id)) return;
  refetched.add(summary.id);
  // without the area (courses saved before 22.10.2026): about 1.5 km around the course's point
  const bbox = summary.bbox ?? ([course.lon - 0.01, course.lat - 0.007, course.lon + 0.01, course.lat + 0.007] as [number, number, number, number]);
  try {
    const pad = 0.002;
    const box = [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad].map((n) => n.toFixed(5)).join(',');
    const res = await fetch(`${OSM_API}?bbox=${box}`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return;
    saveGeometry(summary.id, geometryFromOsm(ownHoles(parseOsmXml(await res.text()), summary.id)));
  } catch {
    // offline or busy: the course plays as before (the map can be set up on the aerial photo)
  }
}

async function osmHoles(summary: CourseSummary, onGeometry: (g: CourseGeometry) => void): Promise<CourseHole[]> {
  if (summary.bbox) {
    try {
      const pad = 0.002; // ~150 m, so holes at the edge of the course area are included
      const b = summary.bbox;
      const box = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad].map((n) => n.toFixed(5)).join(',');
      const res = await fetch(`${OSM_API}?bbox=${box}`, { signal: AbortSignal.timeout(45000) });
      if (!res.ok) throw new Error(`OSM API ${res.status}`);
      const osm = ownHoles(parseOsmXml(await res.text()), summary.id);
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
  id?: string;
  tags: Record<string, string>;
  members: { type: string; ref: string; role: string }[];
}

/** Minimal OSM-XML reader (nodes, ways, relations). Works in browser and tests – no DOMParser needed. */
export function parseOsmXml(xml: string): { nodes: Map<string, LngLat>; ways: OsmWay[]; relations: OsmRelation[]; trees?: LngLat[] } {
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
  // single trees (natural=tree) for the drawn hole
  const trees: LngLat[] = [];
  for (const n of xml.matchAll(/<node\b([^>]*?)>([\s\S]*?)<\/node>/g)) {
    if (/<tag k="natural" v="tree"\s*\/>/.test(n[2])) trees.push([Number(attr(n[1], 'lon')), Number(attr(n[1], 'lat'))]);
  }
  const ways: OsmWay[] = [];
  for (const w of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    ways.push({ id: attr(w[1], 'id'), tags: tagsOf(w[2]), nodes: [...w[2].matchAll(/<nd ref="([^"]+)"/g)].map((m) => m[1]) });
  }
  const relations: OsmRelation[] = [];
  for (const r of xml.matchAll(/<relation\b([^>]*)>([\s\S]*?)<\/relation>/g)) {
    relations.push({
      id: attr(r[1], 'id'),
      tags: tagsOf(r[2]),
      members: [...r[2].matchAll(/<member\b([^>]*)\/>/g)].map((m) => ({ type: attr(m[1], 'type'), ref: attr(m[1], 'ref'), role: attr(m[1], 'role') })),
    });
  }
  return { nodes, ways, relations, trees };
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
/**
 * Only the course's own holes when another course borders it (Legends and Kings Ridge, Clermont FL): holes whose line
 * lies mostly inside the course's OSM outline. Without an outline, or when that would keep fewer than half the holes
 * (an outline drawn too small), everything stays as it was.
 */
export function ownHoles(osm: ReturnType<typeof parseOsmXml>, courseId: string): ReturnType<typeof parseOsmXml> {
  const m = /^osm:(way|relation)\/(\d+)$/.exec(courseId);
  if (!m) return osm;
  const coords = (ids: string[]) => ids.map((id) => osm.nodes.get(id)).filter((p): p is LngLat => p != null);
  const byId = new Map(osm.ways.map((w) => [w.id, w]));
  let rings: LngLat[][] = [];
  if (m[1] === 'way') {
    const w = byId.get(m[2]);
    if (w) rings = [coords(w.nodes)];
  } else {
    const r = osm.relations.find((x) => x.id === m[2]);
    if (r) rings = joinRings(r.members.filter((x) => x.type === 'way' && (x.role === 'outer' || x.role === '')).map((x) => byId.get(x.ref)?.nodes ?? [])).map(coords);
  }
  rings = rings.filter((r) => r.length >= 4);
  if (!rings.length) return osm;
  const holes = osm.ways.filter((w) => w.tags.golf === 'hole');
  const inside = (w: (typeof holes)[number]) => {
    const line = coords(w.nodes);
    return line.filter((p) => rings.some((r) => pointInRing(p, r))).length * 2 >= line.length;
  };
  const keep = holes.filter(inside);
  if (keep.length === holes.length || keep.length * 2 < holes.length) return osm;
  const drop = new Set(holes.filter((w) => !keep.includes(w)).map((w) => w.id));
  return { ...osm, ways: osm.ways.filter((w) => !drop.has(w.id)) };
}

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
  if (geo.boundary) geo.boundary = dropNestedRings(geo.boundary);
  Object.assign(geo, planDetails(osm, geo));
  return geo;
}

/**
 * Details for the drawn hole (2D): single trees, tree rows and hedges, paths (cart paths, footways, tracks) and
 * rough – only what lies on the course (inside its outline, or near a hole without an outline).
 */
export function planDetails(osm: ReturnType<typeof parseOsmXml>, geo: CourseGeometry): Pick<CourseGeometry, 'treePoints' | 'treeRows' | 'paths' | 'rough'> {
  const coords = (ids: string[]) => ids.map((id) => osm.nodes.get(id)).filter((p): p is LngLat => p != null);
  const onCourse = (p: LngLat) =>
    geo.boundary?.length ? geo.boundary.some((b) => pointInRing(p, b)) : geo.holes.some((h) => h.line.length >= 2 && distToLine(p, h.line) <= 80);
  const treeRows: LngLat[][] = [];
  const paths: LngLat[][] = [];
  const rough: Ring[] = [];
  const PATHS = new Set(['path', 'footway', 'track', 'service', 'cycleway', 'bridleway']);
  for (const w of osm.ways) {
    const line = coords(w.nodes);
    if (line.length < 2 || !line.some(onCourse)) continue;
    if (w.tags.natural === 'tree_row' || w.tags.barrier === 'hedge') treeRows.push(line);
    else if ((w.tags.highway && PATHS.has(w.tags.highway)) || w.tags.golf === 'cartpath' || w.tags.golf === 'path') paths.push(line);
    else if (w.tags.golf === 'rough' && line.length >= 4 && w.nodes[0] === w.nodes[w.nodes.length - 1]) rough.push(line);
  }
  return { treePoints: (osm.trees ?? []).filter(onCourse), treeRows, paths, rough };
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

export function holesFromTags(list: Record<string, string>[]): CourseHole[] {
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
