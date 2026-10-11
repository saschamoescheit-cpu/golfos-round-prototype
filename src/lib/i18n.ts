import type { Club } from '../types';

// Language (feature 021): German or English, every text sits next to its translation at the call site –
// tr('New round', 'Neue Runde'). Default is the phone's language; the player can switch on the home screen.
// Golf terms as German club golfers say them (Abschlag, Aus, Carry, Spielvorgabe, Eisen 7).

export type Lang = 'de' | 'en';
const KEY = 'golfos.lang.v1';

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'de' || saved === 'en') return saved;
  } catch {
    // storage blocked
  }
  // Outside the browser (unit tests, the caddie audit) the texts stay English.
  if (typeof window === 'undefined') return 'en';
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  return /^de\b/i.test(nav ?? '') ? 'de' : 'en';
}

let lang: Lang = initial();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export const getLang = (): Lang => lang;

/** Switches the language and reloads the app (every screen reads its texts on render). */
export function setLang(l: Lang): void {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    // storage blocked – the choice lives for this session
  }
  if (typeof location !== 'undefined') location.reload();
}

/** The text in the player's language. */
export function tr(en: string, de: string): string {
  return lang === 'de' ? de : en;
}

/** For tests: the language without reload. */
export function useLangForTests(l: Lang): void {
  lang = l;
}

const CLUB_DE: Record<Club, string> = {
  Dr: 'Dr', '3W': 'H3', '5W': 'H5', Hy: 'Hy', '4i': 'E4', '5i': 'E5', '6i': 'E6', '7i': 'E7', '8i': 'E8', '9i': 'E9', PW: 'PW', GW: 'GW', SW: 'SW', LW: 'LW',
};
/** Short club label: "7i" in English, "E7" in German. */
export const clubCode = (c: Club): string => (lang === 'de' ? CLUB_DE[c] : c);

/** Speech language for read-aloud and voice questions. */
export const speechLang = (): string => (lang === 'de' ? 'de-DE' : 'en-US');

const SIDE_DE: Record<string, string> = { left: 'links', right: 'rechts', long: 'hinten', short: 'kurz' };
/** left / right / long / short in the player's language ("links", "rechts", "hinten", "kurz"). */
export const sideWord = (s: string): string => tr(s, SIDE_DE[s] ?? s);

const HAZARD_DE: Record<string, string> = { water: 'Wasser', bunker: 'Bunker', rough: 'Rough', trees: 'Bäume' };
/** Hazard name in the player's language. */
export const hazardWord = (h: string): string => tr(h, HAZARD_DE[h] ?? h);

/** Decimal number as text: "34.8" in English, "34,8" in German. */
export const dec = (v: number | string): string => (lang === 'de' ? String(v).replace('.', ',') : String(v));
