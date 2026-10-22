import type { DetailEntry, HoleEntry, LngLat, Round } from '../types';
import { distanceM } from './geo';
import { shotsComplete } from './shots';

// Approaches by distance and putts by result (Sascha 22.10.2026, round check): from which distance the greens are hit
// and how close the ball ends ("proximity to the hole"), and how the missed putts miss – short or long, left or right.
// An intended layup is no approach; only checked holes count.

/** How close a shot that ended on the green came to the pin (m), null when it did not end on the green. */
export function proximity(d: DetailEntry, n: number): number | null {
  if (!d.pin || n !== d.shots.length - 1 || d.holedOut) return d.holedOut && n === d.shots.length - 1 ? 0 : null;
  return d.onGreen ? distanceM(d.onGreen, d.pin) : null;
}

export const BANDS: { from: number; to: number; label: string }[] = [
  { from: 50, to: 100, label: '50–100 m' },
  { from: 100, to: 150, label: '100–150 m' },
  { from: 150, to: 200, label: '150–200 m' },
  { from: 200, to: 300, label: '200+ m' },
];

export interface BandLine {
  label: string;
  shots: number;
  greens: number;
  avgProximity: number | null; // m, of the shots that found the green
}

const own = (r: Round) => {
  const me = r.players.find((p) => p.isMe);
  return me ? r.entries[me.id] ?? [] : [];
};
const checked = (e: HoleEntry | undefined): e is HoleEntry & { detail: DetailEntry } => !!e?.detail && shotsComplete(e.detail) && !e.detail.shots.some((s) => s.review);

export function approachBands(rounds: Round[]): BandLine[] {
  const acc = BANDS.map((b) => ({ ...b, shots: 0, greens: 0, prox: [] as number[] }));
  for (const r of rounds) {
    own(r).forEach((e, i) => {
      if (!checked(e) || !e.detail.pin) return;
      const d = e.detail;
      d.shots.forEach((s, n) => {
        if (!s.pos || s.penalty || s.intent === 'layup' || s.intent === 'recovery') return;
        if (n === 0 && r.holes[i].par >= 4) return; // the tee shot of a par 4/5 aims at the fairway
        const from = distanceM(s.pos, d.pin!);
        const b = acc.find((x) => from >= x.from && from < x.to);
        if (!b) return;
        b.shots++;
        const p = proximity(d, n);
        if (p != null) {
          b.greens++;
          b.prox.push(p);
        }
      });
    });
  }
  return acc.map((b) => ({ label: b.label, shots: b.shots, greens: b.greens, avgProximity: b.prox.length ? Math.round((b.prox.reduce((a, x) => a + x, 0) / b.prox.length) * 10) / 10 : null }));
}

export type PuttLength = 'short' | 'long';
export type PuttLine = 'left' | 'right';
export interface PuttMiss {
  length: PuttLength | null;
  line: PuttLine | null;
}

/** How a putt from `ball` to the pin missed, from where the next putt was played: short of / past the hole, left /
 *  right of the line (more than 30 cm). */
export function puttMiss(ball: LngLat, pin: LngLat, next: LngLat): PuttMiss {
  const k = 111320 * Math.cos((pin[1] * Math.PI) / 180);
  const P = (p: LngLat): [number, number] => [(p[0] - pin[0]) * k, (p[1] - pin[1]) * 111320];
  const [bx, by] = P(ball);
  const [nx, ny] = P(next);
  const len = Math.hypot(bx, by) || 1;
  const ux = -bx / len;
  const uy = -by / len; // from the ball towards the hole
  const past = nx * ux + ny * uy; // + = beyond the hole
  const side = nx * uy - ny * ux; // + = right of the line, seen from the ball
  return { length: past > 0 ? 'long' : 'short', line: Math.abs(side) > 0.3 ? (side > 0 ? 'right' : 'left') : null };
}

export interface PuttMisses {
  missed: number;
  short: number;
  long: number;
  left: number;
  right: number;
}

/** The missed putts of the player's rounds: placed on the green (putt editor) or told after the round (first putt). */
export function puttMisses(rounds: Round[]): PuttMisses {
  const m: PuttMisses = { missed: 0, short: 0, long: 0, left: 0, right: 0 };
  const add = (x: PuttMiss) => {
    m.missed++;
    if (x.length) m[x.length]++;
    if (x.line) m[x.line]++;
  };
  for (const r of rounds)
    for (const e of own(r)) {
      if (e.pickedUp) continue;
      const at = e.puttsAt;
      if (at && at.balls.length >= 2) {
        for (let k = 0; k + 1 < at.balls.length; k++) add(puttMiss(at.balls[k], at.pin, at.balls[k + 1]));
      } else if (e.firstPuttMiss && (e.putts ?? 0) >= 2) add(e.firstPuttMiss);
    }
  return m;
}
