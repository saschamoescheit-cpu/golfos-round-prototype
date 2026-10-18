import type { Club } from '../types';

// Every club a player may carry (Sascha 14.10.2026: "I play no 4-hybrid, but a 2-iron"), longest first. The player
// puts his own bag together from it under "My bag"; the standard bag is used until he did.
// carry = typical carry of a mid-handicap male amateur (m), total = with roll (m).

export type ClubGroup = 'wood' | 'hybrid' | 'iron' | 'wedge';

export const CLUB_CATALOG: { club: Club; group: ClubGroup; carry: number; total: number; standard: boolean }[] = [
  { club: 'Dr', group: 'wood', carry: 200, total: 210, standard: true },
  { club: '3W', group: 'wood', carry: 185, total: 190, standard: true },
  { club: '4W', group: 'wood', carry: 178, total: 183, standard: false },
  { club: '5W', group: 'wood', carry: 172, total: 175, standard: true },
  { club: '7W', group: 'wood', carry: 163, total: 167, standard: false },
  { club: '9W', group: 'wood', carry: 155, total: 158, standard: false },
  { club: '2H', group: 'hybrid', carry: 178, total: 183, standard: false },
  { club: '3H', group: 'hybrid', carry: 172, total: 176, standard: false },
  { club: 'Hy', group: 'hybrid', carry: 165, total: 165, standard: true }, // the 4-hybrid ("4H")
  { club: '5H', group: 'hybrid', carry: 157, total: 160, standard: false },
  { club: '6H', group: 'hybrid', carry: 150, total: 153, standard: false },
  { club: '2i', group: 'iron', carry: 175, total: 180, standard: false },
  { club: '3i', group: 'iron', carry: 168, total: 172, standard: false },
  { club: '4i', group: 'iron', carry: 160, total: 160, standard: false }, // the 4-hybrid plays it – 13 clubs + putter = 14
  { club: '5i', group: 'iron', carry: 150, total: 150, standard: true },
  { club: '6i', group: 'iron', carry: 140, total: 140, standard: true },
  { club: '7i', group: 'iron', carry: 130, total: 130, standard: true },
  { club: '8i', group: 'iron', carry: 120, total: 120, standard: true },
  { club: '9i', group: 'iron', carry: 110, total: 110, standard: true },
  { club: 'PW', group: 'wedge', carry: 100, total: 100, standard: true },
  { club: 'GW', group: 'wedge', carry: 85, total: 85, standard: true },
  { club: 'SW', group: 'wedge', carry: 70, total: 70, standard: true },
  { club: 'LW', group: 'wedge', carry: 55, total: 55, standard: true },
];

/** All clubs, longest first. */
export const CLUB_ORDER: Club[] = CLUB_CATALOG.map((c) => c.club);
/** The standard bag (13 clubs + putter) until the player set up his own. */
export const STANDARD_CLUBS: Club[] = CLUB_CATALOG.filter((c) => c.standard).map((c) => c.club);
/** The rules allow at most 14 clubs in the bag. */
export const MAX_CLUBS = 14;
export const catalogEntry = (c: Club) => CLUB_CATALOG.find((x) => x.club === c)!;
/** Clubs in playing order (longest first). */
export const byOrder = <T extends { club: Club }>(xs: T[]): T[] => xs.slice().sort((a, b) => CLUB_ORDER.indexOf(a.club) - CLUB_ORDER.indexOf(b.club));

/** Carry → total: what a club rolls on after landing (Sascha's rounds 16./18.10.2026: a driver runs out, a wedge stops).
 *  The bag holds carries; a shot measured on the course is the whole length. */
export function rollFactor(club: Club): number {
  if (club === 'Dr') return 1.12;
  const g = CLUB_CATALOG.find((c) => c.club === club)?.group;
  if (g === 'wood') return 1.08;
  if (g === 'hybrid') return 1.06;
  if (club === '2i' || club === '3i' || club === '4i' || club === '5i') return 1.05;
  if (club === '6i' || club === '7i') return 1.04;
  if (club === '8i' || club === '9i') return 1.03;
  if (club === 'PW' || club === 'GW') return 1.02;
  return 1.01;
}
