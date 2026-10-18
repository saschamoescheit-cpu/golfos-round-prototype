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

// Short club labels as golfers write them, in both languages (Sascha 14.10.2026): D, 3W, 5W, 4H, 5i … 9i, PW, GW,
// SW, LW (P = putter). The bag has one hybrid: 4H.
const CLUB_CODE: Record<Club, string> = {
  Dr: 'D', '3W': '3W', '4W': '4W', '5W': '5W', '7W': '7W', '9W': '9W', '2H': '2H', '3H': '3H', Hy: '4H', '5H': '5H', '6H': '6H',
  '2i': '2i', '3i': '3i', '4i': '4i', '5i': '5i', '6i': '6i', '7i': '7i', '8i': '8i', '9i': '9i', PW: 'PW', GW: 'GW', SW: 'SW', LW: 'LW', Pt: 'P',
};
/** Short club label: "7i", "D", "4H". */
export const clubCode = (c: Club): string => CLUB_CODE[c];

/** Speech language for read-aloud and voice questions. */
export const speechLang = (): string => (lang === 'de' ? 'de-DE' : 'en-US');

const SIDE_DE: Record<string, string> = { left: 'links', right: 'rechts', long: 'hinten', short: 'kurz' };
/** left / right / long / short in the player's language ("links", "rechts", "hinten", "kurz"). */
export const sideWord = (s: string): string => tr(s, SIDE_DE[s] ?? s);

const HAZARD_DE: Record<string, string> = { water: 'Wasser', bunker: 'Bunker', rough: 'Rough', trees: 'Bäume', woods: 'Wald – Ball weg', drop: 'Abhang', ob: 'Aus' };
/** Hazard name in the player's language. */
export const hazardWord = (h: string): string => tr(({ woods: 'woods – ball lost', drop: 'steep drop', ob: 'out of bounds' } as Record<string, string>)[h] ?? h, HAZARD_DE[h] ?? h);

/** Decimal number as text: "34.8" in English, "34,8" in German. */
export const dec = (v: number | string): string => (lang === 'de' ? String(v).replace('.', ',') : String(v));
