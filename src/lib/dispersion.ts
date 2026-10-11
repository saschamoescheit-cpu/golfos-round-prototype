import type { Club, LngLat, Round } from '../types';
import { distanceM } from './geo';

// Personal dispersion per club (feature 010, idea from Upgame): where the player's shots land compared with
// the line to the pin. Only approach shots and tee shots on par 3s count – there the pin is the target.
// sideMean > 0 = the club goes right on average; the caddie aims the other way.

export interface ClubDispersion {
  club: Club;
  shots: number;
  sideMean: number; // metres, + right / − left of the line to the pin
  sideSd: number; // spread left/right (standard deviation)
  lengthMean: number; // metres, + long / − short of the pin (only shots that were meant to reach the green)
}

/** Signed distance of `p` from the line a→b: + right, − left (seen from a towards b). */
export function sideOf(a: LngLat, b: LngLat, p: LngLat): number {
  const k = Math.cos((a[1] * Math.PI) / 180);
  const bx = (b[0] - a[0]) * k;
  const by = b[1] - a[1];
  const px = (p[0] - a[0]) * k;
  const py = p[1] - a[1];
  const len = Math.hypot(bx, by) || 1;
  return ((bx * py - by * px) / len) * -111320; // cross product → metres; right of the line is positive
}

/** Along-line distance of `p` past `b` (+ long, − short). */
function pastPin(a: LngLat, b: LngLat, p: LngLat): number {
  return distanceM(a, p) * Math.cos(angle(a, b, p)) - distanceM(a, b);
}
function angle(a: LngLat, b: LngLat, p: LngLat): number {
  const k = Math.cos((a[1] * Math.PI) / 180);
  const t1 = Math.atan2(b[1] - a[1], (b[0] - a[0]) * k);
  const t2 = Math.atan2(p[1] - a[1], (p[0] - a[0]) * k);
  return t2 - t1;
}

export function clubDispersion(rounds: Round[]): ClubDispersion[] {
  const by = new Map<Club, { side: number[]; long: number[] }>();
  for (const r of rounds) {
    const me = r.players.find((p) => p.isMe);
    if (!me) continue;
    r.holes.forEach((h, i) => {
      const d = r.entries[me.id][i].detail;
      if (!d?.pin) return;
      d.shots.forEach((s, k) => {
        const end = k + 1 < d.shots.length ? d.shots[k + 1].pos : d.onGreen;
        if (!s.club || !s.pos || !end || s.penalty) return;
        if (k === 0 && h.par >= 4) return; // tee shot on par 4/5: the target is the fairway, not the pin
        const toPin = distanceM(s.pos, d.pin!);
        if (toPin < 40) return; // chips and pitches: not about the club's dispersion
        const e = by.get(s.club) ?? { side: [], long: [] };
        e.side.push(sideOf(s.pos, d.pin!, end));
        e.long.push(pastPin(s.pos, d.pin!, end));
        by.set(s.club, e);
      });
    });
  }
  return [...by.entries()].map(([club, e]) => {
    const mean = e.side.reduce((a, b) => a + b, 0) / e.side.length;
    const sd = Math.sqrt(e.side.reduce((a, b) => a + (b - mean) ** 2, 0) / e.side.length);
    return { club, shots: e.side.length, sideMean: Math.round(mean), sideSd: Math.round(sd), lengthMean: Math.round(e.long.reduce((a, b) => a + b, 0) / e.long.length) };
  });
}
