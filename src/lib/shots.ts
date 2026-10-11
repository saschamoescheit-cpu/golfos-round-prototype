import type { Club, DetailEntry, FairwayResult, HoleEntry, Lie, LngLat, Ring, ShotKind } from '../types';
export type { Club, DetailEntry, Lie, Shot, ShotKind } from '../types';
import { distanceM, distToLine, pointInRing, type HoleMapData } from './geo';
import { tr } from './i18n';

// Detailed tracking (feature 003): shot by shot with club and lie. The quick values of the hole
// (strokes, fairway, penalties, greenside bunker, up & down) are derived from the shots, so scorecard
// and statistics work the same for both tracking modes.

export const LIES: { value: Lie; label: string }[] = [
  { value: 'tee', label: tr('Tee', 'Abschlag') },
  { value: 'fairway', label: 'Fairway' },
  { value: 'rough', label: 'Rough' },
  { value: 'bunker', label: 'Bunker' },
  { value: 'recovery', label: tr('Trees', 'Bäume') },
];

/** Lie in the player's language. */
export const lieName = (l: Lie): string => LIES.find((x) => x.value === l)?.label ?? l;

export const KINDS: { value: ShotKind; label: string }[] = [
  { value: 'full', label: tr('Full', 'Voll') },
  { value: 'punch', label: 'Punch' },
  { value: 'pitch', label: 'Pitch' },
  { value: 'chip', label: 'Chip' },
  { value: 'bunker', label: 'Bunker' },
];

/**
 * Shot type suggested from lie and distance to the pin: bunker shot from a greenside bunker, punch from the trees,
 * chip up to 30 m, pitch up to 80 m, otherwise a full swing.
 */
export function suggestKind(lie: Lie, toPinM: number | null): ShotKind {
  if (lie === 'bunker' && toPinM != null && toPinM <= 40) return 'bunker';
  if (lie === 'recovery') return 'punch';
  if (toPinM != null && toPinM <= 30) return 'chip';
  if (toPinM != null && toPinM <= 80) return 'pitch';
  return 'full';
}

/** Standard bag with typical total distances (m) of a mid-handicap male amateur – used until the player has own data. */
export const BAG: { club: Club; m: number }[] = [
  { club: 'Dr', m: 210 }, { club: '3W', m: 190 }, { club: '5W', m: 175 }, { club: 'Hy', m: 165 },
  { club: '4i', m: 160 }, { club: '5i', m: 150 }, { club: '6i', m: 140 }, { club: '7i', m: 130 },
  { club: '8i', m: 120 }, { club: '9i', m: 110 }, { club: 'PW', m: 100 }, { club: 'GW', m: 85 },
  { club: 'SW', m: 70 }, { club: 'LW', m: 55 },
];

export function emptyDetail(): DetailEntry {
  return { shots: [], onGreen: null, pin: null, holedOut: false };
}

/** Lie suggested for a shot position from the course map. The player can change it. */
export function lieAt(pos: LngLat, data: HoleMapData, isFirstShot: boolean): Lie {
  if (isFirstShot) return 'tee';
  if (data.bunkers.some((r: Ring) => pointInRing(pos, r))) return 'bunker';
  if (data.fairways.some((r: Ring) => pointInRing(pos, r))) return 'fairway';
  // Courses without mapped fairways: close to the playing line counts as fairway.
  if (data.fairways.length === 0 && distToLine(pos, data.line) <= 15) return 'fairway';
  return 'rough';
}

export function onGreenAt(pos: LngLat, data: HoleMapData): boolean {
  return data.green != null ? pointInRing(pos, data.green) : distanceM(pos, data.greenCenter) <= 12;
}

/** Club suggestion: driver on the first shot of par 4/5, otherwise the club whose distance fits the remaining distance best. */
export function suggestClub(par: number, isFirstShot: boolean, toPinM: number, bag = BAG): Club {
  if (isFirstShot && par >= 4 && toPinM > 230) return 'Dr';
  const fit = bag.filter((b) => b.club !== 'Dr').map((b) => ({ b, d: Math.abs(b.m - toPinM) }));
  return fit.sort((a, b) => a.d - b.d)[0].b.club;
}

/** Length of every shot: to the next shot, or to the ball on the green for the last one. */
export function shotLengths(d: DetailEntry): (number | null)[] {
  return d.shots.map((s, k) => {
    const next = k + 1 < d.shots.length ? d.shots[k + 1].pos : d.onGreen;
    return s.pos && next ? distanceM(s.pos, next) : null;
  });
}

/** Side of the playing line a point lies on (seen from the tee towards the green). */
function side(p: LngLat, line: LngLat[]): 'left' | 'right' {
  const [a, b] = [line[0], line[Math.min(1, line.length - 1)]];
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  return cross > 0 ? 'left' : 'right';
}

/** Quick values of the hole derived from the shots (only fields that the shots determine). */
export function deriveFromShots(d: DetailEntry, putts: number | null, par: number, data: HoleMapData | null): Partial<HoleEntry> {
  const penalties = d.shots.filter((s) => s.penalty).length;
  const out: Partial<HoleEntry> = { penalties };
  const finished = d.holedOut || (d.onGreen != null && putts != null);
  if (finished) out.strokes = d.shots.length + penalties + (d.holedOut ? 0 : (putts ?? 0));
  if (d.holedOut) out.putts = 0;

  // Fairway on par 4/5: where the tee shot came to rest = lie of the 2nd shot (or on the green).
  if (par >= 4 && d.shots.length >= 1) {
    let fw: FairwayResult | null = null;
    if (d.shots.length >= 2) {
      const second = d.shots[1];
      if (second.lie === 'fairway') fw = 'hit';
      else if (second.pos && data) fw = side(second.pos, data.line);
    } else if (d.onGreen || d.holedOut) fw = 'hit';
    out.fairway = fw;
  }

  // Greenside bunker: a bunker shot within 40 m of the green; up & down = no further full shot and ≤ 1 putt.
  const k = d.shots.findIndex((s) => s.lie === 'bunker' && s.pos != null && data != null && distanceM(s.pos, data.greenCenter) <= 40);
  out.greensideBunker = k >= 0;
  out.upAndDown = k >= 0 && finished ? k === d.shots.length - 1 && (d.holedOut || (putts ?? 9) <= 1) : null;
  return out;
}

/** First putt length (m) from the ball on the green to the pin. */
export function firstPuttM(d: DetailEntry): number | null {
  return d.onGreen && d.pin ? distanceM(d.onGreen, d.pin) : null;
}
