import type { LngLat } from '../types';
import { distanceM } from './geo';

// Steadier position for the distances (Sascha, 13.10.2026: "the most accuracy from GPS"). A phone gives a fix about
// every second, each off by a few metres in a random direction. While the player stands at the ball, the fixes of
// the last seconds are averaged (weighted by their accuracy) – the distance stops jumping and gets closer to the
// truth. As soon as the player walks on, the filter follows the newest fix again. A fix that is much worse than the
// last good one (e.g. under trees) is ignored for a while instead of throwing the position around.

export interface Fix {
  pos: LngLat;
  accuracy: number; // metres (68 %)
  t: number; // ms
}

export interface Filtered extends Fix {
  still: boolean; // standing (averaged over several fixes)
  n: number; // fixes in the average
}

export const FILTER = {
  windowMs: 20000, // average over the last 20 s while standing
  moveM: 3, // drift of the newest fixes away from the average (at least) that means walking on
  badAccuracyM: 35, // a fix worse than this …
  keepGoodMs: 12000, // … is ignored while the last good one is younger than this
  minAccuracyM: 1.5, // the average is never shown as better than this
};

export class PositionFilter {
  private window: Fix[] = [];
  private last: Filtered | null = null;

  push(f: Fix): Filtered {
    if (this.last && f.accuracy > FILTER.badAccuracyM && this.last.accuracy <= FILTER.badAccuracyM && f.t - this.last.t < FILTER.keepGoodMs) return this.last;
    const mean = this.window.length ? weightedMean(this.window) : null;
    // Walking on: the new fix is far off the average – or the last three fixes together drift away from it
    // (one noisy fix may be 5–8 m off, three in a row in the same direction are a step).
    const recent = [...this.window.slice(-2), f];
    const moved =
      mean == null ||
      distanceM(mean, f.pos) > Math.max(FILTER.moveM, 1.5 * Math.min(f.accuracy, 10)) ||
      (this.window.length >= 4 && distanceM(weightedMean(recent), weightedMean(this.window.slice(0, -2))) > Math.max(FILTER.moveM, 0.6 * Math.min(f.accuracy, 10)));
    if (moved) this.window = [f];
    else this.window = [...this.window.filter((x) => f.t - x.t <= FILTER.windowMs), f];
    const pos = this.window.length > 1 ? weightedMean(this.window) : f.pos;
    const inv = this.window.reduce((s, x) => s + 1 / Math.max(1, x.accuracy) ** 2, 0);
    // Independent errors shrink with √n; real GPS errors are partly the same from fix to fix – so only halfway.
    const accuracy = this.window.length > 1 ? Math.max(FILTER.minAccuracyM, (Math.sqrt(1 / inv) + Math.min(...this.window.map((x) => x.accuracy))) / 2) : f.accuracy;
    this.last = { pos, accuracy: Math.round(accuracy * 10) / 10, t: f.t, still: this.window.length > 1, n: this.window.length };
    return this.last;
  }
}

function weightedMean(fixes: Fix[]): LngLat {
  let w = 0;
  let x = 0;
  let y = 0;
  for (const f of fixes) {
    const k = 1 / Math.max(1, f.accuracy) ** 2;
    w += k;
    x += f.pos[0] * k;
    y += f.pos[1] * k;
  }
  return [x / w, y / w];
}
