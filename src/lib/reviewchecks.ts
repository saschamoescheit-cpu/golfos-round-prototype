import type { DetailEntry, LngLat, Ring, Shot } from '../types';
import { distanceM, distToLine, pointInRing, type HoleMapData } from './geo';
import { tr } from './i18n';

// What "Schläge prüfen" notices by itself (Sascha 22.10.2026, round check): a ball that ended in the water or out of
// bounds without a penalty, a penalty where the map shows neither, two shots from the same spot. Each is a question
// with the fix one tap away – never changed without the player.

export type CheckKind = 'water' | 'ob' | 'dry' | 'inside' | 'same';
export interface ShotCheck {
  shot: number; // index of the shot the question is about
  kind: CheckKind;
  text: string;
}

const SAME_M = 5; // two shots this close: the same spot
const EDGE_M = 6; // a drop lies this close to the water's edge

const inAny = (p: LngLat, rings: Ring[]) => rings.some((r) => pointInRing(p, r));
const nearAny = (p: LngLat, rings: Ring[], m: number) => rings.some((r) => pointInRing(p, r) || distToLine(p, r) <= m);
/** The straight line a → b runs over water (sampled every ~5 m). */
function overWater(a: LngLat, b: LngLat, water: Ring[]): boolean {
  const n = Math.max(2, Math.ceil(distanceM(a, b) / 5));
  for (let k = 1; k < n; k++) {
    const p: LngLat = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
    if (inAny(p, water)) return true;
  }
  return false;
}

/** Where shot n ended: the next shot's spot, else where the ball lay on the green. */
export const endOf = (d: DetailEntry, n: number): LngLat | null => (n + 1 < d.shots.length ? d.shots[n + 1].pos : d.onGreen);

/** The questions for one hole. `boundary`: the course outline (out of bounds outside), when known. */
export function shotChecks(d: DetailEntry | null | undefined, data: HoleMapData | null, boundary?: Ring[]): ShotCheck[] {
  if (!d || !data) return [];
  const out: ShotCheck[] = [];
  const water = data.water ?? [];
  const isOut = (p: LngLat) => !!boundary?.length && !inAny(p, boundary);
  d.shots.forEach((s: Shot, n) => {
    const from = s.pos;
    const end = endOf(d, n);
    const label = n + 1;
    if (!s.penalty) {
      if (!from || !end) return;
      // the next shot from the same spot: a second ball (provisional / again from the tee) – or one point twice
      if (n + 1 < d.shots.length && distanceM(from, end) <= SAME_M) {
        out.push({
          shot: n,
          kind: 'same',
          text: tr(
            `Shot ${label + 1} from the same spot as shot ${label} – was shot ${label} lost, out of bounds or in the water? Or is it one shot twice?`,
            `Schlag ${label + 1} vom selben Ort wie Schlag ${label} – war Schlag ${label} verloren, im Aus oder im Wasser? Oder ist es ein Schlag doppelt?`,
          ),
        });
        return;
      }
      if (water.length && inAny(end, water)) {
        out.push({ shot: n, kind: 'water', text: tr(`Shot ${label} ends in the water – a penalty stroke?`, `Schlag ${label} endet im Wasser – Strafschlag?`) });
        return;
      }
      if (isOut(end)) {
        out.push({ shot: n, kind: 'ob', text: tr(`Shot ${label} ends out of bounds – a penalty stroke?`, `Schlag ${label} endet im Aus – Strafschlag?`) });
        return;
      }
      // a ball dropped at the water's edge after flying over the water: most likely it went in
      if (water.length && nearAny(end, water, EDGE_M) && overWater(from, end, water) && !inAny(from, water)) {
        out.push({ shot: n, kind: 'water', text: tr(`Shot ${label} went over the water and the next one is played from its edge – was it in the water?`, `Schlag ${label} ging übers Wasser und der nächste wird an dessen Rand gespielt – war er im Wasser?`) });
      }
      return;
    }
    // a penalty where the map shows neither water nor out of bounds (only where the map knows them)
    const miss = s.missPos;
    if (!miss) return;
    if (s.penaltyKind === 'water' && water.length && !nearAny(miss, water, 10))
      out.push({ shot: n, kind: 'dry', text: tr(`Penalty for water after shot ${label} – the map shows no water there. Check it?`, `Strafschlag Wasser nach Schlag ${label} – dort zeigt die Karte kein Wasser. Prüfen?`) });
    else if (s.penaltyKind === 'ob' && boundary?.length && !isOut(miss))
      out.push({ shot: n, kind: 'inside', text: tr(`Out of bounds after shot ${label} – the spot lies inside the course. Check it?`, `Aus nach Schlag ${label} – die Stelle liegt laut Karte im Platz. Prüfen?`) });
  });
  return out;
}
