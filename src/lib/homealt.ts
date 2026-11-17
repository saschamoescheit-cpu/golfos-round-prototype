import { heights } from './elevation';
import { loadCaddieSettings } from './storage';
import { loadProfile } from './profile';
import { searchBundled } from './courses';

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
