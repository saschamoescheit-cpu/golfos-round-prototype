import type { Club } from '../types';

// How the player's bag is written (Sascha 15.10.2026): the putter belongs in the bag (no carry), and each wedge keeps
// its name with the loft the player entered – "PW (43°)".

const KEY = 'golfos.bagstyle.v1';
export const WEDGE_CLUBS: Club[] = ['PW', 'GW', 'SW', 'LW'];
/** Typical lofts – only a hint in the empty field. */
export const DEFAULT_LOFTS: Partial<Record<Club, number>> = { PW: 46, GW: 50, SW: 56, LW: 60 };

export interface BagStyle {
  putter: boolean;
  lofts: Partial<Record<Club, number>>; // as the player entered them; empty = not shown
}

let cache: BagStyle | null = null;
export function loadBagStyle(): BagStyle {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<BagStyle> | null;
    cache = { putter: raw?.putter ?? true, lofts: { ...raw?.lofts } };
  } catch {
    cache = { putter: true, lofts: {} };
  }
  return cache;
}
export function saveBagStyle(s: BagStyle): void {
  cache = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked – this visit only */
  }
}

/** "PW (43°)" when the player entered the wedge's loft, else the club code as given. */
export function withLoft(code: string, c: Club, s: BagStyle = loadBagStyle()): string {
  const loft = WEDGE_CLUBS.includes(c) ? s.lofts[c] : undefined;
  return loft ? `${code} (${loft}°)` : code;
}
