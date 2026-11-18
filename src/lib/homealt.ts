import { heights } from './elevation';
import { loadCaddieSettings } from './storage';
import { loadProfile } from './profile';
import { nearbyCourses, searchBundled } from './courses';

// The height above the sea the player's distances come from (Sascha 16.11.2026: "Hat die Höhe des Golfplatzes Einfluss
// auf die Länge des Ballflugs? – Ja, einbauen"): set by hand in the caddie's settings, or "Automatisch" – his home course
// (Profile → Heimatclub) found among the courses the app knows, its height from the elevation service, kept on the phone.

const KEY = 'golfos.homealt.v1';
type Kept = { club: string; alt: number | null; course?: string };

const kept = (): Kept | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
};

/** The home course behind "Automatisch": its name, and its height once known (null: not known, not found). */
export function homeCourseOf(club: string): { name: string; lat: number; lon: number } | null {
  if (!club.trim()) return null;
  const c = searchBundled(club)[0];
  return c && c.lat != null && c.lon != null ? { name: c.name, lat: c.lat, lon: c.lon } : null;
}

/** What "Automatisch" stands for now, without asking the net: the home course's name and height when known. */
export function autoHomeAlt(): { course: string | null; alt: number | null } {
  const club = loadProfile().homeClub ?? '';
  const k = kept();
  if (k && k.club === club) return { course: k.course ?? null, alt: k.alt };
  return { course: homeCourseOf(club)?.name ?? null, alt: null };
}

/** Where the phone is now (Sascha 18.11.2026: "auf Basis von GPS den Standort, wo man sich gerade befindet mit der
 *  Höhenangabe – und zusätzlich den Heimatclub, sodass man den Vergleich hat"): one GPS fix, its height, and the course
 *  there when the phone is on one (within 1.5 km). null: no GPS (not allowed, no fix in 10 s). */
export async function hereAltitude(): Promise<{ name: string | null; alt: number | null } | null> {
  const pos = await new Promise<GeolocationPosition | null>((done) => {
    if (!('geolocation' in navigator)) return done(null);
    navigator.geolocation.getCurrentPosition(done, () => done(null), { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60000 });
  });
  if (!pos) return null;
  const { latitude: lat, longitude: lon } = pos.coords;
  const [[alt], near] = await Promise.all([heights([[lon, lat]]), nearbyCourses(lat, lon, 1.5).catch(() => [])]);
  return { name: near[0]?.name ?? null, alt: alt == null ? null : Math.round(alt) };
}

/** How much farther (+) or shorter (−) the ball flies at "here" than at "home", in per cent – the caddie's rule: 2 % per
 *  1000 ft (lib/caddie FACTORS.altPerM). */
export const altEffect = (here: number, home: number): number => ((here - home) * 0.02 * 100) / 304.8;

/** The height of the player's distances in metres – null: not known (no home course found, offline the first time). */
export async function homeAltitude(): Promise<number | null> {
  const s = loadCaddieSettings().homeAlt ?? 'auto';
  if (typeof s === 'number') return s;
  const club = loadProfile().homeClub ?? '';
  const k = kept();
  if (k && k.club === club && k.alt != null) return k.alt;
  const course = homeCourseOf(club);
  if (!course) return null;
  const [alt] = await heights([[course.lon, course.lat]]);
  if (alt == null) return null;
  const rounded = Math.round(alt);
  try {
    localStorage.setItem(KEY, JSON.stringify({ club, alt: rounded, course: course.name } satisfies Kept));
  } catch {
    /* asked again next time */
  }
  return rounded;
}
