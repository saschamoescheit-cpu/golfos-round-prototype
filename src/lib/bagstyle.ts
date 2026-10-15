import type { Club } from '../types';

// How the player's bag is written (Sascha 15.10.2026): the putter belongs in the bag (no carry), and the wedges by
// name (PW, GW, SW, LW) or by loft (46°, 50°, 56°, 60°) – the player chooses.

const KEY = 'golfos.bagstyle.v1';
export const WEDGE_CLUBS: Club[] = ['PW', 'GW', 'SW', 'LW'];
export const DEFAULT_LOFTS: Partial<Record<Club, number>> = { PW: 46, GW: 50, SW: 56, LW: 60 };

export interface BagStyle {
  putter: boolean;
  wedgeLoft: boolean; // true: "56°" instead of "SW"
  lofts: Partial<Record<Club, number>>;
}

let cache: BagStyle | null = null;
export function loadBagStyle(): BagStyle {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<BagStyle> | null;
    cache = { putter: true, wedgeLoft: false, ...raw, lofts: { ...DEFAULT_LOFTS, ...raw?.lofts } };
  } catch {
    cache = { putter: true, wedgeLoft: false, lofts: { ...DEFAULT_LOFTS } };
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

/** The wedge's loft when the player names wedges by loft ("56°"), else null. */
export function wedgeLoft(c: Club): number | null {
  if (!WEDGE_CLUBS.includes(c)) return null;
  const s = typeof localStorage === 'undefined' ? null : loadBagStyle();
  return s?.wedgeLoft ? (s.lofts[c] ?? DEFAULT_LOFTS[c] ?? null) : null;
}
