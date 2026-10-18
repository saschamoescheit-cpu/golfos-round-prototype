import type { Club, DetailEntry, FairwayResult, HoleEntry, Lie, LngLat, Ring, ShotKind } from '../types';
export type { Club, DetailEntry, Lie, Shot, ShotKind } from '../types';
import { distanceM, distToLine, pointInRing, type HoleMapData } from './geo';
import { tr } from './i18n';
import { CLUB_CATALOG } from './clubs';

// Detailed tracking (feature 003): shot by shot with club and lie. The quick values of the hole
// (strokes, fairway, penalties, greenside bunker, up & down) are derived from the shots, so scorecard
// and statistics work the same for both tracking modes.

export const LIES: { value: Lie; label: string }[] = [
  { value: 'tee', label: tr('Tee', 'Abschlag') },
  { value: 'fairway', label: 'Fairway' },
  { value: 'semirough', label: 'Semi Rough' },
  { value: 'rough', label: 'Rough' },
  { value: 'fringe', label: tr('Fringe', 'Vorgrün') },
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
export const BAG: { club: Club; m: number }[] = CLUB_CATALOG.filter((c) => c.standard).map((c) => ({ club: c.club, m: c.total }));

export function emptyDetail(): DetailEntry {
  return { shots: [], onGreen: null, pin: null, holedOut: false };
}

/** How far off the green edge counts as fringe, off the fairway edge as semi rough (metres). */
export const LIE_BAND = { fringeM: 2.5, semiM: 2 };

/** Lie suggested for a shot position from the course map. The player can change it. */
export function lieAt(pos: LngLat, data: HoleMapData, isFirstShot: boolean, fine = false): Lie {
  if (isFirstShot) return 'tee';
  if (data.bunkers.some((r: Ring) => pointInRing(pos, r))) return 'bunker';
  if (data.fairways.some((r: Ring) => pointInRing(pos, r))) return 'fairway';
  // Just off the green: the fringe; just off the fairway: the first cut (Sascha 18.10.2026 – his "rough" balls lay
  // 1–2.5 m beside the fairway). GPS is ±3 m, so only a narrow band; the player confirms it in the check.
  // (only for the shots the player checks – the caddie's cost of a miss keeps fairway / rough / bunker)
  if (fine && data.green && !pointInRing(pos, data.green) && distToLine(pos, data.green) <= LIE_BAND.fringeM) return 'fringe';
  if (fine && data.fairways.some((r: Ring) => distToLine(pos, r) <= LIE_BAND.semiM)) return 'semirough';
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

/** Length of every shot: to the next shot, or to the ball on the green for the last one – into the water / out of bounds: to where it went in. */
export function shotLengths(d: DetailEntry): (number | null)[] {
  return d.shots.map((s, k) => {
    const next = s.penalty && s.missPos ? s.missPos : k + 1 < d.shots.length ? d.shots[k + 1].pos : d.onGreen;
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
/** The shots start at the tee, so they are the whole hole (and give the score). */
export function shotsComplete(d: DetailEntry): boolean {
  return d.shots[0]?.lie === 'tee';
}

export function deriveFromShots(d: DetailEntry, putts: number | null, par: number, data: HoleMapData | null): Partial<HoleEntry> {
  const penalties = d.shots.filter((s) => s.penalty).length;
  const out: Partial<HoleEntry> = { penalties };
  // Holed out, or putts entered – also when the ball was not marked on the green (putts typed in the score view).
  // Only a shot list that starts at the tee gives the score: a single "holed" chip added in the score view is not
  // a hole in one (Sascha, 13.10.2026) – then the strokes typed in stay.
  const finished = shotsComplete(d) && (d.holedOut || (d.shots.length > 0 && putts != null));
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
