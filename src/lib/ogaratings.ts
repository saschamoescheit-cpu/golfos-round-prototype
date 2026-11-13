// Course rating and slope from OpenGolfAPI for US courses the app does not bring along (Sascha 13.11.2026: "Baue OpenGolf
// API ein" – "für alle Golfplätze immer Slope und Course Rating; händische Erfassung nervt"). OpenGolfAPI
// (api.opengolfapi.org, ODbL 1.0 – the source is named where a value from it shows) has every US course with its tee sets:
// name, gender, course rating, slope, yards. Fetched once in the background when a US course is loaded and kept on the
// phone (offline on the course); read by ratingFor after the player's own and the bundled values. A bundled course keeps
// its checked values – OpenGolfAPI is sometimes behind (StoneGate Oaks: an old set, the green tee's women's value marked
// "Male").
import type { TeeRating } from '../data/ratings';
import { teeId } from '../data/tees';

const API = 'https://api.opengolfapi.org/api/v1/courses';
const KEY = 'golfos.ogatees.v1.';
const MONTH = 30 * 24 * 3600 * 1000;

export interface OgaTee {
  name: string;
  lady: boolean;
  cr: number;
  slope: number;
  yards: number | null;
}
interface Kept {
  at: number;
  oga: string | null;
  tees: OgaTee[];
}

const read = (courseId: string): Kept | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY + courseId) ?? 'null') as Kept | null;
  } catch {
    return null;
  }
};
const keep = (courseId: string, v: Kept) => {
  try {
    localStorage.setItem(KEY + courseId, JSON.stringify(v));
  } catch {
    /* storage full – asked again next time */
  }
};

/** The tees of an OpenGolfAPI course: only those with a plausible rating (50–85, slope 55–155). */
export function parseTees(json: unknown): OgaTee[] {
  const tees = (json as { tees?: unknown[] } | null)?.tees;
  if (!Array.isArray(tees)) return [];
  return tees
    .map((t) => t as { name?: string; tee_name?: string; gender?: string; course_rating?: number; slope?: number; slope_rating?: number; yardage?: number; total_yards?: number })
    .map((t) => ({
      name: String(t.name ?? t.tee_name ?? '').trim(),
      lady: /^f/i.test(t.gender ?? ''),
      cr: Number(t.course_rating),
      slope: Number(t.slope ?? t.slope_rating),
      yards: Number(t.yardage ?? t.total_yards) || null,
    }))
    .filter((t) => t.name && t.cr >= 50 && t.cr <= 85 && t.slope >= 55 && t.slope <= 155);
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !['golf', 'club', 'course', 'country', 'the', 'and', 'resort'].includes(w));
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.hypot(x, y) * 6371;
};

/** The OpenGolfAPI id of a course: its own (an "oga:" course), else the entry of its name nearest to it (2.5 km). */
export async function ogaIdOf(c: { id: string; name: string; lat: number; lon: number }): Promise<string | null> {
  if (c.id.startsWith('oga:')) return c.id.slice(4);
  const mine = words(c.name);
  if (!mine.length) return null;
  const res = await fetch(`${API}/search?q=${encodeURIComponent(mine.slice(0, 3).join(' '))}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const found = ((await res.json()) as { courses?: { id: string; course_name?: string; name?: string; lat?: number; lng?: number; latitude?: number; longitude?: number }[] }).courses ?? [];
  const near = found
    .map((x) => ({ id: x.id, name: x.course_name ?? x.name ?? '', at: { lat: Number(x.lat ?? x.latitude), lon: Number(x.lng ?? x.longitude) } }))
    .filter((x) => Number.isFinite(x.at.lat) && km(x.at, c) <= 2.5 && words(x.name).some((w) => mine.includes(w)))
    .sort((a, b) => km(a.at, c) - km(b.at, c));
  return near[0]?.id ?? null;
}

/** Fetches and keeps the tees of a US course once a month, quietly – offline, unknown or not in the USA: nothing. */
export async function ensureOgaRatings(c: { id: string; name: string; lat: number; lon: number }, ogaHint?: string | null): Promise<void> {
  if (!(c.lon < -50 && c.lat > 15 && c.lat < 72)) return; // the USA (OpenGolfAPI has no other country)
  const kept = read(c.id);
  if (kept && Date.now() - kept.at < MONTH) return;
  try {
    const oga = ogaHint ?? kept?.oga ?? (await ogaIdOf(c));
    if (!oga) return keep(c.id, { at: Date.now(), oga: null, tees: [] });
    const res = await fetch(`${API}/${oga}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return;
    keep(c.id, { at: Date.now(), oga, tees: parseTees(await res.json()) });
    // the round setup open meanwhile: its rating line shows them
    window.dispatchEvent(new Event('golfos:ratings'));
  } catch {
    /* offline – next time */
  }
}

const plain = (s: string) => s.toLowerCase().split(/[/(,]/)[0].trim();
/** A tee's name as the app knows it: a colour ("blue" → "Blue", "Silver/Green" → "Silver"), else the course's own word
 *  ("Championship"). */
const norm = (s: string) => teeId(plain(s)) ?? plain(s);
/** The tees of a course as OpenGolfAPI has them, longest first – the app's names for colours, the course's for the rest
 *  ("Championship") – none kept: []. */
export function ogaTees(courseId: string): string[] {
  const kept = read(courseId);
  if (!kept?.tees.length) return [];
  const longest = new Map<string, number>();
  for (const t of kept.tees) {
    const id = teeId(plain(t.name)) ?? t.name.split(/[/(,]/)[0].trim();
    longest.set(id, Math.max(longest.get(id) ?? 0, t.yards ?? 0));
  }
  return [...longest.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
/** The kept OpenGolfAPI value of a tee by its name ("Blue", "teal"; "Silver/Green" counts as silver): a woman only from a
 *  tee marked for women, a man never from one – null when there is none. */
export function ogaRating(courseId: string, tee: string, lady = false): (TeeRating & { source: 'opengolfapi' }) | null {
  const kept = read(courseId);
  if (!kept?.tees.length) return null;
  const t = kept.tees.find((x) => x.lady === lady && norm(x.name) === norm(tee));
  return t ? { cr: t.cr, slope: t.slope, source: 'opengolfapi' } : null;
}
